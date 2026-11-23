// Meridian Heat — the city of Meridian Bay: a street grid, blocks of buildings,
// two parks, the docks, the beach and the sea. Generation is seeded, so the same
// seed always builds the same city. Also the collision and road helpers the
// simulation and the renderer share.
import { BEACH_Y, COLORS, DOCKS, HORIZONTAL_Y, POLICE_HQ, SAFEHOUSE, VERTICAL_X, WATER_Y, WORLD } from './config.js';

const HALF = 36; // half a road width

export function createCity(random) {
  const buildings = [];
  const containers = [];
  const trees = [];
  const parks = [];
  // Two park blocks, fixed so the map reads the same every run.
  const parkCells = new Set(['2,1', '5,3']);
  for (let col = 0; col < VERTICAL_X.length - 1; col += 1) {
    for (let row = 0; row < HORIZONTAL_Y.length - 1; row += 1) {
      const x0 = VERTICAL_X[col] + HALF + 14;
      const x1 = VERTICAL_X[col + 1] - HALF - 14;
      const y0 = HORIZONTAL_Y[row] + HALF + 14;
      const y1 = HORIZONTAL_Y[row + 1] - HALF - 14;
      if (parkCells.has(`${col},${row}`)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let t = 0; t < 9; t += 1) {
          trees.push({ x: random.range(x0 + 16, x1 - 16), y: random.range(y0 + 16, y1 - 16), r: random.range(10, 16) });
        }
        continue;
      }
      // Split each block into 2x2 lots; most hold a building, some hold trees.
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const lots = [
        { x: x0, y: y0, w: mx - x0 - 8, h: my - y0 - 8 },
        { x: mx + 8, y: y0, w: x1 - mx - 8, h: my - y0 - 8 },
        { x: x0, y: my + 8, w: mx - x0 - 8, h: y1 - my - 8 },
        { x: mx + 8, y: my + 8, w: x1 - mx - 8, h: y1 - my - 8 },
      ];
      for (const lot of lots) {
        if (random.chance(0.82)) {
          buildings.push({
            x: lot.x, y: lot.y, w: lot.w, h: lot.h,
            color: random.pick(COLORS.building),
            roof: random.pick(['#8a5a2b', '#5a6b7a', '#7a3b2e', '#3f5a3a']),
          });
        } else {
          trees.push({ x: lot.x + lot.w / 2, y: lot.y + lot.h / 2, r: 14 });
        }
      }
    }
  }
  // The docks: shipping containers on the east edge, solid obstacles.
  for (let i = 0; i < 10; i += 1) {
    containers.push({
      x: 2420 + (i % 2) * 58,
      y: 700 + Math.floor(i / 2) * 62,
      w: 48, h: 52,
      color: COLORS.container[i % COLORS.container.length],
    });
  }
  // A few palm trees along the beach.
  for (let x = 200; x < WORLD.width; x += 260) {
    trees.push({ x: x + random.range(-30, 30), y: BEACH_Y + 22, r: 13, palm: true });
  }
  return { buildings, containers, trees, parks };
}

export function isRoad(x, y) {
  for (const vx of VERTICAL_X) if (Math.abs(x - vx) <= HALF) return true;
  for (const hy of HORIZONTAL_Y) if (Math.abs(y - hy) <= HALF) return true;
  return false;
}

/** The nearest street intersection to a point (used for waypoints and spawns). */
export function nearestIntersection(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const vx of VERTICAL_X) {
    for (const hy of HORIZONTAL_Y) {
      const d = (vx - x) * (vx - x) + (hy - y) * (hy - y);
      if (d < bestD) { bestD = d; best = { x: vx, y: hy }; }
    }
  }
  return best;
}

/** All intersections, for random mission and job targets. */
export function allIntersections() {
  const out = [];
  for (const vx of VERTICAL_X) for (const hy of HORIZONTAL_Y) out.push({ x: vx, y: hy });
  return out;
}

/**
 * Push a circle out of every solid rect (buildings, containers, world edge and
 * the sea). Returns true when anything blocked the circle.
 */
export function collideCircle(city, x, y, r) {
  let blocked = false;
  const push = (rect) => {
    const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    blocked = true;
    if (d2 > 0.01) {
      const d = Math.sqrt(d2);
      const pushOut = (r - d) / d;
      x += dx * pushOut;
      y += dy * pushOut;
    } else {
      y = rect.y - r;
    }
  };
  for (const b of city.buildings) push(b);
  for (const c of city.containers) push(c);
  if (x < r) { x = r; blocked = true; }
  if (x > WORLD.width - r) { x = WORLD.width - r; blocked = true; }
  if (y < r) { y = r; blocked = true; }
  if (y > WATER_Y - r) { y = WATER_Y - r; blocked = true; }
  return { x, y, blocked };
}

/** True when a point is inside a building or a container. */
export function insideSolid(city, x, y) {
  for (const b of city.buildings) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  for (const c of city.containers) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return true;
  return false;
}

export const PLACES = { SAFEHOUSE, DOCKS, POLICE_HQ };
