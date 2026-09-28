import { serve } from '@hono/node-server';
import { app } from './api/routes.js';
import { partnerStore } from './partner-store.js';
import { payoutManager } from './payout-manager.js';

export async function startServer(port: number = 3001): Promise<void> {
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.length < 16) {
    throw new Error('Set ADMIN_TOKEN (min. 16 chars) — every /api/admin request must send "Authorization: Bearer <ADMIN_TOKEN>"');
  }

  // Load persistent data
  await partnerStore.load();
  await payoutManager.loadData();

  serve({ fetch: app.fetch, port }, async (info) => {
    console.log(`Admin API running on http://localhost:${info.port}`);
    const partners = await partnerStore.getAll();
    console.log(`Partners loaded: ${partners.length}`);
  });
}
