import type { Map as MlMap } from "maplibre-gl";
import { FIRST_LABEL_LAYER } from "./style";
import type { BakedLevel } from "../game/level-types";

/** Level geometry as MapLibre layers. The tile buildings are hidden while a level is active. */
export const LEVEL_PLOTS_FILL = "level-plots-fill";
export const LEVEL_BUILDINGS = "level-buildings-3d";
const TILE_BUILDING_LAYERS = ["buildings-2d", "buildings-3d"];

export function addLevelLayers(map: MlMap, level: BakedLevel): void {
  for (const id of TILE_BUILDING_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");

  map.addSource("level-buildings", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: level.buildings.map((b, i) => ({
        type: "Feature",
        id: i,
        properties: { h: b.h, src: b.src, blk: b.blk ?? "" },
        geometry: { type: "Polygon", coordinates: [b.fp] },
      })),
    },
  });
  map.addSource("level-plots", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: level.plots.map((p) => ({
        type: "Feature",
        properties: { id: p.id, label: p.label },
        geometry: { type: "Polygon", coordinates: [p.polygon] },
      })),
    },
  });

  map.addLayer(
    {
      id: LEVEL_PLOTS_FILL,
      type: "fill",
      source: "level-plots",
      paint: { "fill-color": "#2a9d9f", "fill-opacity": 0.18 },
    },
    FIRST_LABEL_LAYER,
  );
  map.addLayer(
    {
      id: "level-plots-line",
      type: "line",
      source: "level-plots",
      paint: { "line-color": "#1d7f81", "line-width": 2, "line-dasharray": [2, 1.5] },
    },
    FIRST_LABEL_LAYER,
  );
  map.addLayer(
    {
      id: LEVEL_BUILDINGS,
      type: "fill-extrusion",
      source: "level-buildings",
      paint: {
        "fill-extrusion-color": ["match", ["get", "src"], "hdb", "#f2efe9", "#e2ded7"],
        "fill-extrusion-height": ["get", "h"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    FIRST_LABEL_LAYER,
  );
}

export function removeLevelLayers(map: MlMap): void {
  for (const id of [LEVEL_BUILDINGS, "level-plots-line", LEVEL_PLOTS_FILL]) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ["level-buildings", "level-plots"]) if (map.getSource(id)) map.removeSource(id);
  for (const id of TILE_BUILDING_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
}
