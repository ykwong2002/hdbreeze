import type { Map as MlMap } from "maplibre-gl";
import type { Tier } from "../game/lines";

/** One speech bubble at a time, anchored to a resident through map.project. */
export interface Bubbles {
  say(lonLat: [number, number], text: string, tier: Tier, follow: () => [number, number] | null): void;
  unmount(): void;
}

export function mountBubbles(root: HTMLElement, map: MlMap, headOffsetPx = 26): Bubbles {
  const el = document.createElement("div");
  el.className = "bubble";
  el.hidden = true;
  root.append(el);
  let follow: (() => [number, number] | null) | null = null;
  let until = 0;
  const tick = (): void => {
    if (!el.hidden && follow) {
      const ll = follow();
      if (!ll || performance.now() > until) {
        el.hidden = true;
        follow = null;
      } else {
        const p = map.project(ll);
        const w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
        const onScreen = p.x > 0 && p.y > 0 && p.x < w && p.y < h;
        const half = el.offsetWidth / 2 + 6;
        const x = Math.max(half, Math.min(w - half, p.x));
        el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${(p.y - headOffsetPx).toFixed(1)}px)`;
        el.style.visibility = onScreen ? "visible" : "hidden";
      }
    }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  return {
    say(_ll, text, tier, f) {
      el.textContent = text;
      el.dataset.tier = tier;
      el.hidden = false;
      follow = f;
      until = performance.now() + 2600;
    },
    unmount() {
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
