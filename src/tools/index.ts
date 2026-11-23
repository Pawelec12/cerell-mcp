import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDeps } from './deps.js';
import { registerInfraTool } from './infra.js';
import { registerResolveTool } from './resolve.js';

export type { ToolDeps } from './deps.js';

export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  registerResolveTool(server, deps);
  registerInfraTool(server, deps);
}
