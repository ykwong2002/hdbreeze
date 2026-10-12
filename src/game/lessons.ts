import type { LevelSession } from "./level";
import { typology } from "./typologies";

/** One line about what the cleared layout did right, from simple geometry checks. */
export function lessonFor(s: LevelSession): string {
  const blocks = s.blocks.blocks;
  const residential = blocks.filter((b) => typology(b.type).residential);
  if (!residential.length) return "Gaps between blocks are wind corridors: the more of them face the wind, the cooler the streets.";
  const wind = s.season.fromDeg;
  const along = (90 - wind + 360) % 180;
  const diff = (a: number, b: number): number => { const d = Math.abs(((a - b) % 180) + 180) % 180; return Math.min(d, 180 - d); };
  const slabs = residential.filter((b) => b.type === "slab" || b.type === "l");
  const alongFrac = slabs.length ? slabs.filter((b) => diff(b.rotDeg, along) <= 30).length / slabs.length : 0;
  const voidFrac = residential.filter((b) => b.voidDeck).length / residential.length;
  // height stepping: are the upwind blocks lower than the downwind ones?
  const f = (wind * Math.PI) / 180;
  const toWind = [Math.sin(f), Math.cos(f)]; // unit vector pointing where the wind comes from
  const mLon = 111_320 * Math.cos((residential[0]!.center[1] * Math.PI) / 180);
  const upwindness = residential.map((b) => b.center[0] * mLon * toWind[0]! + b.center[1] * 111_320 * toWind[1]!);
  const h = residential.map((b) => ({ low: 0, mid: 1, high: 2 }[b.height]));
  const n = residential.length;
  const mu = upwindness.reduce((a, b) => a + b, 0) / n, mh = h.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vu = 0, vh = 0;
  for (let i = 0; i < n; i++) { cov += (upwindness[i]! - mu) * (h[i]! - mh); vu += (upwindness[i]! - mu) ** 2; vh += (h[i]! - mh) ** 2; }
  const corr = vu && vh ? cov / Math.sqrt(vu * vh) : 0;
  if (alongFrac >= 0.6) return `${Math.round(alongFrac * 100)}% of your slabs run along the wind. The gaps between them are breezeways: this is what planners call a wind corridor.`;
  if (corr <= -0.4) return "Low blocks on the windward side, tall ones behind: the breeze steps over the precinct instead of hitting a wall. Planners call this height stepping.";
  if (voidFrac >= 0.5) return `Void decks on ${Math.round(voidFrac * 100)}% of your blocks let the breeze through at street level, where people actually walk.`;
  return "Gaps between blocks are wind corridors: the more of them face the wind, the cooler the streets. Try turning a slab along the arrow.";
}
