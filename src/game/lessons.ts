import type { LevelSession } from "./level";
import type { Technique } from "./level-types";
import { typology } from "./typologies";

export const TECHNIQUE_LABEL: Record<Technique, string> = {
  corridors: "Wind corridors: turn slabs along the wind and leave gaps between the rows",
  void: "Void decks: open the ground floor of at least half your blocks so the breeze passes underneath",
  stepping: "Height stepping: keep the windward blocks low and put the tall ones behind",
};

interface Geometry { alongFrac: number; voidFrac: number; corr: number; n: number }

function geometry(s: LevelSession): Geometry {
  const residential = s.blocks.blocks.filter((b) => typology(b.type).residential);
  const n = residential.length;
  if (!n) return { alongFrac: 0, voidFrac: 0, corr: 0, n: 0 };
  const wind = s.season.fromDeg;
  const along = (90 - wind + 360) % 180;
  const diff = (a: number, b: number): number => { const d = Math.abs(((a - b) % 180) + 180) % 180; return Math.min(d, 180 - d); };
  const slabs = residential.filter((b) => b.type === "slab" || b.type === "l");
  const alongFrac = slabs.length ? slabs.filter((b) => diff(b.rotDeg, along) <= 30).length / slabs.length : 0;
  const voidFrac = residential.filter((b) => b.voidDeck).length / n;
  const f = (wind * Math.PI) / 180;
  const toWind = [Math.sin(f), Math.cos(f)];
  const mLon = 111_320 * Math.cos((residential[0]!.center[1] * Math.PI) / 180);
  const up = residential.map((b) => b.center[0] * mLon * toWind[0]! + b.center[1] * 111_320 * toWind[1]!);
  const h = residential.map((b) => ({ low: 0, mid: 1, high: 2 }[b.height]));
  const mu = up.reduce((a, b) => a + b, 0) / n, mh = h.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vu = 0, vh = 0;
  for (let i = 0; i < n; i++) { cov += (up[i]! - mu) * (h[i]! - mh); vu += (up[i]! - mu) ** 2; vh += (h[i]! - mh) ** 2; }
  return { alongFrac, voidFrac, corr: vu && vh ? cov / Math.sqrt(vu * vh) : 0, n };
}

/** Whether the plot's focus technique is present in the current layout. */
export function techniqueOk(s: LevelSession): boolean {
  const g = geometry(s);
  switch (s.level.focus ?? "corridors") {
    case "corridors": return g.alongFrac >= 0.6;
    case "void": return g.voidFrac >= 0.5;
    case "stepping": return g.corr <= -0.4;
  }
}

/** One line about what the cleared layout did right; the plot's focus technique comes first when present. */
export function lessonFor(s: LevelSession): string {
  const g = geometry(s);
  if (!g.n) return "Gaps between blocks are wind corridors: the more of them face the wind, the cooler the streets.";
  const lines: { ok: boolean; id: Technique; text: string }[] = [
    { id: "corridors", ok: g.alongFrac >= 0.6, text: `${Math.round(g.alongFrac * 100)}% of your slabs run along the wind. The gaps between them are breezeways: what planners call wind corridors.` },
    { id: "stepping", ok: g.corr <= -0.4, text: "Low blocks on the windward side, tall ones behind: the breeze steps over the precinct instead of hitting a wall. One approach planners use, called height stepping." },
    { id: "void", ok: g.voidFrac >= 0.5, text: `Void decks on ${Math.round(g.voidFrac * 100)}% of your blocks let the breeze through at street level, where people actually walk.` },
  ];
  const focus = s.level.focus ?? "corridors";
  const hit = lines.find((l) => l.id === focus && l.ok) ?? lines.find((l) => l.ok);
  if (hit) return hit.text;
  const miss = lines.find((l) => l.id === focus)!;
  return `Cleared, but without this plot's technique. ${TECHNIQUE_LABEL[miss.id]}: try it for the third star.`;
}
