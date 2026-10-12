import type { Map as MlMap } from "maplibre-gl";
import { FIRST_LABEL_LAYER } from "./style";
import { localToLonLat } from "../game/blocks";
import { typology, type TypologyId } from "../game/typologies";
import type { LonLat } from "../game/level-types";

/** Footprint preview while dragging: teal when the drop is allowed, red when not. */
const SRC = "level-ghost";
const LAYER = "level-ghost-fill";

export function ensureGhostLayer(map: MlMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer(
    {
      id: LAYER,
      type: "fill",
      source: SRC,
      paint: { "fill-color": ["case", ["boolean", ["get", "ok"], true], "#2a9d9f", "#d9382a"], "fill-opacity": 0.55, "fill-outline-color": "#ffffff" },
    },
    FIRST_LABEL_LAYER,
  );
}

export function showGhost(map: MlMap, type: TypologyId, center: LonLat, rotDeg: number, ok: boolean): void {
  const src = map.getSource(SRC) as { setData(d: unknown): void } | undefined;
  if (!src) return;
  const t = typology(type);
  src.setData({
    type: "FeatureCollection",
    features: t.parts.map((part) => ({ type: "Feature", properties: { ok }, geometry: { type: "Polygon", coordinates: [localToLonLat(center, part, rotDeg)] } })),
  });
}

export function hideGhost(map: MlMap): void {
  const src = map.getSource(SRC) as { setData(d: unknown): void } | undefined;
  src?.setData({ type: "FeatureCollection", features: [] });
}

export function removeGhostLayer(map: MlMap): void {
  if (map.getLayer(LAYER)) map.removeLayer(LAYER);
  if (map.getSource(SRC)) map.removeSource(SRC);
}
