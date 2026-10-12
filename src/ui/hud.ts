import type { LevelSession } from "../game/level";

/** In-level chrome for M1: season toggle + back. Score and homes arrive in M3. */
export function mountHud(root: HTMLElement, session: LevelSession, onBack: () => void, onHelp: () => void, onResidents: () => void): { update(): void; unmount(): void } {
  const bar = document.createElement("div");
  bar.className = "hud";
  const back = document.createElement("button");
  back.className = "chip";
  back.textContent = "← Towns";
  back.onclick = onBack;
  const seasonBtn = document.createElement("button");
  seasonBtn.className = "chip chip-wind";
  const arrow = document.createElement("span");
  arrow.className = "arrow";
  arrow.textContent = "➤";
  const label = document.createElement("span");
  seasonBtn.append(arrow, label);
  seasonBtn.onclick = () => {
    session.nextSeason();
    update();
  };
  const residents = document.createElement("button");
  residents.className = "chip chip-residents";
  residents.textContent = "🗣";
  residents.setAttribute("aria-label", "Hear the residents");
  residents.onclick = onResidents;
  const help = document.createElement("button");
  help.className = "chip";
  help.textContent = "?";
  help.setAttribute("aria-label", "How to play");
  help.onclick = onHelp;
  const dev = document.createElement("span");
  dev.className = "devstats";
  bar.append(back, seasonBtn, residents, help, dev);
  root.append(bar);

  const update = (): void => {
    label.textContent = session.season.label.split(" (")[0] ?? session.season.label;
    seasonBtn.classList.toggle("season-done", session.scoring.state.held.includes(session.season.id));
    seasonBtn.classList.toggle("season-required", session.level.wind.required.length > 1);
    // the arrow points where the wind goes: from fromDeg toward fromDeg + 180
    arrow.style.transform = `rotate(${session.season.fromDeg + 180 - 90}deg)`;
  };
  update();
  const devMode = new URLSearchParams(location.search).has("dev");
  const timer = window.setInterval(() => {
      update();
      if (!devMode) return;
      const sim = session.overlay.sim;
      const s = sim?.lastStats;
      dev.textContent = sim ? `${sim.solver.name} ${sim.fmt.name} ${sim.n}² ` + (s ? `|u|max ${s.maxSpeed.toFixed(2)} T ${s.meanHeat.toFixed(2)} ${s.nan ? "NaN!" : ""}` : "") : "sim…";
  }, 500);
  return {
    update,
    unmount: () => {
      window.clearInterval(timer);
      bar.remove();
    },
  };
}
