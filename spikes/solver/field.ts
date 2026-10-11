import { drawQuad, FBO, GLSL_BOUNDARY, GLSL_HEADER, PingPong, Program, QUAD_VS, type Fmt, type GL } from "./gl";
import { N } from "./obstacles";

/** Heat scalar advected by whichever solver is active, with ground source and decay (plan 3.3 step 7). */
const HEAT_FS = `${GLSL_HEADER}${GLSL_BOUNDARY}
uniform sampler2D uVel, uHeat, uObs;
uniform ivec2 uN; uniform vec2 uW; uniform float uScale, uQ, uKappa, uKappaWind;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float sigma = texelFetch(uObs, c, 0).r;
  if (sigma > 0.99) { o = vec4(0.0); return; }
  ivec2 inward; int bt = boundaryType(c, uN, uW, inward);
  if (bt == 1) { o = vec4(0.0); return; }
  if (bt == 2) { o = texelFetch(uHeat, c + inward, 0); return; }
  vec2 v = texelFetch(uVel, c, 0).xy * uScale;
  vec2 p = (vec2(c) + 0.5 - v) / vec2(uN);
  float T = texture(uHeat, p).x;
  // felt heat: ground adds it, still air keeps it, moving air carries it off (wind chill)
  float kappa = uKappa + uKappaWind * length(v);
  T += uQ * (1.0 - sigma) - kappa * T;
  o = vec4(max(T, 0.0), 0.0, 0.0, 0.0);
}`;

export class HeatField {
  private heat: PingPong;
  private prog: Program;
  constructor(
    private gl: GL,
    fmt: Fmt,
    private obs: WebGLTexture,
  ) {
    this.heat = new PingPong(gl, N, N, fmt, gl.LINEAR);
    this.prog = new Program(gl, QUAD_VS, HEAT_FS);
  }
  get tex(): WebGLTexture {
    return this.heat.read.tex;
  }
  reset(): void {
    this.heat.clear();
  }
  /** One frame: `scale` converts solver velocity to cells per frame. */
  step(vel: WebGLTexture, scale: number, W: [number, number], q: number, kappa: number, kappaWind: number): void {
    this.heat.write.bind();
    this.prog.use().tex("uVel", 0, vel).tex("uHeat", 1, this.heat.read.tex).tex("uObs", 2, this.obs)
      .iv2("uN", N, N).v2("uW", W[0], W[1]).f("uScale", scale).f("uQ", q).f("uKappa", kappa).f("uKappaWind", kappaWind);
    drawQuad(this.gl);
    this.heat.swap();
  }
}

/** Streak particles in the webgl-wind style: state texture + fading trail texture. */
const P = 96; // P*P particles
const PARTICLE_UPDATE_FS = `${GLSL_HEADER}
uniform sampler2D uState, uVel, uObs;
uniform ivec2 uN; uniform float uScale, uSpeed, uFrame; uniform int uInit;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uState, c, 0);
  vec2 pos = s.xy; float age = s.z; float seed = s.w;
  if (uInit == 1) { seed = hash(vec2(c) + 0.37); age = floor(hash(vec2(c) * 1.7 + 0.1) * 120.0); pos = vec2(hash(vec2(c) + 1.3), hash(vec2(c) + 2.9)) * vec2(uN); }
  vec2 v = texture(uVel, pos / vec2(uN)).xy * uScale * uSpeed;
  pos += v;
  age += 1.0;
  float life = 90.0 + 150.0 * seed;
  bool dead = age > life || pos.x < 0.0 || pos.y < 0.0 || pos.x >= float(uN.x) || pos.y >= float(uN.y)
    || texture(uObs, pos / vec2(uN)).r > 0.99;
  if (dead) {
    vec2 r = vec2(hash(vec2(c) + uFrame * 0.013 + 3.1), hash(vec2(c) * 0.77 + uFrame * 0.071 + 5.3));
    pos = r * vec2(uN); age = 0.0;
  }
  o = vec4(pos, age, seed);
}`;

const POINT_VS = `#version 300 es
precision highp float;
uniform sampler2D uState; uniform ivec2 uN; uniform int uP;
out float vAlpha;
void main() {
  ivec2 c = ivec2(gl_VertexID % uP, gl_VertexID / uP);
  vec4 s = texelFetch(uState, c, 0);
  vec2 ndc = s.xy / vec2(uN) * 2.0 - 1.0;
  vAlpha = smoothstep(0.0, 6.0, s.z) * (1.0 - smoothstep(60.0, 100.0, s.z)) * 0.9 + 0.1;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = 1.6;
}`;
const POINT_FS = `${GLSL_HEADER}
in float vAlpha; out vec4 o;
void main() { o = vec4(vAlpha); }`;

const FADE_FS = `${GLSL_HEADER}
uniform sampler2D uTrail; uniform float uFade; in vec2 vUv; out vec4 o;
void main() { o = texture(uTrail, vUv) * uFade; }`;

export class Particles {
  private state: PingPong;
  private trail: PingPong;
  private update: Program;
  private points: Program;
  private fade: Program;
  private vao: WebGLVertexArrayObject;
  private frame = 0;
  private needInit = true;
  constructor(
    private gl: GL,
    fmt: Fmt,
    private obs: WebGLTexture,
    trailSize: number,
  ) {
    this.state = new PingPong(gl, P, P, fmt, gl.NEAREST);
    const rgba8 = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, name: "RGBA8" };
    this.trail = new PingPong(gl, trailSize, trailSize, rgba8, gl.LINEAR);
    this.update = new Program(gl, QUAD_VS, PARTICLE_UPDATE_FS);
    this.points = new Program(gl, POINT_VS, POINT_FS);
    this.fade = new Program(gl, QUAD_VS, FADE_FS);
    this.vao = gl.createVertexArray();
  }
  get tex(): WebGLTexture {
    return this.trail.read.tex;
  }
  reset(): void {
    this.needInit = true;
    this.trail.clear();
  }
  step(vel: WebGLTexture, scale: number, speed: number, fadeRate: number): void {
    const gl = this.gl;
    this.state.write.bind();
    this.update.use().tex("uState", 0, this.state.read.tex).tex("uVel", 1, vel).tex("uObs", 2, this.obs)
      .iv2("uN", N, N).f("uScale", scale).f("uSpeed", speed).f("uFrame", this.frame).i("uInit", this.needInit ? 1 : 0);
    drawQuad(gl);
    this.state.swap();
    this.needInit = false;
    this.frame++;

    // fade old trail into the new one, then splat points additively
    this.trail.write.bind();
    this.fade.use().tex("uTrail", 0, this.trail.read.tex).f("uFade", fadeRate);
    drawQuad(gl);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.points.use().tex("uState", 0, this.state.read.tex).iv2("uN", N, N).i("uP", P);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, P * P);
    gl.disable(gl.BLEND);
    this.trail.swap();
  }
}

/** Composite: temperature ramp + obstacles + streaks, drawn to the canvas. */
const COMPOSITE_FS = `${GLSL_HEADER}
uniform sampler2D uHeat, uObs, uTrail, uVel; uniform float uTMax, uVScale; uniform int uShowSpeed;
in vec2 vUv; out vec4 o;
vec3 ramp(float t) {
  vec3 c0 = vec3(0.16, 0.47, 0.84), c1 = vec3(0.55, 0.80, 0.86), c2 = vec3(0.93, 0.90, 0.78), c3 = vec3(0.96, 0.62, 0.30), c4 = vec3(0.85, 0.22, 0.16);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}
void main() {
  float sigma = texture(uObs, vUv).r;
  vec3 col;
  if (uShowSpeed == 1) {
    float s = length(texture(uVel, vUv).xy) * uVScale;
    col = ramp(1.0 - clamp(s / 0.8, 0.0, 1.0));
  } else {
    float T = texture(uHeat, vUv).x;
    col = ramp(smoothstep(0.0, uTMax, T));
  }
  float trail = texture(uTrail, vUv).r;
  col = mix(col, vec3(1.0), clamp(trail, 0.0, 1.0) * 0.85);
  if (sigma > 0.99) col = vec3(0.22, 0.21, 0.20);
  else if (sigma > 0.0) {
    float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.12));
    col = mix(col, vec3(0.45), 0.45 + 0.25 * hatch);
  }
  o = vec4(col, 1.0);
}`;

export class Composite {
  private prog: Program;
  constructor(private gl: GL) {
    this.prog = new Program(gl, QUAD_VS, COMPOSITE_FS);
  }
  draw(w: number, h: number, heat: WebGLTexture, obs: WebGLTexture, trail: WebGLTexture, vel: WebGLTexture, tMax: number, vScale: number, showSpeed: boolean): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    this.prog.use().tex("uHeat", 0, heat).tex("uObs", 1, obs).tex("uTrail", 2, trail).tex("uVel", 3, vel)
      .f("uTMax", tMax).f("uVScale", vScale).i("uShowSpeed", showSpeed ? 1 : 0);
    drawQuad(gl);
  }
}

/** 64×64 stats: R = NaN/inf flag, G = max |u| (scaled), B = mean heat over the 4×4 block. Read back once a second. */
const STATS_FS = `${GLSL_HEADER}
uniform sampler2D uVel, uHeat, uObs; uniform float uVScale, uTMax;
out vec4 o;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy) * 4;
  float bad = 0.0, vmax = 0.0, tsum = 0.0, n = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    ivec2 c = b + ivec2(i, j);
    if (texelFetch(uObs, c, 0).r > 0.99) continue;
    vec2 v = texelFetch(uVel, c, 0).xy * uVScale;
    float T = texelFetch(uHeat, c, 0).x;
    if (any(isnan(v)) || any(isinf(v)) || isnan(T) || isinf(T)) bad = 1.0;
    vmax = max(vmax, length(v));
    tsum += T; n += 1.0;
  }
  o = vec4(bad, clamp(vmax / 2.0, 0.0, 1.0), clamp((n > 0.0 ? tsum / n : 0.0) / uTMax, 0.0, 1.0), n / 16.0);
}`;

export interface Stats {
  nan: boolean;
  maxSpeed: number;
  meanHeat: number;
}

export class StatsProbe {
  private fbo: FBO;
  private prog: Program;
  private buf = new Uint8Array(64 * 64 * 4);
  constructor(private gl: GL) {
    const rgba8 = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, name: "RGBA8" };
    this.fbo = new FBO(gl, 64, 64, rgba8, gl.NEAREST);
    this.prog = new Program(gl, QUAD_VS, STATS_FS);
  }
  read(vel: WebGLTexture, heat: WebGLTexture, obs: WebGLTexture, vScale: number, tMax: number): Stats {
    const gl = this.gl;
    this.fbo.bind();
    this.prog.use().tex("uVel", 0, vel).tex("uHeat", 1, heat).tex("uObs", 2, obs).f("uVScale", vScale).f("uTMax", tMax);
    drawQuad(gl);
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, this.buf);
    let nan = false, vmax = 0, tsum = 0, w = 0;
    for (let k = 0; k < this.buf.length; k += 4) {
      if (this.buf[k]! > 0) nan = true;
      vmax = Math.max(vmax, this.buf[k + 1]!);
      const n = this.buf[k + 3]! / 255;
      tsum += (this.buf[k + 2]! / 255) * tMax * n;
      w += n;
    }
    return { nan, maxSpeed: (vmax / 255) * 2, meanHeat: w > 0 ? tsum / w : 0 };
  }
}
