import type { Map as MlMap } from "maplibre-gl";
import type { TownData } from "../game/level-types";
import type { Progress } from "../game/progress";
import { FIRST_LABEL_LAYER } from "../map/style";

/** Town overview: plots drawn and numbered on the map, a card listing them with stars and locks. */
export function mountTown(root: HTMLElement, map: MlMap, town: TownData, progress: Progress, onPick: (levelId: string) => void, onBack: () => void): { refresh(): void; unmount(): void } {
  const ids = town.plots.map((p) => p.id);
  map.addSource("town-plots", {
    type: "geojson",
    data: { type: "FeatureCollection", features: town.plots.map((p) => ({ type: "Feature", id: p.n, properties: { n: String(p.n), id: p.id, unlocked: progress.unlocked(ids, p.n) }, geometry: { type: "Polygon", coordinates: [p.polygon] } })) },
  });
  map.addSource("town-outline", { type: "geojson", data: { type: "Feature", properties: { name: town.name }, geometry: { type: "Polygon", coordinates: [town.outline] } } });
  map.addLayer({ id: "town-outline-line", type: "line", source: "town-outline", paint: { "line-color": "#1f1c17", "line-width": 2, "line-dasharray": [3, 2], "line-opacity": 0.5 } }, FIRST_LABEL_LAYER);
  map.addLayer({ id: "town-plots-fill", type: "fill", source: "town-plots", paint: { "fill-color": ["case", ["get", "unlocked"], "#2a9d9f", "#9a948a"], "fill-opacity": 0.35 } }, FIRST_LABEL_LAYER);
  map.addLayer({ id: "town-plots-line", type: "line", source: "town-plots", paint: { "line-color": ["case", ["get", "unlocked"], "#1d7f81", "#6f6a62"], "line-width": 2.5 } }, FIRST_LABEL_LAYER);
  map.addLayer({ id: "town-plots-label", type: "symbol", source: "town-plots", layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Regular"], "text-size": 22, "text-allow-overlap": true }, paint: { "text-color": "#fff", "text-halo-color": ["case", ["get", "unlocked"], "#1d7f81", "#6f6a62"], "text-halo-width": 2.5 } });

  const lons = town.plots.flatMap((p) => p.polygon.map((q) => q[0])), lats = town.plots.flatMap((p) => p.polygon.map((q) => q[1]));
  map.setMaxBounds(undefined);
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 90, bottom: 250, left: 30, right: 30 }, pitch: 40, bearing: 0, duration: 2200, essential: true });

  const card = document.createElement("section");
  card.className = "townview";
  root.append(card);
  const render = (): void => {
    const total = progress.stars(ids);
    card.innerHTML = `
      <div class="townview-head"><button class="chip tv-back">← Towns</button><div><strong>${town.name}</strong><small>${town.plots.length} plots · ${total} / ${ids.length * 3} ★</small></div></div>
      <div class="tv-list">${town.plots.map((p) => {
        const r = progress.get(p.id);
        const unlocked = progress.unlocked(ids, p.n);
        const stars = r ? "★".repeat(r.stars) + "☆".repeat(3 - r.stars) : unlocked ? "☆☆☆" : "🔒";
        return `<button class="tv-plot${unlocked ? "" : " locked"}" data-id="${p.id}" ${unlocked ? "" : "disabled"}>
          <span class="tv-n">${p.n}</span>
          <span class="tv-body"><strong>${p.label}</strong><small>${(p.areaM2 / 10_000).toFixed(1)} ha · plot ratio ${p.gpr} · ${p.blocks} blocks${p.seasons.length > 1 ? " · both monsoons" : ""}${p.hotspots ? " · neighbour spot" : ""}</small></span>
          <span class="tv-stars">${stars}</span></button>`;
      }).join("")}</div>
      <p class="tv-hint">${progress.townCleared(ids) ? "Town cleared. Replay any plot for more stars." : "Clear each plot to unlock the next."}</p>`;
    card.querySelector<HTMLButtonElement>(".tv-back")!.onclick = onBack;
    card.querySelectorAll<HTMLButtonElement>(".tv-plot").forEach((b) => { b.onclick = () => onPick(b.dataset.id!); });
    const src = map.getSource("town-plots") as { setData(d: unknown): void } | undefined;
    src?.setData({ type: "FeatureCollection", features: town.plots.map((p) => ({ type: "Feature", id: p.n, properties: { n: String(p.n), id: p.id, unlocked: progress.unlocked(ids, p.n) }, geometry: { type: "Polygon", coordinates: [p.polygon] } })) });
  };
  render();
  const onClick = (e: { point: { x: number; y: number } }): void => {
    const hit = map.queryRenderedFeatures(e.point as never, { layers: ["town-plots-fill"] })[0];
    const id = hit?.properties?.id as string | undefined;
    if (id && (hit?.properties?.unlocked as boolean)) onPick(id);
  };
  map.on("click", onClick);
  return {
    refresh: render,
    unmount() {
      map.off("click", onClick);
      card.remove();
      for (const id of ["town-plots-label", "town-plots-line", "town-plots-fill", "town-outline-line"]) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of ["town-plots", "town-outline"]) if (map.getSource(id)) map.removeSource(id);
    },
  };
}
