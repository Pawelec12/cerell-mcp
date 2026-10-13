import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDeps } from './deps.js';
import { registerInfraTool } from './infra.js';

export type { ToolDeps } from './deps.js';

export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  registerInfraTool(server, deps);
}
