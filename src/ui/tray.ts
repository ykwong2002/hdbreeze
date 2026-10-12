const SIZE: Record<string, string> = { slab: "54 m", point: "26 m", l: "40 m", mscp: "60 m", courtyard: "", pavilion: "" };
import type { Blocks } from "../game/blocks";
import { typology, type TypologyId } from "../game/typologies";

/** Bottom tray: one chip per block type with the count left to place. Tap a chip to choose what the next area tap places. */
export interface Tray {
  selected(): TypologyId | null;
  refresh(): void;
  shake(): void;
  unmount(): void;
}

export function mountTray(root: HTMLElement, blocks: Blocks, onSelect: (t: TypologyId | null) => void, onDragStart?: (t: TypologyId, ev: PointerEvent) => void): Tray {
  const el = document.createElement("section");
  el.className = "tray";
  const hint = document.createElement("div");
  hint.className = "tray-hint";
  const row = document.createElement("div");
  row.className = "tray-row";
  el.append(hint, row);
  root.append(el);
  let selected: TypologyId | null = null;
  const chips = new Map<TypologyId, HTMLButtonElement>();
  for (const item of blocks.level.tray) {
    const b = document.createElement("button");
    b.className = "chip chip-tray";
    b.innerHTML = `<span class="tray-icon tray-${item.type}"></span><span class="tray-name">${typology(item.type).short}${SIZE[item.type] ? ` · ${SIZE[item.type]}` : ""}</span><span class="tray-count"></span>`;
    b.onclick = () => {
      selected = item.type;
      onSelect(selected);
      refresh();
    };
    b.onpointerdown = (down) => {
      if (b.disabled || !onDragStart) return;
      const id = down.pointerId, x0 = down.clientX, y0 = down.clientY;
      const stop = (): void => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
      const move = (ev: PointerEvent): void => {
        if (ev.pointerId !== id) return;
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (-dy > 14 && -dy > Math.abs(dx)) {
          // lifted up out of the tray: this is a drop, not a scroll
          stop();
          selected = item.type;
          onSelect(selected);
          refresh();
          onDragStart(item.type, ev);
        } else if (Math.abs(dx) > 14) stop(); // sideways: let the row scroll
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    };
    chips.set(item.type, b);
    row.append(b);
  }
  function refresh(): void {
    const tray = blocks.tray();
    let firstAvailable: TypologyId | null = null;
    for (const t of tray) {
      const chip = chips.get(t.type)!;
      chip.querySelector(".tray-count")!.textContent = `×${t.remaining}`;
      chip.disabled = t.remaining <= 0;
      if (t.remaining > 0 && !firstAvailable) firstAvailable = t.type;
    }
    if (selected && blocks.remaining(selected) <= 0) selected = null;
    if (!selected) selected = firstAvailable;
    for (const [type, chip] of chips) chip.classList.toggle("on", type === selected);
    const left = blocks.total() - blocks.blocks.length;
    hint.textContent = left > 0 ? `Drag a ${selected ? typology(selected).short.toLowerCase() : "block"} into a glowing area · ${left} left` : "All placed. Drag to move, twist two fingers to turn, tap for more.";
    onSelect(selected);
  }
  refresh();
  blocks.onChange(refresh);
  return {
    selected: () => selected,
    refresh,
    shake() {
      el.classList.remove("shake");
      void el.offsetWidth;
      el.classList.add("shake");
    },
    unmount: () => el.remove(),
  };
}
