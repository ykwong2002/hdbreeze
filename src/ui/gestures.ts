import type { Map as MlMap } from "maplibre-gl";
import type { LevelSession } from "../game/level";
import type { TypologyId } from "../game/typologies";
import { PLACED_LAYER } from "../map/placed";
import { ensureGhostLayer, hideGhost, showGhost } from "../map/ghost";

/**
 * Touch-first block handling:
 *  - drag a chip from the tray onto an area to place a block (ghost footprint shows the landing spot)
 *  - drag a placed block to move it; a short tap selects it
 *  - with a block selected, twist two fingers anywhere to rotate it (the map stays still)
 * One-finger drags on empty map still pan.
 */
export interface Gestures {
  beginTrayDrag(type: TypologyId, ev: PointerEvent): void;
  unmount(): void;
}

const TAP_PX = 8;

export function mountGestures(map: MlMap, session: LevelSession, root: HTMLElement): Gestures {
  ensureGhostLayer(map);
  const container = map.getContainer();
  const canvas = map.getCanvas();
  const ghostEl = document.createElement("div");
  ghostEl.className = "drag-ghost";
  ghostEl.hidden = true;
  root.append(ghostEl);

  // ---- tray drag (pointer events on the chip, captured)
  let trayDrag: { type: TypologyId; pointerId: number } | null = null;
  const onTrayMove = (ev: PointerEvent): void => {
    if (!trayDrag || ev.pointerId !== trayDrag.pointerId) return;
    ghostEl.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -140%)`;
    const ll = map.unproject(toCanvas(ev));
    const p = session.blocks.preview(trayDrag.type, [ll.lng, ll.lat], 0);
    if (session.blocks.areaAt([ll.lng, ll.lat])) showGhost(map, trayDrag.type, p.center, p.rotDeg, p.ok);
    else hideGhost(map);
  };
  const onTrayUp = (ev: PointerEvent): void => {
    if (!trayDrag || ev.pointerId !== trayDrag.pointerId) return;
    const type = trayDrag.type;
    trayDrag = null;
    ghostEl.hidden = true;
    hideGhost(map);
    window.removeEventListener("pointermove", onTrayMove);
    window.removeEventListener("pointerup", onTrayUp);
    window.removeEventListener("pointercancel", onTrayUp);
    const r = container.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
    const ll = map.unproject(toCanvas(ev));
    session.trayType = type;
    const res = session.tap([ll.lng, ll.lat], null);
    if (typeof res === "object" && !res.ok) session.reject(res.reason);
  };
  const beginTrayDrag = (type: TypologyId, ev: PointerEvent): void => {
    trayDrag = { type, pointerId: ev.pointerId };
    ghostEl.textContent = type;
    ghostEl.hidden = false;
    ghostEl.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -140%)`;
    window.addEventListener("pointermove", onTrayMove);
    window.addEventListener("pointerup", onTrayUp);
    window.addEventListener("pointercancel", onTrayUp);
  };

  // ---- block drag / tap on the map (single pointer)
  let blockDrag: { id: string; pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
  const hitBlock = (ev: PointerEvent): string | null => {
    const f = map.queryRenderedFeatures(toCanvas(ev), { layers: [PLACED_LAYER] })[0];
    return (f?.properties?.block as string | undefined) ?? null;
  };
  const onDown = (ev: PointerEvent): void => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (rotating) return;
    const id = hitBlock(ev);
    if (!id) return;
    blockDrag = { id, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, moved: false };
    map.dragPan.disable();
    session.select(id);
  };
  const onMove = (ev: PointerEvent): void => {
    if (!blockDrag || ev.pointerId !== blockDrag.pointerId) return;
    if (!blockDrag.moved && Math.hypot(ev.clientX - blockDrag.startX, ev.clientY - blockDrag.startY) < TAP_PX) return;
    blockDrag.moved = true;
    const ll = map.unproject(toCanvas(ev));
    const b = session.blocks.get(blockDrag.id);
    if (!b) return;
    const p = session.blocks.preview(b.type, [ll.lng, ll.lat], b.rotDeg, b.id);
    if (p.ok) session.blocks.move(b.id, [ll.lng, ll.lat]);
    showGhost(map, b.type, p.ok ? p.center : [ll.lng, ll.lat], p.ok ? p.rotDeg : b.rotDeg, p.ok);
  };
  const onUp = (ev: PointerEvent): void => {
    if (!blockDrag || ev.pointerId !== blockDrag.pointerId) return;
    const wasDrag = blockDrag.moved;
    blockDrag = null;
    hideGhost(map);
    map.dragPan.enable();
    if (wasDrag) session.suppressNextClick();
  };

  // ---- two-finger rotate while a block is selected (touch events, capture phase)
  let rotating: { id: string; angle0: number; rot0: number } | null = null;
  const angleOf = (t: TouchList): number => Math.atan2(t[1]!.clientY - t[0]!.clientY, t[1]!.clientX - t[0]!.clientX) * 180 / Math.PI;
  const onTouchStart = (ev: TouchEvent): void => {
    if (ev.touches.length !== 2 || !session.selectedBlock) return;
    const b = session.blocks.get(session.selectedBlock);
    if (!b) return;
    rotating = { id: b.id, angle0: angleOf(ev.touches), rot0: b.rotDeg };
    blockDrag = null;
    hideGhost(map);
    map.touchZoomRotate.disable();
    map.dragPan.disable();
    ev.preventDefault();
    ev.stopPropagation();
  };
  const onTouchMove = (ev: TouchEvent): void => {
    if (!rotating || ev.touches.length !== 2) return;
    // screen angle is clockwise-positive (y down); block rotation is anticlockwise in map metres
    const delta = -(angleOf(ev.touches) - rotating.angle0);
    session.blocks.setRotation(rotating.id, rotating.rot0 + delta);
    ev.preventDefault();
    ev.stopPropagation();
  };
  const onTouchEnd = (ev: TouchEvent): void => {
    if (!rotating) return;
    if (ev.touches.length < 2) {
      rotating = null;
      map.touchZoomRotate.enable();
      map.dragPan.enable();
      session.suppressNextClick();
    }
  };

  container.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  container.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
  container.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
  container.addEventListener("touchend", onTouchEnd, true);
  container.addEventListener("touchcancel", onTouchEnd, true);

  function toCanvas(ev: { clientX: number; clientY: number }): [number, number] {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  return {
    beginTrayDrag,
    unmount() {
      container.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      container.removeEventListener("touchstart", onTouchStart, true);
      container.removeEventListener("touchmove", onTouchMove, true);
      container.removeEventListener("touchend", onTouchEnd, true);
      container.removeEventListener("touchcancel", onTouchEnd, true);
      ghostEl.remove();
      map.dragPan.enable();
      map.touchZoomRotate.enable();
    },
  };
}
