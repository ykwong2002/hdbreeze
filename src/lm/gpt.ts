/**
 * Minimal inference for the resident model (tools/lm): a character-level GPT
 * exported as a JSON header + fp16 weights. Pure TypeScript, no dependencies,
 * ~1M parameters, so a 70-character line costs a few tens of milliseconds.
 */
export interface GptHeader {
  cfg: { d: number; h: number; layers: number; ctx: number };
  chars: string[];
  tiers: Record<string, string>;
  tensors: { name: string; shape: number[] }[];
  dtype: "float16";
}

interface Layer {
  ln1w: Float32Array; ln1b: Float32Array; qkvW: Float32Array; qkvB: Float32Array; projW: Float32Array; projB: Float32Array;
  ln2w: Float32Array; ln2b: Float32Array; fcW: Float32Array; fcB: Float32Array; fc2W: Float32Array; fc2B: Float32Array;
}

function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

export class Gpt {
  readonly header: GptHeader;
  private tok: Float32Array;
  private pos: Float32Array;
  private layers: Layer[] = [];
  private lnfw: Float32Array;
  private lnfb: Float32Array;
  readonly stoi = new Map<string, number>();
  readonly d: number;
  readonly h: number;
  readonly ctx: number;
  readonly vocab: number;

  constructor(buf: ArrayBuffer) {
    const u8 = new Uint8Array(buf);
    if (String.fromCharCode(u8[0]!, u8[1]!, u8[2]!, u8[3]!) !== "HDBR") throw new Error("not a resident model");
    const hlen = new DataView(buf).getUint32(4, true);
    this.header = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hlen))) as GptHeader;
    const { cfg, chars, tensors } = this.header;
    this.d = cfg.d; this.h = cfg.h; this.ctx = cfg.ctx; this.vocab = chars.length;
    chars.forEach((c, i) => this.stoi.set(c, i));
    let off = 8 + hlen;
    const take = (shape: number[]): Float32Array => {
      const n = shape.reduce((a, b) => a * b, 1);
      const out = new Float32Array(n);
      const dv = new DataView(buf, off, n * 2);
      for (let i = 0; i < n; i++) out[i] = halfToFloat(dv.getUint16(i * 2, true));
      off += n * 2;
      return out;
    };
    const named = new Map<string, Float32Array>();
    for (const t of tensors) named.set(t.name, take(t.shape));
    const g = (n: string): Float32Array => { const t = named.get(n); if (!t) throw new Error(`missing ${n}`); return t; };
    this.tok = g("tok.weight"); this.pos = g("pos.weight");
    for (let i = 0; i < cfg.layers; i++) {
      const p = `blocks.${i}.`;
      this.layers.push({ ln1w: g(p + "ln1.weight"), ln1b: g(p + "ln1.bias"), qkvW: g(p + "qkv.weight"), qkvB: g(p + "qkv.bias"), projW: g(p + "proj.weight"), projB: g(p + "proj.bias"),
        ln2w: g(p + "ln2.weight"), ln2b: g(p + "ln2.bias"), fcW: g(p + "fc.weight"), fcB: g(p + "fc.bias"), fc2W: g(p + "fc2.weight"), fc2B: g(p + "fc2.bias") });
    }
    this.lnfw = g("lnf.weight"); this.lnfb = g("lnf.bias");
  }

  /** Incremental decoding state: per-layer K and V for the tokens seen so far. */
  private newState(): { k: Float32Array[]; v: Float32Array[]; n: number } {
    return { k: this.layers.map(() => new Float32Array(this.ctx * this.d)), v: this.layers.map(() => new Float32Array(this.ctx * this.d)), n: 0 };
  }

  /** Feeds one token at position `state.n` and returns next-token logits (KV cache, so each step is O(T·d)). */
  private step(id: number, state: { k: Float32Array[]; v: Float32Array[]; n: number }): Float32Array {
    const d = this.d, hd = d / this.h, t = state.n;
    const x = new Float32Array(d), tmp = new Float32Array(d), q = new Float32Array(d), att = new Float32Array(d), hid = new Float32Array(4 * d);
    const scores = new Float32Array(t + 1);
    for (let i = 0; i < d; i++) x[i] = this.tok[id * d + i]! + this.pos[t * d + i]!;
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li]!, K = state.k[li]!, V = state.v[li]!;
      ln(x, L.ln1w, L.ln1b, tmp, d);
      // q, k, v for this token; k and v go into the cache
      for (let j = 0; j < 3 * d; j++) {
        let acc = L.qkvB[j]!;
        const row = j * d;
        for (let i = 0; i < d; i++) acc += L.qkvW[row + i]! * tmp[i]!;
        if (j < d) q[j] = acc; else if (j < 2 * d) K[t * d + j - d] = acc; else V[t * d + j - 2 * d] = acc;
      }
      const scale = 1 / Math.sqrt(hd);
      for (let hh = 0; hh < this.h; hh++) {
        const o = hh * hd;
        let m = -Infinity;
        for (let s = 0; s <= t; s++) { let dot = 0; for (let i = 0; i < hd; i++) dot += q[o + i]! * K[s * d + o + i]!; scores[s] = dot * scale; if (scores[s]! > m) m = scores[s]!; }
        let sum = 0;
        for (let s = 0; s <= t; s++) { const e = Math.exp(scores[s]! - m); scores[s] = e; sum += e; }
        for (let i = 0; i < hd; i++) { let acc = 0; for (let s = 0; s <= t; s++) acc += scores[s]! * V[s * d + o + i]!; att[o + i] = acc / sum; }
      }
      for (let j = 0; j < d; j++) { let acc = L.projB[j]!; const row = j * d; for (let i = 0; i < d; i++) acc += L.projW[row + i]! * att[i]!; x[j] = x[j]! + acc; }
      ln(x, L.ln2w, L.ln2b, tmp, d);
      for (let j = 0; j < 4 * d; j++) { let acc = L.fcB[j]!; const row = j * d; for (let i = 0; i < d; i++) acc += L.fcW[row + i]! * tmp[i]!; hid[j] = gelu(acc); }
      for (let j = 0; j < d; j++) { let acc = L.fc2B[j]!; const row = j * 4 * d; for (let i = 0; i < 4 * d; i++) acc += L.fc2W[row + i]! * hid[i]!; x[j] = x[j]! + acc; }
    }
    state.n = t + 1;
    ln(x, this.lnfw, this.lnfb, tmp, d);
    const out = new Float32Array(this.vocab);
    for (let c = 0; c < this.vocab; c++) { let acc = 0; const row = c * d; for (let i = 0; i < d; i++) acc += this.tok[row + i]! * tmp[i]!; out[c] = acc; }
    return out;
  }

  /** Samples a line for a tier token with temperature + top-k; stops at newline. */
  sample(tier: string, opts: { temperature?: number; topK?: number; maxLen?: number; rng?: () => number } = {}): string {
    const temperature = opts.temperature ?? 0.9, topK = opts.topK ?? 20, maxLen = Math.min(opts.maxLen ?? 72, this.ctx - 1), rng = opts.rng ?? Math.random;
    const start = this.stoi.get(this.header.tiers[tier] ?? "\x01");
    if (start === undefined) return "";
    const state = this.newState();
    let lg = this.step(start, state);
    let out = "";
    const nl = this.stoi.get("\n") ?? -1;
    for (let n = 0; n < maxLen; n++) {
      const idx = [...lg.keys()].sort((a, b) => lg[b]! - lg[a]!).slice(0, topK);
      const m = lg[idx[0]!]!;
      const w = idx.map((i) => Math.exp((lg[i]! - m) / temperature));
      const sum = w.reduce((a, b) => a + b, 0);
      let r = rng() * sum, pick = idx[idx.length - 1]!;
      for (let i = 0; i < idx.length; i++) { r -= w[i]!; if (r <= 0) { pick = idx[i]!; break; } }
      if (pick === nl) break;
      const ch = this.header.chars[pick]!;
      if (ch.charCodeAt(0) < 32) break; // tier tokens never belong in output
      out += ch;
      lg = this.step(pick, state);
    }
    return out.trim();
  }
}

function ln(x: Float32Array, w: Float32Array, b: Float32Array, out: Float32Array, d: number): void {
  let mean = 0; for (let i = 0; i < d; i++) mean += x[i]!; mean /= d;
  let v = 0; for (let i = 0; i < d; i++) { const z = x[i]! - mean; v += z * z; } v /= d;
  const inv = 1 / Math.sqrt(v + 1e-5);
  for (let i = 0; i < d; i++) out[i] = (x[i]! - mean) * inv * w[i]! + b[i]!;
}
function gelu(x: number): number {
  return 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
}
