import type { BasePartner, PartnerRegistry } from '../partners/base.js';

export interface ParsedRequest {
  raw: string;
  provider?: string;
  action?: string;
  apiKey?: string;
  plan?: string;
  category?: string;
  fromProvider?: string;
  toProvider?: string;
  serviceId?: string;
  config: Record<string, unknown>;
  text: string;
  amount?: number;
  method?: string;
  revtag?: string;
  period?: string;
  wallet?: string;
  email?: string;
}

export interface PartnerFit {
  role: 'primary' | 'companion';
  intents: string[];
  excludeTerms: string[];
}

const META_KEYS = new Set([
  'provider', 'partner', 'action', 'apiKey', 'api_key', 'plan', 'category', 'config',
  'serviceId', 'service_id', 'from', 'to', 'fromProvider', 'toProvider',
  'detail', 'limit', 'offset', 'amount', 'method', 'revtag', 'period', 'text', 'requirements',
  'wallet', 'address', 'email', 'paypalEmail',
]);

/** Implementation terms → canonical capability. */
export const INTENT_SYNONYMS: Record<string, string[]> = {
  auth: ['auth', 'login', 'signup', 'sign-up', 'oauth', 'sso', 'session', 'jwt', 'magic', 'passkey', 'clerk', 'auth0', 'supabase-auth'],
  payments: ['payments', 'payment', 'checkout', 'stripe', 'billing', 'subscription', 'recurring', 'invoice', 'paywall', 'credit', 'card', 'donate', 'donation', 'pay'],
  hosting: ['hosting', 'host', 'deploy', 'deployment', 'vps', 'server', 'docker', 'kubernetes', 'k8s', 'compute', 'cloud', 'vm', 'bare', 'metal', 'backend'],
  email: ['email', 'newsletter', 'waitlist', 'audience', 'digest', 'broadcast', 'transactional', 'smtp', 'mail'],
  database: ['database', 'db', 'postgres', 'postgresql', 'mysql', 'sql', 'schema', 'erd', 'migration', 'orm', 'prisma', 'drizzle'],
  monitoring: ['monitoring', 'monitor', 'error', 'crash', 'apm', 'logs', 'logging', 'uptime', 'ai-visibility', 'brand', 'mentions'],
  storage: ['storage', 'upload', 's3', 'blob', 'workspace', 'files', 'file', 'bucket'],
  analytics: ['analytics', 'telemetry', 'funnel', 'competitor', 'tracking', 'pageview', 'metrics'],
  cache: ['cache', 'redis', 'kv', 'upstash'],
};

export function expandIntentTerms(request: string): {
  capabilities: string[];
  terms: string[];
  lower: string;
} {
  const lower = request.toLowerCase();
  const rawTerms = lower.split(/[\s,/_+-]+/).filter((t) => t.length > 1);
  const capabilities = new Set<string>();
  for (const [cap, synonyms] of Object.entries(INTENT_SYNONYMS)) {
    for (const syn of synonyms) {
      if (lower.includes(syn) || rawTerms.includes(syn)) {
        capabilities.add(cap);
        break;
      }
    }
  }
  return { capabilities: [...capabilities], terms: rawTerms, lower };
}

/**
 * Robustly parses request string from LLM.
 * Accepts JSON object, key=value tokens, or free text.
 */
export function parseRequest(request: string): ParsedRequest {
  const trimmed = request.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const config: Record<string, unknown> =
        obj.config && typeof obj.config === 'object' && !Array.isArray(obj.config)
          ? { ...(obj.config as Record<string, unknown>) }
          : {};
      for (const [k, v] of Object.entries(obj)) {
        if (!META_KEYS.has(k)) config[k] = v;
      }
      return {
        raw: trimmed,
        provider: str(obj.provider ?? obj.partner),
        action: str(obj.action),
        apiKey: str(obj.apiKey ?? obj.api_key),
        plan: str(obj.plan),
        category: str(obj.category),
        fromProvider: str(obj.fromProvider ?? obj.from),
        toProvider: str(obj.toProvider ?? obj.to),
        serviceId: str(obj.serviceId ?? obj.service_id),
        amount: typeof obj.amount === 'number' ? obj.amount : undefined,
        method: str(obj.method),
        revtag: str(obj.revtag),
        wallet: str(obj.wallet ?? obj.address),
        email: str(obj.email ?? obj.paypalEmail),
        period: str(obj.period),
        config,
        text: str(obj.text ?? obj.requirements) ?? trimmed,
      };
    } catch {
      // fall through
    }
  }

  let remainingText = trimmed;
  let embeddedConfig: Record<string, unknown> = {};
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      embeddedConfig = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      remainingText = trimmed.replace(jsonMatch[0], ' ').trim();
    } catch {
      // ignore
    }
  }

  const kvConfig: Record<string, string> = {};
  const kvRegex = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = kvRegex.exec(remainingText)) !== null) {
    kvConfig[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  const cleanTokens = remainingText.replace(kvRegex, ' ').trim().split(/\s+/).filter(Boolean);

  const mergedConfig: Record<string, unknown> = { ...embeddedConfig, ...kvConfig };
  for (const k of [
    'provider', 'partner', 'action', 'apiKey', 'api_key', 'plan', 'category',
    'serviceId', 'service_id', 'fromProvider', 'from', 'toProvider', 'to',
    'detail', 'limit', 'offset', 'amount', 'method', 'revtag', 'period',
    'wallet', 'address', 'email', 'paypalEmail',
  ]) {
    delete mergedConfig[k];
  }

  const amountRaw = kvConfig.amount;
  return {
    raw: trimmed,
    provider: kvConfig.provider ?? kvConfig.partner ?? cleanTokens[0],
    action: kvConfig.action ?? cleanTokens[1],
    apiKey: kvConfig.apiKey ?? kvConfig.api_key,
    plan: kvConfig.plan ?? 'free',
    category: kvConfig.category,
    fromProvider: kvConfig.fromProvider ?? kvConfig.from,
    toProvider: kvConfig.toProvider ?? kvConfig.to,
    serviceId: kvConfig.serviceId ?? kvConfig.service_id,
    amount: amountRaw !== undefined ? Number(amountRaw) : undefined,
    method: kvConfig.method,
    revtag: kvConfig.revtag,
    wallet: kvConfig.wallet ?? kvConfig.address,
    email: kvConfig.email ?? kvConfig.paypalEmail,
    period: kvConfig.period,
    config: mergedConfig,
    text: trimmed,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Partner fit block from config (optional). */
export function getPartnerFit(partner: BasePartner | { fit?: unknown; config?: { fit?: unknown } }): PartnerFit | null {
  const fit = (partner as { fit?: unknown }).fit
    ?? (partner as { config?: { fit?: unknown } }).config?.fit;
  if (!fit || typeof fit !== 'object') return null;
  const f = fit as { role?: string; intents?: unknown[]; excludeTerms?: unknown[] };
  return {
    role: f.role === 'companion' ? 'companion' : 'primary',
    intents: Array.isArray(f.intents) ? f.intents.map((s) => String(s).toLowerCase()) : [],
    excludeTerms: Array.isArray(f.excludeTerms) ? f.excludeTerms.map((s) => String(s).toLowerCase()) : [],
  };
}

export function scorePartnerFit(partner: BasePartner, request: string): number {
  const { capabilities, terms, lower } = expandIntentTerms(request);
  const fit = getPartnerFit(partner);
  if (fit?.excludeTerms?.length) {
    for (const ex of fit.excludeTerms) {
      if (ex && lower.includes(ex)) return 0;
    }
  }
  let score = 0;
  const pId = partner.id.toLowerCase();
  const pName = partner.name.toLowerCase();
  const pCat = partner.category.toLowerCase();
  const pDesc = (partner.description ?? '').toLowerCase();
  const actionNames = partner.getActions().map((a) => a.name.toLowerCase()).join(' ');

  if (fit?.intents?.length) {
    for (const intent of fit.intents) {
      if (lower.includes(intent) || terms.includes(intent) || capabilities.includes(intent)) {
        score += 80;
      }
      for (const [cap, synonyms] of Object.entries(INTENT_SYNONYMS)) {
        if (capabilities.includes(cap) && (intent === cap || synonyms.includes(intent))) {
          score += 40;
        }
      }
    }
  }

  for (const term of terms) {
    if (pId === term || pName === term) score += 100;
    else if (pId.includes(term) || pName.includes(term)) score += 50;
    else if (pCat === term) score += 60;
    else if (pCat.includes(term)) score += 30;
    else if (actionNames.includes(term)) score += 20;
    else if (pDesc.includes(term)) score += 10;
  }
  for (const cap of capabilities) {
    if (pCat === cap) score += 50;
    else if (fit?.intents?.some((i) => i === cap || INTENT_SYNONYMS[cap]?.includes(i))) score += 30;
  }
  return score;
}

/** Keyword + intent relevance rank — respects fit.excludeTerms. */
export function matchPartners(request: string, registry: PartnerRegistry): BasePartner[] {
  const terms = request.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1);
  if (terms.length === 0) return registry.getAll();

  const scored = registry.getAll().map((partner) => ({
    partner,
    score: scorePartnerFit(partner, request),
  }));

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.partner);
}

export function matchPartnersForCapability(
  capability: string,
  registry: PartnerRegistry,
  goal = '',
): BasePartner[] {
  const cap = capability.toLowerCase().trim();
  const query = [cap, goal].filter(Boolean).join(' ');
  const scored = registry.getAll().map((partner) => {
    const fit = getPartnerFit(partner);
    const { lower } = expandIntentTerms(query);
    if (fit?.excludeTerms?.length) {
      for (const ex of fit.excludeTerms) {
        if (ex && lower.includes(ex)) return { partner, score: 0 };
      }
    }
    let score = scorePartnerFit(partner, query);
    if (fit?.intents?.length) {
      const intentHit = fit.intents.some(
        (i) =>
          i === cap ||
          INTENT_SYNONYMS[cap]?.includes(i) ||
          i.includes(cap) ||
          (INTENT_SYNONYMS[cap] ?? []).some((s) => i.includes(s)),
      );
      if (!intentHit && partner.category.toLowerCase() !== cap) score = 0;
    } else if (partner.category.toLowerCase() !== cap) {
      score = 0;
    }
    return { partner, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.partner);
}

export function resolvePartner(
  parsed: ParsedRequest,
  registry: PartnerRegistry,
  searchText?: string,
): BasePartner | undefined {
  if (parsed.provider) {
    const direct = registry.get(parsed.provider);
    if (direct) return direct;
    const matched = matchPartners(parsed.provider, registry);
    if (matched.length > 0) return matched[0];
  }
  const q = searchText ?? parsed.text;
  const matched = matchPartners(q, registry);
  return matched.length === 1 ? matched[0] : undefined;
}
