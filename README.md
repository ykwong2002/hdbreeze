# HDBreeze

A small, minimalistic web game about how the layout of HDB blocks shapes wind flow at street level in Singapore neighbourhoods. Place HDB typologies on real plots in a real town, watch a live wind and heat field on the ground, and keep the residents comfortable while meeting a housing target.

**HDBreeze is a fan-made toy simulation, not real CFD. Not affiliated with or endorsed by HDB or URA.**

- Brief: [docs/brief.md](docs/brief.md)
- Plan: [docs/plan.md](docs/plan.md)

## Stack

Vite + TypeScript, MapLibre GL JS, a WebGL2 2D wind solver. Static build, no backend, no accounts, no analytics scripts.

## Data and attribution

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, tiles via [OpenFreeMap](https://openfreemap.org) / [OpenMapTiles](https://www.openmaptiles.org/).
- Contains information from [data.gov.sg](https://data.gov.sg) (HDB Existing Building, HDB Property Information, Master Plan 2025 Planning Area Boundary and Land Use Layer), made available under the [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence).
- Level data is baked at build time; the game never calls a government API from the browser.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 (also on your LAN for phone testing)
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ locally
```

Dev switches (query string): `?dev=1` shows a status chip; `?tiles=pmtiles` starts on the self-hosted basemap fallback.

### Basemap fallback (optional)

The map uses OpenFreeMap by default. If `VITE_PMTILES_URL` is set at build time, the app falls back to that Protomaps-schema PMTiles file when OpenFreeMap fails. To produce a Singapore extract (~26 MB):

```sh
brew install pmtiles
pmtiles extract https://build.protomaps.com/<latest>.pmtiles singapore.pmtiles --bbox=103.6,1.2,104.1,1.48
```

Upload it to a bucket that supports HTTP range requests and CORS (Cloudflare R2 is the recommended host) and set `VITE_PMTILES_URL` to its public URL. For local testing put it at `public/tiles/singapore.pmtiles` (gitignored) and set `VITE_PMTILES_URL=/tiles/singapore.pmtiles` in `.env.local`.

## Deploy

Static site on Cloudflare Pages: connect the GitHub repo in the Cloudflare dashboard with build command `npm run build` and output directory `dist`, and add `VITE_PMTILES_URL` as a build variable if you host the fallback. `npm run deploy` runs `wrangler pages deploy` for a manual deploy of a local build.

## Screenshot check

`tools/shoot/shoot.mjs` drives the locally installed Chrome headlessly, waits for the map to finish loading, reports which layers rendered, and saves phone-sized screenshots. Run `npm run preview` in one terminal, then:

```sh
npm run shoot -- "overview=" "punggol=cam=103.9065,1.4045,15.8,55,20" "fallback=tiles=pmtiles"
```
