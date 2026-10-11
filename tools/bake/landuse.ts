import { readFileSync } from "node:fs";
import { centroid, inBbox, outerRings, pointInRing, ringAreaM2, type Bbox, type Pt, type Ring } from "./geo.ts";

export type GroundKind = "park" | "water" | "road" | "paved";

export interface LandParcel {
  desc: string;
  gpr: string;
  ring: Ring;
  areaM2: number;
}

const KIND_BY_DESC: Record<string, GroundKind> = {
  PARK: "park",
  "OPEN SPACE": "park",
  "BEACH AREA": "park",
  AGRICULTURE: "park",
  CEMETERY: "park",
  "SPORTS & RECREATION": "park",
  WATERBODY: "water",
  ROAD: "road",
};

/** Streams the 190 MB land-use file once; returns parcels touching the bbox. */
export function loadLanduse(path: string, bbox: Bbox): LandParcel[] {
  const fc = JSON.parse(readFileSync(path, "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] };
  const out: LandParcel[] = [];
  for (const f of fc.features) {
    for (const ring of outerRings(f.geometry)) {
      if (!ring.some((p) => inBbox(p, bbox)) && !inBbox(centroid(ring), bbox)) continue;
      out.push({ desc: f.properties.LU_DESC ?? "", gpr: f.properties.GPR ?? "", ring, areaM2: ringAreaM2(ring) });
    }
  }
  return out;
}

export function groundKind(desc: string): GroundKind | undefined {
  return KIND_BY_DESC[desc];
}

/** The parcel containing a point (smallest wins when nested). */
export function parcelAt(parcels: LandParcel[], p: Pt): LandParcel | undefined {
  let best: LandParcel | undefined;
  for (const q of parcels) {
    if (!pointInRing(p, q.ring)) continue;
    if (!best || q.areaM2 < best.areaM2) best = q;
  }
  return best;
}
