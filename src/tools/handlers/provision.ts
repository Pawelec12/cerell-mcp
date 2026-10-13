import type { ToolDeps } from '../deps.js';
import { err, ok, parseFlags } from '../format.js';
import { matchPartners, parseRequest, resolvePartner } from '../parse.js';

export async function handleProvision(request: string, deps: ToolDeps): Promise<{ text: string; isError?: boolean }> {
  const flags = parseFlags(request);
  const parsed = parseRequest(flags.text || request);
  const devId = deps.getDevId();

  let partner = resolvePartner(parsed, deps.registry);
  if (!partner && !parsed.provider) {
    const matched = matchPartners(parsed.text, deps.registry);
    if (matched.length > 1) {
      return {
        text: ok({
          mode: 'provision',
          need: 'provider',
          options: matched.slice(0, flags.limit || 5).map((p) => ({ id: p.id, name: p.name, cat: p.category })),
          total: matched.length,
        }),
      };
    }
    partner = matched[0];
  }

  if (!partner) {
    return {
      text: err('provider_not_found', { categories: deps.registry.getCategories() }),
      isError: true,
    };
  }

  const isLinked = await deps.auth.isLinked(devId, partner.id);
  if (!isLinked) {
    return {
      text: ok({
        mode: 'provision',
        need: 'account',
        id: partner.id,
        name: partner.name,
        signup: partner.getAffiliateSignupUrl(devId),
        next: `connect: "${partner.id} api_key=KEY"`,
        cbPct: Math.round(partner.devCashbackRate * 100),
      }),
    };
  }

  const linked = await deps.auth.getLinkedAccount(devId, partner.id);
  const context = {
    devId,
    apiKey: linked?.apiKey,
    affiliateId: partner.affiliateId,
  };

  try {
    await partner.discoverActions(context);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { text: err('upstream_discover_failed', { id: partner.id, message }), isError: true };
  }

  const validActions = partner.getActions();

  if (!parsed.action) {
    const actions = flags.detail
      ? validActions.map((a) => ({
          name: a.name,
          description: a.description,
          inputSchema: a.inputSchema ?? a.params,
        }))
      : validActions.map((a) => a.name);
    return {
      text: ok({
        mode: 'provision',
        need: 'action',
        id: partner.id,
        actions,
      }),
    };
  }

  if (!validActions.some((a) => a.name === parsed.action)) {
    return {
      text: err('action_not_found', {
        action: parsed.action,
        actions: validActions.map((a) => a.name),
      }),
      isError: true,
    };
  }

  try {
    const actionResult = await partner.executeAction(parsed.action, parsed.config, context);
    if (!actionResult.success) {
      return { text: err(actionResult.message, { id: partner.id }), isError: true };
    }

    const serviceId = (actionResult.data?.['id'] as string) ?? `${partner.id}-${Date.now()}`;
    await deps.graph.addService(devId, {
      id: serviceId,
      partner: partner.id,
      category: partner.category,
      name: `${partner.name} — ${parsed.action}`,
      plan: linked?.currentPlan ?? 'free',
      status: 'active',
      config: parsed.config,
      envVars: actionResult.envVars ?? {},
      monthlySpend: linked?.monthlySpend ?? 0,
      createdAt: new Date().toISOString(),
      metadata: actionResult.data ?? {},
    });

    await deps.tracker.trackEvent({
      devId,
      partner: partner.id,
      action: parsed.action,
      type: 'provision',
      estimatedRevenue: 0,
      cashbackAmount: 0,
    });

    const spend = linked?.monthlySpend ?? 0;
    const body: Record<string, unknown> = {
      mode: 'provision',
      id: partner.id,
      action: parsed.action,
      serviceId,
      msg: actionResult.message,
    };
    if (flags.detail) {
      body.env = actionResult.envVars ?? {};
      body.data = actionResult.data ?? {};
      body.cbMo = spend > 0 ? partner.estimateDevCashback(spend) : 0;
    } else if (actionResult.envVars && Object.keys(actionResult.envVars).length > 0) {
      body.envKeys = Object.keys(actionResult.envVars);
    }

    return { text: ok(body) };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { text: err(message), isError: true };
  }
}
