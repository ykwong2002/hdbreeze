import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from "maplibre-gl";
import { GLSL_HEADER, Program } from "../sim/gl";
import type { Agent } from "../game/agents";

/**
 * Residents as upright billboards in a 3d custom layer after the buildings,
 * depth-tested so blocks hide them. Tinted by their own comfort so the crowd
 * reads as a heat map too.
 */
const VS = `#version 300 es
precision highp float;
uniform mat4 u_matrix; in vec3 a_pos; in vec3 a_uvc; out vec2 v_uv; out float v_c;
void main() { v_uv = a_uvc.xy; v_c = a_uvc.z; gl_Position = u_matrix * vec4(a_pos, 1.0); }`;
const FS = `${GLSL_HEADER}
in vec2 v_uv; in float v_c; out vec4 o;
void main() {
  vec2 p = v_uv - vec2(0.5, 0.0);
  float head = 1.0 - step(0.17, distance(v_uv, vec2(0.5, 0.80)));
  float body = step(abs(p.x), 0.20 - 0.08 * v_uv.y) * step(v_uv.y, 0.62);
  if (max(head, body) < 0.5) discard;
  vec3 cool = vec3(0.16, 0.60, 0.62), hot = vec3(0.89, 0.42, 0.23);
  vec3 col = mix(hot, cool, v_c);
  if (head > 0.5) col = mix(col, vec3(0.98, 0.86, 0.72), 0.75);
  o = vec4(col, 1.0);
}`;

export interface AgentsLayer {
  layer: CustomLayerInterface;
  /** Height of a sprite in metres (toy scale, not life size). */
  heightM: number;
}

export function createAgentsLayer(id: string, bbox: [number, number, number, number], n: number, getAgents: () => Agent[]): AgentsLayer {
  let prog: Program, vao: WebGLVertexArrayObject, buf: WebGLBuffer, mapRef: MlMap;
  let verts = new Float32Array(0);
  const self: AgentsLayer = { layer: null as unknown as CustomLayerInterface, heightM: 9 };
  const [w, s, e, nn] = bbox;
  const nw = MercatorCoordinate.fromLngLat([w, nn]);
  const se = MercatorCoordinate.fromLngLat([e, s]);
  const mPerUnit = 1 / MercatorCoordinate.fromLngLat([w, nn], 1).z; // mercator units per metre is 1/mPerUnit
  const unitPerM = MercatorCoordinate.fromLngLat([(w + e) / 2, (s + nn) / 2], 1).z;

  self.layer = {
    id,
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      mapRef = map;
      prog = new Program(gl, VS, FS);
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, 64 * 6 * 6 * 4, gl.DYNAMIC_DRAW);
      const aPos = gl.getAttribLocation(prog.prog, "a_pos");
      const aUvc = gl.getAttribLocation(prog.prog, "a_uvc");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aUvc);
      gl.vertexAttribPointer(aUvc, 3, gl.FLOAT, false, 24, 12);
      gl.bindVertexArray(null);
      void mPerUnit;
    },
    render(gl, args: CustomRenderMethodInput) {
      const agents = getAgents();
      if (!agents.length) return;
      const need = agents.length * 6 * 6;
      if (verts.length !== need) verts = new Float32Array(need);
      const b = (mapRef.getBearing() * Math.PI) / 180;
      const rx = Math.cos(b), ry = Math.sin(b);
      const h = self.heightM * unitPerM;
      const hw = h * 0.25;
      let k = 0;
      for (const a of agents) {
        const mx = nw.x + (a.x / n) * (se.x - nw.x);
        const my = nw.y + (1 - a.y / n) * (se.y - nw.y);
        const push = (dx: number, z: number, u: number, v: number): void => {
          verts[k++] = mx + rx * hw * dx;
          verts[k++] = my + ry * hw * dx;
          verts[k++] = z;
          verts[k++] = u;
          verts[k++] = v;
          verts[k++] = a.comfort;
        };
        push(-1, 0, 0, 0); push(1, 0, 1, 0); push(-1, h, 0, 1);
        push(1, 0, 1, 0); push(1, h, 1, 1); push(-1, h, 0, 1);
      }
      prog.use();
      gl.uniformMatrix4fv(prog.loc("u_matrix"), false, args.defaultProjectionData.mainMatrix as Float32Array);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES, 0, agents.length * 6);
      gl.bindVertexArray(null);
    },
  };
  return self;
}
