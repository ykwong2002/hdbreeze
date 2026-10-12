import type { MapMouseEvent } from "maplibre-gl";
import type { HdbMap } from "../map/map";
import { createAgentsLayer } from "../map/agents-layer";
import { addLevelLayers, LEVEL_PLOTS_FILL, removeLevelLayers } from "../map/buildings";
import { createWindOverlay, type WindOverlay } from "../map/overlay-layer";
import { ensurePlacedLayer, PLACED_LAYER, removePlacedLayer, updatePlacedLayer } from "../map/placed";
import { removeGhostLayer } from "../map/ghost";
import { FIRST_LABEL_LAYER } from "../map/style";
import type { SolverKind } from "../sim/solver";
import type { BuildingGeom } from "../sim/obstacles";
import { Agents, type Agent } from "./agents";
import type { BakedLevel, HotSpotDef, LonLat, Season } from "./level-types";
import { pickLine, tierFor, type Tier } from "./lines";
import type { ResidentBrain } from "../lm/resident";
import { Blocks, type PlaceResult } from "./blocks";
import type { TypologyId } from "./typologies";
import { comfortFromFeels, feelsLikeC, Scoring, type ScoreState } from "./scoring";
import { makeHotSpots, updateHotSpots, type HotSpot } from "./hotspots";

export interface Speech {
  agent: Agent;
  text: string;
  tier: Tier;
  lonLat: () => LonLat;
}

export interface LevelSession {
  level: BakedLevel;
  overlay: WindOverlay;
  /** Authored wind-starved spots with live temperatures. */
  hotSpots: HotSpot[];
  onHotSpots(cb: (spots: HotSpot[]) => void): void;
  /** Dev: replace the spots at runtime (solver page). */
  setHotSpots(defs: HotSpotDef[]): void;
  /** Optional tiny language model for fresh resident lines. */
  brain: ResidentBrain | null;
  /** Instantaneous mean felt temperature over the sample walkways (null until the readback runs). */
  readonly lastFeels: number | null;
  /** Pauses residents, speech and clearing while the intro measures baselines. */
  intro: boolean;
  blocks: Blocks;
  scoring: Scoring;
  agents: Agents | null;
  season: Season;
  selectedBlock: string | null;
  /** What an area tap places next (set by the tray). */
  trayType: TypologyId | null;
  moveMode: () => boolean;
  setSeason(id: string): void;
  nextSeason(): Season;
  /** Routes a tap at lon/lat: block -> select, area -> place or move, else deselect. Returns what happened. */
  tap(at: LonLat, hitBlockId: string | null): "selected" | "placed" | "moved" | "deselected" | PlaceResult;
  select(id: string | null): void;
  onSelection(cb: (id: string | null) => void): void;
  onReject(cb: (reason: string) => void): void;
  /** Lets the gesture layer report a refused drop through the same channel as taps. */
  reject(reason: string): void;
  /** Ignore the click MapLibre fires after a drag or a two-finger gesture. */
  suppressNextClick(): void;
  onHint(cb: (text: string) => void): void;
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

  const blocks = new Blocks(level);
  const self2 = { brain: null as ResidentBrain | null };
  const scoring = new Scoring(level.targets.homes, level.passPct ?? 60, level.starPct ?? 75, level.targets.holdSeconds);
  scoring.required = level.wind.required;
  const hintListeners: Array<(text: string) => void> = [];
  let selected: string | null = null;
  const self = { trayType: null as TypologyId | null, moveMode: () => false };
  let agents: Agents | null = null;
  const scoreListeners: Array<(s: ScoreState) => void> = [];
  const speechListeners: Array<(s: Speech) => void> = [];
  const clearedListeners: Array<() => void> = [];

  const pushPlaced = (): void => {
    const geoms = blocks.geometries();
    updatePlacedLayer(map, geoms, selected);
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
        samplePtsDirty = true;
      })
      .catch(() => {});
  };
  blocks.onChange(pushPlaced);
  blocks.onChange(() => scoring.invalidateHolds());

  // residents, scoring and speech run on their own frame loop once the sim exists
  let raf = 0;
  let last = performance.now();
  let samplePts: [number, number][] | null = null;
  let samplePtsDirty = true;
  let hotSpots: HotSpot[] = [];
  const hotSpotListeners: Array<(spots: HotSpot[]) => void> = [];
  let simRef: Awaited<typeof overlay.ready> | null = null;
  let nextSpeech = performance.now() + 4000;
  let lastLine = "";
  let clearedFired = false;
  let lastFeels: number | null = null;
  const flags = { intro: false };
  overlay.ready
    .then((sim) => {
      agents = new Agents(level, (lon, lat) => sim.toCell(lon, lat), sim.metresPerCell, 40);
      const ag = agents;
      simRef = sim;
      hotSpots = makeHotSpots(level.hotspots, (lon, lat) => sim.toCell(lon, lat), sim.metresPerCell);
      for (const cb of hotSpotListeners) cb(hotSpots);
      map.addLayer(createAgentsLayer(AGENTS_ID, level.bbox, level.grid, () => ag.agents).layer, FIRST_LABEL_LAYER);
      const loop = (): void => {
        try { tick(); } catch (e) { console.error("[hdbreeze] frame loop", e); }
        raf = requestAnimationFrame(loop);
      };
      const tick = (): void => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!flags.intro) ag.update(dt, (x, y) => sim.readback.sample(x, y, sim.n), sim.vis.tMax);
        // satisfaction (flavour) from the walkways near the site; the authored hot spots gate the clear
        let meanComfort: number | null = null, meanFeels: number | null = null;
        let spotsState: { cooled: number; total: number; ok: boolean; margin: boolean } | undefined;
        if (sim.readback.ready) {
          if (!samplePts || samplePtsDirty) {
            samplePts = ag.samplePoints([]); // all walkways near the areas, plus void-deck hangouts
            samplePtsDirty = false;
          }
          let c = 0, f = 0, n = 0;
          for (const [x, y] of samplePts) {
            const T = sim.readback.sample(x, y, sim.n);
            if (T === null) continue;
            const feels = feelsLikeC(T, sim.vis.tMax);
            c += comfortFromFeels(feels); f += feels; n++;
          }
          if (n) { meanComfort = c / n; meanFeels = f / n; }
          lastFeels = meanFeels;
          const u = updateHotSpots(hotSpots, sim.readback, sim.n, sim.vis.tMax);
          spotsState = { cooled: hotSpots.filter((h) => h.cooled).length, total: hotSpots.length, ok: u.allCooled, margin: u.marginOk };
          if (u.meanFeels !== null) meanFeels = u.meanFeels;
        }
        const state = scoring.update(dt, meanComfort, meanFeels, blocks.homes(), blocks.blocks.length, blocks.total(), spotsState);
        for (const cb of scoreListeners) cb(state);
        if (state.cleared && !clearedFired && !flags.intro) {
          clearedFired = true;
          for (const cb of clearedListeners) cb();
        }
        if (now >= nextSpeech && ag.agents.length && sim.readback.ready && !flags.intro) {
          nextSpeech = now + 6500 + Math.random() * 3000; // one comment every 6-10 s, held in the strip
          const a = ag.agents[Math.floor(Math.random() * ag.agents.length)]!;
          const tier = tierFor(a.comfort);
          const emit = (text: string): void => {
            lastLine = text;
            for (const cb of speechListeners) cb({ agent: a, text, tier, lonLat: () => sim.toLonLat(a.x, a.y) });
          };
          // two in three lines come from the tiny model once it is loaded; the rest from the script
          const brain = self2.brain;
          if (brain?.ready && Math.random() < 0.67) {
            void brain.say(tier).then((t) => emit(t ?? pickLine(tier, lastLine)));
          } else emit(pickLine(tier, lastLine));
        }
      };
      raf = requestAnimationFrame(loop);
    })
    .catch((e: unknown) => console.error("[hdbreeze] sim failed", e));

  let season = level.wind.seasons.find((x) => x.id === level.wind.required[0]) ?? level.wind.seasons[0]!;
  const applySeason = (): void => {
    scoring.season = season.id;
    overlay.ready.then((sim) => sim.setWind(season.fromDeg, season.speed)).catch(() => {});
  };
  applySeason();
  scoring.onSeasonHeld = (held) => {
    const next = level.wind.required.find((r) => !scoring.state.held.includes(r));
    if (!next) return;
    const ns = level.wind.seasons.find((x) => x.id === next);
    if (!ns) return;
    season = ns;
    applySeason();
    for (const cb of hintListeners) cb(`Held it in the ${held.toUpperCase()} monsoon. The wind turned: now keep it breezy in the ${next.toUpperCase()} monsoon.`);
  };

  const selectListeners: Array<(id: string | null) => void> = [];
  const select = (idOrNull: string | null): void => {
    selected = idOrNull;
    pushPlaced();
    for (const cb of selectListeners) cb(selected);
  };
  const tap = (at: LonLat, hitBlockId: string | null): ReturnType<LevelSession["tap"]> => {
    if (flags.intro) return "deselected";
    if (hitBlockId && !(selected && self.moveMode())) {
      select(hitBlockId);
      return "selected";
    }
    const area = blocks.areaAt(at);
    if (area && selected && self.moveMode()) {
      const r = blocks.move(selected, at);
      return r.ok ? "moved" : r;
    }
    if (area && self.trayType) {
      const r = blocks.place(self.trayType, at);
      if (r.ok) select(r.block.id);
      return r.ok ? "placed" : r;
    }
    select(null);
    return "deselected";
  };
  let suppressClick = false;
  const onMapClick = (e: MapMouseEvent): void => {
    if (suppressClick) { suppressClick = false; return; }
    const hit = map.queryRenderedFeatures(e.point, { layers: [PLACED_LAYER] })[0];
    const id = (hit?.properties?.block as string | undefined) ?? null;
    const r = tap([e.lngLat.lng, e.lngLat.lat], id);
    if (typeof r === "object" && !r.ok) for (const cb of rejectListeners) cb(r.reason);
  };
  const rejectListeners: Array<(reason: string) => void> = [];
  map.on("click", onMapClick);
  // pulse the build areas while blocks remain, so "highlighted area" is obvious on a busy map
  let pulseOn = false;
  const pulse = window.setInterval(() => {
    if (!map.getLayer(LEVEL_PLOTS_FILL)) return;
    const remaining = !blocks.allPlaced();
    pulseOn = remaining && !pulseOn;
    map.setPaintProperty(LEVEL_PLOTS_FILL, "fill-opacity", remaining ? (pulseOn ? 0.42 : 0.18) : 0.14);
  }, 950);

  return {
    level,
    overlay,
    get hotSpots() {
      return hotSpots;
    },
    onHotSpots: (cb) => { hotSpotListeners.push(cb); if (hotSpots.length) cb(hotSpots); },
    setHotSpots(defs) {
      const sim = simRef;
      if (!sim) return;
      hotSpots = makeHotSpots(defs, (lon, lat) => sim.toCell(lon, lat), sim.metresPerCell);
      scoring.invalidateHolds();
      for (const cb of hotSpotListeners) cb(hotSpots);
    },
    get brain() {
      return self2.brain;
    },
    get lastFeels() {
      return lastFeels;
    },
    get intro() {
      return flags.intro;
    },
    set intro(v) {
      flags.intro = v;
    },
    set brain(b) {
      self2.brain = b;
    },
    blocks,
    scoring,
    get trayType() {
      return self.trayType;
    },
    set trayType(t) {
      self.trayType = t;
    },
    get moveMode() {
      return self.moveMode;
    },
    set moveMode(fn) {
      self.moveMode = fn;
    },
    get agents() {
      return agents;
    },
    get season() {
      return season;
    },
    get selectedBlock() {
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
    tap,
    select,
    onSelection: (cb) => { selectListeners.push(cb); },
    onReject: (cb) => { rejectListeners.push(cb); },
    reject: (reason) => { for (const cb of rejectListeners) cb(reason); },
    suppressNextClick: () => { suppressClick = true; window.setTimeout(() => { suppressClick = false; }, 400); },
    onHint: (cb) => { hintListeners.push(cb); },
    onScore: (cb) => { scoreListeners.push(cb); },
    onSpeech: (cb) => { speechListeners.push(cb); },
    onCleared: (cb) => { clearedListeners.push(cb); },
    dispose() {
      window.clearInterval(pulse);
      cancelAnimationFrame(raf);
      map.off("click", onMapClick);
      if (map.getLayer(AGENTS_ID)) map.removeLayer(AGENTS_ID);
      if (map.getLayer(OVERLAY_ID)) map.removeLayer(OVERLAY_ID);
      removeGhostLayer(map);
      removePlacedLayer(map);
      removeLevelLayers(map);
    },
  };
}
