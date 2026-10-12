import type { Map as MlMap } from "maplibre-gl";

/**
 * Idle camera tour for the title and town-pick screens: fly into a town at street level, drift
 * across its blocks while slowly turning, hop to the next. Stops as soon as the player touches
 * the map or picks a town.
 */
const STOPS: { name: string; at: [number, number] }[] = [
  { name: "Toa Payoh", at: [103.8475, 1.3325] },
  { name: "Punggol", at: [103.9035, 1.4045] },
  { name: "Tiong Bahru", at: [103.8305, 1.2865] },
  { name: "Ang Mo Kio", at: [103.8455, 1.3705] },
  { name: "Tengah", at: [103.7375, 1.3645] },
  { name: "Bishan", at: [103.8485, 1.3515] },
  { name: "Queenstown", at: [103.8055, 1.2945] },
  { name: "Tampines", at: [103.9445, 1.3535] },
];
const ZOOM = 15.3;
const PITCH = 62;
const HOP_MS = 5500;
const DRIFT_MS = 16_000;
const DRIFT_M = 450;

export function createTour(map: MlMap): { start(): void; stop(): void; running(): boolean } {
  let on = false;
  let i = Math.floor(Math.random() * STOPS.length);
  let bearing = 20;
  let timer = 0;
  const container = map.getContainer();

  const leg = (): void => {
    if (!on) return;
    const stop = STOPS[i % STOPS.length]!;
    i++;
    bearing = (bearing + 50) % 360;
    map.flyTo({ center: stop.at, zoom: ZOOM, pitch: PITCH, bearing, duration: HOP_MS, essential: true, curve: 1.3 });
    timer = window.setTimeout(() => {
      if (!on) return;
      // drift sideways across the town while turning a little
      const rad = ((bearing + 90) * Math.PI) / 180;
      const mLon = 111_320 * Math.cos((stop.at[1] * Math.PI) / 180);
      const to: [number, number] = [stop.at[0] + (DRIFT_M * Math.sin(rad)) / mLon, stop.at[1] + (DRIFT_M * Math.cos(rad)) / 111_320];
      map.easeTo({ center: to, bearing: bearing + 25, zoom: ZOOM, pitch: PITCH, duration: DRIFT_MS, easing: (t) => t, essential: true });
      timer = window.setTimeout(leg, DRIFT_MS + 200);
    }, HOP_MS + 200);
  };
  const interrupt = (): void => { if (on) stop(); };
  const start = (): void => {
    if (on) return;
    on = true;
    container.addEventListener("pointerdown", interrupt, { capture: true });
    container.addEventListener("wheel", interrupt, { capture: true, passive: true });
    leg();
  };
  const stop = (): void => {
    if (!on) return;
    on = false;
    window.clearTimeout(timer);
    container.removeEventListener("pointerdown", interrupt, true);
    container.removeEventListener("wheel", interrupt, true);
    map.stop();
  };
  return { start, stop, running: () => on };
}
