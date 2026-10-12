/**
 * All audio is synthesised with Web Audio: no files. Quiet generative music for the home screen and
 * while building, short cues for placement and clears. iOS needs the context created in a tap, so
 * `init()` is called from the first button press and again on any pointer down.
 */
const KEY = "hdbreeze.sound";

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer = 0;
  private musicOn = false;
  private bar = 0;
  enabled = true;

  constructor() {
    try { this.enabled = localStorage.getItem(KEY) !== "off"; } catch { /* ignore */ }
    document.addEventListener("pointerdown", () => this.resume(), { passive: true });
  }

  init(): void {
    if (this.ctx) { this.resume(); return; }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    } catch (e) { console.warn("[hdbreeze] no audio", e); }
  }
  private resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }
  toggle(): boolean {
    this.enabled = !this.enabled;
    try { localStorage.setItem(KEY, this.enabled ? "on" : "off"); } catch { /* ignore */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, this.ctx.currentTime, 0.05);
    if (this.enabled) this.init();
    return this.enabled;
  }

  /** A short note: triangle/sine with a soft envelope. */
  private note(freq: number, t0: number, dur: number, gain = 0.2, type: OscillatorType = "triangle", dest?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  private midi(m: number): number {
    return 440 * 2 ** ((m - 69) / 12);
  }

  place(): void {
    const t = this.ctx?.currentTime ?? 0;
    this.note(this.midi(60), t, 0.12, 0.12, "sine");
    this.note(this.midi(48), t, 0.18, 0.1, "triangle");
  }
  reject(): void {
    const t = this.ctx?.currentTime ?? 0;
    this.note(this.midi(43), t, 0.18, 0.1, "sawtooth");
  }
  cool(): void {
    const t = this.ctx?.currentTime ?? 0;
    [72, 76, 79].forEach((m, i) => this.note(this.midi(m), t + i * 0.07, 0.5, 0.07, "sine"));
  }
  /** Three rising notes; each later plot sounds a semitone higher. */
  plotClear(plotIndex: number): void {
    const t = this.ctx?.currentTime ?? 0;
    const base = 72 + (plotIndex - 1);
    [0, 4, 7].forEach((iv, i) => this.note(this.midi(base + iv), t + i * 0.16, 0.6, 0.18));
    this.note(this.midi(base + 12), t + 0.48, 0.9, 0.14, "sine");
  }
  /** A longer major fanfare for a whole town. */
  townClear(): void {
    const t = this.ctx?.currentTime ?? 0;
    const seq = [60, 64, 67, 72, 67, 72, 76, 79];
    seq.forEach((m, i) => this.note(this.midi(m), t + i * 0.13, 0.5, 0.16));
    [60, 64, 67, 72].forEach((m) => this.note(this.midi(m), t + 1.1, 1.8, 0.1, "triangle"));
    [55, 64, 67, 71, 74].forEach((m) => this.note(this.midi(m), t + 2.2, 2.4, 0.09, "sine"));
  }

  /** Slow pads over a four-chord loop plus an occasional pentatonic pluck; quiet by design. */
  startMusic(): void {
    if (this.musicOn) return;
    this.init();
    this.musicOn = true;
    this.bar = 0;
    const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]]; // Am F C G, open voicings
    const scale = [60, 62, 64, 67, 69, 72, 74, 76];
    const tick = (): void => {
      const ctx = this.ctx;
      if (!ctx || !this.musicGain || !this.musicOn) return;
      const t = ctx.currentTime;
      const chord = chords[this.bar % chords.length]!;
      for (const m of chord) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        o.type = "triangle";
        o.frequency.value = this.midi(m);
        o.detune.value = (Math.random() - 0.5) * 8;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.6);
        g.gain.setValueAtTime(0.05, t + 3.2);
        g.gain.linearRampToValueAtTime(0, t + 4.6);
        o.connect(lp).connect(g).connect(this.musicGain);
        o.start(t);
        o.stop(t + 4.7);
      }
      for (let i = 0; i < 2; i++) if (Math.random() < 0.7) this.note(this.midi(scale[Math.floor(Math.random() * scale.length)]!), t + 0.6 + Math.random() * 3, 1.2, 0.05, "sine", this.musicGain);
      this.bar++;
      this.musicTimer = window.setTimeout(tick, 4000);
    };
    tick();
  }
  stopMusic(): void {
    this.musicOn = false;
    window.clearTimeout(this.musicTimer);
  }
}

export const sound = new Sound();
