import { readFileSync } from "node:fs";
import { centroid, inBbox, outerRings, type Bbox, type Pt, type Ring } from "./geo.ts";

export interface HdbBlock {
  blk: string;
  stCod: string;
  postal: string;
  rings: Ring[];
  centroid: Pt;
  storeys?: number;
  residential?: boolean;
  units?: number;
  street?: string;
  kind: "residential" | "carpark" | "pavilion" | "market" | "other";
}

interface PropertyRow {
  blk_no: string;
  street: string;
  max_floor_lvl: string;
  residential: string;
  multistorey_carpark: string;
  precinct_pavilion: string;
  market_hawker: string;
  total_dwelling_units: string;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]!);
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * ST_COD is an opaque HDB street code. Map each code to the Property Info
 * street whose block-number set best matches the code's block set
 * (greedy one-to-one on Jaccard, accept containment >= 0.5). See docs/plan.md 1.2.
 */
export function deriveStreetTable(footprints: HdbBlock[], rows: PropertyRow[]): Map<string, string> {
  const codeBlocks = new Map<string, Set<string>>();
  for (const f of footprints) {
    if (!codeBlocks.has(f.stCod)) codeBlocks.set(f.stCod, new Set());
    codeBlocks.get(f.stCod)!.add(f.blk);
  }
  const streetBlocks = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!streetBlocks.has(r.street)) streetBlocks.set(r.street, new Set());
    streetBlocks.get(r.street)!.add(r.blk_no);
  }
  const cands: { code: string; street: string; j: number; contain: number }[] = [];
  for (const [code, cb] of codeBlocks) {
    for (const [street, sb] of streetBlocks) {
      let inter = 0;
      for (const b of cb) if (sb.has(b)) inter++;
      if (inter === 0) continue;
      cands.push({ code, street, j: inter / (cb.size + sb.size - inter), contain: inter / cb.size });
    }
  }
  cands.sort((a, b) => b.j - a.j || b.contain - a.contain);
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const c of cands) {
    if (map.has(c.code) || used.has(c.street)) continue;
    if (c.contain < 0.5) continue;
    map.set(c.code, c.street);
    used.add(c.street);
  }
  return map;
}

export function loadHdb(footprintPath: string, propertyPath: string): { blocks: HdbBlock[]; table: Map<string, string>; matched: number } {
  const fc = JSON.parse(readFileSync(footprintPath, "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] };
  const rows = parseCsv(readFileSync(propertyPath, "utf8")) as unknown as PropertyRow[];
  const blocks: HdbBlock[] = fc.features.map((f) => {
    const rings = outerRings(f.geometry);
    return {
      blk: f.properties.BLK_NO ?? "",
      stCod: f.properties.ST_COD ?? "",
      postal: f.properties.POSTAL_COD ?? "",
      rings,
      centroid: centroid(rings[0] ?? [[0, 0]]),
      kind: "other",
    };
  });
  const table = deriveStreetTable(blocks, rows);
  const byKey = new Map<string, PropertyRow>();
  for (const r of rows) byKey.set(`${r.blk_no}|${r.street}`, r);
  let matched = 0;
  for (const b of blocks) {
    const street = table.get(b.stCod);
    const r = street ? byKey.get(`${b.blk}|${street}`) : undefined;
    if (!r) continue;
    matched++;
    b.street = street;
    b.storeys = Number(r.max_floor_lvl) || undefined;
    b.residential = r.residential === "Y";
    b.units = Number(r.total_dwelling_units) || 0;
    b.kind = r.residential === "Y" ? "residential" : r.multistorey_carpark === "Y" ? "carpark" : r.precinct_pavilion === "Y" ? "pavilion" : r.market_hawker === "Y" ? "market" : "other";
  }
  return { blocks, table, matched };
}

export function hdbInBbox(blocks: HdbBlock[], bbox: Bbox): HdbBlock[] {
  return blocks.filter((b) => inBbox(b.centroid, bbox));
}

/** HDB storeys to metres: 3 m per floor plus a 1.5 m void deck/roof allowance (brief: height ≈ floors × ~3 m). */
export function hdbHeight(b: HdbBlock): number {
  const floors = b.storeys ?? 12;
  return b.kind === "carpark" ? floors * 2.8 + 1 : floors * 3.0 + 1.5;
}
