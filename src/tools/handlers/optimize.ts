import type { PartnerCategory } from '../../types.js';
import type { ToolDeps } from '../deps.js';
import { err, ok, parseFlags } from '../format.js';
import { parseRequest } from '../parse.js';

export async function handleOptimize(request: string, deps: ToolDeps): Promise<string> {
  const flags = parseFlags(request);
  const parsed = parseRequest(flags.text || request);
  const devId = deps.getDevId();
  const services = await deps.graph.getAllServices(devId);

  if (parsed.serviceId) {
    const service = await deps.graph.getService(devId, parsed.serviceId);
    if (!service) return err('service_not_found', { id: parsed.serviceId });
    const partner = deps.registry.get(service.partner);
    if (!partner) return err('partner_missing', { partner: service.partner });
    const auth = await deps.auth.getLinkedAccount(devId, partner.id);
    const usage = await partner.getUsageStats(auth?.apiKey ?? 'stub');
    const body: Record<string, unknown> = {
      mode: 'optimize',
      id: service.id,
      partner: partner.name,
      plan: service.plan,
      spend: service.monthlySpend,
      cb: partner.estimateDevCashback(service.monthlySpend),
    };
    if (flags.detail) {
      body.usage = usage;
      body.scaling = partner.getDocumentation('scaling');
    }
    return ok(body);
  }

  let totalSpend = 0;
  let totalCashback = 0;
  const tips: string[] = [];
  const used = new Set<PartnerCategory>();

  for (const service of services) {
    const partner = deps.registry.get(service.partner);
    if (!partner) continue;
    used.add(partner.category);
    totalSpend += service.monthlySpend;
    totalCashback += partner.estimateDevCashback(service.monthlySpend);
    if (service.monthlySpend === 0) tips.push(`${service.id}: free/0 spend — watch upgrade limits`);
    else if (service.monthlySpend > 100) tips.push(`${service.id}: high spend $${service.monthlySpend}/mo`);
  }

  if (flags.detail) {
    for (const cat of deps.registry.getCategories()) {
      if (!used.has(cat)) tips.push(`gap: no ${cat} service`);
    }
  }

  return ok({
    mode: 'optimize',
    spend: totalSpend,
    cb: totalCashback,
    net: Math.max(0, totalSpend - totalCashback),
    tips: tips.slice(0, flags.detail ? 20 : 5),
  });
}
