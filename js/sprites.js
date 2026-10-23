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
  face: [
    '................',
    '....oooooooo....',
    '...oSSSSSSSSo...',
    '..oHHHHHHHHHHo..',
    '..oHHHHHHHHHHoH.',
    '..oSSSSSSSSSSo.H',
    '..oSSeSSSSeSSo..',
    '..oSSeSSSSeSSo..',
    '..oSpSSSSSSpSo..',
    '..oSSSSMMSSSSo..',
    '...oSSSSSSSSo...',
    '....oooooooo....',
    '...oTTTTTTTTo...',
    '..oTTTTTTTTTTo..',
    '.oTTTTTTTTTTTTo.',
    '.oTTTTTTTTTTTTo.',
  ],
};

// 입 벌린 얼굴: 9~10번 줄만 다르다
SPRITE_ROWS.faceOpen = SPRITE_ROWS.face.map((r, i) =>
  i === 9 ? '..oSSSSmmSSSSo..' : i === 10 ? '...oSSSmmSSSo...' : r,
);
// 지친 얼굴(수치 위험): 눈이 X, 땀
SPRITE_ROWS.faceTired = SPRITE_ROWS.face.map((r, i) =>
  i === 6 ? '..oSeSeSSeSeSo..' : i === 7 ? '..oSSeSSSSeSSod.' : i === 8 ? '..oSeSeSSeSeSod.' : r,
);

const OUTLINE = '#2b1d1a';

export const PALETTES = {
  rice: { w: '#f7f3e8', k: '#d6cfbc', o: '#1f2a44', B: '#4a73b5', L: '#8fb2ea', D: '#2f5290' },
  lettuce: { o: '#1f3d1c', L: '#6cc04a', l: '#b6e88c', W: '#e8f0d0' },
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
  player: [
    { o: OUTLINE, S: '#f2c09a', e: '#2a1a14', p: '#ee8f7e', H: '#e84a4a', T: '#c43a3a', M: '#a33a2a', m: '#3a1010', d: '#7ec8f0' },
    { o: OUTLINE, S: '#f2c09a', e: '#2a1a14', p: '#ee8f7e', H: '#3f86e8', T: '#2f62b8', M: '#a33a2a', m: '#3a1010', d: '#7ec8f0' },
  ],
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

export function buildSprites() {
  const s = {
    rice: makeSprite(SPRITE_ROWS.rice, PALETTES.rice),
    lettuce: makeSprite(SPRITE_ROWS.lettuce, PALETTES.lettuce),
    faces: PALETTES.player.map((pal) => ({
      idle: makeSprite(SPRITE_ROWS.face, pal),
      open: makeSprite(SPRITE_ROWS.faceOpen, pal),
      tired: makeSprite(SPRITE_ROWS.faceTired, pal),
    })),
  };
  for (const id of ['meat', 'mushroom']) {
    s[id] = {};
    for (const st of ['raw', 'cooked', 'burnt']) s[id][st] = makeSprite(SPRITE_ROWS[id], PALETTES[id][st]);
  }
  // 접시 위에 놓인 고기·버섯은 날것
  s.plateFood = [s.rice, s.meat.raw, s.mushroom.raw, s.lettuce];
  return s;
}
