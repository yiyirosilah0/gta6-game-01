// Meridian Heat — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast one),
// and the renderer paints what is there. The game moves between four screens:
// title, play, paused and game over.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|chase|mission|start (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, CAR, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_DOWN, EVENT_HIT, EVENT_JOB, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_STEAL } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
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
const renderer = createRenderer(canvas);
const audio = createAudio();

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
    // Storage can be off (private windows): the best haul then lasts this visit only.
  }
}

function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
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
  let muted = false;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    world.reset();
    if (!fresh && hasSave()) world.loadSave();
    world.state.over = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car — walk up to one and press E.');
  }

  function endGame(kind) {
    world.state.over = kind;
    screen = SCREEN_OVER;
    if (world.state.cash > best) {
      best = world.state.cash;
      saveBest(best);
    }
    announce(kind === 'arrested' ? 'Arrested. The cops took $150.' : 'Down. The hospital took $100.');
  }

  function nearestCopDistance() {
    const p = world.state.player;
    let bestD = Infinity;
    for (const car of world.state.cars) {
      if (car.kind !== 'cop') continue;
      bestD = Math.min(bestD, Math.hypot(car.x - p.x, car.y - p.y));
    }
    for (const cop of world.state.cops) {
      bestD = Math.min(bestD, Math.hypot(cop.x - p.x, cop.y - p.y));
    }
    return bestD;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One-shot presses are taken once per frame; the screen logic below takes
    // confirm/pause/mute, and the world steps take enter/punch from the same
    // set, so a press is never lost and never counted twice.
    const held = input.takeActions();
    if (held & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (held & ACTION_CONFIRM) startGame(true);
    } else if (screen === SCREEN_OVER) {
      if (held & ACTION_CONFIRM) {
        world.state.over = null;
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (held & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (held & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }

    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        if (screen === SCREEN_TITLE) {
          world.step(STEP, { x: 0, y: 0, run: false, enter: false, punch: false }, true);
        } else {
          const vector = input.vector();
          const events = world.step(STEP, {
            x: vector.x, y: vector.y, run: input.run,
            enter: !!(held & ACTION_ENTER), punch: !!(held & ACTION_PUNCH),
          }, false);
          if (events & EVENT_PICKUP) audio.blip();
          if (events & EVENT_JOB) audio.blip();
          if (events & EVENT_MISSION) {
            audio.jingle();
            if (world.state.cash > best) {
              best = world.state.cash;
              saveBest(best);
            }
          }
          if (events & EVENT_STEAL) audio.steal();
          if (events & EVENT_PUNCH) audio.punch();
          if (events & EVENT_CRASH) audio.crash();
          if (events & EVENT_HIT) audio.punch();
          if (events & EVENT_BUSTED) {
            audio.busted();
            endGame('arrested');
          } else if (events & EVENT_DOWN) {
            audio.busted();
            endGame('down');
          }
        }
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const p = world.state.player;
    const speedRatio = p.inCar ? Math.abs(p.inCar.speed) / CAR.maxSpeed : 0;
    audio.update(STEP, speedRatio, world.state.wanted >= 2 && nearestCopDistance() < 600);
    renderer.draw(world.state, screen, best, hasSave());
  }

  // Continue a saved game with C on the title screen; any key unlocks audio.
  window.addEventListener('keydown', (event) => {
    audio.unlock();
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && hasSave()) startGame(false);
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
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
