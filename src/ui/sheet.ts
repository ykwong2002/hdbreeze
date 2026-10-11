import type { Placement, Placed } from "../game/placement";
import { homesFor, storeyRange } from "../game/placement";
import { TYPOLOGIES, typology, type TypologyId } from "../game/typologies";

/** Bottom sheet for editing the block on the selected plot. Thumb-sized controls, no drag on the map. */
export interface Sheet {
  open(plotId: string): void;
  close(): void;
  refresh(): void;
  unmount(): void;
}

export function mountSheet(root: HTMLElement, placement: Placement, onClose: () => void): Sheet {
  const el = document.createElement("section");
  el.className = "sheet";
  el.hidden = true;
  el.innerHTML = `
    <header class="sheet-head"><div><strong class="sheet-title"></strong><span class="sheet-sub"></span></div><button class="sheet-close" aria-label="Done">Done</button></header>
    <div class="chips"></div>
    <label class="row"><span>Storeys</span><input type="range" class="storeys" min="1" max="50" step="1" /><output class="storeys-out"></output></label>
    <label class="row"><span>Rotate</span><input type="range" class="rot" min="0" max="180" step="5" /><output class="rot-out"></output></label>
    <label class="row switch"><span>Void deck <small>open ground floor, costs one floor</small></span><input type="checkbox" class="void" /></label>
    <div class="sheet-foot"><span class="homes"></span><button class="sheet-clear">Remove</button></div>`;
  root.append(el);

  const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
  const chips = q<HTMLDivElement>(".chips");
  const storeys = q<HTMLInputElement>(".storeys");
  const storeysOut = q<HTMLOutputElement>(".storeys-out");
  const rot = q<HTMLInputElement>(".rot");
  const rotOut = q<HTMLOutputElement>(".rot-out");
  const voidDeck = q<HTMLInputElement>(".void");
  const homes = q<HTMLSpanElement>(".homes");
  let plotId: string | null = null;

  for (const t of TYPOLOGIES) {
    const b = document.createElement("button");
    b.className = "chip chip-type";
    b.dataset.type = t.id;
    b.textContent = t.short;
    b.onclick = () => {
      if (!plotId) return;
      placement.update(plotId, { type: t.id });
      refresh();
    };
    chips.append(b);
  }
  storeys.oninput = () => {
    if (!plotId) return;
    placement.update(plotId, { storeys: Number(storeys.value) });
    refresh();
  };
  rot.oninput = () => {
    if (!plotId) return;
    placement.update(plotId, { rotDeg: Number(rot.value) });
    refresh();
  };
  voidDeck.onchange = () => {
    if (!plotId) return;
    placement.update(plotId, { voidDeck: voidDeck.checked });
    refresh();
  };
  q<HTMLButtonElement>(".sheet-close").onclick = () => {
    close();
    onClose();
  };
  q<HTMLButtonElement>(".sheet-clear").onclick = () => {
    if (!plotId) return;
    placement.clear(plotId);
    close();
    onClose();
  };

  function refresh(): void {
    if (!plotId) return;
    const plot = placement.plot(plotId);
    const p: Placed | undefined = placement.placed.get(plotId);
    if (!plot || !p) {
      close();
      return;
    }
    const t = typology(p.type);
    const range = storeyRange(plot, p.type);
    q<HTMLElement>(".sheet-title").textContent = plot.label;
    q<HTMLElement>(".sheet-sub").textContent = ` · ${(plot.areaM2 / 10000).toFixed(1)} ha`;
    for (const b of chips.querySelectorAll<HTMLButtonElement>(".chip-type")) b.classList.toggle("on", b.dataset.type === p.type);
    storeys.min = String(range.min);
    storeys.max = String(range.max);
    storeys.value = String(p.storeys);
    storeys.disabled = range.min === range.max;
    storeysOut.textContent = `${p.storeys}${range.max < t.maxStoreys ? " (cap)" : ""}`;
    rot.value = String(p.rotDeg);
    rotOut.textContent = `${p.rotDeg}°`;
    voidDeck.checked = p.voidDeck;
    voidDeck.disabled = !t.residential;
    const h = homesFor(p.type, p.storeys, p.voidDeck);
    homes.textContent = t.residential ? `${h.toLocaleString()} residents` : t.label;
  }
  function open(id: string): void {
    plotId = id;
    el.hidden = false;
    refresh();
  }
  function close(): void {
    plotId = null;
    el.hidden = true;
  }
  return { open, close, refresh, unmount: () => el.remove() };
}

export type { TypologyId };
