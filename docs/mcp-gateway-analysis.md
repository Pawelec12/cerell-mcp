# MCP Gateway: Serwery wewnątrz Serwera

## Krótka odpowiedź

Tak, technicznie **możesz**. Wzorzec nazywa się **MCP Gateway / Aggregator** i jest architektonicznie czysty. Twój serwer łączy się z N serwerami partnerskimi jako klient i re-eksponuje ich toole pod swoją marką.

**ALE** — twój zakład o \$100 przegrywasz na jednym punkcie, który zabija cały model jeśli go zignorujesz.

---

## Problem: Context Window Pollution

To jest **jedyny, ale krytyczny** powód, dla którego naiwne "wrzucenie 30 serwerów" nie zadziała dobrze.

### Jak AI widzi twoje toole

Gdy AI assistant łączy się z MCP serverem, **na starcie** pobiera listę WSZYSTKICH dostępnych tooli — z nazwami, opisami i schematami parametrów. To ląduje w **context window** jako system prompt.

```
30 serwerów × ~5 tooli = 150 tooli
150 tooli × ~200 tokenów (nazwa + opis + schema) = ~30,000 tokenów

Context window Claude: ~200k tokenów
Zjadasz ~15% kontekstu ZANIM developer cokolwiek napisze.
```

### Co to psuje

| Problem | Dlaczego | Jak poważne |
|---|---|---|
| **Tool selection accuracy** | LLM-y tracą precyzję powyżej ~20-30 tooli. Przy 150 toolach AI częściej wybiera zły tool lub hallucynuje parametry. | 🔴 Krytyczne |
| **Context dla kodu** | 30k tokenów na toole = mniej miejsca na kod usera, pliki projektu, historię konwersacji. | 🟠 Poważne |
| **Latency** | AI musi "przeczytać" 150 definicji zanim odpowie na każdy prompt. | 🟡 Odczuwalne |
| **Koszt tokenów usera** | Developer płaci za swoje tokeny — a 30k tokenów na twoje tool defs to ~\$0.01-0.03 per prompt. Przy 100 promptach dziennie to \$1-3/dzień dodatkowego kosztu. | 🟠 Irytujące |

> [!CAUTION]
> Ironicznie, twierdzisz że "MCP generuje lepszy kod niż prompty" — i masz rację. Ale 150 tooli jednocześnie **degraduje** tę jakość z powrotem, bo LLM tonie w szumie definicji. To tak jakbyś dał programiście 150 narzędzi na biurko — nie wie po które sięgnąć.

---

## Rozwiązanie: Wzorzec Meta-Tool Gateway

Nie eksponujesz 150 tooli. Eksponujesz **~8-12 meta-tooli**, a resztę ładujesz dynamicznie.

### Architektura

```
WARSTWA WIDOCZNA DLA AI (stałe toole: ~10)
────────────────────────────────────────────
  explore_providers(category)
  compare_providers(category, requirements)
  setup_service(provider, action, config)
  get_provider_docs(provider, topic)
  check_cashback()
  get_spend_summary()
  ...

WARSTWA WEWNĘTRZNA (ukryta, ~150 operacji)
────────────────────────────────────────────
  Router → dispatches to correct partner module
  ├── NeonModule      (create_db, branch, migrate, ...)
  ├── VercelModule    (deploy, domain, env_vars, ...)
  ├── ClerkModule     (setup_auth, configure_sso, ...)
  ├── GCPModule       (create_instance, setup_storage, ...)
  ├── StripeModule    (setup_payments, create_product, ...)
  └── ... 25 more modules
```

### Jak to wygląda w praktyce

**Developer**: "Potrzebuję bazę danych dla mojej aplikacji Next.js"

**AI wywołuje** (1 tool call):
```json
{
  "tool": "compare_providers",
  "params": {
    "category": "database",
    "requirements": ["postgres", "serverless", "branching"],
    "framework": "nextjs"
  }
}
```

**Twój MCP zwraca**:
```json
{
  "recommendations": [
    {
      "provider": "neon",
      "match": 95,
      "reason": "Natywna integracja z Next.js, serverless, branching, Drizzle ORM support",
      "pricing": "Free → $19/mo → $69/mo",
      "cashback": "$2.28 - $8.28/mo",
      "actions": ["create_database", "create_branch", "run_migration"]
    },
    {
      "provider": "supabase",
      "match": 82,
      "reason": "Postgres + realtime + auth w pakiecie",
      "pricing": "Free → $25/mo → $599/mo",
      "cashback": "$3.00 - $71.88/mo",
      "actions": ["create_project", "setup_tables", "enable_realtime"]
    }
  ]
}
```

**Developer**: "Ok, idę z Neonem, ustaw bazę"

**AI wywołuje** (1 tool call):
```json
{
  "tool": "setup_service",
  "params": {
    "provider": "neon",
    "action": "create_database",
    "config": {
      "name": "my-nextjs-db",
      "region": "aws-eu-central-1",
      "postgres_version": 16
    }
  }
}
```

**Wewnątrz twojego serwera** (niewidoczne dla AI):
```
setup_service("neon", "create_database", config)
  → Router.dispatch("neon", "create_database", config)
    → NeonModule.createDatabase(config, affiliateId="TWOJ_ID")
      → POST https://console.neon.tech/api/v2/projects
        Headers: { Authorization: Bearer NEON_PARTNER_KEY }
        Body: { ...config }
      → trackAttribution(dev_id, "neon", "create_database", cost)
      → return { connection_string, dashboard_url, branch_id }
```

### Rezultat: 2 tool calle zamiast grzebania w 150 toolach

AI użyło **2 toole** (`compare_providers` → `setup_service`) i osiągnęło dokładnie to samo, co w modelu ze 150 toolami — ale:
- ✅ Context window czyste (~2k tokenów na definicje zamiast 30k)
- ✅ AI precyzyjnie wybrało tool (2 opcje, nie 150)
- ✅ Developer zapłacił mniej za tokeny
- ✅ Kod dalej jest clean (MCP > prompty)

---

## Implementacja Meta-Tool Routera

```typescript
// Centralna definicja wszystkich partnerów i ich akcji
const PARTNER_REGISTRY: Record<string, PartnerModule> = {
  neon: {
    category: "database",
    affiliate_id: "ref_NEON_123",
    actions: {
      create_database: {
        description: "Tworzy nową bazę Postgres na Neon",
        params: z.object({
          name: z.string(),
          region: z.enum(["aws-eu-central-1", "aws-us-east-1", ...]),
          postgres_version: z.number().default(16),
        }),
        handler: neonHandlers.createDatabase,
      },
      create_branch: { ... },
      run_migration: { ... },
    },
    signup_url: "https://neon.tech/signup?ref=ref_NEON_123&sub_id={dev_id}",
    docs_url: "https://neon.tech/docs",
  },

  vercel: {
    category: "hosting",
    affiliate_id: "ref_VERCEL_456",
    actions: {
      deploy: { ... },
      setup_domain: { ... },
      set_env_vars: { ... },
    },
    signup_url: "https://vercel.com/signup?ref=ref_VERCEL_456",
  },

  // ... 28 more partners
};

// Meta-tool: setup_service
server.tool("setup_service", {
  description: "Provisionuje lub konfiguruje usługę u wybranego partnera infrastrukturalnego",
  params: z.object({
    provider: z.string().describe("Nazwa providera, np. 'neon', 'vercel', 'clerk'"),
    action: z.string().describe("Akcja do wykonania, np. 'create_database', 'deploy'"),
    config: z.record(z.any()).describe("Parametry specyficzne dla akcji"),
  }),
  handler: async ({ provider, action, config }, context) => {
    const partner = PARTNER_REGISTRY[provider];
    if (!partner) throw new Error(`Unknown provider: ${provider}`);

    const actionDef = partner.actions[action];
    if (!actionDef) throw new Error(`Unknown action: ${provider}.${action}`);

    // Waliduj parametry
    const validatedConfig = actionDef.params.parse(config);

    // Sprawdź czy dev ma konto u partnera
    const dev = await getDev(context.auth.devId);
    if (!dev.linkedAccounts[provider]) {
      return {
        status: "account_required",
        message: `Musisz najpierw założyć konto w ${provider}.`,
        signup_url: partner.signup_url.replace("{dev_id}", dev.id),
        cashback_info: `Po rejestracji przez ten link automatycznie aktywujesz cashback.`,
      };
    }

    // Wykonaj akcję
    const result = await actionDef.handler(validatedConfig, {
      apiKey: dev.linkedAccounts[provider].apiKey,
      affiliateId: partner.affiliate_id,
    });

    // Track attribution
    await trackEvent({
      dev_id: dev.id,
      partner: provider,
      action: action,
      revenue_estimate: result.estimatedCost * partner.commissionRate,
    });

    return result;
  },
});
```

---

## A co z "czystszym kodem"? Nadal działa.

Twoja intuicja jest słuszna — MCP toole generują lepszy kod niż surowe prompty, bo:
1. **Structured output** — tool zwraca connection string, config, gotowe snippety
2. **Kontekst partnera** — AI wie jakie SDK, jakie env vars, jaki boilerplate
3. **Walidacja** — tool waliduje parametry zanim cokolwiek zrobi

To wszystko **zachowujesz** w modelu meta-tool. Różnica jest taka, że zamiast AI samodzielnie wybierać z 150 tooli, to **twój router** (deterministyczny kod, nie LLM) dispatchuje do właściwego modułu.

```
Stary model (150 tooli):
  AI wybiera tool → AI hallucynuje → zły provider → brudny kod

Nowy model (meta-tool):
  AI wybiera 1 z 10 tooli → Twój router dispatchy → zawsze poprawny provider → czysty kod
```

---

## Werdykt: Twój Zakład

| Twierdzenie | Werdykt |
|---|---|
| "Wewnątrz mojego serwera mogą żyć inne serwery" | ✅ **Tak** — wzorzec MCP Gateway |
| "Linki afiliacyjne mogą tam być" | ✅ **Tak** — każdy tool call przechodzi przez twój tracking |
| "Wgranie 30 serwerów nie naruszy niczego" | ⚠️ **Technicznie tak, praktycznie nie** |

Nie naruszysz **protokołu MCP** — spec nie limituje liczby tooli.
Nie naruszysz **prawa** — agregatowanie API za zgodą jest legalne.

Ale **naruszysz jakość** — i to jest jedyne co się liczy:
- 150 tooli = ~30k tokenów overhead
- Tool selection accuracy spada z ~95% do ~60-70%
- Developer płaci więcej za tokeny
- Kod jest **gorszy**, nie lepszy

**Rozwiązanie**: meta-tool gateway (8-12 tooli, router wewnątrz). Masz wszystkie 30 serwerów pod spodem, ale AI widzi czysty, minimalny interfejs. Jakość kodu: maksymalna. Afiliacja: zachowana. Developer experience: doskonały.
