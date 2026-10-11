/** Small geometry helpers for the bake. Coordinates are [lon, lat] (WGS84). */
export type Pt = [number, number];
export type Ring = Pt[];

export const M_PER_DEG_LAT = 111_320;
export function mPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

export interface Bbox {
  w: number;
  s: number;
  e: number;
  n: number;
}

/** Square box of `sizeM` metres centred on a point. */
export function squareBbox(center: Pt, sizeM: number): Bbox {
  const dLat = sizeM / 2 / M_PER_DEG_LAT;
  const dLon = sizeM / 2 / mPerDegLon(center[1]);
  return { w: center[0] - dLon, s: center[1] - dLat, e: center[0] + dLon, n: center[1] + dLat };
}

export function growBbox(b: Bbox, marginM: number): Bbox {
  const lat = (b.s + b.n) / 2;
  const dLat = marginM / M_PER_DEG_LAT;
  const dLon = marginM / mPerDegLon(lat);
  return { w: b.w - dLon, s: b.s - dLat, e: b.e + dLon, n: b.n + dLat };
}

export function inBbox(p: Pt, b: Bbox): boolean {
  return p[0] >= b.w && p[0] <= b.e && p[1] >= b.s && p[1] <= b.n;
}

export function centroid(ring: Ring): Pt {
  let x = 0, y = 0;
  const n = ring.length;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / n, y / n];
}

/** Area in m² of a ring (shoelace, local metric scaling). */
export function ringAreaM2(ring: Ring): number {
  const lat = ring[0]?.[1] ?? 1.35;
  const kx = mPerDegLon(lat), ky = M_PER_DEG_LAT;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
    a += p[0] * kx * q[1] * ky - q[0] * kx * p[1] * ky;
  }
  return Math.abs(a) / 2;
}

export function pointInRing(p: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] + 1e-18) + a[0]) inside = !inside;
  }
  return inside;
}

/** Outer rings of a GeoJSON Polygon or MultiPolygon geometry. */
export function outerRings(geom: { type: string; coordinates: unknown }): Ring[] {
  if (geom.type === "Polygon") return [(geom.coordinates as Ring[])[0]!];
  if (geom.type === "MultiPolygon") return (geom.coordinates as Ring[][]).map((p) => p[0]!);
  return [];
}

/** Douglas–Peucker in metres; keeps the ring closed. */
export function simplifyRing(ring: Ring, tolM: number): Ring {
  const lat = ring[0]?.[1] ?? 1.35;
  const kx = mPerDegLon(lat), ky = M_PER_DEG_LAT;
  const pts = ring.map((p) => [p[0] * kx, p[1] * ky] as Pt);
  const closed = pts.length > 1 && pts[0]![0] === pts[pts.length - 1]![0] && pts[0]![1] === pts[pts.length - 1]![1];
  const open = closed ? pts.slice(0, -1) : pts;
  if (open.length < 5) return ring;
  const keep = new Array<boolean>(open.length).fill(false);
  keep[0] = true;
  keep[open.length - 1] = true;
  const stack: [number, number][] = [[0, open.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(open[i]!, open[a]!, open[b]!);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolM && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  // also test the closing edge (last -> first) so square corners survive
  const out: Ring = [];
  for (let i = 0; i < open.length; i++) if (keep[i]) out.push(ring[i]!);
  if (out.length < 3) return ring;
  out.push(out[0]!);
  return out;
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function round6(ring: Ring): Ring {
  return ring.map((p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]);
}

export function bboxOfRing(ring: Ring): Bbox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { w, s, e, n };
}

/** Square box (in metres) that contains `b`, padded by `padM`. */
export function squareAround(b: Bbox, padM: number): Bbox {
  const lat = (b.s + b.n) / 2;
  const wM = (b.e - b.w) * mPerDegLon(lat), hM = (b.n - b.s) * M_PER_DEG_LAT;
  const size = Math.max(wM, hM) + 2 * padM;
  return squareBbox([(b.w + b.e) / 2, lat], size);
}

/** Convex hull (Andrew's monotone chain) of points; returns a closed ring. */
export function convexHull(pts: Pt[]): Ring {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return [...p, p[0]!];
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop(); lower.push(q); }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]!; while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  const hull = [...lower, ...upper];
  hull.push(hull[0]!);
  return hull;
}

/** Pushes every vertex of a convex ring outward from its centroid by `m` metres (cheap buffer). */
export function expandRing(ring: Ring, m: number): Ring {
  const c = centroid(ring.slice(0, -1));
  const kx = mPerDegLon(c[1]), ky = M_PER_DEG_LAT;
  return ring.map(([x, y]) => {
    const dx = (x - c[0]) * kx, dy = (y - c[1]) * ky;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * m / kx, y + (dy / d) * m / ky] as Pt;
  });
}
