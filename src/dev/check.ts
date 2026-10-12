import type { LevelSession } from "../game/level";
import type { HotSpotDef, LonLat, ReferenceBlock, TypologyName } from "../game/level-types";
import { pointInRing } from "../game/fit";
import { feelsLikeC } from "../game/scoring";

/**
 * Solver / solvability check (`?check=1&level=<id>`), meant for a real GPU.
 *  1. Empty town, each required season: temperature of the authored spots and the hottest
 *     walkway points inside the site (`&pick=1` replaces the authored spots with the top two).
 *  2. Greedy search: for each block in the tray, try a grid of positions and angles around the
 *     currently hottest spot, keep the placement that cools it most.
 *  3. Final layout in every season, recommended `targetC` per spot and a JSON patch to paste
 *     into the level file.
 * `&settle=<frames>` and `&cand=<n>` shrink the run for smoke tests.
 */
const q = new URLSearchParams(location.search);
const SETTLE = Number(q.get("settle") ?? 300);
const CAND = Number(q.get("cand") ?? 99);
const PICK = q.has("pick");
const REF_ONLY = q.has("ref");
const M = 111_320;

export async function runCheck(s: LevelSession, log: (line: string) => void): Promise<boolean> {
  const sim = await s.overlay.ready;
  const level = s.level;
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const settle = async (frames = SETTLE): Promise<void> => { const t = sim.frameCount + frames; while (sim.frameCount < t) await sleep(100); };
  const measure = async (): Promise<number[]> => {
    const acc = s.hotSpots.map(() => 0);
    for (let k = 0; k < 5; k++) { await sleep(200); s.hotSpots.forEach((h, i) => { acc[i]! += h.feels; }); }
    return acc.map((v) => v / 5);
  };
  const seasons = level.wind.required;
  const fromDeg = (sid: string): number => level.wind.seasons.find((x) => x.id === sid)!.fromDeg;
  const fmt = (t: number[]): string => s.hotSpots.map((h, i) => `${h.id} ${t[i]!.toFixed(1)}`).join("  ");
  const mLon = M * Math.cos((level.site[0]![1] * Math.PI) / 180);
  const off = (p: LonLat, east: number, north: number): LonLat => [p[0] + east / mLon, p[1] + north / M];
  const distM = (a: LonLat, b: LonLat): number => Math.hypot((a[0] - b[0]) * mLon, (a[1] - b[1]) * M);

  const geom = (sid: string): { d: [number, number]; e: [number, number]; perp: number } => {
    const f = (fromDeg(sid) * Math.PI) / 180;
    const d: [number, number] = [-Math.sin(f), -Math.cos(f)];
    const e: [number, number] = [Math.cos(f), -Math.sin(f)];
    return { d, e, perp: ((Math.atan2(e[1], e[0]) * 180) / Math.PI + 360) % 180 };
  };
  const candidates = (P: LonLat, sid: string, type: TypologyName): { at: LonLat; rot: number }[] => {
    const { d, e, perp } = geom(sid);
    const out: { at: LonLat; rot: number }[] = [];
    for (const a of [-40, 40]) for (const b of [-20, 0, 20]) {
      const at = off(P, a * e[0] + b * d[0], a * e[1] + b * d[1]);
      for (const r of type === "slab" ? [perp - 25, perp, perp + 25] : [0]) out.push({ at, rot: ((Math.round(r / 5) * 5) % 180 + 180) % 180 });
    }
    return out;
  };
  /** How many slab candidates fit around P (no settling): a spot with no room cannot be solved. */
  const room = (P: LonLat, sid: string): number => {
    let n = 0;
    for (const c of candidates(P, sid, "slab")) { const r = s.blocks.place("slab", c.at, c.rot); if (r.ok) { n++; s.blocks.remove(r.block.id); } }
    return n;
  };

  // 0. reference-only mode: apply the authored layout and report against the targets
  if (REF_ONLY) {
    let ok = true;
    for (const sid of seasons) {
      s.setSeason(sid);
      s.blocks.clearAll();
      await settle(SETTLE * 2);
      log(`== ${level.id} ${sid} empty: ${fmt(await measure())}`);
      for (const r of level.reference ?? []) {
        const res = s.blocks.place(r.type, r.at, r.rotDeg);
        if (!res.ok) { log(`  reference ${r.type} at ${r.at.join(",")} refused: ${res.reason}`); ok = false; continue; }
        s.blocks.setHeight(res.block.id, r.height);
        if (r.voidDeck !== res.block.voidDeck) s.blocks.toggleVoid(res.block.id);
      }
      s.select(null);
      await settle(SETTLE * 2);
      const t = await measure();
      log(`== ${level.id} ${sid} reference: ${fmt(t)}  targets ${s.hotSpots.map((h) => h.targetC).join("/")}`);
      s.hotSpots.forEach((h, i) => { if (t[i]! >= h.targetC) { log(`  FAIL: ${h.id} ${t[i]!.toFixed(1)} is not under ${h.targetC}`); ok = false; } });
    }
    if (s.blocks.blocks.length < s.blocks.total()) { log("  FAIL: not every block placed"); ok = false; }
    if (s.blocks.homes() < level.targets.homes) { log(`  FAIL: homes ${s.blocks.homes()} < ${level.targets.homes}`); ok = false; }
    log(ok ? "PASS: the reference layout clears the level" : "FAIL: see above");
    (window as unknown as { __check: unknown }).__check = { ok };
    return ok;
  }

  // 1. empty baselines, hottest walkway points
  s.blocks.clearAll();
  s.select(null);
  const nodes = level.paths.nodes.filter((p) => pointInRing(p, level.site));
  const nodeHot = nodes.map(() => 0);
  let empty: Record<string, number[]> = {};
  const baseline = async (): Promise<void> => {
    empty = {};
    for (const sid of seasons) {
      s.setSeason(sid);
      await settle(SETTLE * 2);
      empty[sid] = await measure();
      log(`== ${level.id} ${sid} empty: ${fmt(empty[sid]!)}`);
      nodes.forEach((p, i) => {
        const [x, y] = sim.toCell(p[0], p[1]);
        const T = sim.readback.sample(x, y, sim.n);
        if (T !== null) nodeHot[i] = Math.max(nodeHot[i]!, feelsLikeC(T, sim.vis.tMax));
      });
    }
  };
  await baseline();
  const ranked = nodes.map((p, i) => ({ p, t: nodeHot[i]! })).sort((a, b) => b.t - a.t);
  const picked: { p: LonLat; t: number; room: number }[] = [];
  const worstSeason = seasons.length === 1 ? seasons[0]! : seasons[seasons.length - 1]!;
  for (const r of ranked) {
    if (!picked.every((o) => distM(o.p, r.p) >= 90)) continue;
    picked.push({ ...r, room: room(r.p, worstSeason) });
    if (picked.length >= 8) break;
  }
  picked.sort((a, b) => (b.room >= 8 ? 1 : 0) - (a.room >= 8 ? 1 : 0) || b.t - a.t);
  log(`hottest walkway points inside the site (worst season, slab candidates that fit): ${picked.map((r) => `${r.p[0].toFixed(5)},${r.p[1].toFixed(5)} ${r.t.toFixed(1)} room ${r.room}`).join(" | ")}`);
  if (PICK && picked.length >= 2) {
    const defs: HotSpotDef[] = picked.slice(0, 2).map((r, i) => ({ id: i === 0 ? "a" : "b", label: i === 0 ? "Spot A" : "Spot B", at: [+r.p[0].toFixed(6), +r.p[1].toFixed(6)], targetC: 30 }));
    s.setHotSpots(defs);
    await sleep(500);
    log("pick=1: using those two as the spots");
    await baseline();
  }
  const spots = s.hotSpots;
  if (!spots.length) { log("no spots"); return false; }
  // the season in which each spot is hottest when empty is the one the search optimises
  const hotSeason = spots.map((_, i) => seasons.reduce((best, sid) => (empty[sid]![i]! > empty[best]![i]! ? sid : best), seasons[0]!));

  // 2. greedy search
  const tray: TypologyName[] = level.tray.flatMap((t) => Array.from({ length: t.count }, () => t.type));
  const current: number[] = spots.map((_, i) => empty[hotSeason[i]!]![i]!);
  const placedRefs: ReferenceBlock[] = [];
  type Trial = { at: LonLat; rot: number; temps: number[]; target: number; sid: string };
  const search = async (type: TypologyName, target: number): Promise<{ best: Trial | null; tried: number }> => {
    const sid = hotSeason[target]!;
    s.setSeason(sid);
    let best: Trial | null = null;
    let tried = 0;
    for (const c of candidates(spots[target]!.at, sid, type)) {
      if (tried >= CAND) break;
      const res = s.blocks.place(type, c.at, c.rot);
      if (!res.ok) continue;
      tried++;
      await settle();
      const temps = await measure();
      if (!best || temps[target]! < best.temps[target]!) best = { at: res.block.center, rot: res.block.rotDeg, temps, target, sid };
      s.blocks.remove(res.block.id);
    }
    return { best, tried };
  };
  for (const type of tray) {
    const order = spots.map((_, i) => i).sort((a, b) => current[b]! - current[a]!);
    let chosen: Trial | null = null;
    for (const target of order) {
      const { best, tried } = await search(type, target);
      if (!best) { log(`${type}: nothing fits near ${spots[target]!.id}`); continue; }
      const gain = current[target]! - best.temps[target]!;
      log(`${type} near ${spots[target]!.id} (${best.sid}): ${tried} fits, best ${best.at[0].toFixed(5)},${best.at[1].toFixed(5)} rot ${best.rot}: ${fmt(best.temps)} (gain ${gain.toFixed(1)})`);
      if (!chosen || gain > current[chosen.target]! - chosen.temps[chosen.target]!) chosen = best;
      if (gain >= 0.5) break; // good enough, do not spend trials on the other spot
    }
    if (!chosen) { log(`${type}: no placement fits anywhere near the spots`); continue; }
    const res = s.blocks.place(type, chosen.at, chosen.rot);
    if (!res.ok) { log(`${type}: could not re-place the chosen candidate`); continue; }
    placedRefs.push({ type, at: [+chosen.at[0].toFixed(6), +chosen.at[1].toFixed(6)], rotDeg: res.block.rotDeg, height: "mid", voidDeck: false });
    s.setSeason(chosen.sid);
    await settle();
    const now = await measure();
    spots.forEach((_, i) => { if (hotSeason[i] === chosen!.sid) current[i] = now[i]!; });
    log(`  kept ${type} near ${spots[chosen.target]!.id}: ${fmt(now)}`);
  }
  s.select(null);

  // 3. final layout in every season
  const finalT: Record<string, number[]> = {};
  for (const sid of seasons) {
    s.setSeason(sid);
    await settle(SETTLE * 2);
    finalT[sid] = await measure();
    log(`== final ${sid}: ${fmt(finalT[sid]!)}   (empty was ${fmt(empty[sid]!)})`);
  }
  const worst = spots.map((_, i) => Math.max(...seasons.map((sid) => finalT[sid]![i]!)));
  const gain = spots.map((_, i) => Math.max(...seasons.map((sid) => empty[sid]![i]!)) - worst[i]!);
  const homes = s.blocks.homes();
  log(`blocks ${s.blocks.blocks.length}/${s.blocks.total()}, homes ${homes} (target ${level.targets.homes}), cooling per spot: ${spots.map((h, i) => `${h.id} ${gain[i]!.toFixed(1)}`).join("  ")}`);
  const emptyWorst = spots.map((_, i) => Math.max(...seasons.map((sid) => empty[sid]![i]!)));
  const hotspots = spots.map((h, i) => ({ id: h.id, label: h.label, at: h.at, targetC: Math.round((emptyWorst[i]! - 0.6 * Math.max(0, gain[i]!)) * 2) / 2 }));
  log(`targets are 60% of the way from empty to the best found (2 stars need 1.5 °C more)`);
  log("paste into the level file:");
  log(`"hotspots": ${JSON.stringify(hotspots)},`);
  log(`"reference": ${JSON.stringify(placedRefs)}`);
  const ok = s.blocks.blocks.length === s.blocks.total() && homes >= level.targets.homes && gain.every((g) => g >= 1);
  log(ok ? "PASS: every spot cooled by at least 1 °C with all blocks placed" : "WEAK: see above (a spot cooled by under 1 °C, or a block did not fit)");
  (window as unknown as { __check: unknown }).__check = { ok, hotspots, reference: placedRefs, empty, finalT };
  return ok;
}
