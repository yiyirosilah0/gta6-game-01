// Meridian Heat — keyboard and pointer input. Held keys give a movement vector;
// one-shot presses (enter car, punch, pause, confirm, mute) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost
// and never counted twice.
import { KEYS } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;

function setHas(set, code) {
  return set.has(code);
}

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  function onKeyDown(event) {
    if (KEYS.confirm.includes(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (KEYS.pause.includes(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (KEYS.enterCar.includes(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (KEYS.punch.includes(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (KEYS.mute.includes(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if ([...KEYS.up, ...KEYS.down, ...KEYS.left, ...KEYS.right, ...KEYS.run].includes(event.code)) {
      held.add(event.code);
    } else {
      return;
    }
    event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onBlur() {
    held.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', onBlur);
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Normalised movement vector from the held keys, screen-relative. */
    vector() {
      let x = 0;
      let y = 0;
      if (KEYS.left.some((c) => setHas(held, c))) x -= 1;
      if (KEYS.right.some((c) => setHas(held, c))) x += 1;
      if (KEYS.up.some((c) => setHas(held, c))) y -= 1;
      if (KEYS.down.some((c) => setHas(held, c))) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    get run() {
      return KEYS.run.some((c) => setHas(held, c));
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
