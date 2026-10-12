import type { Map as MlMap } from "maplibre-gl";
import { FIRST_LABEL_LAYER } from "./style";
import type { BakedLevel } from "../game/level-types";

/** Level geometry as MapLibre layers. The tile buildings are hidden while a level is active. */
export const LEVEL_PLOTS_FILL = "level-areas-fill";
export const LEVEL_DISTRICT_LINE = "level-district-line";
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
  map.addSource("level-district", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: titleCase(level.subzone) }, geometry: { type: "Polygon", coordinates: [level.district] } },
      ],
    },
  });
  map.addSource("level-plots", {
    type: "geojson",
    promoteId: "id",
    data: {
      type: "FeatureCollection",
      features: [{ id: "site", label: "Site", polygon: level.site, areaM2: 0 }].map((p) => ({
        type: "Feature",
        properties: { id: p.id, label: p.label },
        geometry: { type: "Polygon", coordinates: [p.polygon] },
      })),
    },
  });

  map.addLayer(
    {
      id: LEVEL_DISTRICT_LINE,
      type: "line",
      source: "level-district",
      paint: { "line-color": "#1f1c17", "line-width": 2, "line-dasharray": [3, 2], "line-opacity": 0.55 },
    },
    FIRST_LABEL_LAYER,
  );
  map.addLayer(
    {
      id: "level-district-label",
      type: "symbol",
      source: "level-district",
      layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 13, "text-letter-spacing": 0.15, "text-transform": "uppercase", "text-offset": [0, -0.9] },
      paint: { "text-color": "#1f1c17", "text-halo-color": "#f4f2ed", "text-halo-width": 1.5, "text-opacity": 0.8 },
    },
  );
  map.addLayer(
    {
      id: LEVEL_PLOTS_FILL,
      type: "fill",
      source: "level-plots",
      paint: { "fill-color": "#2a9d9f", "fill-opacity": 0.22, "fill-opacity-transition": { duration: 900 } },
    },
    FIRST_LABEL_LAYER,
  );
  map.addLayer(
    {
      id: "level-plots-line",
      type: "line",
      source: "level-plots",
      paint: { "line-color": "#1d7f81", "line-width": 2.5, "line-dasharray": [2, 1.2] },
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
  for (const id of [LEVEL_BUILDINGS, "level-plots-line", LEVEL_PLOTS_FILL, "level-district-label", LEVEL_DISTRICT_LINE]) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ["level-buildings", "level-plots", "level-district"]) if (map.getSource(id)) map.removeSource(id);
  for (const id of TILE_BUILDING_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
