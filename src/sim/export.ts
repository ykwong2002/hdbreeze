import { drawQuad, FBO, GLSL_HEADER, Program, QUAD_VS, type GL } from "./gl";

/**
 * Dev-only synchronous read of the whole field at a small size: felt heat (0..1 of tMax),
 * velocity in cells per frame (u, v) and the solid flag. Used by the `?export=1` mode that
 * feeds the Remotion teaser; never called in play.
 */
const HEAT_FS = `${GLSL_HEADER}
uniform sampler2D uHeat, uObs; uniform float uTMax;
in vec2 vUv; out vec4 o;
void main() {
  float T = texture(uHeat, vUv).x;
  float solid = texture(uObs, vUv).r > 0.99 ? 1.0 : 0.0;
  float porous = texture(uObs, vUv).r;
  o = vec4(clamp(T / uTMax, 0.0, 1.0), solid, porous, 1.0);
}`;
const VEL_FS = `${GLSL_HEADER}
uniform sampler2D uVel; uniform float uScale;
in vec2 vUv; out vec4 o;
void main() {
  vec2 u = texture(uVel, vUv).xy * uScale; // cells per frame, roughly -1..1
  o = vec4(clamp(u * 0.5 + 0.5, 0.0, 1.0), 0.0, 1.0);
}`;

export interface FieldExport {
  size: number;
  /** Felt heat as a fraction of tMax, row-major from the south-west corner. */
  heat: number[];
  solid: number[];
  u: number[];
  v: number[];
}

export function readFields(gl: GL, size: number, heat: WebGLTexture, obs: WebGLTexture, vel: WebGLTexture, tMax: number, cellsPerFrame: number): FieldExport {
  const fbo = new FBO(gl, size, size, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, name: "RGBA8" }, gl.NEAREST);
  const px = new Uint8Array(size * size * 4);
  const read = (): Uint8Array => { gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const heatProg = new Program(gl, QUAD_VS, HEAT_FS);
  const velProg = new Program(gl, QUAD_VS, VEL_FS);
  const out: FieldExport = { size, heat: [], solid: [], u: [], v: [] };
  fbo.bind();
  heatProg.use().tex("uHeat", 0, heat).tex("uObs", 1, obs).f("uTMax", tMax);
  drawQuad(gl);
  const h = read();
  for (let i = 0; i < size * size; i++) { out.heat.push(Math.round((h[i * 4]! / 255) * 1000) / 1000); out.solid.push(h[i * 4 + 1]! > 127 ? 1 : 0); }
  fbo.bind();
  velProg.use().tex("uVel", 0, vel).f("uScale", cellsPerFrame);
  drawQuad(gl);
  const v = read();
  for (let i = 0; i < size * size; i++) { out.u.push(Math.round((v[i * 4]! / 255 - 0.5) * 2 * 1000) / 1000); out.v.push(Math.round((v[i * 4 + 1]! / 255 - 0.5) * 2 * 1000) / 1000); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
}
