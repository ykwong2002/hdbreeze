# Plan v6: build a liveable BTO precinct, plot by plot

Approved 2026-10-12 with all four recommendations (fixed tray by plot ratio, on-device baselines, three plots per town, neighbour hot spot optional) plus quiet background music on the home screen and in play.

## Why

v5 proved the physics on a real GPU: an angled slab moves the felt temperature at a wind-starved spot by ~3 °C. But three slabs on a 400 m site is not urban planning. The game's purpose is to show how much thought goes into making a dense town liveable: housing thousands of people while keeping the streets breathable. v6 makes the player do exactly that, one real plot at a time.

## The game from the player's seat

1. **Title** → "Why this game" (3 swipe cards: Singapore is hot and a 1 m/s breeze feels ~1–2 °C cooler; HDB and URA run wind, sun and noise models before laying out precincts; your job is to house people *and* keep the streets breathable in both monsoons).
2. **Town overview** (Punggol, Tengah, Ang Mo Kio): the town is outlined; its empty plots are numbered 1–3 and locked in order. Tap plot 1.
3. **Plot intro (~8 s, self-calibrating)**: the camera flies in until the plot fills the screen. Card: *"Master Plan: Residential, plot ratio 3.0 → room for about 1,050 flats. Watch what a careless plan does."* The tray is auto-placed as walls across the wind, the streets go red, the game measures that layout, then the blocks fade away: *"Now you."* (Two-monsoon plots repeat the measurement in the second season, +4 s.)
4. **Build**: a tray of 6–10 blocks sized to the plot's real plot ratio (slabs, points, an L, a multi-storey carpark). Drag, two-finger rotate, tap for height (low / mid / high), void deck. All blocks must be placed. Residents walk the precinct's own walkways and comment.
5. **Score card** shows three checkboxes: **Homes** (≥ the plot-ratio target), **Breathability** (0 % = the careless plan, 100 % = the empty plot, pass at 60 %), **Neighbours** (optional: a wind-starved spot next door that must be cooled, where the solver found one). Monsoon chip toggles seasons; the hold must pass in every required season.
6. **Plot cleared**: 3 rising notes (a semitone higher for each plot), one-line lesson card (*"Your rows run NE–SW with 18 m gaps: that is a wind corridor."*), next plot unlocks.
7. **Town cleared**: major fanfare, town summary (people housed, average breathability, best plot), image share.

## What this teaches, and how the mechanics enforce it

| Lesson | Mechanic |
|---|---|
| Density is a requirement, not a choice | homes target from the real Master Plan plot ratio; all tray blocks must be placed |
| Orientation and gaps make corridors | breathability samples the precinct's own walkways; walls across the wind score 0 % |
| Height has a cost | high blocks add homes but cast longer wakes; stepping heights down toward the wind scores better |
| Void decks ventilate | sample points under void decks count; porous cells stay breezy |
| Do not dump your wake on the neighbours | downwind neighbour walkways within 60 m are in the sample set |
| Both monsoons matter | two-season plots must pass NE and SW |
| Planners steer wind to where it is needed | optional neighbour hot spot (v5 mechanic) on plots with room |

## Technical shape

- **Plot = sub-level.** The bake takes a town file listing plots (empty Residential / Reserve parcels from the Master Plan land use, authored or the 3 largest empty ones) and writes one baked level per plot with its **own sim box** (plot + 250 m context, grid 384 → ~1.8–2.5 m per cell instead of 4.8 m). Same engine, better fidelity for precinct gaps.
- **Tray from plot ratio:** GFA = area × GPR; units ≈ GFA / 100 m²; the bake composes a tray (e.g. 5 slabs, 2 points, 1 L, 1 MSCP) at mid height ≈ 85 % of that, and verifies a grid packing fits the parcel.
- **Breathability** = (naive − yours) / (naive − empty) over the sample set, per season, measured on the player's device in the intro (deterministic LBM, fixed dt; stored in localStorage for replays). No baked thresholds, no cross-GPU drift.
- **Progression** in localStorage (plot cleared, stars). Stars: 1 = pass; 2 = breathability ≥ 75 %; 3 = ≥ 90 % or homes ≥ 1.2× target.
- **Sound:** Web Audio synthesis, no assets (placement thunk, cool-down whoosh, plot arpeggio rising per plot, town fanfare), mute toggle.
- **Check page** extends the v5 solver: for each plot it runs empty, naive and a greedy "improve breathability" search and prints the achievable score, so every plot is proven passable on the owner's GPU.

## Milestones (each a PR, merged to main)

- **M8 Plots** — town file + per-plot bake, town overview with numbered plots, fly-in, progression. Tengah uses all Tengah subzones so it has 3 plots.
- **M9 Breathability** — GPR tray, careless-plan intro with on-device baselines, breathability score card, both-season hold, solver per plot.
- **M10 Education** — why-this-game cards, tutorial scripting on plot 1, lesson cards, rewritten copy, sources on an About card.
- **M11 Sound and polish** — Web Audio cues, town summary and share, perf pass.

Cut order if credits run short: M11 → lesson cards → neighbour hot spots → third plot per town.

## Open questions (answers change the build)

1. Fixed must-place tray sized by plot ratio (recommended) or a free palette with only a homes target?
2. Baselines measured on-device in the intro (recommended) or baked from the owner's check runs?
3. Three plots per town (recommended for scope) or every empty parcel?
4. Keep the v5 neighbour hot spot as an optional objective (recommended) or drop it?
