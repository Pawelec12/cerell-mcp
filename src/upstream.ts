import { createHash } from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * How to reach a partner's own MCP server. `{api_key}` in args/env/url/headers is replaced
 * with the developer's linked API key, so every dev talks to the partner as themselves.
 */
export type UpstreamConfig =
  | { transport: 'stdio'; command: string; args: string[]; env: Record<string, string> }
  | { transport: 'http'; url: string; headers: Record<string, string> };

export interface UpstreamTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface UpstreamCallResult {
  isError: boolean;
  text: string;
  structured?: Record<string, unknown>;
}

/** First `npx -y <pkg>` run downloads the package, which can exceed the SDK's 60s default. */
const CONNECT_TIMEOUT_MS = 120_000;
const STDERR_HEAD = 300;
/** Cap concurrent live partner MCP processes (reconnect on next use). */
const MAX_UPSTREAM_CLIENTS = 3;

/** stdio upstreams run on the developer's machine, so only package launchers are allowed. */
export const ALLOWED_STDIO_COMMANDS = ['npx', 'node', 'uvx', 'docker'] as const;

const fill = (s: string, apiKey: string) => s.replaceAll('{api_key}', apiKey);
const fillAll = (o: Record<string, string>, apiKey: string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fill(v, apiKey)]));

/** One live MCP client per (partner, api key); opened lazily, LRU-capped. */
export class UpstreamPool {
  private clients = new Map<string, Promise<Client>>();

  private key(partnerId: string, apiKey: string): string {
    return `${partnerId}:${createHash('sha256').update(apiKey).digest('hex')}`;
  }

  /** Map insertion order = LRU; re-insert on touch. */
  private touch(key: string, value: Promise<Client>): void {
    this.clients.delete(key);
    this.clients.set(key, value);
  }

  private async evictIfNeeded(): Promise<void> {
    while (this.clients.size >= MAX_UPSTREAM_CLIENTS) {
      const oldest = this.clients.keys().next().value as string | undefined;
      if (!oldest) break;
      const pending = this.clients.get(oldest);
      this.clients.delete(oldest);
      if (pending) {
        try {
          (await pending).close();
        } catch {
          // ignore close errors on eviction
        }
      }
    }
  }

  private connect(partnerId: string, config: UpstreamConfig, apiKey: string): Promise<Client> {
    const key = this.key(partnerId, apiKey);
    const existing = this.clients.get(key);
    if (existing) {
      this.touch(key, existing);
      return existing;
    }

    if (config.transport === 'stdio' && !(ALLOWED_STDIO_COMMANDS as readonly string[]).includes(config.command)) {
      return Promise.reject(
        new Error(`stdio command "${config.command}" is not allowed (use one of: ${ALLOWED_STDIO_COMMANDS.join(', ')})`),
      );
    }

    const connecting = this.evictIfNeeded().then(() => {
      const client = new Client({ name: 'cerell-mcp', version: '0.1.0' });
      client.onclose = () => this.clients.delete(key);

      let stderrHead = '';
      const transport =
        config.transport === 'stdio'
          ? new StdioClientTransport({
              command: config.command,
              args: config.args.map((a) => fill(a, apiKey)),
              env: fillAll(config.env, apiKey),
              stderr: 'pipe',
            })
          : new StreamableHTTPClientTransport(new URL(fill(config.url, apiKey)), {
              requestInit: { headers: fillAll(config.headers, apiKey) },
            });
      if (transport instanceof StdioClientTransport) {
        transport.stderr?.on('data', (chunk: Buffer) => {
          if (stderrHead.length < STDERR_HEAD) stderrHead += chunk.toString();
        });
      }

      return client
        .connect(transport, { timeout: CONNECT_TIMEOUT_MS })
        .then(() => client)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          const said = stderrHead.trim().split('\n')[0]?.slice(0, STDERR_HEAD).replaceAll(apiKey, '***');
          throw new Error(said ? `${message} (partner server: ${said})` : message);
        });
    });

    connecting.catch(() => this.clients.delete(key));
    this.clients.set(key, connecting);
    return connecting;
  }

  async listTools(partnerId: string, config: UpstreamConfig, apiKey: string): Promise<UpstreamTool[]> {
    const client = await this.connect(partnerId, config, apiKey);
    const tools: UpstreamTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      for (const t of page.tools) {
        tools.push({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema as Record<string, unknown> });
      }
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(
    partnerId: string,
    config: UpstreamConfig,
    apiKey: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<UpstreamCallResult> {
    const client = await this.connect(partnerId, config, apiKey);
    const result = await client.callTool({ name, arguments: args });
    const content = (result.content ?? []) as { type: string; text?: string }[];
    return {
      isError: result.isError === true,
      text: content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n'),
      structured: result.structuredContent as Record<string, unknown> | undefined,
    };
  }

  /** Drops every dev's connection to one partner (its upstream config changed or was removed). */
  async closePartner(partnerId: string): Promise<void> {
    await this.close((k) => k.startsWith(`${partnerId}:`));
  }

  async closeAll(): Promise<void> {
    await this.close(() => true);
  }

  /** Test helper: how many live upstream slots are reserved. */
  size(): number {
    return this.clients.size;
  }

  private async close(match: (key: string) => boolean): Promise<void> {
    const pending: Promise<Client>[] = [];
    for (const [k, p] of this.clients) {
      if (match(k)) {
        pending.push(p);
        this.clients.delete(k);
      }
    }
    await Promise.allSettled(pending.map(async (p) => (await p).close()));
  }
}

export const upstreamPool = new UpstreamPool();
