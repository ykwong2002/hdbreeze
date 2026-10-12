import type { Map as MlMap } from "maplibre-gl";

/**
 * Touch rules for the whole app (mouse is untouched):
 *   one finger      never moves the map (so dragging a block never pans by accident)
 *   two fingers     drag the map, pinch to zoom; with a block selected, twisting turns the block
 *   three-finger tap  tilts the view between flat and 3D
 */
export interface BlockRotator {
  selected(): string | null;
  setRotation(id: string, deg: number): void;
}

export function mountMapTouch(map: MlMap): { setRotator(r: BlockRotator | null): void; unmount(): void } {
  const container = map.getContainer();
  let rotator: BlockRotator | null = null;
  let two: { cx: number; cy: number; dist: number; angle: number; rot0: number | null; id: string | null; zoom0: number } | null = null;
  let threeAt = 0;
  const centroid = (t: TouchList): { x: number; y: number; dist: number; angle: number } => {
    const a = t[0]!, b = t[1]!;
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), angle: (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI };
  };
  const onStart = (ev: TouchEvent): void => {
    if (ev.touches.length === 1) { ev.stopPropagation(); return; }
    if (ev.touches.length === 2) {
      const c = centroid(ev.touches);
      const id = rotator?.selected() ?? null;
      two = { cx: c.x, cy: c.y, dist: c.dist, angle: c.angle, rot0: null, id, zoom0: map.getZoom() };
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (ev.touches.length >= 3) {
      two = null;
      threeAt = performance.now();
      ev.preventDefault();
      ev.stopPropagation();
    }
  };
  const onMove = (ev: TouchEvent): void => {
    if (ev.touches.length === 1) { ev.stopPropagation(); return; }
    if (ev.touches.length === 2 && two) {
      const c = centroid(ev.touches);
      if (two.id) {
        // twist turns the selected block; screen angles are clockwise-positive
        const delta = -(c.angle - two.angle);
        if (two.rot0 === null) two.rot0 = currentRotation(two.id);
        if (two.rot0 !== null) rotator?.setRotation(two.id, two.rot0 + delta);
      } else {
        map.panBy([two.cx - c.x, two.cy - c.y], { duration: 0 });
        map.setZoom(two.zoom0 + Math.log2(c.dist / two.dist));
        two.cx = c.x; two.cy = c.y;
      }
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (ev.touches.length >= 3) { ev.preventDefault(); ev.stopPropagation(); }
  };
  const onEnd = (ev: TouchEvent): void => {
    if (threeAt && ev.touches.length === 0 && performance.now() - threeAt < 450) {
      map.easeTo({ pitch: map.getPitch() > 20 ? 0 : 55, duration: 600 });
    }
    if (ev.touches.length === 0) threeAt = 0;
    if (ev.touches.length < 2) two = null;
    ev.stopPropagation();
  };
  let rotationOf: ((id: string) => number | null) | null = null;
  const currentRotation = (id: string): number | null => rotationOf?.(id) ?? null;

  map.touchZoomRotate.disable();
  map.touchPitch.disable();
  container.addEventListener("touchstart", onStart, { capture: true, passive: false });
  container.addEventListener("touchmove", onMove, { capture: true, passive: false });
  container.addEventListener("touchend", onEnd, true);
  container.addEventListener("touchcancel", onEnd, true);
  return {
    setRotator(r) {
      rotator = r;
      rotationOf = r ? (id) => (r as BlockRotator & { rotation?: (id: string) => number | null }).rotation?.(id) ?? null : null;
    },
    unmount() {
      container.removeEventListener("touchstart", onStart, true);
      container.removeEventListener("touchmove", onMove, true);
      container.removeEventListener("touchend", onEnd, true);
      container.removeEventListener("touchcancel", onEnd, true);
      map.touchZoomRotate.enable();
      map.touchPitch.enable();
    },
  };
}
