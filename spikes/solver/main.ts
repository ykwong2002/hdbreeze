import { createGL, probeFormat } from "./gl";
import { buildObstacleTexture, N } from "./obstacles";
import { StableFluids } from "./stable";
import { LatticeBoltzmann } from "./lbm";
import { Composite, HeatField, Particles, StatsProbe, type Stats } from "./field";
import { windVector, type Solver, type WindParams } from "./solver";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const hud = document.getElementById("hud")!;
const arrow = document.getElementById("arrow")!;
const controls = document.getElementById("controls")!;

const gl = createGL(canvas);
const fmt = probeFormat(gl);
const { tex: obs } = buildObstacleTexture(gl);

const params: WindParams = {
  fromDeg: 270,
  speed: 1,
  lambda: 0.02,
  kDrag: 50,
  jacobi: 24,
  vorticity: 0,
  tau: 0.56,
  substeps: 2,
};
const vis = { q: 0.04, kappa: 0.01, kappaWind: 0.08, tMax: 3.5, particleSpeed: 1.0, fade: 0.94, showSpeed: false, paused: false };

const stable = new StableFluids(gl, fmt, obs);
const lbm = new LatticeBoltzmann(gl, fmt, obs);
let solver: Solver = stable;
const heat = new HeatField(gl, fmt, obs);
const particles = new Particles(gl, fmt, obs, 768);
const composite = new Composite(gl);
const probe = new StatsProbe(gl);

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

/* ---------------------------------------------------------------- UI */
function range(label: string, key: keyof WindParams | keyof typeof vis, min: number, max: number, step: number, target: Record<string, number>): void {
  const row = document.createElement("div");
  row.className = "row";
  const out = document.createElement("output");
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(target[key]);
  out.textContent = String(target[key]);
  input.oninput = () => {
    target[key] = Number(input.value);
    out.textContent = input.value;
  };
  const l = document.createElement("label");
  l.textContent = label;
  row.append(l, input, out);
  controls.append(row);
}
const P = params as unknown as Record<string, number>;
const V = vis as unknown as Record<string, number>;
range("wind from (°)", "fromDeg", 0, 359, 1, P);
range("wind speed", "speed", 0.1, 1.5, 0.05, P);
range("substeps / frame", "substeps", 1, 8, 1, P);
range("recovery λ", "lambda", 0, 0.1, 0.002, P);
range("drag K", "kDrag", 0, 100, 1, P);
range("jacobi iters (stable)", "jacobi", 4, 60, 1, P);
range("vorticity ε (stable)", "vorticity", 0, 0.5, 0.01, P);
range("tau (LBM)", "tau", 0.51, 1.0, 0.005, P);
range("heat source q", "q", 0, 0.1, 0.002, V);
range("heat decay κ (still)", "kappa", 0, 0.05, 0.001, V);
range("wind chill κ·|u|", "kappaWind", 0, 0.3, 0.005, V);
range("streak speed", "particleSpeed", 0.2, 3, 0.1, V);
range("trail fade", "fade", 0.8, 0.99, 0.01, V);

const bStable = document.getElementById("bStable") as HTMLButtonElement;
const bLbm = document.getElementById("bLbm") as HTMLButtonElement;
const bView = document.getElementById("bView") as HTMLButtonElement;
const bPause = document.getElementById("bPause") as HTMLButtonElement;
function select(s: Solver): void {
  solver = s;
  bStable.classList.toggle("on", s === stable);
  bLbm.classList.toggle("on", s === lbm);
  resetAll();
}
function resetAll(): void {
  solver.reset();
  heat.reset();
  particles.reset();
  lastStats = null;
  resetAt = performance.now();
}
bStable.onclick = () => select(stable);
bLbm.onclick = () => select(lbm);
document.getElementById("bReset")!.onclick = resetAll;
bView.onclick = () => {
  vis.showSpeed = !vis.showSpeed;
  bView.textContent = vis.showSpeed ? "Show: speed" : "Show: heat";
};
bPause.onclick = () => {
  vis.paused = !vis.paused;
  bPause.textContent = vis.paused ? "Resume" : "Pause";
};

/* -------------------------------------------------------------- loop */
let frames = 0;
let fpsT0 = performance.now();
let fps = 0;
let lastStats: Stats | null = null;
let resetAt = performance.now();
let frameMs = 0;

function frame(): void {
  resize();
  const t0 = performance.now();
  if (!vis.paused) {
    for (let s = 0; s < params.substeps; s++) solver.step(params);
    const scale = solver.cellsPerSubstep * params.substeps; // cells per frame per unit velocity
    const W = windVector(params.fromDeg);
    heat.step(solver.velocity, scale, W, vis.q, vis.kappa, vis.kappaWind);
    particles.step(solver.velocity, scale, vis.particleSpeed, vis.fade);
  }
  composite.draw(canvas.width, canvas.height, heat.tex, obs, particles.tex, solver.velocity, vis.tMax, solver.cellsPerSubstep, vis.showSpeed);
  frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;

  frames++;
  const now = performance.now();
  if (now - fpsT0 >= 1000) {
    fps = (frames * 1000) / (now - fpsT0);
    frames = 0;
    fpsT0 = now;
    lastStats = probe.read(solver.velocity, heat.tex, obs, solver.cellsPerSubstep, vis.tMax);
    const t = ((now - resetAt) / 1000).toFixed(0);
    hud.textContent = `${solver.name}\n${fmt.name} ${N}x${N}\n${fps.toFixed(0)} fps  ${frameMs.toFixed(1)} ms cpu\nsteps ${solver.steps}  t=${t}s\n|u|max ${lastStats.maxSpeed.toFixed(2)} c/step\nT mean ${lastStats.meanHeat.toFixed(2)}\n${lastStats.nan ? "!!! NaN !!!" : "finite"}`;
  }
  arrow.style.transform = `rotate(${params.fromDeg + 90}deg)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* dev hook for the screenshot harness */
(window as unknown as { __spike: unknown }).__spike = {
  params,
  vis,
  select: (name: "stable" | "lbm") => select(name === "lbm" ? lbm : stable),
  stats: () => ({ solver: solver.name, fmt: fmt.name, fps, frameMs, steps: solver.steps, ...(lastStats ?? {}) }),
};
