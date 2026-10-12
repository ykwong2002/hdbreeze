/** Cleared plots and stars, per browser (localStorage). */
export interface PlotResult {
  stars: number;
  homes: number;
  /** Lowest breathability across the required seasons when cleared, percent. */
  breath: number;
  at: string;
}
const KEY = "hdbreeze.progress.v6";

export class Progress {
  private data: Record<string, PlotResult> = {};
  constructor() {
    try { this.data = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, PlotResult>; } catch { this.data = {}; }
  }
  get(levelId: string): PlotResult | undefined {
    return this.data[levelId];
  }
  /** Keeps the best stars; always stores the latest numbers. */
  record(levelId: string, r: Omit<PlotResult, "at">): void {
    const prev = this.data[levelId];
    this.data[levelId] = { ...r, stars: Math.max(r.stars, prev?.stars ?? 0), at: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ }
  }
  /** Plot n is playable when it is the first or the previous one is cleared. */
  unlocked(plotIds: string[], n: number): boolean {
    if (n <= 1) return true;
    const prev = plotIds[n - 2];
    return !!prev && (this.data[prev]?.stars ?? 0) > 0;
  }
  stars(plotIds: string[]): number {
    return plotIds.reduce((s, id) => s + (this.data[id]?.stars ?? 0), 0);
  }
  townCleared(plotIds: string[]): boolean {
    return plotIds.every((id) => (this.data[id]?.stars ?? 0) > 0);
  }
}
