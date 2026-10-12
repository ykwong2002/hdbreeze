import type { LevelSession } from "../game/level";
import type { HeightStep } from "../game/level-types";

/**
 * Solvability check (`?check=1&level=<id>`), meant for a real GPU: measures the hot spots
 * in the empty town, then applies the level's authored reference layout and measures again.
 * Pass = every spot hot when empty (target + 1) and cooled by the reference.
 */
const SETTLE_FRAMES = 900;

export async function runCheck(s: LevelSession, log: (line: string) => void): Promise<boolean> {
  const sim = await s.overlay.ready;
  const settle = async (): Promise<void> => {
    const target = sim.frameCount + SETTLE_FRAMES;
    while (sim.frameCount < target) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 1500));
  };
  const report = (tag: string): boolean[] => s.hotSpots.map((h) => { log(`${tag} ${h.id} ${h.label.padEnd(16)} ${h.feels.toFixed(1)} °C (target ${h.targetC})`); return h.cooled; });
  let ok = true;
  // a spot must be hot when empty in at least one required season (two-season levels: the other season may ventilate it)
  const hotSomewhere = s.hotSpots.map(() => false);
  for (const sid of s.level.wind.required) {
    s.setSeason(sid);
    s.blocks.clearAll();
    log(`== ${s.level.id} ${sid}: empty`);
    await settle();
    const emptyCooled = report("  empty");
    emptyCooled.forEach((c, i) => { if (!c) hotSomewhere[i] = true; });
    if (emptyCooled.some((c) => c)) log("  note: a spot is already cool when empty in this season");
    if (!s.level.reference?.length) { log("  no reference layout in the level file"); ok = false; continue; }
    s.blocks.clearAll();
    for (const r of s.level.reference) {
      const res = s.blocks.place(r.type, r.at, r.rotDeg);
      if (!res.ok) { log(`  reference block ${r.type} at ${r.at.join(",")} refused: ${res.reason}`); ok = false; continue; }
      s.blocks.setHeight(res.block.id, r.height as HeightStep);
      if (r.voidDeck !== res.block.voidDeck) s.blocks.toggleVoid(res.block.id);
      if (res.block.rotDeg !== r.rotDeg) log(`  note: ${r.type} rotated to ${res.block.rotDeg}° to fit`);
    }
    s.select(null);
    log(`  reference placed: ${s.blocks.blocks.length}/${s.blocks.total()} blocks, ${s.blocks.homes()} homes (target ${s.level.targets.homes})`);
    await settle();
    const refCooled = report("  ref  ");
    if (!refCooled.every((c) => c)) { log("  FAIL: reference layout does not cool every spot"); ok = false; }
    if (s.blocks.homes() < s.level.targets.homes) { log("  FAIL: reference houses too few"); ok = false; }
  }
  hotSomewhere.forEach((hot, i) => { if (!hot) { log(`  FAIL: ${s.hotSpots[i]!.id} is never hot when empty; move it into the lee of a building`); ok = false; } });
  log(ok ? "PASS: level is solvable with the reference layout" : "FAIL: see above");
  (window as unknown as { __check: unknown }).__check = { ok };
  return ok;
}
