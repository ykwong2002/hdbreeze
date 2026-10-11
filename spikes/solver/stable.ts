import { drawQuad, FBO, GLSL_BOUNDARY, GLSL_HEADER, PingPong, Program, QUAD_VS, type Fmt, type GL } from "./gl";
import { N } from "./obstacles";
import { windVector, type Solver, type WindParams } from "./solver";

/** Free-stream speed in cells per substep at speed = 1. */
const U_MAX = 0.6;

const ADVECT_FS = `${GLSL_HEADER}${GLSL_BOUNDARY}
uniform sampler2D uVel, uSrc, uObs;
uniform ivec2 uN; uniform vec2 uW; uniform float uDt;
uniform int uIsVel; uniform float uQ, uKappa;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float sigma = texelFetch(uObs, c, 0).r;
  if (sigma > 0.99) { o = vec4(0.0); return; }
  ivec2 inward; int bt = boundaryType(c, uN, uW, inward);
  if (bt == 1) { o = (uIsVel == 1) ? vec4(uW, 0.0, 0.0) : vec4(0.0); return; }
  if (bt == 2) { o = texelFetch(uSrc, c + inward, 0); return; }
  vec2 v = texelFetch(uVel, c, 0).xy;
  vec2 p = (vec2(c) + 0.5 - v * uDt) / vec2(uN);
  vec4 s = texture(uSrc, p);
  if (uIsVel == 0) s += uDt * (uQ * (1.0 - sigma) - uKappa * s);
  o = s;
}`;

const FORCES_FS = `${GLSL_HEADER}
uniform sampler2D uVel, uObs, uCurl;
uniform vec2 uW; uniform float uDt, uLambda, uK, uEps; uniform ivec2 uN;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float sigma = texelFetch(uObs, c, 0).r;
  if (sigma > 0.99) { o = vec4(0.0); return; }
  vec2 v = texelFetch(uVel, c, 0).xy;
  v += uDt * uLambda * (uW - v);
  v /= (1.0 + uDt * uK * sigma);
  if (uEps > 0.0) {
    float L = texelFetch(uCurl, clamp(c + ivec2(-1, 0), ivec2(0), uN - 1), 0).x;
    float R = texelFetch(uCurl, clamp(c + ivec2( 1, 0), ivec2(0), uN - 1), 0).x;
    float B = texelFetch(uCurl, clamp(c + ivec2(0, -1), ivec2(0), uN - 1), 0).x;
    float T = texelFetch(uCurl, clamp(c + ivec2(0,  1), ivec2(0), uN - 1), 0).x;
    float C = texelFetch(uCurl, c, 0).x;
    vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    f /= length(f) + 1e-4;
    f *= uEps * C * vec2(1.0, -1.0);
    v += f * uDt;
  }
  o = vec4(v, 0.0, 0.0);
}`;

const CURL_FS = `${GLSL_HEADER}
uniform sampler2D uVel; uniform ivec2 uN;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float L = texelFetch(uVel, clamp(c + ivec2(-1, 0), ivec2(0), uN - 1), 0).y;
  float R = texelFetch(uVel, clamp(c + ivec2( 1, 0), ivec2(0), uN - 1), 0).y;
  float B = texelFetch(uVel, clamp(c + ivec2(0, -1), ivec2(0), uN - 1), 0).x;
  float T = texelFetch(uVel, clamp(c + ivec2(0,  1), ivec2(0), uN - 1), 0).x;
  o = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 0.0);
}`;

/** Neighbour velocity with obstacle + domain boundaries applied. */
const GLSL_NB_VEL = `
vec2 nbVel(ivec2 n, ivec2 c, vec2 vc, ivec2 N, vec2 W) {
  if (!inside(n, N)) {
    ivec2 d = n - c;
    bool inflow = (d.x < 0 && W.x > 0.0) || (d.x > 0 && W.x < 0.0) || (d.y < 0 && W.y > 0.0) || (d.y > 0 && W.y < 0.0);
    return inflow ? W : vc;
  }
  if (texelFetch(uObs, n, 0).r > 0.99) return vec2(0.0);
  return texelFetch(uVel, n, 0).xy;
}`;

const DIVERGENCE_FS = `${GLSL_HEADER}${GLSL_BOUNDARY}
uniform sampler2D uVel, uObs; uniform ivec2 uN; uniform vec2 uW;
out vec4 o;
${GLSL_NB_VEL}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 vc = texelFetch(uVel, c, 0).xy;
  vec2 L = nbVel(c + ivec2(-1, 0), c, vc, uN, uW);
  vec2 R = nbVel(c + ivec2( 1, 0), c, vc, uN, uW);
  vec2 B = nbVel(c + ivec2(0, -1), c, vc, uN, uW);
  vec2 T = nbVel(c + ivec2(0,  1), c, vc, uN, uW);
  o = vec4(0.5 * ((R.x - L.x) + (T.y - B.y)), 0.0, 0.0, 0.0);
}`;

/** Neighbour pressure: Neumann at solids and inflow edges, Dirichlet 0 at outflow edges. */
const GLSL_NB_P = `
float nbP(ivec2 n, ivec2 c, float pc, ivec2 N, vec2 W) {
  if (!inside(n, N)) {
    ivec2 d = n - c;
    bool inflow = (d.x < 0 && W.x > 0.0) || (d.x > 0 && W.x < 0.0) || (d.y < 0 && W.y > 0.0) || (d.y > 0 && W.y < 0.0);
    return inflow ? pc : 0.0;
  }
  if (texelFetch(uObs, n, 0).r > 0.99) return pc;
  return texelFetch(uP, n, 0).x;
}`;

const JACOBI_FS = `${GLSL_HEADER}${GLSL_BOUNDARY}
uniform sampler2D uP, uDiv, uObs; uniform ivec2 uN; uniform vec2 uW;
out vec4 o;
${GLSL_NB_P}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float pc = texelFetch(uP, c, 0).x;
  float L = nbP(c + ivec2(-1, 0), c, pc, uN, uW);
  float R = nbP(c + ivec2( 1, 0), c, pc, uN, uW);
  float B = nbP(c + ivec2(0, -1), c, pc, uN, uW);
  float T = nbP(c + ivec2(0,  1), c, pc, uN, uW);
  float d = texelFetch(uDiv, c, 0).x;
  o = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 0.0);
}`;

const GRADIENT_FS = `${GLSL_HEADER}${GLSL_BOUNDARY}
uniform sampler2D uP, uVel, uObs; uniform ivec2 uN; uniform vec2 uW;
out vec4 o;
${GLSL_NB_P}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  if (texelFetch(uObs, c, 0).r > 0.99) { o = vec4(0.0); return; }
  float pc = texelFetch(uP, c, 0).x;
  float L = nbP(c + ivec2(-1, 0), c, pc, uN, uW);
  float R = nbP(c + ivec2( 1, 0), c, pc, uN, uW);
  float B = nbP(c + ivec2(0, -1), c, pc, uN, uW);
  float T = nbP(c + ivec2(0,  1), c, pc, uN, uW);
  vec2 v = texelFetch(uVel, c, 0).xy - 0.5 * vec2(R - L, T - B);
  o = vec4(v, 0.0, 0.0);
}`;

export class StableFluids implements Solver {
  readonly name = "stable fluids";
  readonly cellsPerSubstep = 1;
  steps = 0;
  private vel: PingPong;
  private pressure: PingPong;
  private div: FBO;
  private curl: FBO;
  private advect: Program;
  private forces: Program;
  private curlP: Program;
  private divP: Program;
  private jacobi: Program;
  private grad: Program;

  constructor(
    private gl: GL,
    fmt: Fmt,
    private obs: WebGLTexture,
  ) {
    this.vel = new PingPong(gl, N, N, fmt, gl.LINEAR);
    this.pressure = new PingPong(gl, N, N, fmt, gl.NEAREST);
    this.div = new FBO(gl, N, N, fmt, gl.NEAREST);
    this.curl = new FBO(gl, N, N, fmt, gl.NEAREST);
    this.advect = new Program(gl, QUAD_VS, ADVECT_FS);
    this.forces = new Program(gl, QUAD_VS, FORCES_FS);
    this.curlP = new Program(gl, QUAD_VS, CURL_FS);
    this.divP = new Program(gl, QUAD_VS, DIVERGENCE_FS);
    this.jacobi = new Program(gl, QUAD_VS, JACOBI_FS);
    this.grad = new Program(gl, QUAD_VS, GRADIENT_FS);
  }

  get velocity(): WebGLTexture {
    return this.vel.read.tex;
  }

  /** Shared with heat: advect any field by this solver's velocity. */
  advectField(src: FBO, dst: FBO, dt: number, W: [number, number], q: number, kappa: number): void {
    dst.bind();
    this.advect.use().tex("uVel", 0, this.vel.read.tex).tex("uSrc", 1, src.tex).tex("uObs", 2, this.obs)
      .iv2("uN", N, N).v2("uW", W[0], W[1]).f("uDt", dt).i("uIsVel", 0).f("uQ", q).f("uKappa", kappa);
    drawQuad(this.gl);
  }

  reset(): void {
    this.vel.clear();
    this.pressure.clear();
    this.steps = 0;
  }

  step(p: WindParams): void {
    const gl = this.gl;
    const [wx, wy] = windVector(p.fromDeg);
    const W: [number, number] = [wx * p.speed * U_MAX, wy * p.speed * U_MAX];
    const dt = 1;

    // 1. advect velocity
    this.vel.write.bind();
    this.advect.use().tex("uVel", 0, this.vel.read.tex).tex("uSrc", 1, this.vel.read.tex).tex("uObs", 2, this.obs)
      .iv2("uN", N, N).v2("uW", W[0], W[1]).f("uDt", dt).i("uIsVel", 1).f("uQ", 0).f("uKappa", 0);
    drawQuad(gl);
    this.vel.swap();

    // 2. curl (only if confinement is on), 3. recovery + drag (+ confinement)
    if (p.vorticity > 0) {
      this.curl.bind();
      this.curlP.use().tex("uVel", 0, this.vel.read.tex).iv2("uN", N, N);
      drawQuad(gl);
    }
    this.vel.write.bind();
    this.forces.use().tex("uVel", 0, this.vel.read.tex).tex("uObs", 1, this.obs).tex("uCurl", 2, this.curl.tex)
      .v2("uW", W[0], W[1]).f("uDt", dt).f("uLambda", p.lambda).f("uK", p.kDrag).f("uEps", p.vorticity).iv2("uN", N, N);
    drawQuad(gl);
    this.vel.swap();

    // 4. divergence
    this.div.bind();
    this.divP.use().tex("uVel", 0, this.vel.read.tex).tex("uObs", 1, this.obs).iv2("uN", N, N).v2("uW", W[0], W[1]);
    drawQuad(gl);

    // 5. Jacobi, warm-started from last step's pressure
    this.jacobi.use().tex("uDiv", 1, this.div.tex).tex("uObs", 2, this.obs).iv2("uN", N, N).v2("uW", W[0], W[1]);
    for (let k = 0; k < p.jacobi; k++) {
      this.pressure.write.bind();
      this.jacobi.tex("uP", 0, this.pressure.read.tex);
      drawQuad(gl);
      this.pressure.swap();
    }

    // 6. subtract gradient
    this.vel.write.bind();
    this.grad.use().tex("uP", 0, this.pressure.read.tex).tex("uVel", 1, this.vel.read.tex).tex("uObs", 2, this.obs)
      .iv2("uN", N, N).v2("uW", W[0], W[1]);
    drawQuad(gl);
    this.vel.swap();

    this.steps++;
  }
}
