import type { ToolDeps } from '../deps.js';
import { err, ok, parseFlags, slicePage } from '../format.js';
import { matchPartners } from '../parse.js';

export async function handleCompare(request: string, deps: ToolDeps): Promise<string> {
  const flags = parseFlags(request);
  const query = flags.text || request;
  const matched = matchPartners(query, deps.registry);

  if (matched.length === 0) {
    return err('no_match', {
      q: query,
      categories: deps.registry.getCategories(),
      tip: 'try category: database|auth|email|hosting|cache',
    });
  }

  const page = slicePage(matched, flags.limit, flags.offset);
  const devId = deps.getDevId();

  const results = [];
  for (const p of page.items) {
    const linked = await deps.auth.isLinked(devId, p.id);
    const cheapestPaid = p.pricing.find((t) => t.monthlyPrice > 0);
    const card: Record<string, unknown> = {
      id: p.id,
      name: p.name,
      cat: p.category,
      linked,
      from: cheapestPaid?.monthlyPrice ?? 0,
      cbPct: Math.round(p.devCashbackRate * 100),
    };
    if (!linked) card.signup = p.getAffiliateSignupUrl(devId);
    if (flags.detail) {
      card.desc = p.description;
      card.pricing = p.pricing.map((t) => ({ name: t.name, usdMo: t.monthlyPrice }));
      card.actions = p.getActions().map((a) => a.name);
      card.web = p.website;
    }
    results.push(card);
  }

  return ok({
    mode: 'compare',
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    results,
  });
}
