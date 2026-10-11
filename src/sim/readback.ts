import { drawQuad, FBO, GLSL_HEADER, Program, QUAD_VS, type GL } from "./gl";

/**
 * Downsampled felt-heat grid read back to the CPU without stalling: render
 * to a small RGBA8 target, readPixels into a pixel-pack buffer, and collect
 * it a frame or two later once the fence signals (docs/plan.md 3.3 step 10).
 */
const FS = `${GLSL_HEADER}
uniform sampler2D uHeat, uObs; uniform float uTMax;
in vec2 vUv; out vec4 o;
void main() {
  float T = texture(uHeat, vUv).x;
  float solid = texture(uObs, vUv).r > 0.99 ? 1.0 : 0.0;
  o = vec4(clamp(T / uTMax, 0.0, 1.0), solid, 0.0, 1.0);
}`;

export class HeatReadback {
  private fbo: FBO;
  private prog: Program;
  private pbos: [WebGLBuffer, WebGLBuffer];
  private which = 0;
  private sync: WebGLSync | null = null;
  private data: Uint8Array;
  private pending = false;
  /** True once at least one grid has arrived. */
  ready = false;
  private tMax = 1;

  constructor(
    private gl: GL,
    readonly size = 64,
  ) {
    this.fbo = new FBO(gl, size, size, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, name: "RGBA8" }, gl.NEAREST);
    this.prog = new Program(gl, QUAD_VS, FS);
    this.data = new Uint8Array(size * size * 4);
    this.pbos = [gl.createBuffer(), gl.createBuffer()];
    for (const b of this.pbos) {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.data.byteLength, gl.STREAM_READ);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }

  /** Kicks off a readback if none is in flight. Call inside the GL frame. */
  request(heat: WebGLTexture, obs: WebGLTexture, tMax: number): void {
    if (this.pending) return;
    const gl = this.gl;
    this.tMax = tMax;
    this.fbo.bind();
    this.prog.use().tex("uHeat", 0, heat).tex("uObs", 1, obs).f("uTMax", tMax);
    drawQuad(gl);
    this.which ^= 1;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[this.which]!);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.pending = true;
  }

  /** Collects a finished readback. Call once per frame inside the GL frame. */
  poll(): boolean {
    if (!this.pending || !this.sync) return false;
    const gl = this.gl;
    const st = gl.clientWaitSync(this.sync, 0, 0);
    if (st !== gl.ALREADY_SIGNALED && st !== gl.CONDITION_SATISFIED) return false;
    gl.deleteSync(this.sync);
    this.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[this.which]!);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.data);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.pending = false;
    this.ready = true;
    return true;
  }

  /** Felt heat T (sim units) at sim-cell coordinates, bilinear; null inside solids or before data arrives. */
  sample(cx: number, cy: number, n: number): number | null {
    if (!this.ready) return null;
    const s = this.size;
    const gx = Math.min(s - 1.001, Math.max(0, (cx / n) * s - 0.5));
    const gy = Math.min(s - 1.001, Math.max(0, (cy / n) * s - 0.5));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const at = (x: number, y: number): [number, number] => {
      const k = (y * s + x) * 4;
      return [this.data[k]! / 255, this.data[k + 1]!];
    };
    const [a, as] = at(x0, y0), [b, bs] = at(x0 + 1, y0), [c, cs] = at(x0, y0 + 1), [d, ds] = at(x0 + 1, y0 + 1);
    if (as && bs && cs && ds) return null;
    const t = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    return t * this.tMax;
  }
}
