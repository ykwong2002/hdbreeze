import type { LevelSession } from "../game/level";
import { sound } from "../sound";
import { ICON } from "./icons";

/** In-level chrome for M1: season toggle + back. Score and homes arrive in M3. */
export function mountHud(root: HTMLElement, session: LevelSession, onBack: () => void, onHelp: () => void, onResidents: () => void, onRecenter: () => void, backLabel = "← Plots"): { update(): void; unmount(): void } {
  const bar = document.createElement("div");
  bar.className = "hud";
  const back = document.createElement("button");
  back.className = "chip";
  back.textContent = backLabel;
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
  residents.innerHTML = ICON.speech;
  residents.setAttribute("aria-label", "Hear the residents");
  residents.onclick = onResidents;
  const help = document.createElement("button");
  help.className = "chip";
  help.innerHTML = ICON.help;
  help.setAttribute("aria-label", "How to play");
  help.onclick = onHelp;
  const mute = document.createElement("button");
  mute.className = "chip";
  mute.setAttribute("aria-label", "Sound on/off");
  mute.innerHTML = sound.enabled ? ICON.sound : ICON.mute;
  mute.onclick = () => { mute.innerHTML = sound.toggle() ? ICON.sound : ICON.mute; };
  const recenter = document.createElement("button");
  recenter.className = "chip chip-recenter";
  recenter.setAttribute("aria-label", "Back to the plot");
  recenter.innerHTML = ICON.target;
  recenter.onclick = onRecenter;
  const dev = document.createElement("span");
  dev.className = "devstats";
  bar.append(back, seasonBtn, residents, help, mute, dev);
  root.append(recenter);
  root.append(bar);

  const update = (): void => {
    const name = session.season.label.split(" (")[0] ?? session.season.label;
    label.textContent = session.level.wind.required.length > 1 ? `${name} · tap to switch` : name;
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
      recenter.remove();
    },
  };
}
