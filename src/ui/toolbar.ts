import type { Map as MlMap } from "maplibre-gl";
import type { Block, Blocks } from "../game/blocks";
import { typology } from "../game/typologies";

/** Floating toolbar above the selected block: rotate, height, void deck, move, remove. */
export interface Toolbar {
  show(id: string): void;
  hide(): void;
  refresh(): void;
  moveMode(): boolean;
  unmount(): void;
}

export function mountToolbar(root: HTMLElement, map: MlMap, blocks: Blocks, onDone: () => void): Toolbar {
  const el = document.createElement("div");
  el.className = "toolbar";
  el.hidden = true;
  el.innerHTML = `
    <div class="tb-head"><span class="tb-name">Block</span><button class="tb-close" aria-label="Done">✕</button></div>
    <div class="tb-row">
    ${window.matchMedia("(pointer: coarse)").matches ? "" : '<button class="tb rotate" title="Rotate">⟳<small>turn 45°</small></button>'}
    <button class="tb height" title="Height"><span class="tb-st">16</span><small>height</small></button>
    <button class="tb void" title="Void deck">⌂<small>void deck</small></button>
    <button class="tb remove" title="Remove">✕<small>remove</small></button>
    </div>
    <p class="tb-tip">drag to move · twist two fingers to turn</p>`;
  root.append(el);
  let id: string | null = null;
  let move = false;
  const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
  const rot = el.querySelector<HTMLButtonElement>(".rotate");
  if (rot) rot.onclick = () => { if (id) { const r = blocks.rotate(id); if (!r.ok) shake(); } };
  q<HTMLButtonElement>(".height").onclick = () => { if (id) blocks.cycleHeight(id); };
  q<HTMLButtonElement>(".void").onclick = () => { if (id) blocks.toggleVoid(id); };
  q<HTMLButtonElement>(".remove").onclick = () => { if (id) blocks.remove(id); hide(); onDone(); };
  q<HTMLButtonElement>(".tb-close").onclick = () => { hide(); onDone(); };

  function shake(): void {
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }
  function refresh(): void {
    if (!id) return;
    const b: Block | undefined = blocks.get(id);
    if (!b) { hide(); return; }
    const t = typology(b.type);
    q<HTMLElement>(".tb-name").textContent = t.label;
    q<HTMLElement>(".height .tb-st").textContent = t.residential ? `${blocks.storeys(b)}` : "–";
    q<HTMLElement>(".height small").textContent = t.residential ? `${b.height} · storeys` : "fixed";
    q<HTMLButtonElement>(".height").disabled = !t.residential;
    q<HTMLButtonElement>(".void").disabled = !t.residential;
    q<HTMLButtonElement>(".void").classList.toggle("on", b.voidDeck);
  }
  function show(blockId: string): void {
    id = blockId;
    move = false;
    el.hidden = false;
    refresh();
  }
  function hide(): void {
    id = null;
    move = false;
    el.hidden = true;
  }
  blocks.onChange(refresh);
  void map;
  return { show, hide, refresh, moveMode: () => move, unmount: () => el.remove() };
}
