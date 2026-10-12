/**
 * Bakes one town (schema v6): `node tools/bake/bake.ts <townId>`.
 * Reads levels/<town>.json (authored: the town and its plots), the data.gov.sg datasets (cached
 * in data/raw/) and the local Protomaps extract, and writes
 *   public/levels/<town>.json          the town overview (outline, plots)
 *   public/levels/<town>-<plot>.json   one playable level per plot, with its own sim box
 *   public/levels/index.json           the town list
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDataset, RAW_DIR } from "./fetch.ts";
import { bboxOfRing, centroid, expandRing, growBbox, inBbox, mPerDegLon, outerRings, pointInRing, round6, simplifyRing, squareAround, type Bbox, type Pt, type Ring } from "./geo.ts";
import { hdbHeight, hdbInBbox, loadHdb } from "./hdb.ts";
import { groundKind, loadLanduse, parcelAt } from "./landuse.ts";
import { dropOverlapping } from "./osm.ts";
import { loadTiles } from "./tiles.ts";
import type { BakedBuilding, BakedLevel, HeightStep, HotSpotDef, LevelIndexEntry, PlotSummary, ReferenceBlock, TownData, TrayItem } from "../../src/game/level-types.ts";

interface AuthoredPlot {
  id: string;
  label: string;
  /** A point inside the Master Plan parcel. */
  at: Pt;
  polygon?: Ring;
  /** Override the Master Plan plot ratio (needed when the layer says EVA / SDP). */
  gpr?: number;
  required?: string[];
  tray?: TrayItem[];
  hotspots?: HotSpotDef[];
  reference?: ReferenceBlock[];
  passPct?: number;
  brief?: string;
}
interface AuthoredTown {
  id: string;
  name: string;
  planningArea: string;
  tagline: string;
  wind: BakedLevel["wind"];
  heights?: Record<HeightStep, number>;
  plots: AuthoredPlot[];
}

/** Residents per flat and units per floor must match src/game/typologies.ts. */
const UNITS_PER_FLOOR: Record<string, number> = { slab: 7, point: 6, l: 6, courtyard: 16, mscp: 0, pavilion: 0 };
const RESIDENTS_PER_FLAT = 3.2;
const GFA_PER_FLAT_M2 = 100;
const HEIGHTS: Record<HeightStep, number> = { low: 8, mid: 16, high: 30 };
const SCORE_ZONE_M = 90;
const DISTRICT_M = 110;
const SIM_PAD_M = 170;
const CONTEXT_M = 250;
const TARGET_M_PER_CELL = 1.8;
const LATTICE_M = 28;

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error("usage: node tools/bake/bake.ts <townId>");
  const a = JSON.parse(readFileSync(join("levels", `${id}.json`), "utf8")) as AuthoredTown;
  const [fpPath, piPath, luPath, paPath] = await Promise.all([
    ensureDataset("hdb_existing_building"), ensureDataset("hdb_property_info"), ensureDataset("mp25_landuse"), ensureDataset("mp25_planning_area"),
  ]);
  const outline = loadPlanningArea(paPath, a.planningArea);
  const hdb = loadHdb(fpPath, piPath);
  mkdirSync("tools/bake/data", { recursive: true });
  writeFileSync("tools/bake/data/stcod-street.json", JSON.stringify(Object.fromEntries([...hdb.table].sort()), null, 0) + "\n");
  const townBox = growBbox(bboxOfRing(outline), 400);
  const parcels = loadLanduse(luPath, townBox);
  const heights = a.heights ?? HEIGHTS;
  mkdirSync("public/levels", { recursive: true });

  const summaries: PlotSummary[] = [];
  for (const [i, pl] of a.plots.entries()) {
    const parcel = pl.polygon ? undefined : parcelAt(parcels, pl.at);
    const ring = pl.polygon ?? parcel?.ring;
    if (!ring) throw new Error(`plot ${pl.id}: no land-use parcel at ${pl.at.join(",")}`);
    const plot = round6(simplifyRing(ring, 1.0));
    const areaM2 = Math.round(parcel?.areaM2 ?? ringArea(plot));
    const gprRaw = Number(parcel?.gpr);
    const gpr = pl.gpr ?? (Number.isFinite(gprRaw) && gprRaw > 0 ? gprRaw : 3.0);
    const levelId = `${id}-${pl.id}`;
    const bbox = squareAround(bboxOfRing(plot), SIM_PAD_M);
    const ctx = growBbox(bbox, CONTEXT_M);
    const sizeM = (bbox.e - bbox.w) * mPerDegLon((bbox.s + bbox.n) / 2);
    const grid = Math.max(192, Math.min(384, Math.ceil(sizeM / TARGET_M_PER_CELL / 64) * 64));
    const plotSizeM = Math.max((bboxOfRing(plot).e - bboxOfRing(plot).w) * mPerDegLon(pl.at[1]), (bboxOfRing(plot).n - bboxOfRing(plot).s) * 111_320);
    console.log(`\n== ${levelId}: ${parcel?.desc ?? "authored polygon"} ${(areaM2 / 10_000).toFixed(1)} ha, gpr ${gpr}, plot ${plotSizeM.toFixed(0)} m, sim box ${sizeM.toFixed(0)} m, grid ${grid} (${(sizeM / grid).toFixed(1)} m/cell)`);

    // existing buildings: HDB blocks with storeys, everything else from the map extract
    const hdbHere = hdbInBbox(hdb.blocks, ctx);
    const buildings: BakedBuilding[] = [];
    const hdbRings: Ring[] = [];
    for (const b of hdbHere) {
      const inPlay = inBbox(b.centroid, bbox);
      for (const r of b.rings) {
        hdbRings.push(r);
        buildings.push({ src: "hdb", h: Math.round(hdbHeight(b) * 10) / 10, fp: roundN(simplifyRing(r, inPlay ? 0.8 : 2.5), inPlay ? 6 : 5), blk: b.blk, kind: b.kind, storeys: b.storeys });
      }
    }
    let osmCount = 0, osmDefault = 0;
    let ways: Pt[][] = [];
    const tilesPath = join(RAW_DIR, "singapore.pmtiles");
    if (existsSync(tilesPath)) {
      const osm = await loadTiles(tilesPath, ctx);
      const others = dropOverlapping(osm.buildings.map((b) => ({ ...b, id: 0, tag: "yes" })), hdbRings);
      for (const b of others) {
        if (b.height < 3) continue;
        const inPlay = inBbox(b.centroid, bbox);
        buildings.push({ src: "osm", h: Math.round(b.height), fp: roundN(simplifyRing(b.ring, inPlay ? 0.8 : 2.5), inPlay ? 6 : 5) });
        osmCount++;
        if (b.source === "default") osmDefault++;
      }
      ways = osm.ways;
    } else console.warn(`osm: skipped, ${tilesPath} missing`);
    // the plot itself is empty land: drop low structures mapped inside it, warn about tall ones
    const inside = (b: BakedBuilding) => b.fp.some((q) => pointInRing(q, plot));
    for (let k = buildings.length - 1; k >= 0; k--) if (inside(buildings[k]!) && buildings[k]!.src === "osm" && buildings[k]!.h <= 9) buildings.splice(k, 1);
    const blocked = buildings.filter(inside).length;
    if (blocked) console.warn(`  ${blocked} existing buildings touch the plot`);
    console.log(`  hdb ${hdbHere.length} (${hdbHere.filter((b) => b.storeys !== undefined).length} with storeys), osm ${osmCount} (${osmDefault} default heights), ${ways.length} ways`);

    // ground kinds
    const ground: BakedLevel["ground"] = [];
    const groundBox = growBbox(bbox, 60);
    for (const p of parcels) {
      const kind = groundKind(p.desc);
      if (!kind || !p.ring.some((q) => inBbox(q, groundBox))) continue;
      ground.push({ kind, polygon: round6(simplifyRing(p.ring, 2.0)) });
    }

    // walkways: a lattice through the plot (the precinct's future footpaths) + mapped footways nearby
    const zone = round6(expandRing(plot, SCORE_ZONE_M));
    const district = round6(expandRing(plot, DISTRICT_M));
    const hotspots = pl.hotspots ?? [];
    for (const h of hotspots) if (!pointInRing(h.at, zone)) console.warn(`  hot spot ${h.id} lies outside the score zone`);
    const synth = latticeWays(plot, LATTICE_M, hotspots.map((h) => h.at));
    const paths = buildPaths([...ways, ...synth], bbox, zone);

    // tray from the plot ratio
    const flatsAllowed = Math.round((areaM2 * gpr) / GFA_PER_FLAT_M2);
    const tray = pl.tray ?? trayFor(flatsAllowed, areaM2);
    const trayHomes = tray.reduce((s, t) => s + t.count * (UNITS_PER_FLOOR[t.type] ?? 0) * heights.mid * RESIDENTS_PER_FLAT, 0);
    const homes = Math.round((0.85 * trayHomes) / 50) * 50;
    const blocksN = tray.reduce((s, t) => s + t.count, 0);
    const footprint = tray.reduce((s, t) => s + t.count * FOOTPRINT_M2[t.type]!, 0);
    console.log(`  plot ratio allows ~${flatsAllowed} flats; tray ${tray.map((t) => `${t.count} ${t.type}`).join(", ")} = ${Math.round(trayHomes)} residents at mid (target ${homes}); site coverage ${(100 * footprint / areaM2).toFixed(0)}%`);
    if (footprint > 0.32 * areaM2) console.warn("  tray covers more than a third of the plot; the careless layout may not fit");

    const required = pl.required ?? a.wind.required;
    const zoom = Math.round((16.9 - Math.log2(Math.max(120, plotSizeM) / 200)) * 10) / 10;
    const baked: BakedLevel = {
      id: levelId, name: a.name, town: id, plotIndex: i + 1, plotCount: a.plots.length, plotLabel: pl.label, gpr, areaM2, flatsAllowed,
      passPct: pl.passPct ?? 60, starPct: 75,
      subzone: pl.label, tagline: a.tagline,
      brief: pl.brief ?? `Plot ${i + 1} of ${a.plots.length}. House ${homes.toLocaleString()} people and keep the precinct breathable.`,
      camera: { zoom, pitch: 55, bearing: 0 }, grid,
      wind: { seasons: a.wind.seasons, required },
      bbox: [bbox.w, bbox.s, bbox.e, bbox.n].map(r6) as BakedLevel["bbox"],
      contextBbox: [ctx.w, ctx.s, ctx.e, ctx.n].map(r6) as BakedLevel["bbox"],
      district, scoreZone: zone, site: plot,
      areas: [{ id: pl.id, label: pl.label, polygon: plot, areaM2 }],
      hotspots, tray, heights, hangouts: [], ground, buildings, paths,
      targets: { homes, satisfaction: 0, holdSeconds: 4 },
      ...(pl.reference ? { reference: pl.reference } : {}),
      bakedAt: new Date().toISOString().slice(0, 10),
      stats: { hdb: hdbHere.length, osm: osmCount, ground: ground.length, pathNodes: paths.nodes.length, trayHomesMid: Math.round(trayHomes), blocks: blocksN },
    };
    const text = JSON.stringify(baked);
    writeFileSync(join("public/levels", `${levelId}.json`), text);
    console.log(`  wrote ${levelId}.json: ${(text.length / 1024).toFixed(0)} KB, ${buildings.length} buildings, ${paths.nodes.length} path nodes`);
    summaries.push({ id: levelId, n: i + 1, label: pl.label, polygon: plot, center: centroid(plot.slice(0, -1)).map(r6) as Pt, areaM2, gpr, flatsAllowed, homes, blocks: blocksN, seasons: required, hotspots: hotspots.length });
  }

  const town: TownData = {
    id, name: a.name, tagline: a.tagline, planningArea: a.planningArea,
    outline: round6(simplifyRing(outline, 8)),
    center: centroid(summaries.map((s) => s.center)).map(r6) as Pt,
    wind: a.wind, plots: summaries,
  };
  writeFileSync(join("public/levels", `${id}.json`), JSON.stringify(town));
  const indexPath = "public/levels/index.json";
  const index = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as LevelIndexEntry[]) : [];
  const entry: LevelIndexEntry = { id, name: a.name, subzone: a.planningArea, tagline: a.tagline, center: town.center, plots: summaries.length };
  const k = index.findIndex((e) => e.id === id);
  if (k >= 0) index[k] = entry; else index.push(entry);
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  console.log(`\nwrote ${id}.json (${summaries.length} plots) and index.json`);
}

const FOOTPRINT_M2: Record<string, number> = { slab: 54 * 13, point: 26 * 12 * 2 - 12 * 12, l: 40 * 14 * 2 - 14 * 14, courtyard: 4 * 40 * 14, mscp: 60 * 35, pavilion: 900 };

/** A tray that houses most of what the plot ratio allows, capped so the precinct stays playable. */
function trayFor(flatsAllowed: number, areaM2: number): TrayItem[] {
  const n = Math.max(4, Math.min(10, Math.round(flatsAllowed / 110)));
  const slabs = Math.ceil(n * 0.5), points = Math.round(n * 0.3), ls = Math.max(0, n - slabs - points);
  const tray: TrayItem[] = [{ type: "slab", count: slabs }, { type: "point", count: points }];
  if (ls) tray.push({ type: "l", count: ls });
  if (areaM2 >= 25_000) tray.push({ type: "mscp", count: 1 });
  return tray;
}

function loadPlanningArea(path: string, name: string): Ring {
  const fc = JSON.parse(readFileSync(path, "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] };
  const f = fc.features.find((x) => (x.properties.PLN_AREA_N ?? "").toUpperCase() === name.toUpperCase());
  if (!f) throw new Error(`planning area ${name} not found`);
  return outerRings(f.geometry).sort((p, q) => q.length - p.length)[0]!;
}

function ringArea(ring: Ring): number {
  const mLon = mPerDegLon(ring[0]![1]);
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i]![0] * mLon * ring[i + 1]![1] * 111_320 - ring[i + 1]![0] * mLon * ring[i]![1] * 111_320;
  return Math.abs(s) / 2;
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

/** Footpaths through an empty plot: a lattice every `spacingM` in both directions, clipped to the parcel, plus a loop just inside the edge and links to any hot spots. */
function latticeWays(plot: Ring, spacingM: number, extra: Pt[]): Pt[][] {
  const ways: Pt[][] = [];
  const c = centroid(plot.slice(0, -1));
  const mLon = mPerDegLon(c[1]);
  const bb = bboxOfRing(plot);
  const toLL = (x: number, y: number): Pt => [bb.w + x / mLon, bb.s + y / 111_320];
  const W = (bb.e - bb.w) * mLon, H = (bb.n - bb.s) * 111_320;
  const step = 4;
  const run = (pts: Pt[]): void => {
    let cur: Pt[] = [];
    for (const p of pts) {
      if (pointInRing(p, plot)) cur.push(p);
      else { if (cur.length > 1) ways.push(cur); cur = []; }
    }
    if (cur.length > 1) ways.push(cur);
  };
  for (let x = spacingM / 2; x < W; x += spacingM) { const pts: Pt[] = []; for (let y = 0; y <= H; y += step) pts.push(toLL(x, y)); run(pts); }
  for (let y = spacingM / 2; y < H; y += spacingM) { const pts: Pt[] = []; for (let x = 0; x <= W; x += step) pts.push(toLL(x, y)); run(pts); }
  ways.push(plot.map(([x, y]) => [c[0] + (x - c[0]) * 0.9, c[1] + (y - c[1]) * 0.9] as Pt));
  for (const h of extra) ways.push([c, h]);
  return ways;
}

main().catch((e) => { console.error(e); process.exit(1); });
