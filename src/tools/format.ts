/** Compact MCP text payloads + progressive-disclosure flags. */

export function ok(data: unknown): string {
  return JSON.stringify({ ok: true, ...(typeof data === 'object' && data && !Array.isArray(data) ? data : { data }) });
}

export function err(message: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ok: false, error: message, ...extra });
}

export interface ReplyFlags {
  detail: boolean;
  /** default 5; 0 = all */
  limit: number;
  offset: number;
  /** remaining free text after stripping flags */
  text: string;
}

/** Pull detail=1|true, limit=N, offset=N from request string. */
export function parseFlags(request: string): ReplyFlags {
  let text = request;
  let detail = false;
  let limit = 5;
  let offset = 0;

  const detailMatch = text.match(/\bdetail\s*=\s*(1|true|yes)\b/i);
  if (detailMatch) {
    detail = true;
    text = text.replace(detailMatch[0], ' ');
  }

  const limitMatch = text.match(/\blimit\s*=\s*(\d+)\b/i);
  if (limitMatch) {
    limit = Number(limitMatch[1]);
    text = text.replace(limitMatch[0], ' ');
  }

  const offsetMatch = text.match(/\boffset\s*=\s*(\d+)\b/i);
  if (offsetMatch) {
    offset = Number(offsetMatch[1]);
    text = text.replace(offsetMatch[0], ' ');
  }

  return { detail, limit, offset, text: text.replace(/\s+/g, ' ').trim() };
}

export function slicePage<T>(items: T[], limit: number, offset: number): { items: T[]; total: number; limit: number; offset: number } {
  const total = items.length;
  if (limit === 0) return { items: items.slice(offset), total, limit: 0, offset };
  return { items: items.slice(offset, offset + limit), total, limit, offset };
}
