# Plan v5: steer the breeze (2026-10-12)

Decisions made with the owner after the v3/v4 playtests:

- **Red means wind-starved only.** The colour map is a wind map: still air is hot, moving air is cool. Sun and shade are no longer gameplay factors (a small constant shade bonus remains for looks).
- **Hot spots are hand-authored per level**: 2–4 walkway points where existing buildings cut the breeze off, each with a target temperature. They show from the start as pulsing red markers with their live felt temperature and turn teal when cooled.
- **The player's only tool is the tray of HDB blocks** (4 per level): rotation, three heights, void decks. Angled rows make channels; gaps and void decks let air through; tall walls make long wakes.
- **One buildable site per level**: a polygon wrapping the hot spots and their upwind side. Blocks must sit inside it and must not overlap existing buildings.
- **Win**: every hot spot held below its target for a few seconds, all blocks placed, everyone housed. No score threshold. Satisfaction stays as flavour. Stars: 1 clear, 2 every spot 1.5 °C under target, 3 also 20% more homes than needed.
- **Solvability is proven by the owner on a real GPU**: `?check=1&level=<id>` runs the level's authored reference layout, waits for the flow to settle, and prints each spot's temperature and pass/fail (plus the empty baseline, which must be hot). Levels ship with a reference layout in their JSON.

## Level schema v5 additions

```jsonc
"site": { "polygon": [[lon, lat], ...] },                         // or "fromAreas": true -> hull of the authored parcels
"hotspots": [ { "id": "a", "label": "Bus stop", "at": [lon, lat], "targetC": 30 } ],
"tray": [ { "type": "slab", "count": 2 }, { "type": "point", "count": 2 } ],
"reference": [ { "type": "slab", "at": [lon, lat], "rotDeg": 60, "height": "mid", "voidDeck": true } ]
```

## Runtime

- `src/game/hotspots.ts`: authored spots -> sample discs (radius 12 m) -> live feels; `cooled` when below target.
- `src/game/scoring.ts`: clear when `spotsOk && allPlaced && homesOk` held for `holdSeconds`.
- `src/game/blocks.ts`: one area = the site; placement also rejects overlap with baked buildings.
- `src/ui/score.ts`: checklist (spots cooled, blocks, housed); `src/ui/hotspot-markers.ts` markers.
- `src/dev/check.ts` (`?check=1`): empty baseline + reference layout, per-spot results.

## Authoring

`node --experimental-strip-types tools/bake/survey.ts <TOWN>` for parcels; hot spots are chosen on walkways just downwind (SW in the NE monsoon) of existing blocks next to empty land, and the reference layout is a channel of angled blocks upwind of them. The owner runs the check page and reports; spots or references are adjusted until every level passes.
