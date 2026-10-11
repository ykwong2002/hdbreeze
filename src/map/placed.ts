import type { Map as MlMap } from "maplibre-gl";
import { FIRST_LABEL_LAYER } from "./style";
import type { PlacedGeometry } from "../game/blocks";

/** The player's blocks as extrusions: bodies (raised when the void deck is on) plus columns. */
const SRC = "level-placed";
export const PLACED_LAYER = "level-placed-3d";

export function ensurePlacedLayer(map: MlMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer(
    {
      id: PLACED_LAYER,
      type: "fill-extrusion",
      source: SRC,
      paint: {
        "fill-extrusion-color": ["case", ["==", ["get", "part"], "column"], "#9fb3b0", ["boolean", ["get", "selected"], false], "#bfe3df", "#d9ece9"],
        "fill-extrusion-height": ["get", "h"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    FIRST_LABEL_LAYER,
  );
}

export function updatePlacedLayer(map: MlMap, geoms: PlacedGeometry[], selectedId: string | null): void {
  const src = map.getSource(SRC) as { setData(d: unknown): void } | undefined;
  if (!src) return;
  const features: unknown[] = [];
  for (const g of geoms) {
    const selected = g.blockId === selectedId;
    for (const b of g.bodies) features.push({ type: "Feature", properties: { part: "body", h: b.height, base: b.base, block: g.blockId, selected }, geometry: { type: "Polygon", coordinates: [b.ring] } });
    for (const c of g.columns) features.push({ type: "Feature", properties: { part: "column", h: 4.5, base: 0, block: g.blockId, selected }, geometry: { type: "Polygon", coordinates: [c] } });
  }
  src.setData({ type: "FeatureCollection", features });
}

export function removePlacedLayer(map: MlMap): void {
  if (map.getLayer(PLACED_LAYER)) map.removeLayer(PLACED_LAYER);
  if (map.getSource(SRC)) map.removeSource(SRC);
}
