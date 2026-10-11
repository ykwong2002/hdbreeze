/** Common interface so the UI, heat, particles and stats do not care which solver runs. */
export interface WindParams {
  /** Compass direction the wind comes FROM, degrees. 0 = north, 90 = east. */
  fromDeg: number;
  /** 0..1 nominal wind strength. */
  speed: number;
  /** Recovery toward free stream per substep (2D stand-in for air entering from above). */
  lambda: number;
  /** Brinkman drag coefficient; blockage sigma scales it. */
  kDrag: number;
  /** Stable fluids: Jacobi iterations. */
  jacobi: number;
  /** Stable fluids: vorticity confinement strength. */
  vorticity: number;
  /** LBM: relaxation time tau (> 0.5). */
  tau: number;
  substeps: number;
}

export type SolverKind = "lbm" | "stable";

export interface Solver {
  readonly name: string;
  /** Texture whose .xy is velocity in the solver's own units. */
  readonly velocity: WebGLTexture;
  /** Multiply the solver's velocity by this to get grid cells per substep. */
  readonly cellsPerSubstep: number;
  step(p: WindParams): void;
  reset(): void;
  /** Substeps run so far since reset, for convergence logging. */
  readonly steps: number;
}

/** Wind vector in grid units (x east, y north) for a unit speed. */
export function windVector(fromDeg: number): [number, number] {
  const a = (fromDeg * Math.PI) / 180;
  return [-Math.sin(a), -Math.cos(a)];
}
