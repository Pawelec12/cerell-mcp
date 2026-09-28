# Tasks — Infra Copilot Platform

## Faza 1: Fundament MCP Server
- [x] package.json — dependencies
- [x] tsconfig.json — TypeScript strict config
- [x] src/types.ts — all shared types (contract)
- [x] src/partners/base.ts — BasePartner + PartnerRegistry
- [x] src/partners/neon.ts — Neon partner module (stubbed API)
- [x] src/graph.ts — Infrastructure State Graph (JSON persistence)
- [x] src/affiliate.ts — AffiliateTracker + CashbackEngine
- [x] src/auth.ts — AuthManager (simplified MVP)

## Faza 2: Narzędzia MCP (Meta-Tool Gateway)
- [x] src/tools/provision.ts — compare_providers, setup_service, connect_account
- [x] src/tools/operate.ts — infra_status, debug_connection, health_check
- [x] src/tools/optimize.ts — analyze_costs, suggest_optimization, recommend_upgrade
- [x] src/tools/evolve.ts — plan_migration, scale_assessment
- [x] src/tools/cashback.ts — check_cashback, spend_summary, cashback_history, request_payout
- [x] src/tools/index.ts — registerAllTools aggregator
- [x] src/server.ts — McpServer creation + dependency injection
- [x] src/index.ts — Entry point (stdio transport)

## Faza 3: Logika Biznesowa Admin Dashboardu (Headless API)
- [x] admin-dashboard/src/types.ts — modele prowizji (rev-share, one-time, hybrid, tiered), definicje tooli MCP, payouty
- [x] admin-dashboard/src/commission-engine.ts — czysty silnik obliczeniowy + symulator
- [x] admin-dashboard/src/partner-store.ts — CRUD partnerów z atomowym zapisem do JSON
- [x] admin-dashboard/src/payout-manager.ts — ewidencja wpływów od partnerów i wypłat devów
- [x] admin-dashboard/src/developer-analytics.ts — agregacja LTV, ARPU, churn rate
- [x] admin-dashboard/src/schemas.ts — ścisła walidacja Zod dla endpointów
- [x] admin-dashboard/src/api/routes.ts — 16 endpointów REST API (Hono) + uwierzytelnianie ADMIN_TOKEN
- [x] admin-dashboard/src/server.ts & index.ts — start serwera na porcie 3001

## Faza 4: Integracja Dynamiczna & Upstream MCP Proxy
- [x] mcp-server/src/partners/dynamic.ts — DynamicPartnerLoader (automatyczny hot-reload z data/partners/ bez restartu)
- [x] mcp-server/src/upstream.ts — UpstreamPool obsługujący zewnętrzne serwery MCP partnerów (stdio/http)
- [x] Dynamiczne wstrzykiwanie {api_key} w parametrach, env i nagłówkach per developer
- [x] Piaskownica komend: blokada nieautoryzowanych procesów (ALLOWED_STDIO_COMMANDS)
- [x] Ujednolicenie katalogów danych (mcp-server/src/paths.ts, admin-dashboard/src/paths.ts)

## Faza 5: Testy i Zabezpieczenia
- [x] admin-dashboard/src/commission-engine.test.ts — 7/7 testów jednostkowych (100% pass)
- [x] mcp-server/test/e2e.test.mjs — 6/6 testów integracyjnych end-to-end (100% pass)
- [x] Fixture testowy: fake-partner-mcp.mjs

## Faza 6: Kolejne Etapy (Backlog)
- [ ] Panel Admina Web UI (Next.js 15, Tailwind, shadcn/ui)
- [ ] Gotowe konfiguracje dla kolejnych partnerów (Vercel, Supabase, Clerk, Stripe)
- [ ] Integracja automatycznych płatności wychodzących (Wise / Stripe Connect)
