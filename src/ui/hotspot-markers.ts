import type { Map as MlMap } from "maplibre-gl";
import type { HotSpot } from "../game/hotspots";
import { ICON } from "./icons";

const iconFor = (_label: string): string => ICON.pin;

/** Red pulsing markers on the hot spots with their live felt temperature; teal once cooled. */
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
      el.querySelector(".hs-temp")!.textContent = `${s.feels.toFixed(1)}°`;
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
        el.title = `${s.label}: cool it below ${s.targetC} °C`;
        el.innerHTML = `<span class="hs-ring"></span><span class="hs-label">${iconFor(s.label)}<b class="hs-temp"></b><i class="hs-target">/ ${s.targetC}°</i></span>`;
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
