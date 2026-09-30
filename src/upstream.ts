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

/** stdio upstreams run on the developer's machine, so only package launchers are allowed. */
export const ALLOWED_STDIO_COMMANDS = ['npx', 'node', 'uvx', 'docker'] as const;

const fill = (s: string, apiKey: string) => s.replaceAll('{api_key}', apiKey);
const fillAll = (o: Record<string, string>, apiKey: string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fill(v, apiKey)]));

/** One live MCP client per (partner, api key); opened lazily, dropped when the connection dies. */
export class UpstreamPool {
  private clients = new Map<string, Promise<Client>>();

  private key(partnerId: string, apiKey: string): string {
    return `${partnerId}:${createHash('sha256').update(apiKey).digest('hex')}`;
  }

  private connect(partnerId: string, config: UpstreamConfig, apiKey: string): Promise<Client> {
    const key = this.key(partnerId, apiKey);
    const existing = this.clients.get(key);
    if (existing) return existing;

    if (config.transport === 'stdio' && !(ALLOWED_STDIO_COMMANDS as readonly string[]).includes(config.command)) {
      return Promise.reject(new Error(`stdio command "${config.command}" is not allowed (use one of: ${ALLOWED_STDIO_COMMANDS.join(', ')})`));
    }

    const client = new Client({ name: 'infra-copilot-gateway', version: '0.1.0' });
    client.onclose = () => this.clients.delete(key);

    // First stderr output of a stdio server, surfaced when it fails to start (e.g. "401" = bad API key)
    let stderrHead = '';
    const transport = config.transport === 'stdio'
      ? new StdioClientTransport({
          command: config.command,
          args: config.args.map(a => fill(a, apiKey)),
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

    const connecting = client.connect(transport, { timeout: CONNECT_TIMEOUT_MS })
      .then(() => client)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const said = stderrHead.trim().split('\n')[0]?.slice(0, STDERR_HEAD).replaceAll(apiKey, '***');
        throw new Error(said ? `${message} (partner server: ${said})` : message);
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
      text: content.map(c => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n'),
      structured: result.structuredContent as Record<string, unknown> | undefined,
    };
  }

  /** Drops every dev's connection to one partner (its upstream config changed or was removed). */
  async closePartner(partnerId: string): Promise<void> {
    await this.close(k => k.startsWith(`${partnerId}:`));
  }

  async closeAll(): Promise<void> {
    await this.close(() => true);
  }

  private async close(match: (key: string) => boolean): Promise<void> {
    const pending: Promise<Client>[] = [];
    for (const [k, p] of this.clients) {
      if (match(k)) {
        pending.push(p);
        this.clients.delete(k);
      }
    }
    await Promise.allSettled(pending.map(async p => (await p).close()));
  }
}

export const upstreamPool = new UpstreamPool();
