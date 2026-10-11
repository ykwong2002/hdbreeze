import { type GL } from "./gl";

/** Grid is 256 cells over ~800 m, so 3.125 m per cell. Layout from docs/plan.md spike A. */
export const N = 256;
export const METRES_PER_CELL = 800 / N;

export const SIGMA_VOID = 0.15;

interface Rect {
  cx: number; // metres from the domain's west edge
  cy: number; // metres from the south edge
  w: number;
  h: number;
  rotDeg: number;
  sigma: number;
  label: string;
}

/** Wind comes from the west by default (blows +x), so a "perpendicular" slab is tall in y. */
export const LAYOUT: Rect[] = [
  { cx: 280, cy: 400, w: 14, h: 70, rotDeg: 0, sigma: 1, label: "slab, perpendicular" },
  { cx: 280, cy: 190, w: 26, h: 26, rotDeg: 0, sigma: 1, label: "point block" },
  { cx: 280, cy: 610, w: 14, h: 70, rotDeg: 0, sigma: SIGMA_VOID, label: "slab, void deck" },
  { cx: 540, cy: 400, w: 70, h: 14, rotDeg: 0, sigma: 1, label: "slab, parallel" },
  { cx: 520, cy: 180, w: 60, h: 35, rotDeg: 20, sigma: 1, label: "carpark (low)" },
];

/** Rasterises the layout to an N×N RGBA8 texture; R = blockage sigma in [0,1]. */
export function buildObstacleTexture(gl: GL): { tex: WebGLTexture; sigma: Float32Array } {
  const sigma = new Float32Array(N * N);
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * METRES_PER_CELL;
      const y = (j + 0.5) * METRES_PER_CELL;
      let s = 0;
      for (const r of LAYOUT) {
        const a = (-r.rotDeg * Math.PI) / 180;
        const dx = x - r.cx;
        const dy = y - r.cy;
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2) s = Math.max(s, r.sigma);
      }
      const k = j * N + i;
      sigma[k] = s;
      data[k * 4] = Math.round(s * 255);
      data[k * 4 + 3] = 255;
    }
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return { tex, sigma };
}
