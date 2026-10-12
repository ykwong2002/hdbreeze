import type { Map as MlMap } from "maplibre-gl";
import type { HotSpot } from "../game/hotspots";

/** Red pulsing markers on the wind-starved pockets; they turn teal once cooled. */
export function mountHotSpotMarkers(root: HTMLElement, map: MlMap, toLonLat: (x: number, y: number) => [number, number]): { set(spots: HotSpot[]): void; unmount(): void } {
  const els: HTMLElement[] = [];
  let spots: HotSpot[] = [];
  const tick = (): void => {
    spots.forEach((s, i) => {
      const el = els[i];
      if (!el) return;
      const p = map.project(toLonLat(s.x, s.y));
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle("cooled", s.cooled);
      el.querySelector(".hs-temp")!.textContent = `${s.feels.toFixed(0)}°`;
    });
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  return {
    set(next) {
      for (const el of els) el.remove();
      els.length = 0;
      spots = next;
      for (const s of spots) {
        const el = document.createElement("div");
        el.className = "hotspot";
        el.innerHTML = `<span class="hs-ring"></span><span class="hs-label">hot spot ${s.id}<b class="hs-temp"></b></span>`;
        root.append(el);
        els.push(el);
      }
    },
    unmount() {
      cancelAnimationFrame(raf);
      for (const el of els) el.remove();
    },
  };
}
