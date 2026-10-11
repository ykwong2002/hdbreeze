/** Shape of public/levels/<id>.json (written by tools/bake). Pure data: new towns need no code. */
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

export interface Plot {
  id: string;
  label: string;
  polygon: Ring;
  maxStoreys: number;
  gpr: number;
  areaM2: number;
}

export type GroundKind = "park" | "water" | "road" | "paved";

export interface BakedLevel {
  id: string;
  name: string;
  tagline: string;
  area: { center: LonLat; sizeM: number; contextM: number };
  camera: { zoom: number; pitch: number; bearing: number };
  grid: number;
  wind: { seasons: Season[]; required: string[] };
  /** Play-area box [w, s, e, n], square in metres. */
  bbox: [number, number, number, number];
  contextBbox: [number, number, number, number];
  plots: Plot[];
  hotspots: LonLat[];
  ground: { kind: GroundKind; polygon: Ring }[];
  buildings: BakedBuilding[];
  paths: { nodes: LonLat[]; edges: [number, number][] };
  targets: { homes: number; satisfaction: number; holdSeconds: number };
  palette: string[];
  onboarding: boolean;
  bakedAt: string;
  stats: Record<string, number>;
}

export interface LevelIndexEntry {
  id: string;
  name: string;
  tagline: string;
  center: LonLat;
}
