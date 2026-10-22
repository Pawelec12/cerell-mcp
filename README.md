# Cerell MCP — Infrastructure Copilot & Developer Cashback

[![MCP Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-8A2BE2.svg)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Website](https://img.shields.io/badge/Website-cerell.eu-000000.svg)](https://cerell.eu)
[![smithery badge](https://smithery.ai/badge/apptent/cerell)](https://smithery.ai/servers/apptent/cerell)


## Mission

The decision about which database, hosting provider, or auth service goes into a project no longer happens in a browser tab -- it happens inside an AI coding agent. Cerell is built for that moment.

We are a **performance acquisition channel** that lives inside the AI coding workflow. Developers get LLM token subsidies and a curated set of pre-wired integrations. SaaS partners pay only when their product is actually implemented in a developer's repository -- not for impressions, not for signups, not for blind credits.

The conversion event is the **install in the repo**, after explicit developer consent. That is the unit everything else is priced around.

## Agenda

- **Close the gap between AI suggestion and real adoption.** MCP registries offer discovery; Cerell adds distribution, attribution, and economics.
- **Make infrastructure decisions transparent.** Every partner suggestion is labeled. Alternatives are always shown. Nothing is installed without the developer accepting.
- **Align incentives across the stack.** Partners pay for activated integrations. Developers earn back a share of what they spend on cloud. The platform takes a margin only when value is delivered.
- **Stay editor-agnostic.** Cursor, Claude Desktop, Windsurf, VS Code -- the same `infra` tool works everywhere, keeping the acquisition channel neutral and trustworthy for partners who do not want to depend on a single IDE vendor.
- **Grow the catalog without growing complexity.** Partners are added as JSON files in `data/partners/`. The MCP tool surface stays constant -- one tool, every category.

---

Local **stdio** meta-tool gateway for Cursor, Claude Desktop, Windsurf, and VS Code.

One tool — `infra(mode, request)` — covers compare → provision → connect → operate/optimize/evolve → cashback, while keeping affiliate signup links in the path.

---

## Quickstart

```bash
git clone https://github.com/Pawelec12/cerell-mcp.git
cd cerell-mcp
npm install
npm run build
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "cerell": {
      "command": "node",
      "args": ["C:/path/to/cerell-mcp/dist/index.js"]
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "cerell": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/cerell-mcp/dist/index.js"]
    }
  }
}
```

---

## Tool: `infra`

| Arg | Meaning |
|-----|---------|
| `mode` | `compare` \| `provision` \| `connect` \| `disconnect` \| `status` \| `optimize` \| `evolve` \| `cashback` \| `portal` |
| `request` | Free text / tokens. Flags: `detail=1`, `limit=5` (use `limit=0` for all), `offset=N` |

Replies are **compact JSON** by default (`{"ok":true,...}`). Add `detail=1` for full pricing, actions, docs, migration steps.

### Examples

```text
mode=compare   request="database postgres"
mode=compare   request="auth detail=1 limit=10"
mode=provision request="neon"
mode=connect   request="neon api_key=YOUR_KEY plan=Launch"
mode=provision request="neon create_database name=app region=aws-eu-central-1"
mode=status    request=""
mode=optimize  request=""
mode=evolve    request="from=neon to=supabase detail=1"
mode=cashback  request=""
mode=cashback  request="amount=25 method=revolut revtag=@you"
mode=portal    request=""
```

Flow after you pick a partner: **signup (affiliate URL) → connect API key → provision action → cashback tracking**.

Partner upstream MCPs (optional `upstream` in partner JSON) start **lazily** only when linked and an action needs them (max 3 live connections, LRU).

---

## Partners

Configured in `data/partners/*.json` (Neon, Clerk, Upstash, Resend, Vercel, …). Catalog size does not grow the MCP tool list.

---

## Publish on Smithery (local / MCPB)

Do **not** paste the GitHub URL into Smithery’s “MCP Server URL” field. Cerell is stdio-local.

```bash
npm run pack:mcpb
# → cerell.mcpb

npx @smithery/cli mcp publish ./cerell.mcpb -n apptent/cerell
```

That matches Smithery’s **Local (MCPB Bundle)** flow: users download the bundle and run it on their machine.

## Dev

```bash
npm run build
npm test
npm run pack:mcpb
npm run inspector
```

---

## License

MIT © [Pawelec12](https://github.com/Pawelec12) · [cerell.eu](https://cerell.eu)
