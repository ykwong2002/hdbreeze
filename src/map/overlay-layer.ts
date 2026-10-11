import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from "maplibre-gl";
import { GLSL_HEADER, Program } from "../sim/gl";
import { WindSim, type SimOptions } from "../sim/sim";
import type { BakedLevel } from "../game/level-types";

/**
 * MapLibre custom layer that owns the wind simulation (prerender) and draws the
 * felt-temperature ramp + streaks on the ground (render). Insert it before the
 * buildings layer so blocks occlude it (spike B).
 */
const VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix; in vec2 a_pos; in vec2 a_uv; out vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0); }`;

const FS = `${GLSL_HEADER}
uniform sampler2D uHeat, uObs, uTrail; uniform float uTMax, uAlpha;
in vec2 v_uv; out vec4 o;
vec3 ramp(float t) {
  vec3 c0 = vec3(0.16, 0.47, 0.84), c1 = vec3(0.55, 0.80, 0.86), c2 = vec3(0.93, 0.90, 0.78), c3 = vec3(0.96, 0.62, 0.30), c4 = vec3(0.85, 0.22, 0.16);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}
void main() {
  vec4 ob = texture(uObs, v_uv);
  if (ob.r > 0.99) discard;
  float T = texture(uHeat, v_uv).x;
  vec3 col = ramp(smoothstep(0.0, uTMax, T));
  float trail = clamp(texture(uTrail, v_uv).r, 0.0, 1.0);
  col = mix(col, vec3(1.0), trail * 0.9);
  float a = uAlpha + 0.25 * trail;
  // soften the box edge
  vec2 e = min(v_uv, 1.0 - v_uv);
  a *= smoothstep(0.0, 0.03, min(e.x, e.y));
  o = vec4(col * a, a);
}`;

export interface WindOverlay {
  layer: CustomLayerInterface;
  /** Resolves once MapLibre has called onAdd and the sim exists. */
  ready: Promise<WindSim>;
  sim: WindSim | null;
  alpha: number;
}

export function createWindOverlay(id: string, opts: SimOptions, level: BakedLevel): WindOverlay {
  let sim: WindSim | null = null;
  let resolveReady: (s: WindSim) => void = () => {};
  const ready = new Promise<WindSim>((r) => (resolveReady = r));
  let prog: Program, vao: WebGLVertexArrayObject, mapRef: MlMap;
  const self: WindOverlay = { layer: null as unknown as CustomLayerInterface, ready, sim: null, alpha: 0.72 };

  self.layer = {
    id,
    type: "custom",
    renderingMode: "2d",
    onAdd(map, gl) {
      mapRef = map;
      sim = new WindSim(gl, opts);
      sim.setLevel(level);
      self.sim = sim;
      prog = new Program(gl, VS, FS);
      const [w, s, e, n] = opts.bbox;
      const nw = MercatorCoordinate.fromLngLat([w, n]);
      const ne = MercatorCoordinate.fromLngLat([e, n]);
      const sw = MercatorCoordinate.fromLngLat([w, s]);
      const se = MercatorCoordinate.fromLngLat([e, s]);
      const data = new Float32Array([nw.x, nw.y, 0, 1, ne.x, ne.y, 1, 1, sw.x, sw.y, 0, 0, se.x, se.y, 1, 0]);
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog.prog, "a_pos");
      const aUv = gl.getAttribLocation(prog.prog, "a_uv");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
      gl.bindVertexArray(null);
      resolveReady(sim);
    },
    onRemove() {
      sim = null;
      self.sim = null;
    },
    prerender(gl) {
      if (!sim) return;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      sim.frame();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    },
    render(gl, args: CustomRenderMethodInput) {
      if (!sim) return;
      prog.use();
      gl.uniformMatrix4fv(prog.loc("u_matrix"), false, args.defaultProjectionData.mainMatrix as Float32Array);
      prog.tex("uHeat", 0, sim.heat.tex).tex("uObs", 1, sim.raster.texture).tex("uTrail", 2, sim.particles.tex).f("uTMax", sim.vis.tMax).f("uAlpha", self.alpha);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      mapRef.triggerRepaint();
    },
  };
  return self;
}
