import { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { ALIGNED, CARELESS, EMPTY, META, type BlockData, type Fields, type Pt } from "./data";
import { affine, cameraAt, depth, project, type Cam } from "./camera";
import { buildPaths, CYCLE, TAIL, type Path } from "./flow";
import { BLOCK_LEFT, BLOCK_RIGHT, BLOCK_TOP, COOL, CTX_LEFT, CTX_RIGHT, CTX_TOP, HOT, INK, INK_SOFT, PAPER, ramp } from "./ramp";

const { fontFamily } = loadFont("normal", { weights: ["500", "700"], subsets: ["latin"] });
export type Layout = "portrait" | "square" | "og";
export interface TeaserProps { layout: Layout; url: string }

/* ---------- timeline (frames) ---------- */
const T = {
  carelessRise: 60, carelessSink: 150, alignedRise: 195, end: 315, still: 405,
};
const N = META.n;
const MPC = META.metresPerCell;
const centroid = (ring: Pt[]): Pt => { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } return [x / ring.length, y / ring.length]; };
const FOCUS = centroid(META.plot);
const plotXs = META.plot.map((p) => p[0]), plotYs = META.plot.map((p) => p[1]);
const SPAN = Math.max(Math.max(...plotXs) - Math.min(...plotXs), Math.max(...plotYs) - Math.min(...plotYs)) * 1.0;
const BOX = { x0: FOCUS[0] - SPAN * 0.95, y0: FOCUS[1] - SPAN * 0.95, x1: FOCUS[0] + SPAN * 0.95, y1: FOCUS[1] + SPAN * 0.95 };
const inPlot = (p: Pt): boolean => { let inside = false; const r = META.plot; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i]!, b = r[j]!; if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] + 1e-12) + a[0]) inside = !inside; } return inside; };

/** 0..1 weights of the three layouts at a frame (they always sum to 1). */
function layoutMix(frame: number): { empty: number; careless: number; aligned: number } {
  const c = interpolate(frame, [T.carelessRise + 10, T.carelessRise + 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const a = interpolate(frame, [T.carelessSink + 15, T.alignedRise + 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return { empty: (1 - c), careless: c * (1 - a), aligned: a };
}

/* ---------- ground: heat through the ramp, clipped to the score zone ---------- */
const Ground: React.FC<{ cam: Cam; w: number; h: number }> = ({ cam, w, h }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const mix = layoutMix(frame);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const size = EMPTY.fields.size;
    const off = document.createElement("canvas"); off.width = size; off.height = size;
    const octx = off.getContext("2d")!;
    const img = octx.createImageData(size, size);
    const F: [Fields, number][] = [[EMPTY.fields, mix.empty], [CARELESS.fields, mix.careless], [ALIGNED.fields, mix.aligned]];
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const k = j * size + i;
      let t = 0;
      for (const [f, wgt] of F) { const sol = (f.solid[k] ?? 0) > 0.5; t += (sol ? 0.42 : (f.heat[k] ?? 0)) * wgt; }
      const [r, g, b] = ramp((t - 0.3) * 1.6);
      // image rows run top-down; field rows run south-to-north, so flip
      const o = ((size - 1 - j) * size + i) * 4;
      img.data[o] = r * 255; img.data[o + 1] = g * 255; img.data[o + 2] = b * 255; img.data[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const m = affine(cam);
    const paint = (alpha: number, clip: Pt[] | null): void => {
      ctx.save();
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      if (clip) { ctx.beginPath(); clip.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.clip(); }
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      // the field image spans the whole sim box, north up: draw flipped so cell y grows north
      ctx.translate(0, N); ctx.scale(1, -1);
      ctx.drawImage(off, 0, 0, N, N);
      ctx.restore();
    };
    paint(0.16, null);
    paint(0.85, META.zone);
    // soften the box edge: fade the ground out radially around the plot
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    const fc = project(cam, FOCUS[0], FOCUS[1]);
    const R = Math.min(w, h) * 0.56;
    const grad = ctx.createRadialGradient(fc[0], fc[1] + 40, R * 0.5, fc[0], fc[1] + 40, R);
    grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // plot outline
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); META.plot.forEach((p, i) => { const q = project(cam, p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
    ctx.strokeStyle = "rgba(29,127,129,0.9)"; ctx.lineWidth = 2.5; ctx.setLineDash([10, 6]); ctx.stroke();
    ctx.restore();
  }, [frame, cam, w, h, mix.empty, mix.careless, mix.aligned]);
  return <canvas ref={ref} width={w} height={h} style={{ position: "absolute", inset: 0 }} />;
};

/* ---------- streamlines ---------- */
const Streams: React.FC<{ cam: Cam; w: number; h: number }> = ({ cam, w, h }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const paths = useMemo(() => ({
    empty: buildPaths(EMPTY.fields, N, BOX, 420, "e", 1.5),
    careless: buildPaths(CARELESS.fields, N, BOX, 420, "c", 1.5),
    aligned: buildPaths(ALIGNED.fields, N, BOX, 420, "a", 1.5),
  }), []);
  const mix = layoutMix(frame);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    const draw = (set: Path[], alpha: number): void => {
      if (alpha < 0.02) return;
      for (const p of set) {
        const head = (frame + p.offset) % CYCLE;
        if (head >= p.pts.length) continue;
        const from = Math.max(0, head - TAIL);
        for (let k = from; k < head; k++) {
          const a = project(cam, p.pts[k]![0], p.pts[k]![1]);
          const b = project(cam, p.pts[k + 1]![0], p.pts[k + 1]![1]);
          const t = (k - from) / TAIL;
          ctx.strokeStyle = `rgba(${Math.round(255 - 213 * t)}, ${Math.round(255 - 98 * t)}, ${Math.round(255 - 96 * t)}, ${(0.05 + 0.75 * t) * alpha})`;
          ctx.lineWidth = 1.0 + 1.6 * t;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      }
    };
    draw(paths.empty, mix.empty);
    draw(paths.careless, mix.careless);
    draw(paths.aligned, mix.aligned);
  }, [frame, cam, w, h, paths, mix.empty, mix.careless, mix.aligned]);
  return <canvas ref={ref} width={w} height={h} style={{ position: "absolute", inset: 0 }} />;
};

/* ---------- blocks (SVG isometric extrusions) ---------- */
interface Prism { ring: Pt[]; z0: number; z1: number; top: string; left: string; right: string; key: string }
function viewDir(cam: Cam): Pt { const a = -Math.PI * 0.75 - cam.phi; return [Math.cos(a), Math.sin(a)]; }
function prismFaces(cam: Cam, p: Prism): { d: string; fill: string }[] {
  let ring = p.ring.slice(); if (ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]) ring = ring.slice(0, -1);
  let area = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i]!, b = ring[(i + 1) % ring.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) ring.reverse();
  const vd = viewDir(cam);
  const faces: { d: string; fill: string; depth: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const len = Math.hypot(nx, ny) || 1;
    const dot = (nx * vd[0] + ny * vd[1]) / len;
    if (dot <= 0) continue;
    const cos = Math.cos(cam.phi), sin = Math.sin(cam.phi);
    const nxr = nx * cos - ny * sin; // rotated normal: +x-ish faces are "right", +y-ish are "left"
    const fill = nxr > 0 ? p.right : p.left;
    const q = [project(cam, a[0], a[1], p.z0), project(cam, b[0], b[1], p.z0), project(cam, b[0], b[1], p.z1), project(cam, a[0], a[1], p.z1)];
    faces.push({ d: `M${q.map((v) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join("L")}Z`, fill, depth: 0 });
  }
  const top = ring.map((v) => project(cam, v[0], v[1], p.z1));
  faces.push({ d: `M${top.map((v) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join("L")}Z`, fill: p.top, depth: 1 });
  return faces;
}

const Blocks: React.FC<{ cam: Cam }> = ({ cam }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = (f0: number): number => (frame < f0 ? 0 : spring({ frame: frame - f0, fps, config: { damping: 11, stiffness: 110, mass: 0.9 } }));
  const sink = (f0: number): number => 1 - interpolate(frame, [f0, f0 + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const prisms: Prism[] = [];
  const voidBase = 4.5 / MPC;
  const addBlocks = (blocks: BlockData[], factor: (i: number) => number, tag: string): void => {
    blocks.forEach((b, i) => {
      const k = factor(i);
      if (k <= 0.001) return;
      const hCells = (b.heightM / MPC) * k;
      const base = b.voidDeck ? voidBase * Math.min(1, k * 1.5) : 0;
      if (b.voidDeck) b.columns.forEach((c, ci) => prisms.push({ ring: c, z0: 0, z1: base, top: BLOCK_LEFT, left: BLOCK_RIGHT, right: BLOCK_RIGHT, key: `${tag}${i}c${ci}` }));
      b.bodies.forEach((ring, bi) => prisms.push({ ring, z0: base, z1: Math.max(base + 0.01, hCells), top: BLOCK_TOP, left: BLOCK_LEFT, right: BLOCK_RIGHT, key: `${tag}${i}b${bi}` }));
    });
  };
  META.context.forEach((c, i) => prisms.push({ ring: c.ring, z0: 0, z1: c.h / MPC, top: CTX_TOP, left: CTX_LEFT, right: CTX_RIGHT, key: `x${i}` }));
  addBlocks(CARELESS.blocks, (i) => rise(T.carelessRise + i * 5) * sink(T.carelessSink + i * 2), "c");
  addBlocks(ALIGNED.blocks, (i) => rise(T.alignedRise + i * 6), "a");
  const sorted = prisms.map((p) => ({ p, d: depth(cam, centroid(p.ring)[0], centroid(p.ring)[1]) })).sort((a, b) => b.d - a.d);
  return (
    <svg style={{ position: "absolute", inset: 0 }} width="100%" height="100%">
      {sorted.map(({ p }) => prismFaces(cam, p).map((f, i) => <path key={`${p.key}-${i}`} d={f.d} fill={f.fill} />))}
    </svg>
  );
};

/* ---------- residents + bubbles ---------- */
const RESIDENTS: { at: Pt; text: string; from: number; until: number }[] = (() => {
  const inside = META.walkways.filter(inPlot).sort((a, b) => a[0] - b[0]);
  const at = (q: number, seed: string): Pt => inside[Math.min(inside.length - 1, Math.floor((q + random(seed) * 0.08) * inside.length))] ?? FOCUS;
  return [
    { at: at(0.5, "r1"), text: "Why so hot ah?", from: 108, until: T.carelessSink + 8 },
    { at: at(0.12, "r2"), text: "Eh, got wind leh!", from: 252, until: T.end + 20 },
    { at: at(0.86, "r3"), text: "Wah, got wind until shiok.", from: 286, until: T.end + 20 },
  ];
})();

const Residents: React.FC<{ cam: Cam; k: number }> = ({ cam, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      {RESIDENTS.map((r, i) => {
        const [x, y] = project(cam, r.at[0], r.at[1]);
        const pop = frame < r.from ? 0 : spring({ frame: frame - r.from, fps, config: { damping: 12, stiffness: 160 } });
        const gone = interpolate(frame, [r.until, r.until + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const a = Math.min(pop, gone);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -100%)" }}>
            <div style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)", width: 7 * k, height: 20 * k, borderRadius: 999, background: INK_SOFT, boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }} />
            <div style={{ position: "absolute", left: "50%", bottom: 16 * k, transform: `translate(-50%, 0) scale(${a})`, transformOrigin: "50% 100%", opacity: a, padding: `${10 * k}px ${16 * k}px`, background: "#fff", borderRadius: 14, boxShadow: "0 6px 20px rgba(31,28,23,0.16)", fontFamily, fontWeight: 500, fontSize: 24 * k, color: INK, whiteSpace: "nowrap" }}>{r.text}</div>
          </div>
        );
      })}
    </>
  );
};

/* ---------- type ---------- */
const Words: React.FC<{ text: string; from: number; until: number; size: number; color?: string; x: number; y: number; align?: "left" | "center" }> = ({ text, from, until, size, color = INK, x, y, align = "left" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [until, until + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: x, top: y, right: align === "center" ? x : undefined, textAlign: align, fontFamily, fontWeight: 700, fontSize: size, lineHeight: 1.05, letterSpacing: "-0.02em", color, opacity: out }}>
      {text.split(" ").map((w, i) => {
        const s = frame < from + i * 4 ? 0 : spring({ frame: frame - from - i * 4, fps, config: { damping: 14, stiffness: 120 } });
        return <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: s, transform: `translateY(${(1 - s) * 0.5 * size}px)` }}>{w}</span>;
      })}
    </div>
  );
};

const Counter: React.FC<{ value: number; from: number; until: number; color: string; label: string; sub?: string; x: number; y: number; k: number; countFrames?: number }> = ({ value, from, until, color, label, sub, x, y, k, countFrames = 50 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = frame < from ? 0 : spring({ frame: frame - from, fps, config: { damping: 13, stiffness: 120 } });
  const out = interpolate(frame, [until, until + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const n = Math.round(interpolate(frame, [from, from + countFrames], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  const subA = frame < from + countFrames + 6 ? 0 : spring({ frame: frame - from - countFrames - 6, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <div style={{ position: "absolute", right: x, top: y, textAlign: "right", opacity: Math.min(pop, out), transform: `translateY(${(1 - pop) * 24}px)`, fontFamily, color }}>
      <div style={{ fontWeight: 700, fontSize: 150 * k, lineHeight: 1, letterSpacing: "-0.03em" }}>{n}%</div>
      <div style={{ fontWeight: 500, fontSize: 36 * k, color: INK_SOFT, marginTop: 4 * k }}>{label}</div>
      {sub && <div style={{ fontWeight: 700, fontSize: 44 * k, color: INK, marginTop: 14 * k, opacity: subA, transform: `translateY(${(1 - subA) * 14}px)` }}>{sub}</div>}
    </div>
  );
};

const Wordmark: React.FC<{ k: number }> = ({ k }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 * k, fontFamily, fontWeight: 700, fontSize: 112 * k, letterSpacing: "-0.03em", color: INK }}>
    HDBreeze<span style={{ display: "inline-block", width: 90 * k, height: 12 * k, borderRadius: 6 * k, background: `linear-gradient(90deg, ${COOL}, ${HOT})` }} />
  </div>
);

/* ---------- the teaser ---------- */
export const Teaser: React.FC<TeaserProps> = ({ layout, url }) => {
  const frame = useCurrentFrame();
  const { width: w, height: h, fps } = useVideoConfig();
  const k = layout === "square" ? 0.86 : layout === "og" ? 0.62 : 1;
  const safe = 90;
  const cam = useMemo(() => cameraAt(frame, w, h, FOCUS, SPAN), [frame, w, h]);
  const soft = interpolate(frame, [T.end, T.end + 30], [0, 0.78], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const endIn = frame < T.end + 20 ? 0 : spring({ frame: frame - T.end - 20, fps, config: { damping: 16, stiffness: 90 } });
  const counterX = safe, counterY = safe + 10;
  return (
    <AbsoluteFill style={{ background: PAPER, overflow: "hidden" }}>
      <Ground cam={cam} w={w} h={h} />
      <Streams cam={cam} w={w} h={h} />
      <Blocks cam={cam} />
      <Residents cam={cam} k={k} />
      {layout === "og" && (
        <div style={{ position: "absolute", left: safe * 0.7, top: safe * 0.6 }}>
          <Wordmark k={0.72} />
          <div style={{ fontFamily, fontWeight: 500, fontSize: 30, color: INK_SOFT, marginTop: 10 }}>Plan a breathable HDB precinct. Free, in your browser.</div>
        </div>
      )}
      {/* beat 1 */}
      <Words text="The breeze is free." from={2} until={T.carelessRise - 4} size={88 * k} x={safe} y={safe + 20} />
      {/* beat 2 */}
      <Counter value={0} from={96} until={T.carelessSink + 4} color={HOT} label="breathable" x={counterX} y={counterY} k={k} countFrames={1} />
      {/* beat 3 */}
      <Words text="Same plot. Plan it right." from={T.carelessSink + 4} until={T.alignedRise + 12} size={80 * k} x={safe} y={safe + 20} />
      {/* beat 4 */}
      <Counter value={ALIGNED.breath} from={T.alignedRise + 36} until={T.end + 2} color={COOL} label="breathable" sub={`${ALIGNED.homes.toLocaleString()} people housed`} x={counterX} y={counterY} k={k} countFrames={55} />
      {/* beat 5 */}
      <AbsoluteFill style={{ background: PAPER, opacity: soft }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: endIn, transform: `translateY(${(1 - endIn) * 30}px)` }}>
        <Wordmark k={k} />
        <div style={{ fontFamily, fontWeight: 700, fontSize: 64 * k, letterSpacing: "-0.02em", color: INK, marginTop: 26 * k }}>Bend the wind.</div>
        <div style={{ fontFamily, fontWeight: 500, fontSize: 36 * k, color: INK_SOFT, marginTop: 30 * k }}>Play free in your browser</div>
        <div style={{ fontFamily, fontWeight: 700, fontSize: 40 * k, color: COOL, marginTop: 8 * k }}>{url}</div>
        <div style={{ position: "absolute", bottom: safe, left: safe, right: safe, textAlign: "center", fontFamily, fontWeight: 500, fontSize: 24 * k, color: INK_SOFT }}>Fan-made. Not affiliated with HDB or URA.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
