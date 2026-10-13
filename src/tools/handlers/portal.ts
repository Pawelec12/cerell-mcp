import * as crypto from 'crypto';
import type { ToolDeps } from '../deps.js';
import { ok } from '../format.js';

export async function handlePortal(_request: string, deps: ToolDeps): Promise<string> {
  const devId = deps.getDevId();
  const secret =
    process.env.DEV_SESSION_SECRET ||
    process.env.CERELL_ENCRYPTION_KEY ||
    process.env.ADMIN_TOKEN ||
    'cerell_dev_default_session_secret_2026_x87y';
  const timestamp = Date.now().toString();
  const payload = `${devId}.${timestamp}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = `${payload}.${hmac}`;
  const baseUrl = process.env.PORTAL_BASE_URL || 'http://localhost:3000';
  const link = `${baseUrl}/portal?token=${encodeURIComponent(token)}`;
  return ok({ mode: 'portal', devId, link, ttl: '1h' });
}
