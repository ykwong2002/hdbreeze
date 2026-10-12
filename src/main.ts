import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { hasWebGL2, isDevMode, isHarness } from "./capability";
import { createMap, SINGAPORE_VIEW, type HdbMap } from "./map/map";
import { startLevel, type LevelSession } from "./game/level";
import type { LevelIndexEntry, TownData } from "./game/level-types";
import type { SolverKind } from "./sim/solver";
import { Progress } from "./game/progress";
import { runIntro } from "./game/intro";
import { lessonFor, techniqueOk, TECHNIQUE_LABEL } from "./game/lessons";
import { sound } from "./sound";
import { mountHud } from "./ui/hud";
import { mountSelect } from "./ui/select";
import { mountTown } from "./ui/town";
import { mountTray, type Tray } from "./ui/tray";
import { mountToolbar, type Toolbar } from "./ui/toolbar";
import { mountGestures, type Gestures } from "./ui/gestures";
import { mountScore } from "./ui/score";
import { mountBubbles, type Bubbles } from "./ui/bubbles";
import { showEndCard } from "./ui/endcard";
import { showPlotCard } from "./ui/plotcard";
import { showAbout, showHowTo, showTitle, showWhy } from "./ui/title";
import { mountOnboarding } from "./ui/onboarding";
import { showResidents } from "./ui/residents";
import { mountHotSpotMarkers } from "./ui/hotspot-markers";
import { mountMapTouch } from "./ui/maptouch";
import { createTour } from "./ui/tour";
import { ICON } from "./ui/icons";
import { tierFor } from "./game/lines";

const WHY_KEY = "hdbreeze.why.v6";

function showUnsupported(): void {
  document.getElementById("unsupported")?.removeAttribute("hidden");
  document.querySelector(".brand")?.setAttribute("hidden", "");
}

function solverKind(): SolverKind {
  const v = new URLSearchParams(location.search).get("solver");
  return v === "stable" ? "stable" : "lbm";
}

/** A page held by an in-app browser cache can outlive a deploy; reload once if the server has a newer build. */
async function checkFreshness(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" });
    if (!r.ok) return;
    const { build } = (await r.json()) as { build?: string };
    if (build && build !== __BUILD_ID__ && sessionStorage.getItem("hdbreeze.reloaded") !== build) {
      sessionStorage.setItem("hdbreeze.reloaded", build);
      location.reload();
    }
  } catch {
    /* offline or blocked: carry on */
  }
}

async function boot(): Promise<void> {
  void checkFreshness();
  const container = document.getElementById("map");
  const ui = document.getElementById("ui");
  if (!container || !ui) throw new Error("missing #map / #ui");
  if (!hasWebGL2()) { showUnsupported(); return; }

  let hdb: HdbMap;
  try {
    hdb = await createMap(container);
  } catch (e) {
    console.error("[hdbreeze] map init failed", e);
    showUnsupported();
    return;
  }
  const params = new URLSearchParams(location.search);
  const touch = mountMapTouch(hdb.map);
  const tour = createTour(hdb.map);
  // the browser's own pinch zoom would leave the page stuck zoomed in (iOS ignores maximum-scale)
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) document.querySelector(".brand-touch")?.setAttribute("hidden", "");
  const checking = params.has("check");
  const demo = params.has("demo");
  const quiet = checking || isHarness() || demo;
  if (isHarness()) (window as unknown as { __hdb: unknown }).__hdb = hdb;
  if (isDevMode()) {
    const status = document.getElementById("status");
    if (status) {
      status.hidden = false;
      status.textContent = `tiles: ${hdb.provider()}`;
      hdb.onFallback((p) => { status.textContent = `tiles: ${p} (fallback)`; });
    }
  }

  const towns = (await (await fetch(`${import.meta.env.BASE_URL}levels/index.json`)).json()) as LevelIndexEntry[];
  const townCache = new Map<string, TownData>();
  const loadTown = async (id: string): Promise<TownData> => {
    let t = townCache.get(id);
    if (!t) { t = (await (await fetch(`${import.meta.env.BASE_URL}levels/${id}.json`)).json()) as TownData; townCache.set(id, t); }
    return t;
  };
  const progress = new Progress();

  let session: LevelSession | null = null;
  let hud: ReturnType<typeof mountHud> | null = null;
  let tray: Tray | null = null;
  let toolbar: Toolbar | null = null;
  let gestures: Gestures | null = null;
  let score: ReturnType<typeof mountScore> | null = null;
  let bubbles: Bubbles | null = null;
  let endcard: { unmount(): void } | null = null;
  let onboarding: { unmount(): void } | null = null;
  let markers: ReturnType<typeof mountHotSpotMarkers> | null = null;
  let plotcard: ReturnType<typeof showPlotCard> | null = null;
  let townView: ReturnType<typeof mountTown> | null = null;
  let tip: HTMLElement | null = null;
  let brainMod: typeof import("./lm/resident") | null = null;
  let currentTown: TownData | null = null;

  const teardownLevel = (): void => {
    document.body.classList.remove("in-level");
    session?.brain?.dispose();
    for (const x of [endcard, onboarding, markers, bubbles, score, toolbar, gestures, tray, hud, plotcard]) x?.unmount();
    endcard = onboarding = markers = bubbles = score = toolbar = gestures = tray = hud = plotcard = null;
    session?.dispose();
    session = null;
    document.body.classList.remove("block-selected");
    touch.setRotator(null);
    tip?.remove();
    tip = null;
  };
  const showTowns = (): void => {
    teardownLevel();
    townView?.unmount();
    townView = null;
    select.show();
    hdb.map.setMaxBounds(SINGAPORE_VIEW.maxBounds);
    tour.start();
  };
  const showTown = async (id: string): Promise<void> => {
    teardownLevel();
    townView?.unmount();
    select.hide();
    tour.stop();
    const town = await loadTown(id);
    currentTown = town;
    townView = mountTown(ui, hdb.map, town, progress, (levelId) => void play(levelId), showTowns);
  };

  const play = async (levelId: string): Promise<void> => {
    sound.init();
    tour.stop();
    townView?.unmount();
    townView = null;
    teardownLevel();
    select.hide();
    const s = await startLevel(hdb, levelId, solverKind());
    session = s;
    if (!currentTown && s.level.town) currentTown = await loadTown(s.level.town);
    const town = currentTown;
    const recenter = (): void => {
      const ring = s.level.site;
      let x = 0, y = 0;
      for (const p of ring) { x += p[0]; y += p[1]; }
      hdb.map.flyTo({ center: [x / ring.length, y / ring.length], zoom: s.level.camera.zoom, pitch: s.level.camera.pitch, bearing: 0, duration: 900, essential: true });
    };
    hud = mountHud(ui, s, () => { if (town) void showTown(town.id); else showTowns(); }, () => showHowTo(ui), () => {
      if (!s.brain) return;
      const comfort = (): number => { const st = s.scoring.state; const t = Math.min(1, Math.max(0, (st.meanFeelsLike - 27.5) / 7)); return 1 - t * t * (3 - 2 * t); };
      showResidents(ui, s.brain, () => tierFor(comfort()), () => s.scoring.state.meanFeelsLike);
    }, recenter);
    if (!params.has("nolm")) void s.overlay.ready.then(async () => {
      brainMod ??= await import("./lm/resident");
      if (session !== s) return;
      const brain = new brainMod.ResidentBrain();
      s.brain = brain;
      await brain.load(`${import.meta.env.BASE_URL}models/resident.bin`);
    });
    gestures = mountGestures(hdb.map, s, ui);
    touch.setRotator({ selected: () => s.selectedBlock, setRotation: (id, deg) => { s.blocks.setRotation(id, deg); }, rotation: (id: string) => s.blocks.get(id)?.rotDeg ?? null } as Parameters<typeof touch.setRotator>[0]);
    tip = document.createElement("div");
    tip.className = "leveltip";
    tip.innerHTML = coarse
      ? `<span>${ICON.hand} drag a block to move it</span><span>${ICON.rotate} twist two fingers to turn it</span><span>${ICON.fingers2} two fingers drag the map, twist to look around</span><span>${ICON.fingers3} three-finger tap tilts</span>`
      : `<span>${ICON.hand} drag a block to move it</span><span>${ICON.rotate} tap it, then turn 45°</span><span>${ICON.fingers2} right-drag to look around</span>`;
    ui.append(tip);
    const g = gestures;
    tray = mountTray(ui, s.blocks, (t) => { s.trayType = t; }, (t, ev) => g.beginTrayDrag(t, ev));
    toolbar = mountToolbar(ui, hdb.map, s.blocks, () => s.select(null));
    s.moveMode = () => toolbar?.moveMode() ?? false;
    s.onSelection((id) => { if (id) toolbar?.show(id); else toolbar?.hide(); document.body.classList.toggle("block-selected", !!id); });
    s.onReject(() => { tray?.shake(); sound.reject(); });
    let lastCount = 0;
    s.blocks.onChange(() => { const n = s.blocks.blocks.length; if (n > lastCount && !s.intro) sound.place(); lastCount = n; });
    s.onHint((text) => {
      const h = document.createElement("div");
      h.className = "hint";
      h.textContent = text;
      ui.append(h);
      window.setTimeout(() => h.remove(), 6000);
    });
    document.body.classList.add("in-level");
    score = mountScore(ui, s.level);
    let airWas = false;
    s.onScore((st) => { score?.update(st, s.season.id, s.scoring.baselines[s.season.id]); if (st.airOk && !airWas && !s.intro) sound.cool(); airWas = st.airOk; });
    void s.overlay.ready.then((sim) => {
      markers = mountHotSpotMarkers(ui, hdb.map, (x, y) => sim.toLonLat(x, y));
      s.onHotSpots((spots) => markers?.set(spots));
    });
    bubbles = mountBubbles(ui, hdb.map);
    s.onSpeech((sp) => bubbles?.say(sp.lonLat(), sp.text, sp.tier, sp.lonLat));

    // intro: Master Plan facts + on-device baselines (careless plan shown), then build
    if (checking) {
      const { runCheck } = await import("./dev/check");
      const box = document.createElement("pre");
      box.className = "calib";
      box.textContent = "checking… keep this tab in the foreground (browsers pause background tabs)\n";
      box.style.maxHeight = "72vh";
      box.style.overflow = "auto";
      box.style.userSelect = "text";
      ui.append(box);
      await s.overlay.ready;
      const sim = s.overlay.sim!;
      sim.params.substeps = Math.max(sim.params.substeps, 8);
      await new Promise((r) => setTimeout(r, 2000));
      void runCheck(s, (line) => { box.textContent += line + "\n"; console.log("[check]", line); });
    } else if (!params.has("nointro")) {
      document.body.classList.add("in-intro");
      plotcard = showPlotCard(ui, s.level, () => {
        plotcard = null;
        document.body.classList.remove("in-intro");
        if (!quiet) onboarding = mountOnboarding(ui, s);
        if (demo) void import("./dev/demo").then(({ runDemo }) => runDemo(s, hdb.map));
      });
      const card = plotcard;
      const autoWait = (label: string): Promise<void> => (isHarness() ? Promise.resolve() : demo ? new Promise((r) => { card.status(`<strong>This is 0% breathable.</strong> Walls across the wind, every block tall. (${label})`, "careless"); window.setTimeout(r, 5000); }) : card.wait(label));
      void runIntro(s, {
        status: (text, phase) => { card.status(text, phase); if (demo && phase === "done") window.setTimeout(() => ui.querySelector<HTMLButtonElement>(".pc-build")?.click(), 1500); },
        wait: autoWait,
      }, params.has("recal") || demo).catch((e) => { console.error("[hdbreeze] intro", e); card.status("", "done"); });
    } else if (!quiet) onboarding = mountOnboarding(ui, s);

    s.onCleared(() => {
      if (checking) return;
      s.select(null);
      const idx = s.level.plotIndex ?? 1, count = s.level.plotCount ?? 1;
      const minPct = s.scoring.minSeasonPct();
      const stars = s.scoring.stars(techniqueOk(s));
      progress.record(s.level.id, { stars, homes: s.scoring.state.homes, breath: minPct });
      townView?.refresh();
      const ids = town?.plots.map((p) => p.id) ?? [];
      const last = idx >= count && !!town && progress.townCleared(ids);
      if (last) sound.townClear(); else sound.plotClear(idx);
      const results = ids.map((id) => progress.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
      endcard = showEndCard(ui, {
        townName: s.level.name, plotLabel: s.level.plotLabel ?? s.level.subzone, plotIndex: idx, plotCount: count,
        state: s.scoring.state, stars, minPct, starPct: s.level.starPct ?? 75, targetHomes: s.level.targets.homes,
        technique: TECHNIQUE_LABEL[s.level.focus ?? "corridors"].split(":")[0]!,
        lesson: lessonFor(s),
        ...(last ? { townSummary: { homes: results.reduce((a, r) => a + r.homes, 0), avgPct: Math.round(results.reduce((a, r) => a + r.breath, 0) / Math.max(1, results.length)), stars: progress.stars(ids) } } : {}),
        onNext: () => { endcard = null; const next = town?.plots[idx]; if (next) void play(next.id); else if (town) void showTown(town.id); },
        onTown: () => { endcard = null; if (town) void showTown(town.id); else showTowns(); },
        onReplay: () => { endcard = null; },
        image: async () => {
          const { captureShareImage } = await import("./share/capture");
          return captureShareImage(hdb.map, { levelName: `${s.level.name} · ${s.level.plotLabel ?? ""}`, state: s.scoring.state, stars });
        },
      });
    });
    (window as unknown as { __session: unknown }).__session = s;
    if (isHarness()) {
      (window as unknown as { __fill: unknown }).__fill = async (style: "careless" | "aligned") => {
        const { fill } = await import("./game/fill");
        if (session) fill(session, style);
      };
    }
  };

  const select = mountSelect(ui, towns, (id) => {
    const t = townCache.get(id);
    return t ? `${progress.stars(t.plots.map((p) => p.id))} / ${t.plots.length * 3} ★` : `${(towns.find((x) => x.id === id)?.plots ?? 3) * 3} ★ to earn`;
  }, (id) => void showTown(id));
  // warm the town files so the picker can show stars
  void Promise.all(towns.map((t) => loadTown(t.id))).then(() => select.show()).then(() => { if (!select) return; });

  const deep = params.get("level");
  if (!deep && !params.get("town") && !quiet) {
    const begin = (): void => tour.start();
    if (hdb.map.loaded()) begin(); else hdb.map.once("load", begin);
  }
  if (deep) {
    select.hide();
    const start = (): void => void play(deep);
    if (hdb.map.loaded()) start();
    else hdb.map.once("load", start);
  } else if (params.get("town")) {
    select.hide();
    void showTown(params.get("town")!);
  } else {
    select.hide();
    const begin = (): void => { sound.init(); if (!quiet) sound.startMusic(); select.show(); };
    showTitle(ui, () => {
      let seen = false;
      try { seen = localStorage.getItem(WHY_KEY) === "1"; } catch { /* ignore */ }
      if (seen) begin();
      else showWhy(ui, () => { try { localStorage.setItem(WHY_KEY, "1"); } catch { /* ignore */ } begin(); });
    }, () => showWhy(ui, () => {}));
  }
  (window as unknown as { __about: unknown }).__about = () => showAbout(ui);
}

void boot();
