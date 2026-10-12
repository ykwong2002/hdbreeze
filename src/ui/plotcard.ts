import type { BakedLevel } from "../game/level-types";
import { TECHNIQUE_LABEL } from "../game/lessons";

/** The plot intro card: Master Plan facts, then the status line while the baselines are measured, then Build. */
export function showPlotCard(root: HTMLElement, level: BakedLevel, onBuild: () => void): { status(text: string, phase: "empty" | "careless" | "done"): void; unmount(): void } {
  const el = document.createElement("section");
  el.className = "plotcard";
  const seasons = level.wind.required.map((s) => s.toUpperCase()).join(" and ");
  el.innerHTML = `
    <div class="plotcard-box">
      <small>Plot ${level.plotIndex} of ${level.plotCount} · ${level.name}</small>
      <h2>${level.plotLabel}</h2>
      <p class="pc-fact">📐 <strong>${((level.areaM2 ?? 0) / 10_000).toFixed(1)} ha</strong> at plot ratio <strong>${level.gpr}</strong>: room for roughly <strong>${(level.flatsAllowed ?? 0).toLocaleString()} flats</strong>.</p>
      <p class="pc-fact">💡 This plot's technique: <strong>${TECHNIQUE_LABEL[level.focus ?? "corridors"]}</strong> (third star).</p>
      <p class="pc-fact">🎯 House <strong>${level.targets.homes.toLocaleString()} people</strong> with every block in the tray, and keep the precinct <strong>${level.passPct ?? 60}% breathable</strong> in the ${seasons} monsoon${level.wind.required.length > 1 ? "s" : ""}.</p>
      ${level.hotspots.length ? `<p class="pc-fact">🔥 Bonus: the neighbours' <strong>${level.hotspots.map((h) => h.label.toLowerCase()).join(" and ")}</strong> never feel the breeze. Steer it there too.</p>` : ""}
      <p class="pc-status"><span class="pc-spinner"></span><span class="pc-status-text">Measuring the breeze on the empty plot…</span></p>
      <button class="btn btn-primary pc-build" disabled>Build</button>
      <p class="pc-note">All numbers here are estimates, for fun and education.</p>
    </div>`;
  root.append(el);
  const status = el.querySelector<HTMLElement>(".pc-status-text")!;
  const spinner = el.querySelector<HTMLElement>(".pc-spinner")!;
  const build = el.querySelector<HTMLButtonElement>(".pc-build")!;
  build.onclick = () => { el.remove(); onBuild(); };
  return {
    status(text, phase) {
      if (phase === "done") {
        status.textContent = "Now you. Breathability is scored between that careless plan (0%) and the empty plot (100%).";
        spinner.hidden = true;
        build.disabled = false;
        el.classList.add("ready");
      } else {
        status.textContent = text;
        el.classList.toggle("careless", phase === "careless");
      }
    },
    unmount: () => el.remove(),
  };
}
