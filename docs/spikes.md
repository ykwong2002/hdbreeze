# Spike results

Three throwaway spikes from `docs/plan.md` §5, run on 2026-10-11. Code lives on the
`spike/solver` and `spike/overlay` branches (never merged); spike C became the real
`tools/bake`. Headless numbers come from desktop Chrome with the SwiftShader software
renderer at 390×844, so they bound GPU cost relative to each other but say nothing
absolute about phones. Phone fps is still to be measured on the preview deploys.

## A. Solver comparison (`/spikes/solver/` on `spike/solver`)

Same 256² RGBA16F grid, same obstacle course (perpendicular slab, point block,
void-deck slab at porosity 0.15, parallel slab, low carpark), same heat scalar and streaks.

| Criterion | Stable fluids (24 Jacobi, 2 substeps) | Lattice Boltzmann (TRT, τ 0.56, 2 substeps) |
|---|---|---|
| Finite after 11 s and after a 90° wind turn | yes | yes |
| Passes per frame | ~60 | 4 |
| SwiftShader fps (relative cost only) | 17 | 40 |
| Slab wake longer and hotter than point-block wake | yes | yes, slightly longer |
| Breeze through the void-deck slab, none through solid blocks | yes | yes |
| Re-converges after turning the wind | ~5 s | ~5 s |
| Vortex shedding | none (recovery term damps it) | none at this τ with recovery on |

Decision: **lattice Boltzmann by default**, stable fluids kept behind `?solver=stable`.
Both live in `src/sim/` behind one `Solver` interface. LBM runs 4 substeps per frame in
the game because its lattice speed (0.08 cells/step) is slow; heat and streaks are
advected with a normalised velocity so both solvers look the same speed.

Model change found here: felt heat must decay faster in moving air
(`κ = κ_still + κ_wind·|u|`), otherwise open ground far downstream saturates hot. With it,
corridors read cool and only pockets glow, which is the lesson the game wants.

## B. Overlay registration (`/spikes/overlay/` on `spike/overlay`)

MapLibre 6.13 over a Punggol box with DOM markers at the corners; a `2d` custom layer
renders a checkerboard into its own framebuffer in `prerender` and draws it under the
buildings layer; a canvas-source variant for comparison.

- Registration: corners within 0–3 px of the markers at pitch 55–60 and during a
  3 s `rotateTo`; the 2–3 px readings come from the colour threshold at the blurred
  texture edge, not from drift. Canvas source registers the same.
- Buildings occlude the ground overlay correctly (layer order; `2d` before the `3d` layer).
- Ground pass GPU time 0.4–1.4 ms under SwiftShader (timer query available on desktop).
- No MapLibre state corruption across repeated mode switches.
- Canvas source needs an extra per-frame texture upload and renders unpremultiplied;
  no advantage.

Decision: **custom layer**, one shared WebGL2 context, solver FBOs in `prerender`.
Open item: the upright sprite layer (`renderingMode: "3d"`, depth-tested) did not show
in the zoomed screenshot even with face culling off; to be debugged in M3 when residents
need it.

## C. Bake one real level (`tools/bake`, kept)

`npm run bake -- punggol` reads the four data.gov.sg datasets (cached in `data/raw/`),
derives the `ST_COD → street` table from block-number sets, joins storeys, pulls non-HDB
buildings and footpaths from the local Protomaps PMTiles extract, tags ground kinds from
the land-use layer, resolves authored plot points to Master Plan parcels and writes
`public/levels/punggol.json`.

- Join: 13,316 / 13,436 footprints island-wide (99.1%); 337 / 337 in the Punggol context box.
- Output: 624 buildings (337 HDB, 292 OSM, 53 with default heights), 66 ground polygons,
  5 plots, 1,049 path nodes. 514 KB raw, **119 KB gzipped**. The raw size is over the
  200 KB target because HDB footprints average ~40 vertices; the gzipped size is what
  ships, so this is accepted for now.
- Overpass was returning HTTP 500/504 for any geometry query on three mirrors during the
  spike, so the bake uses the PMTiles extract instead: offline, deterministic, and the
  same file the runtime fallback uses.
- Runs in ~3 s from cache.
