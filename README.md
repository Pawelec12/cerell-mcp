# 🚀 Infrastructure Copilot Platform

Infrastrukturalny middleware afiliacyjny łączący programistów z dostawcami usług chmurowych i SaaS poprzez dedykowany serwer MCP (Model Context Protocol) z wbudowanym systemem cashbacku.

---

## 📁 Struktura Projektu

```text
infra-copilot-platform/
├── docs/                      # Dokumentacja architektoniczna, biznesowa i specyfikacje
│   ├── admin-dashboard-spec.md         # Specyfikacja panelu administratora (CRUD partnerów, prowizje)
│   ├── affiliate-mcp-architecture.md   # Główna architektura systemu i proxy MCP
│   ├── affiliate-mcp-costs.md          # Analiza kosztów (MVP -> Growth -> Scale) i ROI
│   ├── cashback-mcp-pivot.md           # Model biznesowy cashbacku vs darmowe tokeny
│   ├── execution-plan.md               # Plan egzekucji technicznej
│   ├── mcp-gateway-analysis.md         # Wzorzec Meta-Tool Gateway i optymalizacja kontekstu LLM
│   ├── weakest-point-fix.md            # Architektura 4 trybów (Provision -> Operate -> Optimize -> Evolve)
│   ├── task.md                         # Status wdrożonych zadań
│   └── walkthrough.md                  # Podsumowanie i instrukcja integracji MCP
│
├── mcp-server/                # Działający serwer MCP (Node.js, TypeScript, Strict mode)
│   ├── src/
│   │   ├── types.ts           # Centralny kontrakt typów (Graph, Partners, Cashback, Events)
│   │   ├── graph.ts           # Infrastructure State Graph (atomowy zapis do JSON)
│   │   ├── affiliate.ts       # Log zdarzeń afiliacyjnych + silnik cashbacku z progami (tiers)
│   │   ├── auth.ts            # Menedżer kont i integracji kluczy partnerów
│   │   ├── partners/          # Rejestr i moduły partnerów (np. Neon)
│   │   ├── tools/             # 14 narzędzi MCP w 5 trybach działania
│   │   ├── server.ts          # Konfiguracja McpServer i wstrzykiwanie zależności
│   │   └── index.ts           # Punkt wejścia (transport stdio dla Claude/Cursor)
│   ├── test/e2e.test.mjs      # Test E2E: admin API → MCP → wypłata cashbacku
│   └── dist/                  # Skompilowany kod produkcyjny
│
├── admin-dashboard/           # Headless admin API (Hono, port 3001): partnerzy, prowizje, finanse
│
└── data/                      # Wspólne dane obu serwerów (nadpisz przez INFRA_DATA_DIR)
    ├── partners/              # Partnerzy z panelu admina — MCP ładuje aktywnych na żywo
    ├── payouts/               # Wpływy od partnerów + żądania wypłat devów
    └── mcp/                   # Konta, graf usług, zdarzenia afiliacyjne
```

Partner dodany przez `POST /api/admin/partners` pojawia się w MCP bez restartu (`compare_providers`, `setup_service`). Dev zgłasza wypłatę przez narzędzie `request_payout`, admin ją zatwierdza (`PATCH /api/admin/finance/dev-payouts/:id/status`).

### Serwery MCP partnerów (upstream)

Partner może mieć pole `upstream` — jego własny serwer MCP. Gateway łączy się z nim jako klient i przekazuje wywołania `setup_service`, więc AI dalej widzi tylko nasze meta-toole. `{api_key}` zostaje podmienione na klucz dewa z `connect_account`.

```json
"upstream": { "transport": "stdio", "command": "npx", "args": ["-y", "@neondatabase/mcp-server-neon", "start", "{api_key}"], "env": {} }
"upstream": { "transport": "http", "url": "https://mcp.partner.com/mcp", "headers": { "Authorization": "Bearer {api_key}" } }
```

Przepływ: `setup_service` bez konta → link afiliacyjny; po `connect_account` → `list_actions` pokazuje pełny zestaw narzędzi partnera ze schematami → `setup_service` wywołuje je u partnera. Dozwolone polecenia stdio: `npx`, `node`, `uvx`, `docker`.

---

## ⚡ Szybki Start (MCP Server)

```bash
cd mcp-server
npm install
npm run build
npm start
npm test        # buduje oba pakiety i uruchamia test E2E
```

## ⚡ Admin API

```bash
cd admin-dashboard
npm install
npm test                                  # testy silnika prowizji
$env:ADMIN_TOKEN="min-16-znakow-sekret"   # wymagany; każdy request: Authorization: Bearer <token>
npm start                                 # → http://localhost:3001
```

### Konfiguracja w Cursor / Claude Desktop (`mcp.json`)

```json
{
  "mcpServers": {
    "infra-copilot": {
      "command": "node",
      "args": ["c:/Users/grazy/infra-copilot-platform/mcp-server/dist/index.js"]
    }
  }
}
```
