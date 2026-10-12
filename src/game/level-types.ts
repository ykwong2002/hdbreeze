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

/** The layout technique a plot teaches and rewards with its third star. */
export type Technique = "corridors" | "void" | "stepping";

/** One plot of a town, as listed on the town overview. */
export interface PlotSummary {
  /** Level id of the baked plot (`<town>-<plot>`). */
  id: string;
  /** 1-based order on the overview; plots unlock in this order. */
  n: number;
  label: string;
  polygon: Ring;
  center: LonLat;
  areaM2: number;
  /** Master Plan gross plot ratio used for the tray. */
  gpr: number;
  /** Flats the plot ratio allows (area x gpr / 100 m2), for the intro card. */
  flatsAllowed: number;
  homes: number;
  blocks: number;
  seasons: string[];
  hotspots: number;
  focus?: Technique;
}

/** public/levels/<town>.json: a town and its plots. */
export interface TownData {
  id: string;
  name: string;
  tagline: string;
  planningArea: string;
  /** Planning-area outline (simplified). */
  outline: Ring;
  center: LonLat;
  wind: { seasons: Season[]; required: string[] };
  plots: PlotSummary[];
}

export interface BakedLevel {
  id: string;
  name: string;
  /** v6: the town this plot belongs to and its position in the sequence. */
  town?: string;
  plotIndex?: number;
  plotCount?: number;
  plotLabel?: string;
  gpr?: number;
  areaM2?: number;
  flatsAllowed?: number;
  /** Breathability needed to clear (percent of the way from the careless plan to the empty plot). */
  passPct?: number;
  starPct?: number;
  focus?: Technique;
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
  /** v6: number of plots (towns) */
  plots?: number;
}
