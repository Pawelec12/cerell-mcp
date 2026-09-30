import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDeps } from './provision.js';
import { registerProvisionTools } from './provision.js';
import { registerOperateTools } from './operate.js';
import { registerOptimizeTools } from './optimize.js';
import { registerEvolveTools } from './evolve.js';
import { registerCashbackTools } from './cashback.js';

export type { ToolDeps } from './provision.js';

export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  registerProvisionTools(server, deps);
  registerOperateTools(server, deps);
  registerOptimizeTools(server, deps);
  registerEvolveTools(server, deps);
  registerCashbackTools(server, deps);
}
