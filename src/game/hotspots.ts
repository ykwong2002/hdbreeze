import type { Agents } from "./agents";
import type { HeatReadback } from "../sim/readback";
import { comfortFromFeels, feelsLikeC } from "./scoring";

/**
 * Hot spots: walkway pockets the breeze cannot reach in the level's empty state.
 * Found once the flow has settled, clustered, and marked on the map; the score
 * leans on them so the player's job is to steer wind into them.
 */
export interface HotSpot {
  id: number;
  /** Cluster centre, sim cells. */
  x: number;
  y: number;
  /** Member sample points, sim cells. */
  points: [number, number][];
  /** Current mean feels-like at the members. */
  feels: number;
  cooled: boolean;
}

const HOT_FEELS = 32.0; // a point counts as wind-starved above this
const COOL_FEELS = 30.0; // a spot counts as cooled below this
const MAX_SPOTS = 4;

export function findHotSpots(agents: Agents, readback: HeatReadback, n: number, tMax: number, metresPerCell: number): HotSpot[] {
  const pts = agents.samplePoints([]);
  const hot: [number, number][] = [];
  for (const p of pts) {
    const T = readback.sample(p[0], p[1], n);
    if (T !== null && feelsLikeC(T, tMax) >= HOT_FEELS) hot.push(p);
  }
  // greedy clustering by radius
  const radius = 45 / metresPerCell;
  const spots: HotSpot[] = [];
  const used = new Set<number>();
  while (spots.length < MAX_SPOTS) {
    let best = -1, bestCount = 0;
    for (let i = 0; i < hot.length; i++) {
      if (used.has(i)) continue;
      let c = 0;
      for (let j = 0; j < hot.length; j++) if (!used.has(j) && Math.hypot(hot[i]![0] - hot[j]![0], hot[i]![1] - hot[j]![1]) <= radius) c++;
      if (c > bestCount) { bestCount = c; best = i; }
    }
    if (best < 0 || bestCount < 6) break;
    const members: [number, number][] = [];
    for (let j = 0; j < hot.length; j++) if (!used.has(j) && Math.hypot(hot[best]![0] - hot[j]![0], hot[best]![1] - hot[j]![1]) <= radius) { used.add(j); members.push(hot[j]!); }
    const cx = members.reduce((s, p) => s + p[0], 0) / members.length, cy = members.reduce((s, p) => s + p[1], 0) / members.length;
    spots.push({ id: spots.length + 1, x: cx, y: cy, points: members, feels: 35, cooled: false });
  }
  return spots;
}

/** Updates each spot's feels/cooled and returns the mean comfort over all spot members (null if none). */
export function scoreHotSpots(spots: HotSpot[], readback: HeatReadback, n: number, tMax: number): { comfort: number | null; feels: number | null } {
  let c = 0, f = 0, k = 0;
  for (const s of spots) {
    let sf = 0, sk = 0;
    for (const p of s.points) {
      const T = readback.sample(p[0], p[1], n);
      if (T === null) continue;
      const feels = feelsLikeC(T, tMax);
      sf += feels; sk++;
      c += comfortFromFeels(feels); f += feels; k++;
    }
    if (sk) { s.feels = sf / sk; s.cooled = s.feels < COOL_FEELS; }
  }
  return k ? { comfort: c / k, feels: f / k } : { comfort: null, feels: null };
}
