import type { LevelIndexEntry } from "../game/level-types";

/** Town picker card on the overview map. */
export function mountSelect(root: HTMLElement, levels: LevelIndexEntry[], onPick: (id: string) => void): { hide(): void; show(): void } {
  root.innerHTML = "";
  const card = document.createElement("section");
  card.className = "select";
  const h = document.createElement("h2");
  h.textContent = "Pick a town";
  card.append(h);
  for (const l of levels) {
    const b = document.createElement("button");
    b.className = "town";
    b.innerHTML = `<strong>${l.name}</strong><em>${l.subzone.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</em><span>${l.tagline}</span>`;
    b.onclick = () => onPick(l.id);
    card.append(b);
  }
  root.append(card);
  return {
    hide: () => card.setAttribute("hidden", ""),
    show: () => card.removeAttribute("hidden"),
  };
}
