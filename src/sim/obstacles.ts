import earcut from "earcut";
import { drawQuad, FBO, GLSL_HEADER, Program, QUAD_VS, type Fmt, type GL } from "./gl";

/**
 * Rasterises level geometry into the obstacle texture the solvers read
 * (docs/plan.md 3.2):  R = blockage sigma, G = shade, B = ground heat source, A = wake shadow.
 * Coordinates are sim cells (0..N), y up = north.
 */
export interface BuildingGeom {
  ring: [number, number][];
  heightM: number;
  /** 1 solid, ~0.15 under a void deck. */
  sigma: number;
}
export interface GroundGeom {
  ring: [number, number][];
  heat: number;
}

export const GROUND_HEAT: Record<string, number> = { paved: 1.0, road: 0.9, grass: 0.5, park: 0.25, water: 0.0 };

const GROUND_VS = `#version 300 es
precision highp float;
uniform float uN; in vec2 a_pos; in float a_val; out float v_val;
void main() { v_val = a_val; gl_Position = vec4(a_pos / uN * 2.0 - 1.0, 0.0, 1.0); }`;
const GROUND_FS = `${GLSL_HEADER}
in float v_val; out vec4 o;
void main() { o = vec4(0.0, 0.0, v_val, 0.0); }`;

const BUILDING_VS = `#version 300 es
precision highp float;
uniform float uN; in vec2 a_pos; in float a_h; in float a_sigma; out float v_h; out float v_sigma;
void main() { v_h = a_h; v_sigma = a_sigma; gl_Position = vec4(a_pos / uN * 2.0 - 1.0, 0.0, 1.0); }`;
const BUILDING_FS = `${GLSL_HEADER}
in float v_h; in float v_sigma; out vec4 o;
void main() { o = vec4(v_sigma, clamp(v_h / 100.0, 0.0, 1.0), 0.0, 1.0); }`;

const WAKE_VS = `#version 300 es
precision highp float;
uniform float uN; uniform vec2 uW; uniform float uKWake; uniform int uSteps;
in vec2 a_pos; in float a_h; out float v_a;
void main() {
  float t = (float(gl_InstanceID) + 1.0) / float(uSteps);
  vec2 p = a_pos + uW * a_h * uKWake * t;
  v_a = 1.0 - t * 0.9;
  gl_Position = vec4(p / uN * 2.0 - 1.0, 0.0, 1.0);
}`;
const WAKE_FS = `${GLSL_HEADER}
in float v_a; out vec4 o;
void main() { o = vec4(v_a, 0.0, 0.0, 1.0); }`;

const BLUR_FS = `${GLSL_HEADER}
uniform sampler2D uSrc; uniform ivec2 uDir; uniform ivec2 uN; uniform int uPass;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float sum = 0.0, wsum = 0.0;
  for (int k = -5; k <= 5; k++) {
    float w = exp(-float(k * k) / 8.0);
    ivec2 q = clamp(c + uDir * k, ivec2(0), uN - 1);
    vec4 s = texelFetch(uSrc, q, 0);
    float v = (uPass == 0) ? (s.r > 0.5 ? s.g : 0.0) : s.r;
    sum += w * v; wsum += w;
  }
  o = vec4(sum / wsum, 0.0, 0.0, 1.0);
}`;

const COMBINE_FS = `${GLSL_HEADER}
uniform sampler2D uBase, uShade, uWake;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 b = texelFetch(uBase, c, 0);
  float shade = smoothstep(0.02, 0.16, texelFetch(uShade, c, 0).r);
  float wake = texelFetch(uWake, c, 0).r;
  o = vec4(b.r, shade, b.b, wake);
}`;

interface Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
}

export class ObstacleRaster {
  private rgba8: Fmt;
  private base: FBO;
  private wake: FBO;
  private blurA: FBO;
  private blurB: FBO;
  private out: FBO;
  private pGround: Program;
  private pBuilding: Program;
  private pWake: Program;
  private pBlur: Program;
  private pCombine: Program;
  private groundMesh: Mesh | null = null;
  private staticMesh: Mesh | null = null;
  private dynamicMesh: Mesh | null = null;
  private W: [number, number] = [1, 0];
  /** Wake length per metre of building height, in cells. */
  kWakeCells = 0.8;

  constructor(
    private gl: GL,
    private N: number,
  ) {
    this.rgba8 = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, name: "RGBA8" };
    this.base = new FBO(gl, N, N, this.rgba8, gl.NEAREST);
    this.wake = new FBO(gl, N, N, this.rgba8, gl.NEAREST);
    this.blurA = new FBO(gl, N, N, this.rgba8, gl.NEAREST);
    this.blurB = new FBO(gl, N, N, this.rgba8, gl.NEAREST);
    this.out = new FBO(gl, N, N, this.rgba8, gl.NEAREST);
    this.pGround = new Program(gl, GROUND_VS, GROUND_FS);
    this.pBuilding = new Program(gl, BUILDING_VS, BUILDING_FS);
    this.pWake = new Program(gl, WAKE_VS, WAKE_FS);
    this.pBlur = new Program(gl, QUAD_VS, BLUR_FS);
    this.pCombine = new Program(gl, QUAD_VS, COMBINE_FS);
  }

  get texture(): WebGLTexture {
    return this.out.tex;
  }

  setGround(ground: GroundGeom[]): void {
    this.groundMesh = this.mesh(ground.map((g) => ({ ring: g.ring, a: g.heat, b: 0 })), 1);
    this.rebuild();
  }
  setStaticBuildings(b: BuildingGeom[]): void {
    this.staticMesh = this.mesh(b.map((x) => ({ ring: x.ring, a: x.heightM, b: x.sigma })), 2);
    this.rebuild();
  }
  setDynamicBuildings(b: BuildingGeom[]): void {
    this.dynamicMesh = b.length ? this.mesh(b.map((x) => ({ ring: x.ring, a: x.heightM, b: x.sigma })), 2) : null;
    this.rebuild();
  }
  setWind(W: [number, number]): void {
    this.W = W;
    this.rebuild();
  }

  private mesh(polys: { ring: [number, number][]; a: number; b: number }[], attrs: 1 | 2): Mesh | null {
    const gl = this.gl;
    const verts: number[] = [];
    for (const p of polys) {
      const flat: number[] = [];
      for (const q of p.ring) flat.push(q[0], q[1]);
      const idx = earcut(flat);
      for (const i of idx) {
        verts.push(flat[i * 2]!, flat[i * 2 + 1]!, p.a);
        if (attrs === 2) verts.push(p.b);
      }
    }
    if (!verts.length) return null;
    const stride = (2 + attrs) * 4;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    if (attrs === 2) {
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
    }
    gl.bindVertexArray(null);
    return { vao, count: verts.length / (2 + attrs) };
  }

  private rebuild(): void {
    const gl = this.gl;
    const N = this.N;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // base: ground heat (B), then buildings (R sigma, G height, A flag) with MAX blending
    this.base.bind();
    gl.clearColor(0, 0, GROUND_HEAT.paved!, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    if (this.groundMesh) {
      gl.colorMask(false, false, true, false);
      this.pGround.use().f("uN", N);
      gl.bindVertexArray(this.groundMesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.groundMesh.count);
    }
    gl.colorMask(true, true, false, true);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.pBuilding.use().f("uN", N);
    for (const m of [this.staticMesh, this.dynamicMesh]) {
      if (!m) continue;
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }
    gl.colorMask(true, true, true, true);

    // wake: footprints smeared downwind by height, 8 instances with fading strength
    this.wake.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.pWake.use().f("uN", N).v2("uW", this.W[0], this.W[1]).f("uKWake", this.kWakeCells).i("uSteps", 8);
    for (const m of [this.staticMesh, this.dynamicMesh]) {
      if (!m) continue;
      gl.bindVertexArray(m.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, 8);
    }
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    // shade: separable blur of building heights
    this.blurA.bind();
    this.pBlur.use().tex("uSrc", 0, this.base.tex).iv2("uDir", 1, 0).iv2("uN", N, N).i("uPass", 0);
    drawQuad(gl);
    this.blurB.bind();
    this.pBlur.use().tex("uSrc", 0, this.blurA.tex).iv2("uDir", 0, 1).iv2("uN", N, N).i("uPass", 1);
    drawQuad(gl);

    // combine
    this.out.bind();
    this.pCombine.use().tex("uBase", 0, this.base.tex).tex("uShade", 1, this.blurB.tex).tex("uWake", 2, this.wake.tex);
    drawQuad(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
