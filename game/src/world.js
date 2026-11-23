// Meridian Heat — the simulation: the player, cars, traffic, pedestrians, the
// police, the wanted level, missions, combat and the clock. No drawing and no
// browser here: step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sound, announcements) without the world
// knowing about screens. Nothing here allocates after createWorld returns.
import { AVENUES, BEACH_TOP, CAR, CLOCK_RATE, CLOCK_START_MINUTES, COP, JOB_PAY, LANDMARKS, MISSIONS, PARKED_COUNT, PED_COUNT, PED_SPEED, PLAYER, ROAD_W, STREETS, TRAFFIC_COUNT, TRAFFIC_SPEED, WANTED, WORLD } from './config.js';
import { createCity } from './city.js';

export const EVENT_PUNCH = 1;
export const EVENT_CRASH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_STEAL = 8;
export const EVENT_PAY = 16;
export const EVENT_MISSION = 32;
export const EVENT_BUSTED = 64;
export const EVENT_DOWN = 128;
export const EVENT_HIT = 256;
export const EVENT_JINGLE = 512;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    player: null,
    cars: [],
    peds: [],
    footCops: [],
    copCars: [],
    particles: [],
    wanted: 0,
    cash: 0,
    missionIndex: 0,
    missionStage: 'start',
    missionTarget: null,
    job: null,
    clock: CLOCK_START_MINUTES,
    elapsed: 0,
    banner: null,
    objective: '',
    heatSeen: 0,
    heatTimer: 0,
    copTimer: 0,
    stats: { stolen: 0, punched: 0, runOver: 0, missions: 0 },
  };
  let carSeq = 1;

  // --- collision with the city -------------------------------------------
  function hitsBuilding(x, y, r) {
    for (const b of city.buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }
  function resolveCircle(e, r) {
    // Push a circle out of any building it overlaps; returns true on a hit.
    let hit = false;
    for (const b of city.buildings) {
      const cx = clamp(e.x, b.x, b.x + b.w);
      const cy = clamp(e.y, b.y, b.y + b.h);
      const dx = e.x - cx;
      const dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        hit = true;
        const d = Math.sqrt(d2) || 0.001;
        const push = (r - d) / d;
        e.x += dx * push;
        e.y += dy * push;
      }
    }
    return hit;
  }
  function onRoad(x, y) {
    return city.isRoad(x, y);
  }
  function randomRoadPoint() {
    if (random.next() < 0.5) {
      const ax = AVENUES[Math.floor(random.next() * AVENUES.length)];
      const y = 120 + random.next() * (WORLD.height - 360);
      return { x: ax, y };
    }
    const sy = STREETS[Math.floor(random.next() * STREETS.length)];
    const x = 120 + random.next() * (WORLD.width - 240);
    return { x, y: sy };
  }

  // --- spawning ------------------------------------------------------------
  function makeCar(kind, x, y, angle, color) {
    const car = {
      id: carSeq++,
      kind,
      x, y, angle,
      vx: 0, vy: 0,
      speed: 0,
      color,
      health: CAR.health,
      wrecked: false,
      node: -1,
      nextNode: -1,
      wait: 0,
      hitCd: 0,
    };
    state.cars.push(car);
    return car;
  }
  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const p = randomRoadPoint();
      const angle = random.next() < 0.5 ? 0 : Math.PI / 2;
      const car = makeCar('traffic', p.x, p.y, angle, random.pick(['#d9d9d9', '#5b7fa6', '#a65b5b', '#5ba66e', '#c9b458', '#8a8a8a']));
      car.node = city.nearestNode(p.x, p.y);
      car.nextNode = car.node;
      car.speed = TRAFFIC_SPEED * (0.8 + random.next() * 0.4);
    }
  }
  function spawnParked() {
    for (let i = 0; i < PARKED_COUNT; i += 1) {
      const p = randomRoadPoint();
      const along = random.next() < 0.5;
      const x = p.x + (along ? 0 : (random.next() < 0.5 ? -ROAD_W / 2 + 14 : ROAD_W / 2 - 14));
      const y = p.y + (along ? (random.next() < 0.5 ? -ROAD_W / 2 + 14 : ROAD_W / 2 - 14) : 0);
      makeCar('parked', x, y, along ? (random.next() < 0.5 ? 0 : Math.PI) : (random.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2), random.pick(['#d9d9d9', '#5b7fa6', '#a65b5b', '#5ba66e', '#c9b458', '#8a8a8a']));
    }
  }
  function spawnPeds() {
    for (let i = 0; i < PED_COUNT; i += 1) {
      const p = randomRoadPoint();
      const x = clamp(p.x + random.range(-90, 90), 40, WORLD.width - 40);
      const y = clamp(p.y + random.range(-90, 90), 40, WORLD.height - 40);
      state.peds.push({
        x, y,
        angle: random.next() * Math.PI * 2,
        speed: PED_SPEED * (0.7 + random.next() * 0.6),
        color: random.pick(['#e8b48a', '#8a6fb8', '#4e7fb8', '#c98a3d', '#6a8f5f', '#b8574e']),
        mode: 'walk',
        tx: x, ty: y,
        downT: 0,
        fleeT: 0,
      });
    }
  }
  function spawnCopCar() {
    const p = state.player;
    let best = null;
    let bd = Infinity;
    for (const n of city.nodes) {
      const d = dist2(n.x, n.y, p.x, p.y);
      if (d > 500 * 500 && d < bd) { bd = d; best = n; }
    }
    if (!best) best = city.nodes[0];
    const car = makeCar('cop', best.x, best.y, angleTo(best.x, best.y, p.x, p.y), '#1d4ed8');
    car.node = city.nearestNode(best.x, best.y);
    state.copCars.push(car);
    return car;
  }
  function spawnFootCop() {
    const p = state.player;
    const a = random.next() * Math.PI * 2;
    const x = clamp(p.x + Math.cos(a) * 320, 40, WORLD.width - 40);
    const y = clamp(p.y + Math.sin(a) * 320, 40, WORLD.height - 40);
    state.footCops.push({ x, y, angle: a, arrestT: 0, punchCd: 0 });
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = random.next() * Math.PI * 2;
      const s = speed * (0.4 + random.next() * 0.8);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + random.next() * 0.4, max: 0.9, color, size: 3 + random.next() * 3 });
    }
  }
  function setBanner(text, seconds) {
    state.banner = { text, t: seconds };
  }
  function addWanted(n) {
    state.wanted = clamp(state.wanted + n, 0, WANTED.max);
    state.heatSeen = state.elapsed;
  }
  function mission() {
    return state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
  }
  function setObjective(text) {
    state.objective = text;
  }
  function currentTarget() {
    const m = mission();
    if (m) {
      if (m.id === 'hot-wheels') return state.missionStage === 'steal' ? null : m.target;
      if (m.id === 'the-package') return state.missionStage === 'pickup' ? m.start : m.target;
      if (m.id === 'lose-the-heat') return state.missionStage === 'lose' ? null : m.target;
      return m.target;
    }
    if (state.job) return state.job.stage === 'pickup' ? state.job.pickup : state.job.dropoff;
    return null;
  }
  function startMission() {
    const m = mission();
    if (!m) { startJob(); return; }
    const p = state.player;
    p.x = m.start.x;
    p.y = m.start.y;
    p.angle = 0;
    if (m.startWanted) {
      state.wanted = m.startWanted;
      state.heatSeen = state.elapsed;
    }
    state.missionStage = 'start';
    state.missionTarget = m.target;
    if (m.id === 'hot-wheels') {
      state.missionStage = 'steal';
      setObjective(`${m.name}: steal a car, then drive to the Docks.`);
    } else if (m.id === 'the-package') {
      state.missionStage = 'pickup';
      setObjective(`${m.name}: pick up the package at the warehouse.`);
    } else if (m.id === 'lose-the-heat') {
      state.missionStage = 'lose';
      setObjective(`${m.name}: lose the cops, then reach the safehouse.`);
    }
    setBanner(`${m.name} — ${m.brief}`, 3.5);
  }
  function startJob() {
    const keys = Object.keys(LANDMARKS);
    const a = LANDMARKS[keys[Math.floor(random.next() * keys.length)]];
    let b = LANDMARKS[keys[Math.floor(random.next() * keys.length)]];
    while (b === a) b = LANDMARKS[keys[Math.floor(random.next() * keys.length)]];
    state.job = {
      pickup: { x: a.x, y: a.y, label: a.label },
      dropoff: { x: b.x, y: b.y, label: b.label },
      pay: JOB_PAY[Math.floor(random.next() * JOB_PAY.length)],
      stage: 'pickup',
    };
    setObjective(`Courier: pick up at ${a.label}, deliver to ${b.label} — $${state.job.pay}.`);
  }
  function completeMission() {
    const m = mission();
    const pay = m ? m.pay : 0;
    state.cash += pay;
    state.stats.missions += 1;
    setBanner(`Mission complete — $${pay}`, 3);
    state.missionIndex += 1;
    state.job = null;
    if (mission()) startMission();
    else startJob();
    return EVENT_MISSION | EVENT_PAY | EVENT_JINGLE;
  }

  function reset() {
    state.cars.length = 0;
    state.peds.length = 0;
    state.footCops.length = 0;
    state.copCars.length = 0;
    state.particles.length = 0;
    state.wanted = 0;
    state.cash = 0;
    state.missionIndex = 0;
    state.clock = CLOCK_START_MINUTES;
    state.elapsed = 0;
    state.banner = null;
    state.heatSeen = 0;
    state.heatTimer = 0;
    state.copTimer = 0;
    state.stats = { stolen: 0, punched: 0, runOver: 0, missions: 0 };
    state.player = {
      x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y,
      angle: 0, health: PLAYER.health,
      inCar: null, punchCd: 0, invuln: 0, speed: 0,
    };
    spawnTraffic();
    spawnParked();
    spawnPeds();
    startMission();
  }

  function getSave() {
    return { cash: state.cash, missionIndex: state.missionIndex };
  }
  function loadSave(save) {
    if (!save) return;
    state.cash = save.cash | 0;
    state.missionIndex = Math.min(save.missionIndex | 0, MISSIONS.length);
    startMission();
  }

  // --- the step ------------------------------------------------------------
  function stepPlayer(dt, input) {
    const p = state.player;
    if (p.punchCd > 0) p.punchCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.inCar !== null) return 0;
    const mx = input.moveX || 0;
    const my = input.moveY || 0;
    const len = Math.hypot(mx, my);
    let events = 0;
    if (len > 0.01) {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nx = p.x + (mx / len) * speed * dt;
      const ny = p.y + (my / len) * speed * dt;
      p.angle = Math.atan2(my, mx);
      p.speed = speed;
      // Axis-separated movement so walls slide instead of sticking.
      if (!hitsBuilding(nx, p.y, PLAYER.radius)) p.x = nx;
      if (!hitsBuilding(p.x, ny, PLAYER.radius)) p.y = ny;
      p.x = clamp(p.x, 20, WORLD.width - 20);
      p.y = clamp(p.y, 20, BEACH_TOP + 100); // the sea is not walkable
    } else {
      p.speed = 0;
    }
    if (input.punch && p.punchCd <= 0) {
      p.punchCd = PLAYER.punchCooldown;
      events |= EVENT_PUNCH;
      const px = p.x + Math.cos(p.angle) * PLAYER.punchRange;
      const py = p.y + Math.sin(p.angle) * PLAYER.punchRange;
      burst(px, py, '#ffd23f', 6, 120);
      // Punch a pedestrian, a foot cop, or a nearby car.
      for (const ped of state.peds) {
        if (ped.mode === 'down') continue;
        const d = Math.sqrt(dist2(ped.x, ped.y, p.x, p.y));
        if (d < PLAYER.punchRange + 12 && Math.abs(angleDiff(angleTo(p.x, p.y, ped.x, ped.y), p.angle)) < PLAYER.punchArc) {
          ped.mode = 'down';
          ped.downT = 3;
          burst(ped.x, ped.y, '#ffffff', 8, 160);
          addWanted(WANTED.punch);
          state.stats.punched += 1;
          events |= EVENT_HIT;
        }
      }
      for (const cop of state.footCops) {
        const d = Math.sqrt(dist2(cop.x, cop.y, p.x, p.y));
        if (d < PLAYER.punchRange + 12 && Math.abs(angleDiff(angleTo(p.x, p.y, cop.x, cop.y), p.angle)) < PLAYER.punchArc) {
          cop.arrestT = 0;
          burst(cop.x, cop.y, '#ffffff', 8, 160);
          addWanted(WANTED.punch);
          events |= EVENT_HIT;
        }
      }
    }
    if (input.enter) {
      let best = null;
      let bd = PLAYER.enterRange * PLAYER.enterRange;
      for (const car of state.cars) {
        if (car.kind === 'cop' || car.wrecked) continue;
        const d = dist2(car.x, car.y, p.x, p.y);
        if (d < bd) { bd = d; best = car; }
      }
      if (best) {
        if (best.kind === 'traffic') {
          // The driver bails and runs: stealing a car with a driver in it.
          const a = random.next() * Math.PI * 2;
          state.peds.push({
            x: best.x + Math.cos(a) * 30, y: best.y + Math.sin(a) * 30,
            angle: a, speed: PED_SPEED * 1.8,
            color: random.pick(['#e8b48a', '#8a6fb8', '#4e7fb8']),
            mode: 'flee', tx: 0, ty: 0, downT: 0, fleeT: 4,
          });
          addWanted(WANTED.steal);
          state.stats.stolen += 1;
        }
        best.kind = 'player';
        best.color = '#ff8c1a';
        best.health = Math.max(best.health, 60);
        p.inCar = best.id;
        events |= EVENT_STEAL;
      }
    }
    return events;
  }

  function stepPlayerCar(dt, input) {
    const p = state.player;
    const car = state.cars.find((c) => c.id === p.inCar);
    if (!car) { p.inCar = null; return 0; }
    let events = 0;
    if (car.hitCd > 0) car.hitCd -= dt;
    const fwdX = Math.cos(car.angle);
    const fwdY = Math.sin(car.angle);
    let forwardSpeed = car.vx * fwdX + car.vy * fwdY;
    // Throttle and brake.
    if (input.up) forwardSpeed += CAR.accel * dt;
    if (input.down) forwardSpeed -= (forwardSpeed > 20 ? CAR.brake : CAR.reverseAccel) * dt;
    if (!input.up && !input.down) forwardSpeed -= forwardSpeed * 1.6 * dt;
    forwardSpeed = clamp(forwardSpeed, -CAR.maxReverse, CAR.maxSpeed);
    // Steering bites harder the faster the car goes, and not at all standing still.
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const grip = clamp(Math.abs(forwardSpeed) / 120, 0, 1);
    car.angle += steer * CAR.turnRate * grip * (forwardSpeed < 0 ? -1 : 1) * dt;
    const nfx = Math.cos(car.angle);
    const nfy = Math.sin(car.angle);
    const latX = car.vx - (car.vx * nfx + car.vy * nfy) * nfx;
    const latY = car.vy - (car.vx * nfx + car.vy * nfy) * nfy;
    const damp = Math.exp(-CAR.grip * dt);
    car.vx = nfx * forwardSpeed + latX * damp;
    car.vy = nfy * forwardSpeed + latY * damp;
    car.speed = forwardSpeed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.x = clamp(car.x, 20, WORLD.width - 20);
    car.y = clamp(car.y, 20, BEACH_TOP + 100);
    if (resolveCircle(car, 18)) {
      // A hard hit on a building hurts the car and throws a spark burst.
      if (Math.abs(forwardSpeed) > 240 && car.hitCd <= 0) {
        car.hitCd = 0.6;
        car.health -= CAR.crashDamage;
        burst(car.x, car.y, '#ffb020', 10, 200);
        events |= EVENT_CRASH;
      }
      car.vx *= 0.4;
      car.vy *= 0.4;
    }
    if (car.health <= 0 && !car.wrecked) {
      car.wrecked = true;
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
      burst(car.x, car.y, '#555555', 16, 220);
      events |= EVENT_CRASH;
    }
    // Running over a pedestrian at speed.
    if (Math.abs(forwardSpeed) > 90) {
      for (const ped of state.peds) {
        if (ped.mode === 'down') continue;
        if (dist2(ped.x, ped.y, car.x, car.y) < 26 * 26) {
          ped.mode = 'down';
          ped.downT = 4;
          burst(ped.x, ped.y, '#ffffff', 10, 180);
          addWanted(WANTED.runOver);
          state.stats.runOver += 1;
          events |= EVENT_HIT;
        }
      }
    }
    if (input.enter) {
      // Step out beside the car; it stays where it is, parked.
      const a = car.angle + Math.PI / 2;
      p.x = clamp(car.x + Math.cos(a) * 30, 20, WORLD.width - 20);
      p.y = clamp(car.y + Math.sin(a) * 30, 20, BEACH_TOP + 100);
      p.angle = car.angle;
      car.kind = 'parked';
      p.inCar = null;
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      if (car.wrecked) continue;
      // Drive toward the next node on the road graph, keeping to the right.
      let target = city.nodes[car.nextNode];
      if (!target) { car.nextNode = car.node; continue; }
      const dx = target.x - car.x;
      const dy = target.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 26) {
        car.node = car.nextNode;
        const next = city.adjacency[car.node];
        car.nextNode = next[Math.floor(random.next() * next.length)];
        continue;
      }
      const want = Math.atan2(dy, dx);
      const turn = clamp(angleDiff(want, car.angle), -1, 1);
      car.angle += turn * 2.2 * dt;
      // Slow for a car ahead so traffic does not pile up at intersections.
      let slow = false;
      for (const other of state.cars) {
        if (other === car || other.wrecked) continue;
        const od = dist2(other.x, other.y, car.x, car.y);
        if (od < 52 * 52) {
          const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
          if (ahead > 0) { slow = true; break; }
        }
      }
      const speed = slow ? car.speed * 0.5 : TRAFFIC_SPEED;
      car.speed += (speed - car.speed) * Math.min(1, 2 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      resolveCircle(car, 16);
    }
    // Car-on-car shoves, so a pile-up sorts itself out instead of sticking.
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        if (a.wrecked && b.wrecked) continue;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 < 34 * 34 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (34 - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.mode === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) {
          ped.mode = 'flee';
          ped.fleeT = 3;
        }
        continue;
      }
      if (ped.mode === 'flee') {
        ped.fleeT -= dt;
        const p = state.player;
        const a = angleTo(p.x, p.y, ped.x, ped.y);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * 1.9 * dt;
        ped.y += Math.sin(a) * ped.speed * 1.9 * dt;
        ped.x = clamp(ped.x, 20, WORLD.width - 20);
        ped.y = clamp(ped.y, 20, BEACH_TOP + 100);
        if (ped.fleeT <= 0) ped.mode = 'walk';
        continue;
      }
      // Amble toward a waypoint; flee a speeding car or a nearby punch.
      const p = state.player;
      const car = p.inCar !== null ? state.cars.find((c) => c.id === p.inCar) : null;
      const threat = car && Math.abs(car.speed) > 200 && dist2(ped.x, ped.y, car.x, car.y) < 160 * 160;
      if (threat) {
        ped.mode = 'flee';
        ped.fleeT = 2;
        continue;
      }
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        ped.tx = clamp(ped.x + random.range(-260, 260), 40, WORLD.width - 40);
        ped.ty = clamp(ped.y + random.range(-260, 260), 40, WORLD.height - 60);
        continue;
      }
      ped.angle = Math.atan2(dy, dx);
      const nx = ped.x + (dx / d) * ped.speed * dt;
      const ny = ped.y + (dy / d) * ped.speed * dt;
      if (!hitsBuilding(nx, ped.y, 8)) ped.x = nx;
      if (!hitsBuilding(ped.x, ny, 8)) ped.y = ny;
    }
  }

  function stepCops(dt) {
    const p = state.player;
    // How many cop cars the wanted level calls for.
    const wantCars = state.wanted === 0 ? 0 : state.wanted <= 1 ? 1 : state.wanted <= 3 ? 2 : 3;
    state.copTimer -= dt;
    if (state.copCars.length < wantCars && state.copTimer <= 0) {
      spawnCopCar();
      state.copTimer = COP.spawnGap;
    }
    // Cop cars chase the player and ram.
    for (const car of state.copCars) {
      if (car.wrecked) continue;
      const want = angleTo(car.x, car.y, p.x, p.y);
      const turn = clamp(angleDiff(want, car.angle), -1, 1);
      const d = Math.sqrt(dist2(car.x, car.y, p.x, p.y));
      const speed = d > 300 ? COP.carSpeed : COP.carSpeed * 0.85;
      car.angle += turn * 2.6 * dt;
      car.x += Math.cos(car.angle) * speed * dt;
      car.y += Math.sin(car.angle) * speed * dt;
      car.x = clamp(car.x, 20, WORLD.width - 20);
      car.y = clamp(car.y, 20, BEACH_TOP + 100);
      resolveCircle(car, 16);
      if (d < 40 && car.hitCd <= 0) {
        car.hitCd = 1.2;
        burst(car.x, car.y, '#3b82f6', 8, 180);
        if (p.inCar !== null) {
          const pc = state.cars.find((c) => c.id === p.inCar);
          if (pc) pc.health -= 10;
        } else if (p.invuln <= 0) {
          p.health -= 18;
          p.invuln = 0.8;
        }
        addWanted(WANTED.copRam);
      }
      if (car.hitCd > 0) car.hitCd -= dt;
    }
    // Foot cops chase the player on foot and arrest after sustained contact.
    const wantFoot = state.wanted > 0 && p.inCar === null ? Math.min(state.wanted, 3) : 0;
    if (state.footCops.length < wantFoot && state.copTimer <= 0) {
      spawnFootCop();
      state.copTimer = COP.spawnGap;
    }
    let busted = false;
    for (const cop of state.footCops) {
      const d = Math.sqrt(dist2(cop.x, cop.y, p.x, p.y));
      const want = angleTo(cop.x, cop.y, p.x, p.y);
      cop.angle = want;
      if (d > 26) {
        cop.x += Math.cos(want) * COP.footSpeed * dt;
        cop.y += Math.sin(want) * COP.footSpeed * dt;
        cop.arrestT = 0;
      } else {
        cop.arrestT += dt;
        if (cop.punchCd <= 0) {
          cop.punchCd = COP.punchCooldown;
          if (p.invuln <= 0) {
            p.health -= COP.punchDamage;
            p.invuln = 0.5;
          }
        }
        if (cop.arrestT >= COP.arrestTime) busted = true;
      }
      if (cop.punchCd > 0) cop.punchCd -= dt;
      resolveCircle(cop, 10);
    }
    if (state.wanted === 0 && (state.copCars.length > 0 || state.footCops.length > 0)) {
      // The heat is off: cops stand down and leave the world entirely.
      for (const car of state.copCars) {
        const i = state.cars.indexOf(car);
        if (i >= 0) state.cars.splice(i, 1);
      }
      state.copCars.length = 0;
      state.footCops.length = 0;
    }
    return busted;
  }

  function stepWanted(dt) {
    const p = state.player;
    // Any cop within sight keeps the heat fresh.
    let seen = false;
    for (const car of state.copCars) {
      if (dist2(car.x, car.y, p.x, p.y) < 520 * 520) { seen = true; break; }
    }
    if (!seen) {
      for (const cop of state.footCops) {
        if (dist2(cop.x, cop.y, p.x, p.y) < 420 * 420) { seen = true; break; }
      }
    }
    if (seen) {
      state.heatTimer = 0;
    } else if (state.wanted > 0) {
      // Out of sight: after the delay, a star drops every decayStep seconds.
      state.heatTimer += dt;
      if (state.heatTimer > WANTED.decayDelay + WANTED.decayStep) {
        state.heatTimer = WANTED.decayDelay;
        state.wanted -= 1;
        if (state.wanted === 0) setBanner('Clean — the heat is off.', 2.5);
      }
    }
  }

  function stepMissions(dt) {
    let events = 0;
    const m = mission();
    const p = state.player;
    const target = currentTarget();
    if (m && m.id === 'hot-wheels' && state.missionStage === 'steal' && p.inCar !== null) {
      state.missionStage = 'drive';
      setObjective(`${m.name}: drive to the Docks marker.`);
      setBanner('Car stolen — get to the Docks.', 2.5);
    }
    if (m && m.id === 'lose-the-heat' && state.missionStage === 'lose' && state.wanted === 0) {
      state.missionStage = 'reach';
      setObjective(`${m.name}: reach the safehouse.`);
      setBanner('Clean — now reach the safehouse.', 2.5);
    }
    if (target) {
      const reach = m && m.id === 'the-package' && state.missionStage === 'pickup' ? 44 : 52;
      if (dist2(p.x, p.y, target.x, target.y) < reach * reach) {
        if (m && m.id === 'the-package' && state.missionStage === 'pickup') {
          state.missionStage = 'deliver';
          setObjective(`${m.name}: deliver the package to the safehouse.`);
          setBanner('Package picked up — deliver it.', 2.5);
          events |= EVENT_PICKUP;
        } else if (state.job && state.job.stage === 'pickup') {
          state.job.stage = 'dropoff';
          setObjective(`Courier: deliver to ${state.job.dropoff.label} — $${state.job.pay}.`);
          setBanner('Picked up — deliver it.', 2.5);
          events |= EVENT_PICKUP;
        } else if (state.job) {
          state.cash += state.job.pay;
          setBanner(`Courier done — $${state.job.pay}`, 3);
          events |= EVENT_PAY | EVENT_JINGLE;
          startJob();
        } else {
          events |= completeMission();
        }
      }
    }
    return events;
  }

  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.clock += dt * CLOCK_RATE;
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    stepTraffic(dt);
    stepPeds(dt);
    if (harmless) {
      // The title screen's backdrop: the city lives, nothing touches the player.
      state.player.x = LANDMARKS.safehouse.x;
      state.player.y = LANDMARKS.safehouse.y;
      return 0;
    }
    events |= stepPlayer(dt, input);
    if (state.player.inCar !== null) events |= stepPlayerCar(dt, input);
    const busted = stepCops(dt);
    stepWanted(dt);
    events |= stepMissions(dt);
    // Player health regen when clean and out of trouble.
    if (state.wanted === 0 && state.player.health < PLAYER.health && state.player.invuln <= 0) {
      state.player.health = Math.min(PLAYER.health, state.player.health + 4 * dt);
    }
    if (state.player.health <= 0) {
      events |= EVENT_DOWN;
      respawn('down');
    }
    if (busted) {
      events |= EVENT_BUSTED;
      respawn('busted');
    }
    // A wrecked player car strands the player on foot beside it.
    const p = state.player;
    if (p.inCar !== null) {
      const car = state.cars.find((c) => c.id === p.inCar);
      if (car && car.wrecked) {
        p.x = clamp(car.x + 34, 20, WORLD.width - 20);
        p.y = clamp(car.y, 20, BEACH_TOP + 100);
        p.inCar = null;
        setBanner('Your car is wrecked.', 2.5);
      }
    }
    return events;
  }

  function respawn(kind) {
    const p = state.player;
    const fine = Math.min(state.cash, COP.fine);
    state.cash -= fine;
    state.wanted = 0;
    state.copCars.length = 0;
    state.footCops.length = 0;
    if (p.inCar !== null) {
      const car = state.cars.find((c) => c.id === p.inCar);
      if (car) car.kind = 'parked';
      p.inCar = null;
    }
    if (kind === 'busted') {
      p.x = LANDMARKS.policeHq.x;
      p.y = LANDMARKS.policeHq.y;
      setBanner(`Busted — fined $${fine}.`, 3);
    } else {
      p.x = LANDMARKS.hospital.x;
      p.y = LANDMARKS.hospital.y;
      setBanner(`You went down — fined $${fine}.`, 3);
    }
    p.health = PLAYER.health;
    p.angle = 0;
    p.invuln = 2;
  }

  reset();
  return { state, city, reset, step, getSave, loadSave, currentTarget, mission, startMission, startJob };
}
