/// <reference lib="webworker" />
import { Gpt } from "./gpt";

/** Runs the resident model off the main thread. Messages: {type:"load", url} | {type:"say", id, tier, temperature}. */
let model: Gpt | null = null;
self.onmessage = async (e: MessageEvent<{ type: string; id?: number; url?: string; tier?: string; temperature?: number }>) => {
  const m = e.data;
  try {
    if (m.type === "load" && m.url) {
      const r = await fetch(m.url);
      if (!r.ok) throw new Error(`model HTTP ${r.status}`);
      model = new Gpt(await r.arrayBuffer());
      self.postMessage({ type: "ready", params: model.header.tensors.reduce((s, t) => s + t.shape.reduce((a, b) => a * b, 1), 0) });
    } else if (m.type === "say" && model) {
      const text = model.sample(m.tier ?? "nice", { temperature: m.temperature ?? 0.9 });
      self.postMessage({ type: "line", id: m.id, text });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: (err as Error).message });
  }
};
