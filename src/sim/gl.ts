/** Minimal WebGL2 helpers for the solver spike. Half-float everywhere (see docs/plan.md 1.5). */
export type GL = WebGL2RenderingContext;

export interface Fmt {
  internal: number;
  format: number;
  type: number;
  name: string;
}

export function createGL(canvas: HTMLCanvasElement): GL {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 unavailable");
  return gl;
}

/** Picks the first renderable float format: RGBA16F preferred, RGBA32F fallback. */
export function probeFormat(gl: GL): Fmt {
  const extFloat = gl.getExtension("EXT_color_buffer_float");
  const extHalf = gl.getExtension("EXT_color_buffer_half_float");
  const candidates: Fmt[] = [];
  if (extFloat || extHalf) candidates.push({ internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, name: "RGBA16F" });
  if (extFloat) candidates.push({ internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, name: "RGBA32F" });
  for (const f of candidates) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, 4, 4, 0, f.format, f.type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    if (ok) return f;
  }
  throw new Error("no renderable float format");
}

export const QUAD_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID & 1) * 2, (gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export class Program {
  readonly prog: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();
  constructor(
    readonly gl: GL,
    vs: string,
    fs: string,
  ) {
    const v = compile(gl, gl.VERTEX_SHADER, vs);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    this.prog = p;
  }
  use(): this {
    this.gl.useProgram(this.prog);
    return this;
  }
  loc(name: string): WebGLUniformLocation | null {
    let l = this.locs.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, name);
      this.locs.set(name, l);
    }
    return l;
  }
  f(name: string, x: number): this {
    this.gl.uniform1f(this.loc(name), x);
    return this;
  }
  i(name: string, x: number): this {
    this.gl.uniform1i(this.loc(name), x);
    return this;
  }
  v2(name: string, x: number, y: number): this {
    this.gl.uniform2f(this.loc(name), x, y);
    return this;
  }
  iv2(name: string, x: number, y: number): this {
    this.gl.uniform2i(this.loc(name), x, y);
    return this;
  }
  tex(name: string, unit: number, t: WebGLTexture): this {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, t);
    this.gl.uniform1i(this.loc(name), unit);
    return this;
  }
}

function compile(gl: GL, kind: number, src: string): WebGLShader {
  const s = gl.createShader(kind)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? "";
    const numbered = src.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
    throw new Error(`shader compile failed:\n${log}\n${numbered}`);
  }
  return s;
}

export function createTexture(
  gl: GL,
  w: number,
  h: number,
  fmt: Fmt,
  filter: number,
  data: ArrayBufferView | null = null,
): WebGLTexture {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, data);
  return t;
}

export class FBO {
  readonly fb: WebGLFramebuffer;
  readonly texs: WebGLTexture[];
  constructor(
    readonly gl: GL,
    readonly w: number,
    readonly h: number,
    fmt: Fmt,
    filter: number,
    count = 1,
  ) {
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    this.texs = [];
    const bufs: number[] = [];
    for (let k = 0; k < count; k++) {
      const t = createTexture(gl, w, h, fmt, filter);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k, gl.TEXTURE_2D, t, 0);
      this.texs.push(t);
      bufs.push(gl.COLOR_ATTACHMENT0 + k);
    }
    gl.drawBuffers(bufs);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("FBO incomplete");
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  get tex(): WebGLTexture {
    return this.texs[0]!;
  }
  bind(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fb);
    this.gl.viewport(0, 0, this.w, this.h);
  }
  clear(): void {
    this.bind();
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}

export class PingPong {
  a: FBO;
  b: FBO;
  constructor(gl: GL, w: number, h: number, fmt: Fmt, filter: number, count = 1) {
    this.a = new FBO(gl, w, h, fmt, filter, count);
    this.b = new FBO(gl, w, h, fmt, filter, count);
  }
  get read(): FBO {
    return this.a;
  }
  get write(): FBO {
    return this.b;
  }
  swap(): void {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }
  clear(): void {
    this.a.clear();
    this.b.clear();
  }
}

let quadVao: WebGLVertexArrayObject | null = null;
/** Draws a full-screen triangle pair using gl_VertexID (no buffers). */
export function drawQuad(gl: GL): void {
  if (!quadVao) quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/** GLSL: boundary classification shared by both solvers. */
export const GLSL_BOUNDARY = `
// 0 interior, 1 inflow edge (wind enters), 2 outflow edge. inward = unit step into the domain.
int boundaryType(ivec2 c, ivec2 N, vec2 W, out ivec2 inward) {
  int t = 0; inward = ivec2(0);
  if (c.x == 0)       { inward.x =  1; t = (W.x > 0.0) ? 1 : (t == 1 ? 1 : 2); }
  if (c.x == N.x - 1) { inward.x = -1; t = (W.x < 0.0) ? 1 : (t == 1 ? 1 : 2); }
  if (c.y == 0)       { inward.y =  1; t = (W.y > 0.0) ? 1 : (t == 1 ? 1 : 2); }
  if (c.y == N.y - 1) { inward.y = -1; t = (W.y < 0.0) ? 1 : (t == 1 ? 1 : 2); }
  return t;
}
bool inside(ivec2 c, ivec2 N) { return c.x >= 0 && c.y >= 0 && c.x < N.x && c.y < N.y; }
`;
