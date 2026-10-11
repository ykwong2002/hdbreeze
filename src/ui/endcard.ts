import type { ScoreState } from "../game/scoring";

export interface EndCardOptions {
  levelName: string;
  state: ScoreState;
  stars: number;
  threshold: number;
  targetHomes: number;
  marginScore: number;
  /** Re-reads the live score so the card matches the HUD. */
  live?: () => { state: ScoreState; stars: number };
  onContinue(): void;
  onTowns(): void;
  /** Produces the share image; absent when capture is unavailable. */
  image?: () => Promise<Blob>;
}

/** Level-cleared card with a share button (Web Share API, clipboard fallback). */
export function showEndCard(root: HTMLElement, o: EndCardOptions): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "endcard";
  const stars = "★".repeat(o.stars) + "☆".repeat(3 - o.stars);
  const margin = o.state.satisfaction >= o.marginScore;
  const extra = o.state.homes >= 1.2 * o.targetHomes;
  el.innerHTML = `
    <div class="endcard-box">
      <div class="endcard-stars">${stars}</div>
      <h2>${o.levelName} cleared</h2>
      <p class="endcard-score"><strong>${o.state.satisfaction.toFixed(0)}</strong> satisfaction · ${o.state.homes.toLocaleString()} residents housed</p>
      <p class="endcard-sub">Feels like ${o.state.meanFeelsLike.toFixed(1)} °C on the walkways.</p>
      <ul class="endcard-stars-why">
        <li>★ Cleared the level</li>
        <li class="${margin ? "got" : "missed"}">★ Clear margin (score ${o.marginScore}+)</li>
        <li class="${extra ? "got" : "missed"}">★ 20% more homes than needed (${Math.ceil(1.2 * o.targetHomes).toLocaleString()}+)</li>
      </ul>
      <div class="endcard-btns">
        <button class="btn btn-primary share">Share image</button>
        <button class="btn share-text">Copy text</button>
        <button class="btn cont">Keep building</button>
        <button class="btn towns">Towns</button>
      </div>
      <p class="endcard-note share-note" hidden>Copied to clipboard.</p>
    </div>`;
  root.append(el);
  // keep the number in step with the HUD while the card is up
  const live = window.setInterval(() => {
    const l = o.live?.();
    if (!l) return;
    el.querySelector<HTMLElement>(".endcard-score strong")!.textContent = l.state.satisfaction.toFixed(0);
    el.querySelector<HTMLElement>(".endcard-stars")!.textContent = "★".repeat(l.stars) + "☆".repeat(3 - l.stars);
    el.querySelectorAll<HTMLElement>(".endcard-stars-why li")[1]!.className = l.state.satisfaction >= o.marginScore ? "got" : "missed";
  }, 500);
  const stop = (): void => window.clearInterval(live);
  const text = `I ventilated ${o.levelName} in HDBreeze 🌬️ ${stars} satisfaction ${o.state.satisfaction.toFixed(0)}/100, ${o.state.homes.toLocaleString()} residents housed. Can you beat it? ${location.origin}${location.pathname}`;
  const note = el.querySelector<HTMLElement>(".share-note")!;
  el.querySelector<HTMLButtonElement>(".share-text")!.onclick = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    try {
      if (nav.share) await nav.share({ text });
      else { await navigator.clipboard.writeText(text); note.textContent = "Copied to clipboard."; note.hidden = false; }
    } catch { /* user cancelled */ }
  };
  el.querySelector<HTMLButtonElement>(".share")!.onclick = async () => {
    try {
      if (!o.image) throw new Error("no capture");
      const { shareImage } = await import("../share/capture");
      const how = await shareImage(await o.image(), text);
      if (how === "downloaded") { note.textContent = "Image saved. Share it with the text below."; note.hidden = false; }
    } catch (e) {
      console.warn("[hdbreeze] image share failed", e);
      note.textContent = "Could not make the image on this browser; use Copy text.";
      note.hidden = false;
    }
  };
  el.querySelector<HTMLButtonElement>(".cont")!.onclick = () => { stop(); el.remove(); o.onContinue(); };
  el.querySelector<HTMLButtonElement>(".towns")!.onclick = () => { stop(); el.remove(); o.onTowns(); };
  return { unmount: () => { stop(); el.remove(); } };
}
