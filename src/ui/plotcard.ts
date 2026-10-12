import type { BakedLevel } from "../game/level-types";
import { ICON } from "./icons";

const FOCUS_SHORT = { corridors: "wind corridors", void: "void decks", stepping: "height stepping" } as const;

/**
 * Plot intro card, kept short so it does not hide the plot on a phone:
 *   goals → "measuring" → careless plan (waits for the player) → build.
 */
export function showPlotCard(root: HTMLElement, level: BakedLevel, onBuild: () => void): {
  status(text: string, phase: "empty" | "careless" | "done"): void;
  wait(label: string): Promise<void>;
  unmount(): void;
} {
  const el = document.createElement("section");
  el.className = "plotcard";
  const both = level.wind.required.length > 1;
  el.innerHTML = `
    <div class="plotcard-box">
      <small>Plot ${level.plotIndex} of ${level.plotCount} · ${level.name}</small>
      <h2>${level.plotLabel}</h2>
      <ul class="pc-goals">
        <li>${ICON.home}<span>Place every block to house <strong>${level.targets.homes.toLocaleString()} people</strong></span></li>
        <li>${ICON.wind}<span>Keep breathability <strong>above ${level.passPct ?? 60}%</strong>${both ? " in <strong>both monsoons</strong>" : ""}</span></li>
        <li class="pc-bonus">${ICON.star}<span>Bonus star: <strong>${FOCUS_SHORT[level.focus ?? "corridors"]}</strong></span></li>
      </ul>
      <p class="pc-status"><span class="pc-spinner"></span><span class="pc-status-text">Measuring the breeze on the empty plot…</span></p>
      <button class="btn btn-primary pc-build" disabled>Build</button>
    </div>`;
  root.append(el);
  const status = el.querySelector<HTMLElement>(".pc-status-text")!;
  const spinner = el.querySelector<HTMLElement>(".pc-spinner")!;
  const build = el.querySelector<HTMLButtonElement>(".pc-build")!;
  build.onclick = () => { el.remove(); onBuild(); };
  return {
    status(text, phase) {
      el.classList.toggle("careless", phase === "careless");
      if (phase === "done") {
        status.innerHTML = "<strong>Now you.</strong> That careless plan is 0%; the empty plot is 100%.";
        spinner.hidden = true;
        build.disabled = false;
        el.classList.add("ready");
      } else {
        status.innerHTML = text;
        spinner.hidden = phase === "careless";
      }
    },
    wait(label) {
      return new Promise((resolve) => {
        build.disabled = false;
        build.textContent = label;
        build.onclick = () => { build.disabled = true; build.textContent = "Build"; build.onclick = () => { el.remove(); onBuild(); }; resolve(); };
      });
    },
    unmount: () => el.remove(),
  };
}
