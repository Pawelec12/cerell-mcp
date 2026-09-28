// ============================================================================
// server.ts — Creates and configures the MCP server, wires all dependencies
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registry } from "./partners/base.js";
import { DynamicPartnerLoader } from "./partners/dynamic.js";
import { graph } from "./graph.js";
import { tracker, cashbackEngine } from "./affiliate.js";
import { auth } from "./auth.js";
import { payoutStore } from "./payouts.js";
import { registerAllTools } from "./tools/index.js";
import type { ToolDeps } from "./tools/provision.js";

// Side-effect import: registers Neon partner into the registry
import "./partners/neon.js";

/** Default dev ID for local/stdio usage (MVP — no real auth) */
const DEFAULT_DEV_ID = process.env.INFRA_DEV_ID ?? "local-dev";

/** Loads partners the admin configured in data/partners/ */
export const partnerLoader = new DynamicPartnerLoader(registry);

/**
 * Creates a fully configured MCP server with all tools registered.
 *
 * Architecture:
 * - Meta-tool gateway: 15 tools across 5 modes (Provision, Operate, Optimize, Evolve, Cashback)
 * - Each tool delegates to partner modules via the PartnerRegistry
 *   (built-in code partners + admin-configured DynamicPartners)
 * - State is tracked in the InfraStateGraph
 * - Affiliate events are logged to the AffiliateTracker
 * - Cashback is calculated by the CashbackEngine; payout requests go to the shared DevPayoutStore
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "infra-copilot",
    version: "0.1.0",
  });

  // Wire dependencies — all modules are singletons
  const deps: ToolDeps = {
    getDevId: () => DEFAULT_DEV_ID,
    graph,
    registry,
    tracker,
    cashbackEngine,
    auth,
    payouts: payoutStore,
  };

  // Register all tools across all 5 modes
  registerAllTools(server, deps);

  return server;
}

/**
 * Initializes persistent stores by loading saved data from disk.
 * Called once at startup before the server starts handling requests.
 */
export async function initializeStores(): Promise<void> {
  await Promise.all([
    tracker.loadEvents(),
    auth.loadAccounts(),
    graph.load(DEFAULT_DEV_ID),
    partnerLoader.load(),
  ]);
}
