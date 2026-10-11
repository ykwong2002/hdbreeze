import { drawQuad, GLSL_BOUNDARY, GLSL_HEADER, PingPong, Program, QUAD_VS, type Fmt, type GL } from "./gl";
import { N } from "./obstacles";
import { windVector, type Solver, type WindParams } from "./solver";

/** Free-stream lattice speed at speed = 1. Keep well under 0.1 for stability (Ma ≈ 0.14). */
const U_MAX = 0.08;

/**
 * D2Q9 with TRT collision and half-way bounce-back. Populations are stored as
 * deltas from their lattice weights (f_i - w_i) so half-float keeps precision.
 * Textures: F0 = (d0,d1,d2,d3), F1 = (d4,d5,d6,d7), F2 = (d8,-,-,-); macro = (ux,uy,rho,-).
 */
const GLSL_LATTICE = `
const vec2 E[9] = vec2[9](vec2(0,0), vec2(1,0), vec2(0,1), vec2(-1,0), vec2(0,-1), vec2(1,1), vec2(-1,1), vec2(-1,-1), vec2(1,-1));
const float Wt[9] = float[9](4.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0);
const int OPP[9] = int[9](0, 3, 4, 1, 2, 7, 8, 5, 6);
float deq(int i, float rho, vec2 u) {
  float eu = dot(E[i], u);
  return Wt[i] * (rho * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * dot(u, u)) - 1.0);
}
void load(sampler2D a, sampler2D b, sampler2D cc, ivec2 p, out float d[9]) {
  vec4 x = texelFetch(a, p, 0); vec4 y = texelFetch(b, p, 0); vec4 z = texelFetch(cc, p, 0);
  d[0]=x.x; d[1]=x.y; d[2]=x.z; d[3]=x.w; d[4]=y.x; d[5]=y.y; d[6]=y.z; d[7]=y.w; d[8]=z.x;
}
`;

const COLLIDE_FS = `${GLSL_HEADER}${GLSL_LATTICE}
uniform sampler2D uF0, uF1, uF2, uObs;
uniform vec2 uW; uniform float uTau, uLambda, uK;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 oMacro;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float sigma = texelFetch(uObs, c, 0).r;
  float d[9]; load(uF0, uF1, uF2, c, d);
  if (sigma > 0.99) { o0 = vec4(0.0); o1 = vec4(0.0); o2 = vec4(0.0); oMacro = vec4(0.0, 0.0, 1.0, 0.0); return; }
  float rho = 1.0; vec2 m = vec2(0.0);
  for (int i = 0; i < 9; i++) { rho += d[i]; m += E[i] * d[i]; }
  vec2 u = m / rho;
  // forcing by velocity shift: recovery toward free stream and Brinkman drag
  vec2 ue = u + uLambda * (uW - u);
  ue /= (1.0 + uK * sigma);
  float wp = 1.0 / uTau;
  float wm = 1.0 / (0.25 / (uTau - 0.5) + 0.5);
  float e[9]; for (int i = 0; i < 9; i++) e[i] = deq(i, rho, ue);
  float s[9];
  s[0] = d[0] - wp * (d[0] - e[0]);
  for (int i = 1; i < 9; i++) {
    int j = OPP[i];
    float dp = 0.5 * (d[i] + d[j]), dm = 0.5 * (d[i] - d[j]);
    float ep = 0.5 * (e[i] + e[j]), em = 0.5 * (e[i] - e[j]);
    s[i] = d[i] - wp * (dp - ep) - wm * (dm - em);
  }
  o0 = vec4(s[0], s[1], s[2], s[3]);
  o1 = vec4(s[4], s[5], s[6], s[7]);
  o2 = vec4(s[8], 0.0, 0.0, 0.0);
  oMacro = vec4(u, rho, 0.0);
}`;

const STREAM_FS = `${GLSL_HEADER}${GLSL_BOUNDARY}${GLSL_LATTICE}
uniform sampler2D uF0, uF1, uF2, uObs, uMacro;
uniform ivec2 uN; uniform vec2 uW;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
void pull(ivec2 c, out float d[9]) {
  float own[9]; load(uF0, uF1, uF2, c, own);
  for (int i = 0; i < 9; i++) {
    ivec2 src = clamp(c - ivec2(E[i]), ivec2(0), uN - 1);
    if (texelFetch(uObs, src, 0).r > 0.99) { d[i] = own[OPP[i]]; }
    else {
      vec4 x = texelFetch(uF0, src, 0); vec4 y = texelFetch(uF1, src, 0); vec4 z = texelFetch(uF2, src, 0);
      float v[9] = float[9](x.x, x.y, x.z, x.w, y.x, y.y, y.z, y.w, z.x);
      d[i] = v[i];
    }
  }
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float d[9];
  o3 = texelFetch(uMacro, c, 0); // carry the macro field through so both FBOs stay current
  if (texelFetch(uObs, c, 0).r > 0.99) { o0 = vec4(0.0); o1 = vec4(0.0); o2 = vec4(0.0); return; }
  ivec2 inward; int bt = boundaryType(c, uN, uW, inward);
  if (bt == 1) { for (int i = 0; i < 9; i++) d[i] = deq(i, 1.0, uW); }
  else if (bt == 2) { pull(c + inward, d); }
  else { pull(c, d); }
  o0 = vec4(d[0], d[1], d[2], d[3]);
  o1 = vec4(d[4], d[5], d[6], d[7]);
  o2 = vec4(d[8], 0.0, 0.0, 0.0);
}`;

export class LatticeBoltzmann implements Solver {
  readonly name = "lattice Boltzmann (TRT)";
  readonly cellsPerSubstep = 1 / U_MAX * 0.6; // normalise visuals to the stable solver's 0.6 cells/substep
  steps = 0;
  private f: PingPong; // 4 attachments: F0, F1, F2, macro (ux, uy, rho)
  private collide: Program;
  private stream: Program;

  constructor(
    private gl: GL,
    fmt: Fmt,
    private obs: WebGLTexture,
  ) {
    this.f = new PingPong(gl, N, N, fmt, gl.NEAREST, 4);
    this.collide = new Program(gl, QUAD_VS, COLLIDE_FS);
    this.stream = new Program(gl, QUAD_VS, STREAM_FS);
  }

  get velocity(): WebGLTexture {
    return this.f.read.texs[3]!;
  }

  reset(): void {
    this.f.clear(); // deltas of zero = rest state at rho 1
    this.steps = 0;
  }

  step(p: WindParams): void {
    const gl = this.gl;
    const [wx, wy] = windVector(p.fromDeg);
    const W: [number, number] = [wx * p.speed * U_MAX, wy * p.speed * U_MAX];

    // collide: read f, write f* (+ macro)
    this.f.write.bind();
    this.collide.use().tex("uF0", 0, this.f.read.texs[0]!).tex("uF1", 1, this.f.read.texs[1]!).tex("uF2", 2, this.f.read.texs[2]!)
      .tex("uObs", 3, this.obs).v2("uW", W[0], W[1]).f("uTau", p.tau).f("uLambda", p.lambda).f("uK", p.kDrag);
    drawQuad(gl);
    this.f.swap();

    // stream: read f*, write f
    this.f.write.bind();
    this.stream.use().tex("uF0", 0, this.f.read.texs[0]!).tex("uF1", 1, this.f.read.texs[1]!).tex("uF2", 2, this.f.read.texs[2]!)
      .tex("uObs", 3, this.obs).tex("uMacro", 4, this.f.read.texs[3]!).iv2("uN", N, N).v2("uW", W[0], W[1]);
    drawQuad(gl);
    this.f.swap();

    this.steps++;
  }
}
