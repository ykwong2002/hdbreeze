/**
 * Authoring aid: `node --experimental-strip-types tools/bake/find-plots.ts "<PLANNING AREA>"`
 * Lists empty Residential / Reserve parcels in a planning area (no HDB block, no mapped building
 * taller than 9 m inside), largest first, with their Master Plan plot ratio.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAW_DIR } from "./fetch.ts";
import { bboxOfRing, centroid, growBbox, pointInRing, type Ring } from "./geo.ts";
import { loadHdb, hdbInBbox } from "./hdb.ts";
import { loadLanduse } from "./landuse.ts";
import { loadTiles } from "./tiles.ts";

const name = (process.argv[2] ?? "PUNGGOL").toUpperCase();
const pa = JSON.parse(readFileSync(join(RAW_DIR, "mp25_planning_area.geojson"), "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] };
const feat = pa.features.find((f) => (f.properties.PLN_AREA_N ?? f.properties.Name ?? "").toUpperCase() === name);
if (!feat) throw new Error(`planning area ${name} not found; have ${pa.features.map((f) => f.properties.PLN_AREA_N).slice(0, 10).join(", ")}…`);
const rings: Ring[] = feat.geometry.type === "Polygon" ? [(feat.geometry.coordinates as number[][][])[0] as Ring] : (feat.geometry.coordinates as number[][][][]).map((p) => p[0] as Ring);
const outer = rings.sort((a, b) => b.length - a.length)[0]!;
const bb = growBbox(bboxOfRing(outer), 50);
const lu = loadLanduse(join(RAW_DIR, "mp25_landuse.geojson"), bb);
const hdb = hdbInBbox(loadHdb(join(RAW_DIR, "hdb_existing_building.geojson"), join(RAW_DIR, "hdb_property_info.csv")).blocks, bb);
const osm = await loadTiles(join(RAW_DIR, "singapore.pmtiles"), bb);
const tall = osm.buildings.filter((b) => b.height > 9).map((b) => b.centroid);
const rows: { desc: string; gpr: string; area: number; c: [number, number]; hdb: number; osm: number }[] = [];
for (const f of lu) {
  if (!/RESIDENTIAL|RESERVE SITE/.test(f.desc) || f.areaM2 < 12_000) continue;
  const c = centroid(f.ring);
  if (!rings.some((r) => pointInRing(c, r))) continue;
  rows.push({ desc: f.desc, gpr: f.gpr, area: Math.round(f.areaM2), c: [c[0], c[1]], hdb: hdb.filter((b) => pointInRing(b.centroid, f.ring)).length, osm: tall.filter((p) => pointInRing(p, f.ring)).length });
}
rows.sort((a, b) => (a.hdb + a.osm) - (b.hdb + b.osm) || b.area - a.area);
console.log(`${name}: ${rows.length} residential/reserve parcels >= 1.2 ha`);
for (const r of rows.slice(0, 16)) console.log(`  ${r.c.map((v) => v.toFixed(5)).join(",")}  ${r.desc.padEnd(26)} gpr ${r.gpr.padEnd(4)} ${(r.area / 10_000).toFixed(1)} ha  hdb ${r.hdb} osm>9m ${r.osm}`);
