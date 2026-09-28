#!/usr/bin/env node
// ============================================================================
// index.ts — Entry point: connects the MCP server via stdio transport
// ============================================================================

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, initializeStores, partnerLoader } from "./server.js";

async function main(): Promise<void> {
  // Initialize persistent stores (load saved state from disk)
  await initializeStores();
  partnerLoader.watch();

  // Create the MCP server with all tools registered
  const server = createServer();

  // Connect via stdio transport (for local AI assistants: Cursor, Claude Desktop, etc.)
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
