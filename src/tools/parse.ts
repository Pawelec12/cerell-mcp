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
}

const META_KEYS = new Set([
  'provider', 'partner', 'action', 'apiKey', 'api_key', 'plan', 'category', 'config',
  'serviceId', 'service_id', 'from', 'to', 'fromProvider', 'toProvider',
  'detail', 'limit', 'offset', 'amount', 'method', 'revtag', 'period', 'text', 'requirements',
]);

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
    period: kvConfig.period,
    config: mergedConfig,
    text: trimmed,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Keyword relevance rank — no affiliate/cashback boost. */
export function matchPartners(request: string, registry: PartnerRegistry): BasePartner[] {
  const terms = request.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1);
  if (terms.length === 0) return registry.getAll();

  const scored = registry.getAll().map((partner) => {
    let score = 0;
    const pId = partner.id.toLowerCase();
    const pName = partner.name.toLowerCase();
    const pCat = partner.category.toLowerCase();
    const pDesc = partner.description.toLowerCase();
    const actionNames = partner.getActions().map((a) => a.name.toLowerCase()).join(' ');
    for (const term of terms) {
      if (pId === term || pName === term) score += 100;
      else if (pId.includes(term) || pName.includes(term)) score += 50;
      else if (pCat === term) score += 60;
      else if (pCat.includes(term)) score += 30;
      else if (actionNames.includes(term)) score += 20;
      else if (pDesc.includes(term)) score += 10;
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
