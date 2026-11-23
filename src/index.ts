#!/usr/bin/env node
// ============================================================================
// index.ts — Entry: CLI (init|hook) or MCP stdio server
// ============================================================================

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, initializeStores, partnerLoader } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'init') {
    const { runInit } = await import('./cli/init.js');
    runInit(args.slice(1));
    return;
  }
  if (cmd === 'hook') {
    const { runHook } = await import('./cli/hook.js');
    await runHook();
    return;
  }
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(`Cerell MCP

Usage:
  npx -y @cerell/mcp                         Start MCP server (stdio)
  npx -y @cerell/mcp init --dev-id=you@x.com Install MCP + rules + hooks
  npx -y @cerell/mcp hook                    Agent package-install gate (stdin JSON)

Init flags:
  --dev-id=<email>   Developer wallet id
  --global           Prefer user-home MCP configs where supported
  --host=<id>        Only one host: cursor|claude-code|codex|copilot|vscode|windsurf|antigravity|cline
`);
    return;
  }

  await initializeStores();
  partnerLoader.watch();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
