import type { HotSpotDef } from "./level-types";
import type { HeatReadback } from "../sim/readback";
import { feelsLikeC } from "./scoring";

/** Authored hot spots with live felt temperature, sampled over a small disc of cells. */
export interface HotSpot extends HotSpotDef {
  /** Centre in sim cells. */
  x: number;
  y: number;
  points: [number, number][];
  feels: number;
  cooled: boolean;
}

export function makeHotSpots(defs: HotSpotDef[], toCell: (lon: number, lat: number) => [number, number], metresPerCell: number): HotSpot[] {
  const r = 12 / metresPerCell;
  return defs.map((d) => {
    const [x, y] = toCell(d.at[0], d.at[1]);
    const points: [number, number][] = [[x, y]];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; points.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
    return { ...d, x, y, points, feels: 35, cooled: false };
  });
}

/** Updates feels/cooled per spot; returns the mean feels and whether every spot is under target. */
export function updateHotSpots(spots: HotSpot[], readback: HeatReadback, n: number, tMax: number): { meanFeels: number | null; allCooled: boolean; marginOk: boolean } {
  let f = 0, k = 0, all = true, margin = true;
  for (const s of spots) {
    let sf = 0, sk = 0;
    for (const p of s.points) {
      const T = readback.sample(p[0], p[1], n);
      if (T === null) continue;
      sf += feelsLikeC(T, tMax); sk++;
    }
    if (sk) { s.feels = sf / sk; f += s.feels; k++; }
    s.cooled = s.feels < s.targetC;
    if (!s.cooled) all = false;
    if (s.feels > s.targetC - 1.5) margin = false;
  }
  return { meanFeels: k ? f / k : null, allCooled: spots.length > 0 && all, marginOk: spots.length > 0 && margin };
}
