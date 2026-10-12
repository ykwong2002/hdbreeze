import { probeFormat, type Fmt, type GL } from "./gl";
import { HeatField, Particles, StatsProbe, type Stats } from "./field";
import { HeatReadback } from "./readback";
import { LatticeBoltzmann } from "./lbm";
import { StableFluids } from "./stable";
import { GROUND_HEAT, ObstacleRaster, type BuildingGeom, type GroundGeom } from "./obstacles";
import { windVector, type Solver, type SolverKind, type WindParams } from "./solver";
import type { BakedLevel } from "../game/level-types";

export interface SimOptions {
  n: number;
  bbox: [number, number, number, number];
  solver: SolverKind;
  trailSize?: number;
}

export interface VisParams {
  q: number;
  kappa: number;
  kappaWind: number;
  /** Cells per frame beyond which more wind brings no extra relief from the sun. */
  vCap: number;
  tMax: number;
  particleSpeed: number;
  fade: number;
}

/** One level's wind + felt-heat simulation, living in the map's WebGL2 context. */
export class WindSim {
  readonly n: number;
  readonly fmt: Fmt;
  readonly solver: Solver;
  readonly heat: HeatField;
  readonly particles: Particles;
  readonly raster: ObstacleRaster;
  readonly readback: HeatReadback;
  readonly params: WindParams;
  readonly vis: VisParams = { q: 0.3, kappa: 0.03, kappaWind: 0.2, vCap: 1.0, tMax: 2.4, particleSpeed: 0.45, fade: 0.965 };
  readonly bbox: [number, number, number, number];
  readonly metresPerCell: number;
  private probe: StatsProbe;
  private frames = 0;
  /** Simulation frames run so far (for harnesses that must wait for the field to settle). */
  get frameCount(): number {
    return this.frames;
  }
  lastStats: Stats | null = null;
  /** Set by the watchdog when frames stay slow: fewer substeps, calmer particles. */
  degraded = false;
  private slowSince = 0;
  private lastFrameAt = 0;

  constructor(
    readonly gl: GL,
    opts: SimOptions,
  ) {
    this.n = opts.n;
    this.bbox = opts.bbox;
    const [w, s, e, nn] = opts.bbox;
    const lat = (s + nn) / 2;
    const widthM = (e - w) * 111_320 * Math.cos((lat * Math.PI) / 180);
    this.metresPerCell = widthM / this.n;
    this.fmt = probeFormat(gl);
    this.raster = new ObstacleRaster(gl, this.n);
    this.raster.kWakeCells = 2.5 / this.metresPerCell;
    const obs = this.raster.texture;
    // Per-step rates were tuned at 4.8 m cells (town-sized boxes). Plot-sized boxes run at ~1.7 m cells,
    // so the same per-step rate would act three times faster per metre: air would forget an upstream
    // block within 60 m instead of 160 m and layouts would barely move the score. Scale them with cell size.
    const k = this.metresPerCell / 4.8;
    this.params = opts.solver === "lbm"
      ? { fromDeg: 30, speed: 1, lambda: 0.006 * k, kDrag: 0.07 * k, jacobi: 20, vorticity: 0, tau: 0.66, substeps: 4 }
      : { fromDeg: 30, speed: 1, lambda: 0.01 * k, kDrag: 0.5 * k, jacobi: 20, vorticity: 0, tau: 0.56, substeps: 2 };
    this.vis.q *= k;
    this.vis.kappa *= k;
    this.vis.kappaWind *= k;
    this.solver = opts.solver === "lbm" ? new LatticeBoltzmann(gl, this.fmt, obs, this.n) : new StableFluids(gl, this.fmt, obs, this.n);
    this.heat = new HeatField(gl, this.fmt, obs, this.n);
    this.particles = new Particles(gl, this.fmt, obs, opts.trailSize ?? 512, this.n);
    this.probe = new StatsProbe(gl);
    this.readback = new HeatReadback(gl, Math.max(64, this.n / 2));
  }

  /** sim cell coordinates -> lon/lat. */
  toLonLat(cx: number, cy: number): [number, number] {
    const [w, s, e, n] = this.bbox;
    return [w + (cx / this.n) * (e - w), s + (cy / this.n) * (n - s)];
  }

  /** lon/lat -> sim cell coordinates (x east, y north, 0..n). */
  toCell(lon: number, lat: number): [number, number] {
    const [w, s, e, n] = this.bbox;
    return [((lon - w) / (e - w)) * this.n, ((lat - s) / (n - s)) * this.n];
  }

  setLevel(level: BakedLevel): void {
    const ground: GroundGeom[] = level.ground.map((g) => ({ ring: g.polygon.map((p) => this.toCell(p[0], p[1])), heat: GROUND_HEAT[g.kind] ?? 1 }));
    const buildings: BuildingGeom[] = level.buildings.map((b) => ({ ring: b.fp.map((p) => this.toCell(p[0], p[1])), heightM: b.h, sigma: 1 }));
    this.raster.setGround(ground);
    this.raster.setStaticBuildings(buildings);
    this.raster.setMask(level.district.map((p) => this.toCell(p[0], p[1])), level.scoreZone.map((p) => this.toCell(p[0], p[1])));
    this.reset();
  }

  setPlacedBuildings(b: BuildingGeom[]): void {
    this.raster.setDynamicBuildings(b);
  }

  setWind(fromDeg: number, speed: number): void {
    const changed = fromDeg !== this.params.fromDeg || speed !== this.params.speed;
    this.params.fromDeg = fromDeg;
    this.params.speed = speed;
    this.raster.setWind(windVector(fromDeg));
    if (changed) this.solver.setFreeStream?.();
  }

  reset(): void {
    this.solver.reset();
    this.heat.reset();
    this.particles.reset();
  }

  /** Drops to a lighter mode after ~2 s of frames slower than 33 ms. */
  private watchdog(): void {
    const now = performance.now();
    const dt = this.lastFrameAt ? now - this.lastFrameAt : 16;
    this.lastFrameAt = now;
    if (this.degraded) return;
    if (dt > 33) {
      if (!this.slowSince) this.slowSince = now;
      else if (now - this.slowSince > 2000) {
        this.degraded = true;
        this.params.substeps = Math.max(1, Math.ceil(this.params.substeps / 2));
        this.vis.fade = Math.min(this.vis.fade, 0.95);
        console.info("[hdbreeze] slow frames: sim degraded");
      }
    } else this.slowSince = 0;
  }

  /** One rendered frame's worth of simulation. */
  frame(): void {
    this.watchdog();
    for (let s = 0; s < this.params.substeps; s++) this.solver.step(this.params);
    const scale = this.solver.cellsPerSubstep * this.params.substeps;
    const W = windVector(this.params.fromDeg);
    this.heat.step(this.solver.velocity, scale, W, this.vis.q, this.vis.kappa, this.vis.kappaWind, this.vis.vCap);
    this.particles.step(this.solver.velocity, scale, this.vis.particleSpeed, this.vis.fade);
    this.frames++;
    this.readback.poll();
    if (this.frames % 15 === 0) this.readback.request(this.heat.tex, this.raster.texture, this.vis.tMax);
    if (this.frames % 60 === 0) this.lastStats = this.probe.read(this.solver.velocity, this.heat.tex, this.raster.texture, this.solver.cellsPerSubstep, this.vis.tMax);
  }
}
