import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { hasWebGL2, isDevMode } from "./capability";
import { createMap, SINGAPORE_VIEW, type HdbMap } from "./map/map";
import { startLevel, type LevelSession } from "./game/level";
import type { LevelIndexEntry } from "./game/level-types";
import type { SolverKind } from "./sim/solver";
import { mountHud } from "./ui/hud";
import { mountSelect } from "./ui/select";
import { mountTray, type Tray } from "./ui/tray";
import { mountToolbar, type Toolbar } from "./ui/toolbar";
import { mountScore } from "./ui/score";
import { mountBubbles, type Bubbles } from "./ui/bubbles";
import { showEndCard } from "./ui/endcard";

function showUnsupported(): void {
  document.getElementById("unsupported")?.removeAttribute("hidden");
  document.querySelector(".brand")?.setAttribute("hidden", "");
}

function solverKind(): SolverKind {
  const v = new URLSearchParams(location.search).get("solver");
  return v === "stable" ? "stable" : "lbm";
}

async function boot(): Promise<void> {
  const container = document.getElementById("map");
  const ui = document.getElementById("ui");
  if (!container || !ui) throw new Error("missing #map / #ui");

  if (!hasWebGL2()) {
    showUnsupported();
    return;
  }

  let hdb: HdbMap;
  try {
    hdb = await createMap(container);
  } catch (e) {
    console.error("[hdbreeze] map init failed", e);
    showUnsupported();
    return;
  }

  if (isDevMode()) {
    (window as unknown as { __hdb: unknown }).__hdb = hdb;
    const status = document.getElementById("status");
    if (status) {
      status.hidden = false;
      status.textContent = `tiles: ${hdb.provider()}`;
      hdb.onFallback((p) => {
        status.textContent = `tiles: ${p} (fallback)`;
      });
    }
  }

  const levels = (await (await fetch(`${import.meta.env.BASE_URL}levels/index.json`)).json()) as LevelIndexEntry[];
  let session: LevelSession | null = null;
  let hud: ReturnType<typeof mountHud> | null = null;
  let tray: Tray | null = null;
  let toolbar: Toolbar | null = null;
  let score: ReturnType<typeof mountScore> | null = null;
  let bubbles: Bubbles | null = null;
  let endcard: { unmount(): void } | null = null;

  const leave = (): void => {
    document.body.classList.remove("in-level");
    endcard?.unmount();
    endcard = null;
    bubbles?.unmount();
    bubbles = null;
    score?.unmount();
    score = null;
    toolbar?.unmount();
    toolbar = null;
    tray?.unmount();
    tray = null;
    hud?.unmount();
    hud = null;
    session?.dispose();
    session = null;
    select.show();
    hdb.map.setMaxBounds(SINGAPORE_VIEW.maxBounds);
    hdb.map.flyTo({ center: SINGAPORE_VIEW.center, zoom: SINGAPORE_VIEW.zoom, pitch: 0, bearing: 0, duration: 1800 });
  };
  const play = async (id: string): Promise<void> => {
    select.hide();
    session = await startLevel(hdb, id, solverKind());
    hud = mountHud(ui, session, leave);
    const s = session;
    tray = mountTray(ui, s.blocks, (t) => { s.trayType = t; });
    toolbar = mountToolbar(ui, hdb.map, s.blocks, () => s.select(null));
    s.moveMode = () => toolbar?.moveMode() ?? false;
    s.onSelection((id) => {
      if (id) toolbar?.show(id);
      else toolbar?.hide();
    });
    s.onReject(() => tray?.shake());
    document.body.classList.add("in-level");
    score = mountScore(ui, s.level.targets.satisfaction, s.level.targets.homes);
    s.onScore((st) => score?.update(st));
    bubbles = mountBubbles(ui, hdb.map);
    s.onSpeech((sp) => bubbles?.say(sp.lonLat(), sp.text, sp.tier, sp.lonLat));
    s.onCleared(() => {
      s.select(null);
      endcard = showEndCard(ui, {
        levelName: s.level.name,
        state: s.scoring.state,
        stars: s.scoring.stars(),
        onContinue: () => { endcard = null; },
        onTowns: () => { endcard = null; leave(); },
      });
    });
    (window as unknown as { __session: unknown }).__session = session;
  };
  const select = mountSelect(ui, levels, (id) => void play(id));

  const deep = new URLSearchParams(location.search).get("level");
  const start = (): void => {
    if (deep && levels.some((l) => l.id === deep)) void play(deep);
  };
  if (hdb.map.loaded()) start();
  else hdb.map.once("load", start);
}

void boot();
