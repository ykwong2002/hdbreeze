import type { LevelSession } from "./level";
import type { Baseline } from "./scoring";
import { fill } from "./fill";

/**
 * Plot intro: measures the two baselines breathability is scored against, on this device.
 *   empty    the plot as it is (nothing built)
 *   careless the whole tray as walls across the wind, all high: the plan to avoid
 * The careless layout stays visible while it is measured, so the player sees the streets heat up.
 * Results are cached per plot and season in localStorage, so a replay skips straight to building.
 */
const KEY = "hdbreeze.baselines.v6";
const SETTLE_FRAMES = Number(new URLSearchParams(location.search).get("settle") ?? 220);

export interface IntroHooks {
  status(text: string, phase: "empty" | "careless" | "done"): void;
  /** Shows a button with `label` and resolves when the player presses it. */
  wait(label: string): Promise<void>;
}

export function cachedBaselines(levelId: string): Record<string, Baseline> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Record<string, Baseline>>;
    return all[levelId] ?? {};
  } catch { return {}; }
}
function cache(levelId: string, season: string, b: Baseline): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Record<string, Baseline>>;
    all[levelId] = { ...(all[levelId] ?? {}), [season]: b };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}

export async function runIntro(s: LevelSession, hooks: IntroHooks, force = false): Promise<void> {
  const sim = await s.overlay.ready;
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const settle = async (frames = SETTLE_FRAMES): Promise<void> => { const t = sim.frameCount + frames; while (sim.frameCount < t) await sleep(100); };
  const measure = async (): Promise<number> => {
    let acc = 0, n = 0;
    for (let k = 0; k < 6; k++) { await sleep(150); const f = s.lastFeels; if (f !== null) { acc += f; n++; } }
    return n ? acc / n : 31;
  };
  const cached = force ? {} : cachedBaselines(s.level.id);
  const todo = s.level.wind.required.filter((sid) => !cached[sid]);
  for (const sid of s.level.wind.required) if (cached[sid]) s.scoring.setBaseline(sid, cached[sid]!);
  if (!todo.length) { hooks.status("", "done"); return; }
  s.intro = true;
  const normalSubsteps = sim.params.substeps;
  sim.params.substeps = Math.max(normalSubsteps, 8);
  try {
    for (const sid of todo) {
      const label = s.level.wind.seasons.find((x) => x.id === sid)?.label.split(" (")[0] ?? sid;
      s.setSeason(sid);
      s.blocks.clearAll();
      hooks.status(`Measuring the breeze on the empty plot (${label})…`, "empty");
      await settle(SETTLE_FRAMES + 80);
      const empty = await measure();
      fill(s, "careless");
      hooks.status(`<strong>A careless plan.</strong> Walls across the ${label} wind, every block tall. Watch the walkways turn red.`, "careless");
      await settle();
      const careless = await measure();
      hooks.status(`<strong>This is 0% breathable.</strong> Walls across the ${label} wind, every block tall. Look at the red before you build.`, "careless");
      const more = todo.indexOf(sid) < todo.length - 1;
      await hooks.wait(more ? `Next: the ${s.level.wind.seasons.find((x) => x.id === todo[todo.indexOf(sid) + 1])?.label.split(" (")[0] ?? "other"} monsoon` : "My turn");
      s.blocks.clearAll();
      const b = { empty: Math.round(empty * 100) / 100, careless: Math.round(careless * 100) / 100 };
      s.scoring.setBaseline(sid, b);
      cache(s.level.id, sid, b);
    }
  } finally {
    sim.params.substeps = normalSubsteps;
    s.intro = false;
    s.scoring.reset();
    s.setSeason(s.level.wind.required[0]!);
  }
  hooks.status("", "done");
}
