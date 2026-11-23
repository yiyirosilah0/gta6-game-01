// Meridian Heat — the simulation: the player on foot and by car, traffic,
// pedestrians, police, the wanted system, the story missions and the courier
// jobs. No drawing and no browser in here: step() advances one fixed step and
// returns what happened as bit flags, so the caller can react (sound, save,
// announcements) without the world knowing about screens or sound.
import {
  BEACH_Y, CAR, COLORS, DOCKS, HORIZONTAL_Y, HOSPITAL, PLAYER, POLICE_HQ,
  SAFEHOUSE, SAVE_KEY, STEP, TRAFFIC_COUNT, PED_COUNT, VERTICAL_X,
  WANTED_DECAY_SECONDS, WAREHOUSE, WORLD,
} from './config.js';
import { allIntersections, collideCircle, createCity, insideSolid, isRoad, nearestIntersection } from './city.js';

export const EVENT_PICKUP = 1;
export const EVENT_MISSION = 2;
export const EVENT_BUSTED = 4;
export const EVENT_DOWN = 8;
export const EVENT_WANTED = 16;
export const EVENT_STEAL = 32;
export const EVENT_PUNCH = 64;
export const EVENT_CRASH = 128;
export const EVENT_HIT = 256;
export const EVENT_JOB = 512;

const MISSIONS = [
  {
    name: 'HOT WHEELS',
    reward: 150,
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', pos: DOCKS, radius: 90, text: 'Drive to the Docks marker' },
    ],
  },
  {
    name: 'THE PACKAGE',
    reward: 250,
    steps: [
      { type: 'pickup', pos: WAREHOUSE, radius: 70, text: 'Pick up the package at the warehouse (on foot)' },
      { type: 'deliver', pos: SAFEHOUSE, radius: 90, text: 'Deliver the package to the safehouse' },
    ],
  },
  {
    name: 'LOSE THE HEAT',
    reward: 400,
    steps: [
      { type: 'evade', text: 'Lose the cops — get your wanted level to zero' },
      { type: 'goto', pos: SAFEHOUSE, radius: 90, text: 'Reach the safehouse' },
    ],
  },
];

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8e3d3', '#3d3d46', '#d9a53d', '#7a4fd9', '#4fd9a5', '#d97a4f'];
const PED_COLORS = ['#e8e3d3', '#d97a4f', '#7a4fd9', '#4fd9a5', '#c65b5b', '#5fa8a0', '#e0913f', '#8a6d4b'];

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function turnToward(angle, target, maxTurn) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxTurn) return target;
  return angle + Math.sign(diff) * maxTurn;
}

export function objectiveText(state) {
  const mission = state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
  const step = mission ? mission.steps[state.missionStep] : null;
  if (step) return `${mission.name} — ${step.text}`;
  if (state.job) {
    return state.job.phase === 'pickup'
      ? `COURIER — Pick up the parcel at the yellow marker ($${state.job.reward})`
      : `COURIER — Deliver the parcel to the yellow marker ($${state.job.reward})`;
  }
  if (state.storyDone) return 'Free roam — explore Meridian Bay. Courier jobs pay cash.';
  return 'Free roam';
}

export function missionTarget(state) {
  const mission = state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
  const step = mission ? mission.steps[state.missionStep] : null;
  if (step && step.pos) return { x: step.pos.x, y: step.pos.y, color: COLORS.marker };
  if (state.job) {
    const p = state.job.phase === 'pickup' ? state.job.pickup : state.job.drop;
    return { x: p.x, y: p.y, color: COLORS.marker };
  }
  return { x: SAFEHOUSE.x, y: SAFEHOUSE.y, color: COLORS.markerBlue };
}

export function createWorld(random) {
  const city = createCity(random);
  const intersections = allIntersections();
  let carId = 0;

  const state = {
    time: 0,
    clock: 8 * 60,
    cash: 0,
    wanted: 0,
    seenTimer: 0,
    city,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    missionIndex: 0,
    missionStep: 0,
    storyDone: false,
    job: null,
    jobTimer: 0,
    banner: null,
    over: null,
    stats: { stolen: 0, missions: 0, earned: 0 },
  };

  function laneFor(axis, dir) {
    if (axis === 'h') return dir > 0 ? 18 : -18;
    return dir > 0 ? -18 : 18;
  }

  function roadPos(car) {
    if (car.axis === 'v') {
      car.x = car.street + car.lane;
      car.y = car.pos;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.x = car.pos;
      car.y = car.street + car.lane;
      car.angle = car.dir > 0 ? 0 : Math.PI;
    }
  }

  function spawnTrafficCar() {
    const axis = random.chance(0.5) ? 'v' : 'h';
    const street = axis === 'v' ? random.pick(VERTICAL_X) : random.pick(HORIZONTAL_Y);
    const max = axis === 'v' ? WORLD.height : WORLD.width;
    const dir = random.chance(0.5) ? 1 : -1;
    const car = {
      id: carId += 1, kind: 'traffic', axis, street, pos: random.range(80, max - 80),
      dir, lane: laneFor(axis, dir), speed: random.range(95, 150),
      color: random.pick(CAR_COLORS), health: CAR.health, x: 0, y: 0, angle: 0,
    };
    roadPos(car);
    return car;
  }

  function spawnParkedCar() {
    const axis = random.chance(0.5) ? 'v' : 'h';
    const street = axis === 'v' ? random.pick(VERTICAL_X) : random.pick(HORIZONTAL_Y);
    const max = axis === 'v' ? WORLD.height : WORLD.width;
    const pos = random.range(120, max - 120);
    const side = random.chance(0.5) ? 1 : -1;
    const car = {
      id: carId += 1, kind: 'parked', axis, street, pos, dir: side, lane: side * 52,
      speed: 0, color: random.pick(CAR_COLORS), health: CAR.health, x: 0, y: 0, angle: 0,
    };
    roadPos(car);
    // Nudge parked cars fully onto the shoulder so they never block a lane.
    if (axis === 'v') car.x = street + side * 52;
    else car.y = street + side * 52;
    car.angle = axis === 'v' ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    return car;
  }

  function spawnPed() {
    const axis = random.chance(0.5) ? 'v' : 'h';
    const street = axis === 'v' ? random.pick(VERTICAL_X) : random.pick(HORIZONTAL_Y);
    const max = axis === 'v' ? WORLD.height : WORLD.width;
    const dir = random.chance(0.5) ? 1 : -1;
    const ped = {
      axis, street, pos: random.range(80, max - 80), dir,
      lane: (random.chance(0.5) ? 1 : -1) * 50,
      speed: random.range(38, 62), color: random.pick(PED_COLORS),
      state: 'walk', timer: 0, x: 0, y: 0, angle: 0, fx: 0, fy: 0,
    };
    pedPos(ped);
    return ped;
  }

  function pedPos(ped) {
    if (ped.axis === 'v') {
      ped.x = ped.street + ped.lane;
      ped.y = ped.pos;
      ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      ped.x = ped.pos;
      ped.y = ped.street + ped.lane;
      ped.angle = ped.dir > 0 ? 0 : Math.PI;
    }
  }

  function snapPedToRoad(ped) {
    let bestV = null;
    let bestVd = Infinity;
    for (const vx of VERTICAL_X) {
      const d = Math.abs(ped.x - vx);
      if (d < bestVd) { bestVd = d; bestV = vx; }
    }
    let bestH = null;
    let bestHd = Infinity;
    for (const hy of HORIZONTAL_Y) {
      const d = Math.abs(ped.y - hy);
      if (d < bestHd) { bestHd = d; bestH = hy; }
    }
    if (bestVd <= bestHd) {
      ped.axis = 'v';
      ped.street = bestV;
      ped.pos = ped.y;
      ped.lane = ped.x >= bestV ? 50 : -50;
      ped.dir = random.chance(0.5) ? 1 : -1;
    } else {
      ped.axis = 'h';
      ped.street = bestH;
      ped.pos = ped.x;
      ped.lane = ped.y >= bestH ? 50 : -50;
      ped.dir = random.chance(0.5) ? 1 : -1;
    }
    pedPos(ped);
  }

  function reset() {
    state.time = 0;
    state.clock = 8 * 60;
    state.cash = 0;
    state.wanted = 0;
    state.seenTimer = 0;
    state.missionIndex = 0;
    state.missionStep = 0;
    state.storyDone = false;
    state.job = null;
    state.jobTimer = 0;
    state.banner = null;
    state.over = null;
    state.stats = { stolen: 0, missions: 0, earned: 0 };
    state.player = {
      x: SAFEHOUSE.x, y: SAFEHOUSE.y + 60, angle: -Math.PI / 2, health: PLAYER.health,
      inCar: null, speed: 0, punchTimer: 0, invuln: 0, arrestTimer: 0,
    };
    state.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < 10; i += 1) state.cars.push(spawnParkedCar());
    state.peds = [];
    for (let i = 0; i < PED_COUNT; i += 1) state.peds.push(spawnPed());
    state.cops = [];
    setBanner('MERIDIAN BAY', 'Rook is back in town. A driver for hire needs work — and wheels.');
  }

  function setBanner(title, sub) {
    state.banner = { title, sub: sub || '', timer: 4 };
  }

  function currentMission() {
    return state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
  }

  function currentStep() {
    const mission = currentMission();
    return mission ? mission.steps[state.missionStep] : null;
  }

  function addWanted(n) {
    const before = state.wanted;
    state.wanted = Math.max(0, Math.min(5, state.wanted + n));
    if (state.wanted > before) return EVENT_WANTED;
    return 0;
  }

  function nearestCop(px, py) {
    let best = Infinity;
    for (const c of state.cops) {
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < best) best = d;
    }
    for (const c of state.cars) {
      if (c.kind !== 'cop') continue;
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < best) best = d;
    }
    return best;
  }

  function spawnCopCar() {
    const edge = random.pick([
      { x: random.range(100, WORLD.width - 100), y: 90 },
      { x: random.range(100, WORLD.width - 100), y: WORLD.height - 120 },
      { x: 90, y: random.range(100, WORLD.height - 100) },
      { x: WORLD.width - 90, y: random.range(100, WORLD.height - 100) },
    ]);
    const near = nearestIntersection(edge.x, edge.y);
    const car = {
      id: carId += 1, kind: 'cop', x: near.x, y: near.y, angle: 0, speed: 0,
      color: '#20242e', health: CAR.health, ramTimer: 0,
    };
    state.cars.push(car);
    return car;
  }

  function spawnFootCop() {
    const p = state.player;
    const a = random.range(0, Math.PI * 2);
    const cop = {
      x: Math.max(40, Math.min(WORLD.width - 40, p.x + Math.cos(a) * 620)),
      y: Math.max(40, Math.min(WORLD.height - 40, p.y + Math.sin(a) * 620)),
      angle: 0, health: 50, down: 0, arrestTimer: 0, punchTimer: 0, speed: 245,
    };
    state.cops.push(cop);
    return cop;
  }

  function maintainPolice() {
    const wantCars = state.wanted > 0 ? Math.min(1 + Math.floor(state.wanted / 2), 3) : 0;
    const wantFoot = state.wanted > 0 ? Math.min(state.wanted, 2) : 0;
    let cars = 0;
    for (const c of state.cars) if (c.kind === 'cop') cars += 1;
    while (cars < wantCars) { spawnCopCar(); cars += 1; }
    let foot = 0;
    for (const c of state.cops) if (c.down <= 0) foot += 1;
    while (foot < wantFoot) { spawnFootCop(); foot += 1; }
  }

  function enterCar(car) {
    const p = state.player;
    if (car.kind === 'cop') return 0;
    let events = 0;
    if (car.kind === 'traffic') {
      // The driver bails out and runs.
      const driver = spawnPed();
      driver.x = car.x + 30;
      driver.y = car.y;
      driver.state = 'flee';
      driver.timer = 3;
      driver.fx = 1;
      driver.fy = 0;
      state.peds.push(driver);
      events |= addWanted(1);
    } else if (car.kind === 'parked') {
      if (nearestCop(car.x, car.y) < 350) events |= addWanted(1);
    }
    car.kind = 'player';
    car.speed = 0;
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    state.stats.stolen += 1;
    return events | EVENT_STEAL;
  }

  function exitCar() {
    const p = state.player;
    const car = p.inCar;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    const a = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(a) * 34;
    p.y = car.y + Math.sin(a) * 34;
    const fixed = collideCircle(city, p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    p.inCar = null;
    p.speed = 0;
  }

  function punch() {
    const p = state.player;
    if (p.inCar || p.punchTimer > 0) return 0;
    p.punchTimer = PLAYER.punchCooldown;
    let events = EVENT_PUNCH;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - p.x, ped.y - p.y) < PLAYER.punchRange) {
        ped.state = 'down';
        ped.timer = 4;
        events |= addWanted(1);
      }
    }
    for (const cop of state.cops) {
      if (cop.down > 0) continue;
      if (Math.hypot(cop.x - p.x, cop.y - p.y) < PLAYER.punchRange + 6) {
        cop.health -= PLAYER.punchDamage;
        if (cop.health <= 0) {
          cop.down = 5;
          cop.health = 50;
          cop.arrestTimer = 0;
        }
        events |= addWanted(1);
      }
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      // Slow down for a car ahead in the same lane.
      let ahead = Infinity;
      for (const other of state.cars) {
        if (other === car || other.kind !== 'traffic') continue;
        if (other.axis !== car.axis || other.street !== car.street || other.dir !== car.dir) continue;
        const gap = (other.pos - car.pos) * car.dir;
        if (gap > 0 && gap < ahead) ahead = gap;
      }
      const target = ahead < 90 ? 40 : car.speed;
      car.pos += car.dir * target * dt;
      const max = car.axis === 'v' ? WORLD.height : WORLD.width;
      if (car.pos < 50 || car.pos > max - 50) {
        car.dir *= -1;
        car.lane = laneFor(car.axis, car.dir);
        car.pos = Math.max(50, Math.min(max - 50, car.pos));
      }
      // At an intersection, sometimes turn onto the crossing street.
      const crosses = car.axis === 'v' ? HORIZONTAL_Y : VERTICAL_X;
      for (const cross of crosses) {
        if (Math.abs(car.pos - cross) < 3 && random.chance(0.3)) {
          const oldAxis = car.axis;
          car.axis = oldAxis === 'v' ? 'h' : 'v';
          car.street = cross;
          car.pos = oldAxis === 'v' ? car.x : car.y;
          car.dir = random.chance(0.5) ? 1 : -1;
          car.lane = laneFor(car.axis, car.dir);
          break;
        }
      }
      roadPos(car);
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.state = 'flee';
          ped.timer = 3;
          ped.fx = Math.sign(ped.x - p.x) || 1;
          ped.fy = Math.sign(ped.y - p.y) || 0;
        }
        continue;
      }
      if (ped.state === 'flee') {
        ped.timer -= dt;
        ped.x += ped.fx * 220 * dt;
        ped.y += ped.fy * 220 * dt;
        ped.x = Math.max(20, Math.min(WORLD.width - 20, ped.x));
        ped.y = Math.max(20, Math.min(BEACH_Y + 60, ped.y));
        if (ped.timer <= 0) {
          ped.state = 'walk';
          snapPedToRoad(ped);
        }
        continue;
      }
      // Walking: along the sidewalk; sometimes turn at an intersection.
      ped.pos += ped.dir * ped.speed * dt;
      const max = ped.axis === 'v' ? WORLD.height : WORLD.width;
      if (ped.pos < 50 || ped.pos > max - 50) {
        ped.dir *= -1;
        ped.pos = Math.max(50, Math.min(max - 50, ped.pos));
      }
      const crosses = ped.axis === 'v' ? HORIZONTAL_Y : VERTICAL_X;
      for (const cross of crosses) {
        if (Math.abs(ped.pos - cross) < 3 && random.chance(0.15)) {
          const oldAxis = ped.axis;
          ped.axis = oldAxis === 'v' ? 'h' : 'v';
          ped.street = cross;
          ped.pos = oldAxis === 'v' ? ped.x : ped.y;
          ped.dir = random.chance(0.5) ? 1 : -1;
          ped.lane = (random.chance(0.5) ? 1 : -1) * 50;
          break;
        }
      }
      pedPos(ped);
      // A speeding car or a punch nearby sends them running.
      const d = Math.hypot(ped.x - p.x, ped.y - p.y);
      const playerCar = p.inCar;
      const threat = playerCar
        ? Math.hypot(ped.x - playerCar.x, ped.y - playerCar.y) < 90 && Math.abs(playerCar.speed) > 200
        : d < 60;
      if (threat || (state.wanted >= 3 && d < 130)) {
        ped.state = 'flee';
        ped.timer = 3;
        const dx = ped.x - p.x;
        const dy = ped.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        ped.fx = dx / len;
        ped.fy = dy / len;
      }
    }
  }

  function stepCops(dt) {
    const p = state.player;
    maintainPolice();
    for (const car of state.cars) {
      if (car.kind !== 'cop') continue;
      car.ramTimer = Math.max(0, car.ramTimer - dt);
      const target = p.inCar ? p.inCar : p;
      const want = angleTo(car, target);
      const onRoad = isRoad(car.x, car.y);
      const maxSpeed = onRoad ? 395 : 300;
      car.angle = turnToward(car.angle, want, 2.9 * dt);
      car.speed = Math.min(maxSpeed, car.speed + 300 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const fixed = collideCircle(city, car.x, car.y, 20);
      car.x = fixed.x;
      car.y = fixed.y;
      if (fixed.blocked) car.speed *= 0.5;
      // Ramming the player's car, or the player on foot.
      if (p.inCar) {
        const d = Math.hypot(car.x - p.inCar.x, car.y - p.inCar.y);
        if (d < 56 && car.ramTimer <= 0 && car.speed > 120) {
          car.ramTimer = 0.6;
          p.inCar.health -= 10;
          p.inCar.speed *= 0.6;
        }
      } else if (Math.hypot(car.x - p.x, car.y - p.y) < 42 && car.speed > 100 && p.invuln <= 0) {
        p.health -= 15;
        p.invuln = 0.8;
        return EVENT_HIT;
      }
    }
    for (const cop of state.cops) {
      if (cop.down > 0) {
        cop.down -= dt;
        continue;
      }
      cop.punchTimer = Math.max(0, cop.punchTimer - dt);
      const target = p.inCar ? p.inCar : p;
      const want = angleTo(cop, target);
      cop.angle = turnToward(cop.angle, want, 4 * dt);
      const d = Math.hypot(cop.x - target.x, cop.y - target.y);
      if (d > 26) {
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
      }
      if (p.inCar) {
        if (d < 34 && cop.punchTimer <= 0) {
          cop.punchTimer = 0.8;
          p.inCar.health -= 5;
        }
        cop.arrestTimer = 0;
      } else if (d < 26) {
        cop.arrestTimer += dt;
        if (cop.punchTimer <= 0) {
          cop.punchTimer = 0.8;
          if (p.invuln <= 0) {
            p.health -= 10;
            p.invuln = 0.5;
          }
        }
        if (cop.arrestTimer > 1.2) return EVENT_BUSTED;
      } else {
        cop.arrestTimer = Math.max(0, cop.arrestTimer - dt);
      }
    }
    return 0;
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.inCar) {
      const car = p.inCar;
      const mag = Math.hypot(input.x, input.y);
      if (mag > 0.01) {
        const want = Math.atan2(input.y, input.x);
        const speedFactor = Math.min(1, Math.abs(car.speed) / 120 + 0.25);
        car.angle = turnToward(car.angle, want, 3.4 * speedFactor * dt);
        car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
      } else {
        car.speed = Math.max(0, car.speed - CAR.brake * 0.6 * dt);
      }
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const before = car.speed;
      const fixed = collideCircle(city, car.x, car.y, 20);
      car.x = fixed.x;
      car.y = fixed.y;
      if (fixed.blocked) {
        if (before > 260) return EVENT_CRASH;
        car.speed *= 0.4;
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = car.speed;
      // Running over a pedestrian.
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 30 && Math.abs(car.speed) > 120) {
          ped.state = 'down';
          ped.timer = 4;
          return addWanted(1);
        }
      }
      if (car.health <= 0) {
        exitCar();
        car.health = 0;
        setBanner('CAR WRECKED', 'That ride is done. Find another one.');
      }
      return 0;
    }
    // On foot.
    const mag = Math.hypot(input.x, input.y);
    const speed = input.run ? PLAYER.run : PLAYER.walk;
    if (mag > 0.01) {
      p.x += (input.x / mag) * speed * dt;
      p.y += (input.y / mag) * speed * dt;
      p.angle = Math.atan2(input.y, input.x);
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    const fixed = collideCircle(city, p.x, p.y, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    if (p.health < PLAYER.health && state.wanted === 0) {
      p.health = Math.min(PLAYER.health, p.health + 3 * dt);
    }
    return 0;
  }

  function checkMission() {
    const step = currentStep();
    if (!step) return 0;
    const p = state.player;
    if (step.type === 'steal') {
      if (p.inCar) return advanceMission();
      return 0;
    }
    if (step.type === 'goto' || step.type === 'deliver') {
      if (Math.hypot(p.x - step.pos.x, p.y - step.pos.y) < step.radius) return advanceMission();
      return 0;
    }
    if (step.type === 'pickup') {
      if (!p.inCar && Math.hypot(p.x - step.pos.x, p.y - step.pos.y) < step.radius) return advanceMission();
      return 0;
    }
    if (step.type === 'evade') {
      if (state.wanted === 0) return advanceMission();
      return 0;
    }
    return 0;
  }

  function advanceMission() {
    const mission = currentMission();
    state.missionStep += 1;
    if (state.missionStep >= mission.steps.length) {
      state.cash += mission.reward;
      state.stats.earned += mission.reward;
      state.stats.missions += 1;
      state.missionIndex += 1;
      state.missionStep = 0;
      if (state.missionIndex >= MISSIONS.length) {
        state.storyDone = true;
        setBanner('STORY COMPLETE', `Meridian Bay is yours, Rook. $${mission.reward} banked.`);
      } else {
        setBanner(`${mission.name} — DONE`, `$${mission.reward} banked. Next job: ${MISSIONS[state.missionIndex].name}.`);
      }
      save();
      return EVENT_MISSION;
    }
    setBanner(mission.name, mission.steps[state.missionStep].text);
    return EVENT_PICKUP;
  }

  function checkJob() {
    if (state.job) {
      const p = state.player;
      const target = state.job.phase === 'pickup' ? state.job.pickup : state.job.drop;
      if (Math.hypot(p.x - target.x, p.y - target.y) < 80) {
        if (state.job.phase === 'pickup') {
          state.job.phase = 'drop';
          setBanner('PARCEL COLLECTED', `Deliver it to the yellow marker — $${state.job.reward}.`);
          return EVENT_PICKUP;
        }
        const reward = state.job.reward;
        state.cash += reward;
        state.stats.earned += reward;
        state.job = null;
        state.jobTimer = 5;
        setBanner('DELIVERY DONE', `$${reward} banked.`);
        save();
        return EVENT_JOB;
      }
      return 0;
    }
    if (state.storyDone) {
      state.jobTimer -= STEP;
      if (state.jobTimer <= 0) {
        const pickup = random.pick(intersections);
        let drop = random.pick(intersections);
        while (Math.hypot(drop.x - pickup.x, drop.y - pickup.y) < 800) drop = random.pick(intersections);
        state.job = { pickup, drop, reward: random.int(100, 160), phase: 'pickup' };
        setBanner('NEW COURIER JOB', `Pick up the parcel at the yellow marker — $${state.job.reward}.`);
      }
    }
    return 0;
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, missionIndex: state.missionIndex, storyDone: state.storyDone,
      }));
    } catch {
      // Storage can be off: the run then lasts this visit only.
    }
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.cash = data.cash || 0;
      state.missionIndex = Math.min(data.missionIndex || 0, MISSIONS.length);
      state.storyDone = !!data.storyDone;
      return true;
    } catch {
      return false;
    }
  }

  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    state.clock += dt;
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    stepTraffic(dt);
    stepPeds(dt);
    if (!harmless) {
      events |= stepPlayer(dt, input);
      events |= stepCops(dt);
      // Wanted decays once no cop has seen the player for a while.
      if (state.wanted > 0) {
        if (nearestCop(state.player.x, state.player.y) < 450) state.seenTimer = 0;
        else state.seenTimer += dt;
        if (state.seenTimer > WANTED_DECAY_SECONDS) {
          state.wanted -= 1;
          state.seenTimer = 0;
        }
      }
      if (input.enter) {
        const p = state.player;
        if (p.inCar) {
          exitCar();
        } else {
          let best = null;
          let bestD = 60;
          for (const car of state.cars) {
            if (car.kind === 'cop') continue;
            const d = Math.hypot(car.x - p.x, car.y - p.y);
            if (d < bestD) { bestD = d; best = car; }
          }
          if (best) events |= enterCar(best);
        }
      }
      if (input.punch) events |= punch();
      events |= checkMission();
      events |= checkJob();
      // Mission 3 opens with the heat already on.
      if (state.missionIndex === 2 && state.missionStep === 0 && state.wanted === 0 && !state.storyDone) {
        state.wanted = 3;
        setBanner('LOSE THE HEAT', 'The whole force is after you. Break line of sight and stay gone.');
        events |= EVENT_WANTED;
      }
      if (state.player.health <= 0) {
        state.player.health = PLAYER.health;
        state.player.inCar = null;
        state.player.x = HOSPITAL.x;
        state.player.y = HOSPITAL.y;
        state.cash = Math.max(0, state.cash - 100);
        state.wanted = 0;
        setBanner('PATCHED UP', 'The hospital took $100. Stay out of trouble, Rook.');
        save();
        return events | EVENT_DOWN;
      }
      if (events & EVENT_BUSTED) {
        state.player.health = PLAYER.health;
        state.player.inCar = null;
        state.player.x = POLICE_HQ.x;
        state.player.y = POLICE_HQ.y + 60;
        state.cash = Math.max(0, state.cash - 150);
        state.wanted = 0;
        state.cops = [];
        setBanner('ARRESTED', 'The cops took $150. Walk it off, Rook.');
        save();
      }
    }
    return events;
  }

  reset();
  return {
    state, city, reset, step, save, loadSave, objectiveText, missionTarget, currentMission,
    MISSIONS, BEACH_Y,
  };
}
