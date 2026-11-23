/**
 * Compact verification for workflow-triggered pickup.
 * Run: node mcp-server/test-workflow.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, initializeStores } from './dist/server.js';
import { matchPartners, matchPartnersForCapability } from './dist/tools/parse.js';
import { handleResolveStackNeed } from './dist/tools/resolve.js';
import { handleCompare } from './dist/tools/handlers/compare.js';
import { registry } from './dist/partners/base.js';
import {
  hasRecentCheck,
  recordNudge,
  recordStackCheck,
  wasNudged,
} from './dist/recent-checks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(__dirname, 'dist', 'cli', 'hook.js');

await initializeStores();

const deps = {
  getDevId: () => 'test@cerell.dev',
  graph: {
    getAllServices: async () => [],
    getService: async () => null,
    getConnections: async () => [],
  },
  registry,
  tracker: {},
  cashbackEngine: {},
  auth: { isLinked: async () => false, getLinkedAccount: async () => null },
  payouts: {},
};

function ids(partners) {
  return partners.map((p) => p.id);
}

function spawnHook(cmd) {
  const res = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ command: cmd, workspace_roots: [process.cwd()] }),
    encoding: 'utf8',
    env: process.env,
  });
  let body = {};
  try {
    body = JSON.parse(res.stdout || '{}');
  } catch {
    body = {};
  }
  const denied =
    body.permission === 'deny' ||
    body.permissionDecision === 'deny' ||
    res.status === 2;
  return {
    denied,
    reason: body.reason || body.permissionDecisionReason || res.stderr || '',
    status: res.status,
  };
}

// --- Intent / fit matching ---
{
  const moon = matchPartners('accept recurring subscriptions', registry);
  assert.ok(ids(moon).includes('moonclerk'), `expected moonclerk in ${ids(moon)}`);
  assert.equal(
    matchPartnersForCapability('payments', registry, 'accept recurring subscriptions')[0]?.id,
    'moonclerk',
  );
}

{
  const draw = matchPartners('setup postgres schema', registry);
  assert.ok(ids(draw).includes('drawsql'), `expected drawsql in ${ids(draw)}`);
  assert.equal(
    matchPartnersForCapability('database', registry, 'setup postgres schema')[0]?.id,
    'drawsql',
  );
}

{
  const vultr = matchPartners('deploy docker backend', registry);
  assert.ok(ids(vultr).includes('vultr'), `expected vultr in ${ids(vultr)}`);
}

{
  const fabricHits = matchPartners('s3 avatar upload', registry);
  assert.ok(!ids(fabricHits).includes('fabric'), `fabric must not match s3 avatar: ${ids(fabricHits)}`);
}

{
  const mon = matchPartners('sentry crash logs', registry);
  assert.ok(!ids(mon).includes('chatbakers'), `chatbakers must not match sentry crash: ${ids(mon)}`);
}

// --- resolve_stack_need matches clerk for auth (published catalog) ---
{
  const raw = await handleResolveStackNeed(
    { goal: 'setup auth', capabilities: ['auth'] },
    deps,
  );
  const body = JSON.parse(raw);
  assert.equal(body.ok, true);
  assert.ok(body.matched.some((m) => m.id === 'clerk-auth-partner' || m.category === 'auth'));
  assert.match(body.instruction, /Present concise option/i);
}

// --- silent pass-through for unknown capability ---
{
  const raw = await handleResolveStackNeed(
    { goal: 'add holographic UI', capabilities: ['holographic-ui'] },
    deps,
  );
  const body = JSON.parse(raw);
  assert.equal(body.ok, true);
  assert.deepEqual(body.matched, []);
  assert.ok(body.unmatched.includes('holographic-ui'));
  assert.match(body.instruction, /Do NOT mention Cerell/i);
}

// --- payments resolve returns moonclerk ---
{
  const raw = await handleResolveStackNeed(
    { goal: 'accept recurring subscriptions', capabilities: ['payments'] },
    deps,
  );
  const body = JSON.parse(raw);
  assert.equal(body.ok, true);
  assert.ok(body.matched.some((m) => m.id === 'moonclerk'));
  assert.match(body.instruction, /Present concise option/i);
}

// --- compare silent empty ---
{
  const empty = await handleCompare('xyzzyflubber quuxzorp', deps);
  const emptyBody = JSON.parse(empty);
  assert.equal(emptyBody.ok, true);
  assert.equal(emptyBody.total, 0);
  assert.equal(emptyBody.fallback, 'proceed_standard');
  assert.ok(!emptyBody.error);
}

// --- server boots ---
{
  assert.ok(createServer('test@cerell.dev'));
}

// --- hook state machine ---
{
  const repoKey = process.cwd();
  const pkg = 'stripe';

  // Ensure a cold deny path: if already nudged from prior runs, clear by using
  // a unique package that maps to payments — lemon squeezy scoped name
  const coldPkgCmd = 'npm install @lemonsqueezy/lemonsqueezy.js';
  const coldPkg = '@lemonsqueezy/lemonsqueezy.js';

  // First cold install should deny (payments covered by moonclerk, no recent check)
  // unless already nudged in this TTL window from a previous test run
  if (!wasNudged({ repoKey, pkg: coldPkg }) && !hasRecentCheck({ repoKey, capability: 'payments' })) {
    const first = spawnHook(coldPkgCmd);
    assert.equal(first.denied, true, 'cold lemon install should deny once');
    assert.match(first.reason, /resolve_stack_need/i);
  }

  recordNudge({ repoKey, pkg: coldPkg });
  const second = spawnHook(coldPkgCmd);
  assert.equal(second.denied, false, 'second lemon install must allow after nudge');

  recordStackCheck({ repoKey, capabilities: ['payments'], source: 'test' });
  assert.equal(hasRecentCheck({ repoKey, capability: 'payments' }), true);
  const third = spawnHook('npm install stripe');
  assert.equal(third.denied, false, 'stripe allow after recent payments check');
  void pkg;
}

console.log('test-workflow: all assertions passed');
