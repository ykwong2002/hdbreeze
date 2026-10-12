import type { Baseline, ScoreState } from "../game/scoring";
import type { BakedLevel } from "../game/level-types";

/** Score card: breathability as the big number, then the checklist that clears the plot. */
export function mountScore(root: HTMLElement, level: BakedLevel): { update(s: ScoreState, season: string, baseline?: Baseline): void; unmount(): void } {
  const pass = level.passPct ?? 60;
  const card = document.createElement("section");
  card.className = "score";
  const seasons = level.wind.required;
  card.innerHTML = `
    <div class="score-top"><span class="score-num">–</span><span class="score-label">breathable<br><small class="feels"></small></span></div>
    <div class="score-bar"><div class="score-fill"></div><div class="score-tick" style="left:${pass}%"></div><div class="score-hold"></div></div>
    <div class="score-foot">
      <span class="score-row score-air">🌬️ ${pass}%+ breathable to clear</span>
      <span class="score-row score-homes"></span>
      <span class="score-row score-blocks"></span>
      ${level.hotspots.length ? '<span class="score-row score-spots"></span>' : ""}
      ${seasons.length > 1 ? `<span class="score-row score-seasons">${seasons.map((s) => `<b data-s="${s}">${s.toUpperCase()}</b>`).join(" ")} monsoons</span>` : ""}
    </div>
    <div class="legend"><span>breezy</span><span class="legend-bar"></span><span>stuffy</span></div>`;
  root.append(card);
  const q = <T extends HTMLElement>(sel: string): T | null => card.querySelector<T>(sel);
  const num = q<HTMLElement>(".score-num")!, fill = q<HTMLElement>(".score-fill")!, hold = q<HTMLElement>(".score-hold")!;
  const air = q<HTMLElement>(".score-air")!, homes = q<HTMLElement>(".score-homes")!, blocksEl = q<HTMLElement>(".score-blocks")!, feels = q<HTMLElement>(".feels")!;
  const spotsEl = q<HTMLElement>(".score-spots"), seasonsEl = q<HTMLElement>(".score-seasons");
  return {
    update(s, season, baseline) {
      const empty = s.placed === 0;
      if (s.measuring || s.breath < 0) { num.textContent = "…"; fill.style.width = "0%"; }
      else if (empty) { num.textContent = "—"; fill.style.width = "0%"; }
      else { num.textContent = `${s.breath.toFixed(0)}%`; fill.style.width = `${Math.max(0, Math.min(100, s.breath))}%`; }
      fill.style.background = s.breathOk ? "var(--cool)" : "linear-gradient(90deg, var(--hot), #e8b84a)";
      hold.style.width = `${(s.hold * 100).toFixed(0)}%`;
      air.classList.toggle("ok", s.breathOk);
      homes.textContent = `🏠 ${s.homes.toLocaleString()} / ${level.targets.homes.toLocaleString()} people housed`;
      homes.classList.toggle("ok", s.homesOk);
      blocksEl.textContent = `🧱 ${s.placed} / ${s.toPlace} blocks placed`;
      blocksEl.classList.toggle("ok", s.allPlaced);
      feels.textContent = s.measuring ? "measuring…" : empty ? `careless plan 0% · goal ${pass}% · empty plot 100%` : baseline ? `walkways ${s.meanFeelsLike.toFixed(1)} °C · careless ${baseline.careless.toFixed(1)} · empty ${baseline.empty.toFixed(1)} (model)` : `walkways ${s.meanFeelsLike.toFixed(1)} °C (model)`;
      if (spotsEl) { spotsEl.textContent = `🔥 neighbour spots cooled ${s.spotsCooled} / ${s.spotsTotal}`; spotsEl.classList.toggle("ok", s.spotsTotal > 0 && s.spotsCooled === s.spotsTotal); }
      if (seasonsEl) seasonsEl.querySelectorAll<HTMLElement>("b").forEach((b) => { b.classList.toggle("ok", s.held.includes(b.dataset.s!)); b.classList.toggle("now", b.dataset.s === season); });
    },
    unmount: () => card.remove(),
  };
}
