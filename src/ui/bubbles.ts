import type { Map as MlMap } from "maplibre-gl";
import type { Tier } from "../game/lines";

/**
 * Resident comments in a fixed strip under the score card, out of the play area,
 * with a small dot on the map marking who said it. One comment at a time, held for a few seconds.
 */
export interface Bubbles {
  say(lonLat: [number, number], text: string, tier: Tier, follow: () => [number, number] | null): void;
  unmount(): void;
}

export function mountBubbles(root: HTMLElement, map: MlMap): Bubbles {
  const strip = document.createElement("div");
  strip.className = "comment";
  strip.hidden = true;
  strip.innerHTML = `<span class="comment-who"></span><span class="comment-text"></span>`;
  const place = (): void => { const card = document.querySelector(".score"); if (card) strip.style.top = `${card.getBoundingClientRect().bottom + 8}px`; };
  root.append(strip);
  const dot = document.createElement("div");
  dot.className = "comment-dot";
  dot.hidden = true;
  root.append(dot);
  const who = strip.querySelector<HTMLElement>(".comment-who")!;
  const textEl = strip.querySelector<HTMLElement>(".comment-text")!;
  let follow: (() => [number, number] | null) | null = null;
  let until = 0;
  const tick = (): void => {
    if (!strip.hidden && follow) {
      const ll = follow();
      if (!ll || performance.now() > until) {
        strip.hidden = true;
        dot.hidden = true;
        follow = null;
      } else {
        const p = map.project(ll);
        const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
        const onScreen = p.x > 0 && p.y > 0 && p.x < w && p.y < h;
        dot.hidden = !onScreen;
        dot.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  const label: Record<Tier, string> = { miserable: "😓", warm: "😐", pleasant: "😊", cold: "🥶" };
  return {
    say(_ll, text, tier, f) {
      place();
      who.textContent = label[tier];
      textEl.textContent = text;
      strip.dataset.tier = tier;
      strip.hidden = false;
      dot.dataset.tier = tier;
      follow = f;
      until = performance.now() + 5200;
    },
    unmount() {
      cancelAnimationFrame(raf);
      strip.remove();
      dot.remove();
    },
  };
}
