import empty from "../../public/fields/empty.json";
import careless from "../../public/fields/careless.json";
import aligned from "../../public/fields/aligned.json";

export type Pt = [number, number];
export interface BlockData { type: string; rotDeg: number; height: string; voidDeck: boolean; heightM: number; bodies: Pt[][]; columns: Pt[][] }
export interface Fields { size: number; heat: number[]; solid: number[]; u: number[]; v: number[] }
export interface Layout { meta: Meta; fields: Fields; blocks: BlockData[]; hot30: number; homes: number; breath: number }
export interface Meta { level: string; n: number; metresPerCell: number; tMax: number; fromDeg: number; plot: Pt[]; zone: Pt[]; context: { ring: Pt[]; h: number }[]; walkways: Pt[]; homesTarget: number; empty: number }

export const EMPTY = empty as unknown as Layout;
export const CARELESS = careless as unknown as Layout;
export const ALIGNED = aligned as unknown as Layout;
export const META: Meta = ALIGNED.meta;

/** Bilinear sample of a 128-grid field at sim-cell coordinates (0..n). */
export function sampleGrid(arr: number[], size: number, n: number, x: number, y: number): number {
  const gx = Math.min(size - 1.001, Math.max(0, (x / n) * size - 0.5));
  const gy = Math.min(size - 1.001, Math.max(0, (y / n) * size - 0.5));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const at = (i: number, j: number): number => arr[j * size + i] ?? 0;
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}
export function solidAt(f: Fields, n: number, x: number, y: number): boolean {
  const i = Math.min(f.size - 1, Math.max(0, Math.floor((x / n) * f.size)));
  const j = Math.min(f.size - 1, Math.max(0, Math.floor((y / n) * f.size)));
  return (f.solid[j * f.size + i] ?? 0) > 0.5;
}
