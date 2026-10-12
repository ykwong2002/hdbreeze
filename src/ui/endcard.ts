import type { ScoreState } from "../game/scoring";
import { ICON } from "./icons";

export interface EndCardOptions {
  townName: string;
  plotLabel: string;
  plotIndex: number;
  plotCount: number;
  state: ScoreState;
  stars: number;
  minPct: number;
  starPct: number;
  targetHomes: number;
  /** The plot's technique, for the third-star line. */
  technique: string;
  lesson: string;
  /** Town totals when this was the last plot. */
  townSummary?: { homes: number; avgPct: number; stars: number };
  onNext(): void;
  onTown(): void;
  onReplay(): void;
  image?: () => Promise<Blob>;
}

/** Plot-cleared card (or town-cleared when it was the last plot) with share. */
export function showEndCard(root: HTMLElement, o: EndCardOptions): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "endcard";
  const stars = "★".repeat(o.stars) + "☆".repeat(3 - o.stars);
  const last = !!o.townSummary;
  const title = last ? `${o.townName} cleared!` : `Plot ${o.plotIndex} of ${o.plotCount} cleared`;
  const summary = last
    ? `<p class="endcard-score"><strong>${o.townSummary!.homes.toLocaleString()}</strong> people housed across ${o.plotCount} plots · ${o.townSummary!.avgPct}% breathable on average · ${o.townSummary!.stars} / ${o.plotCount * 3} ★</p>`
    : `<p class="endcard-score"><strong>${o.minPct}%</strong> breathable · ${o.state.homes.toLocaleString()} people housed</p>`;
  el.innerHTML = `
    <div class="endcard-box">
      <div class="endcard-stars">${stars}</div>
      <h2>${title}</h2>
      <p class="endcard-sub">${o.plotLabel}</p>
      ${summary}
      <p class="endcard-lesson">${ICON.bulb} ${o.lesson}</p>
      <p class="endcard-stars-h">Stars</p>
      <ul class="endcard-stars-why">
        <li>★ Cleared the plot</li>
        <li class="${o.minPct >= o.starPct && o.state.spotsMargin ? "got" : "missed"}">★ ${o.starPct}%+ breathable in every monsoon</li>
        <li class="${o.stars >= 3 ? "got" : "missed"}">★ ${o.technique}, or 90%+ breathable, or 15% more homes</li>
      </ul>
      <div class="endcard-btns">
        <button class="btn btn-primary share">Share image</button>
        ${last ? '<button class="btn town">Town overview</button>' : '<button class="btn next">Next plot →</button>'}
        <button class="btn replay">Keep building</button>
        ${last ? "" : '<button class="btn town">Town overview</button>'}
        <button class="btn btn-link share-text">copy as text instead</button>
      </div>
      <p class="endcard-note share-note" hidden>Copied to clipboard.</p>
    </div>`;
  root.append(el);
  const text = last
    ? `I planned ${o.townName} in HDBreeze: ${o.townSummary!.homes.toLocaleString()} people housed, ${o.townSummary!.avgPct}% breathable, ${o.townSummary!.stars}★. Can you plan a cooler town? Can or not? ${location.origin}${location.pathname}`
    : `I cleared ${o.plotLabel} (${o.townName}) in HDBreeze ${stars} ${o.minPct}% breathable, ${o.state.homes.toLocaleString()} people housed. Can or not? ${location.origin}${location.pathname}`;
  const note = el.querySelector<HTMLElement>(".share-note")!;
  el.querySelector<HTMLButtonElement>(".share-text")!.onclick = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    try {
      if (nav.share) await nav.share({ text });
      else { await navigator.clipboard.writeText(text); note.textContent = "Copied to clipboard."; note.hidden = false; }
    } catch { /* cancelled */ }
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
  el.querySelector<HTMLButtonElement>(".next")?.addEventListener("click", () => { el.remove(); o.onNext(); });
  el.querySelector<HTMLButtonElement>(".replay")!.onclick = () => { el.remove(); o.onReplay(); };
  el.querySelectorAll<HTMLButtonElement>(".town").forEach((b) => { b.onclick = () => { el.remove(); o.onTown(); }; });
  return { unmount: () => el.remove() };
}
