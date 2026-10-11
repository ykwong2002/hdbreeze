import type { MapMouseEvent, MapGeoJSONFeature } from "maplibre-gl";
import type { HdbMap } from "../map/map";
import { createAgentsLayer } from "../map/agents-layer";
import { addLevelLayers, LEVEL_PLOTS_FILL, removeLevelLayers } from "../map/buildings";
import { createWindOverlay, type WindOverlay } from "../map/overlay-layer";
import { ensurePlacedLayer, removePlacedLayer, updatePlacedLayer } from "../map/placed";
import { FIRST_LABEL_LAYER } from "../map/style";
import type { SolverKind } from "../sim/solver";
import type { BuildingGeom } from "../sim/obstacles";
import { Agents, type Agent } from "./agents";
import type { BakedLevel, LonLat, Season } from "./level-types";
import { pickLine, tierFor, type Tier } from "./lines";
import { Placement } from "./placement";
import { Scoring, type ScoreState } from "./scoring";

export interface Speech {
  agent: Agent;
  text: string;
  tier: Tier;
  lonLat: () => LonLat;
}

export interface LevelSession {
  level: BakedLevel;
  overlay: WindOverlay;
  placement: Placement;
  scoring: Scoring;
  agents: Agents | null;
  season: Season;
  selectedPlot: string | null;
  setSeason(id: string): void;
  nextSeason(): Season;
  /** Selects a plot and places/moves its block at `at` (defaults to the plot centroid). */
  selectPlot(id: string, at?: LonLat): void;
  deselect(): void;
  onPlotSelected(cb: (id: string | null) => void): void;
  onScore(cb: (s: ScoreState) => void): void;
  onSpeech(cb: (s: Speech) => void): void;
  onCleared(cb: () => void): void;
  dispose(): void;
}

const OVERLAY_ID = "wind-overlay";
const AGENTS_ID = "residents";

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
  map.flyTo({ center: centroidOf(level.scoreZone), zoom: level.camera.zoom, pitch: level.camera.pitch, bearing: level.camera.bearing, duration: 2200, essential: true });
  map.setMaxBounds(undefined);

  addLevelLayers(map, level);
  ensurePlacedLayer(map);
  const overlay = createWindOverlay(OVERLAY_ID, { n: level.grid, bbox: level.bbox, solver }, level);
  map.addLayer(overlay.layer, LEVEL_PLOTS_FILL);

  const placement = new Placement(level);
  const scoring = new Scoring(level.targets.homes, level.targets.satisfaction, level.targets.holdSeconds);
  let agents: Agents | null = null;
  const scoreListeners: Array<(s: ScoreState) => void> = [];
  const speechListeners: Array<(s: Speech) => void> = [];
  const clearedListeners: Array<() => void> = [];

  const pushPlaced = (): void => {
    const geoms = placement.geometries();
    updatePlacedLayer(map, geoms);
    overlay.ready
      .then((sim) => {
        const b: BuildingGeom[] = [];
        const voidRings: [number, number][][] = [];
        for (const g of geoms) {
          for (const ring of g.obstacleRings) {
            const cells = ring.map((p) => sim.toCell(p[0], p[1]));
            b.push({ ring: cells, heightM: g.heightM, sigma: g.sigma });
            if (g.sigma < 0.5 && g.columns.length) voidRings.push(cells);
          }
        }
        sim.setPlacedBuildings(b);
        agents?.setVoidDecks(voidRings, 70 / sim.metresPerCell);
      })
      .catch(() => {});
  };
  placement.onChange(pushPlaced);

  // residents, scoring and speech run on their own frame loop once the sim exists
  let raf = 0;
  let last = performance.now();
  let nextSpeech = performance.now() + 2500;
  let lastLine = "";
  let clearedFired = false;
  overlay.ready
    .then((sim) => {
      agents = new Agents(level, (lon, lat) => sim.toCell(lon, lat), sim.metresPerCell, 40);
      const ag = agents;
      map.addLayer(createAgentsLayer(AGENTS_ID, level.bbox, level.grid, () => ag.agents).layer, FIRST_LABEL_LAYER);
      const loop = (): void => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const { meanComfort, meanFeels } = ag.update(dt, (x, y) => sim.readback.sample(x, y, sim.n), sim.vis.tMax);
        const state = scoring.update(dt, meanComfort, meanFeels, placement.totalHomes());
        for (const cb of scoreListeners) cb(state);
        if (state.cleared && !clearedFired) {
          clearedFired = true;
          for (const cb of clearedListeners) cb();
        }
        if (now >= nextSpeech && ag.agents.length && sim.readback.ready) {
          nextSpeech = now + 1000 + Math.random() * 1000;
          const a = ag.agents[Math.floor(Math.random() * ag.agents.length)]!;
          const tier = tierFor(a.comfort);
          const text = pickLine(tier, lastLine);
          lastLine = text;
          const speech: Speech = { agent: a, text, tier, lonLat: () => sim.toLonLat(a.x, a.y) };
          for (const cb of speechListeners) cb(speech);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })
    .catch((e: unknown) => console.error("[hdbreeze] sim failed", e));

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
    const plot = level.areas.find((p) => p.id === pid);
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

  return {
    level,
    overlay,
    placement,
    scoring,
    get agents() {
      return agents;
    },
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
    onPlotSelected: (cb) => { selectListeners.push(cb); },
    onScore: (cb) => { scoreListeners.push(cb); },
    onSpeech: (cb) => { speechListeners.push(cb); },
    onCleared: (cb) => { clearedListeners.push(cb); },
    dispose() {
      cancelAnimationFrame(raf);
      map.off("click", LEVEL_PLOTS_FILL, onPlotClick);
      if (map.getLayer(AGENTS_ID)) map.removeLayer(AGENTS_ID);
      if (map.getLayer(OVERLAY_ID)) map.removeLayer(OVERLAY_ID);
      removePlacedLayer(map);
      removeLevelLayers(map);
    },
  };
}
