import type { LonLat, Ring } from "./level-types";
import { typology, type Rect, type TypologyId } from "./typologies";

/** Placement rules: a block must sit entirely inside its area and must not overlap another block. */
const M_PER_DEG_LAT = 111_320;

export function pointInRing(p: LonLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] + 1e-18) + a[0]) inside = !inside;
  }
  return inside;
}

export function ringCentroid(ring: Ring): LonLat {
  let x = 0, y = 0;
  const n = ring.length;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / n, y / n];
}

/** Rotated rectangle corners in lon/lat. */
export function rectCorners(center: LonLat, r: Rect, rotDeg: number): LonLat[] {
  const a = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const mLon = M_PER_DEG_LAT * Math.cos((center[1] * Math.PI) / 180);
  const out: LonLat[] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = r.cx + (sx * r.w) / 2, y = r.cy + (sy * r.h) / 2;
    const rx = x * cos - y * sin, ry = x * sin + y * cos;
    out.push([center[0] + rx / mLon, center[1] + ry / M_PER_DEG_LAT]);
  }
  return out;
}

export function footprintInside(area: Ring, type: TypologyId, center: LonLat, rotDeg: number): boolean {
  for (const r of typology(type).rects) for (const c of rectCorners(center, r, rotDeg)) if (!pointInRing(c, area)) return false;
  return true;
}

/**
 * Returns a centre inside the area for this block: the requested point if the
 * footprint fits there, otherwise the nearest point on the line toward the
 * area's centroid where it does, or null if it fits nowhere on that line.
 */
export function fitInside(area: Ring, type: TypologyId, at: LonLat, rotDeg: number): LonLat | null {
  if (footprintInside(area, type, at, rotDeg)) return at;
  const c = ringCentroid(area);
  if (!footprintInside(area, type, c, rotDeg)) return null;
  let lo = 0, hi = 1; // lo: outside, hi: inside
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2;
    const p: LonLat = [at[0] + (c[0] - at[0]) * t, at[1] + (c[1] - at[1]) * t];
    if (footprintInside(area, type, p, rotDeg)) hi = t; else lo = t;
  }
  return [at[0] + (c[0] - at[0]) * hi, at[1] + (c[1] - at[1]) * hi];
}

/** Separating-axis test between two convex polygons (metres). */
function polysOverlap(a: [number, number][], b: [number, number][]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
      const nx = -(q[1] - p[1]), ny = q[0] - p[0];
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a) { const d = v[0] * nx + v[1] * ny; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const v of b) { const d = v[0] * nx + v[1] * ny; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

function rectsInMetres(center: LonLat, type: TypologyId, rotDeg: number, origin: LonLat, gapM: number): [number, number][][] {
  const mLon = M_PER_DEG_LAT * Math.cos((origin[1] * Math.PI) / 180);
  const a = (rotDeg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const ox = (center[0] - origin[0]) * mLon, oy = (center[1] - origin[1]) * M_PER_DEG_LAT;
  return typology(type).rects.map((r) => {
    const w = r.w + gapM, h = r.h + gapM;
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
      const x = r.cx + (sx * w) / 2, y = r.cy + (sy * h) / 2;
      return [ox + x * cos - y * sin, oy + x * sin + y * cos] as [number, number];
    });
  });
}

export interface Footprint {
  center: LonLat;
  type: TypologyId;
  rotDeg: number;
}

/** True if two blocks' footprints (with a small gap) overlap. */
export function blocksOverlap(a: Footprint, b: Footprint, gapM = 4): boolean {
  const ra = rectsInMetres(a.center, a.type, a.rotDeg, a.center, gapM);
  const rb = rectsInMetres(b.center, b.type, b.rotDeg, a.center, 0);
  for (const x of ra) for (const y of rb) if (polysOverlap(x, y)) return true;
  return false;
}

/** True if lon/lat point `p` lies inside the rotated rectangle. */
export function rectContains(center: LonLat, r: Rect, rotDeg: number, p: LonLat): boolean {
  const a = (-rotDeg * Math.PI) / 180;
  const mLon = M_PER_DEG_LAT * Math.cos((center[1] * Math.PI) / 180);
  const dx = (p[0] - center[0]) * mLon, dy = (p[1] - center[1]) * M_PER_DEG_LAT;
  const lx = dx * Math.cos(a) - dy * Math.sin(a) - r.cx, ly = dx * Math.sin(a) + dy * Math.cos(a) - r.cy;
  return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2;
}
