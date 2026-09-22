# ZachGPT Support

En spøgefuld supportportal: kolleger opretter sager i en kø, sagerne gøres op som
fakturaer, og modtageren kan betale med drikkepenge — eller ved at nominere
Zacharias til månedens medarbejder.

Bygget i Bring-farver med Hedwig-designtokens. Ingen rigtige penge, ingen
betalingsside, ingen backend-integration mod noget virkeligt.

## Kom i gang

```bash
node server/server.mjs
```

Åbn <http://localhost:8787>. Serveren kræver ingen npm-pakker.

Vil du bare kigge på HTML'en uden server, kan `index.html` åbnes direkte i
browseren — så kører den på `localStorage`.

## Sådan hænger det sammen

| Fil | Indhold |
|---|---|
| `index.html` | Hele sidens markup: topbar, dialoger, footer |
| `css/styles.css` | Al styling. Farver ligger som CSS-variabler øverst |
| `js/config.js` | Hvilket datalag der bruges |
| `js/data.js` | **Alt det sjove.** Linjeposter, priser, hastegrader, niveauer, replikker |
| `js/store.js` | Datalaget — tre udskiftelige backends |
| `js/app.js` | Visninger og logik |
| `server/server.mjs` | Statisk server + JSON-API til lokal kørsel (Node) |
| `server/api.php` | Samme API i PHP, til webhoteller uden Node |
| `server/htaccess.txt` | Omskrivningsregler til Apache — omdøbes til `.htaccess` |
| `build.mjs` | Samler alt til én fil i `dist/artifact.html` |

Vil du ændre jokes, priser eller kategorier, skal du kun røre `js/data.js`.
Hver post i `PRESETS` er både en linjepost på regningen og en kategori i køen.

## Datalag

`js/config.js` styrer hvor data havner:

- **`auto`** (standard) — artifact-databasen hvis siden kører som Claude-artifact,
  ellers `localStorage`.
- **`rest`** — dit eget API. Vælg denne når du hoster selv og vil dele data
  mellem kolleger.
- **`local`** — tvungen `localStorage`. Data deles ikke mellem browsere, så
  Ærestavlen bliver ensom.

Til hosting:

```js
window.ZG_CONFIG = { backend: "rest", apiBase: "/api" };
```

### API-kontrakt

`server/server.mjs` implementerer den allerede, men du kan lægge hvad som helst bag:

```
GET    /api/<samling>        -> [{id, ...}, ...]
POST   /api/<samling>        -> {id}
PUT    /api/<samling>/<id>   -> {ok:true}    (erstatter)
PATCH  /api/<samling>/<id>   -> {ok:true}    (fletter ind)
DELETE /api/<samling>/<id>   -> {ok:true}
```

Samlinger: `invoices`, `tickets`, `tips`, `settings`. Der er ingen websockets — klienten
poller hvert fjerde sekund, hvilket er rigeligt til tyve kolleger.

Skal det op på Supabase, Firebase eller noget helt tredje, så skriv en backend
med de fem metoder (`watch`, `add`, `set`, `update`, `remove`) i `js/store.js`
og returnér den fra `pick()`.

## Links til den enkelte

Hver visning har sin egen adresse:

```
#/koe                      køen og sagsoprettelse
#/regninger                receptionen med alle regninger
#/faktura/<slug>           én persons regning
#/tavlen                   Ærestavlen
#/admin                    dit adminpanel
```

Under **Admin → Gemte regninger** står linket til hver enkelt regning med en
kopiér-knap. Send det i en privat besked, så ser modtageren sin egen regning
først i stedet for at lede efter sit navn.

Direkte links virker på den hostede version. I artifact-versionen ligger siden i
en iframe, så adressen kan ikke deles — der lander alle i receptionen og vælger
selv navn.

## Deployment

Det er en statisk side plus et lille API.

- **Kun statisk** (GitHub Pages, Netlify, Vercel, S3): upload `index.html`,
  `css/` og `js/`. Sæt `backend: "local"` — hver kollega får så sin egen
  private kopi af data, og Ærestavlen virker ikke på tværs.
- **Med delt data**: kør `server/server.mjs` bag en reverse proxy, eller peg
  `apiBase` mod et API du hoster et andet sted. `server/data.json` er en
  almindelig fil — tag en kopi af den hvis du vil beholde Ærestavlen.

### På et almindeligt webhotel (Simply.com m.fl.)

Danske webhoteller kører typisk PHP og ikke Node, så `server/server.mjs` kan
ikke bruges der. `server/api.php` er den samme API i PHP.

1. Opret et subdomæne, fx `zachgpt.zpolonius.dk`.
2. Sæt `backend: "rest"` og `apiBase: "/api"` i `js/config.js`.
3. Læg følgende i subdomænets rod via FTP:
   - `index.html`, `css/`, `js/`
   - `server/api.php` → flyt op i roden som `api.php`
   - `server/htaccess.txt` → omdøb til `.htaccess`
4. Sørg for, at PHP må skrive i mappen. `data.json` oprettes automatisk ved
   første skrivning; `.htaccess` blokerer for, at den kan hentes i browseren.

Tjek at det virker: `https://dit-subdomæne/api/invoices` skal svare `[]` eller
en liste — ikke en 404. Kommer der 404, understøtter serveren ikke omskrivningen,
og så kan `apiBase` sættes til `"/api.php"` i stedet.

`data.json` er hele databasen. Tag en kopi inden du rydder op.

## Artifact-versionen

Claude-artifacts skal være én enkelt fil:

```bash
node build.mjs
```

Det skriver `dist/artifact.html` med CSS og JS inlinet. Publicér den fil som
artifact, så bruger den automatisk artifact-databasen — der skal ikke rettes i
`config.js`.

## Hvad der ikke er ægte

Alle beløb, satser, sagsnumre, svartider og "betalinger" er opdigtede. Der
findes ingen betalingsintegration, ingen konti og ingen rigtig HR-proces bag
nomineringen. Siden er en intern spøg og skal ikke se ud som noget officielt fra
Bring eller Posten.
