/**
 * Authoring aid: `node tools/bake/survey.ts "PUNGGOL"` lists, per subzone of a
 * planning area, the residential / reserve parcels that have no tall building
 * on them, so a level author can pick a subzone and its build areas.
 */
import { join } from "node:path";
import { ensureDataset, RAW_DIR } from "./fetch.ts";
import { centroid, growBbox, inBbox, pointInRing, ringAreaM2, type Bbox, type Ring } from "./geo.ts";
import { loadHdb } from "./hdb.ts";
import { loadLanduse } from "./landuse.ts";
import { loadSubzones } from "./subzone.ts";
import { loadTiles } from "./tiles.ts";

const BUILDABLE = new Set(["RESIDENTIAL", "RESERVE SITE", "RESIDENTIAL WITH COMMERCIAL AT 1ST STOREY", "COMMERCIAL & RESIDENTIAL", "WHITE"]);

function bboxOf(ring: Ring): Bbox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { w, s, e, n };
}

async function main(): Promise<void> {
  const pa = (process.argv[2] ?? "PUNGGOL").toUpperCase();
  const minArea = Number(process.argv[3] ?? 8000);
  const [fpPath, piPath, luPath, szPath] = await Promise.all([
    ensureDataset("hdb_existing_building"), ensureDataset("hdb_property_info"), ensureDataset("mp25_landuse"), ensureDataset("mp19_subzone"),
  ]);
  const hdb = loadHdb(fpPath, piPath);
  const subzones = loadSubzones(szPath).filter((s) => s.planningArea === pa);
  const tilesPath = join(RAW_DIR, "singapore.pmtiles");
  for (const sz of subzones) {
    const bb = growBbox(bboxOf(sz.ring), 50);
    const wM = (bb.e - bb.w) * 111_320 * Math.cos((1.4 * Math.PI) / 180), hM = (bb.n - bb.s) * 111_320;
    const blocks = hdb.blocks.filter((b) => inBbox(b.centroid, bb));
    const osm = await loadTiles(tilesPath, bb);
    const parcels = loadLanduse(luPath, bb).filter((p) => BUILDABLE.has(p.desc) && p.areaM2 >= minArea && pointInRing(centroid(p.ring), sz.ring));
    const rows: string[] = [];
    for (const p of parcels) {
      const nHdb = blocks.filter((b) => pointInRing(b.centroid, p.ring)).length;
      const tall = osm.buildings.filter((b) => b.height > 9 && pointInRing(b.centroid, p.ring)).length;
      const low = osm.buildings.filter((b) => b.height <= 9 && pointInRing(b.centroid, p.ring)).length;
      if (nHdb === 0 && tall === 0) rows.push(`    ${(p.areaM2 / 10000).toFixed(1).padStart(5)} ha  ${p.desc.padEnd(26)} gpr ${String(p.gpr).padEnd(4)} at ${centroid(p.ring).map((v) => v.toFixed(5)).join(",")}  low structures ${low}`);
    }
    console.log(`${sz.name.padEnd(26)} ${wM.toFixed(0)} x ${hM.toFixed(0)} m  hdb ${blocks.length}  empty parcels ${rows.length}`);
    for (const r of rows) console.log(r);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
