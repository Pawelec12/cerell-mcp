# 🚀 Zaktualizowany Plan Egzekucji: Infrastructure Copilot Platform

## 1. Status Realizacji Projektu (Przegląd Faz)

| Faza | Zakres | Status | Opis |
|---|---|---|---|
| **Faza 1: Fundament MCP Server** | Typy, architektura meta-tool gateway, stdio transport | **100% ZROBIONE** | 14 narzędzi w 5 trybach, zero błędów TypeScript |
| **Faza 2: Baza danych i stan** | Infrastructure State Graph, Affiliate Tracker, Cashback Engine | **100% ZROBIONE** | Atomowy zapis JSON, transakcyjność, log zdarzeń |
| **Faza 3: Silnik biznesowy Admina** | 4 modele prowizji, symulator przychodów, finanse i analityka | **100% ZROBIONE** | Hono API, Zod runtime validation, obsługa rev-share/one-time/hybrid/tiered |
| **Faza 4: Integracja Dynamiczna & Upstream** | Live reloading partnerów, proxy do zewnętrznych serwerów MCP | **100% ZROBIONE** | `DynamicPartnerLoader` (hot reload bez restartu), `UpstreamPool` (stdio/http proxy) |
| **Faza 5: Cykl Wypłat i Bezpieczeństwo** | Wypłaty cashbacku devów, token admina, sandbox komend | **100% ZROBIONE** | Narzędzie `request_payout` w MCP, zatwierdzanie przez admin API, `ADMIN_TOKEN` |
| **Faza 6: Automatyzacja Testów** | Testy jednostkowe silnika prowizji + integracyjne E2E | **100% ZROBIONE** | 7/7 testów unit w adminie, 6/6 testów E2E w mcp-server (100% pass) |
| **Faza 7: Web UI Panelu Admina** | Frontend wizualny (Next.js/React/Tailwind/shadcn) | **DO ZROBIENIA** | Obecnie admin działa jako stabilne Headless REST API (port 3001) |
| **Faza 8: Produkcyjne wdrożenie & Płatności** | Realne integracje API partnerów, bramka Stripe Connect/PayPal | **DO ZROBIENIA** | Automatyzacja rzeczywistych przelewów i produkcyjne klucze SaaS |

---

## 2. Co zostało dodane / zmodyfikowane w innym IDE vs stan poprzedni

### A. Dynamiczne Ładowanie Partnerów (Hot-Reload)
* **Wcześniej:** Partnerzy byli częściowo statyczni (np. `neon.ts`), a partnerzy dodani w panelu admina nie trafiali automatycznie do serwera MCP.
* **Teraz:** Moduł `mcp-server/src/partners/dynamic.ts` nasłuchuje katalogu `data/partners/` za pomocą `fs.watch`. Gdy w panelu admina dodasz lub wyedytujesz partnera, serwer MCP natychmiast go ładuje **bez konieczności restartu**.

### B. Gateway do Zewnętrznych Serwerów MCP (`upstream.ts`)
* **Wcześniej:** Narzędzia partnerów zwracały jedynie szablony mock-data.
* **Teraz:** Zaimplementowano `UpstreamPool`, który potrafi działać jako klient prawdziwych serwerów MCP partnerów:
  - Transport **stdio** (`npx`, `node`, `uvx`, `docker`) z zabezpieczeniem przed wstrzykiwaniem komend (`ALLOWED_STDIO_COMMANDS`).
  - Transport **http** (`StreamableHTTPClientTransport`) z autoryzacją w nagłówkach.
  - Automatyczna podmiana `{api_key}` w parametrach/nagłówkach na prywatny klucz danego developera (`connect_account`).

### C. Narzędzie `request_payout` dla Programistów
* **Wcześniej:** Cashback naliczał się w systemie, ale programista nie mógł go wypłacić z poziomu asystenta AI.
* **Teraz:** W serwerze MCP dodano narzędzie `request_payout(amount, method)`. Zlecenie trafia do `data/payouts/dev-payouts.json`, skąd administrator zatwierdza lub odrzuca wypłatę przez API.

### D. Zabezpieczenie API Admina & Ścisła Walidacja Zod
* **Wcześniej:** API admina nie wymagało tokenu i posiadało uproszczoną walidację parametrów.
* **Teraz:** 
  - Wymagany nagłówek `Authorization: Bearer <ADMIN_TOKEN>`.
  - Kompletny plik `schemas.ts` w oparciu o Zod weryfikujący poprawność struktury każdego partnera, modelu prowizji i konfiguracji upstream.

### E. Ujednolicenie Ścieżek Danych (`paths.ts`)
* **Wcześniej:** Serwery odwoływały się do ścieżek relatywnych (`../../data`, `./data`), co groziło rozsynchronizowaniem.
* **Teraz:** Centralny punkt prawdy oparty o `INFRA_DATA_DIR`:
  - `data/partners/` — konfiguracje partnerów (JSON)
  - `data/payouts/` — rozliczenia i żądania wypłat
  - `data/mcp/` — bazy kont developerów, graf usług, zdarzenia afiliacyjne

### F. Kompletny Zestaw Testów Zautomatyzowanych
* `admin-dashboard/src/commission-engine.test.ts`: 7 testów badających matematykę 4 modeli (rev-share, one-time, hybrid, tiered) i symulatora wielomiesięcznego.
* `mcp-server/test/e2e.test.mjs`: 6 testów integracyjnych weryfikujących pełny cykl życia (token admina -> dodanie partnera -> hot-reload MCP -> `setup_service` -> proxy stdio i http -> `request_payout` -> approval admina).

---

## 3. Aktualna Architektura Systemu

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN INTERFACE (Headless)                      │
│                                                                        │
│   POST /api/admin/partners (z definicją prowizji & upstream MCP)       │
│   GET  /api/admin/finance/overview                                     │
│   PATCH /api/admin/finance/dev-payouts/:id/status                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Zapis do atomowych plików JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      WSPÓLNY MAGAZYN (data/)                           │
│                                                                        │
│   data/partners/*.json  ◀─── Obserwowane przez DynamicPartnerLoader    │
│   data/payouts/*.json   ◀─── Współdzielone zlecenia i bilans           │
│   data/mcp/*.json       ◀─── Baza devów, graf usług, log zdarzeń       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ fs.watch (Hot-Reloading bez restartu)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     INFRA-COPILOT MCP GATEWAY                          │
│                                                                        │
│   14 Meta-Tooli (compare_providers, setup_service, request_payout)     │
│   UpstreamPool: Proxy do zewnętrznych serwerów MCP (stdio / http)      │
│   Wstrzykiwanie kluczy API {api_key} dewelopera w locie               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Najbliższe Kroki (Następne Fazy)

1. **Frontend Panelu Admina (UI)**:
   - Stworzenie estetycznego, minimalistycznego panelu webowego (Next.js 15, Tailwind, shadcn/ui) korzystającego z istniejącego i przetestowanego Headless REST API (port 3001).
   - Formularz dodawania partnera z interaktywnym kreatorem modelu prowizji.
   - Dashboard KPI i zatwierdzanie wypłat cashbacku jednym kliknięciem.
2. **Kolejni Partnerzy w Rejestrze**:
   - Przygotowanie gotowych szablonów konfiguracyjnych dla czołowych partnerów SaaS (Vercel, Supabase, Clerk, Stripe, Upstash).
3. **Zewnętrzne Płatności (Cashout)**:
   - Integracja z procesorem płatności (np. Wise API / PayPal Payouts / Stripe Connect) do automatycznego realizowania zatwierdzonych wypłat.
