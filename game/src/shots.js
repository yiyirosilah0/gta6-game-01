// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './config.js';

const BLANK = { moveX: 0, moveY: 0, run: false, up: false, down: false, left: false, right: false, enter: false, punch: false };

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function putPlayerInCar(world, x, y) {
  const p = world.state.player;
  let best = null;
  let bd = Infinity;
  for (const car of world.state.cars) {
    if (car.kind === 'cop' || car.wrecked) continue;
    const d = (car.x - x) * (car.x - x) + (car.y - y) * (car.y - y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return false;
  best.kind = 'player';
  best.color = '#ff8c1a';
  p.inCar = best.id;
  p.x = best.x;
  p.y = best.y;
  p.angle = best.angle;
  return true;
}

// Drive the player's car along the road graph, always moving: steer at the
// next waypoint, brake for a sharp turn, lift off for a car ahead, and pick a
// new far node whenever the current one is reached, so the car never parks.
// Speed is capped and eased near turns so the car stays on the road instead
// of overshooting into buildings; if it does leave the road, it steers back
// to the nearest road point before resuming its route. The route is kept
// across steps with a waypoint index that only advances, so the car never
// aims back at a node it already passed and never cuts a corner through a
// building.
function makeDriveAutopilot(world) {
  let destNode = null;
  let route = null;
  let wpIdx = 0;
  function setDestination(city, car, dest) {
    destNode = dest;
    const start = city.nearestNode(car.x, car.y);
    route = city.route(start, destNode);
    wpIdx = 0;
  }
  return () => {
    const p = world.state.player;
    const car = world.state.cars.find((c) => c.id === p.inCar);
    if (!car) return { ...BLANK };
    const city = world.city;
    if (destNode === null) setDestination(city, car, city.nearestNode(2240, 1440));
    const dest = city.nodes[destNode];
    if (Math.hypot(dest.x - car.x, dest.y - car.y) < 80) {
      // Reached it: head for the farthest node next, and keep driving.
      let best = destNode;
      let bd = 0;
      for (let i = 0; i < city.nodes.length; i += 1) {
        const d = Math.hypot(city.nodes[i].x - car.x, city.nodes[i].y - car.y);
        if (d > bd) { bd = d; best = i; }
      }
      setDestination(city, car, best);
    }
    // Advance the waypoint while the car is close to it, or closer to the
    // next one than to it (it has passed it). Adjacent nodes are joined by
    // one straight road, so aiming at the next node from anywhere on the
    // current stretch still keeps the car on the road.
    while (wpIdx < route.length - 1) {
      const wp = city.nodes[route[wpIdx]];
      const d = Math.hypot(wp.x - car.x, wp.y - car.y);
      if (d < 60) { wpIdx += 1; continue; }
      const next = city.nodes[route[wpIdx + 1]];
      if (Math.hypot(next.x - car.x, next.y - car.y) < d) { wpIdx += 1; continue; }
      break;
    }
    // Aim point: the current waypoint, or the nearest road point when the
    // car has left the road, so it recovers instead of grinding a wall.
    let aimX;
    let aimY;
    if (!city.isRoad(car.x, car.y)) {
      const rp = city.nearestRoadPoint(car.x, car.y);
      aimX = rp.x;
      aimY = rp.y;
    } else {
      const aim = city.nodes[route[Math.min(wpIdx, route.length - 1)]];
      aimX = aim.x;
      aimY = aim.y;
    }
    const want = Math.atan2(aimY - car.y, aimX - car.x);
    const diff = angleDiff(want, car.angle);
    const speed = Math.abs(car.speed);
    const dist = Math.hypot(aimX - car.x, aimY - car.y);
    // Desired speed: slow for a sharp turn or near the waypoint.
    let desired = 260;
    if (Math.abs(diff) > 0.5) desired = 120;
    if (dist < 150) desired = Math.min(desired, 150);
    // A slow car ahead: lift off so the chase does not rear-end traffic.
    let blocked = false;
    for (const other of world.state.cars) {
      if (other === car || other.wrecked) continue;
      const od = Math.hypot(other.x - car.x, other.y - car.y);
      if (od < 60) {
        const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
        if (ahead > 0) { blocked = true; break; }
      }
    }
    if (blocked) desired = Math.min(desired, 80);
    return {
      ...BLANK,
      up: speed < desired,
      down: speed > desired + 50,
      left: diff < -0.08,
      right: diff > 0.08,
    };
  };
}

// Walk toward a point, sliding along walls the way the world's own movement
// already allows.
function walkAutopilot(world, tx, ty) {
  const p = world.state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 10) return { ...BLANK };
  return { ...BLANK, moveX: dx / d, moveY: dy / d, run: d > 120 };
}

function runSteps(world, seconds, inputFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, inputFn ? inputFn() : { ...BLANK }, false);
  }
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other
 * name is start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'drive') {
    // Downtown, behind the wheel: steal the nearest car and keep driving.
    putPlayerInCar(world, 800, 800);
    runSteps(world, 12, makeDriveAutopilot(world));
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    // Three stars and the cops in the mirror. The mission is Lose the Heat in
    // its "lose" stage, which has no target, so it cannot complete mid-chase
    // and hijack the scene the way Hot Wheels did.
    world.state.missionIndex = 2;
    world.startMission();
    putPlayerInCar(world, 1280, 960);
    runSteps(world, 9, makeDriveAutopilot(world));
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // On foot at the warehouse: the Package mission, closing on its marker
    // from just west of it so the walk stays short and clear.
    world.state.missionIndex = 1;
    world.startMission();
    const p = world.state.player;
    p.x = 2240 - 130;
    p.y = 320;
    runSteps(world, 3, () => walkAutopilot(world, 2240, 320));
    return { screen: SCREEN_PLAY };
  }
  // The title: the city lives behind the panel for five seconds.
  for (let i = 0; i < Math.round(5 / STEP); i += 1) world.step(STEP, { ...BLANK }, true);
  return { screen: SCREEN_TITLE };
}
