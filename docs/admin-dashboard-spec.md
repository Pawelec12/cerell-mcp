# Admin Dashboard — Specyfikacja

## Co TY widzisz po zalogowaniu

```
┌─────────────────────────────────────────────────────────────┐
│  🏠 Dashboard    👥 Partners    👨‍💻 Developers    💰 Finance │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 Przegląd                                                │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Revenue  │  │ Aktywni │  │ Partnerzy│  │ Cashback │     │
│  │ $2,340   │  │ 147     │  │ 8        │  │ do wypł. │     │
│  │ ten mies.│  │ developerzy│  aktywnych│  │ $1,404   │     │
│  └─────────┘  └─────────┘  └──────────┘  └──────────┘     │
│                                                             │
│  📈 Revenue ostatnie 30 dni         🏆 Top Partnerzy       │
│  ┌──────────────────────────┐      ┌─────────────────┐     │
│  │  ▁▂▃▄▅▆▇█▇▆▅▆▇█▇▆▅▄▅▆▇ │      │ 1. Neon  $890   │     │
│  │  $2,340 (+12% vs prev)  │      │ 2. Vercel $620  │     │
│  └──────────────────────────┘      │ 3. Clerk  $430  │     │
│                                    └─────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 👥 Partner Management — Najważniejsza Sekcja

### Co musisz móc zrobić z partnerem:

#### Dane podstawowe
| Pole | Typ | Wymagane | Przykład |
|---|---|---|---|
| **Nazwa firmy** | tekst | ✅ | "Neon" |
| **Logo** | upload obrazka | ❌ | neon-logo.svg |
| **Strona WWW** | URL | ✅ | https://neon.tech |
| **Kategoria** | select | ✅ | Database / Hosting / Auth / Payments / ... |
| **Opis** | tekst (krótki) | ✅ | "Serverless Postgres — branch your database like code" |
| **Status** | toggle | ✅ | Aktywny / Nieaktywny / W trakcie integracji |

#### Linki afiliacyjne
| Pole | Typ | Przykład |
|---|---|---|
| **Signup link (szablon)** | URL z placeholderami | `https://neon.tech/signup?ref={affiliate_id}&sub_id={dev_id}` |
| **Affiliate ID** | tekst | `ref_NEON_INFRACOP` |
| **Tracking cookie (dni)** | liczba | 30 |
| **Dashboard partnera** | URL (link do twojego panelu u partnera) | `https://neon.tech/partners/dashboard` |
| **Kontakt u partnera** | email | partner-manager@neon.tech |

#### 💡 Struktura komisji — TU JEST KLUCZ

To jest najważniejsze pole, bo partnerzy płacą **różnie**. Musisz obsłużyć te modele:

```
Model A: "Revenue Share" (np. Neon, Vercel)
─────────────────────────────────────────────
  Typ: recurring
  Procent: 20%
  Od czego: od monthly spend developera
  Przez ile: 12 miesięcy / 24 miesiące / lifetime
  Min. payout: $50

Model B: "Bounty / Signup Bonus" (np. DigitalOcean, niektóre programy)
─────────────────────────────────────────────
  Typ: one_time
  Kwota: $20 za rejestrację
  Warunek: dev musi wydać min. $10 w pierwszym miesiącu
  Min. payout: $100

Model C: "Hybrid" (np. Stripe Partner Program)
─────────────────────────────────────────────
  Typ: hybrid
  Signup bonus: $10
  + Revenue share: 15% przez 12 mies.
  Min. payout: $50

Model D: "Tiered" (np. AWS Partner)
─────────────────────────────────────────────
  Typ: tiered
  1-10 referrals:    $20 per signup
  11-50 referrals:   $30 per signup
  50+ referrals:     $50 per signup
```

**W dashboardzie** formularz komisji powinien wyglądać tak:

```
┌─────────────────────────────────────────────────────┐
│  Commission Structure                                │
│                                                      │
│  Typ:  [🔘 Revenue Share  ○ One-Time  ○ Hybrid]     │
│                                                      │
│  ┌─ Revenue Share ─────────────────────────────┐    │
│  │  Rate:     [20   ]%                          │    │
│  │  Podstawa: [● Monthly Spend  ○ First Month]  │    │
│  │  Czas:     [12 miesięcy  ▼]                  │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌─ One-Time Bonus (opcjonalne) ────────────────┐   │
│  │  Kwota:    [$20  ] per signup                 │   │
│  │  Warunek:  [Min. $10 spend w 1. miesiącu   ]  │   │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  Min. payout: [$50  ]                               │
│  Cykl wypłat: [Miesięczny  ▼]                       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

#### MCP Configuration

```
┌─────────────────────────────────────────────────────┐
│  MCP Server Config                                   │
│                                                      │
│  Źródło:  [● Wbudowany (managed)  ○ Zewnętrzny URL] │
│                                                      │
│  Toole do udostępnienia:                             │
│  ┌──────────────────────────────────────────────┐   │
│  │ [+] Dodaj tool                                │   │
│  │                                               │   │
│  │ 📦 create_database                            │   │
│  │    Opis: Creates a new Postgres database      │   │
│  │    Params: name (string), region (enum)       │   │
│  │    [Edytuj] [Usuń]                            │   │
│  │                                               │   │
│  │ 📦 create_branch                              │   │
│  │    Opis: Creates a database branch            │   │
│  │    [Edytuj] [Usuń]                            │   │
│  │                                               │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Pricing tiers:                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Free    | $0/mo   | 0.5GB, 1 project         │   │
│  │ Launch  | $19/mo  | 10GB, autoscaling        │   │
│  │ Scale   | $69/mo  | 50GB, read replicas      │   │
│  │ [+] Dodaj tier                                │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Dokumentacja (per topic):                           │
│  ┌──────────────────────────────────────────────┐   │
│  │ connection: "Use postgresql://..."            │   │
│  │ branching: "Create branches with..."          │   │
│  │ [+] Dodaj topic                               │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [🧪 Test integracji]  [💾 Zapisz]                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **"Wgrywać MCP"** — w praktyce nie wgrywasz gotowego serwera MCP. Wpisujesz **definicje tooli** (nazwa, opis, parametry) i **logikę affiliate** (jak wstrzyknąć tracking). Twój serwer sam eksponuje te toole przez meta-tool gateway. To jest kluczowe — partnerzy nie dostarczają ci serwera MCP, ty **budujesz proxy** na podstawie ich API.

---

## 2. 👨‍💻 Developers — Widok twoich użytkowników

```
┌─────────────────────────────────────────────────────┐
│  Developers (147 aktywnych)            [🔍 Szukaj]  │
│                                                      │
│  ID          │ Joined    │ Partners │ Spend  │ CB   │
│  ─────────────┼───────────┼──────────┼────────┼──────│
│  dev-abc123  │ 2025-01-15│ 3        │ $89/mo │ $8.90│
│  dev-xyz789  │ 2025-02-03│ 2        │ $45/mo │ $4.50│
│  dev-qwe456  │ 2025-02-10│ 1        │ $0/mo  │ $0   │
│  ...                                                 │
│                                                      │
│  [Kliknij dev-abc123 →]                              │
│  ┌───────────────────────────────────────────────┐  │
│  │ Developer: dev-abc123                          │  │
│  │ Joined: 2025-01-15                             │  │
│  │ Linked partners: Neon (Launch), Vercel (Pro)   │  │
│  │ Infrastructure graph: 3 services, 2 connections│  │
│  │ Total spend: $89/mo                            │  │
│  │ Your revenue: $17.80/mo                        │  │
│  │ Dev cashback: $10.68/mo                        │  │
│  │ Cashback balance: $47.20                       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 3. 💰 Finance — Gdzie widzisz pieniądze

### Revenue Overview
| Metryka | Co pokazuje |
|---|---|
| **Gross Revenue** | Łączna prowizja od wszystkich partnerów |
| **Net Revenue** | Gross minus cashback wypłacony devom |
| **Cashback Liability** | Ile musisz wypłacić devom (pending + available) |
| **MRR** | Monthly Recurring Revenue |
| **ARPU** | Average Revenue Per User (dev) |

### Payouts (od partnerów do ciebie)
```
┌─────────────────────────────────────────────────────┐
│  Incoming Payouts                                    │
│                                                      │
│  Partner  │ Okres       │ Kwota    │ Status          │
│  ─────────┼─────────────┼──────────┼─────────────────│
│  Neon     │ Styczeń '25 │ $890.00  │ ✅ Otrzymano    │
│  Vercel   │ Styczeń '25 │ $620.00  │ ⏳ Oczekiwanie  │
│  Clerk    │ Styczeń '25 │ $430.00  │ ⏳ Oczekiwanie  │
└─────────────────────────────────────────────────────┘
```

### Cashback Payouts (od ciebie do devów)
```
┌─────────────────────────────────────────────────────┐
│  Developer Payouts                                   │
│                                                      │
│  Dev         │ Kwota  │ Metoda    │ Status           │
│  ────────────┼────────┼───────────┼──────────────────│
│  dev-abc123  │ $47.20 │ PayPal    │ 🔄 Requested     │
│  dev-xyz789  │ $28.50 │ Crypto    │ ✅ Wypłacono     │
│  [Zatwierdź]  [Odrzuć]  [Wypłać wszystkie]           │
└─────────────────────────────────────────────────────┘
```

---

## 4. 📊 Analytics — Co chcesz wiedzieć

| Pytanie | Dashboard odpowiada |
|---|---|
| Który partner generuje najwięcej revenue? | Top Partners ranking |
| Ile devów kliknęło link ale się nie zarejestrowało? | Conversion funnel per partner |
| Jaki jest średni spend deva? | ARPU chart |
| Które toole MCP są najczęściej wywoływane? | Tool usage heatmap |
| Ile devów odinstalowało MCP? | Churn tracking |
| Który typ komisji (recurring vs one-time) jest bardziej opłacalny? | Commission model comparison |

---

## 5. ⚙️ System Settings

| Setting | Co robi |
|---|---|
| **Cashback tiers** | Konfiguracja procentów cashbacku per próg spend |
| **Default dev share** | Ile % oddajesz devom (domyślnie 60%) |
| **Min. payout threshold** | Minimalna kwota do wypłaty cashbacku |
| **Payout methods** | Włącz/wyłącz metody wypłat (PayPal, crypto, bank) |
| **API keys** | Twoje klucze do platform afiliacyjnych |
| **Webhooks** | URL-e do notyfikacji o nowych rejestracji/payoutach |
| **Branding** | Nazwa platformy, logo, kolory (dla landing page devów) |

---

## Rekomendacja: Co budować w V1

### ✅ V1 (teraz)
1. **Partner CRUD** — dodaj/edytuj/usuń partnera z pełną konfiguracją komisji
2. **Commission builder** — obsługa 4 modeli (revenue share, one-time, hybrid, tiered)
3. **MCP tool editor** — definiuj toole per partner (nazwa, opis, parametry, pricing tiers)
4. **Developer list** — widok zarejestrowanych devów z ich spend/cashback
5. **Revenue dashboard** — karty KPI + wykres trendu

### ⏳ V2 (później)
6. Analytics (conversion funnel, tool usage)
7. Cashback payout management
8. Partner payout tracking
9. System settings
10. Webhooks & integrations

---

## Tech Stack — Dashboard

| Warstwa | Technologia | Dlaczego |
|---|---|---|
| **Frontend** | Next.js 15 + shadcn/ui + Tailwind | Szybki dev, piękne komponenty, SSR |
| **Backend** | Next.js API Routes | Wszystko w jednym repo |
| **Database** | SQLite (via better-sqlite3) | Zero setup, wystarczy na admin dashboard |
| **Auth** | Prosty password (1 admin) | MVP — nie potrzebujesz OAuth na admin panel |
| **Charts** | Recharts | Lekki, Reactowy |

> [!TIP]
> Dashboard jest **wewnętrznym narzędziem** — nie musi być piękny, musi być **funkcjonalny**. shadcn/ui daje profesjonalny wygląd out of the box bez rzeźbienia CSS.
