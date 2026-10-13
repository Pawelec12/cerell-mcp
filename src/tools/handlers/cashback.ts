import type { ToolDeps } from '../deps.js';
import { err, ok, parseFlags } from '../format.js';
import { parseRequest } from '../parse.js';

export async function handleCashback(request: string, deps: ToolDeps): Promise<{ text: string; isError?: boolean }> {
  const flags = parseFlags(request);
  const parsed = parseRequest(flags.text || request);
  const text = (flags.text || request).toLowerCase();
  const devId = deps.getDevId();

  const wantPayout = text.includes('payout') || text.includes('withdraw') || parsed.amount !== undefined;
  const wantHistory = text.includes('history') || text.includes('events');
  const wantSpend = text.includes('spend') || text.includes('summary');

  if (wantPayout) {
    const payouts = await deps.payouts.getForDev(devId);
    const balance = await deps.cashbackEngine.getBalance(devId, deps.tracker, payouts);
    const min = deps.cashbackEngine.minPayout;
    const amount = parsed.amount !== undefined ? Math.round(parsed.amount * 100) / 100 : undefined;
    const method = (parsed.method ?? 'revolut') as 'stripe' | 'revolut' | 'credits' | 'paypal' | 'bank_transfer' | 'crypto';

    if (amount === undefined) {
      return {
        text: ok({
          mode: 'cashback',
          need: 'amount',
          available: balance.available,
          min,
          hint: 'amount=25 method=revolut revtag=@you',
        }),
      };
    }

    let error: string | null = null;
    if (amount <= 0) error = 'amount must be > 0';
    else if (min > 0 && amount < min) error = `min payout $${min}`;
    else if (amount > balance.available + 1e-9) error = `exceeds available $${balance.available}`;
    else if (method === 'revolut' && !parsed.revtag) error = 'revtag required for revolut';

    if (error) return { text: err(error, { available: balance.available }), isError: true };

    let estFee = 0;
    let estNet = amount;
    if (method === 'stripe' || method === 'bank_transfer') {
      const hasPaidThisMonth = payouts.some((p) => {
        if (p.status === 'rejected' || (p.method !== 'stripe' && p.method !== 'bank_transfer')) return false;
        const d = new Date(p.requestedAt);
        return d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth();
      });
      const activeMonthlyFee = hasPaidThisMonth ? 0 : 2.0;
      estFee = Number((activeMonthlyFee + 0.25 + amount * 0.0025).toFixed(2));
      estNet = Number(Math.max(0, amount - estFee).toFixed(2));
    }

    const payoutDetails = parsed.revtag ? { revtag: parsed.revtag } : undefined;
    const payout = await deps.payouts.request(devId, amount, method, payoutDetails, estFee, estNet);

    return {
      text: ok({
        mode: 'cashback',
        kind: 'payout',
        id: payout.id,
        amount: payout.amount,
        method: payout.method,
        fee: estFee,
        net: estNet,
        left: Number((balance.available - amount).toFixed(2)),
      }),
    };
  }

  if (wantHistory) {
    const events = await deps.tracker.getEventsForDev(devId);
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const lim = flags.limit === 0 ? events.length : flags.limit || 20;
    const slice = events.slice(flags.offset, flags.offset + lim).map((ev) => ({
      t: ev.timestamp.slice(0, 10),
      type: ev.type,
      partner: ev.partner,
      cb: ev.cashbackAmount,
      action: ev.action,
      ...(flags.detail ? { status: ev.status } : {}),
    }));
    return { text: ok({ mode: 'cashback', kind: 'history', total: events.length, events: slice }) };
  }

  if (wantSpend) {
    const services = await deps.graph.getAllServices(devId);
    const by: Record<string, { name: string; spend: number; cb: number }> = {};
    for (const service of services) {
      const partner = deps.registry.get(service.partner);
      if (!partner) continue;
      if (!by[partner.id]) by[partner.id] = { name: partner.name, spend: 0, cb: 0 };
      by[partner.id].spend += service.monthlySpend;
      by[partner.id].cb += partner.estimateDevCashback(service.monthlySpend);
    }
    return {
      text: ok({
        mode: 'cashback',
        kind: 'spend',
        period: parsed.period ?? 'current_month',
        partners: Object.entries(by).map(([id, v]) => ({ id, ...v })),
      }),
    };
  }

  // default: dashboard
  const payouts = await deps.payouts.getForDev(devId);
  const balance = await deps.cashbackEngine.getBalance(devId, deps.tracker, payouts);
  const services = await deps.graph.getAllServices(devId);
  const body: Record<string, unknown> = {
    mode: 'cashback',
    kind: 'dashboard',
    available: balance.available,
    pendingCb: balance.pendingCashback,
    pendingPay: balance.pending,
    lifetime: balance.lifetimeEarned,
  };
  if (flags.detail) {
    body.services = services.map((s) => {
      const partner = deps.registry.get(s.partner);
      return {
        id: s.id,
        partner: partner?.name ?? s.partner,
        cbMo: partner ? partner.estimateDevCashback(s.monthlySpend) : 0,
      };
    });
    body.payouts = payouts.slice(0, 10).map((p) => ({
      t: p.requestedAt.slice(0, 10),
      amount: p.amount,
      method: p.method,
      status: p.status,
    }));
  }
  return { text: ok(body) };
}
