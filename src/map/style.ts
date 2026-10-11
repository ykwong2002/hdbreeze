import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";

/**
 * HDBreeze's plain basemap style, generated for either tile schema so the same
 * look works on OpenFreeMap (OpenMapTiles schema) and on the self-hosted
 * Protomaps PMTiles fallback (Protomaps/Tilezen schema). See docs/plan.md 1.1.
 *
 * Pale ground, white roads, grey buildings, few labels: the wind field drawn
 * on top (from M1) is meant to be the most colourful thing on screen.
 */
export type TileSchema = "openmaptiles" | "protomaps";

export const BASEMAP_SOURCE = "basemap";
/** Insert ground overlays (wind field) before this layer so buildings occlude them. */
export const BUILDINGS_3D_LAYER = "buildings-3d";
/** Insert anything that should sit under labels before this layer. */
export const FIRST_LABEL_LAYER = "label-places";

const C = {
  ground: "#f4f2ed",
  water: "#cfe0ea",
  waterLine: "#c3d8e4",
  green: "#e1e8d6",
  sand: "#ece6d8",
  roadCasing: "#e1dcd3",
  road: "#ffffff",
  path: "#d9d3c8",
  rail: "#d5cfc5",
  building2d: "#e6e2db",
  building3d: "#ece9e3",
  label: "#7a7670",
  labelHalo: "#f4f2ed",
} as const;

const FONT = ["Noto Sans Regular"];

export interface StyleOptions {
  /** TileJSON URL for the OpenMapTiles schema source (OpenFreeMap). */
  tileJsonUrl?: string;
  /** PMTiles URL for the Protomaps schema source; `pmtiles://` prefix is added here. */
  pmtilesUrl?: string;
}

export function buildStyle(schema: TileSchema, opts: StyleOptions): StyleSpecification {
  const source: SourceSpecification =
    schema === "openmaptiles"
      ? { type: "vector", url: opts.tileJsonUrl ?? "https://tiles.openfreemap.org/planet" }
      : {
          type: "vector",
          url: `pmtiles://${opts.pmtilesUrl ?? ""}`,
          attribution:
            '<a href="https://protomaps.com" target="_blank">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        };

  return {
    version: 8,
    name: `hdbreeze-${schema}`,
    glyphs:
      schema === "openmaptiles"
        ? "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"
        : "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: { [BASEMAP_SOURCE]: source },
    layers: schema === "openmaptiles" ? openMapTilesLayers() : protomapsLayers(),
  };
}

/* ------------------------------------------------------------------ shared */

/** Road rank: 0 motorway/trunk, 1 primary/secondary, 2 tertiary/minor, 3 service. */
function roadWidth(rank: ExpressionSpecification, casing: boolean): ExpressionSpecification {
  const extra = casing ? 1.6 : 0;
  type W = [number, number, number, number];
  const at = (z10: W, z14: W, z18: W) =>
    ["interpolate", ["exponential", 1.4], ["zoom"],
      10, ["match", rank, 0, z10[0] + extra * 0.5, 1, z10[1] + extra * 0.5, 2, z10[2], z10[3]],
      14, ["match", rank, 0, z14[0] + extra, 1, z14[1] + extra, 2, z14[2] + extra, z14[3] + extra],
      18, ["match", rank, 0, z18[0] + extra, 1, z18[1] + extra, 2, z18[2] + extra, z18[3] + extra],
    ] as ExpressionSpecification;
  return at([1.6, 1.0, 0.4, 0], [6, 4, 2.4, 1.2], [26, 18, 12, 7]);
}

function roadLayers(
  sourceLayer: string,
  filter: ExpressionSpecification,
  rank: ExpressionSpecification,
): LayerSpecification[] {
  return [
    {
      id: "road-casing",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": sourceLayer,
      minzoom: 11,
      filter,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.roadCasing, "line-width": roadWidth(rank, true) },
    },
    {
      id: "road",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": sourceLayer,
      filter,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.road, "line-width": roadWidth(rank, false) },
    },
  ];
}

function buildingLayers(
  sourceLayer: string,
  filter: ExpressionSpecification | undefined,
  height: ExpressionSpecification,
  base: ExpressionSpecification,
): LayerSpecification[] {
  const common = { source: BASEMAP_SOURCE, "source-layer": sourceLayer, ...(filter ? { filter } : {}) };
  return [
    {
      id: "buildings-2d",
      type: "fill",
      ...common,
      minzoom: 12,
      maxzoom: 14,
      paint: { "fill-color": C.building2d, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 1] },
    },
    {
      id: BUILDINGS_3D_LAYER,
      type: "fill-extrusion",
      ...common,
      minzoom: 14,
      paint: {
        "fill-extrusion-color": C.building3d,
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.6, height],
        "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.6, base],
        "fill-extrusion-opacity": 0.92,
        "fill-extrusion-vertical-gradient": true,
      },
    },
  ];
}

function labelLayer(sourceLayer: string, filter: ExpressionSpecification): LayerSpecification {
  return {
    id: FIRST_LABEL_LAYER,
    type: "symbol",
    source: BASEMAP_SOURCE,
    "source-layer": sourceLayer,
    minzoom: 10,
    maxzoom: 15,
    filter,
    layout: {
      "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
      "text-font": FONT,
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 14, 13],
      "text-letter-spacing": 0.02,
      "text-max-width": 7,
      "text-padding": 6,
    },
    paint: {
      "text-color": C.label,
      "text-halo-color": C.labelHalo,
      "text-halo-width": 1.4,
    },
  };
}

/* -------------------------------------------------- OpenMapTiles schema */

function openMapTilesLayers(): LayerSpecification[] {
  const roadFilter: ExpressionSpecification = [
    "all",
    ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false],
    ["!=", ["get", "brunnel"], "tunnel"],
  ];
  const roadRank: ExpressionSpecification = [
    "match", ["get", "class"],
    ["motorway", "trunk"], 0,
    ["primary", "secondary"], 1,
    ["tertiary", "minor"], 2,
    3,
  ];
  return [
    { id: "background", type: "background", paint: { "background-color": C.ground } },
    {
      id: "landcover",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["wood", "grass", "wetland", "farmland"], true, false],
      paint: { "fill-color": C.green, "fill-antialias": false },
    },
    {
      id: "sand",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "sand"],
      paint: { "fill-color": C.sand, "fill-antialias": false },
    },
    {
      id: "park",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "park",
      paint: { "fill-color": C.green, "fill-antialias": false },
    },
    {
      id: "landuse-green",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["cemetery", "pitch", "playground", "garden", "golf_course", "stadium"], true, false],
      paint: { "fill-color": C.green, "fill-antialias": false },
    },
    {
      id: "water",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "water",
      paint: { "fill-color": C.water, "fill-antialias": false },
    },
    {
      id: "waterway",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": "waterway",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: {
        "line-color": C.waterLine,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 0.6, 16, 4],
      },
    },
    ...roadLayers("transportation", roadFilter, roadRank),
    {
      id: "path",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": "transportation",
      minzoom: 15,
      filter: ["==", ["get", "class"], "path"],
      paint: {
        "line-color": C.path,
        "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.8, 18, 2.2],
        "line-dasharray": [2, 1.5],
      },
    },
    {
      id: "rail",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": "transportation",
      minzoom: 11,
      filter: ["all", ["==", ["get", "class"], "rail"], ["!=", ["get", "brunnel"], "tunnel"]],
      paint: {
        "line-color": C.rail,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 2.5],
      },
    },
    ...buildingLayers(
      "building",
      undefined,
      ["coalesce", ["get", "render_height"], 6],
      ["coalesce", ["get", "render_min_height"], 0],
    ),
    labelLayer("place", [
      "match", ["get", "class"],
      ["town", "village", "suburb", "neighbourhood", "quarter"], true, false,
    ]),
  ];
}

/* ----------------------------------------------------- Protomaps schema */

function protomapsLayers(): LayerSpecification[] {
  const roadFilter: ExpressionSpecification = [
    "all",
    ["match", ["get", "kind"], ["highway", "major_road", "minor_road"], true, false],
    ["!", ["coalesce", ["get", "is_tunnel"], false]],
  ];
  const roadRank: ExpressionSpecification = [
    "match", ["get", "kind_detail"],
    ["motorway", "motorway_link", "trunk", "trunk_link"], 0,
    ["primary", "primary_link", "secondary", "secondary_link"], 1,
    ["tertiary", "tertiary_link", "residential", "unclassified", "road"], 2,
    3,
  ];
  return [
    { id: "background", type: "background", paint: { "background-color": C.ground } },
    {
      id: "earth",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "earth",
      paint: { "fill-color": C.ground, "fill-antialias": false },
    },
    {
      id: "landuse-green",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "landuse",
      filter: [
        "match", ["get", "kind"],
        ["park", "forest", "wood", "grass", "garden", "golf_course", "cemetery", "pitch", "playground", "nature_reserve",
          "national_park", "protected_area", "recreation_ground", "meadow", "scrub", "farmland", "orchard", "allotments", "wetland"],
        true, false,
      ],
      paint: { "fill-color": C.green, "fill-antialias": false },
    },
    {
      id: "sand",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "landuse",
      filter: ["match", ["get", "kind"], ["beach", "sand"], true, false],
      paint: { "fill-color": C.sand, "fill-antialias": false },
    },
    {
      id: "water",
      type: "fill",
      source: BASEMAP_SOURCE,
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": C.water, "fill-antialias": false },
    },
    {
      id: "waterway",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": C.waterLine,
        "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 0.6, 16, 4],
      },
    },
    ...roadLayers("roads", roadFilter, roadRank),
    {
      id: "path",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": "roads",
      minzoom: 15,
      filter: ["==", ["get", "kind"], "path"],
      paint: {
        "line-color": C.path,
        "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.8, 18, 2.2],
        "line-dasharray": [2, 1.5],
      },
    },
    {
      id: "rail",
      type: "line",
      source: BASEMAP_SOURCE,
      "source-layer": "roads",
      minzoom: 11,
      filter: ["all", ["==", ["get", "kind"], "rail"], ["!", ["coalesce", ["get", "is_tunnel"], false]]],
      paint: {
        "line-color": C.rail,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 2.5],
      },
    },
    ...buildingLayers(
      "buildings",
      ["!=", ["get", "kind"], "address"],
      ["coalesce", ["get", "height"], 6],
      ["coalesce", ["get", "min_height"], 0],
    ),
    labelLayer("places", [
      "all",
      ["match", ["get", "kind"], ["locality", "neighbourhood", "macrohood"], true, false],
      ["!=", ["get", "kind_detail"], "city"],
    ]),
  ];
}
