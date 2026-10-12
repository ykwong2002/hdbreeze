import type { Map as MlMap } from "maplibre-gl";
import type { LevelSession } from "../game/level";
import { fill } from "../game/fill";

/**
 * Demo autoplay (`?demo=1&level=<plot>`), for screen recordings: after the intro it places the
 * aligned layout one block at a time while the camera slowly orbits, opens a few void decks and
 * lets the plot clear. The intro's "My turn" and "Build" taps happen on their own.
 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runDemo(s: LevelSession, map: MlMap): Promise<void> {
  await s.overlay.ready;
  // work out the aligned layout, then replay it block by block
  fill(s, "aligned");
  const plan = s.blocks.blocks.map((b) => ({ type: b.type, at: b.center, rot: b.rotDeg, height: b.height }));
  s.blocks.clearAll();
  s.select(null);
  const c = centre(s);
  map.easeTo({ center: c, zoom: s.level.camera.zoom + 0.2, pitch: 60, bearing: map.getBearing() + 60, duration: 1200 + plan.length * 900, easing: (t) => t, essential: true });
  await sleep(1200);
  for (const p of plan) {
    const r = s.blocks.place(p.type, p.at, p.rot);
    if (r.ok) { s.blocks.setHeight(r.block.id, p.height); s.select(r.block.id); }
    await sleep(900);
  }
  s.select(null);
  await sleep(1500);
  // open void decks on the first few residential blocks, one by one
  let opened = 0;
  for (const b of s.blocks.blocks) {
    if (opened >= 3 || b.voidDeck || b.type === "mscp") continue;
    s.select(b.id);
    await sleep(500);
    s.blocks.toggleVoid(b.id);
    opened++;
    await sleep(900);
  }
  s.select(null);
  map.easeTo({ center: c, pitch: 55, bearing: map.getBearing() + 40, duration: 12_000, easing: (t) => t, essential: true });
}

function centre(s: LevelSession): [number, number] {
  let x = 0, y = 0;
  for (const p of s.level.site) { x += p[0]; y += p[1]; }
  return [x / s.level.site.length, y / s.level.site.length];
}
