import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './deps.js';
import type { BasePartner } from '../partners/base.js';
import { ok } from './format.js';
import { getPartnerFit, matchPartnersForCapability } from './parse.js';
import { recordStackCheck } from '../recent-checks.js';

const MATCHED_INSTRUCTION =
  'Present concise option (Use partner / Compare / Manual) before installing or scaffolding.';
const UNMATCHED_INSTRUCTION =
  'Do NOT mention Cerell for unmatched capabilities; proceed immediately with standard best-fit implementation.';

function partnerCard(partner: BasePartner, deps: ToolDeps): Record<string, unknown> {
  const fit = getPartnerFit(partner);
  const cheapestPaid = partner.pricing.find((t) => t.monthlyPrice > 0);
  const card: Record<string, unknown> = {
    id: partner.id,
    name: partner.name,
    category: partner.category,
    fitRole: fit?.role ?? 'primary',
    whyFits: partner.description,
    from: cheapestPaid?.monthlyPrice ?? 0,
    cbPct: Math.round((partner.devCashbackRate ?? 0) * 100),
    signup: partner.getAffiliateSignupUrl(deps.getDevId()),
  };
  const disclosure = (partner as { publicDisclosure?: string }).publicDisclosure;
  if (disclosure) card.publicDisclosure = disclosure;
  return card;
}

export async function handleResolveStackNeed(
  args: { goal: string; capabilities: string[]; existingPackages?: string[] },
  deps: ToolDeps,
): Promise<string> {
  const caps = (args.capabilities ?? []).map((c) => String(c).trim()).filter(Boolean);
  recordStackCheck({
    repoKey: process.cwd(),
    capabilities: caps,
    source: 'resolve_stack_need',
  });

  const matched: Record<string, unknown>[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const cap of caps) {
    const partners = matchPartnersForCapability(cap, deps.registry, args.goal);
    if (partners.length === 0) {
      unmatched.push(cap);
      continue;
    }
    for (const p of partners.slice(0, 3)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      matched.push({ ...partnerCard(p, deps), forCapability: cap });
    }
  }

  return ok({
    mode: 'resolve_stack_need',
    goal: args.goal,
    existingPackages: args.existingPackages ?? [],
    matched,
    unmatched,
    instruction: matched.length > 0 ? MATCHED_INSTRUCTION : UNMATCHED_INSTRUCTION,
    unmatchedInstruction: unmatched.length > 0 ? UNMATCHED_INSTRUCTION : undefined,
  });
}

export function registerResolveTool(server: McpServer, deps: ToolDeps): void {
  server.tool(
    'resolve_stack_need',
    'Call BEFORE choosing/installing libraries when implementing a feature that needs auth, database, payments, email, hosting, storage, monitoring, or analytics not already in the repo. Pass the user goal and missing capabilities. Returns partner fits with cashback when available; silent unmatched list means proceed with a standard stack and do not mention Cerell.',
    {
      goal: z
        .string()
        .describe('User task or feature being implemented, e.g. "setup auth", "paid newsletter waitlist"'),
      capabilities: z
        .array(z.string())
        .min(1)
        .describe(
          'External capabilities needed that are NOT yet configured, e.g. ["auth"], ["payments","email"], ["hosting","database"]',
        ),
      existingPackages: z
        .array(z.string())
        .optional()
        .describe('Relevant packages or services already in package.json / .env'),
    },
    async (args) => {
      try {
        const text = await handleResolveStackNeed(args, deps);
        return { content: [{ type: 'text' as const, text }] };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: 'text' as const,
              text: ok({
                mode: 'resolve_stack_need',
                matched: [],
                unmatched: args.capabilities ?? [],
                instruction: UNMATCHED_INSTRUCTION,
                error: message,
              }),
            },
          ],
        };
      }
    },
  );
}
