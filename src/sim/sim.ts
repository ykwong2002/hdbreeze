import { probeFormat, type Fmt, type GL } from "./gl";
import { HeatField, Particles, StatsProbe, type Stats } from "./field";
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
  readonly params: WindParams;
  readonly vis: VisParams = { q: 0.04, kappa: 0.012, kappaWind: 0.1, tMax: 2.4, particleSpeed: 1.0, fade: 0.94 };
  readonly bbox: [number, number, number, number];
  readonly metresPerCell: number;
  private probe: StatsProbe;
  private frames = 0;
  lastStats: Stats | null = null;

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
    this.params = opts.solver === "lbm"
      ? { fromDeg: 30, speed: 1, lambda: 0.006, kDrag: 50, jacobi: 20, vorticity: 0, tau: 0.56, substeps: 4 }
      : { fromDeg: 30, speed: 1, lambda: 0.01, kDrag: 50, jacobi: 20, vorticity: 0, tau: 0.56, substeps: 2 };
    this.solver = opts.solver === "lbm" ? new LatticeBoltzmann(gl, this.fmt, obs, this.n) : new StableFluids(gl, this.fmt, obs, this.n);
    this.heat = new HeatField(gl, this.fmt, obs, this.n);
    this.particles = new Particles(gl, this.fmt, obs, opts.trailSize ?? 512, this.n);
    this.probe = new StatsProbe(gl);
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
    this.reset();
  }

  setPlacedBuildings(b: BuildingGeom[]): void {
    this.raster.setDynamicBuildings(b);
  }

  setWind(fromDeg: number, speed: number): void {
    this.params.fromDeg = fromDeg;
    this.params.speed = speed;
    this.raster.setWind(windVector(fromDeg));
  }

  reset(): void {
    this.solver.reset();
    this.heat.reset();
    this.particles.reset();
  }

  /** One rendered frame's worth of simulation. */
  frame(): void {
    for (let s = 0; s < this.params.substeps; s++) this.solver.step(this.params);
    const scale = this.solver.cellsPerSubstep * this.params.substeps;
    const W = windVector(this.params.fromDeg);
    this.heat.step(this.solver.velocity, scale, W, this.vis.q, this.vis.kappa, this.vis.kappaWind);
    this.particles.step(this.solver.velocity, scale, this.vis.particleSpeed, this.vis.fade);
    this.frames++;
    if (this.frames % 60 === 0) this.lastStats = this.probe.read(this.solver.velocity, this.heat.tex, this.raster.texture, this.solver.cellsPerSubstep, this.vis.tMax);
  }
}
