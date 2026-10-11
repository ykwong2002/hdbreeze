I want to build a small, minimalistic web game called **HDBreeze** (repo name and site name: `hdbreeze`) about how the layout of HDB blocks shapes wind flow in Singapore neighbourhoods. It is inspired by URA's wind-corridor simulations for Lentor Hills (run in their internal ePlanner tool) and HDB's wind modelling for Punggol and Tengah. I will deploy it publicly and share it on LinkedIn, so most people will open it on a phone, often inside the LinkedIn in-app browser, play for 2 to 5 minutes, and leave. It has to load fast, be obvious within 10 seconds, and be fun to screenshot.
 
## Repo
 
- GitHub repo: https://github.com/ykwong2002/hdbreeze.git (currently empty). If this folder is not already a clone of it, set it as the `origin` remote.
- First, before planning: save this whole brief verbatim as `docs/brief.md`, and add a minimal `README.md` and `.gitignore`. That is the only file writing allowed until I approve the plan.
- Once I approve the plan, save it as `docs/plan.md`.
- Commit in small, clearly described steps, one milestone per branch or PR. Ask before the first push and before anything that rewrites history.
**Do not write code yet.** Research where I've flagged open questions, then give me a plan I can approve. What I want back is listed at the end.
 
## The game
 
- The player sees a real 3D map of Singapore and pans/pinches around it (touch and mouse).
- Each level is a real HDB town (e.g. Punggol, Tengah, Ang Mo Kio, Yishun). Choosing a town flies the camera to a play area of roughly 600 to 900 m across inside it.
- Each play area has a few empty development plots. The player places buildings on those plots and can change each building's shape, its height, and its rotation.
- **The player can only build HDB blocks.** The palette is a small fixed set of recognisable HDB typologies: slab block, point block, L-shaped/staggered block, courtyard cluster. Plus one or two low filler pieces HDB also builds (multi-storey carpark, precinct pavilion or hawker centre) that add no homes. Existing surrounding buildings of any kind (condos, malls, schools) stay as fixed obstacles.
- **Void deck toggle** per residential block: on means the ground floor is open, so wind passes underneath at pedestrian level (at the cost of one floor of homes). This is a signature mechanic, make it visible in the 3D model (block raised on columns) and in the wind field.
- A live wind simulation is drawn on the ground, like URA's images: flow streaks plus a colour field. Colour means felt temperature: blue is cool, red is hot, with a continuous ramp between.
- Little residents walk around the play area. Speech bubbles pop up with Singlish complaints when they are hot ("why so hot ah?", "can't the government install aircon on the street??") and happy lines when cool ("finally can wear sweater outside", "since when Singapore so cold one").
- A satisfaction score (0 to 100) updates live as buildings are placed or edited. Each level is cleared when the score passes a threshold.
## Decisions I've already researched (challenge them if you find a real problem)
 
### 1. Map and 3D buildings: MapLibre GL JS, not Google or OneMap
 
- Use **MapLibre GL JS** with a free OpenStreetMap-based vector tile source and a `fill-extrusion` layer for existing buildings. It gives pan, pinch, rotate and tilt on mobile for free, needs no API key, and the same extrusion layer can draw the player's buildings from a GeoJSON source (regenerate the footprint polygon in JS on rotate/reshape and call `setData`).
- Tile source: start with OpenFreeMap's public styles. Verify its current terms and whether it is acceptable for a public site that might get a traffic spike. Fallback: a self-hosted Singapore-only PMTiles extract (Protomaps basemap, or Overture buildings via `pmtiles extract --bbox`) served as a static file.
- Ruled out: **OneMap 3D** (SLA's detailed national 3D model is view-only in their own viewer, the data is not downloadable); **Google Photorealistic 3D Tiles** (Singapore is covered, but it needs a billed API key, the photoreal mesh is heavy on phones, clashes with a minimal look, and gives me no clean footprints to use as simulation obstacles).
- Restyle the basemap to be very plain: pale ground, white/grey buildings, minimal labels. The wind field should be the most colourful thing on screen.
### 2. Data sources (all open)
 
| Need | Source |
|---|---|
| Town boundaries for level select | data.gov.sg "Master Plan 2025 Planning Area Boundary (No Sea)", dataset `d_2cc750190544007400b2cfd5d7f53209` (fields `PLN_AREA_N`, `REGION_N`). These are URA planning areas; HDB towns mostly share the same names. |
| Land use, to find real residential / reserve plots | data.gov.sg "Master Plan 2025 Land Use Layer", dataset `d_a8c3546b26712e35021f3a681d0353ae` (fields `LU_DESC`, `GPR`) |
| HDB block footprints | data.gov.sg "HDB Existing Building", dataset `d_16b157c52ed637edd6ba1232e026258d` (GeoJSON; `BLK_NO`, `ST_COD`, `POSTAL_COD`) |
| HDB block heights | data.gov.sg "HDB Property Information", dataset `d_17f5382f26140b1fdae0ba2ef6239d2f` (CSV; `max_floor_lvl` per block and street). Height ≈ floors × ~3 m. |
| Prior art for joining the two | NUS Urban Analytics Lab `ualsg/hdb3d-code` and `ualsg/hdb3d-data` on GitHub (OSM footprints + HDB storeys, joined through OneMap geocoding; CityJSON/OBJ). Useful as a method reference; the data itself is from 2019/2020. |
| All other buildings | OSM via the vector tiles, or Overture Maps: `overturemaps download --bbox=... -f geojson --type=building`. Many non-HDB buildings lack height; use a sensible default by type. |
 
data.gov.sg download pattern: `GET https://api-open.data.gov.sg/v1/public/api/datasets/{id}/poll-download` returns a URL to the file. Rate limits apply, so fetch at build time, never from the browser.
 
**Bake level data at build time.** A script should clip each level's play area and write one small static JSON per level: existing building footprints + heights (these are the fixed simulation obstacles), plot polygons, walkable paths for residents, prevailing wind direction(s), housing target, score threshold. The runtime never calls a government API.
 
Plots: I'm fine with hand-authored plot polygons per level (a `levels/*.json` file I can edit), informed by the land use layer. Don't build an automatic plot finder.
 
### 3. Wind simulation: 2D GPU grid solver at pedestrian level, in WebGL2
 
Real planners use 3D CFD on HPC clusters. This is a toy that has to feel right and teach the right intuitions, at 60 fps on a mid-range phone.
 
- A 2D incompressible flow solver on a grid of about 256×256 over the play area, run in fragment shaders with ping-pong float textures. Buildings are rasterised into an obstacle mask.
- **WebGL2, not WebGPU.** WebGPU now ships in current Chrome, Safari 26+ and desktop Firefox, but Android support depends on device/GPU, Firefox for Android lacks it, and in-app webviews lag. WebGL2 runs nearly everywhere. Check float render-target support (`EXT_color_buffer_float`, fall back to half-float) and plan a degraded mode (smaller grid) for weak devices.
- Solver choice: start from a stable-fluids style solver (semi-Lagrangian advection + Jacobi pressure projection, as in Pavel Dobryakov's well-known WebGL fluid demo, which is proven on phones; check its licence before borrowing code). It cannot blow up, which matters for a game. The alternative is lattice Boltzmann D2Q9 (see `rafaelanderka/lattice-boltzmann-simulator` for a WebGL2 example), which handles obstacles and wakes more naturally but can go unstable. I want a short spike comparing both on the same obstacle layout before committing.
- Boundary conditions: constant inflow from the prevailing wind direction on the upwind edges, open outflow downwind, no-slip at buildings. Wind direction is per level and should be switchable: Singapore's prevailing winds come from the north/north-east in the Northeast Monsoon (Dec to early Mar) and from the south/south-east in the Southwest Monsoon (Jun to Sep). A later level can require a layout that works in both.
- **Temperature field** (this is what gets coloured): advect a scalar "heat" with the flow. Inflow air arrives cool. Every ground cell adds heat each step (sun-baked ground), less in building shade and on parks/water. Result: ventilated corridors stay blue, stagnant pockets behind slabs and inside courtyards turn red. This also makes the colour honest: red really is where air isn't moving.
- **Height in a 2D model** (my proposal, please critique): height does three things. (a) Blockage: low buildings are partly "porous" (wind passes over), tall ones are solid, via a drag/penalisation term scaled by height. (b) Shade: taller buildings cast a larger cool patch downwind-independent of flow, a simple offset blur of the footprint is enough. (c) Capacity: homes = footprint × floors. (d) Void deck: a block with its void deck on is treated as mostly porous at pedestrian level regardless of height, but still casts full shade. So tall thin towers house many people, shade well and leave gaps for wind; long slabs perpendicular to the wind wall it off. That is the core lesson of the game.
- Rendering: colour ramp for temperature plus animated streaks/particles advected by the velocity field (the look of URA's images). Decide whether this is a MapLibre custom layer sharing the map's GL context or a separate canvas fed in as a `canvas` source georeferenced to the play-area bounds; spike both if unsure. It must stay locked to the ground when the map tilts and rotates.
### 4. Satisfaction score
 
The danger: if score only rewards airflow, the best move is to build nothing. So each level has a **housing target** ("house 3,000 residents on these plots"). The level is cleared only when the housing target is met **and** satisfaction is above the threshold.
 
- 30 to 60 resident agents walk along the baked paths (and through void decks/gaps where sensible).
- Each agent samples the temperature field at its position (read back a downsampled field a few times a second, not every frame) and keeps a smoothed personal comfort value in [0,1]. Map the display range to roughly 27 °C (delighted) to 35 °C (miserable) so the HUD can show a believable "feels like" number.
- Satisfaction = 100 × mean comfort across agents, eased over about a second so it glides instead of jittering. Show it as one big number with a bar and the threshold marked. Require it to hold above threshold for a few seconds to clear the level.
- Because the score comes from where people actually walk, the player is rewarded for ventilating paths and gathering spots, not empty corners. Say so in a one-line hint.
- Speech bubbles: every 1 to 2 seconds one random agent speaks a line chosen from a tier matching its own comfort. Four tiers. Starter lines (write 12+ per tier, keep them light, no politics beyond gentle "gahmen" jokes, nothing aimed at any group):
  - Miserable: "Why so hot ah?" / "Can't the government install aircon on the street??" / "I melting already lah." / "Walk to MRT only, shirt wet."
  - Warm: "Still a bit warm leh." / "Where got wind?" / "Aiyo, no breeze one."
  - Pleasant: "Eh, not bad ah, got wind." / "Wah, shiok." / "Today can walk to hawker."
  - Cold: "Finally can wear sweater outside." / "Since when Singapore so cold one." / "Who on the aircon outside?"
- End-of-level card: score, stars (1 to 3 by margin over threshold and homes built), and a share button that produces an image or text result for LinkedIn/WhatsApp.
### 5. Scope and stack
 
- Vite + TypeScript, no framework unless you can justify one. Static build, deployable to Vercel / Cloudflare Pages / GitHub Pages. No backend, no accounts, no analytics beyond something privacy-light.
- MVP: 3 levels, all HDB towns: Punggol and Tengah (HDB really used wind modelling to plan them, which makes a good story) plus Yishun or Ang Mo Kio as a dense mature-town level. Lentor Hills is inspiration only; it is a private estate so it is not a level. Levels must be pure data so I can add more towns later without code changes.
- Performance budget: playable within ~3 s on 4G, initial JS under ~500 KB gzipped if feasible, steady 30+ fps on a 3-year-old mid-range Android with the sim running.
- Controls must be thumb-friendly: tap a plot to place, a bottom sheet with block-type chips, a height slider (in storeys), a rotate dial and a void-deck switch. One-finger pan must not fight with dragging a building.
- A 15-second onboarding in the first level instead of a tutorial screen.
- Because the name contains "HDB", the non-affiliation line must be visible on the title screen and in the page's meta description, not only the footer. Use my own visual identity: no HDB/URA logos, colours or typefaces.
- Footer: "HDBreeze is a fan-made toy simulation, not real CFD. Not affiliated with or endorsed by HDB or URA." plus attribution for OpenStreetMap contributors and data.gov.sg (Singapore Open Data Licence). Do not use URA/HDB logos or imagery.
## What I want back from you
 
1. **Open questions answered first**, with what you checked: OpenFreeMap terms and reliability vs self-hosted PMTiles; the cleanest HDB footprint-to-height join (the footprint file has a street code, the property file has a street name) and what fraction of blocks you can match; how complete building heights are in OSM/Overture for the three MVP areas; canvas source vs custom layer for the wind overlay; float-texture support on iOS Safari and Android Chrome.
2. **Architecture**: modules, data flow from build-time bake to runtime, the level JSON schema, and how the sim, map, agents and UI talk to each other.
3. **Simulation design**: the exact update steps per frame, grid size, how obstacles, height-porosity, shade and the heat source are encoded, and the tuning parameters you expect I'll need to fiddle with.
4. **Three throwaway spikes to run before the real build**, each with a pass/fail test: (a) solver comparison on a phone, (b) wind overlay staying registered to a tilted, rotating MapLibre map, (c) baking one real level's data end to end.
5. **Milestones** in order, each ending in something I can open on my phone, with the riskiest work first.
6. **Risks and what you'd cut** if the MVP runs long.
7. **Anything you think I've got wrong**, especially about the physics shortcuts or the scoring being exploitable.
Ask me questions before finalising the plan if an answer would change the architecture.
