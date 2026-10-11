import "maplibre-gl/dist/maplibre-gl.css";
import "../../src/map/worker";
import { Map as MlMap, Marker, MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput } from "maplibre-gl";
import { BUILDINGS_3D_LAYER, buildStyle } from "../../src/map/style";
import { OPENFREEMAP_TILEJSON } from "../../src/map/tiles";

/* Punggol box, roughly 890 x 775 m. Yellow DOM markers mark the corners; the overlay paints its corners magenta. */
const BBOX = { w: 103.9025, s: 1.401, e: 103.9105, n: 1.408 };
const CORNERS: [number, number][] = [
  [BBOX.w, BBOX.n],
  [BBOX.e, BBOX.n],
  [BBOX.e, BBOX.s],
  [BBOX.w, BBOX.s],
];
const TEX = 512;

const hud = document.getElementById("hud")!;
const map = new MlMap({
  container: "map",
  style: buildStyle("openmaptiles", { tileJsonUrl: OPENFREEMAP_TILEJSON }),
  center: [(BBOX.w + BBOX.e) / 2, (BBOX.s + BBOX.n) / 2],
  zoom: 15.6,
  pitch: 55,
  bearing: 20,
  maxPitch: 60,
  canvasContextAttributes: { antialias: false },
  attributionControl: { compact: true },
});
for (const c of CORNERS) {
  const el = document.createElement("div");
  el.className = "corner";
  new Marker({ element: el }).setLngLat(c).addTo(map);
}

/* ------------------------------------------------ shared GL bits */
const VS_GROUND = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
in vec2 a_pos; in vec2 a_uv; out vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0); }`;
const FS_GROUND = `#version 300 es
precision highp float;
uniform sampler2D u_tex; in vec2 v_uv; out vec4 o;
void main() { vec4 c = texture(u_tex, v_uv); o = vec4(c.rgb * c.a, c.a); }`;
const FS_PATTERN = `#version 300 es
precision highp float;
uniform float u_t; in vec2 v_uv; out vec4 o;
void main() {
  vec2 g = floor(v_uv * 16.0);
  float ck = mod(g.x + g.y, 2.0);
  vec3 col = mix(vec3(0.16, 0.62, 0.62), vec3(0.95, 0.55, 0.25), ck);
  float a = 0.55;
  vec2 dot = vec2(0.5 + 0.35 * cos(u_t), 0.5 + 0.35 * sin(u_t * 0.7));
  if (distance(v_uv, dot) < 0.02) { col = vec3(1.0); a = 1.0; }
  vec2 e = min(v_uv, 1.0 - v_uv);
  if (e.x < 0.012 && e.y < 0.012) { col = vec3(1.0, 0.0, 1.0); a = 1.0; }
  o = vec4(col, a);
}`;
const VS_QUAD = `#version 300 es
precision highp float; out vec2 v_uv;
void main() { vec2 p = vec2((gl_VertexID & 1) * 2, (gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const VS_SPRITE = `#version 300 es
precision highp float;
uniform mat4 u_matrix; in vec3 a_pos; in vec2 a_uv; out vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = u_matrix * vec4(a_pos, 1.0); }`;
const FS_SPRITE = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
void main() {
  vec2 p = v_uv - vec2(0.5, 0.0);
  float head = 1.0 - step(0.16, distance(v_uv, vec2(0.5, 0.82)));
  float body = step(abs(p.x), 0.22 - 0.1 * v_uv.y) * step(v_uv.y, 0.66);
  float m = max(head, body);
  if (m < 0.5) discard;
  o = vec4(0.17, 0.60, 0.62, 1.0);
}`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (t: number, s: string) => {
    const sh = gl.createShader(t)!;
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "compile");
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

interface Timer {
  ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  pending: WebGLQuery[];
  lastMs: number;
}
function makeTimer(gl: WebGL2RenderingContext): Timer {
  return { ext: gl.getExtension("EXT_disjoint_timer_query_webgl2"), pending: [], lastMs: NaN };
}
function timed(gl: WebGL2RenderingContext, t: Timer, fn: () => void): void {
  if (!t.ext || t.pending.length > 4) {
    fn();
    return;
  }
  const q = gl.createQuery()!;
  gl.beginQuery(t.ext.TIME_ELAPSED_EXT, q);
  fn();
  gl.endQuery(t.ext.TIME_ELAPSED_EXT);
  t.pending.push(q);
  const head = t.pending[0]!;
  if (gl.getQueryParameter(head, gl.QUERY_RESULT_AVAILABLE)) {
    const ns = gl.getQueryParameter(head, gl.QUERY_RESULT) as number;
    t.lastMs = ns / 1e6;
    gl.deleteQuery(head);
    t.pending.shift();
  }
}

/* ------------------------------------------------ ground overlay as a custom 2d layer */
let glRef: WebGL2RenderingContext | null = null;
let groundTimer: Timer | null = null;
let frames = 0;

function groundLayer(): CustomLayerInterface {
  let prog: WebGLProgram, pat: WebGLProgram, vao: WebGLVertexArrayObject, fbo: WebGLFramebuffer, tex: WebGLTexture, uMatrix: WebGLUniformLocation | null, uT: WebGLUniformLocation | null;
  let patVao: WebGLVertexArrayObject;
  return {
    id: "spike-ground",
    type: "custom",
    renderingMode: "2d",
    onAdd(_m, gl) {
      glRef = gl;
      groundTimer = makeTimer(gl);
      prog = program(gl, VS_GROUND, FS_GROUND);
      pat = program(gl, VS_QUAD, FS_PATTERN);
      uMatrix = gl.getUniformLocation(prog, "u_matrix");
      uT = gl.getUniformLocation(pat, "u_t");
      const m = CORNERS.map((c) => MercatorCoordinate.fromLngLat(c));
      // two triangles: NW, NE, SW, SE  (uv: v=1 at north so the texture is not flipped)
      const data = new Float32Array([
        m[0]!.x, m[0]!.y, 0, 1,
        m[1]!.x, m[1]!.y, 1, 1,
        m[3]!.x, m[3]!.y, 0, 0,
        m[2]!.x, m[2]!.y, 1, 0,
      ]);
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "a_pos");
      const aUv = gl.getAttribLocation(prog, "a_uv");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
      gl.bindVertexArray(null);
      patVao = gl.createVertexArray();
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TEX, TEX, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    prerender(gl) {
      // our own FBO pass inside MapLibre's frame: the solver will live here in M1
      timed(gl, groundTimer!, () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, TEX, TEX);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(pat);
        gl.uniform1f(uT, performance.now() / 1000);
        gl.bindVertexArray(patVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      });
    },
    render(gl, args: CustomRenderMethodInput) {
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uMatrix, false, args.defaultProjectionData.mainMatrix as Float32Array);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      frames++;
    },
  };
}

/* ------------------------------------------------ upright sprites as a custom 3d layer */
const PEOPLE: [number, number][] = [
  [103.9040, 1.4030],
  [103.9062, 1.4046],
  [103.9085, 1.4060],
  [103.9075, 1.4025],
  [103.9052, 1.4068],
  [103.9095, 1.4040],
];
function spriteLayer(): CustomLayerInterface {
  let prog: WebGLProgram, vao: WebGLVertexArrayObject, buf: WebGLBuffer, uMatrix: WebGLUniformLocation | null;
  const verts = new Float32Array(PEOPLE.length * 6 * 5);
  return {
    id: "spike-people",
    type: "custom",
    renderingMode: "3d",
    onAdd(_m, gl) {
      prog = program(gl, VS_SPRITE, FS_SPRITE);
      uMatrix = gl.getUniformLocation(prog, "u_matrix");
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "a_pos");
      const aUv = gl.getAttribLocation(prog, "a_uv");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 12);
      gl.bindVertexArray(null);
    },
    render(gl, args: CustomRenderMethodInput) {
      // billboard: quad spans screen-right in map units, stands up along mercator z
      const b = (map.getBearing() * Math.PI) / 180;
      const rx = Math.cos(b), ry = Math.sin(b); // screen-right in (east, south) mercator axes
      const h = 1.8 * 4; // 4x life size so it reads on a phone
      let k = 0;
      PEOPLE.forEach((ll, i) => {
        const t = performance.now() / 1000 + i;
        const wobble = [ll[0] + 0.00008 * Math.cos(t * 0.6), ll[1] + 0.00008 * Math.sin(t * 0.4)] as [number, number];
        const base = MercatorCoordinate.fromLngLat(wobble, 0);
        const top = MercatorCoordinate.fromLngLat(wobble, h);
        const w = (top.z - base.z) * 0.5; // half-width in mercator units
        const push = (dx: number, z: number, u: number, v: number) => {
          verts[k++] = base.x + rx * w * dx;
          verts[k++] = base.y + ry * w * dx;
          verts[k++] = z;
          verts[k++] = u;
          verts[k++] = v;
        };
        push(-1, base.z, 0, 0); push(1, base.z, 1, 0); push(-1, top.z, 0, 1);
        push(1, base.z, 1, 0); push(1, top.z, 1, 1); push(-1, top.z, 0, 1);
      });
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uMatrix, false, args.defaultProjectionData.mainMatrix as Float32Array);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, PEOPLE.length * 6);
      gl.bindVertexArray(null);
    },
  };
}

/* ------------------------------------------------ canvas-source variant */
const canvas2d = document.createElement("canvas");
canvas2d.width = TEX;
canvas2d.height = TEX;
const ctx = canvas2d.getContext("2d")!;
let canvasMode = false;
function drawCanvas(): void {
  const t = performance.now() / 1000;
  const cell = TEX / 16;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    ctx.fillStyle = (i + j) % 2 ? "rgba(242,140,64,0.55)" : "rgba(41,158,158,0.55)";
    ctx.fillRect(i * cell, j * cell, cell, cell);
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc((0.5 + 0.35 * Math.cos(t)) * TEX, (1 - (0.5 + 0.35 * Math.sin(t * 0.7))) * TEX, TEX * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0f";
  const e = TEX * 0.012;
  for (const [x, y] of [[0, 0], [TEX - e, 0], [0, TEX - e], [TEX - e, TEX - e]]) ctx.fillRect(x!, y!, e, e);
}

function setMode(canvas: boolean): void {
  canvasMode = canvas;
  document.getElementById("bCustom")!.classList.toggle("on", !canvas);
  document.getElementById("bCanvas")!.classList.toggle("on", canvas);
  if (map.getLayer("spike-ground")) map.removeLayer("spike-ground");
  if (map.getLayer("spike-ground-raster")) map.removeLayer("spike-ground-raster");
  if (map.getSource("spike-canvas")) map.removeSource("spike-canvas");
  if (canvas) {
    drawCanvas();
    map.addSource("spike-canvas", {
      type: "canvas",
      canvas: canvas2d,
      animate: true,
      coordinates: [CORNERS[0]!, CORNERS[1]!, CORNERS[2]!, CORNERS[3]!],
    });
    map.addLayer({ id: "spike-ground-raster", type: "raster", source: "spike-canvas", paint: { "raster-fade-duration": 0 } }, BUILDINGS_3D_LAYER);
  } else {
    map.addLayer(groundLayer(), BUILDINGS_3D_LAYER);
  }
}

/* ------------------------------------------------ registration check */
interface CornerErr { found: boolean; px: number }
const errs: CornerErr[] = CORNERS.map(() => ({ found: false, px: NaN }));
const pix = new Uint8Array(17 * 17 * 4);
function checkCorners(): void {
  const gl = glRef;
  if (!gl) return;
  const dpr = window.devicePixelRatio || 1;
  const H = gl.drawingBufferHeight;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  CORNERS.forEach((c, i) => {
    const p = map.project(c);
    const cx = Math.round(p.x * dpr), cy = Math.round(H - p.y * dpr);
    if (cx < 8 || cy < 8 || cx > gl.drawingBufferWidth - 9 || cy > H - 9) { errs[i] = { found: false, px: NaN }; return; }
    gl.readPixels(cx - 8, cy - 8, 17, 17, gl.RGBA, gl.UNSIGNED_BYTE, pix);
    let best = Infinity;
    for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) {
      const k = (y * 17 + x) * 4;
      if (pix[k]! > 180 && pix[k + 1]! < 90 && pix[k + 2]! > 180) best = Math.min(best, Math.hypot(x - 8, y - 8));
    }
    errs[i] = { found: best < Infinity, px: best < Infinity ? best / dpr : NaN };
  });
}

let renders = 0, fpsT0 = performance.now(), fps = 0, lastCheck = 0;
map.on("render", () => {
  renders++;
  const now = performance.now();
  if (now - fpsT0 > 1000) { fps = (renders * 1000) / (now - fpsT0); renders = 0; fpsT0 = now; }
  if (now - lastCheck > 250) { lastCheck = now; checkCorners(); updateHud(); }
});
function updateHud(): void {
  const e = errs.map((x) => (x.found ? x.px.toFixed(1) : "–")).join(" ");
  const gpu = groundTimer && !Number.isNaN(groundTimer.lastMs) ? `${groundTimer.lastMs.toFixed(2)} ms` : "n/a";
  hud.textContent = `${canvasMode ? "canvas source" : "custom layer"}  ${fps.toFixed(0)} fps\nground GPU ${gpu}\ncorner err px: ${e}\npitch ${map.getPitch().toFixed(0)} bearing ${map.getBearing().toFixed(0)}`;
}

/* ------------------------------------------------ controls */
let spinning = false;
function spin(): void {
  if (!spinning) return;
  map.rotateTo(map.getBearing() + 90, { duration: 4000, easing: (t) => t });
  setTimeout(spin, 4000);
}
document.getElementById("bCustom")!.onclick = () => setMode(false);
document.getElementById("bCanvas")!.onclick = () => setMode(true);
document.getElementById("bRotate")!.onclick = () => map.rotateTo(map.getBearing() + 90, { duration: 3000 });
document.getElementById("bSpin")!.onclick = () => { spinning = !spinning; document.getElementById("bSpin")!.classList.toggle("on", spinning); spin(); };
document.getElementById("bPitch")!.onclick = () => map.easeTo({ pitch: map.getPitch() > 30 ? 0 : 60, duration: 1500 });

map.on("load", () => {
  map.addLayer(spriteLayer());
  setMode(false);
  const tick = (): void => {
    if (canvasMode) drawCanvas();
    map.triggerRepaint();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

(window as unknown as { __spike: unknown }).__spike = {
  map,
  setMode,
  report: () => ({ mode: canvasMode ? "canvas" : "custom", fps, groundGpuMs: groundTimer?.lastMs ?? NaN, corners: errs.map((e) => ({ ...e })), pitch: map.getPitch(), bearing: map.getBearing(), frames }),
};
