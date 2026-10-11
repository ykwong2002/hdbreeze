/**
 * Bakes one level (schema v2): `node tools/bake/bake.ts <levelId>`.
 * Reads levels/<id>.json (authored), the data.gov.sg datasets (cached in data/raw/)
 * and the local Protomaps extract, and writes public/levels/<id>.json for the runtime.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDataset, RAW_DIR } from "./fetch.ts";
import { bboxOfRing, centroid, convexHull, expandRing, growBbox, inBbox, pointInRing, round6, simplifyRing, squareAround, type Bbox, type Pt, type Ring } from "./geo.ts";
import { hdbHeight, hdbInBbox, loadHdb } from "./hdb.ts";
import { groundKind, loadLanduse, parcelAt } from "./landuse.ts";
import { dropOverlapping } from "./osm.ts";
import { findSubzone, loadSubzones } from "./subzone.ts";
import { loadTiles } from "./tiles.ts";
import type { BakedBuilding, BakedLevel, HeightStep, LevelIndexEntry, ReferenceBlock, TrayItem } from "../../src/game/level-types.ts";

interface AuthoredLevel {
  id: string;
  name: string;
  subzone: string;
  planningArea?: string;
  tagline: string;
  brief: string;
  camera: { zoom: number; pitch: number; bearing: number };
  wind: BakedLevel["wind"];
  areas: { id: string; label: string; at: Pt; polygon?: Ring }[];
  tray: TrayItem[];
  heights: Record<HeightStep, number>;
  hotspots: Pt[];
  targets: { homes?: number; satisfaction: number; holdSeconds: number };
  reference?: ReferenceBlock[];
  calibration?: Record<string, number>;
}

/** Residents per flat and units per floor must match src/game/typologies.ts. */
const UNITS_PER_FLOOR: Record<string, number> = { slab: 8, point: 6, l: 6, courtyard: 16, mscp: 0, pavilion: 0 };
const RESIDENTS_PER_FLAT = 3.2;
const SCORE_ZONE_M = 150;
const SIM_PAD_M = 100;
const CONTEXT_M = 250;
const TARGET_M_PER_CELL = 4.5;

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error("usage: node tools/bake/bake.ts <levelId>");
  const a = JSON.parse(readFileSync(join("levels", `${id}.json`), "utf8")) as AuthoredLevel;

  const [fpPath, piPath, luPath, szPath] = await Promise.all([
    ensureDataset("hdb_existing_building"), ensureDataset("hdb_property_info"), ensureDataset("mp25_landuse"), ensureDataset("mp19_subzone"),
  ]);

  const sz = findSubzone(loadSubzones(szPath), a.subzone, a.planningArea);
  if (!sz) throw new Error(`subzone "${a.subzone}" not found`);
  const bbox = squareAround(bboxOfRing(sz.ring), SIM_PAD_M);
  const ctx = growBbox(bbox, CONTEXT_M);
  const sizeM = (bbox.e - bbox.w) * 111_320 * Math.cos(((bbox.s + bbox.n) / 2) * (Math.PI / 180));
  const grid = Math.max(256, Math.min(384, Math.ceil(sizeM / TARGET_M_PER_CELL / 64) * 64));
  console.log(`level ${id}: subzone ${sz.name} (${sz.planningArea}), sim box ${sizeM.toFixed(0)} m, grid ${grid} (${(sizeM / grid).toFixed(1)} m/cell)`);

  // HDB blocks with storeys
  const hdb = loadHdb(fpPath, piPath);
  mkdirSync("tools/bake/data", { recursive: true });
  writeFileSync("tools/bake/data/stcod-street.json", JSON.stringify(Object.fromEntries([...hdb.table].sort()), null, 0) + "\n");
  const hdbHere = hdbInBbox(hdb.blocks, ctx);
  const hdbJoined = hdbHere.filter((b) => b.storeys !== undefined);
  console.log(`hdb: ${hdbHere.length} in context box, ${hdbJoined.length} joined (${hdbHere.length ? ((100 * hdbJoined.length) / hdbHere.length).toFixed(1) : 100}%)`);
  if (hdbJoined.length < 0.99 * hdbHere.length) console.warn(`  unmatched: ${hdbHere.filter((b) => b.storeys === undefined).map((b) => `${b.blk}/${b.stCod}`).join(", ")}`);
  const buildings: BakedBuilding[] = [];
  const hdbRings: Ring[] = [];
  for (const b of hdbHere) {
    const inPlay = inBbox(b.centroid, bbox);
    for (const ring of b.rings) {
      hdbRings.push(ring);
      buildings.push({ src: "hdb", h: Math.round(hdbHeight(b) * 10) / 10, fp: roundN(simplifyRing(ring, inPlay ? 1.0 : 2.5), inPlay ? 6 : 5), blk: b.blk, kind: b.kind, storeys: b.storeys });
    }
  }

  // Non-HDB buildings and walkable ways from the local Protomaps extract
  let osmCount = 0, osmDefault = 0;
  let ways: Pt[][] = [];
  const tilesPath = join(RAW_DIR, "singapore.pmtiles");
  if (existsSync(tilesPath)) {
    const osm = await loadTiles(tilesPath, ctx);
    const others = dropOverlapping(osm.buildings.map((b) => ({ ...b, id: 0, tag: "yes" })), hdbRings);
    for (const b of others) {
      if (b.height < 3) continue;
      const inPlay = inBbox(b.centroid, bbox);
      buildings.push({ src: "osm", h: Math.round(b.height), fp: roundN(simplifyRing(b.ring, inPlay ? 1.0 : 2.5), inPlay ? 6 : 5) });
      osmCount++;
      if (b.source === "default") osmDefault++;
    }
    ways = osm.ways;
    console.log(`osm: ${osm.buildings.length} buildings, ${others.length} kept (${osmDefault} default heights), ${ways.length} ways`);
  } else {
    console.warn(`osm: skipped, ${tilesPath} missing (see README: pmtiles extract)`);
  }

  // Ground kinds and build areas from the Master Plan land-use layer
  const parcels = loadLanduse(luPath, ctx);
  const groundBox = growBbox(bbox, 60);
  const ground: BakedLevel["ground"] = [];
  for (const p of parcels) {
    const kind = groundKind(p.desc);
    if (!kind || !p.ring.some((q) => inBbox(q, groundBox))) continue;
    ground.push({ kind, polygon: round6(simplifyRing(p.ring, 2.0)) });
  }
  const areas: BakedLevel["areas"] = [];
  for (const ar of a.areas) {
    const parcel = ar.polygon ? undefined : parcelAt(parcels, ar.at);
    const ring = ar.polygon ?? parcel?.ring;
    if (!ring) { console.warn(`area ${ar.id}: no land-use parcel at ${ar.at.join(",")}`); continue; }
    if (!pointInRing(centroid(ring), sz.ring)) console.warn(`area ${ar.id}: centroid is outside subzone ${sz.name}`);
    const inside = (b: BakedBuilding) => b.fp.some((q) => pointInRing(q, ring));
    const dropped = buildings.filter((b) => inside(b) && b.src === "osm" && b.h <= 9).length;
    for (let i = buildings.length - 1; i >= 0; i--) if (inside(buildings[i]!) && buildings[i]!.src === "osm" && buildings[i]!.h <= 9) buildings.splice(i, 1);
    const blocked = buildings.filter(inside).length;
    if (dropped) console.log(`area ${ar.id}: dropped ${dropped} low structures`);
    if (blocked) console.warn(`area ${ar.id} (${parcel?.desc ?? "authored"}): ${blocked} existing buildings still touch it`);
    areas.push({ id: ar.id, label: ar.label, polygon: round6(simplifyRing(ring, 1.0)), areaM2: Math.round(parcel ? parcel.areaM2 : 0) });
  }
  if (areas.length < 2) console.warn(`only ${areas.length} build areas; the plan asks for 2-3`);

  // Score zone: convex hull of the areas, pushed out 150 m
  const zone = expandRing(convexHull(areas.flatMap((x) => x.polygon)), SCORE_ZONE_M);
  const paths = buildPaths(ways, bbox, zone);

  // Homes target: 85% of the tray at mid height unless authored
  const trayHomes = a.tray.reduce((s, t) => s + t.count * (UNITS_PER_FLOOR[t.type] ?? 0) * a.heights.mid * RESIDENTS_PER_FLAT, 0);
  const homes = a.targets.homes ?? Math.round((0.85 * trayHomes) / 50) * 50;

  const baked: BakedLevel = {
    id: a.id, name: a.name, subzone: sz.name, tagline: a.tagline, brief: a.brief, camera: a.camera, grid, wind: a.wind,
    bbox: [bbox.w, bbox.s, bbox.e, bbox.n].map(r6) as BakedLevel["bbox"],
    contextBbox: [ctx.w, ctx.s, ctx.e, ctx.n].map(r6) as BakedLevel["bbox"],
    district: round6(simplifyRing(sz.ring, 3)),
    scoreZone: round6(zone),
    areas, tray: a.tray, heights: a.heights, hotspots: a.hotspots, ground, buildings, paths,
    targets: { homes, satisfaction: a.targets.satisfaction, holdSeconds: a.targets.holdSeconds },
    ...(a.reference ? { reference: a.reference } : {}),
    ...(a.calibration ? { calibration: a.calibration } : {}),
    bakedAt: new Date().toISOString().slice(0, 10),
    stats: { hdb: hdbHere.length, hdbJoined: hdbJoined.length, osm: osmCount, osmDefaultHeight: osmDefault, ground: ground.length, areas: areas.length, pathNodes: paths.nodes.length, trayHomesMid: Math.round(trayHomes) },
  };
  mkdirSync("public/levels", { recursive: true });
  const out = join("public/levels", `${id}.json`);
  const text = JSON.stringify(baked);
  writeFileSync(out, text);
  console.log(`wrote ${out}: ${(text.length / 1024).toFixed(0)} KB, ${buildings.length} buildings, ${ground.length} ground polygons, ${areas.length} areas, ${paths.nodes.length} path nodes, homes target ${homes} (tray at mid ${Math.round(trayHomes)})`);

  const indexPath = "public/levels/index.json";
  const index = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as LevelIndexEntry[]) : [];
  const entry: LevelIndexEntry = { id, name: a.name, subzone: sz.name, tagline: a.tagline, center: centroid(sz.ring.slice(0, -1)).map(r6) as Pt };
  const i = index.findIndex((e) => e.id === id);
  if (i >= 0) index[i] = entry; else index.push(entry);
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
}

function r6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
function roundN(ring: Ring, dp: number): Ring {
  const k = 10 ** dp;
  return ring.map((p) => [Math.round(p[0] * k) / k, Math.round(p[1] * k) / k]);
}

/** Walkable graph: way vertices inside the score zone, snapped to ~1 m so shared nodes join. */
function buildPaths(ways: Pt[][], bbox: Bbox, zone: Ring): BakedLevel["paths"] {
  const nodes: Pt[] = [];
  const idx = new Map<string, number>();
  const edges: [number, number][] = [];
  const key = (p: Pt) => `${Math.round(p[0] * 1e5)}|${Math.round(p[1] * 1e5)}`;
  const nodeId = (p: Pt): number => {
    const k = key(p);
    let i = idx.get(k);
    if (i === undefined) { i = nodes.length; idx.set(k, i); nodes.push([r6(p[0]), r6(p[1])]); }
    return i;
  };
  const ok = (p: Pt) => inBbox(p, bbox) && pointInRing(p, zone);
  for (const w of ways) {
    for (let i = 1; i < w.length; i++) {
      const p = w[i - 1]!, q = w[i]!;
      if (!ok(p) || !ok(q)) continue;
      const ia = nodeId(p), ib = nodeId(q);
      if (ia !== ib) edges.push([ia, ib]);
    }
  }
  return { nodes, edges };
}

main().catch((e) => { console.error(e); process.exit(1); });
