// Canvas 2D 도트 렌더링. 논리 해상도 640×360, CSS로 정수배 확대한다.
// 고깃집 식탁을 위에서 내려다본 모습: 1P는 왼쪽, 2P는 오른쪽에 마주 앉는다.
import { CONFIG, FOODS, STATS, STAT_LABEL, decayRate } from './config.js';
import { feverWarning, feverRemaining } from './game.js';
import { KEYMAP, keyLabel } from './input.js';
import { buildSprites } from './sprites.js';
import { DIFFICULTY, LEVELS } from './ai.js';
import { formatTime } from './ranking.js';

export const W = 640;
export const H = 360;

const FONT = 'Galmuri';
const C = {
  ink: '#1a100b',
  text: '#fff6e6',
  dim: '#c9b49a',
  p: ['#ff5a5a', '#4f95ff'],
  pDark: ['#7a1f1f', '#1d3f7a'],
  mat: ['rgba(140,30,30,0.35)', 'rgba(30,70,150,0.35)'],
  stat: { protein: '#f08aa0', carb: '#f4ead0', vitamin: '#7fd65a' },
  warn: '#ffcf3a',
  danger: '#ff3a3a',
  cooked: '#5dff6a',
  raw: '#ff6a4a',
  fever: '#ff7a1a',
  gold: '#ffd84a',
  panel: '#3a2618',
  panelEdge: '#1e130c',
};

// 공용 접시 4개 (밥 · 고기 · 버섯 · 상추), 식탁 위쪽 가운데
const PLATE_X = [212, 284, 356, 428];
const PLATE_Y = 82;
// 사각 불판과 그 위 8자리
const GRILL = { x: 180, y: 132, w: 280, h: 170 };
const SLOT_X = [215, 285, 355, 425];
const SLOT_Y = [176, 256];
// 자리 (1P 왼쪽, 2P 오른쪽)
const SEAT_X = [12, 472];
const SEAT_W = 156;

const MAX_PARTICLES = 80;
const MAX_FLOATERS = 24;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = buildSprites();
  const table = makeTable();
  let labels = ['나', 'CPU'];
  function setLabels(l) {
    labels = l;
  }

  const fx = {
    time: 0,
    particles: [],
    floaters: [],
    shakePlate: [0, 0, 0, 0],
    shakeSeat: [0, 0],
    flashSlot: Array(CONFIG.grillSlots).fill(0),
    feverFlash: 0,
    bite: [0, 0], // 앞접시 음식이 '쏙' 커지는 연출
  };

  // ---------- 효과 ----------
  function spawn(p) {
    if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
    fx.particles.push(p);
  }

  function floater(x, y, text, color, size = 12, life = 0.9) {
    if (fx.floaters.length >= MAX_FLOATERS) fx.floaters.shift();
    fx.floaters.push({ x, y, text, color, size, life });
  }

  function gaugeY(row) {
    return 44 + row * 44;
  }

  function slotCenter(i) {
    return [SLOT_X[i % 4], SLOT_Y[i < 4 ? 0 : 1]];
  }

  function burst(x, y, color, n = 8, speed = 60) {
    for (let k = 0; k < n; k++) {
      spawn({ x, y, vx: (Math.random() - 0.5) * speed, vy: -20 - Math.random() * speed * 0.7, life: 0.6, color, size: 2 });
    }
  }

  function consume(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'eat': {
          fx.bite[ev.player] = 0.25;
          const x = SEAT_X[ev.player] + SEAT_W - 20;
          STATS.forEach((s, row) => {
            if (ev.gains[s]) floater(x, gaugeY(row), `+${ev.gains[s]}`, C.stat[s]);
          });
          break;
        }
        case 'grillEat': {
          fx.flashSlot[ev.slot] = 0.25;
          const [x, y] = slotCenter(ev.slot);
          burst(x, y, C.p[ev.player], 6);
          if (ev.golden) {
            burst(x, y, C.gold, 16, 90);
            floater(x, y - 34, '황금 고기!', C.gold, 12, 1.3);
          }
          if (ev.perfect) floater(x, y - 20, 'PERFECT!', C.warn, 12, 1.0);
          else if (ev.stolen) floater(x, y - 20, '뺏었다!', C.p[ev.player]);
          break;
        }
        case 'chili': {
          fx.shakeSeat[ev.target] = 0.5;
          floater(SEAT_X[ev.target] + SEAT_W / 2, 176, '고추 공격!', C.danger, 24, 1.4);
          burst(PLATE_X[3], PLATE_Y, C.danger, 12, 80);
          break;
        }
        case 'special': {
          const golden = ev.kind === 'golden';
          burst(PLATE_X[ev.plate], PLATE_Y, golden ? C.gold : C.danger, 14, 80);
          floater(PLATE_X[ev.plate], PLATE_Y - 40, golden ? '황금 고기 등장!' : '청양고추 등장!', golden ? C.gold : C.danger, 12, 1.4);
          break;
        }
        case 'fail':
          if (ev.reason === 'spicy') fx.shakeSeat[ev.player] = 0.2;
          else if (ev.reason === 'empty' || ev.reason === 'full') {
            fx.shakePlate[ev.plate] = 0.25;
            floater(PLATE_X[ev.plate], PLATE_Y + 26, ev.player ? 'CPU 헛손질' : '헛손질!', C.p[ev.player], 12, 0.7);
          }
          break;
        case 'discard': {
          const [x, y] = slotCenter(ev.slot);
          for (let k = 0; k < 5; k++) spawn({ x, y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, life: 0.8, color: '#6a6a6a', size: 3 });
          break;
        }
        case 'feverStart':
          fx.feverFlash = 0.5;
          break;
      }
    }
  }

  function update(dt, g) {
    fx.time += dt;
    for (const arr of [fx.shakePlate, fx.shakeSeat, fx.flashSlot, fx.bite]) {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.max(0, arr[i] - dt);
    }
    fx.feverFlash = Math.max(0, fx.feverFlash - dt);
    for (const p of fx.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    fx.particles = fx.particles.filter((p) => p.life > 0);
    for (const f of fx.floaters) {
      f.y -= 18 * dt;
      f.life -= dt;
    }
    fx.floaters = fx.floaters.filter((f) => f.life > 0);

    if (!g) return;
    g.grill.forEach((it, i) => {
      const [x, y] = slotCenter(i);
      if (it && it.state === 'burnt' && Math.random() < dt * 6) {
        spawn({ x: x + (Math.random() - 0.5) * 16, y: y - 6, vx: (Math.random() - 0.5) * 8, vy: -16, life: 1.2, color: '#7a7470', size: 3 });
      }
      if (it && it.golden && it.state !== 'burnt' && Math.random() < dt * 4) {
        spawn({ x: x + (Math.random() - 0.5) * 24, y: y - 4 + (Math.random() - 0.5) * 16, vx: 0, vy: -10, life: 0.5, color: '#fff3a0', size: 1 });
      }
      if (g.fever.active && Math.random() < dt * 5) {
        spawn({ x: x + (Math.random() - 0.5) * 50, y: y + 30, vx: 0, vy: -40 - Math.random() * 30, life: 0.6, color: Math.random() < 0.5 ? '#ffb01a' : '#ff5a1a', size: 2 });
      }
    });
  }

  function reset() {
    fx.particles = [];
    fx.floaters = [];
  }

  // ---------- 그리기 도구 ----------
  function text(str, x, y, { size = 12, color = C.text, align = 'left', shadow = C.ink } = {}) {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  // 모서리가 깎인 도트 박스
  function box(x, y, w, h, fill = C.panel, edge = C.panelEdge) {
    rect(x + 1, y, w - 2, h, edge);
    rect(x, y + 1, w, h - 2, edge);
    rect(x + 2, y + 1, w - 4, h - 2, fill);
    rect(x + 1, y + 2, w - 2, h - 4, fill);
  }

  // 도트 원 (위에서 본 접시·그릇·컵)
  function disc(cx, cy, r, color, c2d = ctx) {
    c2d.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy));
      c2d.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1);
    }
  }

  function sprite(img, x, y, scale = 2) {
    ctx.drawImage(img, Math.round(x), Math.round(y), 16 * scale, 16 * scale);
  }

  function blink(rate = 4) {
    return Math.floor(fx.time * rate) % 2 === 0;
  }

  function shake(t) {
    return t > 0 ? Math.round(Math.sin(fx.time * 80) * 2) : 0;
  }

  function keyChip(x, y, code, pi) {
    rect(x - 7, y, 14, 14, C.ink);
    rect(x - 6, y + 1, 12, 12, C.p[pi]);
    text(keyLabel(code), x, y + 1, { align: 'center', color: '#fff', shadow: C.pDark[pi] });
  }

  // 식탁 상판 + 자리 매트 + 반찬 (한 번만 그려 둔다)
  function makeTable() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const t = c.getContext('2d');
    t.fillStyle = '#1e140d';
    t.fillRect(0, 0, W, H);
    t.fillStyle = '#3a2414';
    t.fillRect(2, 2, W - 4, H - 4);
    t.fillStyle = '#6b4428';
    t.fillRect(6, 6, W - 12, H - 12);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 6; y < H - 6; y += 22) {
      t.fillStyle = '#5a3820';
      t.fillRect(6, y, W - 12, 2);
      t.fillStyle = '#7a5030';
      t.fillRect(6, y + 2, W - 12, 1);
      for (let k = 0; k < 14; k++) {
        t.fillStyle = rnd() < 0.5 ? '#634026' : '#73492c';
        t.fillRect(6 + Math.floor(rnd() * (W - 40)), y + 5 + Math.floor(rnd() * 14), 6 + Math.floor(rnd() * 30), 1);
      }
    }
    [0, 1].forEach((pi) => {
      t.fillStyle = C.mat[pi];
      t.fillRect(SEAT_X[pi], 34, SEAT_W, 318);
      t.fillStyle = pi ? 'rgba(120,170,255,0.3)' : 'rgba(255,130,130,0.3)';
      t.fillRect(SEAT_X[pi], 34, SEAT_W, 2);
      t.fillRect(SEAT_X[pi], 350, SEAT_W, 2);
    });
    // 반찬 그릇 (김치 · 쌈장 · 마늘 · 파절이)
    const bowls = [
      [206, 12, '#d8452e', '#f08a5a'],
      [248, 9, '#8a4a20', '#b06a30'],
      [392, 9, '#f4efe2', '#d9d0b8'],
      [434, 12, '#5aa83a', '#8ad060'],
    ];
    for (const [x, r, a, b] of bowls) {
      const y = 330;
      disc(x, y, r + 1, C.ink, t);
      disc(x, y, r, '#d8d2c8', t);
      disc(x, y, r - 3, a, t);
      t.fillStyle = b;
      for (let k = 0; k < 6; k++) t.fillRect(x - r / 2 + ((k * 5) % (r + 2)), y - r / 2 + ((k * 7) % (r + 1)), 3, 2);
    }
    return c;
  }

  // ---------- 화면 요소 ----------
  function drawSeat(g, pi) {
    const x = SEAT_X[pi] + shake(fx.shakeSeat[pi]);
    const p = g.players[pi];
    const danger = STATS.some((s) => p.stats[s] <= 15);

    box(x + 4, 8, SEAT_W - 8, 22, danger && blink(6) ? '#b81f1f' : C.pDark[pi], C.ink);
    text(danger ? `${labels[pi]} 위험!` : labels[pi], x + SEAT_W / 2, 13, { align: 'center', color: danger ? '#fff' : C.p[pi] });

    const icons = { protein: sprites.meat.cooked, carb: sprites.rice, vitamin: sprites.lettuce };
    STATS.forEach((s, row) => {
      const y = gaugeY(row);
      const v = p.stats[s];
      sprite(icons[s], x + 6, y, 1);
      text(STAT_LABEL[s], x + 26, y + 2, { color: C.dim });
      text(String(Math.ceil(v)), x + SEAT_W - 8, y + 2, { align: 'right' });
      let col = C.stat[s];
      if (v <= 15) col = blink(6) ? C.danger : '#7a1a1a';
      else if (v <= 30) col = C.warn;
      const w = Math.round(((SEAT_W - 14) * v) / CONFIG.statMax);
      rect(x + 6, y + 18, SEAT_W - 12, 16, C.ink);
      rect(x + 7, y + 19, w, 14, col);
      rect(x + 7, y + 19, w, 3, 'rgba(255,255,255,0.35)');
    });

    // 앞접시 · 수저 · 물컵
    const cx = x + SEAT_W / 2;
    const cy = 232;
    disc(cx, cy, 31, C.ink);
    disc(cx, cy, 30, '#d4d8e0');
    disc(cx, cy, 25, '#eef1f5');
    if (p.lastFood) {
      const { food, golden } = p.lastFood;
      const img = golden ? sprites.golden.cooked : FOODS[food].grill ? sprites[FOODS[food].id].cooked : sprites.plateFood[food];
      const scale = fx.bite[pi] > 0 ? 3 : 2;
      sprite(img, cx - 8 * scale, cy - 8 * scale, scale);
    }
    const hx = pi === 0 ? x + 10 : x + SEAT_W - 16;
    rect(hx, cy - 30, 2, 60, '#c8a060');
    rect(hx + 4, cy - 30, 2, 60, '#c8a060');
    const spx = pi === 0 ? x + SEAT_W - 16 : x + 12;
    disc(spx + 2, cy - 22, 5, '#b8bcc4');
    rect(spx + 1, cy - 18, 3, 46, '#b8bcc4');
    disc(cx, 306, 15, C.ink);
    disc(cx, 306, 14, '#cfe8f4');
    disc(cx, 306, 10, '#9fd0ec');
    rect(cx - 6, 300, 4, 2, '#ffffff');

    if (p.spicy > 0) {
      ctx.fillStyle = `rgba(255,40,20,${0.25 + 0.15 * Math.sin(fx.time * 14)})`;
      ctx.fillRect(SEAT_X[pi], 34, SEAT_W, 318);
      sprite(sprites.chili, cx - 24, cy - 24, 3);
      text(`매워! ${p.spicy.toFixed(1)}`, cx, cy + 34, { size: 24, align: 'center', color: '#fff', shadow: '#7a0a0a' });
    }
    if (p.lock > 0) text('헛손질!', cx, 186, { align: 'center', color: C.warn });
  }

  function drawTop(g) {
    box(272, 6, 96, 28, '#2a1b11', C.ink);
    text(formatTime(g.t), 320, 8, { size: 24, align: 'center' });
    text(`배고픔 ${decayRate(g.t).toFixed(1)}/초`, 320, 342, { align: 'center', color: g.t > CONFIG.rampStart ? C.danger : C.dim });
  }

  function drawFeverBanner(g) {
    const y = 306;
    if (g.fever.active) {
      const rem = feverRemaining(g);
      box(196, y, 248, 24, blink(8) ? '#b8360f' : '#d9581a', C.ink);
      text(`FEVER TIME! 굽기 x${CONFIG.fever.cookMul}`, 320, y + 5, { align: 'center', color: '#fff3c0' });
      rect(204, y + 20, 232, 2, '#5a1a08');
      rect(204, y + 20, Math.round((232 * rem) / CONFIG.fever.duration), 2, '#ffe14a');
    } else if (feverWarning(g)) {
      const n = Math.ceil(g.fever.start - g.t);
      if (blink(6)) {
        box(206, y, 228, 24, '#5a2a0a', C.ink);
        text(`피버 타임 ${n}초 전! 불판을 채워라`, 320, y + 5, { align: 'center', color: C.fever });
      }
    }
  }

  function drawPlates(g) {
    FOODS.forEach((food, i) => {
      const cx = PLATE_X[i] + shake(fx.shakePlate[i]);
      const cy = PLATE_Y;
      const pl = g.plates[i];
      text(food.name, cx, 40, { align: 'center', color: food.grill ? C.raw : C.cooked });
      disc(cx, cy, 27, C.ink);
      disc(cx, cy, 26, '#c9ced8');
      disc(cx, cy, 22, '#eef1f5');
      disc(cx, cy, 15, '#e2e6ec');
      const spr = sprites.plateFood[i];
      const offs = [[0, -10], [-9, 2], [9, 2]];
      for (let k = Math.min(pl.stock, 3) - 1; k >= 0; k--) sprite(spr, cx - 16 + offs[k][0], cy - 14 + offs[k][1]);
      if (pl.special) {
        sprite(pl.special === 'golden' ? sprites.golden.raw : sprites.chili, cx - 16, cy - 18);
        if (blink(5)) rect(cx + 10, cy - 20, 2, 2, '#fff');
      }
      if (pl.stock === 0 && !pl.special) text('비었음', cx, cy - 6, { align: 'center', color: '#8a8070', shadow: null });
      if (pl.stock < CONFIG.plateMax) {
        rect(cx - 18, cy + 29, 36, 3, C.ink);
        rect(cx - 18, cy + 29, Math.round((36 * pl.timer) / food.refill), 3, g.fever.active ? C.fever : '#9ad0ff');
      }
      keyChip(cx, cy + 34, KEYMAP[0].foods[i], 0);
    });
  }

  // 사각 불판: 철판 테두리 + 석쇠 틈으로 숯불이 보인다
  const embers = (() => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 70 }, () => ({
      x: GRILL.x + 10 + Math.floor(rnd() * (GRILL.w - 24)),
      y: GRILL.y + 10 + Math.floor(rnd() * (GRILL.h - 24)),
      w: 4 + Math.floor(rnd() * 5),
      h: 3 + Math.floor(rnd() * 3),
      ph: rnd() * 6.28,
    }));
  })();

  function drawGrill(g) {
    const fever = g.fever.active;
    const G = GRILL;
    // 손잡이
    for (const hx of [G.x - 12, G.x + G.w - 2]) {
      rect(hx, G.y + G.h / 2 - 8, 14, 16, C.ink);
      rect(hx + 2, G.y + G.h / 2 - 6, 10, 12, '#4a4a54');
    }
    // 철판 테두리
    rect(G.x - 2, G.y - 2, G.w + 4, G.h + 4, C.ink);
    rect(G.x, G.y, G.w, G.h, fever ? '#7a4a3a' : '#5c5c68');
    rect(G.x, G.y, G.w, 2, '#8a8a96');
    rect(G.x + 6, G.y + 6, G.w - 12, G.h - 12, '#121216');
    for (const e of embers) {
      const fl = Math.sin(fx.time * (fever ? 12 : 4) + e.ph);
      let col = fl > 0.5 ? '#ff7a1a' : fl > -0.2 ? '#b83a10' : '#5a1a0a';
      if (fever) col = fl > 0.3 ? '#ffd23a' : '#ff6a1a';
      rect(e.x, e.y, e.w, e.h, col);
    }
    for (let y = G.y + 9; y < G.y + G.h - 6; y += 8) {
      rect(G.x + 6, y, G.w - 12, 2, '#4c4c58');
      rect(G.x + 6, y, G.w - 12, 1, '#6a6a78');
    }

    g.grill.forEach((it, i) => {
      const [cx, cy] = slotCenter(i);
      if (fx.flashSlot[i] > 0) rect(cx - 28, cy - 30, 56, 52, 'rgba(255,255,255,0.4)');
      if (!it) return;
      const set = it.golden ? sprites.golden : sprites[FOODS[it.food].id];

      if (it.state === 'cooked') {
        // 퍼펙트 구간은 노랑·흰색으로 빠르게, 곧 탈 때는 초록이 빠르게 깜빡임
        const perfect = it.cookedFor <= CONFIG.perfectWindow;
        const edge = perfect ? (blink(12) ? C.warn : '#fff') : blink(it.cookedFor > CONFIG.burnAfter - 1.5 ? 10 : 3) ? C.cooked : '#1f8a2a';
        const L = 8;
        const [x0, y0, x1, y1] = [cx - 28, cy - 30, cx + 26, cy + 20];
        for (const [ax, ay, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
          rect(sx > 0 ? ax : ax - L + 2, ay, L, 2, edge);
          rect(ax, sy > 0 ? ay : ay - L + 2, 2, L, edge);
        }
      }
      if (it.golden && it.state !== 'burnt') disc(cx, cy - 8, 18, 'rgba(255,216,74,0.25)');

      if (it.state === 'burnt') ctx.globalAlpha = Math.max(0.2, 1 - (it.burntFor || 0) / CONFIG.burntClear);
      const sizzle = it.state !== 'burnt' ? Math.round(Math.sin(fx.time * 20 + i) * 0.6) : 0;
      sprite(set[it.state], cx - 16, cy - 24 + sizzle);
      ctx.globalAlpha = 1;
      rect(cx - 24, cy - 26, 6, 6, C.ink);
      rect(cx - 23, cy - 25, 4, 4, C.p[it.owner]);
      if (it.state === 'raw') {
        rect(cx - 24, cy + 10, 48, 6, C.ink);
        rect(cx - 23, cy + 11, Math.round((46 * it.progress) / it.cookTime), 4, C.raw);
      } else if (it.state === 'cooked') {
        rect(cx - 24, cy + 10, 48, 6, C.ink);
        rect(cx - 23, cy + 11, Math.round(46 * (1 - it.cookedFor / CONFIG.burnAfter)), 4, C.cooked);
      } else {
        text('탐!', cx, cy + 6, { align: 'center', color: '#bbb' });
      }
    });
  }

  function drawEffects() {
    for (const p of fx.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      rect(p.x, p.y, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;
    for (const f of fx.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      text(f.text, f.x, f.y, { color: f.color, size: f.size, align: 'center' });
    }
    ctx.globalAlpha = 1;
  }

  function drawGame(g) {
    ctx.drawImage(table, 0, 0);
    if (g.fever.active) {
      ctx.fillStyle = `rgba(255,60,0,${0.12 + 0.08 * Math.sin(fx.time * 8)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawSeat(g, 0);
    drawSeat(g, 1);
    drawPlates(g);
    drawGrill(g);
    drawTop(g);
    drawFeverBanner(g);
    drawEffects();
    if (fx.feverFlash > 0) {
      ctx.fillStyle = `rgba(255,220,120,${fx.feverFlash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function dim(alpha = 0.6) {
    ctx.fillStyle = `rgba(10,6,4,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- 화면별 ----------
  function drawTitle(ranking, level) {
    ctx.drawImage(table, 0, 0);
    dim(0.35);
    const deco = [sprites.meat.cooked, sprites.mushroom.cooked, sprites.rice, sprites.golden.cooked, sprites.lettuce, sprites.chili];
    deco.forEach((img, k) => sprite(img, 40 + k * 104, 10 + Math.round(Math.sin(fx.time * 2 + k) * 3), 2));
    text('불판 대첩', 320, 40, { size: 48, align: 'center', color: '#ffb03a', shadow: '#5a1a08' });
    text('고깃집 먹기 대결 vs CPU', 320, 92, { align: 'center', color: C.text });

    box(150, 110, 340, 138, '#2a1b11', C.ink);
    const rules = [
      ['단백질·탄수화물·비타민 중 하나라도 0이 되면 패배!', C.text],
      ['밥·상추 키는 바로 먹기', C.text],
      ['고기·버섯 키는 굽기 → 익으면 같은 키로 먹기', C.text],
      [`익자마자 먹으면 PERFECT! 영양 x${CONFIG.perfectMul}`, C.warn],
      [`황금 고기: 모든 수치 +${CONFIG.golden.gain}, 먼저 먹는 사람이 임자`, C.gold],
      [`청양고추: 먹으면 상대가 ${CONFIG.chili.stun}초 동안 못 먹는다`, C.danger],
      ['빈 접시를 누르면 헛손질 (잠깐 멈춤)', C.dim],
      [`피버 타임: ${CONFIG.fever.duration}초 동안 굽기 x${CONFIG.fever.cookMul}`, C.fever],
    ];
    rules.forEach(([r, col], i) => text(r, 320, 116 + i * 16, { align: 'center', color: col }));

    // 조작
    box(10, 110, 136, 138, C.pDark[0], C.ink);
    text('조작', 78, 116, { size: 24, align: 'center', color: C.p[0] });
    KEYMAP[0].foods.forEach((code, i) => {
      const y = 148 + i * 24;
      keyChip(44, y, code, 0);
      sprite(sprites.plateFood[i], 60, y - 1, 1);
      text(FOODS[i].name, 80, y + 1);
    });

    // 난이도
    box(494, 110, 136, 138, '#2a1b11', C.ink);
    text('상대 CPU', 562, 116, { align: 'center', color: C.p[1] });
    LEVELS.forEach((lv, i) => {
      const y = 140 + i * 28;
      const on = lv === level;
      box(506, y, 112, 24, on ? C.pDark[1] : '#3a2a20', on ? '#fff' : C.ink);
      text(`${i + 1}  ${DIFFICULTY[lv].label}`, 562, y + 6, { align: 'center', color: on ? '#fff' : C.dim });
    });
    text('← → 또는 1·2·3', 562, 228, { align: 'center', color: C.dim });

    box(170, 256, 300, 76, '#2a1b11', C.ink);
    text(`최단 승리 TOP 5 · ${DIFFICULTY[level].label}`, 320, 260, { align: 'center', color: C.warn });
    if (!ranking.length) text('아직 이긴 사람이 없어요', 320, 288, { align: 'center', color: C.dim });
    ranking.forEach((r, i) => {
      const y = 276 + i * 11;
      text(`${i + 1}. ${r.name}`, 230, y, { color: i === 0 ? C.warn : C.text });
      text(formatTime(r.time), 410, y, { align: 'right', color: i === 0 ? C.warn : C.text });
    });

    if (blink(2)) text('SPACE 를 눌러 시작', 320, 338, { align: 'center', color: '#fff' });
    text('T: 키 테스트', 630, 344, { align: 'right', color: C.dim });
  }

  function drawCountdown(g, n) {
    drawGame(g);
    dim(0.45);
    text(n > 0 ? String(n) : '먹어라!', 320, 140, { size: 48, align: 'center', color: '#ffb03a', shadow: '#5a1a08' });
  }

  function drawPause(g) {
    drawGame(g);
    dim(0.7);
    text('일시정지', 320, 130, { size: 36, align: 'center' });
    text('ESC 계속하기   ·   BACKSPACE 처음으로', 320, 186, { align: 'center', color: C.dim });
  }

  function drawResult(g, ui) {
    drawGame(g);
    dim(0.72);
    const o = g.over;
    box(120, 24, 400, 312, '#2a1b11', C.ink);
    const title = o.winner === -1 ? ['무승부!', C.warn] : o.winner === 0 ? ['승리!', C.gold] : ['패배...', C.p[1]];
    text(title[0], 320, 30, { size: 36, align: 'center', color: title[1], shadow: C.ink });
    o.cause.forEach((s, pi) => {
      if (s) text(`${labels[pi]}: ${STAT_LABEL[s]} 부족으로 쓰러짐`, 320, 76 + (o.winner === -1 ? pi * 14 : 0), { align: 'center', color: C.dim });
    });
    text(`대결 시간 ${formatTime(o.time)}`, 320, 104, { size: 24, align: 'center' });

    [0, 1].forEach((pi) => {
      const p = g.players[pi];
      const x = pi === 0 ? 140 : 336;
      text(labels[pi], x + 82, 136, { align: 'center', color: C.p[pi] });
      FOODS.forEach((f, i) => {
        sprite(sprites.plateFood[i], x, 152 + i * 18, 1);
        text(`${f.name} ${p.eaten[f.id]}`, x + 20, 154 + i * 18);
      });
      const extra = [
        [`PERFECT ${p.perfect}`, C.warn],
        [`황금 고기 ${p.golden}`, C.gold],
        [`고추 공격 ${p.chili}`, C.danger],
        [`뺏어먹기 ${p.stolen}`, C.text],
      ];
      extra.forEach(([t, col], i) => text(t, x + 86, 154 + i * 18, { color: col }));
    });

    if (ui.entering) {
      box(170, 236, 300, 64, C.pDark[0], C.ink);
      text('최단 승리 TOP 5 진입! 이름 (영문·숫자 3자)', 320, 240, { align: 'center', color: C.warn });
      const slots = [0, 1, 2].map((k) => ui.name[k] || (k === ui.name.length && blink(3) ? '_' : ' '));
      text(slots.join(' '), 320, 255, { size: 24, align: 'center' });
      text('ENTER 저장  ESC 건너뛰기', 320, 284, { align: 'center', color: C.dim });
    } else if (ui.ready) {
      if (ui.rank) text(`${ui.rank}위로 기록되었습니다!`, 320, 250, { align: 'center', color: C.warn });
      if (blink(2)) text('SPACE 다시 하기', 320, 276, { align: 'center' });
      text('ESC 타이틀로', 320, 296, { align: 'center', color: C.dim });
    }
  }

  function drawKeyTest(held) {
    ctx.drawImage(table, 0, 0);
    dim(0.5);
    text('키 테스트', 320, 16, { size: 24, align: 'center' });
    text('네 키를 한꺼번에 꾹 눌러 보세요. 누른 키가 안 켜지면 고스팅이 있는 키보드예요.', 320, 50, { align: 'center', color: C.dim });
    const row = KEYMAP[0].foods;
    let count = 0;
    row.forEach((code, i) => {
      const x = 254 + i * 34;
      const y = 110;
      const pi = KEYMAP.findIndex((m) => m.foods.includes(code));
      const lit = held.has(code);
      rect(x, y, 28, 26, C.ink);
      if (pi < 0) {
        rect(x + 1, y + 1, 26, 24, '#3a3030');
        text(keyLabel(code), x + 14, y + 6, { align: 'center', color: '#6a5a50', shadow: null });
        return;
      }
      if (lit) count++;
      rect(x + 1, y + 1, 26, 24, lit ? C.p[pi] : '#e9dcc6');
      rect(x + 1, y + 20, 26, 5, lit ? C.pDark[pi] : '#b8a68a');
      text(keyLabel(code), x + 14, y + 6, { align: 'center', color: lit ? '#fff' : C.ink, shadow: null });
      sprite(sprites.plateFood[KEYMAP[pi].foods.indexOf(code)], x + 6, y + 30, 1);
    });
    text(`동시에 인식된 게임 키: ${count}개`, 320, 196, { size: 24, align: 'center', color: count >= 4 ? C.cooked : C.text });
    text('ESC 돌아가기', 320, 330, { align: 'center', color: C.dim });
  }

  return { ctx, sprites, fx, setLabels, consume, update, reset, drawTitle, drawCountdown, drawGame, drawPause, drawResult, drawKeyTest };
}
