// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player across the 2560x1920 city and the 1280x720 logical
// view is scaled to fit the window. Flat shapes, canvas text for the HUD and
// the panels, and a live minimap. No game logic lives here.
import { AVENUES, BEACH_TOP, COLORS, LANDMARKS, ROAD_W, STREETS, WORLD } from './config.js';
import { SCREEN_BUSTED, SCREEN_DOWN, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './config.js';
export { SCREEN_BUSTED, SCREEN_DOWN, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE };

const VIEW_W = 1280;
const VIEW_H = 720;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas, city) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, bold) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function camera(state, screen, time) {
    if (screen === SCREEN_TITLE) {
      // A slow pan around the safehouse so the title sits over a living city.
      const cx = LANDMARKS.safehouse.x + Math.cos(time * 0.08) * 260 - VIEW_W / 2;
      const cy = LANDMARKS.safehouse.y + Math.sin(time * 0.05) * 160 - VIEW_H / 2;
      return { x: Math.max(0, Math.min(WORLD.width - VIEW_W, cx)), y: Math.max(0, Math.min(WORLD.height - VIEW_H, cy)) };
    }
    const p = state.player;
    return {
      x: Math.max(0, Math.min(WORLD.width - VIEW_W, p.x - VIEW_W / 2)),
      y: Math.max(0, Math.min(WORLD.height - VIEW_H, p.y - VIEW_H / 2)),
    };
  }

  function drawGround(cam) {
    // Grass in two tones, in a checker so the ground reads as terrain.
    const tile = 160;
    const x0 = Math.max(0, Math.floor(cam.x / tile) * tile);
    const y0 = Math.max(0, Math.floor(cam.y / tile) * tile);
    for (let y = y0; y < cam.y + VIEW_H + tile; y += tile) {
      for (let x = x0; x < cam.x + VIEW_W + tile; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) % 2 === 0) ? COLORS.grass : COLORS.grassDark;
        ctx.fillRect(x, y, tile, tile);
      }
    }
    // Beach and sea along the south edge.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, BEACH_TOP, WORLD.width, 100);
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(0, BEACH_TOP + 100, WORLD.width, WORLD.height - BEACH_TOP - 100);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = 0; x < WORLD.width; x += 90) ctx.fillRect(x, BEACH_TOP + 104, 46, 3);
    // Sidewalks: pale strips along every street.
    ctx.fillStyle = COLORS.sidewalk;
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2 - 10, 0, ROAD_W + 20, BEACH_TOP);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2 - 10, WORLD.width, ROAD_W + 20);
    // Roads: asphalt with an edge and a dashed centre line.
    ctx.fillStyle = COLORS.road;
    for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, BEACH_TOP);
    for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2, WORLD.width, ROAD_W);
    ctx.fillStyle = COLORS.dash;
    for (const ax of AVENUES) {
      for (let y = 0; y < BEACH_TOP; y += 56) ctx.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of STREETS) {
      for (let x = 0; x < WORLD.width; x += 56) ctx.fillRect(x, sy - 2, 28, 4);
    }
    // Parks and their trees.
    for (const park of city.parks) {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    for (const tree of city.trees) {
      ctx.fillStyle = COLORS.tree;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(tree.x - 2, tree.y + 3, tree.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Buildings: flat roof, dark edge, a row of windows.
    for (const b of city.buildings) {
      ctx.fillStyle = COLORS.buildingEdge;
      ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          ctx.fillRect(b.x + 8 + c * 26, b.y + 8 + r * 26, 12, 9);
        }
      }
    }
    // The Docks: stacked containers.
    for (const c of city.containers) {
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(c.x, c.y + c.h - 6, c.w, 6);
    }
    // Landmark pads: a coloured square and a letter, so each reads at a glance.
    const marks = [
      { at: LANDMARKS.safehouse, letter: 'H', color: COLORS.safehouse },
      { at: LANDMARKS.warehouse, letter: 'W', color: '#c98a3d' },
      { at: LANDMARKS.hospital, letter: '+', color: '#e5534b' },
      { at: LANDMARKS.policeHq, letter: 'P', color: '#1d4ed8' },
      { at: LANDMARKS.docks, letter: 'D', color: '#c65a3a' },
    ];
    for (const m of marks) {
      ctx.fillStyle = m.color;
      ctx.fillRect(m.at.x - 22, m.at.y - 22, 44, 44);
      ctx.fillStyle = '#ffffff';
      text(m.letter, m.at.x, m.at.y + 9, 26, '#ffffff', 'center', true);
    }
  }

  function drawCar(car, isPlayer, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const w = 46;
    const h = 22;
    if (car.wrecked) {
      ctx.fillStyle = '#555555';
      roundRect(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(80,80,80,0.5)';
      ctx.beginPath();
      ctx.arc(-w / 4, -h / 2, 8 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = car.kind === 'cop' ? '#111111' : '#1a1a1a';
      roundRect(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 8);
      ctx.fill();
      ctx.fillStyle = car.color;
      roundRect(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(180,220,255,0.85)';
      ctx.fillRect(2, -h / 2 + 3, 12, h - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 3, 6, h - 6);
      if (car.kind === 'cop') {
        // Black-and-white doors and a flashing light bar.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-8, -h / 2, 14, h);
        const flash = Math.floor(time * 4) % 2 === 0;
        ctx.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
        ctx.fillRect(-4, -h / 2 - 2, 8, 5);
        ctx.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
        ctx.fillRect(-4, h / 2 - 3, 8, 5);
      }
      if (isPlayer) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        roundRect(ctx, -w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 7);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPed(ped) {
    if (ped.mode === 'down') {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 12, 6, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.inCar !== null) return;
    // Blink while invulnerable after a hit.
    if (p.invuln > 0 && Math.floor(time * 10) % 2 === 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.arc(5, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, -2, 8, 4);
    ctx.restore();
  }

  function drawBeacon(state, time) {
    const target = state.missionTarget;
    if (!target && !state.job) return;
    const t = state.job && !state.missionTarget ? (state.job.stage === 'pickup' ? state.job.pickup : state.job.dropoff) : target;
    if (!t) return;
    const p = state.player;
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    // A guide line from the player to the marker, and the marker itself.
    ctx.strokeStyle = 'rgba(255,210,63,0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 16 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMinimap(state) {
    const mw = 220;
    const mh = 165;
    const mx = VIEW_W - mw - 16;
    const my = 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = 'rgba(10,10,16,0.78)';
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#2f5d33';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#2e86ab';
    ctx.fillRect(mx, my + BEACH_TOP * sy, mw, mh - BEACH_TOP * sy);
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = 2;
    for (const ax of AVENUES) {
      ctx.beginPath();
      ctx.moveTo(mx + ax * sx, my);
      ctx.lineTo(mx + ax * sx, my + BEACH_TOP * sy);
      ctx.stroke();
    }
    for (const sy2 of STREETS) {
      ctx.beginPath();
      ctx.moveTo(mx, my + sy2 * sy);
      ctx.lineTo(mx + mw, my + sy2 * sy);
      ctx.stroke();
    }
    // Landmarks, the mission marker, the cops, then the player on top.
    ctx.fillStyle = COLORS.safehouse;
    ctx.fillRect(mx + LANDMARKS.safehouse.x * sx - 3, my + LANDMARKS.safehouse.y * sy - 3, 6, 6);
    const target = state.missionTarget || (state.job ? (state.job.stage === 'pickup' ? state.job.pickup : state.job.dropoff) : null);
    if (target) {
      ctx.fillStyle = COLORS.marker;
      ctx.beginPath();
      ctx.arc(mx + target.x * sx, my + target.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.copCars) {
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(state, extra) {
    const p = state.player;
    // Top-left: cash and health.
    ctx.fillStyle = 'rgba(10,10,16,0.78)';
    roundRect(ctx, 12, 12, 210, 64, 8);
    ctx.fill();
    text(`$${state.cash}`, 26, 40, 26, '#ffffff', 'left', true);
    ctx.fillStyle = '#333333';
    ctx.fillRect(26, 50, 182, 12);
    ctx.fillStyle = p.health > 50 ? '#3ddc84' : p.health > 25 ? '#ffb020' : '#e5534b';
    ctx.fillRect(26, 50, Math.max(0, 182 * (p.health / 100)), 12);
    // Top-centre: wanted stars and the clock.
    const hours = Math.floor(state.clock / 60) % 24;
    const minutes = Math.floor(state.clock % 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    text(clock, VIEW_W / 2, 40, 24, '#ffffff', 'center', true);
    for (let i = 0; i < 5; i += 1) {
      const x = VIEW_W / 2 - 66 + i * 33;
      starPath(ctx, x, 62, 11);
      ctx.fillStyle = i < state.wanted ? '#ffd23f' : 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Objective bar, sized to its text.
    if (state.objective) {
      ctx.font = `16px ${FONT}`;
      const w = Math.min(VIEW_W - 260, ctx.measureText(state.objective).width + 28);
      ctx.fillStyle = 'rgba(10,10,16,0.78)';
      roundRect(ctx, 12, 88, w, 32, 8);
      ctx.fill();
      text(state.objective, 26, 110, 16, '#ffffff', 'left');
    }
    drawMinimap(state);
    // Speedometer and car health while driving.
    if (p.inCar !== null) {
      const car = state.cars.find((c) => c.id === p.inCar);
      const kmh = car ? Math.round(Math.abs(car.speed) * 0.36) : 0;
      ctx.fillStyle = 'rgba(10,10,16,0.78)';
      roundRect(ctx, VIEW_W - 196, VIEW_H - 84, 180, 68, 8);
      ctx.fill();
      text(`${kmh} km/h`, VIEW_W - 26, VIEW_H - 46, 28, '#ffffff', 'right', true);
      ctx.fillStyle = '#333333';
      ctx.fillRect(VIEW_W - 182, VIEW_H - 32, 152, 10);
      ctx.fillStyle = car && car.health > 50 ? '#3ddc84' : '#e5534b';
      ctx.fillRect(VIEW_W - 182, VIEW_H - 32, Math.max(0, 152 * ((car ? car.health : 0) / 100)), 10);
      text('CAR', VIEW_W - 182, VIEW_H - 46, 14, '#bbbbbb', 'left');
    }
    // Controls hint, bottom-left.
    text('WASD move/drive · E enter car · F punch · P pause · M mute', 16, VIEW_H - 16, 14, 'rgba(255,255,255,0.75)', 'left');
    if (extra && extra.muted) text('MUTED', VIEW_W - 16, VIEW_H - 16, 14, '#ffb020', 'right', true);
    // Mission banner, centre. Shrink the font until the line fits the screen.
    if (state.banner) {
      let size = 30;
      ctx.font = `700 ${size}px ${FONT}`;
      let w = ctx.measureText(state.banner.text).width + 40;
      while (w > VIEW_W - 60 && size > 15) {
        size -= 1;
        ctx.font = `700 ${size}px ${FONT}`;
        w = ctx.measureText(state.banner.text).width + 40;
      }
      ctx.fillStyle = 'rgba(10,10,16,0.82)';
      roundRect(ctx, (VIEW_W - w) / 2, 140, w, 52, 10);
      ctx.fill();
      text(state.banner.text, VIEW_W / 2, 176, size, '#ffd23f', 'center', true);
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const lineH = 30;
    const height = 150 + lines.length * lineH;
    const x = (VIEW_W - 620) / 2;
    const y = (VIEW_H - height) / 2;
    ctx.fillStyle = 'rgba(10,10,16,0.88)';
    roundRect(ctx, x, y, 620, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent || '#ffd23f';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, 620, height, 14);
    ctx.stroke();
    text(title, VIEW_W / 2, y + 72, 46, '#ffffff', 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW_W / 2, y + 116 + i * lineH, 19, '#cccccc', 'center');
    }
    text(prompt, VIEW_W / 2, y + height - 30, 20, '#ffd23f', 'center', true);
  }

  /** Paint one frame: the city, the actors, the HUD, then a panel for the screen. */
  function draw(state, screen, extra, time) {
    const cam = camera(state, screen, time || 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // World space: the camera moves the view, then everything draws in the
    // 1280x720 window on top of it.
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawGround(cam);
    if (screen === SCREEN_PLAY) drawBeacon(state, time || 0);
    for (const car of state.cars) {
      if (car.kind === 'player') continue;
      drawCar(car, false, time || 0);
    }
    const pc = state.player.inCar !== null ? state.cars.find((c) => c.id === state.player.inCar) : null;
    if (pc) drawCar(pc, true, time || 0);
    for (const ped of state.peds) drawPed(ped);
    for (const cop of state.footCops) {
      ctx.fillStyle = COLORS.cop;
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f2a6b';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawPlayer(state, time || 0);
    ctx.restore();
    if (screen === SCREEN_TITLE) {
      const lines = [
        'Meridian Bay is yours: steal cars, lose the cops, run the jobs.',
        'WASD move and drive · E enter a car · F punch · P pause · M mute',
        'Three missions, then courier jobs. Save with New Game / Continue.',
      ];
      const prompt = extra && extra.hasSave ? 'Enter — Continue · N — New Game' : 'Press Enter to start';
      drawPanel('MERIDIAN HEAT', lines, prompt, '#ff8c1a');
      return;
    }
    drawHud(state, extra);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Meridian Bay police caught up with you.', 'You paid a fine and walked out of Police HQ.'], 'Press Enter to continue');
    } else if (screen === SCREEN_DOWN) {
      drawPanel('YOU WENT DOWN', ['You woke up at the hospital, lighter in the pocket.', 'Take it slower next time.'], 'Press Enter to continue');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
