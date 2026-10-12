# Plan v2: "tray and areas" (M4–M7)

## Feedback that prompted this plan

User feedback after playing (verbatim intent, to drive a gameplay rethink before M4):

1. **Wind only flows inside a square.** If levels are per district, outline and simulate the whole district the player is in, not a box. (Needs: sim domain = district polygon or at least a box that covers the district with the district boundary drawn; mask the field outside the boundary.)
2. **Wind flow is too fast**; staring at it makes the user dizzy. Slow the streaks (particle speed, trail fade), consider fewer/softer particles.
3. **Too many choices; not a simple game.** Rethink: give the player a fixed set of blocks to put down in 2–3 areas of the district to modify the air flow. Fewer knobs.
4. **Bug/expectation**: tapping a plot that already has a block replaces it instead of adding another block. Multiple blocks per plot/area are expected.
5. **Blocks can stick out of the plot.** Placement must keep the footprint inside the allowed area.
6. **Height must matter as a mechanic**: e.g. descending block heights that guide wind down to street level. Requires several blocks per area with individual heights. Currently one block per plot, so impossible; and even courtyards on every plot cannot reach the 3,000 target. Rethink targets and mechanics from the player's perspective.
7. **Every level must be solvable, with several solutions.** Some hot pockets are enclosed by existing buildings on all four sides and cannot be cooled; a simple game must not present unsolvable hot spots (pick play areas/plots so the player can always fix them, or score only the areas the player can influence).
8. **No instructions on how to play**, and only one level (Punggol). Need onboarding/instructions and the other towns.

Decisions confirmed 2026-10-12: play area = a URA subzone; every block in a fixed tray must be placed and total homes must stay above a target; block height is three steps (low / mid / high).

## Context

The M0–M3 build proved the technology: live wind on real towns, placement, residents and scoring all work. Playing it showed the game is not simple enough and not legible enough: a square of wind in a town, too many knobs, one block per plot, blocks poking out of plots, targets that cannot be reached, hot pockets that cannot be fixed, no instructions, one level. This plan reshapes the gameplay around a fixed tray of blocks placed in a few build areas inside a real subzone, keeps the simulation and data pipeline, and finishes the content (three towns, onboarding, calibration, polish).

## The game, from the player's seat

1. Pick a town. The camera flies to a real subzone (e.g. "Punggol Field"); its boundary is outlined and the wind field is drawn only inside it. A short card says: *"Place all 6 blocks in the highlighted areas. Keep the walkways breezy and house 2,400 people."*
2. A tray at the bottom shows the blocks to place: e.g. 3 slabs, 2 point blocks, 1 courtyard. The first type is pre-selected. Tap inside a highlighted area: a block drops there at mid height, the tray count goes down, the wind reacts.
3. Tap a placed block: a small toolbar floats above it with four buttons: **Rotate** (45° steps), **Height** (low 8 / mid 16 / high 30 storeys, cycles), **Void deck** (on/off), **Move** (then tap a new spot) and **Remove** (back to tray).
4. The score card shows satisfaction (big number, threshold tick) and homes vs target. Residents walk the paths near the build areas and comment. When all blocks are placed, homes ≥ target and satisfaction holds above the threshold for 4 s, the level clears with stars and a share button.

Why this fixes the feedback: no plot ratios or per-plot caps (fewer choices); several blocks per area with individual heights (descending-height corridors are possible); "place all blocks" kills the build-nothing exploit and makes homes a trade-off between heights, not a target to hunt; blocks are clamped inside areas and cannot overlap; the scored zone is the neighbourhood around the areas, so every hot pocket the player sees in full colour is one they can influence; calibration guarantees a reference solution clears each level with margin.

## Level schema v2 (authored `levels/<id>.json` → baked `public/levels/<id>.json`)

```jsonc
{
  "id": "punggol", "name": "Punggol", "subzone": "PUNGGOL FIELD",      // MP2019 subzone name
  "tagline": "...", "brief": "Place all 6 blocks in the highlighted areas. Keep the walkways breezy and house 2,400 people.",
  "camera": { "zoom": 15.4, "pitch": 55, "bearing": 20 },
  "wind": { "seasons": [...], "required": ["ne"] },
  "areas": [ { "id": "a", "label": "Area A", "at": [lon, lat] }, ... ],  // land-use parcel picked by point, 2-3 per level
  "tray": [ { "type": "slab", "count": 3 }, { "type": "point", "count": 2 }, { "type": "courtyard", "count": 1 } ],
  "heights": { "low": 8, "mid": 16, "high": 30 },
  "targets": { "homes": 2400, "satisfaction": 72, "holdSeconds": 4 },
  "reference": [ { "type": "slab", "at": [lon, lat], "rotDeg": 45, "height": "mid", "voidDeck": true }, ... ],  // authored solution used by calibration
  "hotspots": [[lon, lat]]
}
```
Baked additions: `district` (subzone polygon), `bbox` (square box around the subzone, padded 100 m), `grid` (256 / 320 / 384 chosen so cells are ≤ 5 m, capped at 384), `scoreZone` (union of areas buffered 150 m, clipped to the subzone), `areas[].polygon`, `buildings`, `ground`, `paths` (clipped to the score zone), `calibration` (filled by the harness).

## Milestones

### M4 — District and calm wind (schema v2, bake v2)
Branch `m4-district`. Ends with Punggol Field outlined on your phone, wind masked to it, slower streaks.
- `tools/bake/fetch.ts`: add dataset `mp19_subzone` (`d_8594ae9ff96d0c708bc2af633048edfb`, fields `SUBZONE_N`, `PLN_AREA_N`).
- `tools/bake/bake.ts`: resolve `subzone` → polygon; bbox = padded square; grid from size; bake `district`, `scoreZone`, areas from land-use parcels (reuse `parcelAt`, drop low structures as now); paths clipped to the score zone; warn when an area's parcel contains tall existing buildings or when the subzone has no parcels.
- `src/sim/obstacles.ts`: rasterise an extra R8 **mask** texture (1 inside subzone, 0.35 inside score zone → used by the overlay as alpha weight; the sim itself still runs over the whole bbox so outside buildings keep blocking).
- `src/map/overlay-layer.ts`: alpha × mask; district outline as a `line` layer (`src/map/buildings.ts`, dashed, with a `symbol` label of the subzone name); area polygons replace plots.
- Calmer streaks in `src/sim/sim.ts` / `field.ts`: particle speed 0.45, trail fade 0.965, 64² particles, point size 1.3; expose in dev panel.
- `levels/punggol.json` rewritten to schema v2 (subzone chosen by inspecting parcels with the bake's warnings; fall back to "NORTHSHORE" if Punggol Field lacks 2–3 empty parcels).

### M5 — Gameplay v2 (tray, areas, blocks)
Branch `m5-tray`. Ends with the loop in section "from the player's seat" working on Punggol.
- Replace `src/game/placement.ts` with `src/game/blocks.ts`: `Block { id, type, areaId, center, rotDeg, height: "low"|"mid"|"high", voidDeck }`, a `Tray` (remaining counts), `place(type, at)`, `move`, `rotate`, `cycleHeight`, `toggleVoid`, `remove`, `homes()`, `allPlaced()`. Geometry via the existing `geometryFor`/`localToLonLat` (`src/game/placement.ts` → moved).
- Constraints in `src/game/fit.ts`: all footprint vertices inside the area polygon (`pointInRing` from `tools/bake/geo.ts` logic, copied to runtime); if not, slide the centre toward the area centroid (bisection, 12 steps); reject if still outside. No overlap between blocks: separating-axis test on rectangle parts (plus/L/courtyard decomposed into rectangles in `typologies.ts`); rejected placements shake the tray chip.
- UI: `src/ui/tray.ts` (bottom chips with counts, selected type), `src/ui/toolbar.ts` (floating mini-toolbar anchored with `map.project`, same pattern as `bubbles.ts`), delete `src/ui/sheet.ts`. Tap routing in `src/game/level.ts`: tap on a placed block (query `level-placed-3d`) → select; tap in an area → place/move; tap elsewhere → deselect.
- Score card (`src/ui/score.ts`): add "blocks placed 4 / 6"; clear condition in `src/game/scoring.ts` gains `allPlaced`.
- Residents (`src/game/agents.ts`): spawn only on paths inside the score zone; void-deck hangout nodes as now.
- Homes target: bake sets `targets.homes` = 0.85 × homes of the tray at mid height when the author leaves it blank.

### M6 — Three levels, onboarding, calibration
Branch `m6-levels`.
- Dev harness `?calib=1` (`src/dev/calib.ts`): scenarios *empty*, *naive* (tray placed on a grid, all high, slabs across the wind), *reference* (from level JSON), for each required season; prints a table and a suggested threshold = naive + 0.6 × (reference − naive); results pasted into `calibration` by the author. Fail the bake if `reference` is missing.
- Levels: Tengah (subzone "PLANTATION" or "GARDEN", greenfield), Ang Mo Kio (a mature subzone, `required: ["ne","sw"]`; the hold must pass in both seasons, toggled automatically during the hold).
- Title screen (`src/ui/title.ts`): name, one-line pitch, non-affiliation line, Start; then town select. "How to play" card (3 lines, illustrated with the three tap gestures) shown on first play and from a `?` chip; contextual hints in level 1 (`src/ui/onboarding.ts`, 3 timed hints, dismiss on action).
- Footer stays; meta description unchanged.

### M7 — Ship polish
Branch `m7-polish`. Image share (composite map canvas + score card to PNG, Web Share with files, download fallback), OG image, capability probe → degraded mode (grid 192, 2 substeps, 32² particles) when frame time > 33 ms for 2 s, LinkedIn in-app tests on iOS and Android, bundle check.

## Cut order if this runs long
Image share → text only; Ang Mo Kio two-season rule → single season; floating toolbar → reuse the bottom sheet with only four controls; contextual hints → how-to card only.

## Verification
- Bake: `npm run bake -- punggol` prints subzone, grid, areas with parcel names, warnings; output ≤ 150 KB gz.
- Headless (`tools/shoot`, scratch scripts as before): district outline visible, field masked, tray places blocks, toolbar actions change geometry and sim, constraint rejects an out-of-area tap, `?calib=1` prints the table, each level's reference clears with ≥ 8 points of margin and naive does not.
- Phone: open the preview inside LinkedIn, read fps from `?dev=1`, confirm tap targets.

---

## v3 addendum (2026-10-12, after the owner's second playtest)

- Controls: drag from the tray to place, drag a block to move, twist two fingers to rotate (`src/ui/gestures.ts`, ghost footprint in `src/map/ghost.ts`). Tap-to-place and the toolbar's 45° turn remain for mouse users.
- Heat model: sun exposure is the main heat source and shade the main relief (`q` 0.3, shade removes 80% of the source), wind chill unchanged; void decks shade. Exposed walkways through the build areas start red, which is what the player cools. The score samples every walkway within 35 m of the areas, so an empty level starts around 30 and thresholds are recalibrated with `?calib=1`.
- The residents' tiny language model (`tools/lm`, `src/lm`) supplies two in three speech bubbles and the 🗣 card.
