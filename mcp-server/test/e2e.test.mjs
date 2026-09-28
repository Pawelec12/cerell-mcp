// End-to-end: admin API adds a partner -> MCP server exposes it -> dev earns + requests cashback
// -> admin approves the payout. Runs on a throwaway data dir. Requires both packages built.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const dataDir = await mkdtemp(join(tmpdir(), 'infra-e2e-'));
process.env.INFRA_DATA_DIR = dataDir;
process.env.ADMIN_TOKEN = 'e2e-test-token-0123456789';

const { app } = await import('../../admin-dashboard/dist/api/routes.js');
const { partnerStore } = await import('../../admin-dashboard/dist/partner-store.js');
const { createServer, initializeStores, partnerLoader } = await import('../dist/server.js');
const { upstreamPool } = await import('../dist/upstream.js');

const auth = { Authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };
const admin = async (method, path, body) => {
  const res = await app.request(path, { method, headers: auth, body: body && JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};

const partnerInput = {
  name: 'Resend',
  website: 'https://resend.com',
  category: 'email',
  description: 'Email API for developers',
  logoUrl: '',
  status: 'active',
  affiliateId: 'ref_RESEND',
  signupUrlTemplate: 'https://resend.com/signup?ref={affiliate_id}&sub_id={dev_id}',
  trackingCookieDays: 30,
  partnerDashboardUrl: '',
  partnerContactEmail: 'partners@resend.com',
  commission: {
    type: 'hybrid',
    signupBonus: 10,
    revenueShare: { rate: 0.15, basis: 'monthly_spend', durationMonths: 12, minPayout: 0 },
    minPayout: 25,
  },
  payoutCycle: 'monthly',
  tools: [{
    name: 'create_domain',
    description: 'Register a sending domain',
    params: [{ name: 'domain', type: 'string', description: 'Domain name', required: true }],
    returns: {
      envVarTemplates: { RESEND_FROM: 'noreply@{domain}' },
      mockData: { verified: false },
      successMessage: 'Domain {domain} added',
    },
  }],
  pricing: [{ name: 'Free', monthlyPrice: 0, features: [] }, { name: 'Pro', monthlyPrice: 100, features: [] }],
  documentation: [],
};

const client = new Client({ name: 'e2e', version: '0.0.0' });
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { text: res.content[0].text, isError: res.isError === true };
};

after(async () => {
  await upstreamPool.closeAll();
  await client.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('admin API rejects missing token and invalid partners', async () => {
  const noAuth = await app.request('/api/admin/partners');
  assert.equal(noAuth.status, 401);

  const bad = await admin('POST', '/api/admin/partners', { ...partnerInput, commission: { type: 'hybrid' } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /commission/);
});

test('partner added in admin is usable through MCP, cashback can be requested and paid', async () => {
  await partnerStore.load();
  const created = await admin('POST', '/api/admin/partners', partnerInput);
  assert.equal(created.status, 201);
  const partnerId = created.json.data.id;

  await initializeStores();
  const server = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === 'request_payout'));

  const compare = JSON.parse((await call('compare_providers', { category: 'email' })).text);
  assert.equal(compare.recommendations[0].provider, partnerId);
  assert.equal(compare.recommendations[0].name, 'Resend');

  const unlinked = JSON.parse((await call('setup_service', { provider: partnerId, action: 'create_domain' })).text);
  assert.equal(unlinked.status, 'account_required');
  assert.equal(unlinked.signupUrl, 'https://resend.com/signup?ref=ref_RESEND&sub_id=local-dev');

  // Pro = $100/mo: 15% rev share + $10 bonus = $25 commission, 60% dev share at $100 spend = $15
  await call('connect_account', { provider: partnerId, api_key: 'rk_test', plan: 'Pro' });
  await call('connect_account', { provider: partnerId, api_key: 'rk_test', plan: 'Pro' }); // re-link: no extra cashback

  const missing = JSON.parse((await call('setup_service', { provider: partnerId, action: 'create_domain' })).text);
  assert.equal(missing.status, 'error');
  const setup = JSON.parse((await call('setup_service', {
    provider: partnerId, action: 'create_domain', config: JSON.stringify({ domain: 'acme.dev' }),
  })).text);
  assert.equal(setup.status, 'success');
  assert.deepEqual(setup.envVars, { RESEND_FROM: 'noreply@acme.dev' });

  assert.match((await call('check_cashback')).text, /Available Balance:\*\* \$15\.00/);
  assert.equal((await call('request_payout', { amount: 5, method: 'paypal' })).isError, true);
  assert.equal((await call('request_payout', { amount: 16, method: 'paypal' })).isError, true);
  assert.equal((await call('request_payout', { amount: 12, method: 'paypal' })).isError, false);
  assert.match((await call('check_cashback')).text, /Available Balance:\*\* \$3\.00/);

  const payouts = await admin('GET', '/api/admin/finance/dev-payouts?devId=local-dev');
  assert.equal(payouts.json.data.length, 1);
  const payoutId = payouts.json.data[0].id;
  assert.equal((await admin('PATCH', `/api/admin/finance/dev-payouts/${payoutId}/status`, { status: 'paid' })).status, 409);
  assert.equal((await admin('PATCH', `/api/admin/finance/dev-payouts/${payoutId}/status`, { status: 'approved' })).status, 200);
  assert.equal((await admin('PATCH', `/api/admin/finance/dev-payouts/${payoutId}/status`, { status: 'paid' })).status, 200);
  assert.match((await call('check_cashback')).text, /paypal — \*\*paid\*\*/);

  const dev = await admin('GET', '/api/admin/developers/local-dev');
  assert.equal(dev.status, 200);
  const resend = dev.json.data.partnerBreakdown.find((p) => p.partnerId === partnerId);
  assert.equal(resend.partnerName, 'Resend');
  assert.equal(resend.monthlySpend, 100);
  assert.equal(resend.cashbackEarned, 15);

  const overview = await admin('GET', '/api/admin/finance/overview');
  assert.equal(overview.json.data.grossRevenue, 25);
  assert.equal(overview.json.data.pendingDevPayouts, 0);
});

test('deactivating a partner in admin removes it from MCP without restart', async () => {
  const watcher = partnerLoader.watch();
  const [{ id }] = (await admin('GET', '/api/admin/partners')).json.data;
  await admin('PATCH', `/api/admin/partners/${id}/status`, { status: 'inactive' });
  await new Promise((r) => setTimeout(r, 800));
  watcher.close();

  assert.match((await call('compare_providers', { category: 'email' })).text, /No providers found/);
});

test("partner's own MCP server is proxied through the gateway with the dev's API key", async () => {
  const fixture = fileURLToPath(new URL('./fixtures/fake-partner-mcp.mjs', import.meta.url));
  const upstreamPartner = {
    ...partnerInput,
    name: 'Acme DB',
    category: 'auth',
    affiliateId: 'ref_ACME',
    signupUrlTemplate: 'https://acme.dev/signup?ref={affiliate_id}&sub_id={dev_id}',
    tools: [],
    upstream: { transport: 'stdio', command: 'node', args: [fixture], env: { FAKE_API_KEY: '{api_key}' } },
  };

  const noTools = await admin('POST', '/api/admin/partners', { ...upstreamPartner, upstream: undefined });
  assert.equal(noTools.status, 400);
  const badCommand = await admin('POST', '/api/admin/partners', { ...upstreamPartner, upstream: { ...upstreamPartner.upstream, command: 'powershell' } });
  assert.equal(badCommand.status, 400);

  const created = await admin('POST', '/api/admin/partners', upstreamPartner);
  assert.equal(created.status, 201);
  const id = created.json.data.id;
  await partnerLoader.load();

  const before = JSON.parse((await call('list_actions', { provider: id })).text);
  assert.deepEqual(before.actions, []);
  assert.match(before.note, /not linked/);
  assert.equal(JSON.parse((await call('setup_service', { provider: id, action: 'create_database' })).text).status, 'account_required');

  await call('connect_account', { provider: id, api_key: 'good-key', plan: 'Free' });

  const after = JSON.parse((await call('list_actions', { provider: id })).text);
  assert.deepEqual(after.actions.map((a) => a.name).sort(), ['create_database', 'list_projects']);
  assert.ok(after.actions.find((a) => a.name === 'create_database').inputSchema.properties.name);

  const ok = JSON.parse((await call('setup_service', { provider: id, action: 'create_database', config: JSON.stringify({ name: 'app' }) })).text);
  assert.equal(ok.status, 'success');
  assert.equal(ok.message, 'Created app in eu-central-1');

  const unknown = JSON.parse((await call('setup_service', { provider: id, action: 'drop_everything' })).text);
  assert.equal(unknown.status, 'error');
  assert.match(unknown.message, /create_database/);

  // Re-linking with another key opens a new session that the partner rejects
  await call('connect_account', { provider: id, api_key: 'bad-key', plan: 'Free' });
  const denied = JSON.parse((await call('setup_service', { provider: id, action: 'create_database', config: JSON.stringify({ name: 'app' }) })).text);
  assert.equal(denied.status, 'error');
  assert.equal(denied.message, 'invalid api key');
});

test("remote (HTTP) partner MCP server receives the dev's API key as a header", async () => {
  const { createServer: createHttpServer } = await import('node:http');
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');

  const http = createHttpServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer remote-key') {
      res.writeHead(401).end();
      return;
    }
    const mcp = new McpServer({ name: 'remote-partner', version: '1.0.0' });
    mcp.tool('deploy', 'Deploy app', {}, async () => ({ content: [{ type: 'text', text: 'deployed' }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));

  try {
    const created = await admin('POST', '/api/admin/partners', {
      ...partnerInput,
      name: 'Remote Host',
      category: 'hosting',
      tools: [],
      upstream: {
        transport: 'http',
        url: `http://127.0.0.1:${http.address().port}/mcp`,
        headers: { Authorization: 'Bearer {api_key}' },
      },
    });
    assert.equal(created.status, 201);
    const id = created.json.data.id;
    await partnerLoader.load();
    await call('connect_account', { provider: id, api_key: 'remote-key', plan: 'Free' });

    const res = JSON.parse((await call('setup_service', { provider: id, action: 'deploy' })).text);
    assert.equal(res.status, 'success');
    assert.equal(res.message, 'deployed');
  } finally {
    await upstreamPool.closeAll();
    http.close();
  }
});

test('gateway refuses stdio commands outside the allowlist even if a config file bypasses the admin API', async () => {
  const { writeFile } = await import('node:fs/promises');
  const id = 'tampered-partner';
  await writeFile(join(dataDir, 'partners', `${id}.json`), JSON.stringify({
    ...partnerInput, id, name: 'Tampered', category: 'queue', tools: [],
    upstream: { transport: 'stdio', command: 'powershell', args: ['-c', 'echo pwned'], env: {} },
  }));
  await partnerLoader.load();
  await call('connect_account', { provider: id, api_key: 'k', plan: 'Free' });

  const res = JSON.parse((await call('setup_service', { provider: id, action: 'anything' })).text);
  assert.equal(res.status, 'error');
  assert.match(res.message, /not allowed/);
});
