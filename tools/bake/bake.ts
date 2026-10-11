/**
 * Bakes one level: `node tools/bake/bake.ts <levelId>`.
 * Reads levels/<id>.json (authored), the data.gov.sg datasets (cached in data/raw/)
 * and an Overpass extract, and writes public/levels/<id>.json for the runtime.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDataset, RAW_DIR } from "./fetch.ts";
import { growBbox, inBbox, round6, simplifyRing, squareBbox, type Bbox, type Pt, type Ring } from "./geo.ts";
import { hdbHeight, hdbInBbox, loadHdb } from "./hdb.ts";
import { groundKind, loadLanduse, parcelAt } from "./landuse.ts";
import { dropOverlapping } from "./osm.ts";
import { loadTiles } from "./tiles.ts";

interface AuthoredLevel {
  id: string;
  name: string;
  tagline: string;
  area: { center: Pt; sizeM: number; contextM: number };
  camera: { zoom: number; pitch: number; bearing: number };
  grid: number;
  wind: { seasons: { id: string; label: string; fromDeg: number; speed: number }[]; required: string[] };
  plots: { id: string; label: string; at: Pt; maxStoreys: number; gpr: number; polygon?: Ring }[];
  hotspots: Pt[];
  targets: { homes: number; satisfaction: number; holdSeconds: number };
  palette: string[];
  onboarding: boolean;
}

export interface BakedBuilding {
  src: "hdb" | "osm";
  h: number;
  fp: Ring;
  blk?: string;
  kind?: string;
  storeys?: number;
}
export interface BakedLevel extends Omit<AuthoredLevel, "plots"> {
  bbox: [number, number, number, number];
  contextBbox: [number, number, number, number];
  plots: { id: string; label: string; polygon: Ring; maxStoreys: number; gpr: number; areaM2: number }[];
  ground: { kind: string; polygon: Ring }[];
  buildings: BakedBuilding[];
  paths: { nodes: Pt[]; edges: [number, number][] };
  bakedAt: string;
  stats: Record<string, number>;
}

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error("usage: node tools/bake/bake.ts <levelId>");
  const authored = JSON.parse(readFileSync(join("levels", `${id}.json`), "utf8")) as AuthoredLevel;
  const bbox = squareBbox(authored.area.center, authored.area.sizeM);
  const ctx = growBbox(bbox, authored.area.contextM);
  console.log(`level ${id}: play box ${fmt(bbox)}, context ${fmt(ctx)}`);

  const [fpPath, piPath, luPath] = await Promise.all([
    ensureDataset("hdb_existing_building"),
    ensureDataset("hdb_property_info"),
    ensureDataset("mp25_landuse"),
  ]);

  // HDB blocks with storeys
  const hdb = loadHdb(fpPath, piPath);
  console.log(`hdb: ${hdb.blocks.length} footprints, ${hdb.matched} joined (${((100 * hdb.matched) / hdb.blocks.length).toFixed(1)}%), ${hdb.table.size} street codes`);
  mkdirSync("tools/bake/data", { recursive: true });
  writeFileSync("tools/bake/data/stcod-street.json", JSON.stringify(Object.fromEntries([...hdb.table].sort()), null, 0) + "\n");
  const hdbHere = hdbInBbox(hdb.blocks, ctx);
  const hdbJoined = hdbHere.filter((b) => b.storeys !== undefined);
  const joinRate = hdbHere.length ? hdbJoined.length / hdbHere.length : 1;
  console.log(`hdb in context box: ${hdbHere.length}, joined ${hdbJoined.length} (${(100 * joinRate).toFixed(1)}%)`);
  if (joinRate < 0.99) {
    const missing = hdbHere.filter((b) => b.storeys === undefined).map((b) => `${b.blk}/${b.stCod}`);
    console.warn(`  unmatched: ${missing.join(", ")}`);
  }
  const buildings: BakedBuilding[] = [];
  const hdbRings: Ring[] = [];
  for (const b of hdbHere) {
    const inPlay = inBbox(b.centroid, bbox);
    for (const ring of b.rings) {
      const fp = round6(simplifyRing(ring, inPlay ? 0.7 : 1.5));
      hdbRings.push(ring);
      buildings.push({ src: "hdb", h: Math.round(hdbHeight(b) * 10) / 10, fp, blk: b.blk, kind: b.kind, storeys: b.storeys });
    }
  }

  // OSM via the local Protomaps extract: everything that is not an HDB block, plus walkable ways
  let osmCount = 0, osmDefault = 0;
  let paths: BakedLevel["paths"] = { nodes: [], edges: [] };
  const tilesPath = join(RAW_DIR, "singapore.pmtiles");
  if (existsSync(tilesPath)) {
    const osm = await loadTiles(tilesPath, ctx);
    const others = dropOverlapping(osm.buildings.map((b) => ({ ...b, id: 0, tag: "yes" })), hdbRings);
    for (const b of others) {
      const inPlay = inBbox(b.centroid, bbox);
      buildings.push({ src: "osm", h: Math.round(b.height * 10) / 10, fp: round6(simplifyRing(b.ring, inPlay ? 0.8 : 1.5)) });
      osmCount++;
      if (b.source === "default") osmDefault++;
    }
    paths = buildPaths(osm.ways, bbox);
    console.log(`osm: ${osm.buildings.length} buildings, ${others.length} kept (${osmDefault} default heights); paths ${paths.nodes.length} nodes / ${paths.edges.length} edges`);
  } else {
    console.warn(`osm: skipped, ${tilesPath} missing (see README: pmtiles extract)`);
  }

  // Ground kinds and plots from the Master Plan land-use layer
  const parcels = loadLanduse(luPath, ctx);
  const groundBox = growBbox(bbox, 60);
  const ground: BakedLevel["ground"] = [];
  for (const p of parcels) {
    const kind = groundKind(p.desc);
    if (!kind) continue;
    if (!p.ring.some((q) => inBbox(q, groundBox))) continue;
    ground.push({ kind, polygon: round6(simplifyRing(p.ring, 2.0)) });
  }
  const plots: BakedLevel["plots"] = [];
  for (const p of authored.plots) {
    const parcel = p.polygon ? undefined : parcelAt(parcels, p.at);
    const ring = p.polygon ?? parcel?.ring;
    if (!ring) { console.warn(`plot ${p.id}: no land-use parcel at ${p.at.join(",")}`); continue; }
    // sheds, shelters and other low unknown structures inside a plot make way for the player
    const inside = (b: BakedBuilding) => b.fp.some((q) => inRing(q, ring));
    const dropped = buildings.filter((b) => inside(b) && b.src === "osm" && b.h <= 9).length;
    for (let i = buildings.length - 1; i >= 0; i--) if (inside(buildings[i]!) && buildings[i]!.src === "osm" && buildings[i]!.h <= 9) buildings.splice(i, 1);
    const blocked = buildings.filter(inside).length;
    if (dropped) console.log(`plot ${p.id}: dropped ${dropped} low structures`);
    if (blocked) console.warn(`plot ${p.id} (${parcel?.desc ?? "authored"}): ${blocked} existing buildings still touch it`);
    plots.push({ id: p.id, label: p.label, polygon: round6(simplifyRing(ring, 1.0)), maxStoreys: p.maxStoreys, gpr: p.gpr, areaM2: Math.round(parcel ? parcel.areaM2 : 0) });
  }

  const baked: BakedLevel = {
    ...authored,
    bbox: [bbox.w, bbox.s, bbox.e, bbox.n].map((v) => Math.round(v * 1e6) / 1e6) as BakedLevel["bbox"],
    contextBbox: [ctx.w, ctx.s, ctx.e, ctx.n].map((v) => Math.round(v * 1e6) / 1e6) as BakedLevel["bbox"],
    plots,
    ground,
    buildings,
    paths,
    bakedAt: new Date().toISOString().slice(0, 10),
    stats: { hdb: hdbHere.length, hdbJoined: hdbJoined.length, osm: osmCount, osmDefaultHeight: osmDefault, ground: ground.length, plots: plots.length },
  };
  mkdirSync("public/levels", { recursive: true });
  const out = join("public/levels", `${id}.json`);
  const text = JSON.stringify(baked);
  writeFileSync(out, text);
  console.log(`wrote ${out}: ${(text.length / 1024).toFixed(0)} KB, ${buildings.length} buildings, ${ground.length} ground polygons, ${plots.length} plots`);
  if (!existsSync("public/levels/index.json")) writeFileSync("public/levels/index.json", "[]");
  const index = JSON.parse(readFileSync("public/levels/index.json", "utf8")) as { id: string; name: string; tagline: string; center: Pt }[];
  const entry = { id, name: authored.name, tagline: authored.tagline, center: authored.area.center };
  const i = index.findIndex((e) => e.id === id);
  if (i >= 0) index[i] = entry; else index.push(entry);
  writeFileSync("public/levels/index.json", JSON.stringify(index, null, 2) + "\n");
}

function inRing(p: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] + 1e-18) + a[0]) inside = !inside;
  }
  return inside;
}

/** Walkable graph: OSM way vertices inside the play box, snapped to 1 m so shared nodes join. */
function buildPaths(ways: Pt[][], bbox: Bbox): BakedLevel["paths"] {
  const nodes: Pt[] = [];
  const idx = new Map<string, number>();
  const edges: [number, number][] = [];
  const key = (p: Pt) => `${Math.round(p[0] * 1e5)}|${Math.round(p[1] * 1e5)}`;
  const nodeId = (p: Pt): number => {
    const k = key(p);
    let i = idx.get(k);
    if (i === undefined) { i = nodes.length; idx.set(k, i); nodes.push([Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]); }
    return i;
  };
  for (const w of ways) {
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1]!, b = w[i]!;
      if (!inBbox(a, bbox) && !inBbox(b, bbox)) continue;
      const ia = nodeId(a), ib = nodeId(b);
      if (ia !== ib) edges.push([ia, ib]);
    }
  }
  return { nodes, edges };
}

function fmt(b: Bbox): string {
  return `${b.w.toFixed(5)},${b.s.toFixed(5)},${b.e.toFixed(5)},${b.n.toFixed(5)}`;
}

main().catch((e) => { console.error(e); process.exit(1); });
