import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** data.gov.sg datasets used by the bake (ids from docs/brief.md). */
export const DATASETS = {
  hdb_existing_building: { id: "d_16b157c52ed637edd6ba1232e026258d", file: "hdb_existing_building.geojson" },
  hdb_property_info: { id: "d_17f5382f26140b1fdae0ba2ef6239d2f", file: "hdb_property_info.csv" },
  mp25_planning_area: { id: "d_2cc750190544007400b2cfd5d7f53209", file: "mp25_planning_area.geojson" },
  mp25_landuse: { id: "d_a8c3546b26712e35021f3a681d0353ae", file: "mp25_landuse.geojson" },
} as const;

export const RAW_DIR = join(process.cwd(), "data", "raw");
const UA = "hdbreeze-bake/0.1 (+https://github.com/ykwong2002/hdbreeze)";

/** Downloads a dataset into data/raw/ unless it is already there. ~1 poll per 10 s is tolerated without a key. */
export async function ensureDataset(key: keyof typeof DATASETS): Promise<string> {
  const { id, file } = DATASETS[key];
  mkdirSync(RAW_DIR, { recursive: true });
  const path = join(RAW_DIR, file);
  if (existsSync(path)) return path;
  console.log(`fetching ${key} …`);
  let url: string | undefined;
  for (let attempt = 0; attempt < 6 && !url; attempt++) {
    const r = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${id}/poll-download`, { headers: { "User-Agent": UA } });
    const j = (await r.json()) as { data?: { url?: string } };
    url = j.data?.url;
    if (!url) await new Promise((res) => setTimeout(res, 10_000));
  }
  if (!url) throw new Error(`poll-download gave no url for ${key}`);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`download ${key}: HTTP ${r.status}`);
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  return path;
}

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** Buildings and walkable ways with geometry for a bbox, cached per level in data/raw/. */
export async function ensureOsm(levelId: string, bbox: { w: number; s: number; e: number; n: number }): Promise<string> {
  mkdirSync(RAW_DIR, { recursive: true });
  const path = join(RAW_DIR, `osm-${levelId}.json`);
  if (existsSync(path)) return path;
  const b = `${bbox.s},${bbox.w},${bbox.n},${bbox.e}`;
  const sel = `(way["building"](${b});way["highway"~"^(footway|path|pedestrian|steps|cycleway|residential|living_street|service|unclassified|tertiary)$"](${b}););`;
  // Overpass has been flaky with "out geom"; the classic ways + node skeleton form is the fallback.
  const queries = [`[out:json][timeout:180];${sel}out body;>;out skel qt;`, `[out:json][timeout:90];${sel}out geom;`];
  for (const [qi, q] of queries.entries()) for (const m of OVERPASS) {
    try {
      console.log(`overpass ${m} (form ${qi + 1}) …`);
      const r = await fetch(m, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const j = JSON.parse(text) as { elements?: unknown[] };
      if (!j.elements || j.elements.length < 10) throw new Error("too few elements");
      writeFileSync(path, text);
      return path;
    } catch (e) {
      console.warn(`  failed: ${(e as Error).message}`);
    }
  }
  throw new Error("all Overpass mirrors failed");
}
