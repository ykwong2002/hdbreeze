import { readFileSync } from "node:fs";
import { outerRings, ringAreaM2, type Ring } from "./geo.ts";

export interface Subzone {
  name: string;
  planningArea: string;
  /** Largest outer ring (subzones with sea bits can be multipolygons). */
  ring: Ring;
  areaM2: number;
}

/** Master Plan 2019 Subzone Boundary (No Sea): SUBZONE_N / PLN_AREA_N. */
export function loadSubzones(path: string): Subzone[] {
  const fc = JSON.parse(readFileSync(path, "utf8")) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] };
  return fc.features.map((f) => {
    const rings = outerRings(f.geometry);
    let ring = rings[0]!, area = 0;
    for (const r of rings) { const a = ringAreaM2(r); if (a > area) { area = a; ring = r; } }
    return { name: f.properties.SUBZONE_N ?? "", planningArea: f.properties.PLN_AREA_N ?? "", ring, areaM2: area };
  });
}

export function findSubzone(list: Subzone[], name: string, planningArea?: string): Subzone | undefined {
  const n = name.toUpperCase();
  return list.find((s) => s.name === n && (!planningArea || s.planningArea === planningArea.toUpperCase()));
}
