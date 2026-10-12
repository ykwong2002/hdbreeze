import { Easing, interpolate } from "remotion";
import type { Pt } from "./data";

/**
 * Isometric camera over the sim box (cell units, y north, z up in cells). A slow push-in and a few
 * degrees of orbit across the video; everything is a pure function of the frame.
 */
export interface Cam { cx: number; cy: number; phi: number; s: number; ox: number; oy: number; zk: number }

const ISO_X = Math.cos(Math.PI / 6);
const ISO_Y = Math.sin(Math.PI / 6);

export function cameraAt(frame: number, w: number, h: number, focus: Pt, spanCells: number): Cam {
  const t = Math.min(1, frame / 405); // still for the last 1.5 s
  const push = interpolate(t, [0, 1], [1.0, 1.14], { easing: Easing.inOut(Easing.quad) });
  const phi = interpolate(t, [0, 1], [-3, 3], { easing: Easing.inOut(Easing.quad) }) * (Math.PI / 180);
  const landscape = w > h;
  const s = (Math.min(w, h * (landscape ? 1.5 : 0.8)) * 0.9) / (spanCells * ISO_X * 2) * push;
  return { cx: focus[0], cy: focus[1], phi, s, ox: w / 2, oy: h * (landscape ? 0.66 : 0.6), zk: 0.95 };
}

export function project(c: Cam, x: number, y: number, z = 0): Pt {
  const dx = x - c.cx, dy = y - c.cy;
  const cos = Math.cos(c.phi), sin = Math.sin(c.phi);
  const xr = dx * cos - dy * sin, yr = dx * sin + dy * cos;
  return [c.ox + (xr - yr) * ISO_X * c.s, c.oy - (xr + yr) * ISO_Y * c.s - z * c.zk * c.s];
}

/** Depth for painter's sorting: larger is nearer the viewer. */
export function depth(c: Cam, x: number, y: number): number {
  const dx = x - c.cx, dy = y - c.cy;
  const cos = Math.cos(c.phi), sin = Math.sin(c.phi);
  return dx * sin + dy * cos + (dx * cos - dy * sin);
}

/** Affine matrix mapping cell (x, y) to screen, for canvas setTransform. */
export function affine(c: Cam): [number, number, number, number, number, number] {
  const o = project(c, 0, 0), ex = project(c, 1, 0), ey = project(c, 0, 1);
  return [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]];
}
