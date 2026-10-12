/** Shape of public/levels/<id>.json (written by tools/bake). Pure data: new towns need no code. Schema v2. */
export type LonLat = [number, number];
export type Ring = LonLat[];

export interface Season {
  id: string;
  label: string;
  /** Compass direction the wind comes from, degrees. */
  fromDeg: number;
  /** Relative strength, 1 = full. */
  speed: number;
}

export interface BakedBuilding {
  src: "hdb" | "osm";
  /** Height in metres. */
  h: number;
  fp: Ring;
  blk?: string;
  kind?: string;
  storeys?: number;
}

/** A build area: a Master Plan parcel the player may place blocks in. */
export interface Area {
  id: string;
  label: string;
  polygon: Ring;
  areaM2: number;
}

export type TypologyName = "slab" | "point" | "l" | "courtyard" | "mscp" | "pavilion";
export type HeightStep = "low" | "mid" | "high";

export interface TrayItem {
  type: TypologyName;
  count: number;
}

/** A walkway point the breeze cannot reach in the empty town; the player must cool it below targetC. */
export interface HotSpotDef {
  id: string;
  label: string;
  at: LonLat;
  targetC: number;
}

export interface ReferenceBlock {
  type: TypologyName;
  at: LonLat;
  rotDeg: number;
  height: HeightStep;
  voidDeck: boolean;
}

export type GroundKind = "park" | "water" | "road" | "paved";

export interface BakedLevel {
  id: string;
  name: string;
  /** Master Plan 2019 subzone name. */
  subzone: string;
  tagline: string;
  /** One-sentence goal shown when the level starts. */
  brief: string;
  camera: { zoom: number; pitch: number; bearing: number };
  /** Sim cells per side. */
  grid: number;
  wind: { seasons: Season[]; required: string[] };
  /** Sim box [w, s, e, n], square in metres, padded around the subzone. */
  bbox: [number, number, number, number];
  /** Wider box whose buildings are drawn for context. */
  contextBbox: [number, number, number, number];
  /** Subzone outline. */
  district: Ring;
  /** Neighbourhood the player can influence: residents walk here and the field is full colour here. */
  scoreZone: Ring;
  /** The one buildable site (blocks must sit inside it and off existing buildings). */
  site: Ring;
  areas: Area[];
  hotspots: HotSpotDef[];
  tray: TrayItem[];
  heights: Record<HeightStep, number>;
  /** Where residents linger (walk graph hot nodes). */
  hangouts: LonLat[];
  ground: { kind: GroundKind; polygon: Ring }[];
  buildings: BakedBuilding[];
  paths: { nodes: LonLat[]; edges: [number, number][] };
  targets: { homes: number; satisfaction: number; holdSeconds: number };
  reference?: ReferenceBlock[];
  calibration?: Record<string, number>;
  bakedAt: string;
  stats: Record<string, number>;
}

export interface LevelIndexEntry {
  id: string;
  name: string;
  subzone: string;
  tagline: string;
  center: LonLat;
}
