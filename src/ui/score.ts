import type { ScoreState } from "../game/scoring";

/** Score card: one big number, a bar with the threshold marked, homes vs target, feels-like. */
export function mountScore(root: HTMLElement, threshold: number, targetHomes: number): { update(s: ScoreState): void; unmount(): void } {
  const card = document.createElement("section");
  card.className = "score";
  card.innerHTML = `
    <div class="score-top"><span class="score-num">–</span><span class="score-label">satisfaction<br><small class="feels"></small></span></div>
    <div class="score-bar"><div class="score-fill"></div><div class="score-tick" style="left:${threshold}%"></div><div class="score-hold"></div></div>
    <div class="score-foot"><span class="score-homes"></span><span class="score-hint">Clear: ${threshold}+ for a few seconds and house ${targetHomes.toLocaleString()}</span></div>`;
  root.append(card);
  const num = card.querySelector<HTMLElement>(".score-num")!;
  const fill = card.querySelector<HTMLElement>(".score-fill")!;
  const hold = card.querySelector<HTMLElement>(".score-hold")!;
  const homes = card.querySelector<HTMLElement>(".score-homes")!;
  const feels = card.querySelector<HTMLElement>(".feels")!;
  return {
    update(s) {
      num.textContent = s.satisfaction.toFixed(0);
      fill.style.width = `${Math.max(0, Math.min(100, s.satisfaction))}%`;
      fill.style.background = s.satisfaction >= threshold ? "var(--cool)" : "linear-gradient(90deg, var(--hot), #e8b84a)";
      hold.style.width = `${(s.hold * 100).toFixed(0)}%`;
      homes.textContent = `🏠 ${s.homes.toLocaleString()} / ${targetHomes.toLocaleString()}`;
      homes.classList.toggle("ok", s.homesOk);
      feels.textContent = `feels like ${s.meanFeelsLike.toFixed(1)} °C`;
    },
    unmount: () => card.remove(),
  };
}
