import type { ScoreState } from "../game/scoring";

/** Score card: one big number, a bar with the threshold marked, homes vs target, feels-like. */
export function mountScore(root: HTMLElement, threshold: number, targetHomes: number): { update(s: ScoreState): void; setSpots(cooled: number, total: number): void; unmount(): void } {
  const card = document.createElement("section");
  card.className = "score";
  card.innerHTML = `
    <div class="score-top"><span class="score-num">–</span><span class="score-label">satisfaction<br><small class="feels"></small></span></div>
    <div class="score-bar"><div class="score-fill"></div>${threshold > 0 ? `<div class="score-tick" style="left:${threshold}%"></div>` : ""}<div class="score-hold"></div></div>
    <div class="score-foot"><span class="score-spots">🔥 hot spots</span><span class="score-homes"></span><span class="score-blocks"></span><span class="score-hint">Steer the breeze into every hot spot, place all blocks, house ${targetHomes.toLocaleString()}.</span></div>
    <div class="legend"><span>breezy</span><span class="legend-bar"></span><span>stuffy</span></div>`;
  root.append(card);
  const num = card.querySelector<HTMLElement>(".score-num")!;
  const fill = card.querySelector<HTMLElement>(".score-fill")!;
  const hold = card.querySelector<HTMLElement>(".score-hold")!;
  const homes = card.querySelector<HTMLElement>(".score-homes")!;
  const blocksEl = card.querySelector<HTMLElement>(".score-blocks")!;
  const spotsEl = card.querySelector<HTMLElement>(".score-spots")!;
  const feels = card.querySelector<HTMLElement>(".feels")!;
  return {
    update(s) {
      num.textContent = s.satisfaction.toFixed(0);
      fill.style.width = `${Math.max(0, Math.min(100, s.satisfaction))}%`;
      fill.style.background = s.satisfactionOk ? "var(--cool)" : "linear-gradient(90deg, var(--hot), #e8b84a)";
      hold.style.width = `${(s.hold * 100).toFixed(0)}%`;
      homes.textContent = `🏠 ${s.homes.toLocaleString()} / ${targetHomes.toLocaleString()}`;
      homes.classList.toggle("ok", s.homesOk);
      blocksEl.textContent = `🧱 ${s.placed} / ${s.toPlace} blocks`;
      blocksEl.classList.toggle("ok", s.allPlaced);
      feels.textContent = `feels like ${s.meanFeelsLike.toFixed(1)} °C`;
    },
    setSpots(cooled, total) {
      spotsEl.textContent = total ? `🔥 hot spots cooled ${cooled} / ${total}` : "🔥 no hot spots in this level";
      spotsEl.classList.toggle("ok", total > 0 && cooled === total);
    },
    unmount: () => card.remove(),
  };
}
