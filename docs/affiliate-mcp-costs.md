# Koszt Budowy: Affiliate MCP Layer

## TL;DR

| Faza | Koszty infra / mies. | Czas budowy | Koszty dev (jednorazowo) |
|---|---|---|---|
| **MVP** (0–100 devów) | **\$0 – \$50** | 2–4 tygodnie (solo) | \$0 (sam budujesz) |
| **Growth** (100–1k devów) | **\$200 – \$800** | +4–6 tygodni | \$0 – \$5k (freelancer na frontend) |
| **Scale** (1k–10k+ devów) | **\$2k – \$5k** | ongoing | \$5k – \$15k/mies. (team) |

> [!TIP]
> Ten stack jest celowo zaprojektowany żeby **kosztować praktycznie \$0 na start** dzięki free tierom. Płacisz dopiero gdy zarabiasz.

---

## 1. Koszty Infrastruktury — MVP

Cały MVP można postawić na **free tierach**:

| Usługa | Do czego | Free Tier | Kiedy płacisz | Koszt po free tier |
|---|---|---|---|---|
| **Cloudflare Workers** | MCP proxy servers | 100k req/dzień | >100k req/dzień | \$5/mies. + \$0.50/mln req |
| **Neon** | Twoja baza danych (users, keys, attribution) | 0.5 GB, 1 projekt | >0.5 GB | \$19/mies. |
| **Vercel** | Dashboard / landing page | Hobby plan gratis | Custom domain + team | \$20/mies. |
| **Clerk** | Auth developerów | 10k MAU | >10k MAU | \$25/mies. |
| **Upstash Redis** | Cache kluczy, rate limiting | 10k cmd/dzień | >10k cmd/dzień | \$10/mies. |
| **Upstash Kafka** lub **Inngest** | Event queue (attribution) | 10k msg/dzień | >10k msg/dzień | \$10/mies. |
| **Domena** | twojaplatforma.com | — | od dnia 1 | ~\$12/rok |
| **Resend** lub **Postmark** | Emaile (welcome, klucz, alerty) | 3k emaili/mies. | >3k emaili/mies. | \$20/mies. |

### MVP Monthly Total: **\$0 – \$1** (+ \$12/rok domena)

Serio. Przy <100 developerach zmieścisz się w free tierach wszystkiego.

---

## 2. Koszty Infrastruktury — Growth (100–1k devów)

Gdy zaczynasz mieć ruch:

| Usługa | Estymata | Koszt/mies. |
|---|---|---|
| Cloudflare Workers (paid) | ~1M req/mies. | \$5 + \$0.50 = **\$5** |
| Neon (Launch plan) | 10 GB, autoscaling | **\$19–\$69** |
| Vercel Pro | Custom domains, analytics | **\$20** |
| Clerk (Pro) | do 10k MAU | **\$25–\$100** |
| Upstash Redis (Pro) | 100k cmd/dzień | **\$30** |
| Upstash Kafka / Inngest (Pro) | Event processing | **\$25–\$50** |
| Monitoring (Sentry) | Error tracking | **\$26** |
| Analytics (Tinybird / PostHog) | Attribution dashboards | **\$0–\$100** |
| Email (Resend) | 10k/mies. | **\$20** |

### Growth Monthly Total: **\$200 – \$500**

---

## 3. Koszty Infrastruktury — Scale (1k–10k+ devów)

| Usługa | Estymata | Koszt/mies. |
|---|---|---|
| Cloudflare Workers | 10M+ req/mies. | **\$50–\$200** |
| Neon (Scale plan) | 50+ GB, read replicas | **\$69–\$350** |
| Vercel (Team/Enterprise) | Edge functions, analytics | **\$150–\$400** |
| Clerk (Enterprise) | 50k+ MAU | **\$500+** |
| ClickHouse Cloud | Analytics at scale | **\$200–\$500** |
| Upstash / Redis Cluster | High throughput caching | **\$100–\$300** |
| Event processing (Inngest Pro) | Durable execution | **\$150–\$300** |
| Monitoring stack | Sentry + Grafana Cloud | **\$100–\$200** |
| Security (WAF, DDoS) | Cloudflare Pro | **\$200** |

### Scale Monthly Total: **\$2k – \$5k**

---

## 4. Koszty Developmentu

### Scenariusz A: Sam budujesz (Founder-Engineer)

| Co | Czas | Koszt |
|---|---|---|
| **MVP** (1 MCP proxy + platform API + landing) | 2–4 tygodnie | \$0 |
| **+2–3 partnerów** | +1–2 tygodnie per partner | \$0 |
| **Dashboard / analytics** | +2 tygodnie | \$0 |
| **Polish + launch** | +1–2 tygodnie | \$0 |
| **Total do launch** | **6–10 tygodni** | **\$0** (twój czas) |

### Scenariusz B: Mały zespół / Freelancerzy

| Rola | Czas | Stawka | Koszt |
|---|---|---|---|
| **Backend dev** (MCP proxy + API) | 4–6 tyg. | \$50–80/h | \$8k–\$19k |
| **Frontend dev** (dashboard + landing) | 3–4 tyg. | \$40–60/h | \$5k–\$10k |
| **Design** (UI/UX, branding) | 2 tyg. | \$50–80/h | \$4k–\$6k |
| **Total** | — | — | **\$17k–\$35k** |

### Scenariusz C: Software house

| Scope | Estymata |
|---|---|
| Full MVP | **\$30k–\$60k** |
| Full platform (MVP + 5 partnerów + dashboard + analytics) | **\$60k–\$120k** |

> [!IMPORTANT]
> **Rekomendacja**: Scenariusz A. Ten system nie jest skomplikowany technicznie — to kilka proxy serverów + CRUD API + JWT auth. Z AI-assisted coding (Cursor + twoja platforma, dog food!) budujesz MVP w **2-3 tygodnie** solo.

---

## 5. Koszty Jednorazowe / Startowe

| Pozycja | Koszt | Obowiązkowe? |
|---|---|---|
| Domena | \$12–\$50/rok | ✅ Tak |
| Logo / branding (Fiverr/AI) | \$0–\$200 | ❌ Nice to have |
| Prawnik (ToS, Privacy Policy) | \$500–\$2k | ⚠️ Zalecane |
| Rejestracja firmy (LLC/sp. z o.o.) | \$200–\$1k | ⚠️ Przed pierwszym rev |
| SSL / certyfikaty | \$0 (Cloudflare) | ✅ Darmowe |
| Affiliate agreements z partnerami | \$0 (aplikujesz online) | ✅ Darmowe |

### Startup Total: **\$200 – \$3k**

---

## 6. Koszty Operacyjne (Ongoing)

| Pozycja | Koszt/mies. | Kiedy |
|---|---|---|
| Utrzymanie kodu (bug fixy, updates) | Twój czas | Od dnia 1 |
| Support developerów (Discord/email) | Twój czas → \$2–5k (hire) | Od ~500 devów |
| Content marketing (blog, docs) | Twój czas → \$1–3k | Od growth phase |
| Onboarding nowych partnerów | 1–2 dni per partner | Ongoing |
| Compliance / Legal | \$0–\$500/mies. | Od scale |

---

## 7. Projekcja ROI — Kiedy się zwraca?

### Założenia (konserwatywne)

| Parametr | Wartość |
|---|---|
| Średni affiliate commission | 20% rev share |
| Średni dev spend na infra | \$50/mies. (na początek) |
| Twój rev per active dev | **\$10/mies.** |
| Conversion (signup → active) | 30% |
| Churn | 5%/mies. |

### Projekcja

| Miesiąc | Zarejestrowani | Aktywni devowie | Rev/mies. | Koszty infra | Profit |
|---|---|---|---|---|---|
| 1 | 50 | 15 | \$150 | ~\$0 | **+\$150** |
| 3 | 200 | 60 | \$600 | ~\$50 | **+\$550** |
| 6 | 500 | 150 | \$1,500 | ~\$200 | **+\$1,300** |
| 12 | 2,000 | 600 | \$6,000 | ~\$800 | **+\$5,200** |
| 18 | 5,000 | 1,500 | \$15,000 | ~\$2,000 | **+\$13,000** |
| 24 | 10,000 | 3,000 | \$30,000 | ~\$4,000 | **+\$26,000** |

> [!NOTE]
> To jest **revenue z samych affiliate commissions**. Nie wliczam:
> - Premium keys (dodatkowe \$10–50/dev/mies.)
> - Sponsored placements od partnerów
> - Data insights licensing
>
> Te dodatkowe streamy mogą **podwoić** revenue.

### Break-Even

| Scenariusz | Break-even przy |
|---|---|
| Solo build (\$0 dev cost) | **Dzień 1** — już 10 aktywnych devów daje profit |
| Freelancer build (\$20k) | **~200 aktywnych devów** (~miesiąc 4–5) |
| Agency build (\$60k) | **~600 aktywnych devów** (~miesiąc 8–10) |

---

## 8. Ukryte Koszty — Na co uważać

| Ryzyko kosztowe | Jak mitigować |
|---|---|
| **Rate limiting partnerów** — twój proxy mnoży requesty | Cachuj agresywnie, batch operations |
| **Affiliate payout delays** — partnerzy płacą z 30–60 dniowym opóźnieniem | Miej 2–3 mies. runway |
| **Compliance costs** — GDPR, SOC2 jeśli enterprise devs | Zacznij z privacy-by-design, SOC2 dopiero przy \$50k+ MRR |
| **Partner API changes** — breaking changes w API partnera | Wersjonuj proxy, testy integracyjne, alerty |
| **Scaling MCP connections** — WebSocket/SSE connections at scale | Cloudflare Durable Objects / stateless HTTP transport |

---

## 9. Porównanie: Co wydajesz vs co zarabiasz

```
Miesiąc 6, 150 aktywnych devów:

  Wydajesz:     ~$200/mies. (infra)
  Zarabiasz:  ~$1,500/mies. (affiliate)
  Margin:        ~87%

Miesiąc 12, 600 aktywnych devów:

  Wydajesz:     ~$800/mies. (infra)
  Zarabiasz:  ~$6,000/mies. (affiliate)
  Margin:        ~87%

Miesiąc 24, 3000 aktywnych devów:

  Wydajesz:   ~$4,000/mies. (infra) + $10k/mies. (team)
  Zarabiasz: ~$30,000/mies. (affiliate) + premium
  Margin:        ~50-60% (z zespołem)
```

> [!TIP]
> **Kluczowa metryka**: Ten biznes ma **~87% gross margin** w fazie solo. To lepsze niż większość SaaSów (70–80%). Powód: nie masz kosztu dostarczenia usługi — **partnerzy** dostarczają usługę, ty tylko kierujesz ruch.
