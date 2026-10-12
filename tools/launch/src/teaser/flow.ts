import { random } from "remotion";
import { sampleGrid, solidAt, type Fields, type Pt } from "./data";

/** Precomputed streamline paths through a velocity field; seeded, so the render is deterministic. */
export interface Path { pts: Pt[]; offset: number }
export const PATH_LEN = 170;
export const TAIL = 26;
export const CYCLE = PATH_LEN + 30;

export function buildPaths(f: Fields, n: number, box: { x0: number; y0: number; x1: number; y1: number }, count: number, seed: string, stepCells: number): Path[] {
  const out: Path[] = [];
  for (let i = 0; i < count; i++) {
    let x = box.x0 + random(`${seed}-x${i}`) * (box.x1 - box.x0);
    let y = box.y0 + random(`${seed}-y${i}`) * (box.y1 - box.y0);
    const pts: Pt[] = [];
    for (let k = 0; k < PATH_LEN; k++) {
      if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1 || solidAt(f, n, x, y)) break;
      pts.push([x, y]);
      // RK2 through the field (u, v are cells per substep; stepCells sets the visual speed)
      const u1 = sampleGrid(f.u, f.size, n, x, y), v1 = sampleGrid(f.v, f.size, n, x, y);
      const m1 = Math.hypot(u1, v1) || 1e-6;
      const xm = x + (u1 / m1) * stepCells * 0.5, ym = y + (v1 / m1) * stepCells * 0.5;
      const u2 = sampleGrid(f.u, f.size, n, xm, ym), v2 = sampleGrid(f.v, f.size, n, xm, ym);
      const m2 = Math.hypot(u2, v2);
      if (m2 < 0.02) break; // dead air: the streak dies
      x += (u2 / m2) * stepCells * Math.min(1, m2 / 0.35);
      y += (v2 / m2) * stepCells * Math.min(1, m2 / 0.35);
    }
    if (pts.length > 6) out.push({ pts, offset: Math.floor(random(`${seed}-o${i}`) * CYCLE) });
  }
  return out;
}
