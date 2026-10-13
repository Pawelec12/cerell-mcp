import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, initializeStores } from '../dist/server.js';
import { registry } from '../dist/partners/base.js';
import { handleCompare } from '../dist/tools/handlers/compare.js';
import { tracker, cashbackEngine } from '../dist/affiliate.js';
import { auth } from '../dist/auth.js';
import { graph } from '../dist/graph.js';
import { payoutStore } from '../dist/payouts.js';

test('Cerell MCP initializes and loads partners from JSON', async () => {
  await initializeStores('test-dev');
  const server = createServer('test-dev');
  assert.ok(server, 'Server instance should be created');

  const partners = registry.getAll();
  assert.ok(partners.length >= 4, 'Registry should have at least 4 partners registered');

  const partnerNames = partners.map((p) => p.name.toLowerCase());
  assert.ok(partnerNames.includes('neon'), 'Neon database should be registered');
  assert.ok(partnerNames.includes('clerk'), 'Clerk auth should be registered');
  assert.ok(partnerNames.includes('upstash'), 'Upstash cache should be registered');
  assert.ok(partnerNames.includes('resend'), 'Resend email should be registered');
  assert.ok(registry.get('neon'), 'Neon id should be neon');
});

test('compare default reply stays compact (top-N + ok JSON)', async () => {
  await initializeStores('test-dev');
  const deps = {
    getDevId: () => 'test-dev',
    graph,
    registry,
    tracker,
    cashbackEngine,
    auth,
    payouts: payoutStore,
  };
  const text = await handleCompare('database', deps);
  const parsed = JSON.parse(text);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.results.length <= 5);
  assert.ok(text.length < 2000, `compare reply too large: ${text.length} chars`);
  assert.ok(!('desc' in (parsed.results[0] ?? {})), 'detail fields absent by default');
});

test('compare detail=1 restores depth', async () => {
  await initializeStores('test-dev');
  const deps = {
    getDevId: () => 'test-dev',
    graph,
    registry,
    tracker,
    cashbackEngine,
    auth,
    payouts: payoutStore,
  };
  const text = await handleCompare('database detail=1', deps);
  const parsed = JSON.parse(text);
  assert.equal(parsed.ok, true);
  if (parsed.results[0]) {
    assert.ok('desc' in parsed.results[0] || 'pricing' in parsed.results[0]);
  }
});
