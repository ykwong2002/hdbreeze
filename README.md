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
