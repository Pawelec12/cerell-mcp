import type { ToolDeps } from '../deps.js';
import { err, ok, parseFlags } from '../format.js';
import { parseRequest, resolvePartner } from '../parse.js';

export async function handleEvolve(request: string, deps: ToolDeps): Promise<string> {
  const flags = parseFlags(request);
  const parsed = parseRequest(flags.text || request);
  const text = (flags.text || request).toLowerCase();

  // scale assessment when no from/to
  if (!parsed.fromProvider && !parsed.toProvider && (text.includes('scale') || text.includes('assess') || !text.trim())) {
    const devId = deps.getDevId();
    const services = await deps.graph.getAllServices(devId);
    if (services.length === 0) return ok({ mode: 'evolve', assessments: [] });

    const assessments = [];
    for (const service of services) {
      const partner = deps.registry.get(service.partner);
      if (!partner) continue;
      const auth = await deps.auth.getLinkedAccount(devId, partner.id);
      const row: Record<string, unknown> = {
        id: service.id,
        partner: partner.name,
        spend: service.monthlySpend,
      };
      if (flags.detail) {
        row.usage = await partner.getUsageStats(auth?.apiKey ?? 'stub');
        row.tip = 'compare usage vs plan limits; scale if >80%';
      }
      assessments.push(row);
    }
    return ok({ mode: 'evolve', kind: 'scale', assessments });
  }

  const fromPartner = parsed.fromProvider
    ? resolvePartner({ ...parsed, provider: parsed.fromProvider, text: parsed.fromProvider, raw: parsed.fromProvider, config: {} }, deps.registry)
    : undefined;
  const toPartner = parsed.toProvider
    ? resolvePartner({ ...parsed, provider: parsed.toProvider, text: parsed.toProvider, raw: parsed.toProvider, config: {} }, deps.registry)
    : undefined;

  if (!fromPartner || !toPartner) {
    return err('need_from_to', { hint: 'from=neon to=supabase [service_id=...] [detail=1]' });
  }

  const body: Record<string, unknown> = {
    mode: 'evolve',
    kind: 'migrate',
    from: { id: fromPartner.id, name: fromPartner.name, cbPct: Math.round(fromPartner.devCashbackRate * 100) },
    to: { id: toPartner.id, name: toPartner.name, cbPct: Math.round(toPartner.devCashbackRate * 100) },
    service: parsed.serviceId ?? null,
  };

  if (flags.detail) {
    body.steps = [
      `backup ${fromPartner.name}`,
      `provision ${toPartner.name}`,
      'migrate schema',
      'migrate data',
      'update env/secrets',
      'test',
      'cutover',
      `decommission ${fromPartner.name}`,
    ];
  }

  return ok(body);
}
