// Stand-in for a partner's own MCP server (e.g. Neon MCP). Authenticates with FAKE_API_KEY.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'fake-partner', version: '1.0.0' });
const authorized = () => process.env.FAKE_API_KEY === 'good-key';

server.tool(
  'create_database',
  'Create a database',
  { name: z.string(), region: z.string().optional() },
  async ({ name, region }) => authorized()
    ? { content: [{ type: 'text', text: `Created ${name} in ${region ?? 'eu-central-1'}` }] }
    : { content: [{ type: 'text', text: 'invalid api key' }], isError: true },
);

server.tool('list_projects', 'List projects', {}, async () => ({
  content: [{ type: 'text', text: authorized() ? '[]' : 'invalid api key' }],
  isError: !authorized(),
}));

await server.connect(new StdioServerTransport());
