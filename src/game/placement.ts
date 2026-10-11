import type { Area, BakedLevel, LonLat, Ring } from "./level-types";
import { columnsFor, RESIDENTS_PER_FLAT, typology, VOID_DECK_M, type TypologyId } from "./typologies";

/** One player-placed building on a plot. */
export interface Placed {
  plotId: string;
  type: TypologyId;
  storeys: number;
  rotDeg: number;
  voidDeck: boolean;
  center: LonLat;
}

export interface PlacedGeometry {
  plotId: string;
  /** Body rings in lon/lat with base/height in metres. */
  bodies: { ring: Ring; base: number; height: number }[];
  columns: Ring[];
  /** Obstacle inputs. */
  obstacleRings: Ring[];
  heightM: number;
  sigma: number;
  homes: number;
}

const M_PER_DEG_LAT = 111_320;

export function localToLonLat(center: LonLat, pts: [number, number][], rotDeg: number): Ring {
  const a = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const mLon = M_PER_DEG_LAT * Math.cos((center[1] * Math.PI) / 180);
  return pts.map(([x, y]) => {
    const rx = x * cos - y * sin, ry = x * sin + y * cos;
    return [center[0] + rx / mLon, center[1] + ry / M_PER_DEG_LAT] as LonLat;
  });
}

export function homesFor(type: TypologyId, storeys: number, voidDeck: boolean): number {
  const t = typology(type);
  if (!t.residential) return 0;
  const floors = Math.max(0, storeys - (voidDeck ? 1 : 0));
  return Math.round(floors * t.unitsPerFloor * RESIDENTS_PER_FLAT);
}

/** Storeys allowed for a typology (the typology's own range; plot ratios were dropped in plan v2). */
export function storeyRange(_area: Area, type: TypologyId): { min: number; max: number } {
  const t = typology(type);
  return { min: t.minStoreys, max: t.maxStoreys };
}

export function geometryFor(p: Placed): PlacedGeometry {
  const t = typology(p.type);
  const heightM = p.storeys * t.storeyM + 1.5;
  const base = p.voidDeck ? VOID_DECK_M : 0;
  const bodies = t.parts.map((part) => ({ ring: localToLonLat(p.center, part, p.rotDeg), base, height: heightM }));
  const columns = p.voidDeck ? t.parts.flatMap((part) => columnsFor(part).map((c) => localToLonLat(p.center, c, p.rotDeg))) : [];
  const sigma = p.voidDeck ? 0.15 : t.sigma;
  return { plotId: p.plotId, bodies, columns, obstacleRings: bodies.map((b) => b.ring), heightM, sigma, homes: homesFor(p.type, p.storeys, p.voidDeck) };
}

export class Placement {
  readonly placed = new Map<string, Placed>();
  private listeners: Array<() => void> = [];

  constructor(readonly level: BakedLevel) {}

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }
  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  plot(id: string): Area | undefined {
    return this.level.areas.find((p) => p.id === id);
  }

  /** Places a default block, or moves the existing one, at a point inside the plot. */
  placeOrMove(plotId: string, at: LonLat): Placed {
    const plot = this.plot(plotId);
    if (!plot) throw new Error(`no plot ${plotId}`);
    let p = this.placed.get(plotId);
    if (!p) {
      const range = storeyRange(plot, "slab");
      p = { plotId, type: "slab", storeys: Math.min(12, range.max), rotDeg: 0, voidDeck: false, center: at };
      this.placed.set(plotId, p);
    } else {
      p.center = at;
    }
    this.emit();
    return p;
  }

  update(plotId: string, patch: Partial<Omit<Placed, "plotId" | "center">>): Placed | undefined {
    const p = this.placed.get(plotId);
    const plot = this.plot(plotId);
    if (!p || !plot) return undefined;
    Object.assign(p, patch);
    const range = storeyRange(plot, p.type);
    p.storeys = Math.max(range.min, Math.min(range.max, p.storeys));
    if (!typology(p.type).residential) p.voidDeck = false;
    this.emit();
    return p;
  }

  clear(plotId: string): void {
    if (this.placed.delete(plotId)) this.emit();
  }

  geometries(): PlacedGeometry[] {
    return [...this.placed.values()].map(geometryFor);
  }

  totalHomes(): number {
    let n = 0;
    for (const p of this.placed.values()) n += homesFor(p.type, p.storeys, p.voidDeck);
    return n;
  }
}
