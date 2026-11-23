// Meridian Heat — drawing only: the city, the cars, the people, the HUD with
// its minimap, and the title, pause and game-over screens. The camera follows
// the player; the world is drawn in world coordinates, the HUD in screen ones.
import { BEACH_Y, CAR, COLORS, HORIZONTAL_Y, PLAYER, ROAD_W, VERTICAL_X, WATER_Y, WORLD } from './config.js';
import { missionTarget, objectiveText } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = { w: 220, h: 150 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { w: 1280, h: 720, dpr: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * ratio);
    canvas.height = Math.round(view.h * ratio);
  }

  function text(value, x, y, size, color, align, bold) {
    const key = `${size}:${bold ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawCarShape(x, y, angle, length, width, color, isCop, flash) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(-length / 2 + 3, -width / 2 + 4, length, width, 8);
    context.fill();
    context.fillStyle = color;
    roundRect(-length / 2, -width / 2, length, width, 8);
    context.fill();
    if (isCop) {
      context.fillStyle = '#f2f2f2';
      context.fillRect(-length / 2 + 8, -width / 2, length - 16, width);
      context.fillStyle = flash ? '#ff3b30' : '#2b6bff';
      context.fillRect(-6, -width / 2 - 2, 12, 7);
      context.fillStyle = flash ? '#2b6bff' : '#ff3b30';
      context.fillRect(-6, width / 2 - 5, 12, 7);
    }
    context.fillStyle = '#20242e';
    roundRect(-length / 2 + 10, -width / 2 + 5, 12, width - 10, 3);
    context.fill();
    context.fillRect(length / 2 - 12, -width / 2 + 5, 8, width - 10);
    context.fillStyle = '#ffe9a8';
    context.fillRect(length / 2 - 2, -width / 2 + 3, 3, 6);
    context.fillRect(length / 2 - 2, width / 2 - 9, 3, 6);
    context.restore();
  }

  function drawCity(state, cam) {
    const { city } = state;
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD.width, cam.x + cam.w + 40);
    const y1 = Math.min(WORLD.height, cam.y + cam.h + 40);
    // Ground.
    context.fillStyle = COLORS.grass;
    context.fillRect(x0, y0, x1 - x0, Math.min(y1, BEACH_Y) - y0);
    context.fillStyle = COLORS.sand;
    context.fillRect(x0, Math.max(y0, BEACH_Y), x1 - x0, Math.min(y1, WATER_Y) - Math.max(y0, BEACH_Y));
    context.fillStyle = COLORS.water;
    context.fillRect(x0, Math.max(y0, WATER_Y), x1 - x0, y1 - Math.max(y0, WATER_Y));
    context.fillStyle = COLORS.waterDeep;
    for (let wx = 60; wx < WORLD.width; wx += 180) {
      context.fillRect(wx, WATER_Y + 18, 90, 3);
      context.fillRect(wx + 40, WATER_Y + 44, 70, 3);
    }
    // Parks.
    for (const park of city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      context.fillStyle = COLORS.park;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Sidewalks, then roads.
    context.fillStyle = COLORS.sidewalk;
    for (const vx of VERTICAL_X) context.fillRect(vx - ROAD_W / 2 - 10, 0, ROAD_W + 20, BEACH_Y);
    for (const hy of HORIZONTAL_Y) context.fillRect(0, hy - ROAD_W / 2 - 10, WORLD.width, ROAD_W + 20);
    context.fillStyle = COLORS.road;
    for (const vx of VERTICAL_X) context.fillRect(vx - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
    for (const hy of HORIZONTAL_Y) context.fillRect(0, hy - ROAD_W / 2, WORLD.width, ROAD_W);
    // Centre dashes.
    context.fillStyle = '#d9d4c5';
    for (const vx of VERTICAL_X) {
      for (let y = 20; y < BEACH_Y; y += 56) context.fillRect(vx - 2, y, 4, 26);
    }
    for (const hy of HORIZONTAL_Y) {
      for (let x = 20; x < WORLD.width; x += 56) context.fillRect(x, hy - 2, 26, 4);
    }
    // Buildings.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      for (let wx = b.x + 16; wx < b.x + b.w - 14; wx += 26) {
        for (let wy = b.y + 16; wy < b.y + b.h - 14; wy += 26) context.fillRect(wx, wy, 8, 8);
      }
    }
    // Docks containers.
    for (const c of city.containers) {
      context.fillStyle = c.color;
      context.fillRect(c.x, c.y, c.w, c.h);
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.fillRect(c.x, c.y + c.h / 2 - 2, c.w, 4);
    }
    // Trees.
    for (const t of city.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.beginPath();
      context.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = t.palm ? '#4f9b4a' : COLORS.tree;
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = COLORS.treeDark;
      context.beginPath();
      context.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawMarker(state) {
    const target = missionTarget(state);
    const pulse = 1 + 0.12 * Math.sin(state.time * 4);
    const r = 26 * pulse;
    context.save();
    context.strokeStyle = target.color;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(target.x, target.y, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = target.color;
    context.beginPath();
    context.moveTo(target.x, target.y - 52 - 8 * Math.sin(state.time * 4));
    context.lineTo(target.x - 12, target.y - 30 - 8 * Math.sin(state.time * 4));
    context.lineTo(target.x + 12, target.y - 30 - 8 * Math.sin(state.time * 4));
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawWorld(state, cam) {
    drawCity(state, cam);
    drawMarker(state);
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.x < cam.x - 30 || ped.x > cam.x + cam.w + 30 || ped.y < cam.y - 30 || ped.y > cam.y + cam.h + 30) continue;
      if (ped.state === 'down') {
        context.fillStyle = ped.color;
        context.beginPath();
        context.ellipse(ped.x, ped.y, 12, 6, ped.angle, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.beginPath();
      context.ellipse(ped.x + 2, ped.y + 3, 9, 5, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ped.color;
      context.beginPath();
      context.arc(ped.x, ped.y, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#20242e';
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    // Cars.
    const flash = Math.floor(state.time * 3) % 2 === 0;
    for (const car of state.cars) {
      if (car.x < cam.x - 60 || car.x > cam.x + cam.w + 60 || car.y < cam.y - 60 || car.y > cam.y + cam.h + 60) continue;
      const isCop = car.kind === 'cop';
      drawCarShape(car.x, car.y, car.angle, CAR.length, CAR.width, isCop ? '#20242e' : car.color, isCop, flash);
      if (car.health < CAR.health && car.health > 0) {
        context.fillStyle = 'rgba(40,40,40,0.5)';
        context.beginPath();
        context.arc(car.x - 10, car.y - 8, 6 + (1 - car.health / CAR.health) * 8, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Foot cops.
    for (const cop of state.cops) {
      if (cop.down > 0) {
        context.fillStyle = '#2b4acb';
        context.beginPath();
        context.ellipse(cop.x, cop.y, 12, 6, cop.angle, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = '#2b4acb';
      context.beginPath();
      context.arc(cop.x, cop.y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#f2f2f2';
      context.beginPath();
      context.arc(cop.x, cop.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    // The player, on foot (in a car the car itself is the player).
    const p = state.player;
    if (!p.inCar) {
      if (p.invuln === 0 || Math.floor(p.invuln * 10) % 2 === 1) {
        context.fillStyle = 'rgba(0,0,0,0.3)';
        context.beginPath();
        context.ellipse(p.x + 2, p.y + 3, 10, 6, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = COLORS.player;
        context.beginPath();
        context.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#20242e';
        context.beginPath();
        context.arc(p.x + Math.cos(p.angle) * 6, p.y + Math.sin(p.angle) * 6, 5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(p.x, p.y, PLAYER.radius + 3, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawMinimap(state) {
    const x = view.w - MINIMAP.w - 16;
    const y = 16;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.save();
    context.fillStyle = 'rgba(16,20,28,0.85)';
    roundRect(x - 6, y - 6, MINIMAP.w + 12, MINIMAP.h + 12, 8);
    context.fill();
    context.beginPath();
    context.rect(x, y, MINIMAP.w, MINIMAP.h);
    context.clip();
    context.fillStyle = '#5d8a4a';
    context.fillRect(x, y, MINIMAP.w, MINIMAP.h);
    context.fillStyle = '#2f8fb5';
    context.fillRect(x, y + (WATER_Y - 10) * sy, MINIMAP.w, MINIMAP.h);
    context.fillStyle = '#3c3f46';
    for (const vx of VERTICAL_X) context.fillRect(x + vx * sx - 1, y, 2, MINIMAP.h);
    for (const hy of HORIZONTAL_Y) context.fillRect(x, y + hy * sy - 1, MINIMAP.w, 2);
    const target = missionTarget(state);
    context.fillStyle = target.color;
    context.beginPath();
    context.arc(x + target.x * sx, y + target.y * sy, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#57b6ff';
    context.fillRect(x + 640 * sx - 3, y + 640 * sy - 3, 6, 6);
    for (const car of state.cars) {
      if (car.kind !== 'cop') continue;
      context.fillStyle = Math.floor(state.time * 3) % 2 === 0 ? '#ff3b30' : '#2b6bff';
      context.beginPath();
      context.arc(x + car.x * sx, y + car.y * sy, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    const p = state.player;
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(x + p.x * sx, y + p.y * sy, 4.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#20242e';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x + p.x * sx, y + p.y * sy, 4.5, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawHud(state, screen, muted) {
    const p = state.player;
    const hours = Math.floor(state.clock / 60) % 24;
    const minutes = Math.floor(state.clock % 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    // Top-left status panel.
    context.fillStyle = 'rgba(16,20,28,0.78)';
    roundRect(16, 16, 250, 92, 10);
    context.fill();
    text(`$${state.cash}`, 30, 48, 26, '#ffd94a', 'left', true);
    text(clock, 252, 48, 22, '#eef1f5', 'right', true);
    context.fillStyle = '#3a3f4a';
    roundRect(30, 60, 180, 12, 6);
    context.fill();
    context.fillStyle = p.health > 30 ? '#4fd97a' : '#ff3b30';
    roundRect(30, 60, Math.max(0, 180 * p.health / PLAYER.health), 12, 6);
    context.fill();
    text('HEALTH', 216, 72, 12, '#b9bec9', 'left', true);
    // Wanted stars, top centre.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, view.w / 2, 46, 30, state.wanted > 0 ? '#ffd94a' : '#6a7080', 'center', true);
    // Objective bar under the status panel.
    const objective = state.over ? '' : objectiveText(state);
    if (objective) {
      context.fillStyle = 'rgba(16,20,28,0.78)';
      roundRect(16, 120, 560, 34, 8);
      context.fill();
      text('▸', 30, 144, 18, '#ffd94a', 'left', true);
      const maxChars = 72;
      const shown = objective.length > maxChars ? objective.slice(0, maxChars - 1) + '…' : objective;
      text(shown, 52, 144, 17, '#eef1f5', 'left', true);
    }
    drawMinimap(state);
    // Speed when driving.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.32);
      text(`${kmh}`, view.w - 30, view.h - 46, 44, '#fff', 'right', true);
      text('km/h', view.w - 30, view.h - 18, 16, '#b9bec9', 'right', true);
      if (p.inCar.health < CAR.health) {
        context.fillStyle = '#3a3f4a';
        roundRect(view.w - 210, view.h - 96, 180, 10, 5);
        context.fill();
        context.fillStyle = '#ff9a3d';
        roundRect(view.w - 210, view.h - 96, 180 * p.inCar.health / CAR.health, 10, 5);
        context.fill();
        text('CAR', view.w - 216, view.h - 84, 12, '#b9bec9', 'right', true);
      }
    }
    // Banner, below the HUD so it never covers the objective bar.
    if (state.banner) {
      const alpha = Math.min(1, state.banner.timer);
      context.save();
      context.globalAlpha = alpha;
      text(state.banner.title, view.w / 2, 214, 34, '#ffd94a', 'center', true);
      if (state.banner.sub) text(state.banner.sub, view.w / 2, 246, 18, '#eef1f5', 'center');
      context.restore();
    }
    // Controls hint, bottom left.
    text('WASD move/drive · E enter car · F punch · Shift run · P pause · M mute', 16, view.h - 16, 14, 'rgba(238,241,245,0.65)', 'left');
    if (muted) text('MUTED', 16, view.h - 40, 14, '#ff9a3d', 'left', true);
    void screen;
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineH = 32;
    const height = 150 + lines.length * lineH + 70;
    const x = (view.w - width) / 2;
    const y = (view.h - height) / 2;
    context.fillStyle = 'rgba(16,20,28,0.92)';
    roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent || '#ffd94a';
    context.lineWidth = 3;
    roundRect(x, y, width, height, 14);
    context.stroke();
    text(title, view.w / 2, y + 72, 46, accent || '#ffd94a', 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], view.w / 2, y + 128 + index * lineH, 20, '#dfe3ea', 'center');
    }
    text(prompt, view.w / 2, y + height - 34, 20, '#ffd94a', 'center', true);
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel. */
  function draw(state, screen, best, hasSave) {
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    context.fillStyle = '#11141b';
    context.fillRect(0, 0, view.w, view.h);
    const p = state.player;
    const zoom = 1;
    const camW = view.w / zoom;
    const camH = view.h / zoom;
    const cam = {
      x: Math.max(0, Math.min(WORLD.width - camW, p.x - camW / 2)),
      y: Math.max(0, Math.min(WORLD.height - camH, p.y - camH / 2)),
      w: camW,
      h: camH,
    };
    context.save();
    context.translate(-cam.x * zoom, -cam.y * zoom);
    context.scale(zoom, zoom);
    drawWorld(state, cam);
    context.restore();
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(10,14,22,0.55)';
      context.fillRect(0, 0, view.w, view.h);
      const lines = [
        'An open-world crime game in Meridian Bay.',
        'Steal cars, outrun the cops, run jobs for cash.',
        'WASD move and drive · E enter a car · F punch · Shift run',
        hasSave ? 'A saved game is waiting for you.' : '',
        best > 0 ? `Best haul: $${best}` : '',
      ].filter((l) => l !== '');
      drawPanel('MERIDIAN HEAT', lines, hasSave ? 'ENTER new game · C continue' : 'Press ENTER to start', '#ffd94a');
      return;
    }
    drawHud(state, screen, false);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(10,14,22,0.6)';
      context.fillRect(0, 0, view.w, view.h);
      drawPanel('PAUSED', ['The city waits for you.'], 'P to resume · Q back to title', '#57b6ff');
    } else if (screen === SCREEN_OVER) {
      context.fillStyle = 'rgba(10,14,22,0.6)';
      context.fillRect(0, 0, view.w, view.h);
      const over = state.over === 'arrested'
        ? { title: 'ARRESTED', lines: ['The Meridian Bay PD took $150 off you.', 'Your record is clean again — for now.'], accent: '#57b6ff' }
        : { title: 'DOWN', lines: ['Rook got patched up at the hospital.', 'It cost $100. Stay sharp out there.'], accent: '#ff6b5e' };
      drawPanel(over.title, over.lines, 'Press ENTER to keep playing', over.accent);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize };
}
