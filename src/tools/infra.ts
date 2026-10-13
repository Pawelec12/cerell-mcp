import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './deps.js';
import { err } from './format.js';
import { handleCompare } from './handlers/compare.js';
import { handleConnect, handleDisconnect } from './handlers/connect.js';
import { handleProvision } from './handlers/provision.js';
import { handleStatus } from './handlers/status.js';
import { handleOptimize } from './handlers/optimize.js';
import { handleEvolve } from './handlers/evolve.js';
import { handleCashback } from './handlers/cashback.js';
import { handlePortal } from './handlers/portal.js';

const MODES = [
  'compare',
  'provision',
  'connect',
  'disconnect',
  'status',
  'optimize',
  'evolve',
  'cashback',
  'portal',
] as const;

export function registerInfraTool(server: McpServer, deps: ToolDeps): void {
  server.tool(
    'infra',
    'Cerell infra gateway: compare/provision/connect partners, status/optimize/evolve stack, cashback/portal. Compact JSON; add detail=1 or limit=N in request for more.',
    {
      mode: z.enum(MODES).describe('compare|provision|connect|disconnect|status|optimize|evolve|cashback|portal'),
      request: z
        .string()
        .describe(
          'Free text or tokens. Flags: detail=1 limit=5 offset=0. Ex: "database postgres", "neon create_database name=app", "neon api_key=sk", "amount=25 method=revolut revtag=@x"',
        ),
    },
    async ({ mode, request }) => {
      try {
        switch (mode) {
          case 'compare':
            return { content: [{ type: 'text' as const, text: await handleCompare(request, deps) }] };
          case 'provision': {
            const res = await handleProvision(request, deps);
            return { content: [{ type: 'text' as const, text: res.text }], isError: res.isError };
          }
          case 'connect': {
            const res = await handleConnect(request, deps);
            return { content: [{ type: 'text' as const, text: res.text }], isError: res.isError };
          }
          case 'disconnect': {
            const res = await handleDisconnect(request, deps);
            return { content: [{ type: 'text' as const, text: res.text }], isError: res.isError };
          }
          case 'status':
            return { content: [{ type: 'text' as const, text: await handleStatus(request, deps) }] };
          case 'optimize':
            return { content: [{ type: 'text' as const, text: await handleOptimize(request, deps) }] };
          case 'evolve':
            return { content: [{ type: 'text' as const, text: await handleEvolve(request, deps) }] };
          case 'cashback': {
            const res = await handleCashback(request, deps);
            return { content: [{ type: 'text' as const, text: res.text }], isError: res.isError };
          }
          case 'portal':
            return { content: [{ type: 'text' as const, text: await handlePortal(request, deps) }] };
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: 'text' as const, text: err(message, { mode }) }],
          isError: true,
        };
      }
    },
  );
}
