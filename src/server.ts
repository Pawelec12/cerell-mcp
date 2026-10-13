// ============================================================================
// server.ts — Creates and configures the MCP server, wires all dependencies
// ============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registry } from './partners/base.js';
import { DynamicPartnerLoader } from './partners/dynamic.js';
import { graph } from './graph.js';
import { tracker, cashbackEngine } from './affiliate.js';
import { auth } from './auth.js';
import { payoutStore } from './payouts.js';
import { registerAllTools } from './tools/index.js';
import type { ToolDeps } from './tools/deps.js';

/**
 * Resolves developer identity from environment variable, CLI argument,
 * or fallback to 'local-dev'.
 */
export function resolveDevId(): string {
  if (process.env.INFRA_DEV_ID) return process.env.INFRA_DEV_ID;

  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--dev-id=')) {
      return arg.split('=')[1];
    }
    if (arg === '--dev-id' && i + 1 < process.argv.length) {
      return process.argv[i + 1];
    }
  }

  return 'local-dev';
}

/** Loads partners the admin configured in data/partners/ */
export const partnerLoader = new DynamicPartnerLoader(registry);

/**
 * Creates a fully configured MCP server with the single `infra` meta-tool.
 *
 * Architecture:
 * - One tool `infra(mode, request)` covering compare/provision/connect/status/optimize/evolve/cashback/portal
 * - Partners from data/partners/*.json (DynamicPartner); optional lazy upstream MCP proxy
 * - Affiliate events + cashback via shared stores
 */
export function createServer(overrideDevId?: string): McpServer {
  const server = new McpServer({
    name: 'cerell-mcp',
    version: '0.1.0',
  });

  const devId = overrideDevId ?? resolveDevId();

  const deps: ToolDeps = {
    getDevId: () => devId,
    graph,
    registry,
    tracker,
    cashbackEngine,
    auth,
    payouts: payoutStore,
  };

  registerAllTools(server, deps);

  return server;
}

/**
 * Initializes persistent stores by loading saved data from disk.
 * Called once at startup before the server starts handling requests.
 */
export async function initializeStores(devId?: string): Promise<void> {
  const targetDevId = devId ?? resolveDevId();
  await Promise.all([
    tracker.loadEvents(),
    auth.loadAccounts(),
    graph.load(targetDevId),
    partnerLoader.load(),
  ]);
}
