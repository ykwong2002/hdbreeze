/**
 * Non-HDB buildings and walkable ways from the local Protomaps PMTiles extract
 * (data/raw/singapore.pmtiles, see README). Offline and deterministic, unlike Overpass.
 */
import { closeSync, openSync, readSync } from "node:fs";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { centroid, inBbox, ringAreaM2, type Bbox, type Pt, type Ring } from "./geo.ts";

export interface TileBuilding {
  id: string;
  ring: Ring;
  centroid: Pt;
  height: number;
  source: "height" | "default";
}

const Z = 15;
const DEFAULT_HEIGHT = 9;

function fileSource(path: string) {
  const fd = openSync(path, "r");
  return {
    getKey: () => path,
    getBytes: async (offset: number, length: number) => {
      const buf = Buffer.alloc(length);
      readSync(fd, buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
    },
    close: () => closeSync(fd),
  };
}

function tileXY(lon: number, lat: number): [number, number] {
  const n = 2 ** Z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latR = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return [x, y];
}

export async function loadTiles(path: string, bbox: Bbox): Promise<{ buildings: TileBuilding[]; ways: Pt[][] }> {
  const src = fileSource(path);
  const pm = new PMTiles(src);
  const [x0, y0] = tileXY(bbox.w, bbox.n);
  const [x1, y1] = tileXY(bbox.e, bbox.s);
  const byId = new Map<string, TileBuilding>();
  const ways: Pt[][] = [];
  let tiles = 0;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const r = await pm.getZxy(Z, x, y);
      if (!r) continue;
      tiles++;
      const vt = new VectorTile(new Pbf(new Uint8Array(r.data)));
      const bl = vt.layers["buildings"];
      if (bl) {
        for (let i = 0; i < bl.length; i++) {
          const f = bl.feature(i);
          const props = f.properties as Record<string, unknown>;
          if (props.kind === "address") continue;
          const g = f.toGeoJSON(x, y, Z);
          const rings: Ring[] = g.geometry.type === "Polygon" ? [g.geometry.coordinates[0] as Ring] : g.geometry.type === "MultiPolygon" ? (g.geometry.coordinates as Ring[][]).map((p) => p[0]!) : [];
          const h = Number(props.height);
          for (const [k, ring] of rings.entries()) {
            const c = centroid(ring);
            if (!inBbox(c, bbox)) continue;
            const id = `${f.id ?? `${x}-${y}-${i}`}:${k}`;
            const area = ringAreaM2(ring);
            const prev = byId.get(id);
            if (prev && ringAreaM2(prev.ring) >= area) continue;
            byId.set(id, { id, ring, centroid: c, height: Number.isFinite(h) && h > 0 ? h : DEFAULT_HEIGHT, source: Number.isFinite(h) && h > 0 ? "height" : "default" });
          }
        }
      }
      const rl = vt.layers["roads"];
      if (rl) {
        for (let i = 0; i < rl.length; i++) {
          const f = rl.feature(i);
          const props = f.properties as Record<string, unknown>;
          if (props.kind !== "path" && props.kind !== "minor_road") continue;
          if (props.kind_detail === "steps" || props.kind_detail === "service" || props.kind_detail === "driveway" || props.kind_detail === "parking_aisle") continue;
          const g = f.toGeoJSON(x, y, Z);
          const lines: Pt[][] = g.geometry.type === "LineString" ? [g.geometry.coordinates as Pt[]] : g.geometry.type === "MultiLineString" ? (g.geometry.coordinates as Pt[][]) : [];
          for (const l of lines) if (l.length > 1) ways.push(l);
        }
      }
    }
  }
  src.close();
  console.log(`tiles: ${tiles} z${Z} tiles read`);
  return { buildings: [...byId.values()], ways };
}
