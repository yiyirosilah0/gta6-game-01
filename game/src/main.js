// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between title, play, paused,
// busted and down; the save (cash and mission) lives in localStorage.
//
// ?seed=N fixes the city and the spawns. ?shot=start|drive|chase|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_DOWN, EVENT_HIT, EVENT_JINGLE, EVENT_MISSION, EVENT_PAY, EVENT_PICKUP, EVENT_PUNCH, EVENT_STEAL } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_NEW, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_DOWN, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world.city);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}
function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best cash then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { hasSave: false, muted: false, best: 0 }, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let save = readSave();
  if (save) world.loadSave(save);
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNew() {
    world.reset();
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
    save = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('New game. Meridian Bay is yours.');
  }

  function continueGame() {
    const s = readSave();
    if (s) world.loadSave(s);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Welcome back. $${world.state.cash} in your pocket.`);
  }

  function nearestCop() {
    const p = world.state.player;
    let bestD = Infinity;
    for (const car of world.state.copCars) {
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) bestD = d;
    }
    for (const cop of world.state.footCops) {
      const d = Math.hypot(cop.x - p.x, cop.y - p.y);
      if (d < bestD) bestD = d;
    }
    return bestD;
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_NEW) startNew();
      else if (actions & ACTION_CONFIRM) {
        if (readSave()) continueGame();
        else startNew();
      }
      return;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_DOWN) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function buildInput(actions) {
    const move = input.move();
    const drive = input.drive();
    return {
      moveX: move.x,
      moveY: move.y,
      run: move.run,
      up: drive.up,
      down: drive.down,
      left: drive.left,
      right: drive.right,
      enter: Boolean(actions & ACTION_ENTER),
      punch: Boolean(actions & ACTION_PUNCH),
    };
  }

  function step(frameInput, first) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, frameInput, true);
      return;
    }
    const events = world.step(STEP, frameInput, false);
    if (!first) return;
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_STEAL) audio.steal();
    if (events & EVENT_JINGLE) audio.jingle();
    if (events & EVENT_MISSION) {
      announce(`Mission complete. $${world.state.cash} in your pocket.`);
      writeSave();
    }
    if (events & EVENT_PAY) writeSave();
    if (events & EVENT_BUSTED) {
      audio.sting();
      screen = SCREEN_BUSTED;
      announce('Busted. You paid a fine.');
      writeSave();
    } else if (events & EVENT_DOWN) {
      audio.sting();
      screen = SCREEN_DOWN;
      announce('You went down. You woke up at the hospital.');
      writeSave();
    } else if (events & EVENT_HIT) {
      audio.punch();
    }
    const p = world.state.player;
    if (p.inCar !== null) {
      const car = world.state.cars.find((c) => c.id === p.inCar);
      audio.update(car ? car.speed : 0, nearestCop());
    } else {
      audio.update(0, nearestCop());
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Take the one-shot presses once per frame and share them: the screen
    // handler takes confirm/pause/mute/new, the game input takes enter/punch.
    const actions = input.takeActions();
    handleActions(actions);
    const frameInput = buildInput(actions);
    let first = true;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(frameInput, first);
        first = false;
        frameInput.enter = false;
        frameInput.punch = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Autosave every few seconds while playing, so a crash loses little.
    saveTimer += 1;
    if (screen === SCREEN_PLAY && saveTimer % 300 === 0) writeSave();
    if (world.state.cash > best) {
      best = world.state.cash;
      saveBest(best);
    }
    audio.unlock();
    renderer.draw(world.state, screen, { hasSave: Boolean(readSave()), muted: audio.isMuted(), best }, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Meridian Heat. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
