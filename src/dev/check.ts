import type { LevelSession } from "../game/level";
import { fill } from "../game/fill";
import { breathPct } from "../game/scoring";

/**
 * Plot check (`?check=1&level=<plotId>`), meant for a real GPU: for each required season it measures
 * the empty plot, the careless plan and a simple aligned plan (slabs along the wind, mid, void decks)
 * and reports the aligned plan's breathability against the pass line. Every plot should PASS with
 * the aligned plan; if one does not, lower its passPct in the town file or pick another parcel.
 * `&settle=<frames>` shortens the run for smoke tests.
 */
const q = new URLSearchParams(location.search);
const SETTLE = Number(q.get("settle") ?? 300);

export async function runCheck(s: LevelSession, log: (line: string) => void): Promise<boolean> {
  const sim = await s.overlay.ready;
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const settle = async (frames = SETTLE): Promise<void> => { const t = sim.frameCount + frames; while (sim.frameCount < t) await sleep(100); };
  const measure = async (): Promise<number> => { let acc = 0, n = 0; for (let k = 0; k < 6; k++) { await sleep(150); const f = s.lastFeels; if (f !== null) { acc += f; n++; } } return n ? acc / n : NaN; };
  const level = s.level;
  const pass = level.passPct ?? 60;
  s.intro = true;
  let ok = true;
  log(`== ${level.id} (${level.plotLabel}): ${level.tray.map((t) => `${t.count} ${t.type}`).join(", ")}, homes target ${level.targets.homes}, pass ${pass}%`);
  for (const sid of level.wind.required) {
    s.setSeason(sid);
    s.blocks.clearAll();
    await settle(SETTLE * 1.5);
    const empty = await measure();
    const nCare = fill(s, "careless");
    await settle();
    const careless = await measure();
    const nAl = fill(s, "aligned");
    await settle();
    const aligned = await measure();
    const homes = s.blocks.homes();
    const pct = breathPct(aligned, { empty, careless });
    const spots = s.hotSpots.map((h) => `${h.id} ${h.feels.toFixed(1)}/${h.targetC}`).join(" ");
    log(`${sid}: empty ${empty.toFixed(2)}  careless ${careless.toFixed(2)} (${nCare} placed)  aligned ${aligned.toFixed(2)} (${nAl} placed, ${homes} homes) -> ${pct.toFixed(0)}% breathable${spots ? "  spots " + spots : ""}`);
    if (nCare < s.blocks.total() || nAl < s.blocks.total()) { log(`  FAIL: the tray does not fit (${nCare}/${nAl} of ${s.blocks.total()})`); ok = false; }
    if (careless - empty < 0.5) { log("  WARN: the careless plan barely heats the walkways; the score will be noisy"); }
    if (pct < pass) { log(`  FAIL: aligned plan only ${pct.toFixed(0)}% (< ${pass}%)`); ok = false; }
    if (homes < level.targets.homes) { log(`  FAIL: aligned plan houses ${homes} < ${level.targets.homes}`); ok = false; }
  }
  s.intro = false;
  log(ok ? "PASS" : "FAIL: see above");
  (window as unknown as { __check: unknown }).__check = { ok };
  return ok;
}
