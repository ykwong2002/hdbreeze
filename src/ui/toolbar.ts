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
    <button class="tb rotate" title="Rotate">⟳<small>rotate</small></button>
    <button class="tb height" title="Height"><span class="tb-st">16</span><small>height</small></button>
    <button class="tb void" title="Void deck">⌂<small>void deck</small></button>
    <button class="tb move" title="Move">✥<small>move</small></button>
    <button class="tb remove" title="Remove">✕<small>remove</small></button>`;
  root.append(el);
  let id: string | null = null;
  let move = false;
  const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
  q<HTMLButtonElement>(".rotate").onclick = () => { if (id) { const r = blocks.rotate(id); if (!r.ok) shake(); } };
  q<HTMLButtonElement>(".height").onclick = () => { if (id) blocks.cycleHeight(id); };
  q<HTMLButtonElement>(".void").onclick = () => { if (id) blocks.toggleVoid(id); };
  q<HTMLButtonElement>(".move").onclick = () => { move = !move; refresh(); };
  q<HTMLButtonElement>(".remove").onclick = () => { if (id) blocks.remove(id); hide(); onDone(); };

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
    q<HTMLElement>(".height .tb-st").textContent = t.residential ? `${blocks.storeys(b)}` : "–";
    q<HTMLElement>(".height small").textContent = t.residential ? `${b.height} · storeys` : "fixed";
    q<HTMLButtonElement>(".height").disabled = !t.residential;
    q<HTMLButtonElement>(".void").disabled = !t.residential;
    q<HTMLButtonElement>(".void").classList.toggle("on", b.voidDeck);
    q<HTMLButtonElement>(".move").classList.toggle("on", move);
    q<HTMLElement>(".move small").textContent = move ? "tap spot" : "move";
  }
  const tick = (): void => {
    if (!el.hidden && id) {
      const b = blocks.get(id);
      if (b) {
        const p = map.project(b.center);
        const half = el.offsetWidth / 2 + 8;
        const x = Math.max(half, Math.min(window.innerWidth - half, p.x));
        const y = Math.max(el.offsetHeight + 70, Math.min(window.innerHeight - 140, p.y - 28));
        el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
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
  return { show, hide, refresh, moveMode: () => move, unmount: () => { cancelAnimationFrame(raf); el.remove(); } };
}
