# Cerell MCP — Infrastructure Copilot & Developer Cashback

[![MCP Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-8A2BE2.svg)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Website](https://img.shields.io/badge/Website-cerell.eu-000000.svg)](https://cerell.eu)

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

## Dev

```bash
npm run build
npm test
npm run inspector
```

---

## License

MIT © [Pawelec12](https://github.com/Pawelec12) · [cerell.eu](https://cerell.eu)
