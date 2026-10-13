import type { ToolDeps } from '../deps.js';
import { ok, parseFlags } from '../format.js';
import { parseRequest } from '../parse.js';

export async function handleStatus(request: string, deps: ToolDeps): Promise<string> {
  const flags = parseFlags(request);
  const parsed = parseRequest(flags.text || request);
  const devId = deps.getDevId();
  const services = await deps.graph.getAllServices(devId);

  if (parsed.serviceId) {
    const service = await deps.graph.getService(devId, parsed.serviceId);
    if (!service) return ok({ mode: 'status', error: 'service_not_found', id: parsed.serviceId });
    const partner = deps.registry.get(service.partner);
    const auth = partner ? await deps.auth.getLinkedAccount(devId, partner.id) : undefined;
    const health = partner ? await partner.checkHealth(auth?.apiKey ?? 'stub') : 'unknown';
    const body: Record<string, unknown> = {
      mode: 'status',
      id: service.id,
      partner: service.partner,
      cat: service.category,
      plan: service.plan,
      spend: service.monthlySpend,
      health,
      status: service.status,
    };
    if (flags.detail) {
      body.envKeys = Object.keys(service.envVars ?? {});
      body.doc = partner?.getDocumentation('connection');
    }
    return ok(body);
  }

  let totalSpend = 0;
  let totalCashback = 0;
  const rows = [];

  for (const service of services) {
    const partner = deps.registry.get(service.partner);
    let health: string = 'unknown';
    let cashback = 0;
    if (partner) {
      const auth = await deps.auth.getLinkedAccount(devId, partner.id);
      health = await partner.checkHealth(auth?.apiKey ?? 'stub');
      cashback = partner.estimateDevCashback(service.monthlySpend);
      totalSpend += service.monthlySpend;
      totalCashback += cashback;
    }
    rows.push({
      id: service.id,
      partner: service.partner,
      cat: service.category,
      plan: service.plan,
      health,
      spend: service.monthlySpend,
      cb: cashback,
    });
  }

  const connections = flags.detail ? await deps.graph.getConnections(devId) : undefined;

  return ok({
    mode: 'status',
    n: rows.length,
    spend: totalSpend,
    cb: totalCashback,
    services: rows,
    ...(connections ? { connections } : {}),
  });
}
