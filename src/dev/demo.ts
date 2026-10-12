import type { Map as MlMap } from "maplibre-gl";
import type { LevelSession } from "../game/level";
import { fill } from "../game/fill";

/**
 * Demo autoplay (`?demo=1&level=<plot>`), for screen recordings: titled sections, the intro's taps
 * happen on their own, then the aligned layout goes down one block at a time while the camera
 * orbits, void decks open, and the plot clears.
 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let captionEl: HTMLElement | null = null;
/** Big section title at the top of the screen; empty text hides it. */
export function caption(n: number | null, title: string, sub = ""): void {
  if (!captionEl) {
    captionEl = document.createElement("div");
    captionEl.className = "demo-caption";
    document.getElementById("ui")?.append(captionEl);
  }
  if (!title) { captionEl.classList.remove("on"); return; }
  captionEl.innerHTML = `${n !== null ? `<i>${n}</i>` : ""}<div><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ""}</div>`;
  captionEl.classList.remove("on");
  void captionEl.offsetWidth;
  captionEl.classList.add("on");
}

export async function runDemo(s: LevelSession, map: MlMap): Promise<void> {
  await s.overlay.ready;
  fill(s, "aligned");
  const plan = s.blocks.blocks.map((b) => ({ type: b.type, at: b.center, rot: b.rotDeg, height: b.height }));
  s.blocks.clearAll();
  s.select(null);
  const c = centre(s);
  caption(3, "Now a planner\u2019s layout", "rows along the wind, gaps between them");
  map.easeTo({ center: c, zoom: s.level.camera.zoom + 0.2, pitch: 60, bearing: map.getBearing() + 60, duration: 1200 + plan.length * 900, easing: (t) => t, essential: true });
  await sleep(1200);
  for (const p of plan) {
    const r = s.blocks.place(p.type, p.at, p.rot);
    if (r.ok) { s.blocks.setHeight(r.block.id, p.height); s.select(r.block.id); }
    await sleep(900);
  }
  s.select(null);
  await sleep(2500);
  caption(4, "Open the void decks", "the breeze passes underneath, where people walk");
  for (const b of s.blocks.blocks) {
    if (b.voidDeck || b.type === "mscp") continue;
    s.select(b.id);
    await sleep(350);
    s.blocks.toggleVoid(b.id);
    await sleep(450);
  }
  s.select(null);
  await sleep(6000);
  const st = s.scoring.state;
  caption(5, `${Math.max(0, Math.round(st.breath))}% breathable`, `${st.homes.toLocaleString()} people housed on the same plot`);
  map.easeTo({ center: c, pitch: 55, bearing: map.getBearing() + 40, duration: 12_000, easing: (t) => t, essential: true });
  await sleep(6000);
  caption(null, "");
}

function centre(s: LevelSession): [number, number] {
  let x = 0, y = 0;
  for (const p of s.level.site) { x += p[0]; y += p[1]; }
  return [x / s.level.site.length, y / s.level.site.length];
}
