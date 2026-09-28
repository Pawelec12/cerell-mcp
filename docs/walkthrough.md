# Walkthrough: Web Platform (Cerell Style), Partner Creator & Stripe Integration

## 🎯 Co zostało zbudowane i przetestowane

Kompletna aplikacja webowa w podkatalogu `infra-copilot-platform/web` oparta o **Next.js 15, React 19, Tailwind CSS i Stripe SDK**, w 100% odwzorowująca minimalistyczny, luksusowy design system **Cerell** (`antek`).

---

## 1. Dostępne Moduły i Trasy (`http://localhost:3000`)

### A. Publiczny Landing Page (`http://localhost:3000/`)
* **Styl Cerell:** Badge z pillsem, duży wyrazisty nagłówek z zacieśnionym kerningiem, wysoki kontrast, ciepłe tło `bg-neutral-50`.
* **Interaktywny Kalkulator Cashbacku:** Inspirowany kalkulatorem *Intent Gap* z Cerell — użytkownik podaje swój miesięczny spend na chmurę oraz liczbę usług, a kalkulator wylicza szacowany roczny zwrot gotówki.
* **3-Krokowy Przewodnik:** Jak podłączyć gateway do edytora, stawiać infrastrukturę z AI i odbierać środki.
* **1-Click MCP Config:** Blok konfiguracyjny do `mcp.json` z przyciskiem szybkiego kopiowania do schowka.
* **Sekcja FAQ & Footer:** Rozwiewanie obaw dotyczących bezpieczeństwa danych i tokenów LLM.

---

### B. Panel Klienta / Developera (`http://localhost:3000/portal`)
* **Portfel Cashback:** 4 kafelki metryk (Dostępne do wypłaty, W trakcie realizacji, Szacowany zwrot miesięczny, Łącznie zarobione).
* **Metoda Wypłat (Stripe Connect):**
  - Wyświetlanie statusu weryfikacji i połączonego konta Stripe.
  - Przycisk **„Podłącz konto bankowe / kartę”** generujący sesję Stripe Connect Express Onboarding.
* **Tabela Ztriggerowanych Usług & Oczekiwanych Payoutów:**
  - Wykaz usług utworzonych przez AI (np. Neon, Vercel, Clerk),
  - Informacja o planie i miesięcznym spendzie,
  - Dokładne wyliczenie oczekiwanego cashbacku per partner (np. `+$2.28 / msc`).
* **Modal Zlecenia Wypłaty:**
  - Formularz wypłaty dostępnych środków z walidacją salda.
  - Historia zrealizowanych i oczekujących przelewów z identyfikatorem transferu Stripe.

---

### C. Panel Administratora (`http://localhost:3000/admin`)
* **Katalog Partnerów & Kreator Manualny (Odpowiedź na Twoje pytanie):**
  - Formularz w modalu pozwalający manualnie wprowadzić dowolną nową firmę:
    1. Nazwa, kategoria, strona WWW, logo, opis,
    2. Link afiliacyjny z szablonem `{affiliate_id}` i `{dev_id}`,
    3. **Wybór modelu prowizji:** *Revenue Share* (%), *One-Time Bounty* ($), *Hybrid* ($ + %), lub *Tiered* (progi),
    4. **Konfiguracja serwera MCP:** Wybór pomiędzy zewnętrznym serwerem **STDIO** (`npx`, `node`, `uvx`, `docker`), zdalnym serwerem **HTTP** (URL), a szablonem narzędzi wbudowanych (Mock).
  - Po zapisaniu partner trafia do `data/partners/`, skąd serwer MCP natychmiast ładuje go na żywo (**hot-reload bez restartu**)!
* **Zarządzanie Wypłatami i Egzekucja Stripe:**
  - Tabela zgłoszeń od programistów,
  - Przycisk **„Zatwierdź i wypłać”**, który wywołuje Stripe Transfers API i automatycznie oznacza wypłatę jako zrealizowaną z identyfikatorem transferu Stripe (`tr_...`).
* **Przegląd Finansowy:** Wolumen prowizji brutto, zobowiązania cashback, marża netto platformy, log zdarzeń afiliacyjnych.

---

## 2. Zweryfikowane Wyniki Testów E2E

### Test 1: Produkcyjny Build Next.js (`npm run build`)
```text
✓ Compiled successfully in 4.5s
✓ Generating static pages (12/12)
Route (app)                                 Size  First Load JS
┌ ○ /                                    5.04 kB         111 kB
├ ○ /admin                               8.16 kB         115 kB
├ ƒ /api/admin/overview                    141 B         103 kB
├ ƒ /api/admin/partners                    141 B         103 kB
├ ƒ /api/admin/payouts/approve             141 B         103 kB
├ ƒ /api/portal/request-payout             141 B         103 kB
├ ƒ /api/portal/stats                      141 B         103 kB
├ ƒ /api/portal/stripe-connect             141 B         103 kB
└ ○ /portal                              6.15 kB         113 kB
```

### Test 2: Pełny Obieg Wypłaty Cashbacku (Dev -> Admin -> Stripe)
1. **Portal Dev:** Zgłoszenie żądania wypłaty `$1.50` z dostępnego salda `$1.90`.
2. **Admin Panel:** Zatwierdzenie wypłaty (`/api/admin/payouts/approve`).
3. **Stripe:** Zlecenie transferu zakończone sukcesem (`tr_sim_...`).
4. **Weryfikacja Portalu:** Dostępne saldo zaktualizowane do `$0.40`, a w historii wypłat pojawił się status **Wypłacono** z identyfikatorem transferu Stripe!

### Test 3: Manualne Dodanie Nowego Partnera przez API
1. Dodano partnera **Vercel** (`hosting`, 15% rev-share, upstream stdio `npx -y vercel-mcp-server start {api_key}`).
2. Rekord zapisany w `data/partners/5f9ea600-2663-45a1-b9c3-b0a5a1c1920f.json`.
3. Serwer MCP natychmiast go rozpoznał.

### Test 4: Zestaw Testów Serwera MCP (`npm test` w mcp-server)
```text
✔ admin API rejects missing token and invalid partners
✔ partner added in admin is usable through MCP, cashback can be requested and paid
✔ deactivating a partner in admin removes it from MCP without restart
✔ partner's own MCP server is proxied through the gateway with the dev's API key
✔ remote (HTTP) partner MCP server receives the dev's API key as a header
✔ gateway refuses stdio commands outside the allowlist even if a config file bypasses the admin API
ℹ pass 6, fail 0 (100% pass)
```

---

## 3. Jak Otworzyć i Korzystać z Platformy

Aplikacja webowa działa lokalnie pod adresem:

👉 **Strona główna (Landing Page):** [http://localhost:3000](http://localhost:3000)  
👉 **Panel Klienta / Developera:** [http://localhost:3000/portal](http://localhost:3000/portal)  
👉 **Panel Administratora:** [http://localhost:3000/admin](http://localhost:3000/admin)  
