import { blocksOverlap, fitInside, pointInRing, rectContains, rectCorners } from "./fit";
import type { Area, BakedLevel, HeightStep, LonLat, Ring, TrayItem } from "./level-types";
import { columnsFor, RESIDENTS_PER_FLAT, typology, VOID_DECK_M, type TypologyId } from "./typologies";

/** One player-placed block. */
export interface Block {
  id: string;
  type: TypologyId;
  areaId: string;
  center: LonLat;
  rotDeg: number;
  height: HeightStep;
  voidDeck: boolean;
}

export interface PlacedGeometry {
  blockId: string;
  bodies: { ring: Ring; base: number; height: number }[];
  columns: Ring[];
  obstacleRings: Ring[];
  heightM: number;
  sigma: number;
  homes: number;
}

export type PlaceResult = { ok: true; block: Block } | { ok: false; reason: "tray-empty" | "no-area" | "no-fit" | "overlap" };

const M_PER_DEG_LAT = 111_320;
const HEIGHT_ORDER: HeightStep[] = ["low", "mid", "high"];

export function localToLonLat(center: LonLat, pts: [number, number][], rotDeg: number): Ring {
  const a = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const mLon = M_PER_DEG_LAT * Math.cos((center[1] * Math.PI) / 180);
  return pts.map(([x, y]) => {
    const rx = x * cos - y * sin, ry = x * sin + y * cos;
    return [center[0] + rx / mLon, center[1] + ry / M_PER_DEG_LAT] as LonLat;
  });
}

/** The player's blocks on a level, plus the tray of blocks still to place. */
export class Blocks {
  readonly blocks: Block[] = [];
  private listeners: Array<() => void> = [];
  private seq = 0;

  /** Existing building footprints that touch the site; blocks may not overlap them. */
  private readonly fixed: Ring[];
  /** v5: the whole site is one build area. */
  private readonly siteArea: Area;

  constructor(readonly level: BakedLevel) {
    const site = level.site;
    this.siteArea = { id: "site", label: "Site", polygon: site, areaM2: 0 };
    this.fixed = level.buildings.map((b) => b.fp).filter((fp) => fp.some((p) => pointInRing(p, site)));
  }

  private hitsFixed(center: LonLat, type: TypologyId, rotDeg: number): boolean {
    const corners = typology(type).rects.flatMap((r) => rectCorners(center, r, rotDeg));
    for (const ring of this.fixed) {
      for (const c of corners) if (pointInRing(c, ring)) return true;
      for (const v of ring) if (typology(type).rects.some((r) => rectContains(center, r, rotDeg, v))) return true;
    }
    return false;
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }
  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  storeys(b: Block): number {
    const t = typology(b.type);
    return t.residential ? this.level.heights[b.height] : t.minStoreys;
  }

  homesFor(b: Block): number {
    const t = typology(b.type);
    if (!t.residential) return 0;
    const floors = Math.max(0, this.storeys(b) - (b.voidDeck ? 1 : 0));
    return Math.round(floors * t.unitsPerFloor * RESIDENTS_PER_FLAT);
  }

  homes(): number {
    return this.blocks.reduce((s, b) => s + this.homesFor(b), 0);
  }

  /** Tray: remaining count per type, in the level's order. */
  tray(): (TrayItem & { remaining: number })[] {
    return this.level.tray.map((t) => ({ ...t, remaining: t.count - this.blocks.filter((b) => b.type === t.type).length }));
  }
  remaining(type: TypologyId): number {
    return this.tray().find((t) => t.type === type)?.remaining ?? 0;
  }
  total(): number {
    return this.level.tray.reduce((s, t) => s + t.count, 0);
  }
  allPlaced(): boolean {
    return this.blocks.length >= this.total();
  }

  areaAt(p: LonLat): Area | undefined {
    return pointInRing(p, this.siteArea.polygon) ? this.siteArea : undefined;
  }
  area(_id: string): Area | undefined {
    return this.siteArea;
  }
  get(id: string): Block | undefined {
    return this.blocks.find((b) => b.id === id);
  }

  private fits(area: Area, b: Omit<Block, "id" | "areaId">, ignoreId?: string): { center: LonLat } | PlaceResult {
    const center = fitInside(area.polygon, b.type, b.center, b.rotDeg);
    if (!center) return { ok: false, reason: "no-fit" };
    if (this.hitsFixed(center, b.type, b.rotDeg)) return { ok: false, reason: "overlap" };
    const fp = { center, type: b.type, rotDeg: b.rotDeg };
    for (const other of this.blocks) {
      if (other.id === ignoreId) continue;
      if (blocksOverlap(fp, other)) return { ok: false, reason: "overlap" };
    }
    return { center };
  }

  place(type: TypologyId, at: LonLat, rotDeg = 0): PlaceResult {
    if (this.remaining(type) <= 0) return { ok: false, reason: "tray-empty" };
    const area = this.areaAt(at);
    if (!area) return { ok: false, reason: "no-area" };
    // try the requested rotation first, then the others, so a long slab turns to fit a narrow parcel
    let r: { center: LonLat } | PlaceResult = { ok: false, reason: "no-fit" };
    let rot = rotDeg;
    for (const d of [0, 90, 45, 135]) {
      rot = (rotDeg + d) % 180;
      r = this.fits(area, { type, center: at, rotDeg: rot, height: "mid", voidDeck: false });
      if (!("ok" in r) || (!r.ok && r.reason === "overlap")) break;
    }
    if ("ok" in r) return r;
    const block: Block = { id: `b${++this.seq}`, type, areaId: area.id, center: r.center, rotDeg: rot, height: "mid", voidDeck: false };
    this.blocks.push(block);
    this.emit();
    return { ok: true, block };
  }

  move(id: string, at: LonLat): PlaceResult {
    const b = this.get(id);
    if (!b) return { ok: false, reason: "no-area" };
    const area = this.areaAt(at);
    if (!area) return { ok: false, reason: "no-area" };
    const r = this.fits(area, { ...b, center: at }, id);
    if ("ok" in r) return r;
    b.center = r.center;
    b.areaId = area.id;
    this.emit();
    return { ok: true, block: b };
  }

  rotate(id: string, stepDeg = 45): PlaceResult {
    const b = this.get(id);
    const area = b && this.area(b.areaId);
    if (!b || !area) return { ok: false, reason: "no-area" };
    const rot = (b.rotDeg + stepDeg) % 180;
    const r = this.fits(area, { ...b, rotDeg: rot }, id);
    if ("ok" in r) return r;
    b.rotDeg = rot;
    b.center = r.center;
    this.emit();
    return { ok: true, block: b };
  }

  /** Sets an absolute rotation (degrees) if the block still fits and does not overlap. */
  setRotation(id: string, deg: number): boolean {
    const b = this.get(id);
    const area = b && this.area(b.areaId);
    if (!b || !area) return false;
    const rot = ((Math.round(deg / 5) * 5) % 180 + 180) % 180;
    if (rot === b.rotDeg) return true;
    const r = this.fits(area, { ...b, rotDeg: rot }, id);
    if ("ok" in r) return false;
    b.rotDeg = rot;
    b.center = r.center;
    this.emit();
    return true;
  }

  /** Where a block of this type would land if dropped at `at`, and whether it is allowed. */
  preview(type: TypologyId, at: LonLat, rotDeg: number, ignoreId?: string): { center: LonLat; rotDeg: number; ok: boolean } {
    const area = this.areaAt(at);
    if (!area) return { center: at, rotDeg, ok: false };
    for (const d of [0, 90, 45, 135]) {
      const rot = (rotDeg + d) % 180;
      const r = this.fits(area, { type, center: at, rotDeg: rot, height: "mid", voidDeck: false }, ignoreId);
      if (!("ok" in r)) return { center: r.center, rotDeg: rot, ok: true };
      if (!r.ok && r.reason === "overlap") return { center: at, rotDeg: rot, ok: false };
    }
    return { center: at, rotDeg, ok: false };
  }

  cycleHeight(id: string): Block | undefined {
    const b = this.get(id);
    if (!b || !typology(b.type).residential) return b;
    b.height = HEIGHT_ORDER[(HEIGHT_ORDER.indexOf(b.height) + 1) % HEIGHT_ORDER.length]!;
    this.emit();
    return b;
  }

  setHeight(id: string, h: HeightStep): void {
    const b = this.get(id);
    if (!b) return;
    b.height = h;
    this.emit();
  }

  toggleVoid(id: string): Block | undefined {
    const b = this.get(id);
    if (!b || !typology(b.type).residential) return b;
    b.voidDeck = !b.voidDeck;
    this.emit();
    return b;
  }

  remove(id: string): void {
    const i = this.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    this.blocks.splice(i, 1);
    this.emit();
  }

  clearAll(): void {
    this.blocks.length = 0;
    this.emit();
  }

  geometryFor(b: Block): PlacedGeometry {
    const t = typology(b.type);
    const heightM = this.storeys(b) * t.storeyM + 1.5;
    const base = b.voidDeck ? VOID_DECK_M : 0;
    const bodies = t.parts.map((part) => ({ ring: localToLonLat(b.center, part, b.rotDeg), base, height: heightM }));
    const columns = b.voidDeck ? t.parts.flatMap((part) => columnsFor(part).map((c) => localToLonLat(b.center, c, b.rotDeg))) : [];
    const sigma = b.voidDeck ? 0.15 : t.sigma;
    return { blockId: b.id, bodies, columns, obstacleRings: bodies.map((x) => x.ring), heightM, sigma, homes: this.homesFor(b) };
  }

  geometries(): PlacedGeometry[] {
    return this.blocks.map((b) => this.geometryFor(b));
  }
}
