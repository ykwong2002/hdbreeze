import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const LAUNCH_FPS = 30;
export const LAUNCH_SECONDS = 48;
const COOL = "#2a9d9f";
const HOT = "#d9382a";
const INK = "#f4f2ed";
const FONT = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Inter, Arial, sans-serif";

/* ---------- helpers ---------- */
const sec = (s: number) => Math.round(s * LAUNCH_FPS);

/** Fades and rises a child in over `inFrames`, fades it out over the last `outFrames` of its sequence. */
const Reveal: React.FC<{ children: React.ReactNode; inFrames?: number; outFrames?: number; duration: number; y?: number }> = ({ children, inFrames = 18, outFrames = 12, duration, y = 40 }) => {
  const f = useCurrentFrame();
  const inA = interpolate(f, [0, inFrames], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const outA = interpolate(f, [duration - outFrames, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ty = interpolate(inA, [0, 1], [y, 0]);
  return <div style={{ opacity: Math.min(inA, outA), transform: `translateY(${ty}px)` }}>{children}</div>;
};

const Statement: React.FC<{ lines: string[]; duration: number; size?: number; accent?: number; color?: string }> = ({ lines, duration, size = 112, accent = -1, color = INK }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: size, lineHeight: 1.05, letterSpacing: -3, color, textAlign: "center" }}>
        {lines.map((l, i) => {
          const start = i * 10;
          const a = interpolate(f, [start, start + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          const out = interpolate(f, [duration - 12, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ opacity: Math.min(a, out), transform: `translateY(${(1 - a) * 30}px)`, color: i === accent ? COOL : color }}>
              {l}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Phone mockup playing a slice of the walkthrough recording. */
const Phone: React.FC<{ from: number; scale?: number; tilt?: number; caption?: string; sub?: string; captionColor?: string; stat?: { value: number; label: string; color: string } }> = ({ from, scale = 0.74, tilt = 0, caption, sub, captionColor = INK, stat }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 200, stiffness: 60, mass: 1.2 } });
  const sc = stat ? Math.min(scale, 0.56) : scale;
  const w = 1080 * sc, h = w * (2338 / 1080);
  const y = interpolate(enter, [0, 1], [260, 0]);
  const counted = stat ? Math.round(interpolate(f, [20, 70], [0, stat.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: caption ? 150 : 110 }}>
      {caption && (
        <Reveal duration={10_000} inFrames={16}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 84, letterSpacing: -2, color: captionColor, textAlign: "center", lineHeight: 1.05 }}>{caption}</div>
          {sub && <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: 38, color: "rgba(244,242,237,0.72)", textAlign: "center", marginTop: 14 }}>{sub}</div>}
        </Reveal>
      )}
      <div style={{ marginTop: caption ? 40 : 0, opacity: enter, transform: `translateY(${y}px) perspective(2400px) rotateY(${tilt}deg)`, width: w, height: h, borderRadius: 64 * sc * 1.4, padding: 14, background: "#161618", boxShadow: "0 60px 120px rgba(0,0,0,0.6), inset 0 0 0 2px #2a2a2e" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 52 * sc * 1.4, overflow: "hidden", background: "#000" }}>
          <OffthreadVideo src={staticFile("walkthrough.mp4")} startFrom={from} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>
      {stat && (
        <div style={{ position: "absolute", bottom: 56, left: 0, right: 0, textAlign: "center", fontFamily: FONT }}>
          <div style={{ fontWeight: 800, fontSize: 170, letterSpacing: -8, lineHeight: 1, color: stat.color }}>{counted}%</div>
          <div style={{ fontWeight: 500, fontSize: 36, color: "rgba(244,242,237,0.8)", marginTop: 4 }}>{stat.label}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

const Feature: React.FC<{ i: number; title: string; body: string }> = ({ i, title, body }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - i * 14, fps, config: { damping: 200, stiffness: 90 } });
  return (
    <div style={{ opacity: s, transform: `translateX(${(1 - s) * 120}px)`, padding: "34px 40px", borderRadius: 30, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", marginBottom: 26 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 52, color: INK, letterSpacing: -1 }}>{title}</div>
      <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: 34, color: "rgba(244,242,237,0.72)", marginTop: 10, lineHeight: 1.3 }}>{body}</div>
    </div>
  );
};

/* ---------- the film ---------- */
export const Launch: React.FC = () => {
  const f = useCurrentFrame();
  // a slow teal-to-hot glow drifting behind everything, Apple-keynote style
  const glowX = interpolate(f, [0, LAUNCH_SECONDS * LAUNCH_FPS], [20, 80]);
  return (
    <AbsoluteFill style={{ background: "#07070a" }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 40% at ${glowX}% 30%, rgba(42,157,159,0.22), transparent 70%), radial-gradient(50% 35% at ${100 - glowX}% 85%, rgba(217,56,42,0.14), transparent 70%)` }} />

      {/* 0-4 s: hook */}
      <Sequence from={0} durationInFrames={sec(4)}>
        <Statement lines={["what if you could", "bend the wind?"]} duration={sec(4)} accent={1} />
      </Sequence>
      {/* 4-8 s: the problem */}
      <Sequence from={sec(4)} durationInFrames={sec(4)}>
        <Statement lines={["Singapore is hot.", "The breeze is free.", "Blocks get in the way."]} duration={sec(4)} size={96} accent={1} />
      </Sequence>
      {/* 8-14 s: the product */}
      <Sequence from={sec(8)} durationInFrames={sec(6)}>
        <Phone from={sec(12)} caption="HDBreeze" sub="plan a liveable HDB precinct, on a real plot" tilt={-10} />
      </Sequence>
      {/* 14-22 s: the careless plan */}
      <Sequence from={sec(14)} durationInFrames={sec(8)}>
        <Phone from={sec(40)} caption="The careless plan." sub="walls across the wind, every block tall" captionColor={HOT} stat={{ value: 0, label: "breathable", color: HOT }} />
      </Sequence>
      {/* 22-32 s: the planner's plan */}
      <Sequence from={sec(22)} durationInFrames={sec(10)}>
        <Phone from={sec(66)} caption="Now you plan it." sub="rows along the wind, gaps between them, void decks" captionColor={COOL} stat={{ value: 61, label: "breathable, same plot, same people", color: COOL }} />
      </Sequence>
      {/* 32-40 s: features */}
      <Sequence from={sec(32)} durationInFrames={sec(8)}>
        <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
          <Reveal duration={sec(8)} inFrames={12}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 64, color: INK, letterSpacing: -2, marginBottom: 36 }}>Under the hood</div>
          </Reveal>
          <Feature i={0} title="Real plots, real blocks" body="HDB footprints and storeys from data.gov.sg, plot ratios from the URA Master Plan." />
          <Feature i={1} title="A wind tunnel in your phone" body="A lattice-Boltzmann flow on the GPU, with the ground heating the air and the breeze carrying it off." />
          <Feature i={2} title="Residents who complain in Singlish" body="A 0.8M-parameter language model trained for this, running entirely in your browser." />
        </AbsoluteFill>
      </Sequence>
      {/* 40-48 s: close */}
      <Sequence from={sec(40)} durationInFrames={sec(8)}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
          <Reveal duration={sec(8)} inFrames={18}>
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 150, letterSpacing: -6, color: INK, textAlign: "center", lineHeight: 1 }}>HDBreeze</div>
            <div style={{ width: 220, height: 12, borderRadius: 6, margin: "28px auto 40px", background: `linear-gradient(90deg, ${COOL}, ${HOT})` }} />
            <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 48, color: INK, textAlign: "center" }}>Plays in your phone browser.</div>
            <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 48, color: COOL, textAlign: "center", marginTop: 8 }}>Link in the comments.</div>
            <div style={{ fontFamily: FONT, fontWeight: 400, fontSize: 28, color: "rgba(244,242,237,0.5)", textAlign: "center", marginTop: 70 }}>Fan-made, everything is an estimate. Not affiliated with HDB or URA.</div>
          </Reveal>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
