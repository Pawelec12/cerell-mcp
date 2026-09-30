# ⚡ Cerell MCP — Infrastructure Copilot & Developer Cashback Server

[![MCP Protocol](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-8A2BE2.svg)](https://modelcontextprotocol.io)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Website](https://img.shields.io/badge/Website-cerell.eu-000000.svg)](https://cerell.eu)

**Cerell MCP** is an open-source Infrastructure Copilot and meta-tool gateway designed for **Claude Desktop, Cursor, Windsurf, Antigravity, and VS Code**.

It equips your AI coding agent with the tools to **detect, compare, provision, operate, optimize, and migrate** software infrastructure (Databases, Auth, Queues, Email, Storage, Monitoring, Payments) — while **earning developer cashback** on the services you already pay for.

---

## 💡 Why Cerell? The Solo-Dev Manifesto

SaaS and cloud corporations spend hundreds of dollars in advertising and DevRel just to acquire a single software engineer (**Customer Acquisition Cost / CAC**). We integrate their SDKs into client apps, build enterprise value, and receive nothing in return except monthly subscription invoices.

**Cerell flips this corporate game:**
- 💸 **Corporate CAC -> Your Wallet**: Instead of letting ad platforms pocket acquisition budgets, Cerell redirects partner commissions back to the developers who write the code.
- 🤝 **Solo-Dev Takes 0% Profit**: 100% open-source solo project built by [@tirriani](https://instagram.com/tirriani). Zero markup, zero rent-seeking.
- 🎯 **The Ultimate Goal**: Aggregate our collective developer leverage until every engineer using this MCP server receives **100% free AI & developer API tokens**, fully subsidized by infrastructure sponsors.

> ☕ If Cerell helps your workflow or saves you money, consider [buying me a coffee](https://buymeacoffee.com/pawelec12) or connecting on Instagram [@tirriani](https://instagram.com/tirriani).

---

## ⚡ Quickstart

### 1. Clone & Build

```bash
git clone https://github.com/Pawelec12/cerell-mcp.git
cd cerell-mcp
npm install
npm run build
```

This compiles TypeScript into the `dist/` directory and prepares the stdio MCP server.

---

### 2. Configure Your AI Client

#### 🟣 Claude Desktop

Add this to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

#### ⚡ Cursor

Open **Cursor Settings** -> **Features** -> **MCP**, click **Add New MCP Server**:
- **Name**: `cerell`
- **Type**: `stdio`
- **Command**: `node /ABSOLUTE/PATH/TO/cerell-mcp/dist/index.js`

Or add directly to `.cursor/mcp.json` in your workspace:

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

#### 🌊 Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

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

> **Windows Tip**: Use forward slashes in path arguments, e.g.:
> `"args": ["C:/Projects/cerell-mcp/dist/index.js"]`

---

## 🧰 16 Tools Across 5 Modes

Cerell organizes your entire infrastructure lifecycle into 5 distinct operational modes:

```
PROVISION  ──►  OPERATE  ──►  OPTIMIZE  ──►  EVOLVE
    │              │              │             │
    └──────────────┴──────────────┴─────────────┴──►  CASHBACK
```

### 1. 🚀 Provision (Discovery & Setup)
| Tool | Description |
|---|---|
| `detect_project_stack` | Scans `package.json`, Dockerfiles, and repo to inspect current dependencies. |
| `compare_providers` | Compares cost, features, SLAs, and DX between providers (e.g. Neon vs Supabase). |
| `recommend_stack` | Recommends an optimal architecture stack for your workload (MVP, High-Traffic, B2B). |
| `setup_service` | Provisions a new database, auth provider, or queue via direct partner action or upstream MCP. |
| `list_actions` | Discovers available actions for a specific provider. |

### 2. 🛠️ Operate (Maintenance & Security)
| Tool | Description |
|---|---|
| `health_check` | Pings infrastructure endpoints and verifies uptime, latency, and status. |
| `manage_keys` | Lists active integration credentials and environment variables. |
| `rotate_key` | Rotates API tokens and updates local `.env` securely. |
| `connect_account` | Links a developer account to a partner provider to enable full API actions. |

### 3. 📈 Optimize (Costs & Efficiency)
| Tool | Description |
|---|---|
| `audit_costs` | Analyzes provisioned infrastructure and estimates monthly operational run-rate. |
| `detect_anomalies` | Highlights underutilized resources, idle instances, and over-provisioned tiers. |
| `recommend_tier` | Recommends downgrade or upgrade paths based on real traffic profiles. |

### 4. 🔄 Evolve (Migrations & Growth)
| Tool | Description |
|---|---|
| `plan_migration` | Generates a step-by-step zero-downtime migration runbook between providers. |
| `estimate_migration_impact` | Calculates downtime risk, breaking schema changes, and engineering hours. |

### 5. 💰 Cashback (Wallet & Payouts)
| Tool | Description |
|---|---|
| `view_cashback_dashboard` | Displays earned cashback balance, pending payouts, and transaction history. |
| `estimate_cashback` | Computes prospective cashback for an infrastructure tool over 12 months. |
| `request_payout` | Submits a payout request (PayPal, IBAN, Crypto, or GitHub Sponsors). |

---

## 🌐 Pre-Configured Partners & Upstream Proxies

Cerell ships with built-in integrations and dynamic configurations for industry-standard developer platforms:

- 🐘 **Database**: [Neon](https://neon.tech) (Serverless Postgres with instant branching)
- 🔐 **Auth**: [Clerk](https://clerk.com) (Modern authentication & user management)
- ⚡ **Cache & Queues**: [Upstash](https://upstash.com) (Serverless Redis & QStash)
- ✉️ **Email**: [Resend](https://resend.com) (Developer-first transactional email API)
- ☁️ **Hosting**: [Vercel](https://vercel.com) (Edge hosting & frontend cloud)

### Upstream MCP Proxying

If a partner provides their own native MCP server, Cerell acts as a secure client proxy. The AI assistant talks to Cerell's unified tools, and Cerell forwards calls to the partner's stdio or HTTP MCP server while injecting your credentials server-side.

---

## 🧪 Testing & MCP Inspector

You can inspect and manually test all tools using the official MCP Inspector:

```bash
npm run inspector
```

To run the automated suite:

```bash
npm test
```

---

## 🇵🇱 Szybki Start po polsku

1. **Pobierz i zbuduj projekt**:
   ```bash
   git clone https://github.com/Pawelec12/cerell-mcp.git
   cd cerell-mcp
   npm install
   npm run build
   ```
2. **Dodaj serwer do Claude Desktop lub Cursor**:
   W pliku `claude_desktop_config.json` lub w ustawieniach Cursor (Features -> MCP):
   ```json
   {
     "mcpServers": {
       "cerell": {
         "command": "node",
         "args": ["C:/ścieżka/do/cerell-mcp/dist/index.js"]
       }
     }
   }
   ```
3. **Używaj w czacie z AI**:
   Zapytaj swojego asystenta: *"Sprawdź mój stack przez Cerell MCP i porównaj opcje bazodanowe dla Next.js"* albo *"Ile cashbacku otrzymam za wdrożenie Neon i Clerk?"*.

---

## 📄 License

MIT © [Pawelec12](https://github.com/Pawelec12) · [cerell.eu](https://cerell.eu)
