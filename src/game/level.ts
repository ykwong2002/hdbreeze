import type { HdbMap } from "../map/map";
import { addLevelLayers, LEVEL_PLOTS_FILL, removeLevelLayers } from "../map/buildings";
import { createWindOverlay, type WindOverlay } from "../map/overlay-layer";
import type { SolverKind } from "../sim/solver";
import type { BakedLevel, Season } from "./level-types";

export interface LevelSession {
  level: BakedLevel;
  overlay: WindOverlay;
  season: Season;
  setSeason(id: string): void;
  nextSeason(): Season;
  dispose(): void;
}

const OVERLAY_ID = "wind-overlay";

export async function loadLevelData(id: string): Promise<BakedLevel> {
  const r = await fetch(`${import.meta.env.BASE_URL}levels/${id}.json`);
  if (!r.ok) throw new Error(`level ${id}: HTTP ${r.status}`);
  return (await r.json()) as BakedLevel;
}

export async function startLevel(hdb: HdbMap, id: string, solver: SolverKind): Promise<LevelSession> {
  const level = await loadLevelData(id);
  const map = hdb.map;
  map.flyTo({ center: level.area.center, zoom: level.camera.zoom, pitch: level.camera.pitch, bearing: level.camera.bearing, duration: 2200, essential: true });
  map.setMaxBounds(undefined);

  addLevelLayers(map, level);
  const overlay = createWindOverlay(OVERLAY_ID, { n: level.grid, bbox: level.bbox, solver }, level);
  map.addLayer(overlay.layer, LEVEL_PLOTS_FILL);

  let season = level.wind.seasons[0]!;
  const applySeason = (): void => {
    overlay.ready.then((sim) => sim.setWind(season.fromDeg, season.speed)).catch(() => {});
  };
  applySeason();

  return {
    level,
    overlay,
    get season() {
      return season;
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
    dispose() {
      if (map.getLayer(OVERLAY_ID)) map.removeLayer(OVERLAY_ID);
      removeLevelLayers(map);
    },
  };
}
