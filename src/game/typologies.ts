/** The player's palette: a fixed set of HDB typologies, footprints in local metres centred at the origin. */
export type TypologyId = "slab" | "point" | "l" | "courtyard" | "mscp" | "pavilion";

/** Axis-aligned rectangle in local metres, for overlap tests. */
export interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface Typology {
  id: TypologyId;
  label: string;
  short: string;
  /** Outline rings in local metres (x east, y north), one per part. */
  parts: [number, number][][];
  /** Rectangle decomposition of the footprint (same frame as parts). */
  rects: Rect[];
  unitsPerFloor: number;
  minStoreys: number;
  maxStoreys: number;
  residential: boolean;
  /** Blockage at pedestrian level when the ground floor is closed. */
  sigma: number;
  /** Metres per storey (plus a roof/void allowance added once). */
  storeyM: number;
  footprintM2: number;
}

export const RESIDENTS_PER_FLAT = 3.2;
export const VOID_DECK_M = 4.5;

function rect(cx: number, cy: number, w: number, h: number): [number, number][] {
  return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2], [cx - w / 2, cy - h / 2]];
}

function area(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return Math.abs(a) / 2;
}

function define(t: Omit<Typology, "footprintM2">): Typology {
  return { ...t, footprintM2: t.parts.reduce((s, r) => s + area(r), 0) };
}

/** Plus-shaped point block: 26 m across, 12 m wide arms. */
const PLUS: [number, number][] = [
  [-6, -13], [6, -13], [6, -6], [13, -6], [13, 6], [6, 6], [6, 13], [-6, 13], [-6, 6], [-13, 6], [-13, -6], [-6, -6], [-6, -13],
];
/** L block: two 40 x 14 m arms, centred on the corner's centroid. */
const L: [number, number][] = [
  [-13, -13], [27, -13], [27, 1], [1, 1], [1, 27], [-13, 27], [-13, -13],
];

export const TYPOLOGIES: Typology[] = [
  define({ id: "slab", label: "Slab block", short: "Slab", parts: [rect(0, 0, 54, 13)], rects: [{ cx: 0, cy: 0, w: 54, h: 13 }], unitsPerFloor: 7, minStoreys: 10, maxStoreys: 16, residential: true, sigma: 1, storeyM: 3 }),
  define({ id: "point", label: "Point block", short: "Point", parts: [PLUS], rects: [{ cx: 0, cy: 0, w: 12, h: 26 }, { cx: 0, cy: 0, w: 26, h: 12 }], unitsPerFloor: 6, minStoreys: 20, maxStoreys: 50, residential: true, sigma: 1, storeyM: 3 }),
  define({ id: "l", label: "L / staggered block", short: "L-block", parts: [L], rects: [{ cx: 7, cy: -6, w: 40, h: 14 }, { cx: -6, cy: 7, w: 14, h: 40 }], unitsPerFloor: 6, minStoreys: 12, maxStoreys: 30, residential: true, sigma: 1, storeyM: 3 }),
  define({
    id: "courtyard", label: "Courtyard cluster", short: "Courtyard",
    parts: [rect(0, 27, 40, 14), rect(0, -27, 40, 14), rect(27, 0, 14, 40), rect(-27, 0, 14, 40)],
    rects: [{ cx: 0, cy: 27, w: 40, h: 14 }, { cx: 0, cy: -27, w: 40, h: 14 }, { cx: 27, cy: 0, w: 14, h: 40 }, { cx: -27, cy: 0, w: 14, h: 40 }],
    unitsPerFloor: 16, minStoreys: 10, maxStoreys: 20, residential: true, sigma: 1, storeyM: 3,
  }),
  define({ id: "mscp", label: "Multi-storey carpark", short: "Carpark", parts: [rect(0, 0, 60, 35)], rects: [{ cx: 0, cy: 0, w: 60, h: 35 }], unitsPerFloor: 0, minStoreys: 5, maxStoreys: 5, residential: false, sigma: 1, storeyM: 2.8 }),
  define({ id: "pavilion", label: "Precinct pavilion", short: "Pavilion", parts: [rect(0, 0, 30, 30)], rects: [{ cx: 0, cy: 0, w: 30, h: 30 }], unitsPerFloor: 0, minStoreys: 1, maxStoreys: 1, residential: false, sigma: 0.3, storeyM: 4.5 }),
];

export function typology(id: TypologyId): Typology {
  return TYPOLOGIES.find((t) => t.id === id)!;
}

/** Column footprints (1.2 m squares) along a part's outline, inset, every ~6 m, for the void-deck look. */
export function columnsFor(ring: [number, number][], spacing = 6, inset = 0.9, size = 1.2): [number, number][][] {
  const out: [number, number][][] = [];
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!, b = ring[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < ring.length - 2) continue; // shared corner handled by the next edge
      const t = k / n;
      let x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      // inset toward the part's centroid
      const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1;
      x += (dx / d) * inset;
      y += (dy / d) * inset;
      out.push(rect(x, y, size, size));
    }
  }
  return out;
}
