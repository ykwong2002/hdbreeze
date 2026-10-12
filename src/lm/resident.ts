import type { Tier } from "../game/lines";
import ResidentWorker from "./worker?worker";

/** The residents' tiny language model, loaded lazily; lines are filtered and fall back to the handwritten set. */
const TIER_TOKEN: Record<Tier, string> = { miserable: "hot", warm: "warm", pleasant: "nice", cold: "cold" };

export class ResidentBrain {
  private worker: Worker | null = null;
  private pending = new Map<number, (t: string | null) => void>();
  private seq = 0;
  private recent: string[] = [];
  ready = false;
  params = 0;
  private loading: Promise<boolean> | null = null;

  load(url: string): Promise<boolean> {
    this.loading ??= new Promise((resolve) => {
      try {
        this.worker = new ResidentWorker();
      } catch {
        resolve(false);
        return;
      }
      this.worker.onmessage = (e: MessageEvent<{ type: string; id?: number; text?: string; params?: number; message?: string }>) => {
        const m = e.data;
        if (m.type === "ready") { this.ready = true; this.params = m.params ?? 0; resolve(true); }
        else if (m.type === "line" && m.id !== undefined) { this.pending.get(m.id)?.(m.text ?? null); this.pending.delete(m.id); }
        else if (m.type === "error") { if (m.id !== undefined) { this.pending.get(m.id)?.(null); this.pending.delete(m.id); } else resolve(false); }
      };
      this.worker.onerror = () => resolve(false);
      this.worker.postMessage({ type: "load", url });
      window.setTimeout(() => resolve(false), 45_000);
    });
    return this.loading;
  }

  /** A fresh line for the tier, or null if the model is not ready or produced junk. */
  async say(tier: Tier, temperature = 0.9): Promise<string | null> {
    if (!this.ready || !this.worker) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const id = ++this.seq;
      const text = await new Promise<string | null>((resolve) => {
        this.pending.set(id, resolve);
        this.worker!.postMessage({ type: "say", id, tier: TIER_TOKEN[tier], temperature });
        window.setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve(null); } }, 4000);
      });
      const tidy = text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
      if (tidy && this.acceptable(tidy)) {
        this.recent.push(tidy);
        if (this.recent.length > 20) this.recent.shift();
        return tidy;
      }
    }
    return null;
  }

  private acceptable(t: string): boolean {
    if (t.length < 12 || t.length > 72) return false;
    if (!/^[A-Za-z][A-Za-z0-9 ,.'?!-]*[.?!]$/.test(t)) return false;
    if (this.recent.includes(t)) return false;
    const words = t.toLowerCase().split(/\s+/);
    if (new Set(words).size < words.length * 0.7) return false; // stuttering
    return true;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.loading = null;
  }
}
