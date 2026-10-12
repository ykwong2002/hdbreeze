/**
 * Authoring aid: `node --experimental-strip-types tools/bake/suggest-spots.ts <levelId>`
 * Lists walkway points near the level's areas that sit just downwind of an existing building
 * (the breeze is cut off), i.e. candidate hot spots, with the empty land upwind of them.
 */
import { readFileSync } from "node:fs";
import { centroid, convexHull, expandRing, pointInRing, type Pt, type Ring } from "./geo.ts";

const id = process.argv[2] ?? "punggol";
const level = JSON.parse(readFileSync(`public/levels/${id}.json`, "utf8")) as { site?: Ring; wind: { seasons: { id: string; fromDeg: number }[]; required: string[] }; areas: { polygon: Ring }[]; buildings: { fp: Ring; h: number; src: string }[]; paths: { nodes: Pt[]; edges: [number, number][] } };
const mLon = 111_320 * Math.cos((level.areas[0]!.polygon[0]![1] * Math.PI) / 180);
const toM = (p: Pt): [number, number] => [p[0] * mLon, p[1] * 111_320];
const site = process.argv[3] ? expandRing(convexHull(level.areas.flatMap((a) => a.polygon)), Number(process.argv[3])) : (level.site ?? expandRing(convexHull(level.areas.flatMap((a) => a.polygon)), 30));
const tall = level.buildings.filter((b) => b.h >= 12);
function segHits(a: [number, number], b: [number, number], ring: Ring): boolean {
  // sample along the segment every 5 m
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5);
  for (let i = 1; i <= n; i++) { const t = i / n; const p: Pt = [(a[0] + (b[0] - a[0]) * t) / mLon, (a[1] + (b[1] - a[1]) * t) / 111_320]; if (pointInRing(p, ring)) return true; }
  return false;
}
for (const sid of level.wind.required) {
  const season = level.wind.seasons.find((s) => s.id === sid)!;
  const f = (season.fromDeg * Math.PI) / 180;
  const toWind: [number, number] = [Math.sin(f), Math.cos(f)]; // unit vector pointing where the wind comes FROM (east, north)
  const rows: { p: Pt; blockedAtM: number; openUpwindM: number; areaInside: boolean }[] = [];
  const seen = new Set<string>();
  for (const [i, j] of level.paths.edges) {
    for (const p of [level.paths.nodes[i]!, level.paths.nodes[j]!]) {
      const key = p.join(",");
      if (seen.has(key) || !pointInRing(p, site)) continue;
      seen.add(key);
      const pm = toM(p);
      // nearest upwind blocker within 90 m
      let blockedAt = Infinity;
      for (const b of tall) {
        for (let d = 10; d <= 90; d += 10) {
          const q: Pt = [(pm[0] + toWind[0] * d) / mLon, (pm[1] + toWind[1] * d) / 111_320];
          if (pointInRing(q, b.fp)) { blockedAt = Math.min(blockedAt, d); break; }
        }
      }
      if (blockedAt === Infinity) continue;
      // open (buildable, empty) land upwind between the point and the blocker? we want some room to build a channel beside it
      let open = 0;
      for (let d = 10; d <= 120; d += 10) {
        const q: Pt = [(pm[0] + toWind[0] * d) / mLon, (pm[1] + toWind[1] * d) / 111_320];
        if (level.areas.some((a) => pointInRing(q, a.polygon)) && !tall.some((b) => pointInRing(q, b.fp))) open += 10;
      }
      rows.push({ p, blockedAtM: blockedAt, openUpwindM: open, areaInside: level.areas.some((a) => pointInRing(p, a.polygon)) });
    }
  }
  rows.sort((a, b) => a.blockedAtM - b.blockedAtM || b.openUpwindM - a.openUpwindM);
  console.log(`== ${id} season ${sid} (wind from ${season.fromDeg}°): ${rows.length} candidate points; site centroid ${centroid(site).map((v) => v.toFixed(5)).join(",")}`);
  for (const r of rows.slice(0, 14)) console.log(`  ${r.p.map((v) => v.toFixed(5)).join(",")}  blocker ${r.blockedAtM} m upwind, open land upwind ${r.openUpwindM} m${r.areaInside ? ", inside a parcel" : ""}`);
}
