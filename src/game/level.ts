import type { MapMouseEvent, MapGeoJSONFeature } from "maplibre-gl";
import type { HdbMap } from "../map/map";
import { addLevelLayers, LEVEL_PLOTS_FILL, removeLevelLayers } from "../map/buildings";
import { createWindOverlay, type WindOverlay } from "../map/overlay-layer";
import { ensurePlacedLayer, removePlacedLayer, updatePlacedLayer } from "../map/placed";
import type { SolverKind } from "../sim/solver";
import type { BuildingGeom } from "../sim/obstacles";
import type { BakedLevel, LonLat, Season } from "./level-types";
import { Placement } from "./placement";

export interface LevelSession {
  level: BakedLevel;
  overlay: WindOverlay;
  placement: Placement;
  season: Season;
  selectedPlot: string | null;
  setSeason(id: string): void;
  nextSeason(): Season;
  /** Selects a plot and places/moves its block at `at` (defaults to the plot centroid). */
  selectPlot(id: string, at?: LonLat): void;
  deselect(): void;
  onPlotSelected(cb: (id: string | null) => void): void;
  dispose(): void;
}

const OVERLAY_ID = "wind-overlay";

export async function loadLevelData(id: string): Promise<BakedLevel> {
  const r = await fetch(`${import.meta.env.BASE_URL}levels/${id}.json`);
  if (!r.ok) throw new Error(`level ${id}: HTTP ${r.status}`);
  return (await r.json()) as BakedLevel;
}

function centroidOf(ring: LonLat[]): LonLat {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

export async function startLevel(hdb: HdbMap, id: string, solver: SolverKind): Promise<LevelSession> {
  const level = await loadLevelData(id);
  const map = hdb.map;
  map.flyTo({ center: level.area.center, zoom: level.camera.zoom, pitch: level.camera.pitch, bearing: level.camera.bearing, duration: 2200, essential: true });
  map.setMaxBounds(undefined);

  addLevelLayers(map, level);
  ensurePlacedLayer(map);
  const overlay = createWindOverlay(OVERLAY_ID, { n: level.grid, bbox: level.bbox, solver }, level);
  map.addLayer(overlay.layer, LEVEL_PLOTS_FILL);

  const placement = new Placement(level);
  const pushPlaced = (): void => {
    const geoms = placement.geometries();
    updatePlacedLayer(map, geoms);
    overlay.ready
      .then((sim) => {
        const b: BuildingGeom[] = [];
        for (const g of geoms) for (const ring of g.obstacleRings) b.push({ ring: ring.map((p) => sim.toCell(p[0], p[1])), heightM: g.heightM, sigma: g.sigma });
        sim.setPlacedBuildings(b);
      })
      .catch(() => {});
  };
  placement.onChange(pushPlaced);

  let season = level.wind.seasons[0]!;
  const applySeason = (): void => {
    overlay.ready.then((sim) => sim.setWind(season.fromDeg, season.speed)).catch(() => {});
  };
  applySeason();

  let selected: string | null = null;
  const selectListeners: Array<(id: string | null) => void> = [];
  const setSelected = (idOrNull: string | null): void => {
    if (selected) map.setFeatureState({ source: "level-plots", id: selected }, { selected: false });
    selected = idOrNull;
    if (selected) map.setFeatureState({ source: "level-plots", id: selected }, { selected: true });
    for (const cb of selectListeners) cb(selected);
  };
  const selectPlot = (pid: string, at?: LonLat): void => {
    const plot = level.plots.find((p) => p.id === pid);
    if (!plot) return;
    placement.placeOrMove(pid, at ?? centroidOf(plot.polygon));
    setSelected(pid);
  };
  const onPlotClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }): void => {
    const f = e.features?.[0];
    const pid = f?.properties?.id as string | undefined;
    if (!pid) return;
    selectPlot(pid, [e.lngLat.lng, e.lngLat.lat]);
  };
  map.on("click", LEVEL_PLOTS_FILL, onPlotClick);
  map.on("touchend", LEVEL_PLOTS_FILL, () => {});

  return {
    level,
    overlay,
    placement,
    get season() {
      return season;
    },
    get selectedPlot() {
      return selected;
    },
    setSeason(sid) {
      const s = level.wind.seasons.find((x) => x.id === sid);
      if (!s) return;
      season = s;
      applySeason();
    },
    nextSeason() {
      const i = level.wind.seasons.findIndex((x) => x.id === season.id);
      season = level.wind.seasons[(i + 1) % level.wind.seasons.length]!;
      applySeason();
      return season;
    },
    selectPlot,
    deselect: () => setSelected(null),
    onPlotSelected: (cb) => {
      selectListeners.push(cb);
    },
    dispose() {
      map.off("click", LEVEL_PLOTS_FILL, onPlotClick);
      if (map.getLayer(OVERLAY_ID)) map.removeLayer(OVERLAY_ID);
      removePlacedLayer(map);
      removeLevelLayers(map);
    },
  };
}
