// Canvas 2D 도트 렌더링. 논리 해상도 640×360, CSS로 정수배 확대한다.
// 고깃집 식탁을 위에서 내려다본 모습: 1P는 왼쪽, 2P는 오른쪽에 마주 앉는다.
import { CONFIG, FOODS, STATS, STAT_LABEL, decayRate } from './config.js';
import { feverWarning, feverRemaining } from './game.js';
import { KEYMAP, GAME_CODES, keyLabel } from './input.js';

const GAME_KEYS = new Set(GAME_CODES);
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
const PLATE_Y = 86;
// 사각 불판과 그 위 8자리
const GRILL = { x: 180, y: 132, w: 280, h: 170 };
const SLOT_X = [215, 285, 355, 425];
const SLOT_Y = [164, 241];
// 자리 (1P 왼쪽, 2P 오른쪽)
const SEAT_X = [12, 472];
const SEAT_W = 156;

const MAX_PARTICLES = 80;
const MAX_FLOATERS = 24;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = buildSprites();
  const wood = makeWood();
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
    return 48 + row * 42;
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
          const x = SEAT_X[ev.player] + SEAT_W / 2;
          STATS.forEach((s, row) => {
            if (ev.gains[s]) floater(x, gaugeY(row) + 18, `+${ev.gains[s]}`, '#fff');
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
          else if (ev.slot !== undefined) {
            const [x, y] = slotCenter(ev.slot);
            const why = { none: '빈 칸!', raw: '덜 익음!', burnt: '탔음!' }[ev.reason];
            if (why) floater(x, y - 20, ev.player ? 'CPU 헛손질' : why, C.p[ev.player], 12, 0.7);
          } else if (ev.reason === 'empty' || ev.reason === 'full') {
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
  // 도트 글자: 캔버스가 번지게 그린 글자를 반투명 픽셀 없이 켜고/꺼서 또렷하게 만든 뒤 캐시한다
  const glyphCache = new Map();
  const GLYPH_CACHE_MAX = 600;
  function glyph(str, size, color) {
    const key = `${size}|${color}|${str}`;
    let img = glyphCache.get(key);
    if (img) return img;
    const c = document.createElement('canvas');
    const t = c.getContext('2d', { willReadFrequently: true });
    t.font = `${size}px ${FONT}`;
    c.width = Math.max(1, Math.ceil(t.measureText(str).width) + 2);
    c.height = size + 4;
    t.font = `${size}px ${FONT}`;
    t.textBaseline = 'top';
    t.fillStyle = color;
    t.fillText(str, 0, 1);
    const data = t.getImageData(0, 0, c.width, c.height);
    const a = data.data;
    for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= 96 ? 255 : 0;
    t.putImageData(data, 0, 0);
    if (glyphCache.size >= GLYPH_CACHE_MAX) glyphCache.clear();
    glyphCache.set(key, c);
    return c;
  }

  function text(str, x, y, { size = 12, color = C.text, align = 'left', shadow = C.ink } = {}) {
    str = String(str);
    const img = glyph(str, size, color);
    const w = img.width - 2;
    let dx = Math.round(x);
    if (align === 'center') dx = Math.round(x - w / 2);
    else if (align === 'right') dx = Math.round(x - w);
    const dy = Math.round(y) - 1;
    if (shadow) ctx.drawImage(glyph(str, size, shadow), dx + 1, dy + 1);
    ctx.drawImage(img, dx, dy);
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

  // scale은 16px 기준 배율. 32px 원본은 scale 2에서 1:1, 4에서 2배
  function sprite(img, x, y, scale = 2) {
    ctx.drawImage(img, Math.round(x), Math.round(y), 16 * scale, 16 * scale);
  }

  // 44px 음식 그림을 (cx, cy) 가운데에 그린다
  function art(img, cx, cy, zoom = 1) {
    const w = img.width * zoom;
    const h = img.height * zoom;
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
  }

  // 음식 모양을 따라 그리는 빛 테두리 (익음 = 초록, 퍼펙트 = 금색)
  const silCache = new Map();
  function silhouette(img, color) {
    let byColor = silCache.get(img);
    if (!byColor) silCache.set(img, (byColor = new Map()));
    let c = byColor.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const t = c.getContext('2d');
    t.drawImage(img, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, c.width, c.height);
    byColor.set(color, c);
    return c;
  }
  function glow(img, cx, cy, color, width = 2) {
    const sil = silhouette(img, color);
    const x = Math.round(cx - img.width / 2);
    const y = Math.round(cy - img.height / 2);
    for (let d = width; d >= 1; d--) {
      ctx.globalAlpha = d === width ? 0.55 : 1;
      for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, d], [-d, d], [d, -d]]) ctx.drawImage(sil, x + dx, y + dy);
    }
    ctx.globalAlpha = 1;
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

  // 도트 타원 (그림자·접시 바닥)
  function ellipse(cx, cy, rx, ry, color, c2d = ctx) {
    c2d.fillStyle = color;
    for (let dy = -ry; dy <= ry; dy++) {
      const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
      c2d.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1);
    }
  }

  // Shift 조합 키 칩. ready = 지금 먹을 수 있는 칸 (밝은 초록), 아니면 흐리게
  function shiftChip(x, y, code, ready = false, perfect = false) {
    const fill = ready ? (perfect && blink(12) ? '#e0b020' : '#28a838') : '#2a3230';
    const fg = ready ? '#fff' : '#7d8a84';
    rect(x - 12, y, 24, 14, ready ? '#0a2a10' : '#141a18');
    rect(x - 11, y + 1, 22, 12, fill);
    if (ready) rect(x - 11, y + 1, 22, 1, 'rgba(255,255,255,0.35)');
    const ax = x - 8;
    rect(ax + 2, y + 3, 1, 1, fg);
    rect(ax + 1, y + 4, 3, 1, fg);
    rect(ax, y + 5, 5, 1, fg);
    rect(ax + 1, y + 6, 3, 4, fg);
    text(keyLabel(code), x + 4, y + 1, { align: 'center', color: fg, shadow: ready ? '#0a3a10' : null });
  }

  // 나무 상판 (타이틀·키 테스트 배경)
  function makeWood() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const t = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // 나무 상판: 판자마다 색을 조금씩 달리하고 결·옹이를 넣는다
    t.fillStyle = '#140c08';
    t.fillRect(0, 0, W, H);
    const planks = ['#5e3c24', '#613e25', '#5b3a23', '#603d25'];
    for (let y = 4, k = 0; y < H - 4; y += 24, k++) {
      t.fillStyle = planks[k % planks.length];
      t.fillRect(4, y, W - 8, 24);
      t.fillStyle = '#6a4630';
      t.fillRect(4, y, W - 8, 1);
      t.fillStyle = '#4a2c18';
      t.fillRect(4, y + 23, W - 8, 1);
      for (let n = 0; n < 10; n++) {
        t.fillStyle = rnd() < 0.5 ? '#573821' : '#64412a';
        t.fillRect(4 + Math.floor(rnd() * (W - 48)), y + 3 + Math.floor(rnd() * 18), 8 + Math.floor(rnd() * 36), 1);
      }
      // 판자 이음매 + 옹이
      const seam = 30 + Math.floor(rnd() * (W - 60));
      t.fillStyle = '#4a2c18';
      t.fillRect(seam, y + 1, 1, 22);
      if (rnd() < 0.6) {
        const kx = 20 + Math.floor(rnd() * (W - 40));
        ellipse(kx, y + 12, 4, 2, '#4e301c', t);
        ellipse(kx, y + 12, 2, 1, '#3a2212', t);
      }
    }
    // 가장자리를 계단식으로 어둡게 (도트 비네팅)
    for (let k = 0; k < 6; k++) {
      t.fillStyle = 'rgba(10,6,4,0.08)';
      t.fillRect(4 + k * 2, 4 + k * 2, W - 8 - k * 4, 2);
      t.fillRect(4 + k * 2, H - 6 - k * 2, W - 8 - k * 4, 2);
      t.fillRect(4 + k * 2, 4 + k * 2, 2, H - 8 - k * 4);
      t.fillRect(W - 6 - k * 2, 4 + k * 2, 2, H - 8 - k * 4);
    }
    return c;
  }

  // 식탁 = 나무 상판 + 자리 매트 + 반찬 (한 번만 그려 둔다)
  function makeTable() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const t = c.getContext('2d');
    t.drawImage(wood, 0, 0);
    // 자리 매트: 천 매트 + 바느질 테두리
    const matCol = [['#5a2622', '#7a3a32', '#9a5a4a'], ['#22305a', '#34467a', '#5a6e9a']];
    [0, 1].forEach((pi) => {
      const [base, edge, stitch] = matCol[pi];
      const x = SEAT_X[pi];
      t.fillStyle = 'rgba(0,0,0,0.35)';
      t.fillRect(x + 2, 38, SEAT_W, 316);
      t.fillStyle = edge;
      t.fillRect(x, 36, SEAT_W, 316);
      t.fillStyle = base;
      t.fillRect(x + 3, 39, SEAT_W - 6, 310);
      t.fillStyle = stitch;
      for (let sx = x + 6; sx < x + SEAT_W - 6; sx += 4) {
        t.fillRect(sx, 41, 2, 1);
        t.fillRect(sx, 346, 2, 1);
      }
      for (let sy = 43; sy < 346; sy += 4) {
        t.fillRect(x + 5, sy, 1, 2);
        t.fillRect(x + SEAT_W - 6, sy, 1, 2);
      }
    });
    // 반찬 그릇 (김치 · 쌈장 · 마늘 · 파절이)
    const bowls = [
      [196, 16, '#c83a26', '#f07a4a'],
      [444, 16, '#4a9a32', '#86cc5a'],
    ];
    for (const [x, r, a, b] of bowls) {
      const y = 328;
      ellipse(x + 2, y + 3, r + 1, r, 'rgba(0,0,0,0.35)', t);
      disc(x, y, r + 1, C.ink, t);
      disc(x, y, r, '#d8d2c8', t);
      disc(x, y, r - 2, '#b8b0a4', t);
      disc(x, y, r - 3, a, t);
      t.fillStyle = b;
      for (let k = 0; k < 7; k++) t.fillRect(x - r / 2 + ((k * 5) % (r + 2)), y - r / 2 + ((k * 7) % (r + 1)), 3, 2);
      t.fillStyle = '#ffffff';
      t.fillRect(x - r + 3, y - r + 4, 2, 1);
    }
    return c;
  }

  // ---------- 화면 요소 ----------
  function drawGauge(x, y, w, v, col) {
    const inner = w - 2;
    const fill = Math.round((inner * v) / CONFIG.statMax);
    rect(x, y, w, 14, C.ink);
    rect(x + 1, y + 1, inner, 12, '#2a1a12');
    rect(x + 1, y + 1, fill, 12, col);
    rect(x + 1, y + 1, fill, 3, 'rgba(255,255,255,0.35)');
    rect(x + 1, y + 10, fill, 3, 'rgba(0,0,0,0.22)');
    // 10칸 눈금, 30 지점은 진하게 (위험선)
    for (let k = 1; k < 10; k++) {
      const tx = x + 1 + Math.round((inner * k) / 10);
      rect(tx, y + 1, 1, 12, k === 3 ? 'rgba(255,207,58,0.55)' : 'rgba(0,0,0,0.25)');
    }
  }

  function drawSeat(g, pi) {
    const x = SEAT_X[pi] + shake(fx.shakeSeat[pi]);
    const p = g.players[pi];
    const danger = STATS.some((s) => p.stats[s] <= 15);

    box(x + 4, 8, SEAT_W - 8, 22, danger && blink(6) ? '#b81f1f' : C.pDark[pi], C.ink);
    rect(x + 6, 10, SEAT_W - 12, 1, 'rgba(255,255,255,0.18)');
    text(danger ? `${labels[pi]} 위험!` : labels[pi], x + SEAT_W / 2, 13, { align: 'center', color: danger ? '#fff' : C.p[pi] });

    // 수치판
    box(x + 8, 42, SEAT_W - 16, 132, 'rgba(20,10,6,0.55)', 'rgba(0,0,0,0.6)');
    const icons = { protein: sprites.icon.meat, carb: sprites.icon.rice, vitamin: sprites.icon.lettuce };
    STATS.forEach((s, row) => {
      const y = gaugeY(row);
      const v = p.stats[s];
      art(icons[s], x + 22, y + 8);
      text(STAT_LABEL[s], x + 36, y + 3, { color: C.dim });
      text(String(Math.ceil(v)), x + SEAT_W - 16, y + 3, { align: 'right', color: v <= 30 ? (v <= 15 ? C.danger : C.warn) : C.text });
      let col = C.stat[s];
      if (v <= 15) col = blink(6) ? C.danger : '#7a1a1a';
      else if (v <= 30) col = C.warn;
      drawGauge(x + 14, y + 20, SEAT_W - 28, v, col);
    });

    // 앞접시 · 수저 · 물컵 (자리 아래쪽을 꽉 채우게 크게)
    const cx = x + SEAT_W / 2;
    const cy = 238;
    ellipse(cx + 3, cy + 5, 41, 40, 'rgba(0,0,0,0.35)');
    disc(cx, cy, 41, C.ink);
    disc(cx, cy, 40, '#bfc5d0');
    disc(cx, cy, 37, '#dde2ea');
    disc(cx, cy, 33, '#eef1f5');
    disc(cx, cy, 26, '#f6f8fa');
    rect(cx - 26, cy - 27, 10, 2, '#ffffff');
    rect(cx - 29, cy - 24, 3, 7, '#ffffff');
    if (p.lastFood) {
      const { food, golden } = p.lastFood;
      const img = golden ? sprites.golden.cooked : FOODS[food].grill ? sprites[FOODS[food].id].cooked : sprites.plateFood[food];
      art(img, cx, cy - (fx.bite[pi] > 0 ? 3 : 0));
    }
    // 젓가락(나무): 길고 굵게, 끝으로 갈수록 가늘게
    const hx = pi === 0 ? x + 10 : x + SEAT_W - 22;
    const top = cy - 58;
    const len = 118;
    for (const dx of [0, 7]) {
      rect(hx + dx + 2, top + 2, 4, len, 'rgba(0,0,0,0.3)');
      rect(hx + dx, top, 4, len - 14, '#c8a060');
      rect(hx + dx + 1, top + len - 14, 2, 14, '#c8a060');
      rect(hx + dx, top, 1, len - 14, '#e6c88a');
      rect(hx + dx + 3, top, 1, len - 14, '#9a7a44');
      rect(hx + dx, top, 4, 16, '#7a5a2e');
      rect(hx + dx, top + 16, 4, 1, '#5a3e1a');
    }
    // 숟가락(스테인리스): 큰 머리 + 굵은 손잡이
    const spx = pi === 0 ? x + SEAT_W - 20 : x + 14;
    const sy = cy - 56;
    ellipse(spx + 5, sy + 13, 8, 12, 'rgba(0,0,0,0.3)');
    ellipse(spx + 3, sy + 11, 8, 12, C.ink);
    ellipse(spx + 3, sy + 11, 7, 11, '#a4aab4');
    ellipse(spx + 2, sy + 10, 5, 8, '#d8dce4');
    rect(spx - 1, sy + 4, 2, 4, '#ffffff');
    rect(spx + 4, sy + 23, 3, 90, 'rgba(0,0,0,0.3)');
    rect(spx + 1, sy + 22, 5, 90, C.ink);
    rect(spx + 2, sy + 22, 3, 89, '#a4aab4');
    rect(spx + 2, sy + 22, 1, 89, '#eef2f6');
    rect(spx + 1, sy + 100, 5, 12, '#a4aab4');
    // 물컵: 크게
    const cupY = 323;
    ellipse(cx + 3, cupY + 4, 20, 19, 'rgba(0,0,0,0.3)');
    disc(cx, cupY, 20, C.ink);
    disc(cx, cupY, 19, '#c4e0ee');
    disc(cx, cupY, 16, '#8cc4e4');
    disc(cx, cupY, 12, '#a8d4ee');
    rect(cx - 11, cupY - 11, 6, 2, '#ffffff');
    rect(cx - 13, cupY - 8, 2, 4, '#ffffff');

    if (p.spicy > 0) {
      ctx.fillStyle = `rgba(255,40,20,${0.25 + 0.15 * Math.sin(fx.time * 14)})`;
      ctx.fillRect(SEAT_X[pi], 36, SEAT_W, 316);
      art(sprites.chili, cx, cy - 4);
      text(`매워! ${p.spicy.toFixed(1)}`, cx, cy + 42, { size: 24, align: 'center', color: '#fff', shadow: '#7a0a0a' });
    }
    if (p.lock > 0) text('헛손질!', cx, 180, { align: 'center', color: C.warn });
  }

  function drawTop(g) {
    box(270, 4, 100, 30, '#24160e', C.ink);
    rect(272, 6, 96, 1, 'rgba(255,255,255,0.12)');
    text(formatTime(g.t), 320, 7, { size: 24, align: 'center' });
    const late = g.t > CONFIG.rampStart;
    box(262, 338, 116, 18, 'rgba(20,10,6,0.7)', 'rgba(0,0,0,0.7)');
    text(`배고픔 ${decayRate(g.t).toFixed(1)}/초`, 320, 341, { align: 'center', color: late ? C.danger : C.dim });
  }

  function drawFeverBanner(g) {
    const y = 310;
    if (g.fever.active) {
      const rem = feverRemaining(g);
      box(220, y, 200, 24, blink(8) ? '#b8360f' : '#d9581a', C.ink);
      rect(222, y + 1, 196, 1, 'rgba(255,255,255,0.3)');
      text(`FEVER! 굽기 x${CONFIG.fever.cookMul}`, 320, y + 5, { align: 'center', color: '#fff3c0', shadow: '#5a1a08' });
      rect(226, y + 20, 188, 2, '#5a1a08');
      rect(226, y + 20, Math.round((188 * rem) / CONFIG.fever.duration), 2, '#ffe14a');
    } else if (feverWarning(g)) {
      const n = Math.ceil(g.fever.start - g.t);
      if (blink(6)) {
        box(220, y, 200, 24, '#5a2a0a', C.ink);
        text(`피버 ${n}초 전! 불판을 채워라`, 320, y + 5, { align: 'center', color: C.fever });
      }
    }
  }

  function drawPlates(g) {
    FOODS.forEach((food, i) => {
      const cx = PLATE_X[i] + shake(fx.shakePlate[i]);
      const cy = PLATE_Y;
      const pl = g.plates[i];
      // 이름표: [키] 이름
      rect(cx - 26, 36, 52, 16, 'rgba(20,10,6,0.75)');
      const nameW = glyph(food.name, 12, C.text).width - 2;
      const left = Math.round(cx - (14 + 4 + nameW) / 2);
      keyChip(left + 7, 37, KEYMAP.foods[i], 0);
      text(food.name, left + 18, 38, { color: C.text });
      // 접시: 그림자 → 테두리 → 안쪽 → 하이라이트
      ellipse(cx + 3, cy + 4, 30, 29, 'rgba(0,0,0,0.35)');
      disc(cx, cy, 30, C.ink);
      disc(cx, cy, 29, '#b8bec8');
      disc(cx, cy, 27, '#dce0e8');
      disc(cx, cy, 24, '#eef1f5');
      rect(cx - 19, cy - 21, 6, 1, '#ffffff');
      rect(cx - 21, cy - 19, 2, 4, '#ffffff');
      if (pl.special) {
        art(pl.special === 'golden' ? sprites.golden.raw : sprites.chili, cx, cy);
      } else if (pl.stock > 0) {
        art(sprites.plateFood[i], cx, cy);
      } else {
        text('비었음', cx, cy - 6, { align: 'center', color: '#9a9080', shadow: null });
      }
      // 재고 점 + 보충 바
      for (let k = 0; k < CONFIG.plateMax; k++) {
        const px = cx - 11 + k * 8;
        rect(px - 1, cy + 31, 6, 6, C.ink);
        rect(px, cy + 32, 4, 4, k < pl.stock ? '#ffcf3a' : '#5a5448');
        if (k < pl.stock) rect(px, cy + 32, 2, 1, '#fff6c0');
      }
      if (pl.stock < CONFIG.plateMax) {
        rect(cx - 18, cy + 39, 36, 3, C.ink);
        rect(cx - 18, cy + 39, Math.round((36 * pl.timer) / food.refill), 3, g.fever.active ? C.fever : '#9ad0ff');
      }
    });
  }

  // 사각 불판: 숯 바닥은 미리 그려 두고(어두운 판 + 달아오른 판), 둘을 겹쳐 숨 쉬듯 빛나게 한다
  const COAL = { x: GRILL.x + 6, y: GRILL.y + 6, w: GRILL.w - 12, h: GRILL.h - 12 };
  const [coalDim, coalHot] = (() => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lumps = Array.from({ length: 150 }, () => ({
      x: Math.floor(rnd() * (COAL.w - 6)),
      y: Math.floor(rnd() * (COAL.h - 5)),
      w: 6 + Math.floor(rnd() * 8),
      h: 5 + Math.floor(rnd() * 5),
      crack: rnd(),
    }));
    return [false, true].map((hot) => {
      const c = document.createElement('canvas');
      c.width = COAL.w;
      c.height = COAL.h;
      const t = c.getContext('2d');
      t.fillStyle = hot ? '#3a0c04' : '#0c0a0a';
      t.fillRect(0, 0, COAL.w, COAL.h);
      for (const l of lumps) {
        t.fillStyle = hot ? '#221612' : '#1c1816';
        t.fillRect(l.x, l.y, l.w, l.h);
        t.fillStyle = hot ? '#3a2218' : '#262020';
        t.fillRect(l.x, l.y, l.w, 1);
        t.fillRect(l.x, l.y, 1, l.h);
        t.fillStyle = hot ? '#ff7a1a' : '#161210';
        t.fillRect(l.x, l.y + l.h - 1, l.w, 1);
        if (hot && l.crack > 0.4) {
          t.fillStyle = l.crack > 0.8 ? '#ffd23a' : '#ff9a2a';
          t.fillRect(l.x + Math.floor(l.w / 3), l.y + 2, Math.max(2, Math.floor(l.w / 2)), 1);
        }
      }
      return c;
    });
  })();
  const sparks = (() => {
    let seed = 23;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 24 }, () => ({ x: COAL.x + Math.floor(rnd() * COAL.w), y: COAL.y + Math.floor(rnd() * COAL.h), ph: rnd() * 6.28 }));
  })();

  // 굽는 정도에 맞는 그림: 날것 → 익는 중(2단계) → 익음 → 타기 시작 → 탐
  function stageOf(it) {
    if (it.state === 'raw') {
      const r = it.progress / it.cookTime;
      return r < 0.4 ? 'raw' : r < 0.75 ? 'cook1' : 'cook2';
    }
    if (it.state === 'cooked') return it.cookedFor / CONFIG.burnAfter < 0.55 ? 'cooked' : 'char1';
    return 'burnt';
  }

  function drawGrill(g) {
    const fever = g.fever.active;
    const G = GRILL;
    // 손잡이 (나무 + 리벳)
    for (const hx of [G.x - 14, G.x + G.w]) {
      rect(hx, G.y + G.h / 2 - 9, 14, 18, C.ink);
      rect(hx + 1, G.y + G.h / 2 - 8, 12, 16, '#5a3820');
      rect(hx + 1, G.y + G.h / 2 - 8, 12, 2, '#7a5232');
      rect(hx + 5, G.y + G.h / 2 - 2, 3, 3, '#9a9aa8');
    }
    // 철판 테두리 (위·왼쪽 밝게, 아래·오른쪽 어둡게)
    ellipse(G.x + G.w / 2 + 4, G.y + G.h + 4, G.w / 2 + 4, 6, 'rgba(0,0,0,0.35)');
    rect(G.x - 2, G.y - 2, G.w + 4, G.h + 4, C.ink);
    rect(G.x, G.y, G.w, G.h, fever ? '#7a4a3a' : '#585864');
    rect(G.x, G.y, G.w, 2, fever ? '#b07060' : '#8a8a98');
    rect(G.x, G.y, 2, G.h, fever ? '#a06050' : '#7a7a88');
    rect(G.x, G.y + G.h - 2, G.w, 2, '#3a3a44');
    rect(G.x + G.w - 2, G.y, 2, G.h, '#3a3a44');
    rect(COAL.x - 1, COAL.y - 1, COAL.w + 2, COAL.h + 2, '#202026');
    // 숯불
    ctx.drawImage(coalDim, COAL.x, COAL.y);
    ctx.globalAlpha = fever ? 0.85 + 0.15 * Math.sin(fx.time * 10) : 0.22 + 0.1 * Math.sin(fx.time * 1.6);
    ctx.drawImage(coalHot, COAL.x, COAL.y);
    ctx.globalAlpha = 1;
    for (const s of sparks) {
      const v = Math.sin(fx.time * (fever ? 9 : 3) + s.ph);
      if (v > 0.6) rect(s.x, s.y, 1, 1, fever ? '#fff3a0' : '#ffb03a');
    }
    // 석쇠: 가로 살 (그림자 · 몸통 · 하이라이트)
    for (let y = COAL.y + 3; y < COAL.y + COAL.h - 1; y += 8) {
      rect(COAL.x, y + 2, COAL.w, 1, 'rgba(0,0,0,0.5)');
      rect(COAL.x, y, COAL.w, 2, '#3e3e48');
      rect(COAL.x, y, COAL.w, 1, '#5e5e6a');
    }

    g.grill.forEach((it, i) => {
      const [cx, cy] = slotCenter(i);
      if (fx.flashSlot[i] > 0) rect(cx - 26, cy - 26, 52, 52, 'rgba(255,255,255,0.4)');
      if (!it) return;
      const img = (it.golden ? sprites.golden : sprites[FOODS[it.food].id])[stageOf(it)];
      const sizzle = it.state !== 'burnt' ? Math.round(Math.sin(fx.time * 20 + i) * 0.6) : 0;

      ellipse(cx + 3, cy + 5, 20, 12, 'rgba(0,0,0,0.5)');
      if (it.golden && it.state !== 'burnt') disc(cx, cy, 22, 'rgba(255,216,74,0.2)');
      if (it.state === 'cooked') {
        // 익음: 음식 모양을 따라 초록 빛 테두리. 퍼펙트 구간은 금색, 곧 탈 때는 빠르게 깜빡
        const perfect = it.cookedFor <= CONFIG.perfectWindow;
        const late = it.cookedFor > CONFIG.burnAfter - 1.5;
        const color = perfect ? (blink(12) ? '#ffe14a' : '#ffffff') : late && !blink(10) ? '#1f8a2a' : '#5dff6a';
        glow(img, cx, cy + sizzle, color, 2);
      }
      if (it.state === 'burnt') ctx.globalAlpha = Math.max(0.2, 1 - (it.burntFor || 0) / CONFIG.burntClear);
      art(img, cx, cy + sizzle);
      ctx.globalAlpha = 1;
      // 지글지글: 굽는 중이면 기름 방울이 튄다
      if (it.state === 'raw' && blink(6) && (i + Math.floor(fx.time * 6)) % 3 === 0) {
        rect(cx - 14 + ((i * 7 + Math.floor(fx.time * 12)) % 28), cy - 14, 1, 1, '#fff6c0');
      }
      // 올린 사람
      rect(cx - 25, cy - 22, 7, 7, C.ink);
      rect(cx - 24, cy - 21, 5, 5, C.p[it.owner]);
      // 진행 바
      if (it.state !== 'burnt') {
        const raw = it.state === 'raw';
        const ratio = raw ? it.progress / it.cookTime : 1 - it.cookedFor / CONFIG.burnAfter;
        rect(cx - 21, cy + 23, 42, 6, C.ink);
        rect(cx - 20, cy + 24, 40, 4, '#2a1a12');
        rect(cx - 20, cy + 24, Math.round(40 * ratio), 4, raw ? C.raw : C.cooked);
        rect(cx - 20, cy + 24, Math.round(40 * ratio), 1, 'rgba(255,255,255,0.4)');
      } else {
        text('탐!', cx, cy + 20, { align: 'center', color: '#ccc' });
      }
    });
    // 칸마다 먹기 키 (Shift + 키). 지금 먹을 수 있는 칸만 밝게
    for (let i = 0; i < CONFIG.grillSlots; i++) {
      const [cx, cy] = slotCenter(i);
      const it = g.grill[i];
      const ready = !!it && it.state === 'cooked';
      shiftChip(cx, cy + 31, KEYMAP.slots[i], ready, ready && it.cookedFor <= CONFIG.perfectWindow);
    }
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
  // 큰 키캡 (타이틀 안내용)
  function bigKey(x, y, label, w = 22, color = '#e9dcc6', fg = C.ink) {
    rect(x, y, w, 22, C.ink);
    rect(x + 1, y + 1, w - 2, 20, color);
    rect(x + 1, y + 16, w - 2, 5, 'rgba(0,0,0,0.25)');
    rect(x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,0.5)');
    text(label, x + w / 2, y + 3, { align: 'center', color: fg, shadow: null });
  }

  function drawTitle(ranking, level) {
    ctx.drawImage(wood, 0, 0);
    dim(0.45);
    const bob = (k) => Math.round(Math.sin(fx.time * 2 + k) * 2);
    art(sprites.meat.cooked, 150, 44 + bob(0));
    art(sprites.golden.cooked, 490, 44 + bob(2));
    text('불판 대첩', 320, 18, { size: 48, align: 'center', color: '#ffb03a', shadow: '#5a1a08' });
    text('고깃집에서 CPU와 먹기 대결!', 320, 72, { align: 'center', color: C.text });

    // 3단계 안내 카드
    const cards = [
      ['1  접시 키', '고기·버섯은 불판으로'],
      ['2  먹기', '초록으로 빛나면 Shift+키'],
      ['3  버티기', '셋 중 하나라도 0이면 패배'],
    ];
    cards.forEach(([head, line], k) => {
      const x = 28 + k * 200;
      const y = 96;
      box(x, y, 184, 108, 'rgba(30,18,10,0.9)', C.ink);
      text(head, x + 92, y + 6, { align: 'center', color: C.warn });
      if (k === 0) {
        KEYMAP.foods.forEach((code, n) => {
          bigKey(x + 16 + n * 40, y + 30, keyLabel(code));
          art(sprites.icon.plateFood[n], x + 27 + n * 40, y + 66);
        });
      } else if (k === 1) {
        glow(sprites.meat.cooked, x + 46, y + 52, '#5dff6a', 2);
        art(sprites.meat.cooked, x + 46, y + 52);
        bigKey(x + 92, y + 40, 'Shift', 44, '#28a838', '#fff');
        text('+', x + 141, y + 43, { align: 'center' });
        bigKey(x + 150, y + 40, 'Q');
      } else {
        const icons = [sprites.icon.meat, sprites.icon.rice, sprites.icon.lettuce];
        const vals = [70, 45, 12];
        const cols = [C.stat.protein, C.stat.carb, blink(6) ? C.danger : '#7a1a1a'];
        icons.forEach((ic, n) => {
          const yy = y + 24 + n * 20;
          art(ic, x + 24, yy + 8);
          drawGauge(x + 40, yy + 2, 126, vals[n], cols[n]);
        });
      }
      text(line, x + 92, y + 88, { align: 'center', color: C.text });
    });

    // 난이도
    text('상대 CPU', 320, 216, { align: 'center', color: C.dim });
    LEVELS.forEach((lv, n) => {
      const x = 170 + n * 102;
      const on = lv === level;
      box(x, 232, 96, 24, on ? C.pDark[1] : '#3a2a20', on ? '#fff' : C.ink);
      text(`${n + 1} ${DIFFICULTY[lv].label}`, x + 48, 238, { align: 'center', color: on ? '#fff' : C.dim });
    });
    text('←', 154, 238, { align: 'center', color: C.dim });
    text('→', 486, 238, { align: 'center', color: C.dim });

    // 최단 승리 1~3위 (한 줄씩 짧게)
    const top = ranking.slice(0, 3);
    text(`최단 승리 · ${DIFFICULTY[level].label}`, 320, 264, { align: 'center', color: C.warn });
    if (!top.length) text('아직 기록 없음 — 첫 주인공이 되어 보세요', 320, 280, { align: 'center', color: C.dim });
    top.forEach((r, n) => text(`${n + 1}위 ${r.name}  ${formatTime(r.time)}`, 320, 280 + n * 12, { align: 'center', color: n === 0 ? C.warn : C.text }));

    // 안내는 사라지지 않고 색만 바뀐다 (잠깐 봐도 다음에 누를 키가 보이게)
    text('SPACE 로 시작', 320, 318, { size: 24, align: 'center', color: blink(2) ? '#fff' : C.warn, shadow: '#5a1a08' });
    text('H 자세한 규칙   ·   T 키 테스트', 320, 346, { align: 'center', color: C.dim });
  }

  // 자세한 규칙 (타이틀에서 H)
  function drawHelp() {
    ctx.drawImage(wood, 0, 0);
    dim(0.6);
    text('자세한 규칙', 320, 14, { size: 24, align: 'center', color: '#ffb03a', shadow: '#5a1a08' });
    const rows = [
      ['밥(Q)·상추(R)', '누르면 바로 먹는다. 탄수화물·비타민', C.text],
      ['고기(W)·버섯(E)', '불판에 올린다. 익으면 Shift+칸 키로 먹기', C.text],
      ['불판 칸 키', '윗줄 Shift+Q W E R, 아랫줄 Shift+U I O P', C.cooked],
      ['PERFECT', `익자마자(${CONFIG.perfectWindow}초 안) 먹으면 영양 x${CONFIG.perfectMul}`, C.warn],
      ['황금 고기', `가끔 고기 접시에 등장. 세 수치 모두 +${CONFIG.golden.gain}`, C.gold],
      ['청양고추', `상추 접시에 등장. 먹으면 CPU가 ${CONFIG.chili.stun}초 못 먹음`, C.danger],
      ['헛손질', '빈 접시·빈 칸·덜 익은 칸을 누르면 0.5초 멈춤', C.dim],
      ['피버 타임', `가끔 ${CONFIG.fever.duration}초 동안 굽기 x${CONFIG.fever.cookMul}`, C.fever],
      ['탐', '익고 4초 지나면 타서 저절로 치워진다', C.dim],
      ['배고픔', '시간이 갈수록 수치가 빨리 준다', C.dim],
    ];
    box(40, 48, 560, 272, 'rgba(30,18,10,0.9)', C.ink);
    rows.forEach(([head, body, col], n) => {
      const y = 58 + n * 26;
      text(head, 64, y, { color: col });
      text(body, 184, y, { color: C.text });
      if (n < rows.length - 1) rect(60, y + 19, 520, 1, 'rgba(255,255,255,0.08)');
    });
    text('ESC 돌아가기', 320, 334, { align: 'center', color: C.dim });
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
        art(sprites.icon.plateFood[i], x + 10, 160 + i * 20);
        text(`${f.name} ${p.eaten[f.id]}`, x + 24, 154 + i * 20);
      });
      const extra = [
        [`PERFECT ${p.perfect}`, C.warn],
        [`황금 고기 ${p.golden}`, C.gold],
        [`고추 공격 ${p.chili}`, C.danger],
        [`뺏어먹기 ${p.stolen}`, C.text],
      ];
      extra.forEach(([t, col], i) => text(t, x + 86, 154 + i * 20, { color: col }));
    });

    if (ui.entering) {
      box(170, 236, 300, 64, C.pDark[0], C.ink);
      text('최단 승리 TOP 5 진입! 이름 (영문·숫자 3자)', 320, 240, { align: 'center', color: C.warn });
      const slots = [0, 1, 2].map((k) => ui.name[k] || (k === ui.name.length && blink(3) ? '_' : ' '));
      text(slots.join(' '), 320, 255, { size: 24, align: 'center' });
      text('ENTER 저장  ESC 건너뛰기', 320, 284, { align: 'center', color: C.dim });
    } else if (ui.ready) {
      if (ui.rank) text(`${ui.rank}위로 기록되었습니다!`, 320, 250, { align: 'center', color: C.warn });
      text('SPACE 다시 하기', 320, 276, { align: 'center', color: blink(2) ? '#fff' : C.warn });
      text('ESC 타이틀로', 320, 296, { align: 'center', color: C.dim });
    }
  }

  function drawKeyTest(held) {
    ctx.drawImage(wood, 0, 0);
    dim(0.5);
    text('키 테스트', 320, 16, { size: 24, align: 'center' });
    text('Shift를 누른 채 여러 키를 꾹 눌러 보세요. 누른 키가 안 켜지면 고스팅이 있는 키보드예요.', 320, 50, { align: 'center', color: C.dim });
    const row = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
    let count = 0;
    const cap = (x, y, w, label, used, lit) => {
      rect(x, y, w, 26, C.ink);
      rect(x + 1, y + 1, w - 2, 24, !used ? '#3a3030' : lit ? C.p[0] : '#e9dcc6');
      rect(x + 1, y + 20, w - 2, 5, !used ? '#3a3030' : lit ? C.pDark[0] : '#b8a68a');
      text(label, x + w / 2, y + 6, { align: 'center', color: !used ? '#6a5a50' : lit ? '#fff' : C.ink, shadow: null });
    };
    row.forEach((code, i) => {
      const used = GAME_KEYS.has(code);
      const lit = held.has(code);
      if (used && lit) count++;
      cap(150 + i * 34, 104, 28, keyLabel(code), used, lit);
    });
    const shift = held.has('ShiftLeft') || held.has('ShiftRight');
    if (shift) count++;
    cap(126, 140, 70, 'SHIFT', true, shift);
    text(`동시에 인식된 게임 키: ${count}개`, 320, 196, { size: 24, align: 'center', color: count >= 5 ? C.cooked : C.text });
    text('ESC 돌아가기', 320, 330, { align: 'center', color: C.dim });
  }

  return { ctx, sprites, fx, setLabels, consume, update, reset, drawTitle, drawHelp, drawCountdown, drawGame, drawPause, drawResult, drawKeyTest };
}
