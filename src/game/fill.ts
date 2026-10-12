import type { LevelSession } from "./level";
import type { LonLat } from "./level-types";
import { pointInRing } from "./fit";
import { typology } from "./typologies";

/** Candidate centres: a grid inside the plot. */
function candidates(s: LevelSession, spacingM: number): LonLat[] {
  const out: LonLat[] = [];
  const dLat = spacingM / 111_320;
  const ring = s.level.site;
  const lats = ring.map((p) => p[1]), lons = ring.map((p) => p[0]);
  const dLon = dLat / Math.cos((lats[0]! * Math.PI) / 180);
  for (let lat = Math.min(...lats); lat <= Math.max(...lats); lat += dLat)
    for (let lon = Math.min(...lons); lon <= Math.max(...lons); lon += dLon) if (pointInRing([lon, lat], ring)) out.push([lon, lat]);
  return out;
}

/**
 * Places the whole tray spread over the plot (farthest-point choice among grid candidates).
 * "careless": long axes across the wind, every block high, no void decks: the layout a planner
 * must avoid. "aligned": long axes along the wind, mid height, void decks on residential blocks.
 */
export function fill(s: LevelSession, style: "careless" | "aligned"): number {
  const wind = s.season.fromDeg;
  s.blocks.clearAll();
  const along = (90 - wind + 360) % 180; // rotation whose long axis points down-wind
  const rot = style === "careless" ? (along + 90) % 180 : along;
  const cands = candidates(s, 22);
  const mLon = 111_320 * Math.cos((s.level.site[0]![1] * Math.PI) / 180);
  const dist = (a: LonLat, b: LonLat) => Math.hypot((a[0] - b[0]) * mLon, (a[1] - b[1]) * 111_320);
  const used: LonLat[] = [];
  let placed = 0;
  for (const t of s.blocks.tray()) {
    for (let k = 0; k < t.remaining; k++) {
      const order = [...cands].sort((a, b) => {
        const da = used.length ? Math.min(...used.map((u) => dist(a, u))) : 0;
        const db = used.length ? Math.min(...used.map((u) => dist(b, u))) : 0;
        return db - da;
      });
      for (const c of order) {
        const r = s.blocks.place(t.type, c, rot);
        if (!r.ok) continue;
        used.push(r.block.center);
        placed++;
        if (typology(t.type).residential) {
          if (style === "careless") s.blocks.setHeight(r.block.id, "high");
          else if (!r.block.voidDeck) s.blocks.toggleVoid(r.block.id);
        }
        break;
      }
    }
  }
  s.select(null);
  return placed;
}
