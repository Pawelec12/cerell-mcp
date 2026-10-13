import type { ToolDeps } from '../deps.js';
import { err, ok, parseFlags } from '../format.js';
import { parseRequest, resolvePartner } from '../parse.js';

export async function handleConnect(request: string, deps: ToolDeps): Promise<{ text: string; isError?: boolean }> {
  const flags = parseFlags(request);
  const parsed = parseRequest(flags.text || request);
  const partner = resolvePartner(parsed, deps.registry);

  if (!partner) {
    return { text: err('provider_not_found', { categories: deps.registry.getCategories() }), isError: true };
  }

  const apiKey = parsed.apiKey;
  if (!apiKey) {
    return {
      text: err('missing_api_key', { hint: `${partner.id} api_key=KEY [plan=pro]` }),
      isError: true,
    };
  }

  const plan = parsed.plan || 'free';
  const planTier = partner.pricing.find((t) => t.name.toLowerCase() === plan.toLowerCase());
  const monthlySpend = planTier?.monthlyPrice ?? 0;
  const devId = deps.getDevId();
  const firstLink = !(await deps.auth.isLinked(devId, partner.id));

  await deps.auth.linkAccount(devId, partner.id, apiKey, plan, monthlySpend);

  const commission = firstLink ? monthlySpend * partner.commissionRate + partner.signupBonus : 0;
  const cashback = deps.cashbackEngine.calculateCashback(commission, monthlySpend);

  if (firstLink) {
    await deps.tracker.trackEvent({
      devId,
      partner: partner.id,
      action: 'link_account',
      type: 'signup',
      estimatedRevenue: commission,
      cashbackAmount: cashback.devAmount,
      status: 'pending',
    });
  }

  const body: Record<string, unknown> = {
    mode: 'connect',
    id: partner.id,
    name: partner.name,
    plan,
    spend: monthlySpend,
    firstLink,
    cb: firstLink ? cashback.devAmount : 0,
  };
  if (flags.detail) {
    body.actions = partner.getActions().map((a) => a.name);
  }

  return { text: ok(body) };
}

export async function handleDisconnect(request: string, deps: ToolDeps): Promise<{ text: string; isError?: boolean }> {
  const flags = parseFlags(request);
  const parsed = parseRequest(flags.text || request);
  const partner = resolvePartner(parsed, deps.registry);

  if (!partner) {
    return { text: err('provider_not_found'), isError: true };
  }

  const devId = deps.getDevId();
  const linked = await deps.auth.getLinkedAccount(devId, partner.id);
  if (!linked) {
    return { text: err('not_linked', { id: partner.id }), isError: true };
  }

  await deps.auth.unlinkAccount(devId, partner.id);
  const services = await deps.graph.getServicesByPartner(devId, partner.id);
  for (const svc of services) {
    await deps.graph.updateService(devId, svc.id, { status: 'inactive' });
  }

  return {
    text: ok({
      mode: 'disconnect',
      id: partner.id,
      deactivated: services.map((s) => s.id),
    }),
  };
}
