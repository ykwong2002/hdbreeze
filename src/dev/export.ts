import type { Map as MlMap } from "maplibre-gl";
import type { LevelSession } from "../game/level";
import { fill } from "../game/fill";
import { breathPct } from "../game/scoring";
import { readFields, type FieldExport } from "../sim/export";

/**
 * `?export=1&level=<plot>`: settles the empty plot, the careless plan and the aligned plan on a
 * real GPU and leaves `window.__export` holding the heat and velocity grids, the block geometry
 * and the real score numbers, for the Remotion teaser (tools/launch/export-fields.mjs saves it).
 */
const SETTLE = 360;
const SIZE = 128;

interface BlockOut { type: string; rotDeg: number; height: string; voidDeck: boolean; heightM: number; bodies: [number, number][][]; columns: [number, number][][] }
interface LayoutOut { fields: FieldExport; blocks: BlockOut[]; hot30: number; homes: number; breath: number }

export async function runExport(s: LevelSession, map: MlMap, log: (line: string) => void): Promise<void> {
  const sim = await s.overlay.ready;
  const gl = map.getCanvas().getContext("webgl2") as WebGL2RenderingContext;
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const settle = async (frames = SETTLE): Promise<void> => { const t = sim.frameCount + frames; while (sim.frameCount < t) await sleep(100); };
  const measure = async (): Promise<number> => { let acc = 0, n = 0; for (let k = 0; k < 6; k++) { await sleep(150); const f = s.lastFeels; if (f !== null) { acc += f; n++; } } return n ? acc / n : NaN; };
  const cells = (ring: [number, number][]): [number, number][] => ring.map((p) => { const c = sim.toCell(p[0], p[1]); return [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100]; });
  const snapshot = (): BlockOut[] => s.blocks.geometries().map((g, i) => {
    const b = s.blocks.blocks[i]!;
    return { type: b.type, rotDeg: b.rotDeg, height: b.height, voidDeck: b.voidDeck, heightM: g.heightM, bodies: g.bodies.map((p) => cells(p.ring)), columns: g.columns.map(cells) };
  });
  s.intro = true;
  s.setSeason(s.level.wind.required[0]!);
  const normal = sim.params.substeps;
  sim.params.substeps = Math.max(normal, 8);
  s.blocks.clearAll();
  await settle(SETTLE + 100);
  const empty = await measure();
  log(`empty hot30 ${empty.toFixed(2)}`);
  const layouts: Record<string, LayoutOut> = {};
  layouts.empty = { fields: readFields(gl, SIZE, sim.heat.tex, sim.raster.texture, sim.solver.velocity, sim.vis.tMax, sim.solver.cellsPerSubstep), blocks: [], hot30: empty, homes: 0, breath: 100 };
  for (const style of ["careless", "aligned"] as const) {
    fill(s, style);
    await settle();
    const hot30 = await measure();
    const fields = readFields(gl, SIZE, sim.heat.tex, sim.raster.texture, sim.solver.velocity, sim.vis.tMax, sim.solver.cellsPerSubstep); // cells per substep, within -1..1
    layouts[style] = { fields, blocks: snapshot(), hot30, homes: s.blocks.homes(), breath: 0 };
    log(`${style}: hot30 ${hot30.toFixed(2)}, ${s.blocks.blocks.length} blocks, ${s.blocks.homes()} homes`);
  }
  const base = { empty, careless: layouts.careless!.hot30 };
  for (const l of Object.values(layouts)) l.breath = Math.round(breathPct(l.hot30, base));
  sim.params.substeps = normal;
  s.intro = false;
  const meta = {
    level: s.level.id, n: sim.n, metresPerCell: sim.metresPerCell, tMax: sim.vis.tMax, fromDeg: s.season.fromDeg,
    plot: cells(s.level.site), zone: cells(s.level.scoreZone),
    context: s.level.buildings.map((b) => ({ ring: cells(b.fp), h: b.h })).filter((b) => b.ring.some((p) => p[0] >= 0 && p[0] <= sim.n && p[1] >= 0 && p[1] <= sim.n)),
    walkways: s.level.paths.nodes.map((p) => cells([p])[0]!),
    homesTarget: s.level.targets.homes, empty,
  };
  (window as unknown as { __export: unknown }).__export = { meta, ...layouts };
  log(`done: careless ${layouts.careless!.breath}%, aligned ${layouts.aligned!.breath}% (${layouts.aligned!.homes} homes)`);
}
