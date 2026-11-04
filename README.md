# Excellence ajánlat-szerver

A konfigurátor (konfigurator.html) mögötti kis Node-szolgáltatás. Fogadja az ajánlatkérést, újraszámolja az árat, leadet küld a bevetel.hu CRM-be, elfogadáskor díjbekérőt állít ki a Számlázz.hu-n és e-mailben küldi a szerződéssel, visszahíváskor foglal, emlékeztetőket küld.

**Száraz mód (`DRY_RUN=true`, alapértelmezés):** egyetlen külső rendszert sem hív, minden kimenő hívást a `data/dryrun.jsonl`-be ír, álazonosítóval tér vissza. Így a teljes folyamat kulcsok nélkül is tesztelhető. A kulcsok megérkezése után a `.env`-ben `DRY_RUN=false` és kész.

## Indítás
```
cp .env.example .env     # kulcsok kitöltése (üresen is fut, száraz módban)
npm install
npm start                # http://localhost:3000
npm test                 # másik ablakban: végigjátssza a teljes folyamatot
```
A `public/` mappába másolva a `konfigurator.html`-t `index.html` néven, a szerver azt is kiszolgálja (`/` és `/a/EXC-2026-0001`).

## Végpontok
| Mikor | Hívás | Mi történik |
|---|---|---|
| Form beküldés | `POST /api/quote` `{company, selection:[{id,qty}], utm, customReq}` | ár újraszámolás, ajánlatszám (EXC-ÉÉÉÉ-0001), **lead a CRM-be** (userId = én), ajánlat e-mail az ügyfélnek, értesítés nekem |
| „Elfogadom" | `POST /api/quote/:no/accept` `{gift}` | 7 napon belül 5% levonva, **díjbekérő Számlázz.hu-n**, szerződés generálás, e-mail mellékletekkel, CRM-jegyzet, értesítés |
| „Hívjatok vissza" | `POST /api/quote/:no/callback` `{phone, startTime?, slot?}` | időponttal: **foglalás a CRM-ben**; anélkül: lead-jegyzet; visszaigazoló e-mail |
| „Egyedi árat kérek" | `POST /api/quote/:no/custom-price` `{why,headcount,years,budget,note}` | CRM-jegyzet + értesítés nekem |
| Kérdés | `POST /api/quote/:no/question` `{text}` | e-mail nekem, reply-to az ügyfél |
| Továbbküldés | `POST /api/quote/:no/forward` `{to}` | döntéshozói levél kész indoklással |
| Napi cron | `POST /api/cron/reminders` | 1., 7. (5% lejár), 13. napi (holnap lejár) emlékeztető |
| Facebook | `POST /api/fb/webhook` `{name,email,phone,company,campaign,answers}` | publikus csatornás lead a CRM-be (Zapier/Make küldi) |
| Adószám | `GET /api/nav/:taxid` | NAV cégadat (demó, amíg nincs NAV kulcs) |
| Ellenőrzés | `POST /api/calc` `{selection}` | csak kalkuláció |

## Bekötés a konfigurátorba
1. `src/client/exc-api.js` tartalmát a `konfigurator.html` fő `<script>` elejére.
2. `#reqForm` submit: `state.company = {...}` után  
   `EXC_API.quote(state.company, EXC_API.selectionFrom(state, selected, qtyOf), state.customReq).then(j => { $('#qNo').textContent = j.no; go('quote'); })`
3. `[data-act]` kattintásoknál: `Elfogadva` → `EXC_API.accept(chosenGift).then(() => go('thanks'))`; `Visszahívást kér` → `EXC_API.callback(phone)`; `Kérdés` → `EXC_API.question($('#qQuestion').value)`; `Továbbküldve` → `EXC_API.forward($('#fwdMail').value).then(() => go('fwd'))`.
4. `#cpSend` (egyedi ár popup): `EXC_API.customPrice({why, headcount, years, budget, note})`.
5. `#navBtn`: a `NAV_DEMO` helyett `EXC_API.nav(raw)`.
6. `#tContract` / `#tInvoice`: linkek `j.contractUrl`-re és a díjbekérő PDF-re.

## Kulcsok, amik kellenek (Gábortól / Nóritól)
- `BEVETEL_API_KEY` (leads.write, bookings.write), `BEVETEL_USER_ID` (saját CRM-felhasználó), `BEVETEL_CHANNEL_SPEC_ID`, `BEVETEL_BOOKING_SERVICE_ID` + `RESOURCE_ID`
- `SZAMLAZZ_AGENT_KEY` + bank, számlaszám, előtag
- E-mail küldő kulcs (Resend/Brevo) + SPF/DKIM az excellence.hu-n, a küldő: szabolcs@excellence.hu
- NAV Online Számla technikai felhasználó (adószám-lekérdezéshez; nem kötelező, nélküle kézi cégnév)

## Ismert korlátok
- A bevetel.hu API-ban nincs lead-státusz módosítás és lead-lista; az elfogadást/visszahívást új, jelölt leadként („ELFOGADVA", „VISSZAHÍVÁST KÉR") írjuk be + e-mail. Ha Gábor ad státusz-végpontot, egy sor cseréje.
- A szerződés most egyszerű HTML; a hivatalos docx-sablonból PDF-generálás a következő lépés (docx -> PDF LibreOffice-szal vagy docx-templates + puppeteer).
- A Meta nyers webhookjához (leadgen) Page access token kell; addig Zapier/Make tolja a kibontott mezőket.
- Tár: JSON fájl. Néhány száz ajánlatig bőven elég; utána SQLite.
