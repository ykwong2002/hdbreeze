import type { LevelSession } from "../game/level";
import type { LonLat } from "../game/level-types";
import { typology } from "../game/typologies";
import type { LonLat as LL } from "../game/level-types";
void (0 as unknown as LL);

/**
 * Calibration harness (`?calib=1`): fills the level with three layouts per
 * required season, waits for the score to settle and prints a table with a
 * suggested threshold. Results go into the level JSON by hand.
 */
interface Row {
  season: string;
  scenario: string;
  satisfaction: number;
  homes: number;
}

/** Frames, not seconds: headless and slow phones run the sim at low fps. */
const SETTLE_FRAMES = 420;

function centroid(ring: LonLat[]): LonLat {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

function pointInRing(p: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] + 1e-18) + a[0]) inside = !inside;
  }
  return inside;
}

/** Candidate centres: a ~30 m grid inside each area. */
function candidates(s: LevelSession): LonLat[] {
  const out: LonLat[] = [];
  const dLat = 30 / 111_320;
  for (const a of s.level.areas) {
    const lats = a.polygon.map((p) => p[1]), lons = a.polygon.map((p) => p[0]);
    const dLon = dLat / Math.cos((lats[0]! * Math.PI) / 180);
    for (let lat = Math.min(...lats); lat <= Math.max(...lats); lat += dLat)
      for (let lon = Math.min(...lons); lon <= Math.max(...lons); lon += dLon) if (pointInRing([lon, lat], a.polygon)) out.push([lon, lat]);
  }
  return out;
}

/**
 * Places the whole tray spread across the areas (farthest-point choice among grid candidates);
 * `style` sets rotation, height and void deck so the two layouts differ only in those.
 */
export function fill(s: LevelSession, style: "naive" | "reference"): void {
  const wind = s.season.fromDeg;
  s.blocks.clearAll();
  const along = (90 - wind + 360) % 180; // local rotation whose long axis points down-wind
  const rot = style === "naive" ? (along + 90) % 180 : along;
  const cands = candidates(s);
  const mLon = 111_320 * Math.cos((s.level.areas[0]!.polygon[0]![1] * Math.PI) / 180);
  const dist = (a: LonLat, b: LonLat) => Math.hypot((a[0] - b[0]) * mLon, (a[1] - b[1]) * 111_320);
  const used: LonLat[] = [];
  for (const t of s.blocks.tray()) {
    for (let k = 0; k < t.remaining; k++) {
      // farthest-point: candidates sorted by distance to the nearest placed block, farthest first
      const order = [...cands].sort((a, b) => {
        const da = used.length ? Math.min(...used.map((u) => dist(a, u))) : 0;
        const db = used.length ? Math.min(...used.map((u) => dist(b, u))) : 0;
        return db - da;
      });
      for (const c of order) {
        const r = s.blocks.place(t.type, c, rot);
        if (!r.ok) continue;
        used.push(r.block.center);
        if (style === "naive") s.blocks.setHeight(r.block.id, "high");
        else if (typology(t.type).residential && !r.block.voidDeck) s.blocks.toggleVoid(r.block.id);
        break;
      }
    }
  }
  s.select(null);
}

export async function runCalibration(s: LevelSession, log: (line: string) => void): Promise<Row[]> {
  const rows: Row[] = [];
  const sim = await s.overlay.ready;
  // headless renderers run few frames per second; more substeps per frame let the flow develop in time
  const normalSubsteps = sim.params.substeps;
  sim.params.substeps = Math.max(normalSubsteps, 12);
  const settle = async (): Promise<void> => {
    const target = sim.frameCount + SETTLE_FRAMES;
    while (sim.frameCount < target) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 6000)); // let the averaged score catch up
  };
  for (const sid of s.level.wind.required) {
    s.setSeason(sid);
    for (const scenario of ["empty", "naive", "reference"] as const) {
      if (scenario === "empty") s.blocks.clearAll();
      else fill(s, scenario);
      await settle();
      const row = { season: sid, scenario, satisfaction: Math.round(s.scoring.state.satisfaction * 10) / 10, homes: s.blocks.homes() };
      rows.push(row);
      const rots = s.blocks.blocks.map((b) => `${b.type[0]}${b.rotDeg}${b.voidDeck ? "v" : ""}`).join(" ");
      log(`${row.season.padEnd(3)} ${row.scenario.padEnd(10)} satisfaction ${row.satisfaction.toFixed(1).padStart(5)}  homes ${row.homes}  [${rots}]`);
    }
  }
  sim.params.substeps = normalSubsteps;
  const naive = Math.min(...rows.filter((r) => r.scenario === "naive").map((r) => r.satisfaction));
  const ref = Math.min(...rows.filter((r) => r.scenario === "reference").map((r) => r.satisfaction));
  const suggested = Math.round(naive + 0.6 * (ref - naive));
  log(`suggested threshold ${suggested} (naive ${naive.toFixed(1)}, reference ${ref.toFixed(1)}); current ${s.level.targets.satisfaction}`);
  (window as unknown as { __calib: unknown }).__calib = { rows, suggested };
  return rows;
}
