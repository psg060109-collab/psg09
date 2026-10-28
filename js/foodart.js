// 탑뷰(위에서 내려다본) 음식 도트. 손으로 찍는 대신 모양·명암 규칙으로 그린다.
// - 빛은 왼쪽 위에서 온다
// - 색은 음식마다 정한 단계(ramp) 안에서만 고르고, 단계 경계는 4×4 디더링으로 섞는다
// - 마지막에 바깥 테두리를 이웃 색보다 어두운 색으로 두른다 (selective outline)
// DOM 없이 픽셀 배열만 만든다. toCanvas()로 캔버스로 바꾼다.

export const SIZE = 44;
const N = SIZE;
const C0 = (N - 1) / 2; // 가운데

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
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
  const f = clamp((v - i - 0.5) * 2.4 + 0.5);
  const t = (BAYER[y & 3][x & 3] + 0.5) / 16;
  return ramp[Math.min(ramp.length - 1, f > t ? i + 1 : i)];
}

// 위에서 본 표면: 왼쪽 위가 밝다
function light(nx, ny, nz) {
  return -0.42 * nx - 0.5 * ny + 0.76 * nz;
}

class Px {
  constructor() {
    this.c = new Array(N * N).fill(null);
    this.o = new Array(N * N).fill(null);
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < N && y < N;
  }
  set(x, y, col, outline) {
    if (!this.in(x, y) || !col) return;
    const i = y * N + x;
    this.c[i] = col;
    if (outline) this.o[i] = outline;
  }
  get(x, y) {
    return this.in(x, y) ? this.c[y * N + x] : null;
  }
  // 칠한 픽셀이 가장자리(이웃이 비어 있음)인지
  edge(x, y) {
    return [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => !this.get(x + dx, y + dy));
  }
  outline() {
    const add = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (this.get(x, y)) continue;
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          if (this.in(x + dx, y + dy) && this.c[(y + dy) * N + x + dx]) {
            const i = (y + dy) * N + x + dx;
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

// 가운데 기준으로 돌린 좌표
function rot(x, y, a) {
  const dx = x - C0;
  const dy = y - C0;
  return [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
}

// ---------------------------------------------------------------- 팔레트
const PAL = {
  meat: {
    raw: { lean: ['#6a1622', '#962636', '#c23c4c', '#e2606c', '#f89098'], fat: ['#c8a8a4', '#e4d0cc', '#f6eae8', '#ffffff'], edge: '#3e0a12', mark: null, crisp: null },
    cooked: { lean: ['#4a1e0c', '#6e3414', '#9a4e1c', '#c4702a', '#e49444'], fat: ['#b0782c', '#d6a046', '#f0c468', '#fde6a4'], edge: '#2a1004', mark: '#2a1004', crisp: '#5a2a0e' },
    burnt: { lean: ['#120c0a', '#1e1614', '#2c221e', '#3a2e28'], fat: ['#241c1a', '#342a26', '#463a34'], edge: '#050303', mark: '#000000', crisp: '#0a0606' },
  },
  golden: {
    raw: { lean: ['#7a3e04', '#ac680c', '#da941c', '#f6c03c', '#ffe68a'], fat: ['#ecd28a', '#faecbc', '#fffae6', '#ffffff'], edge: '#4a2802', mark: null, crisp: null },
    cooked: { lean: ['#6a3604', '#9a580c', '#c88018', '#eca82a', '#ffd458'], fat: ['#d09a2e', '#f0c04e', '#ffe08a', '#fff6cc'], edge: '#3a1e02', mark: '#4a2402', crisp: '#8a5208' },
    burnt: { lean: ['#120c0a', '#1e1614', '#2c221e', '#3a2e28'], fat: ['#241c1a', '#342a26', '#463a34'], edge: '#050303', mark: '#000000', crisp: '#0a0606' },
  },
  mushroom: {
    raw: { cap: ['#3a2010', '#583218', '#784624', '#985e34', '#b87a4a', '#d49c6c'], crack: ['#c8b08a', '#e6d4b2', '#f8eedc'], rim: '#2a160a', edge: '#1e1006', mark: null },
    cooked: { cap: ['#1e0e06', '#34180a', '#4e2610', '#6c3818', '#8c4e22', '#ac6a32'], crack: ['#9a7448', '#c09a64', '#dcbc84'], rim: '#140804', edge: '#0e0602', mark: '#120802' },
    burnt: { cap: ['#0c0908', '#16110e', '#201a16', '#2c241e', '#382e26'], crack: ['#3a302a', '#4a3e36', '#564a40'], rim: '#060404', edge: '#030202', mark: '#000000' },
  },
  rice: {
    grain: ['#a29a8a', '#c6beac', '#e2dccc', '#f2eee4', '#fcfaf4', '#ffffff'],
    steel: ['#3e4652', '#5e6874', '#86909e', '#b0bac6', '#d6dee8', '#f4f8fc'],
    edge: '#22282e',
  },
  lettuce: { leaf: ['#16421a', '#22601e', '#367e28', '#529e36', '#7abc48', '#a8d866', '#d0ee98'], vein: '#e8f6c8', edge: '#0c260c' },
  chili: { body: ['#420406', '#7a0c14', '#b0181e', '#dc3630', '#f86a58', '#ffb0a0'], stem: ['#1a4210', '#2e6a1c', '#4e9430', '#7cc04c', '#aee07a'], edge: '#260204' },
};

// ---------------------------------------------------------------- 삼겹살: 위에서 본 납작한 한 줄
function samgyeop(pal, state, angle, seed, sparkle = false) {
  const g = new Px();
  const half = { u: 19.5, v: 8.5 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const [u0, v0] = rot(x, y, angle);
      // 살짝 휘고 양끝이 울퉁불퉁한 띠
      const v = v0 - Math.sin((u0 / half.u) * Math.PI * 0.5) * 1.4;
      const endWob = Math.sin(v * 0.9 + seed) * 1.2;
      const sideWob = Math.sin(u0 * 0.55 + seed * 2) * 0.6;
      if (Math.abs(u0) > half.u + endWob || Math.abs(v) > half.v + sideWob) continue;
      // 모서리 둥글게
      const cu = Math.max(0, Math.abs(u0) - (half.u - 3));
      const cv = Math.max(0, Math.abs(v) - (half.v - 3));
      if (cu * cu + cv * cv > 9.5) continue;

      // 결: 비계-살-비계-살-비계 (긴 방향으로 이어지는 줄무늬)
      const t = (v + half.v) / (2 * half.v) + Math.sin(u0 * 0.35 + seed) * 0.035 + Math.sin(u0 * 0.9) * 0.015;
      let kind = 'lean';
      if (t < 0.17 || (t > 0.43 && t < 0.56) || t > 0.86) kind = 'fat';

      // 위에서 본 납작한 면: 거의 평평하게, 가장자리만 살짝 둥글게
      const nu = clamp(Math.abs(u0) / (half.u + 1)) * Math.sign(u0);
      const nv = clamp(v / (half.v + 1));
      const nx = nu * nu * nu * Math.sign(nu) * 0.8;
      const ny = nv * nv * nv * Math.sign(nv) * 0.8 + nv * 0.15;
      let l = (kind === 'fat' ? 0.55 : 0.42) + light(nx, ny, Math.sqrt(clamp(1 - nx * nx - ny * ny))) * 0.4;
      // 살 속 잔 마블링
      if (kind === 'lean' && state !== 'burnt' && hash(x, y, seed) > 0.88) {
        g.set(x, y, pal.fat[state === 'raw' ? 1 : 2], pal.edge);
        continue;
      }
      g.set(x, y, shade(pal[kind], l, x, y), pal.edge);
    }
  }
  if (state !== 'raw') {
    // 바삭하게 그을린 가장자리 + 석쇠 자국
    const snapshot = g.c.slice();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!snapshot[y * N + x]) continue;
        if (g.edge(x, y) && hash(x, y, 9) > 0.35) g.set(x, y, pal.crisp);
        const [u] = rot(x, y, angle);
        const d = (((u - y * 0.15) % 10) + 10) % 10;
        if (d < 2 && Math.abs(u) < 17 && !g.edge(x, y)) g.set(x, y, pal.mark);
      }
    }
  }
  // 윤기 (기름 반짝임) / 탄 불씨
  if (state !== 'burnt') {
    const shine = state === 'raw' ? '#ffffff' : '#fff4c8';
    for (const [du, dv] of [[-12, -4], [-11, -4], [-10, -4], [-3, 2], [-2, 2], [8, -5], [9, -5], [13, 3]]) {
      const x = Math.round(C0 + du * Math.cos(angle) - dv * Math.sin(angle));
      const y = Math.round(C0 + du * Math.sin(angle) + dv * Math.cos(angle));
      if (g.get(x, y) && !g.edge(x, y)) g.set(x, y, shine);
    }
  } else {
    for (const [x, y] of [[12, 18], [24, 24], [30, 19], [17, 26]]) if (g.get(x, y)) g.set(x, y, '#ff6a1a');
  }
  if (sparkle && state !== 'burnt') {
    for (const [sx, sy] of [[4, 9], [39, 12], [36, 35], [6, 33]]) {
      g.set(sx, sy, '#ffffff');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.get(sx + dx, sy + dy)) g.set(sx + dx, sy + dy, '#fff2a0');
    }
  }
  return g.outline();
}

// ---------------------------------------------------------------- 표고버섯: 위에서 본 동그란 갓 + 화고 갈라짐
function shiitake(pal, state) {
  const g = new Px();
  const R = 17.5;
  // 갈라짐 무늬: 무작위 점들 사이의 경계선 (보로노이)
  const pts = Array.from({ length: 16 }, (_, k) => {
    const a = hash(k, 1, 5) * Math.PI * 2;
    const r = Math.sqrt(hash(k, 2, 5)) * R * 0.85;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - C0;
      const dy = y - C0;
      const th = Math.atan2(dy, dx);
      const rr = R * (1 + 0.035 * Math.sin(th * 7 + 1) + 0.02 * Math.sin(th * 3));
      const r = Math.hypot(dx, dy);
      if (r > rr) continue;
      const t = r / rr;
      // 납작한 돔: 가운데 볼록, 가장자리는 안으로 말림
      const nx = (dx / rr) * 0.85;
      const ny = (dy / rr) * 0.85;
      let l = 0.2 + light(nx, ny, Math.sqrt(clamp(1 - nx * nx - ny * ny))) * 0.85;
      if (t > 0.9) l -= 0.25; // 말린 테두리 그늘
      let col = shade(pal.cap, l, x, y);
      // 화고 갈라짐 (가장자리 근처는 없음)
      if (t < 0.84 && state !== 'burnt') {
        let d1 = 1e9;
        let d2 = 1e9;
        for (const [px, py] of pts) {
          const d = Math.hypot(dx - px, dy - py);
          if (d < d1) [d1, d2] = [d, d1];
          else if (d < d2) d2 = d;
        }
        const w = 0.9 + (1 - t) * 0.5;
        if (d2 - d1 < w) col = shade(pal.crack, 0.4 + light(nx, ny, 0.8) * 0.7, x, y);
      }
      g.set(x, y, col, pal.edge);
    }
  }
  // 갓 가장자리 (안으로 말린 테두리 선)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!g.get(x, y)) continue;
      const r = Math.hypot(x - C0, y - C0);
      if (r > R * 0.93 && r < R * 0.97 && hash(x, y, 3) > 0.3) g.set(x, y, pal.rim);
    }
  }
  if (state !== 'raw') {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!g.get(x, y) || g.edge(x, y)) continue;
        const d = (((x - y * 0.8) % 9) + 9) % 9;
        if (d < 1.6 && Math.hypot(x - C0, y - C0) < R * 0.85) g.set(x, y, pal.mark);
      }
    }
  }
  if (state !== 'burnt') {
    const shine = state === 'raw' ? '#f4dcb4' : '#ffe2a8';
    for (const [x, y] of [[13, 12], [14, 11], [15, 11], [12, 13], [16, 10]]) if (g.get(x, y)) g.set(x, y, shine);
  } else {
    for (const [x, y] of [[17, 20], [26, 15], [22, 28]]) g.set(x, y, '#ff6a1a');
  }
  return g.outline();
}

// ---------------------------------------------------------------- 공깃밥: 위에서 본 스테인리스 공기 + 밥
function rice() {
  const g = new Px();
  const P = PAL.rice;
  const RO = 20.5; // 그릇 바깥
  const RI = 17; // 밥
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - C0;
      const dy = y - C0;
      const r = Math.hypot(dx, dy);
      if (r > RO) continue;
      if (r > RI) {
        // 금속 테두리: 왼쪽 위 반사, 오른쪽 아래 어둡게
        const th = Math.atan2(dy, dx);
        const ring = (r - RI) / (RO - RI);
        let l = 0.55 - 0.35 * Math.cos(th + Math.PI * 0.75) + (ring < 0.35 ? 0.15 : ring > 0.75 ? -0.15 : 0);
        if (Math.abs(th + Math.PI * 0.72) < 0.18) l = 1; // 반짝 띠
        g.set(x, y, shade(P.steel, l, x, y), P.edge);
        continue;
      }
      // 밥: 수북한 돔 + 낟알
      const nx = dx / RI;
      const ny = dy / RI;
      const nz = Math.sqrt(clamp(1 - nx * nx - ny * ny));
      let l = 0.3 + light(nx, ny, nz) * 0.75;
      // 낟알: 줄마다 어긋나게 놓인 3×2 알갱이, 알갱이 사이 틈에만 그늘
      const row = Math.floor(y / 2);
      const off = Math.floor(hash(row, 0, 13) * 3);
      const col = Math.floor((x + off + (row % 2) * 2) / 3);
      const gx = (x + off + (row % 2) * 2) % 3;
      const gap = gx === 2 && hash(col, row, 17) > 0.25;
      if (gap || (y % 2 === 1 && hash(col, row, 19) > 0.55)) l -= 0.18;
      else if (gx === 0 && y % 2 === 0) l += 0.08;
      if (r > RI - 1.5) l -= 0.25; // 그릇 안쪽 그늘
      g.set(x, y, shade(P.grain, l, x, y), P.edge);
    }
  }
  for (const [x, y] of [[15, 14], [16, 14], [14, 15], [18, 13]]) g.set(x, y, '#ffffff');
  return g.outline();
}

// ---------------------------------------------------------------- 상추: 위에서 본 주름진 잎
function lettuce() {
  const g = new Px();
  const P = PAL.lettuce;
  const [cx, cy] = [C0, C0 - 1];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const th = Math.atan2(dy, dx);
      const base = dy > 0 ? 17 : 20.5;
      const R = base * (1 + 0.075 * Math.sin(th * 13) + 0.045 * Math.sin(th * 5 + 1));
      const r = Math.hypot(dx * 1.06, dy);
      if (r > R || y > N - 2) continue;
      const t = r / R;
      // 가운데(줄기 쪽)는 연하고, 가장자리로 갈수록 진하게 + 주름 그늘
      let l = 0.98 - t * 0.6 + light(dx / 24, dy / 24, 0.55) * 0.22;
      l += 0.14 * Math.sin(th * 13 + t * 4) * t;
      l += 0.06 * Math.sin(dx * 0.8 + dy * 0.5);
      g.set(x, y, shade(P.leaf, l, x, y), P.edge);
    }
  }
  // 잎맥: 가운데 줄기(굵게) + 곁맥
  for (let y = 5; y < N - 1; y++) {
    const x = Math.round(cx + Math.sin(y * 0.2) * 0.7);
    if (!g.get(x, y)) continue;
    g.set(x, y, P.vein);
    if (y > 26) g.set(x + 1, y, P.vein);
    if (y > 34) g.set(x - 1, y, P.leaf[6]);
  }
  for (const [sy, dir] of [[11, -1], [11, 1], [17, -1], [17, 1], [23, -1], [23, 1], [29, -1], [29, 1], [34, -1], [34, 1]]) {
    for (let k = 1; k < 13; k++) {
      const x = Math.round(cx + dir * k);
      const y = sy - Math.round(k * 0.55);
      if (g.get(x, y) && !g.edge(x, y)) g.set(x, y, k < 8 ? P.leaf[6] : P.leaf[5]);
    }
  }
  return g.outline();
}

// ---------------------------------------------------------------- 청양고추
function chili() {
  const g = new Px();
  const P = PAL.chili;
  const bez = (t, a, b, c) => [
    (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0],
    (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1],
  ];
  const [a, b, c] = [[31, 9], [36, 30], [9, 38]];
  for (let s = 0; s <= 160; s++) {
    const t = s / 160;
    const [px, py] = bez(t, a, b, c);
    const rad = 5 * (1 - t * 0.8);
    for (let y = Math.floor(py - rad); y <= Math.ceil(py + rad); y++) {
      for (let x = Math.floor(px - rad); x <= Math.ceil(px + rad); x++) {
        const dx = (x - px) / rad;
        const dy = (y - py) / rad;
        const r2 = dx * dx + dy * dy;
        if (r2 > 1) continue;
        const l = 0.28 + light(dx, dy, Math.sqrt(1 - r2)) * 0.8;
        g.set(x, y, shade(P.body, l, x, y), P.edge);
      }
    }
  }
  for (let s = 10; s <= 100; s += 2) {
    const t = s / 160;
    const [px, py] = bez(t, a, b, c);
    const rad = 5 * (1 - t * 0.8);
    g.set(Math.round(px - rad * 0.45), Math.round(py - rad * 0.45), s < 55 ? P.body[5] : P.body[4]);
  }
  // 꼭지 + 줄기
  for (let y = 2; y <= 12; y++) {
    for (let x = 23; x <= 39; x++) {
      const d = Math.hypot((x - 31) / 6.5, (y - 9) / 3);
      if (d < 1) g.set(x, y, shade(P.stem, 0.95 - d * 0.6 - (y - 6) * 0.04, x, y), '#0c2606');
    }
  }
  for (const [x, y] of [[31, 4], [31, 3], [32, 2], [33, 1], [34, 1]]) g.set(x, y, P.stem[3], '#0c2606');
  return g.outline();
}

// ---------------------------------------------------------------- 내보내기
export function buildFoodPixels() {
  const out = { rice: rice(), lettuce: lettuce(), chili: chili(), meat: {}, golden: {}, mushroom: {} };
  for (const st of ['raw', 'cooked', 'burnt']) {
    out.meat[st] = samgyeop(PAL.meat[st], st, -0.22, 1);
    out.golden[st] = samgyeop(PAL.golden[st], st, 0.2, 2, true);
    out.mushroom[st] = shiitake(PAL.mushroom[st], st);
  }
  return out;
}

export function toCanvas(px, doc = globalThis.document) {
  const size = px.size || N;
  const c = doc.createElement('canvas');
  c.width = size;
  c.height = size;
  const t = c.getContext('2d');
  px.c.forEach((col, i) => {
    if (!col) return;
    t.fillStyle = col;
    t.fillRect(i % size, Math.floor(i / size), 1, 1);
  });
  return c;
}

// 작은 아이콘용: 2×2 칸을 한 픽셀로 (불투명 픽셀이 2개 이상일 때만, 색은 평균)
export function halve(px) {
  const M = N / 2;
  const out = { size: M, c: new Array(M * M).fill(null) };
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      const cols = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const col = px.c[(y * 2 + dy) * N + x * 2 + dx];
        if (col) cols.push(hex(col));
      }
      if (cols.length < 2) continue;
      const avg = [0, 1, 2].map((k) => Math.round(cols.reduce((a, c) => a + c[k], 0) / cols.length));
      out.c[y * M + x] = `#${avg.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return out;
}
