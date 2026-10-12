import type { LevelIndexEntry } from "../game/level-types";

/** Town picker card on the overview map. */
export function mountSelect(root: HTMLElement, towns: LevelIndexEntry[], starsFor: (townId: string) => string, onPick: (id: string) => void): { hide(): void; show(): void } {
  const card = document.createElement("section");
  card.className = "select";
  const render = (): void => {
    card.innerHTML = `<h2>Pick a town</h2>`;
    for (const t of towns) {
      const b = document.createElement("button");
      b.className = "town";
      b.innerHTML = `<strong>${t.name}</strong><em>${t.plots ?? 3} plots · ${starsFor(t.id)}</em><span>${t.tagline}</span>`;
      b.onclick = () => onPick(t.id);
      card.append(b);
    }
  };
  render();
  root.append(card);
  return {
    hide: () => card.setAttribute("hidden", ""),
    show: () => { render(); card.removeAttribute("hidden"); },
  };
}
