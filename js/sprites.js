import { buildFoodPixels, toCanvas, halve } from './foodart.js';

// 16×16 도트 스프라이트. 문자 한 개 = 픽셀 한 개, '.'은 투명.

export const SPRITE_ROWS = {
  rice: [
    '................',
    '................',
    '......wwww......',
    '....wwwwwwww....',
    '...wwwwwwkwww...',
    '..wwwkwwwwwwww..',
    '..wwwwwwwwwkww..',
    '.oooooooooooooo.',
    '.oBBBBBBBBBBBBo.',
    '.oBLBBBBBBBBBBo.',
    '..oBBBBBBBBBBo..',
    '..oBBDBBDBBDBo..',
    '...oBBBBBBBBo...',
    '....oooooooo....',
    '.....oBBBBo.....',
    '.....oooooo.....',
  ],
  meat: [
    '................',
    '................',
    '....oooooo......',
    '...oRRRRRRooo...',
    '..oRRRRRFRRRRo..',
    '..oRRRRFRRRRRRo.',
    '.oRRRRFRRRRRRRo.',
    '.oRRRFRRRRRFRRo.',
    '.oRRRRRRRRFRRRo.',
    '.oRRRRRRRFRRRo..',
    '.oRRRRRRRRRRRo..',
    '..oFFFFFFFFFo...',
    '...oFFFFFFFo....',
    '....ooooooo.....',
    '................',
    '................',
  ],
  mushroom: [
    '................',
    '.....oooooo.....',
    '...ooCCCCCCoo...',
    '..oCCcCCCCcCCo..',
    '.oCCCCCCcCCCCCo.',
    '.oCcCCCCCCCCcCo.',
    'oCCCCCcCCCCCCCCo',
    'oCCCCCCCCCCcCCCo',
    '.ooggggggggggoo.',
    '....oSSSSSSo....',
    '....oSSSSSSo....',
    '....oSsSSSSo....',
    '....oSSSSsSo....',
    '....oSSSSSSo....',
    '.....oooooo.....',
    '................',
  ],
  chili: [
    '................',
    '..........ggg...',
    '.........gg.....',
    '........oGGo....',
    '.......oRRRRo...',
    '......oRRrRRo...',
    '.....oRRrRRo....',
    '....oRRrRRo.....',
    '...oRRrRRo......',
    '..oRRRRRo.......',
    '..oRRRRo........',
    '.oRRRRo.........',
    '.oRRRo..........',
    '.ooo............',
    '................',
    '................',
  ],
  lettuce: [
    '................',
    '......oooo......',
    '....ooLLLLoo....',
    '...oLLLlLLLLo...',
    '..oLLLLlLLLLLo..',
    '.oLLlLLlLLlLLLo.',
    '.oLLLlLlLlLLLLo.',
    'oLLLLLllLLLLLLLo',
    'oLLlLLLlLLLlLLLo',
    '.oLLLlLlLlLLLLo.',
    '.oLLLLLlLLLLLo..',
    '..oLLLLlLLLLo...',
    '...ooLLlLLoo....',
    '.....ooWoo......',
    '.......Wo.......',
    '................',
  ],
};

export const PALETTES = {
  rice: { w: '#f7f3e8', k: '#d6cfbc', o: '#1f2a44', B: '#4a73b5', L: '#8fb2ea', D: '#2f5290' },
  lettuce: { o: '#1f3d1c', L: '#6cc04a', l: '#b6e88c', W: '#e8f0d0' },
  chili: { o: '#3a0a0a', R: '#e8262e', r: '#ff8a7a', g: '#3e8a2a', G: '#5cb83a' },
  golden: {
    raw:    { o: '#6a4a10', R: '#f2c14e', F: '#fff3c0', mark: null },
    cooked: { o: '#5a3408', R: '#e0a020', F: '#fff0a0', mark: '#9a6008' },
    burnt:  { o: '#0e0b0b', R: '#2e2626', F: '#4a3e3a', mark: '#161111' },
  },
  meat: {
    raw:    { o: '#4a1820', R: '#e0505e', F: '#f6c8c4', mark: null },
    cooked: { o: '#3a1f12', R: '#9a5530', F: '#e0a464', mark: '#4f2914' },
    burnt:  { o: '#0e0b0b', R: '#2e2626', F: '#4a3e3a', mark: '#161111' },
  },
  mushroom: {
    raw:    { o: '#3b2a1e', C: '#c99a6b', c: '#efd9b8', g: '#8a6a4a', S: '#f4eee0', s: '#d8cfbc', mark: null },
    cooked: { o: '#2a170c', C: '#8a5a32', c: '#c08a52', g: '#5a3a20', S: '#dcc49a', s: '#b89a70', mark: '#4a2a14' },
    burnt:  { o: '#0e0b0b', C: '#2a2222', c: '#3e3434', g: '#1a1414', S: '#3a3232', s: '#2a2424', mark: '#141010' },
  },
};

export function validateRows(rows) {
  return rows.length === 16 && rows.every((r) => r.length === 16);
}

// 굽힌 음식은 대각선 석쇠 자국을 찍는다
function pixelColor(ch, x, y, pal) {
  if (ch === '.') return null;
  if (pal.mark && (ch === 'R' || ch === 'C') && (x - y + 32) % 5 === 0) return pal.mark;
  return pal[ch] || null;
}

export function makeSprite(rows, pal, doc = globalThis.document) {
  const c = doc.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const col = pixelColor(row[x], x, y, pal);
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  return c;
}

// 음식은 모두 탑뷰. 큰 그림(접시·불판·앞접시)은 44×44, 작은 아이콘(수치판·안내·결과)은 그걸 줄인 22×22
export function buildSprites() {
  const f = buildFoodPixels();
  const small = (px) => toCanvas(halve(px));
  const icon = {
    rice: small(f.rice),
    lettuce: small(f.lettuce),
    meat: small(f.meat.cooked),
    rawMeat: small(f.meat.raw),
    mushroom: small(f.mushroom.raw),
  };
  icon.plateFood = [icon.rice, icon.rawMeat, icon.mushroom, icon.lettuce];

  const s = { icon, rice: toCanvas(f.rice), lettuce: toCanvas(f.lettuce), chili: toCanvas(f.chili) };
  for (const id of ['meat', 'mushroom', 'golden']) {
    s[id] = {};
    for (const st of ['raw', 'cooked', 'burnt']) s[id][st] = toCanvas(f[id][st]);
  }
  // 접시 위에 놓인 고기·버섯은 날것
  s.plateFood = [s.rice, s.meat.raw, s.mushroom.raw, s.lettuce];
  return s;
}
