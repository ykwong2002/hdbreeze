# HDBreeze — plan

Approved 2026-10-11. Decisions confirmed at approval: hosting on Cloudflare Pages with the PMTiles fallback on R2; third level is Ang Mo Kio; no analytics scripts at all (reach measured from LinkedIn post stats and Cloudflare request counts).

## Context

HDBreeze is a small static web game (Vite + TypeScript, MapLibre GL JS, WebGL2) about how HDB block layout shapes pedestrian-level wind in Singapore towns. Players place HDB typologies on empty plots inside a real town, watch a live 2D wind/temperature field, and raise a resident-satisfaction score while meeting a housing target. Target audience opens it on a phone from LinkedIn, plays 2 to 5 minutes, screenshots it.

The brief (`docs/brief.md`) fixes most decisions. This plan answers the open questions, proposes the architecture and simulation design, defines three spikes, orders milestones with the riskiest work first, and lists what to cut.

## 0. Repo bootstrap

1. `git init -b main`, `git remote add origin https://github.com/ykwong2002/hdbreeze.git`.
2. `docs/brief.md` (verbatim brief), `README.md` (one paragraph + non-affiliation line + attribution), `.gitignore` (node_modules, dist, `data/raw/`, `.env*`, `.DS_Store`).
3. `docs/plan.md` (this document).
4. Commit; ask before first push.

Branching: `main` holds approved milestones. Spikes on `spike/<name>` branches, never merged (kept for reference). Each milestone on `m<N>-<slug>` branch, merged via PR.

## 1. Open questions — answers (what was checked, 2026-10-11)

### 1.1 OpenFreeMap vs self-hosted PMTiles

Checked: openfreemap.org homepage and ToS, the GitHub issue tracker, live style/TileJSON endpoints, decoded two live Singapore z14 tiles; Protomaps build metadata, a real `pmtiles extract --dry-run` against build 20261010, Cloudflare Pages/R2/GitHub Pages/Vercel limit pages.

- **Terms**: "no limits on the number of map views or requests", commercial use allowed, provided "AS-IS … may discontinue at any time without notice", no SLA, donation-funded by one maintainer. Attribution to OpenMapTiles + OSM is mandatory (MapLibre adds it from TileJSON); OpenFreeMap credit optional.
- **Reliability**: no status page. One real incident: 23–24 May 2026, tiles returned 403 without CORS headers for ~1 day; nginx rebuilt Sep 2026. Two dedicated servers, round-robin DNS.
- **Heights**: Liberty style's `building-3d` layer extrudes `render_height` = `ceil(coalesce(height, levels*3.66, 5))`. Toa Payoh z14 tile: 200/200 buildings have heights, only 2 at the 5 m default, 120 ≥ 30 m. HDB blocks are well tagged in OSM. Styles: liberty, bright, positron, dark, fiord verified live; the advertised "3d" style URL 404s.
- **PMTiles fallback**: Singapore bbox 103.6,1.2,104.1,1.48 at z0–15 = **1617 tiles, ~26 MB** (z15 needed for individual buildings; z14 = 12 MB but buildings are merged). That is over Cloudflare Pages' 25 MiB per-file cap, so host it on **Cloudflare R2** (free: 10 GB, 10 M reads/month, zero egress) with `pmtiles` 4.5 protocol. Licence: ODbL produced work, OSM attribution.
- **Decision**: ship with OpenFreeMap as primary (it has heights, zero setup) **and** bake the fallback in from M0: a copy of the Liberty style vendored into the repo with the source URL swappable, plus an R2-hosted Singapore PMTiles extract. At runtime, if the tile source emits errors for the first tiles, swap to the PMTiles source. Cost: one extra style file and a ~26 MB upload to R2. Since we only need the basemap for context (see 2.1, buildings in the play area come from our own baked data), either source looks identical.

### 1.2 HDB footprint → height join (measured on the real files)

Checked: downloaded all four data.gov.sg datasets and ran the join in Python (scripts kept in the session scratchpad; they become `tools/bake/hdb-join.ts`).

- **HDB Existing Building**: 57 MB GeoJSON, 13,436 features, one polygon per block, WGS84. Properties are plain (no HTML description): `BLK_NO, ST_COD, POSTAL_COD, …`. `POSTAL_COD` is unique per footprint; 98.9% follow the HDB convention (last 3 digits = block number).
- **HDB Property Information**: 13,392 rows, `(blk_no, street)` unique, `max_floor_lvl` 1–50 (median 12), 80.8% `residential=Y`. **No postal code column.**
- **`ST_COD` is an opaque HDB code** (`AAA99A`, 660 distinct values, letters are a mnemonic, digits are not the street number). No lookup table exists on data.gov.sg or elsewhere.
- **Join that works (offline, deterministic)**: for each `ST_COD`, pick the Property Info `street` whose set of block numbers best matches the code's block set (greedy one-to-one on Jaccard, accept containment ≥ 0.5). 655/660 codes map, 653 with full containment. Result: **13,316 / 13,436 footprints (99.1%) match exactly one height row, 0 ambiguous.** The 120 unmatched are 116 Pasir Ris holiday chalets (no Property Info rows at all) and 4 SERS-vacated blocks. Validated against a 144-footprint random sample via OneMap postal search: 144/144 agree.
- **In the candidate play areas: 100% match** — Punggol 989/989 (median 17 storeys, max 26), Tengah bbox 770/770 (13 / 40, but half are Bukit Batok West and Jurong West blocks), Yishun 698/698 (12 / 16), Ang Mo Kio 468/468 (12 / 34).
- Bake pipeline: commit the 660-row code→street table to `tools/bake/data/stcod-street.json`; the bake asserts ≥ 99% match and lists any new unmapped codes so the table can be extended by hand. Reverse gap: 126 Property Info rows have no footprint, 98 of them completed 2023+ (the footprint layer lags new BTOs). Newest Punggol/Tengah blocks may therefore be missing; the OSM merge (1.3) fills them.
- Download gotchas: `poll-download` tolerates ~1 call per 10 s without a key; the S3 URL rejects Python's default User-Agent (use a browser-like UA or curl). `GPR` in the land-use layer is a string mixing numbers with `LND`, `EVA`, `SDP`.

### 1.3 OSM / Overture height completeness for the MVP areas

Checked: Overpass tag counts for three bboxes (Punggol's query failed on three mirrors, retry during spike C); Overture schema docs.

| Area | OSM building ways | with `height` | with `building:levels` | neither |
|---|---|---|---|---|
| Tengah bbox | 1,947 | 5% | 48% | 48% |
| Yishun bbox | 1,818 | 1% | 55% | 45% |
| Ang Mo Kio bbox | 1,764 | 1% | 41% | 58% |

- `building:levels` is the usable tag and sits on 80–94% of `residential`/`apartments` ways, which are almost all HDB blocks (we get those from data.gov.sg anyway). Non-HDB buildings (`house`, `yes`, schools, malls) mostly lack any height.
- **Decision**: HDB blocks come from the data.gov.sg join (authoritative storeys). Everything else comes from OSM via Overpass at bake time with `building:levels × 3.3 m`, else `height`, else a default by tag (`house` 7 m, `school` 12 m, `retail`/`commercial` 15 m, `yes` 9 m, `construction` skipped). Overture has `height`/`num_floors` with per-feature `sources`, but its Singapore heights are mostly OSM-derived, so it adds a heavy dependency for no gain; keep it as a later option only.
- Non-HDB buildings are dim grey in the style, so a wrong default height is cosmetic. HDB blocks, which carry the lesson, are exact.

### 1.4 Canvas source vs custom layer for the wind overlay

Checked: MapLibre 6.13.0 source (`canvas_source.ts`, `draw_custom.ts`, `draw_fill_extrusion.ts`, `frame_render_context.ts`), official custom-layer example, existing wind-layer ports.

- MapLibre is **6.13.0** (2026-10-06), **287 KB gzipped**, **WebGL2-only** since 6.0 (throws if unavailable), custom layers receive a `WebGL2RenderingContext`.
- **Canvas source**: corners are projected through `MercatorCoordinate`, drawn as a raster tile quad, so registration under pitch/bearing is exact. Each frame MapLibre runs `texSubImage2D` from the canvas (`animate: true`). Costs a second GL context and a GPU→GPU copy per frame, and a WebGL source canvas must either render in the same rAF before `triggerRepaint` or use `preserveDrawingBuffer: true`. Workable, slightly wasteful.
- **Custom layer**: vertices in Mercator units, `gl_Position = defaultProjectionData.mainMatrix * vec4(pos,0,1)`. MapLibre resets its cached GL state after `render()`, but the layer must bind its own VAO/program/textures every frame. `prerender` may bind its own FBOs, so the solver's ping-pong textures live in the map context. three.js/Babylon examples already run full renderers this way.
- **Depth/ordering**: fill-extrusion and `renderingMode: '3d'` custom layers share one depth range; 2D layers above a 3D layer use painter's order. Put the ground overlay **before** the buildings layer in the style (`map.addLayer(overlay, 'buildings-3d')`); agent sprites go in a `'3d'` custom layer after buildings so they are depth-tested against them.
- Prior art: fbrosda/weather-maps and astrosat/windgl are custom-layer ports of mapbox/webgl-wind (ISC) with the ping-pong particle texture + fading trail pattern we want.
- **Decision**: custom layer, one GL context, overlay drawn under buildings. Spike B confirms registration and the depth behaviour; canvas source is the fallback only if the shared-context route misbehaves on a phone.

### 1.5 Float render targets on iOS Safari and Android Chrome

Checked: caniuse, MDN BCD, WebKit bugs 247240 and 241399, web3dsurvey, Chromium reviews, Dobryakov's and rafaelanderka's source.

- **iOS**: WebGL2 on by default since iOS 15. RGBA16F renderable since iOS 15.4 (`EXT_color_buffer_half_float`). RGBA32F renderable only since iOS 16.4 (`EXT_color_buffer_float`), **no blending into 32F** (no `EXT_float_blend` on iPhone GPUs), and **no `OES_texture_float_linear` on iPhones** (iPad only). Half-float is filterable in core WebGL2, so bilinear advection works on 16F everywhere.
- **Android**: `EXT_color_buffer_float` ~99.9% on Chrome/WebView; some stacks expose only the 32F extension, which also makes 16F renderable. Old Mali drivers need explicit `precision highp float` and may silently downgrade; always probe `FRAMEBUFFER_COMPLETE` per format.
- **Decision**: default **RGBA16F / RG16F / R16F**, probe each format with a 4×4 FBO, fall back to RGBA16F for all, then to packed RGBA8 (degraded mode). Never rely on 32F; never blend into float targets; store small-magnitude quantities (velocity, heat offset) so 10-bit mantissa is enough. `antialias: false` on the context.
- **WebGPU** (for the record): Chrome Android 121+ on Qualcomm/ARM only, iOS 26+, Firefox Android off, Android WebView unconfirmed. Not a baseline; WebGL2 it is.
- **Licences**: Dobryakov WebGL-Fluid-Simulation MIT (half-float by default, `SIM_RESOLUTION 128`, 20 Jacobi iterations, **no obstacle support**). rafaelanderka LBM MIT (WebGL2, TRT collision, 32F preferred, bounce-back walls painted into a node texture, periodic domain, blocks phones by viewport size). GPU Gems ch. 38 for obstacle-aware boundaries (text, not code). Avoid haxiomic (GPL) and VortexShedding (no licence).

### 1.6 Solver choice, informed by the research

The research tilts the spike toward lattice Boltzmann more than the brief expected: bounce-back makes arbitrary rectangular obstacles trivial and local (one branch per direction), wakes and shedding appear without vorticity hacks, and one fused collide-stream pass costs ~12–21 texture reads against ~125 for stable fluids with 20 Jacobi iterations. Its known weaknesses are exactly the ones the brief worried about: it needs lattice velocity ≤ ~0.1 and relaxation τ ≥ ~0.55 (use TRT collision, not BGK), and half-float storage needs the populations stored as deltas from equilibrium. Stable fluids stays the safe choice if the spike shows LBM instability at speeds that look good. Spike A is therefore kept, with explicit stability criteria below, and the solver module boundary (`solver.ts` exposes `step()`, `setObstacles()`, velocity + heat textures) is the same for both.

## 2. Architecture

### 2.1 Stack

- Vite 6 + TypeScript, vanilla DOM (no framework). Justification: UI is one HUD, one bottom sheet, one card. A framework adds 30 to 45 KB gz and nothing we need.
- MapLibre GL JS 6.x (6.13.0 at time of writing) for basemap, camera, touch handling, 3D extrusions.
- Own WebGL2 code for the solver, overlay and agent sprites, running inside a MapLibre custom layer (fallback: canvas source, decided by spike B).
- Build-time Node scripts (`tools/bake/`) produce static level JSON. The browser never calls data.gov.sg.
- Hosting: Cloudflare Pages for the site, Cloudflare R2 for the ~26 MB PMTiles fallback. Why not Vercel (checked 2026-10-11): Vercel Hobby caps at 100 GB transfer and 1,000,000 CDN requests per month and pauses the site for 30 days when exceeded; a map view is many small requests (≈20 per visitor with OpenFreeMap tiles, 50–100 per level view if the self-hosted tile fallback engages), so a LinkedIn spike could pause the site mid-week. Vercel also does not document HTTP Range support for static assets, which PMTiles needs, while Protomaps documents R2 as the recommended host (free egress). Cloudflare Pages has no bandwidth or request caps on the free plan, and its request counts double as the reach measure since no analytics script will be shipped. GitHub Pages remains a viable second target for the site alone.

### 2.2 Modules

```
tools/bake/            Node + TS, run manually, outputs committed
  fetch.ts             data.gov.sg poll-download with on-disk cache in data/raw/ (gitignored)
  hdb-join.ts          footprints (HDB Existing Building) x heights (HDB Property Info)
  osm.ts               non-HDB buildings for the context ring (Overpass or Overture extract)
  bake-level.ts        reads levels/<id>.json (authored), clips, writes public/levels/<id>.json
  calibrate.md         how thresholds are set (in-browser dev harness, see 4.2)

levels/<id>.json       AUTHORED: play-area bbox, plots, paths, wind, targets, copy
public/levels/<id>.json BAKED: authored + existing buildings + ground-type polygons

src/
  main.ts              boot, device capability probe, route (title / select / level)
  map/
    style.ts           plain MapLibre style (pale ground, grey buildings, few labels)
    map.ts             map init, camera fly-to, pitch/bearing limits per level
    buildings.ts       GeoJSON sources + fill-extrusion layers: existing, placed, void-deck columns
    overlay-layer.ts   MapLibre custom layer: owns the sim + draws field, streaks, agent sprites
  sim/
    gl.ts              WebGL2 helpers, format probe (RGBA16F/RGBA32F), FBO ping-pong
    solver.ts          solver step behind one interface (stable fluids or LBM, decided by spike A)
    obstacles.ts       rasterise buildings/plots/ground into the obstacle texture
    readback.ts        async 64x64 temperature readback (PBO + fenceSync)
    shaders/*.glsl     imported as strings via vite-plugin-glsl or ?raw
  game/
    level.ts           load baked JSON, level state machine (intro, play, cleared)
    typologies.ts      footprint generators for slab, point, L/staggered, courtyard, MSCP, pavilion
    placement.ts       plot selection, building edit (type/height/rotation/void deck), GPR cap
    scoring.ts         homes count, comfort aggregation, eased score, hold-to-clear
    agents.ts          30-60 residents on the path graph, comfort smoothing, speech picker
    lines.ts           Singlish lines by tier
  ui/
    hud.ts             score number + bar + threshold, homes/target, wind compass, season toggle
    sheet.ts           bottom sheet: type chips, storeys slider, rotate dial, void-deck switch
    bubbles.ts         one DOM speech bubble at a time, positioned via map.project
    select.ts          title screen (with non-affiliation line) + town select
    endcard.ts         score, stars, share (image via canvas composite, text fallback)
    onboarding.ts      15 s scripted hints in level 1
  share/capture.ts     map canvas + overlay + HUD composite -> PNG, Web Share API / download
```

### 2.3 Data flow

Build time:

```
data.gov.sg (4 datasets) ──fetch.ts──> data/raw/*.geojson|csv (cached, gitignored)
Overpass/Overture (non-HDB bldgs) ───> data/raw/osm-<level>.geojson
levels/<id>.json (authored) ─────────> bake-level.ts ─> public/levels/<id>.json (~50-150 KB each)
```

Runtime:

```
public/levels/<id>.json
   ├─> map/buildings.ts   existing buildings -> fill-extrusion (replaces tile buildings in a ~1.5 km ring)
   ├─> sim/obstacles.ts   existing buildings + ground polygons -> obstacle texture (static part)
   └─> game/agents.ts     path graph

player edit ─> game/placement.ts ─> state.placed[]
   ├─> typologies.ts footprint polygon ─> buildings.ts setData (placed + columns sources)
   └─> obstacles.ts re-rasterise placed buildings (one GPU pass, < 1 ms)

every frame:   overlay-layer.render() -> solver.step() x N substeps -> draw field + streaks + sprites
every ~250 ms: readback.ts -> Float32Array(64x64) -> agents sample -> comfort -> scoring.ts -> hud
every 1-2 s:   agents.ts picks a speaker -> bubbles.ts
```

Communication: a tiny typed event bus (`on/emit`) in `src/game/events.ts`. Events: `level:loaded`, `building:changed`, `wind:changed`, `temps:updated`, `score:updated`, `level:cleared`. No shared mutable globals besides the `LevelState` object owned by `level.ts`.

### 2.4 Level JSON schema (authored + baked)

```jsonc
{
  "id": "punggol",
  "name": "Punggol",
  "tagline": "HDB modelled the wind here before building. Can you?",
  "camera": { "center": [103.9065, 1.4045], "zoom": 15.6, "pitch": 55, "bearing": 20 },
  "area": { "bbox": [103.9020, 1.4005, 103.9110, 1.4085] },   // ~1000 x 900 m incl. margin
  "grid": 256,                                                 // sim cells per side
  "wind": {
    "seasons": [
      { "id": "ne", "label": "NE monsoon (Dec–Mar)", "fromDeg": 30,  "speed": 1.0 },
      { "id": "sw", "label": "SW monsoon (Jun–Sep)", "fromDeg": 160, "speed": 0.8 }
    ],
    "required": ["ne"]                                         // levels 1-2: one season; level 3: both
  },
  "plots": [
    { "id": "p1", "polygon": [[lon,lat],...], "maxStoreys": 25, "gpr": 3.5, "label": "Reserve site" }
  ],
  "paths": {                                                    // walkable graph for residents
    "nodes": [[lon,lat], ...],
    "edges": [[0,1],[1,2], ...],
    "hotspots": [3, 7]                                         // node ids where agents linger (MRT, hawker)
  },
  "ground": [                                                   // heat-source polygons, baked from land use
    { "kind": "park" | "water" | "road" | "paved", "polygon": [...] }
  ],
  "buildings": [                                                // BAKED: fixed obstacles
    { "src": "hdb" | "osm", "height": 36, "footprint": [[lon,lat],...], "blk": "268A" }
  ],
  "targets": { "homes": 3000, "satisfaction": 70, "holdSeconds": 4 },
  "calibration": { "empty": 61, "naive": 52, "reference": 78 },  // recorded by dev harness
  "palette": ["slab", "point", "l", "courtyard", "mscp", "pavilion"],
  "onboarding": true
}
```

Homes per block = storeys × unitsPerFloor(type) × 3.2 residents per flat (HDB average household ~3.1). Void deck removes one floor. Plot GPR cap: Σ(footprint area × storeys) ≤ gpr × plot area; the sheet greys out the slider above the cap.

### 2.5 Typologies (footprint generators, metres, centred at origin, then rotated and placed)

| Type | Footprint | Units/floor | Storeys range | Notes |
|---|---|---|---|---|
| Slab | 70 × 14 m rectangle | 8 | 10–16 | the "wall" |
| Point | 26 × 26 m cross/plus | 4 | 20–50 | tall and thin |
| L / staggered | two 40 × 14 m arms at 90°, offset | 6 | 12–30 | semi-open |
| Courtyard cluster | 4 slabs around a 40 × 40 m court, gaps 8 m | 16 | 10–20 | traps air unless void decks |
| MSCP | 60 × 35 m | 0 | 4–6 fixed | low filler, adds no homes |
| Pavilion / hawker | 30 × 30 m | 0 | 1 fixed | tiny blockage, gathering hotspot bonus |

Void deck: available on the four residential types. Rendering: main body `fill-extrusion-base` = 4.5 m, plus a ring of 1.2 m square column footprints at base 0 to 4.5 m (second GeoJSON source). Sim: footprint cells get porosity σ_void instead of solid.

## 3. Simulation design

### 3.1 Grid and units

- 256 × 256 cells over the play-area bbox (≈ 3 to 3.5 m per cell for an 800 to 900 m area). Degraded mode: 128 × 128 and 12 Jacobi iterations.
- Units are grid-normalised: free-stream speed U∞ = 1 cell/step at `speed: 1.0`. Each frame runs 1 substep at 60 fps, 2 at 30 fps (dt fixed, so devices converge to the same steady state).
- Textures: velocity (RG16F), pressure (R16F), divergence (R16F), heat (R16F), obstacle (RGBA8, static between edits), particles (RGBA16F state, 128 × 128 = 16 k particles), trail accumulation (RGBA8, screen-sized in overlay space).

### 3.2 Obstacle texture (re-rasterised on every edit and wind change)

| Channel | Meaning | Source |
|---|---|---|
| R | blockage σ ∈ [0,1]: 1 = solid, σ_void ≈ 0.15 under void decks, 0 open | footprints; void-deck flag |
| G | shade factor ∈ [0,1] (multiplies heat source) | footprint blurred with radius k_shade·height (Singapore sun is near overhead, so shade is radial, not downwind) + park/tree polygons |
| B | ground heat source S ∈ [0,1] | paved 1.0, road 0.9, grass 0.5, park 0.25, water 0.0 |
| A | wake shadow w ∈ [0,1] (reduces free-stream recovery) | footprint smeared downwind by L_wake = k_wake·height, alpha fading along the smear |

Rasterisation: draw each polygon (triangulated with earcut, bundled by MapLibre anyway) into a 256² FBO with additive/max blending. Existing buildings and ground are drawn once per level; placed buildings are redrawn on edit. The wake-shadow pass draws each footprint N=8 times stepped along the wind vector. Cost well under 1 ms.

### 3.3 Per-step solver (stable-fluids formulation; the LBM variant replaces steps 1–6 with collide, stream with bounce-back, and the same drag/recovery forcing)

1. **Advect velocity** semi-Lagrangian, bilinear sampling: u* = u(x − u·dt). Sample positions landing in solid cells (σ > 0.99) take velocity 0.
2. **Recovery toward free stream** (the 2D stand-in for air re-entering from above the canopy): u += dt·λ·(1 − w)·(U∞ − u*). λ ≈ 0.02 per step. This is what makes wakes close again, and the wake-shadow channel w makes tall buildings close them slower than low ones.
3. **Brinkman drag** (porosity): u *= 1 / (1 + dt·K·σ), with K large (≈ 50) so σ = 1 is effectively no-slip and σ_void gives a brisk-but-slowed under-deck breeze.
4. **Vorticity confinement** (optional, ε ≈ 0.1): curl → confinement force; keeps wakes lively so streaks show eddies behind slabs. Off in degraded mode.
5. **Divergence**, then **Jacobi pressure** 20 to 30 iterations with obstacle-aware neighbours (solid neighbour's pressure = own pressure, Neumann), **subtract gradient**, zero u inside solid cells.
6. **Boundaries**: a boundary cell is inflow if n̂·U∞ < 0: set u = U∞, T = 0 (cool). Otherwise outflow: copy the interior neighbour (zero-gradient). Switching season rewrites U∞ only; the field re-converges in ~2 to 3 s, which reads as "the monsoon turned".
7. **Heat**: T* = advect(T); T = T* + dt·(S·G_shade·q − κ·T). q ≈ 0.04, κ ≈ 0.01 → stagnant equilibrium T_eq = S·G·q/κ = 4 (dimensionless) on bare paving; ventilated cells sit near 0.2 to 1. Display: feelsLike = 27 + 8·smoothstep(0, 3.5, T) °C. The decay κ is what keeps T bounded; without it stagnant pockets grow forever.
8. **Particles**: position += u(position)·dt·speedScale; respawn when leaving the grid, landing in a solid cell, or after a random lifetime; draw into a trail texture that fades by 0.96 each frame (webgl-wind approach, ISC licence).
9. **Draw** (inside the MapLibre custom layer): a ground quad over the bbox textured with colour ramp(T) blended with trails, alpha 0 inside solid cells; then agent sprites as depth-writing billboards.
10. **Every ~15 frames**: downsample T to 64 × 64, `readPixels` into a PBO, read it the next frame via `fenceSync` so the pipeline never stalls.

### 3.4 Tuning parameters to expect (all in `src/sim/params.ts`, exposed in a dev panel)

| Parameter | Start | Effect |
|---|---|---|
| `jacobiIters` | 24 | wake sharpness vs cost |
| `lambdaRecovery` λ | 0.02 | how fast wind returns behind buildings; too high and slabs stop mattering |
| `kWake` | 2.5 × height | wake-shadow length; the knob that makes height matter |
| `kDrag` K, `sigmaVoid` | 50, 0.15 | how much a void deck lets through |
| `vorticity` ε | 0.1 | eddies in wakes |
| `heatSource` q, `heatDecay` κ | 0.04, 0.01 | contrast between corridors and pockets; sets T_eq |
| `kShade` | 0.6 × height (radius, m) | shade patch size |
| `groundHeat` per kind | 1.0 / 0.9 / 0.5 / 0.25 / 0 | parks matter |
| `tempRange` | 27–35 °C over T 0–3.5 | HUD honesty |
| `comfortSmoothing` | 0.5 s | agent memory |
| `scoreEase` | 1 s | glide |
| `particleCount`, `trailFade`, `speedScale` | 16 k, 0.96, 1.5 | the look |

### 3.5 Where the brief's physics shortcuts need amending

- **Low buildings should not be porous at pedestrian level.** A 5-storey carpark is a wall to a pedestrian. Streaks passing through a carpark will look like a bug. Keep every footprint solid at ground level and let **height act through wake length** (channel A) instead. This keeps the lesson (tall slab = long wake, low filler = short wake) and the picture honest.
- **Shade is radial, not downwind.** Singapore's sun is within ~25° of overhead most of the day, so the shade that matters is the footprint plus a short apron. A radial blur scaled by height is right; a downwind offset would teach the wrong intuition.
- **Heat needs a decay term** or stagnant cells grow unbounded. κ is the "vertical mixing" knob and sets the maximum felt temperature.
- **Not modelled, say so in the footer**: downwash at tall faces (real tall towers create gusty corners), thermal buoyancy, rain, humidity. "Not real CFD" covers it.

## 4. Game systems

### 4.1 Residents (agents)

- 30 to 60 agents walk the baked path graph at ~1.4 m/s × 2 game speed; at hotspots they pause 3 to 8 s. When a placed block has its void deck on, 4 extra nodes under the block join the graph via the nearest path node, so void decks become hangouts (visible reward).
- Each agent samples T at its position from the 64 × 64 readback (bilinear), converts to comfort c = 1 − smoothstep(27, 35, feelsLike), smoothed with τ = 0.5 s.
- Rendering as sprites in the custom layer (depth-tested against extrusions), 2-frame walk cycle, tinted by own comfort so the crowd itself reads as a heat map.

### 4.2 Score and clearing

- satisfaction = 100 × mean(c), eased with τ = 1 s. HUD: big number, bar, threshold tick, homes/target chip, season chip.
- Level cleared when homes ≥ target **and** satisfaction ≥ threshold for `holdSeconds` continuously (and for both required seasons on the two-season level, toggled automatically during the hold).
- Stars: 1 = cleared; 2 = margin ≥ 8 points or homes ≥ 1.2 × target; 3 = both.
- Threshold calibration: a dev-only harness (`?dev=1`) auto-fills each level with (a) nothing, (b) all slabs perpendicular to wind at max storeys ("naive"), (c) a hand-made reference layout, waits 5 s each and logs the score. Thresholds are set between naive and reference and recorded in the level JSON `calibration` block.

### 4.3 Exploit review

| Exploit | Guard |
|---|---|
| Build nothing | housing target |
| Max height everywhere | plot GPR cap + longer wake shadows downwind hurt the next path; per-plot maxStoreys |
| Only point blocks | fine, it's the lesson; but units/floor is 4, so homes target forces several towers, each with a wake |
| Only build on the plot farthest from paths | plots are chosen so each sits upwind of a walked path; homes target needs most plots |
| Stand still at threshold | hold time; eased score |
| Void deck on everything | costs a floor each (homes), so it trades against the target; it should be the right call often, that's the point |
| Baseline already passes | calibration harness; threshold is set above the empty-plot score by design |

### 4.4 Speech bubbles

One bubble at a time, every 1 to 2 s, from a random agent whose tier matches its own comfort (4 tiers, 12+ lines each, starter set in brief). Bubble is DOM, anchored by `map.project`, hidden when off-screen; copy stored in `lines.ts` for easy editing.

### 4.5 Onboarding (level 1, ≈15 s)

Three timed, dismissable hints: "Tap a glowing plot" → "Slide to add storeys, turn the dial" → "Flip the void deck and watch the blue flow under". No tutorial screen.

### 4.6 Title / legal

Title screen: name, one-line pitch, "Fan-made toy, not affiliated with HDB or URA" under the title, Start. `<meta name="description">` carries the same line. Footer in-game and on end card: the brief's wording plus "© OpenStreetMap contributors" and "Contains information from data.gov.sg (Singapore Open Data Licence v1.0)".

## 5. Spikes (throwaway, `spike/*` branches, 1 day each max, results in `docs/spikes.md`)

**Spike A — solver comparison on a phone.** One Vite page, no map, two solvers behind the same `Solver` interface: stable fluids (Dobryakov MIT core + obstacle-aware Jacobi/advection per GPU Gems 38) and LBM D2Q9 with TRT collision and half-way bounce-back (rafaelanderka MIT as reference). Same 256² grid, RGBA16F, same obstacle layout: a 70 × 14 m slab perpendicular to the wind, a 26 m point block, a slab with porosity 0.15 (void deck), inflow left, outflow right, wind direction slider. Both advect the same heat scalar.
Pass criteria, measured on the target mid-range Android and an iPhone:
1. ≥ 30 fps with 2 substeps per frame and the heat pass on.
2. No NaN/blow-up after 5 minutes at the highest wind speed that looks like a brisk breeze (streaks cross the 256 grid in ~4 s).
3. Wake behind the slab visibly longer and hotter than behind the point block; a visible under-deck breeze through the porous slab; no leakage through solid blocks.
4. Wind direction change re-converges within 3 s without artefacts.
Decision rule: if both pass, LBM (cheaper, livelier wakes). If LBM fails 2 at the needed speed even with τ = 0.55 and 3 substeps, stable fluids.

**Spike B — overlay registration on a tilted, rotating map.** MapLibre 6.13 + OpenFreeMap Liberty, four markers at a Punggol bbox's corners, then (1) a `'2d'` custom layer inserted before `building-3d` drawing a checkerboard with a moving dot from a texture it renders into its own FBO in `prerender`, plus a `'3d'` custom layer after buildings drawing a few upright sprites; (2) the same checkerboard via a canvas source. Pass: at pitch 60 while rotating, checkerboard corners stay within 1 px of the markers; buildings occlude the ground overlay; sprites are hidden behind buildings; overlay costs < 4 ms per frame on the phone (measured with `EXT_disjoint_timer_query_webgl2` where available, else frame time delta); no GL state corruption of MapLibre's own layers after 2 minutes. Choose the custom layer unless it fails; record the canvas-source numbers as the fallback.

**Spike C — bake one real level end to end.** `tools/bake` in TS: fetch the four datasets with the poll-download cache, build the `ST_COD → street` table, join, clip to the Punggol play bbox + 300 m ring, pull non-HDB buildings from Overpass (retry mirror list; the Punggol query failed on 2026-10-11), tag ground polygons from the land-use layer (`PARK`, `OPEN SPACE`, `WATERBODY`, `ROAD`, rest paved), read authored plots and paths from `levels/punggol.json`, write `public/levels/punggol.json`. Pass: ≥ 99% of HDB footprints in the bbox get storeys from the join (the measured value is 100%); the baked JSON ≤ 200 KB (coordinates rounded to 6 dp, footprints simplified to 0.5 m); loads in MapLibre as extrusions that line up with OpenFreeMap's own buildings (toggle visibility to compare); script is idempotent and runs in < 2 minutes from cache.

## 6. Milestones (each ends with a URL you can open on your phone)

1. **M0 Bootstrap** (hours): repo, brief, README, gitignore, Vite skeleton deployed to Cloudflare Pages showing a plain MapLibre map of Singapore. Proves hosting + tiles on your phone in the LinkedIn browser.
2. **Spikes A, B, C** (2 to 3 days): outcomes written to `docs/spikes.md`.
3. **M1 Wind on a real town** (3 to 4 days): baked Punggol level, fixed buildings as extrusions and obstacles, live field + streaks on the ground, season toggle. No building yet. First screenshot-worthy build.
4. **M2 Building** (3 to 4 days): plots, bottom sheet, six typologies, storeys slider, rotate dial, void deck with columns, GPR cap, obstacle re-raster, one-finger pan vs drag disambiguation.
5. **M3 People and score** (3 days): agents, readback, comfort, score HUD, housing target, hold-to-clear, speech bubbles, end card with text share.
6. **M4 Three levels + onboarding** (3 days): Tengah and Ang Mo Kio baked, two-season rule on Ang Mo Kio, thresholds calibrated, title screen, onboarding, footer, meta tags.
7. **M5 Ship polish** (2 to 3 days): image share, OG image, degraded mode and capability probe, perf pass against the 500 KB / 30 fps budget, in-app browser testing (LinkedIn iOS + Android). No analytics script.

## 7. Risks and cuts

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| OpenFreeMap outage on launch day (one 1-day CORS incident in 2026, no SLA) | low / high | R2-hosted PMTiles fallback wired from M0; style swap on tile errors |
| LinkedIn in-app WebView quirks (iOS WKWebView float formats, Android WebView GPU blocklist) | medium / high | half-float default, FBO probes, degraded 128² mode, test inside LinkedIn from M0 on |
| `readPixels` stalls the GPU pipeline each sample | medium / medium | PBO + `fenceSync`, 64² RGBA8, every 15 frames |
| Shared GL context: our layer corrupts MapLibre state or vice versa | medium / high | spike B; bind everything every frame; `prerender` for FBO work |
| Bundle budget: MapLibre 287 KB gz alone | certain / medium | ~500 KB total is feasible: MapLibre 287 + app ~60 + shaders ~10 + level JSON lazy; no framework; `pmtiles` only loaded on fallback |
| Tengah: data.gov.sg footprint layer lags new BTOs; half the bbox is Bukit Batok West | high / medium | choose the Tengah bbox around Plantation/Garden district; OSM fills newest blocks; it is the greenfield level anyway |
| Punggol Overpass query failed on 3 mirrors on 2026-10-11 | medium / low | retry; cache raw responses in `data/raw/` so one success is enough |
| Thermal throttling on phones after ~20 s of sustained GPU load | medium / medium | fixed-dt substeps; drop to 1 substep and 128² when frame time > 33 ms for 2 s |
| 2D model teaches something false (porous carparks, downwind shade) | medium / high | amended encoding in 3.5; footer disclaimer |
| Threshold tuning makes levels trivial or impossible | high / medium | calibration harness (4.2); thresholds stored in level JSON, no code changes |
| One-finger pan vs building drag conflict | medium / medium | buildings are moved only via the sheet's rotate dial and tap-to-select; no free drag in MVP |

Cut order if the MVP runs long: image share → text only; third level; two-season rule; courtyard typology; agent walking → fixed sampling points on paths with static sprites; LBM half of spike A (go stable fluids); vorticity confinement; PMTiles fallback (keep the vendored style, skip R2).

## 8. Where the brief is challenged

1. **Height-as-porosity** (brief 3a). Low buildings must stay solid at pedestrian level; model height through wake length instead (3.5). Otherwise streaks visibly pass through a carpark and the game loses credibility with exactly the planners it will be shared with.
2. **Shade is not downwind.** Singapore's sun is near overhead; shade is the footprint plus a short apron. Downwind-offset shade would teach a wrong intuition.
3. **Heat needs a decay term** or stagnant pockets heat forever and the colour ramp saturates everywhere behind the first slab.
4. **The join is simpler than feared.** `ST_COD` has no name to normalise, but a block-set match gives a 99.1% deterministic join without OneMap. The street-abbreviation table is needed only to validate against OneMap road names.
5. **Tile buildings are not the obstacles.** Use the baked data for both visuals and sim inside the play ring, and hide the tile `building-3d` layer there. Otherwise the picture and the physics disagree (tile heights are `levels × 3.66`, merged at z14, 5 m default for untagged).
6. **Scoring**: "satisfaction from where people walk" is right, but the plots must each sit upwind of a walked path or a plot becomes a free dumping ground for the housing target. Plot authoring rule: every plot has at least one path within one wake length downwind for the level's required season(s). Also add a per-plot GPR cap (real Master Plan concept) so "max height everywhere" is not the only strategy.
7. **Void deck as pure win**: it costs one floor and gives shade + ventilation + a hangout spot. That is roughly real, and it should usually be right. If it becomes a no-brainer on every block, the housing target is the lever, not a penalty.
8. **LBM is more attractive than the brief assumes** for this specific problem (1.6). Keep the spike, but do not pre-commit to stable fluids.
9. **Not a bug but a scope note**: real pedestrian discomfort near tall slabs is often *too much* wind (downwash, corner jets). A 2D solver cannot show it. The "Cold" tier lines are flavour, not a penalty, in the MVP.

## 9. Verification

- Spike pass/fail criteria above.
- Each milestone: open the Cloudflare Pages preview URL on an Android mid-range phone and an iPhone, inside LinkedIn's in-app browser, check fps overlay (`?dev=1`), Lighthouse mobile performance ≥ 85, JS ≤ 500 KB gz (`vite build` report).
- Bake script: unit tests on the code→street join and the street-name normaliser; assert match rate per level ≥ 99%.
- Solver: a sanity check in the dev panel (mass conservation: mean divergence after projection < 1e-3; no NaNs for 5 minutes).
