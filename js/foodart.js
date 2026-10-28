// 32×32 음식 도트. 손으로 찍는 대신 모양·명암 규칙으로 그린다.
// - 빛은 왼쪽 위에서 온다
// - 색은 음식마다 정한 단계(ramp) 안에서만 고르고, 단계 경계는 4×4 디더링으로 섞는다
// - 마지막에 바깥 테두리를 이웃 색보다 어두운 색으로 두른다 (selective outline)
// DOM 없이 픽셀 배열만 만든다. toCanvas()로 캔버스로 바꾼다.

export const SIZE = 32;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function darken(c, k) {
  const [r, g, b] = hex(c);
  const f = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

// l(0~1)을 ramp의 한 색으로. 단계 경계 근처만 디더링한다
function shade(ramp, l, x, y) {
  const v = clamp(l) * (ramp.length - 1);
  const i = Math.floor(v);
  const f = clamp((v - i - 0.5) * 2.2 + 0.5);
  const t = (BAYER[y & 3][x & 3] + 0.5) / 16;
  return ramp[Math.min(ramp.length - 1, f > t ? i + 1 : i)];
}

class Canvas32 {
  constructor() {
    this.c = new Array(SIZE * SIZE).fill(null);
    this.o = new Array(SIZE * SIZE).fill(null); // 테두리 색
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  }
  set(x, y, col, outline) {
    if (!this.in(x, y) || !col) return;
    const i = y * SIZE + x;
    this.c[i] = col;
    if (outline) this.o[i] = outline;
  }
  get(x, y) {
    return this.in(x, y) ? this.c[y * SIZE + x] : null;
  }
  // 바깥 테두리: 비어 있고 상하좌우에 칠한 픽셀이 있으면 그 픽셀의 테두리 색
  outline() {
    const add = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (this.get(x, y)) continue;
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const i = (y + dy) * SIZE + (x + dx);
          if (this.in(x + dx, y + dy) && this.c[i]) {
            add.push([x, y, this.o[i] || darken(this.c[i], 0.35)]);
            break;
          }
        }
      }
    }
    for (const [x, y, col] of add) this.set(x, y, col);
    return this;
  }
}

// 표면 법선과 빛으로 밝기 (왼쪽 위 조명)
function light(nx, ny, nz) {
  return -0.45 * nx - 0.55 * ny + 0.7 * nz;
}

// ---------------------------------------------------------------- 팔레트
const PAL = {
  meat: {
    raw: { lean: ['#7a1e2a', '#a8303e', '#d04a56', '#ec7680', '#ffa8ac'], fat: ['#c8aaa6', '#e6d2ce', '#f8ecea', '#ffffff'], edge: '#4a0e16', mark: null },
    cooked: { lean: ['#4a200e', '#743816', '#a0521e', '#c8742e', '#e89a48'], fat: ['#b07a30', '#d8a448', '#f0c86a', '#fff0b0'], edge: '#2a1206', mark: '#2e1206' },
    burnt: { lean: ['#140e0c', '#221816', '#302420', '#40322c'], fat: ['#2a2220', '#3a302c', '#4a3e38'], edge: '#060404', mark: '#000000' },
  },
  golden: {
    raw: { lean: ['#7a3e04', '#b06a0e', '#e0961e', '#f8c040', '#ffe890'], fat: ['#f0d888', '#fcefc0', '#fffbe8', '#ffffff'], edge: '#4a2a02', mark: null },
    cooked: { lean: ['#6a3a06', '#9a5a0e', '#c8821a', '#eaa82c', '#ffd25a'], fat: ['#d09a30', '#f0c050', '#ffe28a', '#fff8d0'], edge: '#3a2004', mark: '#4a2604' },
    burnt: { lean: ['#140e0c', '#221816', '#302420', '#40322c'], fat: ['#2a2220', '#3a302c', '#4a3e38'], edge: '#060404', mark: '#000000' },
  },
  mushroom: {
    raw: { cap: ['#3e2414', '#5e3820', '#7e4e2c', '#a06a3e', '#c48c58'], crack: '#ecdcbc', gill: ['#a8885e', '#cab088', '#e2cca4'], stem: ['#b8a07a', '#d8c6a0', '#f0e6cc', '#fffaf0'], edge: '#24140a', mark: null },
    cooked: { cap: ['#22120a', '#3a200e', '#5a3216', '#7c4820', '#a0662e'], crack: '#d8b47c', gill: ['#7a5832', '#9a7444', '#b8925a'], stem: ['#8a643a', '#a8804e', '#c89e66', '#e2c08a'], edge: '#140a04', mark: '#1a0c04' },
    burnt: { cap: ['#100c0a', '#1c1614', '#2a221e', '#382e28'], crack: '#4a3e36', gill: ['#221a16', '#2e2420', '#3a2e28'], stem: ['#1e1814', '#2a221e', '#3a302a', '#4a3e36'], edge: '#060404', mark: '#000000' },
  },
  rice: {
    grain: ['#a8a090', '#ccc4b2', '#e6e0d2', '#f6f2ea', '#ffffff'],
    steel: ['#4a525e', '#6e7886', '#98a2b0', '#c4ccd8', '#e8eef6', '#ffffff'],
    edge: '#262c36',
  },
  lettuce: { leaf: ['#1a4a18', '#286a22', '#3e8c2e', '#62ae42', '#90cc5a', '#c4e888'], vein: '#e6f6c4', edge: '#0e2a0e' },
  chili: { body: ['#4a0608', '#86101a', '#c01e26', '#e8403a', '#ff8070'], stem: ['#1e4a14', '#3a7a22', '#68ae3e', '#9ad460'], edge: '#2a0204' },
};

// ---------------------------------------------------------------- 삼겹살 (고기 · 황금 고기)
function samgyeop(pal, state, seed = 1) {
  const g = new Canvas32();
  const [x0, x1, y0, y1] = [2, 29, 8, 24];
  const h = y1 - y0;
  // 결: 위에서부터 비계-살-비계-살-비계, 경계는 물결
  const layer = (x, y) => {
    const t = (y - y0 + Math.sin(x * 0.55 + seed) * 0.9 + Math.sin(x * 0.21) * 0.6) / h;
    if (t < 0.14) return 'fat';
    if (t < 0.42) return 'lean';
    if (t < 0.55) return 'fat';
    if (t < 0.88) return 'lean';
    return 'fat';
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // 둥근 모서리 + 위아래 가장자리 물결
      const wob = Math.round(Math.sin(x * 0.7 + seed) * 0.6);
      if (y < y0 + (wob > 0 ? 1 : 0) || y > y1 - (wob < 0 ? 1 : 0)) continue;
      const dx = Math.min(x - x0, x1 - x);
      const dy = Math.min(y - y0, y1 - y);
      if (dx + dy < 3 && dx < 3 && dy < 3 && dx * dx + dy * dy < 5) continue;
      const kind = layer(x, y);
      // 두께감: 위 가장자리 밝게, 아래 어둡게, 가운데 볼록
      const ny = ((y - y0) / h) * 2 - 1;
      const nx = ((x - x0) / (x1 - x0)) * 2 - 1;
      let l = (kind === 'fat' ? 0.62 : 0.46) + light(nx * 0.35, ny * 0.6, 0.75) * 0.45;
      if (dy === 0 && y <= y0 + 1) l += 0.25;
      if (y >= y1 - 1) l -= 0.3;
      if (dx === 0 && x <= x0 + 1) l += 0.08;
      // 살 속 잔 마블링
      if (kind === 'lean' && state !== 'burnt' && hash(x, y, seed) > 0.9) {
        g.set(x, y, pal.fat[1], pal.edge);
        continue;
      }
      g.set(x, y, shade(pal[kind], l, x, y), pal.edge);
    }
  }
  if (state !== 'raw') {
    // 석쇠 자국 (대각선 두 줄) + 바삭한 가장자리
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!g.get(x, y)) continue;
        const d = (x - (y - y0) * 0.8) % 9;
        if (d >= 3 && d < 5 && x > x0 + 2 && x < x1 - 2) g.set(x, y, pal.mark);
      }
    }
    if (state === 'cooked') {
      for (let x = x0 + 1; x < x1; x++) if (hash(x, 3, seed) > 0.55) g.set(x, y0 + 1, pal.fat[3]);
    }
  }
  // 윤기 (기름 반짝임)
  if (pal.sparkle && state !== 'burnt') {
    for (const [sx, sy] of [[4, 6], [27, 7], [25, 25], [3, 22]]) {
      g.set(sx, sy, '#ffffff');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.get(sx + dx, sy + dy)) g.set(sx + dx, sy + dy, '#fff4a0');
    }
  }
  if (state !== 'burnt') {
    const shine = state === 'raw' ? '#ffffff' : '#fff6d0';
    for (const [sx, sy] of [[6, y0 + 3], [7, y0 + 3], [12, y0 + 9], [21, y0 + 4], [22, y0 + 4]]) if (g.get(sx, sy)) g.set(sx, sy, shine);
  } else {
    for (const [sx, sy] of [[9, 14], [18, 19], [23, 12]]) g.set(sx, sy, '#ff6a1a');
  }
  return g.outline();
}

// ---------------------------------------------------------------- 표고버섯 (옆에서 본 모습)
function shiitake(pal, state) {
  const g = new Canvas32();
  const cx = 15.5;
  const capY = 13;
  const [rx, ry] = [13.5, 10];
  // 기둥
  for (let y = capY + 2; y <= 29; y++) {
    const half = 3.6 - (y - capY) * 0.04 + (y > 26 ? 0.6 : 0);
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const nx = (x + 0.5 - cx) / half;
      if (Math.abs(nx) > 1.05) continue;
      const l = 0.55 + light(nx, 0, Math.sqrt(Math.max(0, 1 - nx * nx))) * 0.5 - (y > 27 ? 0.15 : 0);
      g.set(x, y, shade(pal.stem, l, x, y), pal.edge);
    }
  }
  // 갓 아랫면 (주름)
  for (let y = capY + 1; y <= capY + 4; y++) {
    for (let x = 3; x <= 28; x++) {
      const nx = (x + 0.5 - cx) / rx;
      if (Math.abs(nx) > 0.96 - (y - capY - 1) * 0.07) continue;
      const gill = (x + (x > cx ? 1 : 0)) % 2 === 0 ? 1 : 0;
      g.set(x, y, pal.gill[Math.min(2, gill + (y === capY + 1 ? 1 : 0))], pal.edge);
    }
  }
  // 갓 윗면 (반구)
  for (let y = 1; y <= capY + 1; y++) {
    for (let x = 1; x <= 30; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - capY) / ry;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1 || ny > 0.12) continue;
      const nz = Math.sqrt(1 - r2);
      let l = 0.18 + light(nx, ny, nz) * 0.95;
      if (y >= capY) l -= 0.15;
      g.set(x, y, shade(pal.cap, l, x, y), pal.edge);
    }
  }
  // 갓의 흰 갈라짐 (화고 무늬)
  if (state !== 'burnt') {
    const cracks = [
      [[10, 5], [12, 7], [11, 9], [13, 10]],
      [[19, 4], [18, 6], [20, 8], [21, 10]],
      [[15, 3], [15, 5], [16, 7]],
      [[7, 9], [9, 10], [8, 12]],
      [[24, 8], [23, 10], [25, 11]],
    ];
    for (const path of cracks) {
      for (let k = 0; k < path.length - 1; k++) {
        const [ax, ay] = path[k];
        const [bx, by] = path[k + 1];
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let s = 0; s <= n; s++) {
          const x = Math.round(ax + ((bx - ax) * s) / n);
          const y = Math.round(ay + ((by - ay) * s) / n);
          if (g.get(x, y)) g.set(x, y, pal.crack);
        }
      }
    }
  }
  if (state !== 'raw') {
    // 석쇠 자국
    for (let y = 2; y <= capY; y++) {
      for (let x = 2; x <= 29; x++) {
        if (!g.get(x, y)) continue;
        const d = (x - y * 0.8 + 40) % 8;
        if (d >= 2 && d < 3.5 && x > 4 && x < 27 && y > 3) g.set(x, y, pal.mark);
      }
    }
  }
  if (state !== 'burnt') {
    const shine = state === 'raw' ? '#f0d8b0' : '#ffe0a8';
    for (const [sx, sy] of [[8, 5], [9, 4], [10, 4], [7, 6]]) if (g.get(sx, sy)) g.set(sx, sy, shine);
  } else {
    for (const [sx, sy] of [[12, 6], [20, 9]]) g.set(sx, sy, '#ff6a1a');
  }
  return g.outline();
}

// ---------------------------------------------------------------- 공깃밥 (스테인리스 공기)
function rice() {
  const g = new Canvas32();
  const P = PAL.rice;
  const cx = 15.5;
  // 그릇 몸통: 아래로 좁아지는 원통
  for (let y = 17; y <= 28; y++) {
    const half = 12.5 - (y - 17) * 0.5;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const nx = (x + 0.5 - cx) / half;
      if (Math.abs(nx) > 1) continue;
      // 금속: 세로 반사띠
      let l = 0.45 + light(nx, 0.2, Math.sqrt(1 - nx * nx)) * 0.45;
      if (nx > -0.62 && nx < -0.45) l = 0.98;
      if (nx > 0.55) l -= 0.2;
      if (y >= 27) l -= 0.25;
      g.set(x, y, shade(P.steel, l, x, y), P.edge);
    }
  }
  // 그릇 입구 테두리
  for (let x = 3; x <= 28; x++) {
    const nx = (x + 0.5 - cx) / 13;
    g.set(x, 16, P.steel[nx < -0.3 ? 5 : nx < 0.4 ? 4 : 3], P.edge);
    g.set(x, 17, P.steel[nx < 0 ? 3 : 2], P.edge);
  }
  // 밥: 수북한 반구 + 낟알
  for (let y = 3; y <= 16; y++) {
    for (let x = 2; x <= 29; x++) {
      const nx = (x + 0.5 - cx) / 13.5;
      const ny = (y + 0.5 - 16) / 12.5;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1 || ny > 0) continue;
      // 가장자리는 낟알 때문에 울퉁불퉁
      if (r2 > 0.9 && hash(x, y, 7) > 0.6) continue;
      const nz = Math.sqrt(1 - r2);
      let l = 0.35 + light(nx, ny, nz) * 0.75;
      // 낟알: 2×1 알갱이마다 아래쪽 한 픽셀에 그늘
      const gx = (x + (y % 2)) >> 1;
      const grain = hash(gx, y, 3);
      if (grain > 0.6) l -= 0.32;
      else if (grain < 0.12) l += 0.15;
      if (y === 16) l -= 0.2;
      g.set(x, y, shade(P.grain, l, x, y), '#5e584c');
    }
  }
  for (const [sx, sy] of [[9, 6], [10, 6], [8, 8], [13, 5]]) if (g.get(sx, sy)) g.set(sx, sy, '#ffffff');
  return g.outline();
}

// ---------------------------------------------------------------- 상추
function lettuce() {
  const g = new Canvas32();
  const P = PAL.lettuce;
  const [cx, cy] = [15.5, 15];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const th = Math.atan2(dy, dx);
      // 주름진 잎 가장자리
      const R = (dy > 0 ? 12.5 : 14) * (1 + 0.07 * Math.sin(th * 11) + 0.04 * Math.sin(th * 5 + 1));
      const r = Math.hypot(dx * 1.05, dy);
      if (r > R || y > 29) continue;
      const t = r / R;
      // 가운데는 연하고 가장자리로 갈수록 진하게, 주름 그늘
      let l = 0.95 - t * 0.55 + light(dx / 16, dy / 16, 0.6) * 0.25;
      l += 0.12 * Math.sin(th * 11 + t * 3) * t;
      g.set(x, y, shade(P.leaf, l, x, y), P.edge);
    }
  }
  // 잎맥: 가운데 줄기 + 곁맥
  for (let y = 4; y <= 29; y++) {
    const x = Math.round(cx - 0.5 + Math.sin(y * 0.25) * 0.6);
    g.set(x, y, P.vein);
    if (y > 24) g.set(x + 1, y, P.vein);
  }
  for (const [sy, dir] of [[9, -1], [9, 1], [14, -1], [14, 1], [19, -1], [19, 1], [23, -1], [23, 1]]) {
    for (let k = 1; k < 9; k++) {
      const x = Math.round(cx - 0.5 + dir * k);
      const y = sy - Math.round(k * 0.6);
      if (g.get(x, y)) g.set(x, y, k < 6 ? P.leaf[5] : P.leaf[4]);
    }
  }
  return g.outline();
}

// ---------------------------------------------------------------- 청양고추
function chili() {
  const g = new Canvas32();
  const P = PAL.chili;
  // 휘어진 몸통: 2차 베지어 (꼭지 → 끝)
  const [a, b, c] = [[22, 6], [26, 22], [7, 28]];
  for (let s = 0; s <= 120; s++) {
    const t = s / 120;
    const px = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0];
    const py = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1];
    const rad = 3.8 * (1 - t * 0.78);
    for (let y = Math.floor(py - rad); y <= Math.ceil(py + rad); y++) {
      for (let x = Math.floor(px - rad); x <= Math.ceil(px + rad); x++) {
        const dx = (x + 0.5 - px) / rad;
        const dy = (y + 0.5 - py) / rad;
        const r2 = dx * dx + dy * dy;
        if (r2 > 1) continue;
        const l = 0.3 + light(dx, dy, Math.sqrt(1 - r2)) * 0.75;
        if (!g.get(x, y) || l > 0) g.set(x, y, shade(P.body, l, x, y), P.edge);
      }
    }
  }
  // 반짝이는 띠
  for (let s = 8; s <= 70; s += 2) {
    const t = s / 120;
    const px = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0];
    const py = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1];
    const rad = 3.8 * (1 - t * 0.78);
    const x = Math.round(px - rad * 0.45);
    const y = Math.round(py - rad * 0.45);
    if (g.get(x, y)) g.set(x, y, s < 40 ? '#ffd0c4' : P.body[4]);
  }
  // 꼭지와 줄기
  for (let y = 2; y <= 8; y++) {
    for (let x = 17; x <= 27; x++) {
      const d = Math.hypot((x - 22) / 4.6, (y - 6.5) / 2.2);
      if (d < 1) g.set(x, y, shade(P.stem, 0.9 - d * 0.6 - (y - 3) * 0.05, x, y), '#0e2a08');
    }
  }
  for (const [sx, sy] of [[22, 2], [22, 1], [23, 0], [24, 0]]) g.set(sx, sy, P.stem[2], '#0e2a08');
  return g.outline();
}

// ---------------------------------------------------------------- 내보내기
export function buildFoodPixels() {
  const out = { rice: rice(), lettuce: lettuce(), chili: chili(), meat: {}, golden: {}, mushroom: {} };
  for (const st of ['raw', 'cooked', 'burnt']) {
    out.meat[st] = samgyeop(PAL.meat[st], st, 1);
    out.golden[st] = samgyeop({ ...PAL.golden[st], sparkle: true }, st, 2);
    out.mushroom[st] = shiitake(PAL.mushroom[st], st);
  }
  return out;
}

export function toCanvas(px, doc = globalThis.document) {
  const c = doc.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const t = c.getContext('2d');
  px.c.forEach((col, i) => {
    if (!col) return;
    t.fillStyle = col;
    t.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1);
  });
  return c;
}
