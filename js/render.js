// Canvas 2D 도트 렌더링. 논리 해상도 640×360, CSS로 정수배 확대한다.
import { CONFIG, FOODS, STATS, STAT_LABEL, TONG_FOODS, decayRate } from './config.js';
import { feverWarning, feverRemaining } from './game.js';
import { KEYMAP, keyLabel } from './input.js';
import { buildSprites } from './sprites.js';
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
  stat: { protein: '#f08aa0', carb: '#f4ead0', vitamin: '#7fd65a' },
  warn: '#ffcf3a',
  danger: '#ff3a3a',
  cooked: '#5dff6a',
  raw: '#ff6a4a',
  fever: '#ff7a1a',
  panel: '#3a2618',
  panelEdge: '#1e130c',
};

const PLATE_X = 176; // 접시·불판 첫 칸의 x
const CELL = 72;
const PLATE_Y = 52;
// 불판 위 8자리의 중심 (윗줄 4 + 아랫줄 4)
const SLOT_X = [212, 284, 356, 428];
const SLOT_Y = [210, 286];
const SIDE_X = [8, 488];

const MAX_PARTICLES = 80;
const MAX_FLOATERS = 24;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = buildSprites();
  const table = makeTable();

  const fx = {
    time: 0,
    particles: [],
    floaters: [],
    shakePlate: [0, 0, 0, 0],
    shakeTong: [0, 0, 0, 0], // 1P 고기·버섯, 2P 고기·버섯
    flashSlot: Array(CONFIG.grillSlots).fill(0),
    feverFlash: 0,
  };

  // ---------- 효과 ----------
  function spawn(p) {
    if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
    fx.particles.push(p);
  }

  function floater(pi, stat, text, color) {
    if (fx.floaters.length >= MAX_FLOATERS) fx.floaters.shift();
    const row = STATS.indexOf(stat);
    fx.floaters.push({ x: SIDE_X[pi] + 118, y: 40 + row * 50, text, color, life: 0.9 });
  }

  function slotCenter(i) {
    return [SLOT_X[i % 4], SLOT_Y[i < 4 ? 0 : 1]];
  }

  function consume(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'eat':
          for (const [s, v] of Object.entries(ev.gains)) floater(ev.player, s, `+${v}`, C.stat[s]);
          break;
        case 'grillEat': {
          fx.flashSlot[ev.slot] = 0.25;
          const [x, y] = slotCenter(ev.slot);
          for (let k = 0; k < 6; k++) spawn({ x, y, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, life: 0.5, color: C.p[ev.player], size: 2 });
          break;
        }
        case 'fail':
          if (ev.tongs !== undefined) fx.shakeTong[ev.player * 2 + TONG_FOODS.indexOf(ev.tongs)] = 0.25;
          else fx.shakePlate[ev.plate] = 0.25;
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
    for (const arr of [fx.shakePlate, fx.shakeTong, fx.flashSlot]) {
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
    // 탄 음식 연기, 피버 불똥
    g.grill.forEach((it, i) => {
      const [x, y] = slotCenter(i);
      if (it && it.state === 'burnt' && Math.random() < dt * 6) {
        spawn({ x: x + (Math.random() - 0.5) * 16, y: y - 6, vx: (Math.random() - 0.5) * 8, vy: -16, life: 1.2, color: '#7a7470', size: 3 });
      }
      if (g.fever.active && Math.random() < dt * 5) {
        spawn({ x: x + (Math.random() - 0.5) * 50, y: y + 28, vx: 0, vy: -40 - Math.random() * 30, life: 0.6, color: Math.random() < 0.5 ? '#ffb01a' : '#ff5a1a', size: 2 });
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

  function sprite(img, x, y, scale = 2) {
    ctx.drawImage(img, Math.round(x), Math.round(y), 16 * scale, 16 * scale);
  }

  function blink(rate = 4) {
    return Math.floor(fx.time * rate) % 2 === 0;
  }

  function makeTable() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const t = c.getContext('2d');
    t.fillStyle = '#6b4428';
    t.fillRect(0, 0, W, H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < H; y += 20) {
      t.fillStyle = '#5a3820';
      t.fillRect(0, y, W, 2);
      t.fillStyle = '#7a5030';
      t.fillRect(0, y + 2, W, 1);
      for (let k = 0; k < 14; k++) {
        t.fillStyle = rnd() < 0.5 ? '#634026' : '#73492c';
        t.fillRect(Math.floor(rnd() * W), y + 5 + Math.floor(rnd() * 12), 6 + Math.floor(rnd() * 30), 1);
      }
    }
    return c;
  }

  // ---------- 화면 요소 ----------
  function drawSide(g, pi) {
    const x = SIDE_X[pi];
    const p = g.players[pi];
    box(x, 6, 144, 348);
    // 이름 (수치가 위험하면 깜빡임)
    const danger = STATS.some((s) => p.stats[s] <= 15);
    box(x + 4, 10, 136, 22, danger && blink(6) ? '#b81f1f' : C.pDark[pi], C.ink);
    text(danger ? `${pi + 1}P 위험!` : `${pi + 1}P`, x + 72, 15, { align: 'center', color: danger ? '#fff' : C.p[pi] });

    const icons = { protein: sprites.meat.cooked, carb: sprites.rice, vitamin: sprites.lettuce };
    STATS.forEach((s, row) => {
      const y = 42 + row * 50;
      const v = p.stats[s];
      sprite(icons[s], x + 6, y, 1);
      text(STAT_LABEL[s], x + 26, y + 2, { color: C.dim });
      text(String(Math.ceil(v)), x + 138, y + 2, { align: 'right' });
      let col = C.stat[s];
      if (v <= 15) col = blink(6) ? C.danger : '#7a1a1a';
      else if (v <= 30) col = C.warn;
      const w = Math.round((130 * v) / CONFIG.statMax);
      rect(x + 6, y + 18, 132, 16, C.ink);
      rect(x + 7, y + 19, w, 14, col);
      rect(x + 7, y + 19, w, 3, 'rgba(255,255,255,0.35)');
    });

    // 키 안내
    const m = KEYMAP[pi];
    const gy = 188;
    box(x + 4, gy, 136, 162, '#2a1b11', C.ink);
    text('접시', x + 10, gy + 6, { color: C.dim });
    m.plates.forEach((code, i) => {
      const kx = x + 12 + i * 31;
      sprite(sprites.plateFood[i], kx + 4, gy + 24, 1);
      keyCap(kx, gy + 42, keyLabel(code), pi);
    });
    text('집게 (익은 것 먹기)', x + 10, gy + 74, { color: C.dim });
    m.tongs.forEach((code, k) => {
      const shake = fx.shakeTong[pi * 2 + k] > 0 ? Math.round(Math.sin(fx.time * 80) * 2) : 0;
      const kx = x + 24 + k * 64 + shake;
      sprite(sprites[FOODS[TONG_FOODS[k]].id].cooked, kx, gy + 90);
      keyCap(kx + 4, gy + 126, keyLabel(code), pi);
    });
  }

  function keyCap(x, y, label, pi, lit = false) {
    rect(x, y, 24, 20, C.ink);
    rect(x + 1, y + 1, 22, 18, lit ? C.p[pi] : '#e9dcc6');
    rect(x + 1, y + 15, 22, 4, lit ? C.pDark[pi] : '#b8a68a');
    text(label, x + 12, y + 3, { align: 'center', color: lit ? '#fff' : C.ink, shadow: null });
  }

  function drawTop(g) {
    box(256, 4, 128, 30, '#2a1b11', C.ink);
    text(formatTime(g.t), 320, 7, { size: 24, align: 'center' });
    text(`배고픔 속도 ${decayRate(g.t).toFixed(1)}/초`, 320, 37, { align: 'center', color: g.t > CONFIG.rampStart ? C.danger : C.dim });
  }

  function drawFeverBanner(g) {
    if (g.fever.active) {
      const rem = feverRemaining(g);
      const y = 132;
      box(196, y, 248, 24, blink(8) ? '#b8360f' : '#d9581a', C.ink);
      text(`FEVER TIME! 굽기 x${CONFIG.fever.cookMul}`, 320, y + 5, { align: 'center', color: '#fff3c0' });
      rect(204, y + 20, 232, 2, '#5a1a08');
      rect(204, y + 20, Math.round((232 * rem) / CONFIG.fever.duration), 2, '#ffe14a');
    } else if (feverWarning(g)) {
      const n = Math.ceil(g.fever.start - g.t);
      if (blink(6)) {
        box(206, 132, 228, 24, '#5a2a0a', C.ink);
        text(`피버 타임 ${n}초 전! 불판을 채워라`, 320, 137, { align: 'center', color: C.fever });
      }
    }
  }

  function drawPlates(g) {
    FOODS.forEach((food, i) => {
      const sx = fx.shakePlate[i] > 0 ? Math.round(Math.sin(fx.time * 80) * 2) : 0;
      const cx = PLATE_X + i * CELL + 36 + sx;
      const pl = g.plates[i];
      // 접시
      rect(cx - 30, PLATE_Y + 38, 60, 14, C.ink);
      rect(cx - 28, PLATE_Y + 36, 56, 16, C.ink);
      rect(cx - 28, PLATE_Y + 38, 56, 12, '#e6e9ee');
      rect(cx - 26, PLATE_Y + 37, 52, 14, '#e6e9ee');
      rect(cx - 20, PLATE_Y + 40, 40, 8, '#c8ced8');
      // 쌓인 음식
      const spr = sprites.plateFood[i];
      const offs = [[0, 0], [-10, 4], [10, 4]];
      for (let k = Math.min(pl.stock, 3) - 1; k >= 0; k--) sprite(spr, cx - 16 + offs[k][0], PLATE_Y + 12 + offs[k][1]);
      if (pl.stock === 0) text('비었음', cx, PLATE_Y + 26, { align: 'center', color: C.dim });
      // 이름·재고·보충
      text(food.name, cx, PLATE_Y - 2, { align: 'center', color: food.grill ? C.raw : C.cooked });
      if (pl.stock < CONFIG.plateMax) {
        rect(cx - 20, PLATE_Y + 54, 40, 3, C.ink);
        rect(cx - 20, PLATE_Y + 54, Math.round((40 * pl.timer) / food.refill), 3, g.fever.active ? C.fever : '#9ad0ff');
      }
      // 키 안내
      text(keyLabel(KEYMAP[0].plates[i]), cx - 12, PLATE_Y + 60, { align: 'center', color: C.p[0] });
      text('·', cx, PLATE_Y + 60, { align: 'center', color: C.dim });
      text(keyLabel(KEYMAP[1].plates[i]), cx + 12, PLATE_Y + 60, { align: 'center', color: C.p[1] });
    });
  }

  // 하나로 이어진 큰 불판
  const GRILL = { x: 172, y: 162, w: 296, h: 166 };
  const embers = (() => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 70 }, () => ({
      x: GRILL.x + 2 + Math.floor(rnd() * (GRILL.w - 10)),
      y: GRILL.y + 4 + Math.floor(rnd() * (GRILL.h - 10)),
      w: 4 + Math.floor(rnd() * 5),
      h: 3 + Math.floor(rnd() * 3),
      ph: rnd() * 6.28,
    }));
  })();

  function drawGrill(g) {
    const fever = g.fever.active;
    const G = GRILL;
    box(G.x - 6, G.y - 6, G.w + 12, G.h + 30, fever ? '#3a1408' : '#24180f', C.ink);
    rect(G.x, G.y, G.w, G.h, '#141418');
    // 숯불
    for (const e of embers) {
      const fl = Math.sin(fx.time * (fever ? 12 : 4) + e.ph);
      let col = fl > 0.5 ? '#ff7a1a' : fl > -0.2 ? '#b83a10' : '#5a1a0a';
      if (fever) col = fl > 0.3 ? '#ffd23a' : '#ff6a1a';
      rect(e.x, e.y, e.w, e.h, col);
    }
    // 석쇠: 가로 살이 끝까지 이어진다
    for (let y = G.y + 3; y < G.y + G.h; y += 8) {
      rect(G.x, y, G.w, 2, '#4c4c58');
      rect(G.x, y, G.w, 1, '#6a6a78');
    }
    rect(G.x, G.y, 2, G.h, '#6a6a78');
    rect(G.x + G.w - 2, G.y, 2, G.h, '#6a6a78');

    g.grill.forEach((it, i) => {
      const [cx, cy] = slotCenter(i);
      if (fx.flashSlot[i] > 0) rect(cx - 28, cy - 30, 56, 52, 'rgba(255,255,255,0.4)');
      if (!it) return;
      const food = FOODS[it.food];

      if (it.state === 'cooked') {
        // 익음: 초록 모서리 표시, 곧 탈 때는 빠르게 깜빡임
        const edge = blink(it.cookedFor > CONFIG.burnAfter - 1.5 ? 10 : 3) ? C.cooked : '#1f8a2a';
        const L = 8;
        const [x0, y0, x1, y1] = [cx - 28, cy - 30, cx + 26, cy + 20];
        for (const [ax, ay, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
          rect(sx > 0 ? ax : ax - L + 2, ay, L, 2, edge);
          rect(ax, sy > 0 ? ay : ay - L + 2, 2, L, edge);
        }
      }

      if (it.state === 'burnt') ctx.globalAlpha = Math.max(0.2, 1 - it.burntFor / CONFIG.burntClear);
      const sizzle = it.state !== 'burnt' ? Math.round(Math.sin(fx.time * 20 + i) * 0.6) : 0;
      sprite(sprites[food.id][it.state], cx - 16, cy - 24 + sizzle);
      ctx.globalAlpha = 1;
      // 올린 사람 표시
      rect(cx - 24, cy - 26, 6, 6, C.ink);
      rect(cx - 23, cy - 25, 4, 4, C.p[it.owner]);
      // 진행 바
      if (it.state === 'raw') {
        rect(cx - 24, cy + 10, 48, 6, C.ink);
        rect(cx - 23, cy + 11, Math.round((46 * it.progress) / food.cookTime), 4, C.raw);
      } else if (it.state === 'cooked') {
        rect(cx - 24, cy + 10, 48, 6, C.ink);
        rect(cx - 23, cy + 11, Math.round(46 * (1 - it.cookedFor / CONFIG.burnAfter)), 4, C.cooked);
      } else {
        text('탐!', cx, cy + 6, { align: 'center', color: '#bbb' });
      }
    });

    // 집게 키 안내
    const hy = G.y + G.h + 6;
    text(`1P  ${keyLabel(KEYMAP[0].tongs[0])}고기 ${keyLabel(KEYMAP[0].tongs[1])}버섯`, G.x + 4, hy, { color: C.p[0] });
    text('집게', G.x + G.w / 2, hy, { align: 'center', color: C.dim });
    text(`${keyLabel(KEYMAP[1].tongs[0])}고기 ${keyLabel(KEYMAP[1].tongs[1])}버섯  2P`, G.x + G.w - 4, hy, { color: C.p[1], align: 'right' });
  }

  function drawEffects() {
    for (const p of fx.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      rect(p.x, p.y, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;
    for (const f of fx.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      text(f.text, f.x, f.y, { color: f.color, align: 'right' });
    }
    ctx.globalAlpha = 1;
  }

  function drawGame(g) {
    ctx.drawImage(table, 0, 0);
    if (g.fever.active) {
      ctx.fillStyle = `rgba(255,60,0,${0.12 + 0.08 * Math.sin(fx.time * 8)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawSide(g, 0);
    drawSide(g, 1);
    drawTop(g);
    drawPlates(g);
    drawGrill(g);
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
  function drawTitle(ranking) {
    ctx.drawImage(table, 0, 0);
    // 장식: 불판 위 고기
    for (let k = 0; k < 6; k++) {
      const img = [sprites.meat.cooked, sprites.mushroom.cooked, sprites.rice, sprites.lettuce, sprites.meat.raw, sprites.mushroom.raw][k];
      sprite(img, 40 + k * 104, 14 + Math.round(Math.sin(fx.time * 2 + k) * 3), 2);
    }
    text('불판 대첩', 320, 52, { size: 48, align: 'center', color: '#ffb03a', shadow: '#5a1a08' });
    text('2인 먹기 대전', 320, 106, { align: 'center', color: C.text });

    box(150, 128, 340, 112, '#2a1b11', C.ink);
    const rules = [
      ['단백질·탄수화물·비타민 중 하나라도 0이 되면 패배!', C.text],
      ['밥·상추는 바로 먹고, 고기·버섯은 불판에 굽는다', C.text],
      ['익으면(초록색) 집게 키로 먹기 — 먼저 집는 사람이 임자!', C.cooked],
      ['너무 오래 두면 타서 버려진다', C.dim],
      [`가끔 피버 타임: ${CONFIG.fever.duration}초 동안 굽기 x${CONFIG.fever.cookMul}`, C.fever],
      ['시간이 갈수록 배가 빨리 고파진다', C.dim],
    ];
    rules.forEach(([r, col], i) => text(r, 320, 136 + i * 17, { align: 'center', color: col }));

    // 조작
    [0, 1].forEach((pi) => {
      const x = pi === 0 ? 8 : 496;
      box(x, 128, 136, 112, C.pDark[pi], C.ink);
      text(`${pi + 1}P`, x + 68, 133, { align: 'center', color: C.p[pi] });
      const m = KEYMAP[pi];
      text('접시', x + 8, 152, { color: C.dim });
      text(m.plates.map(keyLabel).join(' '), x + 128, 152, { align: 'right' });
      text('밥 고기 버섯 상추', x + 128, 168, { align: 'right', color: C.dim });
      text('집게', x + 8, 194, { color: C.dim });
      text(m.tongs.map(keyLabel).join('    '), x + 128, 194, { align: 'right' });
      text('고기 버섯', x + 128, 210, { align: 'right', color: C.dim });
    });

    // 랭킹
    box(170, 248, 300, 80, '#2a1b11', C.ink);
    text('명승부 TOP 5 (대결 시간)', 320, 253, { align: 'center', color: C.warn });
    if (!ranking.length) text('아직 기록이 없어요', 320, 284, { align: 'center', color: C.dim });
    ranking.forEach((r, i) => {
      const y = 270 + i * 11;
      ctx.save();
      text(`${i + 1}. ${r.name}`, 230, y, { color: i === 0 ? C.warn : C.text, size: 12 });
      text(formatTime(r.time), 410, y, { align: 'right', color: i === 0 ? C.warn : C.text });
      ctx.restore();
    });

    if (blink(2)) text('SPACE 를 눌러 시작', 320, 334, { size: 12, align: 'center', color: '#fff' });
    text('T: 키 테스트', 632, 344, { align: 'right', color: C.dim });
  }

  function drawCountdown(g, n) {
    drawGame(g);
    dim(0.45);
    const label = n > 0 ? String(n) : '먹어라!';
    text(label, 320, 140, { size: 48, align: 'center', color: '#ffb03a', shadow: '#5a1a08' });
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
    if (o.winner === -1) {
      text('무승부!', 320, 36, { size: 36, align: 'center', color: C.warn, shadow: '#5a1a08' });
    } else {
      text(`${o.winner + 1}P 승리!`, 320, 36, { size: 36, align: 'center', color: C.p[o.winner], shadow: C.ink });
    }
    o.cause.forEach((s, pi) => {
      if (s) text(`${pi + 1}P: ${STAT_LABEL[s]} 부족으로 쓰러짐`, 320, 90 + (o.winner === -1 ? pi * 16 : 0), { align: 'center', color: C.dim });
    });
    text(`대결 시간 ${formatTime(o.time)}`, 320, 124, { size: 24, align: 'center' });

    // 먹은 기록
    const cols = [190, 450];
    [0, 1].forEach((pi) => {
      const p = g.players[pi];
      const x = cols[pi];
      text(`${pi + 1}P`, x, 160, { align: 'center', color: C.p[pi] });
      FOODS.forEach((f, i) => {
        sprite(sprites.plateFood[i], x - 40, 176 + i * 18, 1);
        text(`${f.name} ${p.eaten[f.id]}`, x - 20, 178 + i * 18, { color: C.text });
      });
      text(`뺏어먹기 ${p.stolen}`, x - 40, 250, { color: C.warn });
    });

    if (ui.entering) {
      box(170, 266, 300, 64, C.pDark[Math.max(0, o.winner)], C.ink);
      text('명승부 TOP 5 진입! 이름 (영문·숫자 3자)', 320, 270, { align: 'center', color: C.warn });
      const slots = [0, 1, 2].map((k) => ui.name[k] || (k === ui.name.length && blink(3) ? '_' : ' '));
      text(slots.join(' '), 320, 285, { size: 24, align: 'center' });
      text('ENTER 저장  ESC 건너뛰기', 320, 314, { align: 'center', color: C.dim });
    } else if (ui.ready) {
      if (ui.rank) text(`${ui.rank}위로 기록되었습니다!`, 320, 280, { align: 'center', color: C.warn });
      if (blink(2)) text('SPACE 다시 하기', 320, 300, { size: 12, align: 'center' });
      text('ESC 타이틀로', 320, 316, { align: 'center', color: C.dim });
    }
  }

  function drawKeyTest(held) {
    ctx.drawImage(table, 0, 0);
    dim(0.5);
    text('키 테스트', 320, 16, { size: 24, align: 'center' });
    text('두 사람이 동시에 여러 키를 꾹 눌러 보세요. 누른 키가 안 켜지면 그 키보드는 고스팅이 있어요.', 320, 50, { align: 'center', color: C.dim });
    const rows = [
      ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
      ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
      ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
    ];
    const owner = (code) => KEYMAP.findIndex((m) => m.plates.includes(code) || m.tongs.includes(code));
    let count = 0;
    rows.forEach((row, r) => {
      row.forEach((code, i) => {
        const x = 150 + r * 12 + i * 32;
        const y = 100 + r * 34;
        const pi = owner(code);
        const lit = held.has(code);
        if (lit && pi >= 0) count++;
        if (pi < 0) {
          rect(x, y, 24, 20, '#3a3030');
          text(keyLabel(code), x + 12, y + 3, { align: 'center', color: '#6a5a50', shadow: null });
        } else keyCap(x, y, keyLabel(code), pi, lit);
      });
    });
    text(`동시에 인식된 게임 키: ${count}개`, 320, 218, { size: 24, align: 'center', color: count >= 6 ? C.cooked : C.text });
    text('빨간 키 = 1P, 파란 키 = 2P', 320, 254, { align: 'center', color: C.dim });
    text('ESC 돌아가기', 320, 330, { align: 'center', color: C.dim });
  }

  return { ctx, sprites, fx, consume, update, reset, drawTitle, drawCountdown, drawGame, drawPause, drawResult, drawKeyTest };
}
