import type { BakedLevel, LonLat } from "./level-types";
import { comfortFromFeels, feelsLikeC } from "./scoring";

/**
 * Residents walk the baked path graph (OSM footways inside the play box) and
 * through void decks the player opens. Positions are sim-cell coordinates.
 */
export interface Agent {
  x: number;
  y: number;
  edge: number;
  /** 0..1 along the edge, from a to b. */
  t: number;
  forward: boolean;
  /** cells per second */
  speed: number;
  comfort: number;
  feels: number;
  pause: number;
  seed: number;
}

interface Graph {
  nodes: [number, number][];
  adj: number[][]; // node -> edge ids
  edges: [number, number][];
  hot: Set<number>;
}

export class Agents {
  readonly agents: Agent[] = [];
  private graph: Graph;
  private dynamicStart: number;
  private cellsPerSec: number;

  constructor(
    level: BakedLevel,
    private toCell: (lon: number, lat: number) => [number, number],
    metresPerCell: number,
    count = 40,
  ) {
    this.graph = buildGraph(level, toCell, metresPerCell);
    this.dynamicStart = this.graph.nodes.length;
    this.cellsPerSec = (1.4 * 2) / metresPerCell; // 2x life speed so the crowd reads as moving
    this.spawn(count);
  }

  get count(): number {
    return this.agents.length;
  }

  private spawn(count: number): void {
    const g = this.graph;
    if (!g.edges.length) return;
    for (let i = 0; i < count; i++) {
      const edge = Math.floor(Math.random() * g.edges.length);
      const a: Agent = { x: 0, y: 0, edge, t: Math.random(), forward: Math.random() < 0.5, speed: this.cellsPerSec * (0.8 + 0.4 * Math.random()), comfort: 0.6, feels: 30, pause: 0, seed: Math.random() };
      this.place(a);
      this.agents.push(a);
    }
  }

  private place(a: Agent): void {
    const [i, j] = this.graph.edges[a.edge]!;
    const p = this.graph.nodes[i]!, q = this.graph.nodes[j]!;
    a.x = p[0] + (q[0] - p[0]) * a.t;
    a.y = p[1] + (q[1] - p[1]) * a.t;
  }

  /** Extra hangout nodes under void decks: ring quarter-points linked to the nearest path node within reach. */
  setVoidDecks(rings: [number, number][][], reachCells: number): void {
    const g = this.graph;
    // drop previous dynamic nodes/edges
    g.nodes.length = this.dynamicStart;
    g.adj.length = this.dynamicStart;
    const keepEdges = g.edges.filter(([a, b]) => a < this.dynamicStart && b < this.dynamicStart);
    g.edges.length = 0;
    g.edges.push(...keepEdges);
    for (const list of g.adj) list.length = 0;
    g.edges.forEach(([a, b], e) => { g.adj[a]!.push(e); g.adj[b]!.push(e); });
    for (const ring of rings) {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      // nearest static node
      let best = -1, bestD = reachCells;
      for (let n = 0; n < this.dynamicStart; n++) {
        const d = Math.hypot(g.nodes[n]![0] - cx, g.nodes[n]![1] - cy);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best < 0) continue;
      const centre = g.nodes.length;
      g.nodes.push([cx, cy]);
      g.adj.push([]);
      const link = (a: number, b: number): void => { const e = g.edges.length; g.edges.push([a, b]); g.adj[a]!.push(e); g.adj[b]!.push(e); };
      link(best, centre);
      for (let k = 0; k < 4; k++) {
        const p = ring[Math.floor((k / 4) * (ring.length - 1))]!;
        const n = g.nodes.length;
        g.nodes.push([cx + (p[0] - cx) * 0.6, cy + (p[1] - cy) * 0.6]);
        g.adj.push([]);
        link(centre, n);
        g.hot.add(n);
      }
    }
    for (const a of this.agents) if (a.edge >= g.edges.length) { a.edge = Math.floor(Math.random() * g.edges.length); a.t = Math.random(); this.place(a); }
  }

  update(dt: number, sampleT: (x: number, y: number) => number | null, tMax: number): { meanComfort: number | null; meanFeels: number | null } {
    const g = this.graph;
    let csum = 0, fsum = 0, n = 0;
    for (const a of this.agents) {
      if (a.pause > 0) a.pause -= dt;
      else {
        const [i, j] = g.edges[a.edge]!;
        const p = g.nodes[i]!, q = g.nodes[j]!;
        const len = Math.max(0.5, Math.hypot(q[0] - p[0], q[1] - p[1]));
        a.t += ((a.forward ? 1 : -1) * a.speed * dt) / len;
        if (a.t >= 1 || a.t <= 0) {
          const atNode = a.t >= 1 ? j : i;
          const from = a.edge;
          const options = g.adj[atNode]!.filter((e) => e !== from);
          const next = options.length ? options[Math.floor(Math.random() * options.length)]! : from;
          a.edge = next;
          const [ni, nj] = g.edges[next]!;
          a.forward = ni === atNode;
          a.t = a.forward ? 0 : 1;
          if (g.hot.has(atNode) && Math.random() < 0.6) a.pause = 3 + 5 * Math.random();
        }
        this.place(a);
      }
      const T = sampleT(a.x, a.y);
      if (T !== null) {
        const feels = feelsLikeC(T, tMax);
        const c = comfortFromFeels(feels);
        const k = 1 - Math.exp(-dt / 0.5);
        a.comfort += (c - a.comfort) * k;
        a.feels += (feels - a.feels) * k;
      }
      csum += a.comfort;
      fsum += a.feels;
      n++;
    }
    return n ? { meanComfort: csum / n, meanFeels: fsum / n } : { meanComfort: null, meanFeels: null };
  }
}

function buildGraph(level: BakedLevel, toCell: (lon: number, lat: number) => [number, number], metresPerCell: number): Graph {
  const nodes = level.paths.nodes.map((p) => toCell(p[0], p[1]));
  const n = level.grid;
  const inside = (p: [number, number]) => p[0] > 1 && p[1] > 1 && p[0] < n - 1 && p[1] < n - 1;
  const edges: [number, number][] = level.paths.edges.filter(([a, b]) => inside(nodes[a]!) && inside(nodes[b]!));
  // keep only components with a few nodes so nobody paces a 10 m stub
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (const [a, b] of edges) parent[find(a)] = find(b);
  const size = new Map<number, number>();
  for (const [a, b] of edges) { size.set(find(a), (size.get(find(a)) ?? 0) + 1); void b; }
  const kept = edges.filter(([a]) => (size.get(find(a)) ?? 0) >= 6);
  const adj: number[][] = nodes.map(() => []);
  kept.forEach(([a, b], e) => { adj[a]!.push(e); adj[b]!.push(e); });
  const hot = new Set<number>();
  const reach = 120 / metresPerCell;
  for (const h of level.hotspots as LonLat[]) {
    const c = toCell(h[0], h[1]);
    let best = -1, bestD = reach;
    nodes.forEach((p, i) => { if (!adj[i]!.length) return; const d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < bestD) { bestD = d; best = i; } });
    if (best >= 0) hot.add(best);
  }
  return { nodes, adj, edges: kept, hot };
}
