import { readFileSync } from "node:fs";
import { centroid, inBbox, pointInRing, type Bbox, type Pt, type Ring } from "./geo.ts";

export interface OsmBuilding {
  id: number;
  ring: Ring;
  centroid: Pt;
  height: number;
  tag: string;
  source: "levels" | "height" | "default";
}
export interface OsmWay {
  id: number;
  pts: Pt[];
  highway: string;
}

interface Element {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lon: number; lat: number }[];
  nodes?: number[];
  lon?: number;
  lat?: number;
}

const DEFAULT_HEIGHT: Record<string, number> = {
  house: 7, detached: 7, terrace: 8, semidetached_house: 7, bungalow: 5,
  school: 12, kindergarten: 6, university: 15, college: 12,
  retail: 15, commercial: 15, office: 20, hotel: 30, apartments: 36, residential: 36,
  industrial: 10, warehouse: 10, garage: 3, garages: 3, carport: 3, parking: 12,
  church: 10, temple: 10, mosque: 12, place_of_worship: 10, hospital: 20,
  roof: 4, shelter: 3, pavilion: 4, kiosk: 3, toilets: 3, service: 4, transportation: 8, train_station: 10,
  sports_hall: 10, sports_centre: 10, stadium: 15, grandstand: 8, public: 10, civic: 12, government: 15,
  yes: 9,
};

export function loadOsm(path: string, bbox: Bbox): { buildings: OsmBuilding[]; ways: OsmWay[] } {
  const j = JSON.parse(readFileSync(path, "utf8")) as { elements: Element[] };
  const buildings: OsmBuilding[] = [];
  const ways: OsmWay[] = [];
  // "out geom" puts geometry on each way; "out body; >; out skel" ships nodes separately
  const nodeXY = new Map<number, Pt>();
  for (const e of j.elements) if (e.type === "node" && e.lon !== undefined && e.lat !== undefined) nodeXY.set(e.id, [e.lon, e.lat]);
  for (const e of j.elements) {
    if (e.type !== "way" || !e.tags) continue;
    const pts: Pt[] = e.geometry
      ? e.geometry.map((g) => [g.lon, g.lat])
      : (e.nodes ?? []).map((n) => nodeXY.get(n)).filter((p): p is Pt => p !== undefined);
    if (pts.length < 2) continue;
    if (e.tags.building) {
      if (e.tags.building === "construction" || pts.length < 4) continue;
      const ring = pts;
      const c = centroid(ring);
      if (!inBbox(c, bbox)) continue;
      const tag = e.tags.building;
      let height: number, source: OsmBuilding["source"];
      const levels = Number(e.tags["building:levels"]);
      const h = parseFloat(e.tags.height ?? "");
      if (Number.isFinite(levels) && levels > 0) { height = levels * 3.2 + 1; source = "levels"; }
      else if (Number.isFinite(h) && h > 0) { height = h; source = "height"; }
      else { height = DEFAULT_HEIGHT[tag] ?? 9; source = "default"; }
      buildings.push({ id: e.id, ring, centroid: c, height, tag, source });
    } else if (e.tags.highway) {
      ways.push({ id: e.id, pts, highway: e.tags.highway });
    }
  }
  return { buildings, ways };
}

/** Drops OSM buildings whose centroid falls inside any HDB footprint (HDB data wins). */
export function dropOverlapping(buildings: OsmBuilding[], hdbRings: Ring[]): OsmBuilding[] {
  return buildings.filter((b) => !hdbRings.some((r) => pointInRing(b.centroid, r)));
}
