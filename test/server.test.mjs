import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, initializeStores } from '../dist/server.js';
import { registry } from '../dist/partners/base.js';

test('Cerell MCP Server initializes stores and registers all partners across infrastructure categories', async () => {
  await initializeStores('test-dev');
  const server = createServer('test-dev');
  assert.ok(server, 'Server instance should be created');

  const partners = registry.getAll();
  assert.ok(partners.length >= 4, 'Registry should have at least 4 partners registered');
  
  const partnerNames = partners.map(p => p.name.toLowerCase());
  assert.ok(partnerNames.includes('neon'), 'Neon database should be registered');
  assert.ok(partnerNames.includes('clerk'), 'Clerk auth should be registered');
  assert.ok(partnerNames.includes('upstash'), 'Upstash cache should be registered');
  assert.ok(partnerNames.includes('resend'), 'Resend email should be registered');
});
