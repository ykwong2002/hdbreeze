/** The game's 5-stop heat ramp (src/map/overlay-layer.ts ramp()). */
const STOPS: [number, number, number][] = [[0.16, 0.47, 0.84], [0.55, 0.8, 0.86], [0.93, 0.9, 0.78], [0.96, 0.62, 0.3], [0.85, 0.22, 0.16]];
export function ramp(t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t)) * 4;
  const i = Math.min(3, Math.floor(u)), f = u - i;
  const a = STOPS[i]!, b = STOPS[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export const PAPER = "#f4f2ed";
export const INK = "#1f1c17";
export const INK_SOFT = "#6d6962";
export const COOL = "#2a9d9f";
export const HOT = "#e36b3a";
/** Player block colour (src/map/placed.ts) and its two shaded sides. */
export const BLOCK_TOP = "#a9d4cf";
export const BLOCK_LEFT = "#7fb2ad";
export const BLOCK_RIGHT = "#5f928e";
export const CTX_TOP = "#e6e2da";
export const CTX_LEFT = "#d6d1c8";
export const CTX_RIGHT = "#c6c1b7";
