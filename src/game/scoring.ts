/**
 * Breathability score and plot-clear logic (docs/plan-v6.md).
 * Breathability = how far the precinct's walkways sit between the careless plan (0 %) and the empty
 * plot (100 %), measured on this device during the intro; both baselines are per season.
 */
export interface ScoreState {
  /** 0..100, eased; -1 while the season has no baseline yet. */
  breath: number;
  breathOk: boolean;
  measuring: boolean;
  meanFeelsLike: number;
  /** Mean comfort 0..100 (flavour: resident mood). */
  satisfaction: number;
  homes: number;
  homesOk: boolean;
  placed: number;
  toPlace: number;
  allPlaced: boolean;
  spotsCooled: number;
  spotsTotal: number;
  spotsOk: boolean;
  spotsMargin: boolean;
  /** Breathable enough and every neighbour spot cooled. */
  airOk: boolean;
  /** 0..1 progress through the hold window while every condition is true. */
  hold: number;
  cleared: boolean;
  /** Seasons whose hold has been completed. */
  held: string[];
  /** Breathability at the moment each season's hold completed. */
  seasonPct: Record<string, number>;
}

export interface Baseline {
  empty: number;
  careless: number;
}

export function feelsLikeC(T: number, tMax: number): number {
  const t = Math.min(1, Math.max(0, T / tMax));
  const s = t * t * (3 - 2 * t);
  return 27 + 8 * s;
}

export function comfortFromFeels(feels: number): number {
  const t = Math.min(1, Math.max(0, (feels - 27.5) / 7));
  return 1 - t * t * (3 - 2 * t);
}

export function breathPct(feels: number, b: Baseline): number {
  // never let the scale collapse on a plot the careless plan barely heats: at least 1 C from empty to 0 %
  const span = Math.max(1.0, b.careless - b.empty);
  return 100 * Math.min(1, Math.max(0, (b.empty + span - feels) / span));
}

export class Scoring {
  readonly state: ScoreState;
  private holdSec = 0;
  readonly baselines: Record<string, Baseline> = {};

  /** Season currently being held; set by the level. */
  season = "";
  /** Seasons that must each pass the hold. */
  required: string[] = [];
  /** Fires when a season's hold completes. */
  onSeasonHeld: ((season: string) => void) | null = null;

  constructor(
    readonly targetHomes: number,
    readonly passPct: number,
    readonly starPct: number,
    readonly holdSeconds: number,
  ) {
    this.state = { breath: -1, breathOk: false, measuring: true, meanFeelsLike: 27, satisfaction: 0, homes: 0, homesOk: false, placed: 0, toPlace: 0, allPlaced: false, spotsCooled: 0, spotsTotal: 0, spotsOk: true, spotsMargin: true, airOk: false, hold: 0, cleared: false, held: [], seasonPct: {} };
  }

  setBaseline(season: string, b: Baseline): void {
    this.baselines[season] = b;
  }
  hasBaseline(season: string): boolean {
    return season in this.baselines;
  }

  update(dt: number, meanComfort: number | null, meanFeels: number | null, homes: number, placed = 0, toPlace = 0, spots?: { cooled: number; total: number; ok: boolean; margin: boolean }): ScoreState {
    const s = this.state;
    const tau = 2.0; // eddies make the field flicker; average over a couple of seconds
    const k = 1 - Math.exp(-dt / tau);
    if (meanComfort !== null) s.satisfaction += (100 * meanComfort - s.satisfaction) * k;
    if (meanFeels !== null) s.meanFeelsLike += (meanFeels - s.meanFeelsLike) * k;
    const b = this.baselines[this.season];
    s.measuring = !b;
    if (b && meanFeels !== null) {
      const target = breathPct(meanFeels, b);
      s.breath = s.breath < 0 ? target : s.breath + (target - s.breath) * k;
    } else if (!b) s.breath = -1;
    s.breathOk = s.breath >= this.passPct;
    s.homes = homes;
    s.homesOk = homes >= this.targetHomes;
    s.placed = placed;
    s.toPlace = toPlace;
    s.allPlaced = toPlace > 0 && placed >= toPlace;
    if (spots) { s.spotsCooled = spots.cooled; s.spotsTotal = spots.total; s.spotsOk = spots.total === 0 || spots.ok; s.spotsMargin = spots.total === 0 || spots.margin; }
    s.airOk = s.breathOk && s.spotsOk;
    const alreadyHeld = s.held.includes(this.season);
    if (s.allPlaced && s.homesOk && s.airOk && !s.cleared && !alreadyHeld) {
      this.holdSec += dt;
      s.hold = Math.min(1, this.holdSec / this.holdSeconds);
      if (this.holdSec >= this.holdSeconds) {
        s.held.push(this.season);
        s.seasonPct[this.season] = Math.round(s.breath);
        this.holdSec = 0;
        s.hold = 0;
        const remaining = this.required.filter((r) => !s.held.includes(r));
        if (remaining.length === 0) s.cleared = true;
        this.onSeasonHeld?.(this.season);
      }
    } else if (!s.cleared) {
      this.holdSec = 0;
      s.hold = alreadyHeld ? 1 : 0;
    }
    return s;
  }

  /** Lowest breathability across the held seasons. */
  minSeasonPct(): number {
    const v = Object.values(this.state.seasonPct);
    return v.length ? Math.min(...v) : Math.round(this.state.breath);
  }

  /** 1 star for clearing, 2 when every season sat at or above starPct, 3 for the plot's technique, 90 %+ or 15 % more homes. */
  stars(technique = false): number {
    const s = this.state;
    if (!s.cleared) return 0;
    const star2 = this.minSeasonPct() >= this.starPct && s.spotsMargin;
    const star3 = technique || this.minSeasonPct() >= 90 || s.homes >= 1.15 * this.targetHomes;
    return 1 + (star2 ? 1 : 0) + (star3 ? 1 : 0);
  }

  /** A layout change invalidates earlier season holds. */
  invalidateHolds(): void {
    this.holdSec = 0;
    this.state.hold = 0;
    this.state.held = [];
    this.state.seasonPct = {};
  }

  reset(): void {
    this.invalidateHolds();
    this.state.cleared = false;
  }
}
