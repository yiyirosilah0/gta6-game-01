// Meridian Heat — the screenshot scenes behind ?shot=cover|chase|mission|start.
// Each one plays the real rules forward from a fresh world, steered by a simple
// autopilot (walk to the nearest parked car, steal it, then drive a route of
// intersections toward a target), so the frame is what real play looks like and
// the same seed always gives the same frame.
import { DOCKS, STEP, WAREHOUSE } from './config.js';
import { nearestIntersection } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { x: 0, y: 0, run: false, enter: false, punch: false };

/** A greedy Manhattan route of intersections from `from` to `to`, then `to`. */
function routeWaypoints(from, to) {
  const pts = [];
  let cur = nearestIntersection(from.x, from.y);
  pts.push(cur);
  const target = nearestIntersection(to.x, to.y);
  while (cur.x !== target.x || cur.y !== target.y) {
    if (cur.x !== target.x) cur = { x: cur.x + Math.sign(target.x - cur.x) * 320, y: cur.y };
    else cur = { x: cur.x, y: cur.y + Math.sign(target.y - cur.y) * 320 };
    pts.push(cur);
  }
  pts.push(to);
  return pts;
}

function toward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len, run: false, enter: false, punch: false };
}

function nearestParkedCar(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'parked') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** Drive the player's car along `waypoints` with a screen-relative input. */
function driveInput(state, waypoints) {
  const car = state.player.inCar;
  if (!car) return IDLE;
  let wp = waypoints[0];
  while (waypoints.length > 1 && Math.hypot(wp.x - car.x, wp.y - car.y) < 70) {
    waypoints.shift();
    wp = waypoints[0];
  }
  return toward(car, wp);
}

/** Put a cop car behind the player's car so the chase reads in the frame. */
function placeCopBehind(state, lateral, which) {
  const p = state.player;
  let seen = 0;
  for (const car of state.cars) {
    if (car.kind !== 'cop') continue;
    if (seen < (which || 0)) { seen += 1; continue; }
    const back = p.angle + Math.PI;
    car.x = p.x + Math.cos(back) * 240 + Math.cos(back + Math.PI / 2) * lateral;
    car.y = p.y + Math.sin(back) * 240 + Math.sin(back + Math.PI / 2) * lateral;
    car.angle = p.angle;
    car.speed = 320;
    return;
  }
}

function stealAndDrive(world, target, driveSeconds, wanted) {
  const state = world.state;
  // Phase 1: walk the streets to the nearest parked car and steal it.
  const targetCar = nearestParkedCar(state);
  if (targetCar) {
    const waypoints = routeWaypoints(state.player, targetCar);
    for (let i = 0; i < 20 / STEP; i += 1) {
      if (state.player.inCar) break;
      const d = Math.hypot(targetCar.x - state.player.x, targetCar.y - state.player.y);
      if (d < 50) {
        world.step(STEP, { x: 0, y: 0, run: false, enter: true, punch: false }, false);
      } else {
        let wp = waypoints[0];
        while (waypoints.length > 1 && Math.hypot(wp.x - state.player.x, wp.y - state.player.y) < 40) {
          waypoints.shift();
          wp = waypoints[0];
        }
        const input = toward(state.player, wp);
        input.run = true;
        world.step(STEP, input, false);
      }
    }
  }
  if (state.player.inCar && wanted > 0) state.wanted = wanted;
  // Phase 2: drive toward the target (downtown, so the camera stays centred).
  const waypoints = routeWaypoints(state.player, target);
  for (let i = 0; i < driveSeconds / STEP; i += 1) {
    world.step(STEP, driveInput(state, waypoints), false);
    if (state.over) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best haul to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'cover') {
    stealAndDrive(world, { x: 1440, y: 1120 }, 14, 2);
    placeCopBehind(state, 90, 0);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    stealAndDrive(world, { x: 1440, y: 1120 }, 6, 3);
    // Evasive driving: fresh waypoints around downtown.
    const waypoints = routeWaypoints(state.player, { x: 1120, y: 800 });
    for (let i = 0; i < 10 / STEP; i += 1) {
      world.step(STEP, driveInput(state, waypoints), false);
      if (state.over) break;
    }
    placeCopBehind(state, 110, 0);
    placeCopBehind(state, -110, 1);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    state.missionIndex = 1;
    state.missionStep = 0;
    state.player.x = WAREHOUSE.x;
    state.player.y = WAREHOUSE.y + 110;
    state.player.angle = -Math.PI / 2;
    // Five seconds of ambient play: the opening banner fades out first.
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, IDLE, true);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // start: the title screen over a living city.
  for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, IDLE, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
