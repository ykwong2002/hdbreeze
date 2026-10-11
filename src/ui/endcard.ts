import type { ScoreState } from "../game/scoring";

export interface EndCardOptions {
  levelName: string;
  state: ScoreState;
  stars: number;
  onContinue(): void;
  onTowns(): void;
}

/** Level-cleared card with a share button (Web Share API, clipboard fallback). */
export function showEndCard(root: HTMLElement, o: EndCardOptions): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "endcard";
  const stars = "★".repeat(o.stars) + "☆".repeat(3 - o.stars);
  el.innerHTML = `
    <div class="endcard-box">
      <div class="endcard-stars">${stars}</div>
      <h2>${o.levelName} cleared</h2>
      <p class="endcard-score"><strong>${o.state.satisfaction.toFixed(0)}</strong> satisfaction · ${o.state.homes.toLocaleString()} residents housed</p>
      <p class="endcard-sub">Feels like ${o.state.meanFeelsLike.toFixed(1)} °C on the walkways.</p>
      <div class="endcard-btns">
        <button class="btn btn-primary share">Share</button>
        <button class="btn cont">Keep building</button>
        <button class="btn towns">Towns</button>
      </div>
      <p class="endcard-note share-note" hidden>Copied to clipboard.</p>
    </div>`;
  root.append(el);
  const text = `I ventilated ${o.levelName} in HDBreeze 🌬️ ${stars} satisfaction ${o.state.satisfaction.toFixed(0)}/100, ${o.state.homes.toLocaleString()} residents housed. Can you beat it? ${location.origin}${location.pathname}`;
  el.querySelector<HTMLButtonElement>(".share")!.onclick = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    try {
      if (nav.share) await nav.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        el.querySelector<HTMLElement>(".share-note")!.hidden = false;
      }
    } catch {
      /* user cancelled */
    }
  };
  el.querySelector<HTMLButtonElement>(".cont")!.onclick = () => { el.remove(); o.onContinue(); };
  el.querySelector<HTMLButtonElement>(".towns")!.onclick = () => { el.remove(); o.onTowns(); };
  return { unmount: () => el.remove() };
}
