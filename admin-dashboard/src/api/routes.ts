import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';
import { createHash, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { partnerStore } from '../partner-store.js';
import { commissionEngine } from '../commission-engine.js';
import { payoutManager, PayoutError, type AffiliateEvent } from '../payout-manager.js';
import { developerAnalytics, type ServiceNode } from '../developer-analytics.js';
import { partnerConfigToDynamic } from '../dynamic-partner.js';
import { MCP_DATA_DIR } from '../paths.js';
import {
  CalculateSchema,
  DevPayoutStatusSchema,
  PartnerCreateSchema,
  PartnerPayoutSchema,
  PartnerPayoutStatusSchema,
  PartnerUpdateSchema,
  SimulateSchema,
  StatusSchema,
  TestActionSchema,
} from '../schemas.js';

export const app = new Hono();

const digest = (s: string) => createHash('sha256').update(s).digest();

app.use('/api/admin/*', bearerAuth({
  verifyToken: (token) => {
    const expected = process.env.ADMIN_TOKEN;
    return !!expected && timingSafeEqual(digest(token), digest(expected));
  },
}));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof PayoutError) return c.json({ success: false, error: err.message }, err.status);
  console.error(err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

async function parseBody<T extends z.ZodTypeAny>(req: { json(): Promise<unknown> }, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest('Body must be valid JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw badRequest(`Validation failed: ${details}`);
  }
  return result.data;
}

function badRequest(error: string): HTTPException {
  return new HTTPException(400, { res: Response.json({ success: false, error }, { status: 400 }) });
}

function notFound(error: string): HTTPException {
  return new HTTPException(404, { res: Response.json({ success: false, error }, { status: 404 }) });
}

// ===== MCP server data (data/mcp, written by mcp-server) =====

async function readMcpJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(join(MCP_DATA_DIR, file), 'utf-8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw e;
  }
}

const readEvents = () => readMcpJson<AffiliateEvent[]>('events.json', []);

const DEV_ID = /^[\w-]{1,64}$/;

async function readServices(devId: string): Promise<ServiceNode[]> {
  if (!DEV_ID.test(devId)) return [];
  const graph = await readMcpJson<{ services?: Record<string, ServiceNode> }>(`${devId}.json`, {});
  return Object.values(graph.services ?? {});
}

async function requirePartner(id: string) {
  const partner = await partnerStore.getById(id);
  if (!partner) throw notFound('Partner not found');
  return partner;
}

// ===== Partner CRUD =====

app.post('/api/admin/partners', async (c) => {
  const body = await parseBody(c.req, PartnerCreateSchema);
  const created = await partnerStore.create(body);
  return c.json({ success: true, data: created }, 201);
});

app.get('/api/admin/partners', async (c) => {
  const category = c.req.query('category');
  const status = c.req.query('status');
  let partners = await partnerStore.getAll();
  if (category) partners = partners.filter((p) => p.category === category);
  if (status) partners = partners.filter((p) => p.status === status);
  return c.json({ success: true, data: partners });
});

app.get('/api/admin/partners/:id', async (c) => {
  return c.json({ success: true, data: await requirePartner(c.req.param('id')) });
});

app.put('/api/admin/partners/:id', async (c) => {
  const { id, createdAt, updatedAt, ...existing } = await requirePartner(c.req.param('id'));
  const body = await parseBody(c.req, PartnerUpdateSchema);
  const merged = PartnerCreateSchema.safeParse({ ...existing, ...body });
  if (!merged.success) throw badRequest(`Validation failed: ${merged.error.issues.map((i) => i.message).join('; ')}`);
  const updated = await partnerStore.update(id, body);
  return c.json({ success: true, data: updated });
});

app.delete('/api/admin/partners/:id', async (c) => {
  await requirePartner(c.req.param('id'));
  await partnerStore.delete(c.req.param('id'));
  return c.json({ success: true });
});

app.patch('/api/admin/partners/:id/status', async (c) => {
  await requirePartner(c.req.param('id'));
  const { status } = await parseBody(c.req, StatusSchema);
  const updated = await partnerStore.update(c.req.param('id'), { status });
  return c.json({ success: true, data: updated });
});

// ===== Commission =====

app.post('/api/admin/commissions/simulate', async (c) => {
  const body = await parseBody(c.req, SimulateSchema);
  const result = commissionEngine.simulate(body.commissionConfig, body.monthlySpend, body.months, body.devShareRate ?? 0.6);
  return c.json({ success: true, data: result });
});

app.post('/api/admin/commissions/calculate', async (c) => {
  const body = await parseBody(c.req, CalculateSchema);
  const partner = await requirePartner(body.partnerId);
  const result = commissionEngine.calculate(partner.commission, body.event, body.devShareRate ?? 0.6);
  return c.json({ success: true, data: result });
});

// ===== Finance =====

app.get('/api/admin/finance/overview', async (c) => {
  const overview = await payoutManager.getFinancialOverview(partnerStore, await readEvents());
  return c.json({ success: true, data: overview });
});

app.post('/api/admin/finance/partner-payouts', async (c) => {
  const body = await parseBody(c.req, PartnerPayoutSchema);
  await requirePartner(body.partnerId);
  const payout = await payoutManager.recordPartnerPayout(body.partnerId, body.period, body.grossAmount, body.expectedDate);
  return c.json({ success: true, data: payout }, 201);
});

app.get('/api/admin/finance/partner-payouts', async (c) => {
  const payouts = await payoutManager.getPartnerPayouts(c.req.query('partnerId'));
  return c.json({ success: true, data: payouts });
});

app.patch('/api/admin/finance/partner-payouts/:id/status', async (c) => {
  const { status } = await parseBody(c.req, PartnerPayoutStatusSchema);
  const id = c.req.param('id');
  if (status === 'confirmed') await payoutManager.confirmPartnerPayout(id);
  else await payoutManager.markPartnerPayoutReceived(id);
  return c.json({ success: true });
});

app.get('/api/admin/finance/dev-payouts', async (c) => {
  const payouts = await payoutManager.getDevPayouts(c.req.query('devId'));
  return c.json({ success: true, data: payouts });
});

app.patch('/api/admin/finance/dev-payouts/:id/status', async (c) => {
  const body = await parseBody(c.req, DevPayoutStatusSchema);
  const id = c.req.param('id');
  if (body.status === 'approved') await payoutManager.approveDevPayout(id);
  else if (body.status === 'paid') await payoutManager.markDevPayoutPaid(id);
  else await payoutManager.rejectDevPayout(id, body.rejectionReason);
  return c.json({ success: true });
});

// ===== Developers =====

app.get('/api/admin/developers', async (c) => {
  const [events, accounts, partners] = await Promise.all([
    readEvents(),
    readMcpJson<{ id: string }[]>('accounts.json', []),
    partnerStore.getAll(),
  ]);
  const devIds = [...new Set([...accounts.map((a) => a.id), ...events.map((e) => e.devId)])];
  const stats = await Promise.all(devIds.map(async (devId) =>
    developerAnalytics.aggregateDevStats(devId, events, await readServices(devId), partners),
  ));
  return c.json({ success: true, data: stats });
});

app.get('/api/admin/developers/:id', async (c) => {
  const devId = c.req.param('id');
  const [events, services, partners] = await Promise.all([readEvents(), readServices(devId), partnerStore.getAll()]);
  if (services.length === 0 && !events.some((e) => e.devId === devId)) {
    throw notFound('Developer not found or no activity');
  }
  return c.json({ success: true, data: developerAnalytics.aggregateDevStats(devId, events, services, partners) });
});

// ===== MCP Integration =====

app.get('/api/admin/partners/:id/mcp-preview', async (c) => {
  const partner = await requirePartner(c.req.param('id'));
  const dynamic = partnerConfigToDynamic(partner);
  return c.json({
    success: true,
    data: {
      id: dynamic.id,
      name: dynamic.name,
      category: dynamic.category,
      actions: dynamic.getActions(),
      upstream: partner.upstream
        ? { transport: partner.upstream.transport, note: "Full toolset is discovered from the partner's MCP server once a developer links an account" }
        : null,
      pricing: dynamic.pricing,
      documentation: partner.documentation,
      affiliateUrl: dynamic.getAffiliateSignupUrl('example-dev-id'),
    },
  });
});

app.post('/api/admin/partners/:id/test-action', async (c) => {
  const partner = await requirePartner(c.req.param('id'));
  const body = await parseBody(c.req, TestActionSchema);
  if (partner.upstream) {
    throw badRequest("This partner's actions are proxied to its own MCP server; test them through the MCP gateway with a linked account");
  }
  const dynamic = partnerConfigToDynamic(partner);
  const result = await dynamic.executeAction(body.actionName, body.params ?? {}, {
    devId: 'test-admin',
    affiliateId: dynamic.affiliateId,
  });
  return c.json({ success: true, data: result });
});
