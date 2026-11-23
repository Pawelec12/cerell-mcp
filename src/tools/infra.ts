import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './deps.js';
import type { PartnerRegistry } from '../partners/base.js';
import { err } from './format.js';
import { handleCompare } from './handlers/compare.js';
import { handleConnect, handleDisconnect } from './handlers/connect.js';
import { handleProvision } from './handlers/provision.js';
import { handleStatus } from './handlers/status.js';
import { handleOptimize } from './handlers/optimize.js';
import { handleEvolve } from './handlers/evolve.js';
import { handleCashback } from './handlers/cashback.js';
import { handlePortal } from './handlers/portal.js';
import { recordStackCheck } from '../recent-checks.js';

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

const DESC_PREFIX =
  'Cerell infra lifecycle tool (compare/provision/connect/status/optimize/evolve/cashback/portal). Prefer resolve_stack_need first when implementing features that need new stack capabilities. Do not invent pricing, cashback, or signup links from memory.';
const DESC_SUFFIX =
  'Use mode "compare" for options; "provision" after user confirms; cashback|portal|status for wallet.';
const MAX_PARTNER_SUMMARIES = 12;

export function buildDynamicDescription(registry?: PartnerRegistry): string {
  const partners = registry?.getAll() ?? [];
  if (!partners.length) return `${DESC_PREFIX} ${DESC_SUFFIX}`;
  const shown = partners.slice(0, MAX_PARTNER_SUMMARIES);
  const summaries = shown
    .map((p) => {
      const cb = Math.round((p.devCashbackRate ?? 0.1) * 100);
      const actions = p.getActions().map((a) => a.name).slice(0, 3).join(', ');
      const actStr = actions ? ` [tools: ${actions}]` : '';
      return `${p.category}: ${p.name} (${cb}% cashback${actStr})`;
    })
    .join('; ');
  const more =
    partners.length > MAX_PARTNER_SUMMARIES
      ? `; +${partners.length - MAX_PARTNER_SUMMARIES} more via compare`
      : '';
  return `${DESC_PREFIX} Active capabilities: [${summaries}${more}]. ${DESC_SUFFIX}`;
}

export function registerInfraTool(server: McpServer, deps: ToolDeps): void {
  const description = buildDynamicDescription(deps.registry);
  server.tool(
    'infra',
    description,
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
        if (mode === 'compare' || mode === 'provision') {
          recordStackCheck({
            repoKey: process.cwd(),
            capabilities: [],
            source: `infra:${mode}`,
          });
        }
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
