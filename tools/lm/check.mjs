// Samples lines per tier from public/models/resident.bin through the browser inference code (src/lm/gpt.ts).
//   node --experimental-strip-types tools/lm/check.mjs [n]
import { readFileSync } from "node:fs";
const { Gpt } = await import("../../src/lm/gpt.ts");
const n = Number(process.argv[2] ?? 4);
const buf = readFileSync("public/models/resident.bin");
const gpt = new Gpt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log("model:", gpt.header.cfg, "vocab", gpt.vocab, "params", gpt.header.tensors.reduce((s, t) => s + t.shape.reduce((a, b) => a * b, 1), 0));
let seed = 42;
const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
for (const tier of Object.keys(gpt.header.tiers)) {
  console.log(`== ${tier}`);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) console.log("  ", gpt.sample(tier, { temperature: 0.9, rng }));
  console.log(`   (${((performance.now() - t0) / n).toFixed(0)} ms per line)`);
}
