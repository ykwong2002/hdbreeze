import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { hasWebGL2, isDevMode } from "./capability";
import { createMap, SINGAPORE_VIEW, type HdbMap } from "./map/map";
import { startLevel, type LevelSession } from "./game/level";
import type { LevelIndexEntry } from "./game/level-types";
import type { SolverKind } from "./sim/solver";
import { mountHud } from "./ui/hud";
import { mountSelect } from "./ui/select";

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

  const leave = (): void => {
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
