# ZachGPT Support

En spøgefuld supportportal: kollegerne opretter sager i en kø, sagerne bliver løst,
og bagefter bliver arbejdet gjort op som en faktura med en tip-terminal, der ikke
tager et nej for et nej. Bygget i Posten/Bring-designsproget (Hedwig), Bring-grøn.

**Det er en joke.** Ingen penge skifter hænder, der er ingen betalingsintegration,
og der er ingen knap der fører til en rigtig betalingsside.

## Kom i gang

```bash
node server/server.mjs
```

Åbn <http://localhost:8787>, og sæt `backend: "rest"` i [`js/config.js`](js/config.js)
for at bruge serverens fælles data. Uden serveren kan du bare åbne `index.html`
direkte i browseren — så kører den på `localStorage`.

Der er ingen afhængigheder og intet byggetrin for at udvikle. Node bruges kun til
serveren og til at bygge artifact-filen.

## Sådan hænger det sammen

| Fil | Ansvar |
|---|---|
| `index.html` | Sidens skelet: topbar, servicevindue-banner, footer, skyldsmodal |
| `css/styles.css` | Al styling. Farver som CSS-variabler i `:root`, med mørkt tema |
| `js/config.js` | Valg af datalag |
| `js/data.js` | **Indholdet.** Linjeposter, priser, hastegrader, tip-niveauer, skyldstrin |
| `js/store.js` | Datalaget. Tre backends bag ét lille API |
| `js/app.js` | Visninger og logik |
| `server/server.mjs` | Statisk server + JSON-API. Ingen afhængigheder |
| `build.mjs` | Samler alt til én fil i `dist/artifact.html` |

### De fire visninger

- **Køen** — skema til at oprette en sag, plus køen og de løste sager
- **Regninger** — receptionen, hvor man finder sit eget navn og betaler
- **Ærestavlen** — live rangliste over hvem der har tippet
- **Admin** — ufaktureret arbejde, og formularen der bygger regningen

## Det du helst vil rette i

Alt det sjove ligger i [`js/data.js`](js/data.js).

`PRESETS` er både linjeposterne på regningen og kategorierne i køen. Hver post har
`desc` (linjen), `note` (den lille tekst under) og `unit` (prisen per stk):

```js
{ id: "sofa", desc: "Svar uden for arbejdstid",
  note: "Efter 21.00. Fra sofaen.", unit: 450 }
```

`URGENCY` er hastegraderne. Pointen er, at jo mere det haster, jo værre bliver den
lovede svartid — `sla` er løftet, `ack` er kvitteringen man får:

```js
{ id: "braen", label: "DET BRÆNDER", sla: "Estimeret svar: 2 hverdage.",
  ack: "Hastegrad er noteret og arkiveret. Alt brænder hos alle." }
```

`TIERS` er statusniveauerne på Ærestavlen, `STAGES` er de tre trin i skyldsmodalen
når nogen trykker "Ingen tip", og `REBOOTS` er svarene på knappen i footeren.

## Datalaget

`js/store.js` udstiller ét API — `watch`, `add`, `set`, `update`, `remove` — med tre
implementationer bagved:

- **`artifact`** — Claude-artifactens indbyggede database. Vælges automatisk, når
  siden kører som artifact. Realtid, ingen server.
- **`rest`** — dit eget API. Poller hvert 4. sekund. Brug denne når du hoster selv.
- **`local`** — `localStorage`. Virker med det samme, men data deles ikke mellem
  browsere, så det er kun til udvikling.

Vil du hoste på Supabase, Firebase eller noget helt tredje, skriver du en backend
med de fem metoder og returnerer den fra `pick()` nederst i `store.js`. Resten af
appen behøver ikke at vide noget om det.

### API-kontrakten

`RestBackend` forventer dette, og `server/server.mjs` leverer det. Samlingerne er
`invoices`, `tickets` og `tips`.

```
GET    /api/<samling>          -> [{ id, ...felter }, ...]
POST   /api/<samling>          -> { id }        opretter
PUT    /api/<samling>/<id>     -> { ok: true }  erstatter
PATCH  /api/<samling>/<id>     -> { ok: true }  fletter ind
DELETE /api/<samling>/<id>     -> { ok: true }
```

### Dokumenterne

```js
// invoices/<slug>   slug udledes af navnet: "Mette Hansen" -> "mette-hansen"
{ name, greeting, discount, order, items: [{ desc, note, qty, unit }] }

// tickets/<id>
{ name, slug, cat, desc, urgency, status, at, doneAt }
//   cat      = et PRESETS-id
//   urgency  = et URGENCY-id
//   status   = "open" | "done" | "billed"

// tips/<slug>       samme slug som fakturaen
{ name, pct, tip, base, total, bumped, at }
```

## Hosting

Siden er statiske filer. Ét vigtigt forbehold: **uden en server deler folk ikke
data.** `localStorage` lever i den enkelte browser, så hver kollega ville se sin
egen tomme kø.

- **Med deling:** kør `server/server.mjs` et sted (en lille VPS, Render, Fly,
  Railway) og sæt `backend: "rest"`. Serveren serverer både siden og API'et.
- **Statisk hosting** (GitHub Pages, Netlify, en mappe på dit webhotel) virker fint,
  hvis API'et ligger et andet sted — sæt `apiBase` til den fulde URL og slå CORS
  til på serveren.
- **Som Claude-artifact:** `node build.mjs` og publicér `dist/artifact.html`.
  Databasen følger med, men artifacts med database kan kun deles internt i
  organisationen — hvilket passer fint til kolleger.

`server/data.json` er ignoreret i git. Tag en kopi, hvis Ærestavlen skal overleve.

## Ting der kunne bygges videre

- Rigtig adgangskontrol. Lige nu kan alle med linket redigere alt gennem API'et —
  det er kun artifact-versionen, der begrænser hvem der må skrive hvor.
- En kvittering man kan hente som PDF.
- Månedsopgørelse: hvem trak flest sager, hvem tippede aldrig.
- Slack- eller Teams-besked når en ny sag lander i køen.
