// Meridian Bay itself: a seeded city on a street grid. The generator lays out
// roads, blocks of buildings, parks, the Docks container yard, the beach and
// the sea, then builds the road graph the traffic cars and the screenshot
// autopilot drive on. Same seed, same city, every time.
import { AVENUES, BEACH_TOP, COLORS, LANDMARKS, ROAD_W, STREETS, WORLD } from './config.js';

function isRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_W / 2) return true;
  return false;
}

function nearestRoadPoint(x, y) {
  let bx = AVENUES[0];
  let bd = Math.abs(x - bx);
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bd) { bd = d; bx = ax; }
  }
  let by = STREETS[0];
  bd = Math.abs(y - by);
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bd) { bd = d; by = sy; }
  }
  return { x: bx, y: by };
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const containers = [];
  const parks = [];

  // Blocks are the cells between neighbouring avenues and streets. Each block
  // holds either a row of buildings or a park; the beach strip stays open.
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const x0 = AVENUES[ai] + ROAD_W / 2 + 8;
      const x1 = AVENUES[ai + 1] - ROAD_W / 2 - 8;
      const y0 = STREETS[si] + ROAD_W / 2 + 8;
      const y1 = STREETS[si + 1] - ROAD_W / 2 - 8;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      if (random.next() < 0.18) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = 3 + random.int(0, 4);
        for (let t = 0; t < n; t += 1) {
          trees.push({ x: x0 + 20 + random.next() * (x1 - x0 - 40), y: y0 + 20 + random.next() * (y1 - y0 - 40), r: 9 + random.next() * 7 });
        }
        continue;
      }
      // Two rows of buildings down the block, with a gap between them.
      const rows = 2;
      for (let r = 0; r < rows; r += 1) {
        const by0 = y0 + r * ((y1 - y0) / rows) + 6;
        const by1 = y0 + (r + 1) * ((y1 - y0) / rows) - 6;
        let bx = x0;
        while (bx + 70 < x1) {
          const bw = 60 + random.next() * 70;
          const w = Math.min(bw, x1 - bx);
          if (w < 48) break;
          buildings.push({
            x: bx, y: by0, w, h: by1 - by0,
            color: random.pick(COLORS.buildingRoof),
            windows: random.int(2, 5),
          });
          bx += w + 14 + random.next() * 18;
        }
      }
    }
  }

  // The Docks: a fenced yard of stacked containers on the east side.
  for (let i = 0; i < 18; i += 1) {
    containers.push({
      x: 2100 + (i % 6) * 62,
      y: 1330 + Math.floor(i / 6) * 44,
      w: 54, h: 36,
      color: random.pick(COLORS.container),
    });
  }

  // Trees along the beach promenade.
  for (let x = 200; x < WORLD.width - 100; x += 130) {
    trees.push({ x: x + random.range(-20, 20), y: BEACH_TOP - 50, r: 11 });
  }

  // The road graph: a node at every intersection, edges along every street.
  // Traffic and the autopilot drive on it; each edge knows its direction so
  // cars keep to the right-hand lane.
  const nodes = [];
  const nodeId = new Map();
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      const key = `${ax},${sy}`;
      nodeId.set(key, nodes.length);
      nodes.push({ x: ax, y: sy });
    }
  }
  const edges = [];
  const addEdge = (ax, ay, bx, by) => {
    const a = nodeId.get(`${ax},${ay}`);
    const b = nodeId.get(`${bx},${by}`);
    if (a === undefined || b === undefined) return;
    edges.push({ a, b });
  };
  for (let ai = 0; ai < AVENUES.length; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) addEdge(AVENUES[ai], STREETS[si], AVENUES[ai], STREETS[si + 1]);
  }
  for (let si = 0; si < STREETS.length; si += 1) {
    for (let ai = 0; ai < AVENUES.length - 1; ai += 1) addEdge(AVENUES[ai], STREETS[si], AVENUES[ai + 1], STREETS[si]);
  }
  const adjacency = nodes.map(() => []);
  for (const e of edges) {
    adjacency[e.a].push(e.b);
    adjacency[e.b].push(e.a);
  }

  function nearestNode(x, y) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const dx = nodes[i].x - x;
      const dy = nodes[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Breadth-first route between two nodes, as a list of node indices.
  function route(from, to) {
    if (from === to) return [from];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const nb of adjacency[cur]) {
        if (prev[nb] === -1) {
          prev[nb] = cur;
          queue.push(nb);
        }
      }
    }
    if (prev[to] === -1) return [from, to];
    const path = [];
    let cur = to;
    while (cur !== from) {
      path.unshift(cur);
      cur = prev[cur];
    }
    path.unshift(from);
    return path;
  }

  return {
    buildings,
    trees,
    containers,
    parks,
    nodes,
    adjacency,
    landmarks: LANDMARKS,
    isRoad,
    nearestRoadPoint,
    nearestNode,
    route,
  };
}
