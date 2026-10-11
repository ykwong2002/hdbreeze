/** Satisfaction score and level-clear logic (docs/plan.md 4.2). */
export interface ScoreState {
  /** 0..100, eased. */
  satisfaction: number;
  meanFeelsLike: number;
  homes: number;
  homesOk: boolean;
  placed: number;
  toPlace: number;
  allPlaced: boolean;
  satisfactionOk: boolean;
  /** 0..1 progress through the hold window while both conditions are true. */
  hold: number;
  cleared: boolean;
  /** Seasons whose hold has been completed. */
  held: string[];
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

export class Scoring {
  readonly state: ScoreState;
  private holdSec = 0;

  /** Season currently being held; set by the level. */
  season = "";
  /** Seasons that must each pass the hold. */
  required: string[] = [];
  /** Fires when a season's hold completes. */
  onSeasonHeld: ((season: string) => void) | null = null;

  constructor(
    readonly targetHomes: number,
    readonly threshold: number,
    readonly holdSeconds: number,
  ) {
    this.state = { satisfaction: 0, meanFeelsLike: 27, homes: 0, homesOk: false, placed: 0, toPlace: 0, allPlaced: false, satisfactionOk: false, hold: 0, cleared: false, held: [] };
  }

  update(dt: number, meanComfort: number | null, meanFeels: number | null, homes: number, placed = 0, toPlace = 0): ScoreState {
    const s = this.state;
    // eddies shed behind blocks make the instantaneous field flicker; average over a few seconds
    const tau = this.state.satisfaction === 0 && meanComfort !== null ? 0.3 : 4.0;
    if (meanComfort !== null) {
      const target = 100 * meanComfort;
      const k = 1 - Math.exp(-dt / tau);
      s.satisfaction += (target - s.satisfaction) * k;
    }
    if (meanFeels !== null) s.meanFeelsLike += (meanFeels - s.meanFeelsLike) * (1 - Math.exp(-dt / tau));
    s.homes = homes;
    s.homesOk = homes >= this.targetHomes;
    s.placed = placed;
    s.toPlace = toPlace;
    s.allPlaced = toPlace > 0 && placed >= toPlace;
    s.satisfactionOk = s.satisfaction >= this.threshold;
    const alreadyHeld = s.held.includes(this.season);
    if (s.allPlaced && s.homesOk && s.satisfactionOk && !s.cleared && !alreadyHeld) {
      this.holdSec += dt;
      s.hold = Math.min(1, this.holdSec / this.holdSeconds);
      if (this.holdSec >= this.holdSeconds) {
        s.held.push(this.season);
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

  /** Score needed for the margin star: 6 above the line, but never above 98. */
  marginStarScore(): number {
    return Math.min(this.threshold + 6, 98);
  }

  /** 1 star for clearing, 2 for a clear margin or homes >= 1.2x target, 3 for both. */
  stars(): number {
    const s = this.state;
    if (!s.cleared) return 0;
    const margin = s.satisfaction >= this.marginStarScore();
    const homes = s.homes >= 1.2 * this.targetHomes;
    return 1 + (margin ? 1 : 0) + (homes ? 1 : 0);
  }

  /** A layout change invalidates earlier season holds. */
  invalidateHolds(): void {
    this.holdSec = 0;
    this.state.hold = 0;
    this.state.held = [];
  }

  reset(): void {
    this.invalidateHolds();
    this.state.cleared = false;
  }
}
