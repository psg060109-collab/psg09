// 기획서 ⑥ 완료 기준 — 핵심 규칙 · 경쟁 요소 · 피버 · 밸런스 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, FOODS, decayRate } from '../js/config.js';
import { createGame, step, pressFood, pressSlot, feverWarning, comboMul } from '../js/game.js';
import { SPRITE_ROWS, validateRows } from '../js/sprites.js';
import { buildFoodPixels, SIZE, STAGES } from '../js/foodart.js';
import { lookup, GAME_CODES } from '../js/input.js';
import { qualifies, insertRanking, loadRanking, saveRanking } from '../js/ranking.js';
import { summarize, vsCpu } from '../sim/simulate.mjs';
import { createCpu, LEVELS, BOTS, rulesFor } from '../js/ai.js';
import { mulberry32 as mulberry } from '../js/game.js';

const DT = 1 / 60;
const RICE = 0, MEAT = 1, MUSH = 2, LETTUCE = 3;

// 기본 규칙 테스트는 피버·특수 음식을 끄고 본다
function newGame(opts = {}) {
  return createGame({ seed: 42, feverEnabled: false, specialsEnabled: false, ...opts });
}
function run(g, sec) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) step(g, DT);
}
// 감소 없이 시간만 흘리고 싶을 때 수치를 꽉 채워 둔다
function topUp(g) {
  for (const p of g.players) for (const s in p.stats) p.stats[s] = 100;
}
function item(food, state, extra = {}) {
  const cookTime = FOODS[food].cookTime;
  return { food, golden: false, state, progress: state === 'raw' ? 0 : cookTime, cookTime, cookedFor: 0, burntFor: 0, owner: 0, ...extra };
}

test('스프라이트는 모두 16×16', () => {
  for (const [name, rows] of Object.entries(SPRITE_ROWS)) assert.ok(validateRows(rows), name);
});

test('음식 도트(탑뷰 44×44)는 모두 그려지고, 굽기 6단계가 모두 서로 다르다', () => {
  const f = buildFoodPixels();
  const filled = (px) => px.c.filter(Boolean).length;
  for (const px of [f.rice, f.lettuce, f.chili, ...['meat', 'golden', 'mushroom'].flatMap((k) => Object.values(f[k]))]) {
    assert.equal(px.c.length, SIZE * SIZE);
    assert.ok(filled(px) > 300, '너무 작게 그려짐');
  }
  for (const k of ['meat', 'golden', 'mushroom']) {
    const looks = STAGES.map(([st]) => f[k][st].c.join());
    assert.equal(new Set(looks).size, STAGES.length, k);
  }
  // 같은 입력이면 항상 같은 그림 (무작위 아님)
  assert.equal(buildFoodPixels().meat.cooked.c.join(), f.meat.cooked.c.join());
});

test('키: QWER = 접시, Shift+QWER = 불판 윗줄 1~4, Shift+UIOP = 아랫줄 5~8', () => {
  assert.deepEqual(lookup('KeyQ'), { kind: 'plate', index: RICE });
  assert.deepEqual(lookup('KeyR'), { kind: 'plate', index: LETTUCE });
  assert.deepEqual(lookup('KeyQ', true), { kind: 'slot', index: 0 });
  assert.deepEqual(lookup('KeyR', true), { kind: 'slot', index: 3 });
  assert.deepEqual(lookup('KeyU', true), { kind: 'slot', index: 4 });
  assert.deepEqual(lookup('KeyP', true), { kind: 'slot', index: 7 });
  assert.equal(lookup('KeyU'), null); // Shift 없는 UIOP는 아무 일도 안 함
  assert.equal(lookup('KeyT', true), null);
  assert.equal(GAME_CODES.length, 8);
});

test('시간이 지나면 두 플레이어의 세 수치가 같은 속도로 줄어든다', () => {
  const g = newGame();
  run(g, 5);
  const vals = g.players.flatMap((p) => Object.values(p.stats));
  assert.ok(vals.every((v) => Math.abs(v - vals[0]) < 1e-9));
  assert.ok(vals[0] < CONFIG.statStart);
});

test('감소 속도는 0초보다 120초에서 빠르고, 7분 근처에서 급격히 빨라진다', () => {
  assert.ok(decayRate(120) > decayRate(0));
  assert.ok(decayRate(420) - decayRate(390) > decayRate(390) - decayRate(360));
});

test('밥 키: 재고가 1 줄고 탄수화물이 22 오른다 (최대 100), 2P도 같은 접시를 쓴다', () => {
  const g = newGame();
  const before = g.players[0].stats.carb;
  assert.equal(pressFood(g, 0, RICE), 'eat');
  assert.equal(g.plates[RICE].stock, 2);
  assert.equal(g.players[0].stats.carb, before + 22);
  assert.equal(pressFood(g, 1, RICE), 'eat');
  assert.equal(g.plates[RICE].stock, 1);
  run(g, 0.4);
  g.players[0].stats.carb = 95;
  pressFood(g, 0, RICE);
  assert.equal(g.players[0].stats.carb, 100);
});

test('접시가 비었는데 누르면 헛손질: (벌점 없는 설정에서) 수치 변화 없이 0.5초 동안 아무 키도 안 먹힌다', () => {
  const g = newGame();
  g.plates[RICE].stock = 0;
  const before = g.players[0].stats.carb;
  assert.equal(pressFood(g, 0, RICE), 'empty');
  assert.equal(g.players[0].stats.carb, before);
  assert.equal(pressFood(g, 0, LETTUCE), 'locked');
  assert.equal(pressFood(g, 1, LETTUCE), 'eat'); // 상대는 상관없음
  run(g, 0.55);
  assert.equal(pressFood(g, 0, LETTUCE), 'eat');
});

test('접시는 정해진 간격마다 1씩 보충되고 3을 넘지 않는다', () => {
  const g = newGame();
  g.plates[MEAT].stock = 0;
  topUp(g);
  run(g, FOODS[MEAT].refill - 0.1);
  assert.equal(g.plates[MEAT].stock, 0);
  run(g, 0.2);
  assert.equal(g.plates[MEAT].stock, 1);
  topUp(g);
  run(g, FOODS[MEAT].refill * 5);
  assert.equal(g.plates[MEAT].stock, CONFIG.plateMax);
});

test('고기 키: 익은 고기가 없으면 불판에 올린다 (1P는 왼쪽 위부터, 2P는 오른쪽 위부터)', () => {
  const g = newGame();
  assert.equal(pressFood(g, 0, MEAT), 'place');
  assert.equal(g.grill[0].owner, 0);
  assert.equal(pressFood(g, 1, MEAT), 'place');
  assert.equal(g.grill[3].owner, 1);
  assert.equal(g.plates[MEAT].stock, 1);
  for (let i = 0; i < 4; i++) g.grill[i] = item(MUSH, 'raw');
  g.plates[MEAT].stock = 3;
  pressFood(g, 0, MEAT);
  assert.ok(g.grill[4]);
  pressFood(g, 1, MEAT);
  assert.ok(g.grill[7]);
});

test('불판이 꽉 차 있으면 올리지 못하고 헛손질이 된다', () => {
  const g = newGame();
  g.grill = g.grill.map(() => item(MEAT, 'raw'));
  assert.equal(pressFood(g, 0, MUSH), 'full');
  assert.equal(g.plates[MUSH].stock, 3);
  assert.ok(g.players[0].lock > 0);
});

test('고기 키는 익은 고기가 있어도 먹지 않고 하나 더 올린다 (먹기는 Shift 칸 키)', () => {
  const g = newGame();
  g.grill[0] = item(MEAT, 'cooked', { cookedFor: 1 });
  assert.equal(pressFood(g, 0, MEAT), 'place');
  assert.ok(g.grill[0] && g.grill[1]);
});

test('칸 키: 익은 칸을 누르면 그 음식을 먹고, 고기는 단백질 +30', () => {
  const g = newGame();
  pressFood(g, 0, MEAT);
  topUp(g);
  run(g, 4.6 + CONFIG.perfectWindow);
  g.players[0].stats.protein = 50;
  assert.equal(pressSlot(g, 0, 0), 'eat');
  assert.equal(g.players[0].stats.protein, 80);
  assert.equal(g.grill[0], null);
});

test('칸 키: 고른 칸만 먹는다 (다른 칸은 그대로)', () => {
  const g = newGame();
  g.grill[1] = item(MEAT, 'cooked', { cookedFor: 1 });
  g.grill[6] = item(MUSH, 'cooked', { cookedFor: 1 });
  assert.equal(pressSlot(g, 0, 6), 'eat');
  assert.equal(g.grill[6], null);
  assert.ok(g.grill[1]);
  assert.equal(g.players[0].eaten.mushroom, 1);
});

test('칸 키 헛손질: 빈 칸·덜 익은 칸·탄 칸을 누르면 0.5초 잠김', () => {
  for (const [state, reason] of [[null, 'none'], ['raw', 'raw'], ['burnt', 'burnt']]) {
    const g = newGame();
    if (state) g.grill[2] = item(MEAT, state);
    assert.equal(pressSlot(g, 0, 2), reason);
    assert.ok(g.players[0].lock > 0, reason);
    assert.equal(pressFood(g, 0, RICE), 'locked');
    if (state) assert.ok(g.grill[2]);
  }
});

test('헛손질 벌점: 빈 접시·덜 익은 칸은 세 수치가 깎이고, 빈 칸·탄 칸·꽉 찬 불판은 안 깎인다', () => {
  const cases = [
    ['empty', (g) => { g.plates[RICE].stock = 0; return pressFood(g, 0, RICE); }, 8],
    ['raw', (g) => { g.grill[2] = item(MEAT, 'raw'); return pressSlot(g, 0, 2); }, 8],
    ['none', (g) => pressSlot(g, 0, 2), 0],
    ['burnt', (g) => { g.grill[2] = item(MEAT, 'burnt'); return pressSlot(g, 0, 2); }, 0],
    ['full', (g) => { g.grill.fill(null).forEach((_, k) => (g.grill[k] = item(MUSH, 'raw'))); return pressFood(g, 0, MEAT); }, 0],
  ];
  for (const [reason, act, loss] of cases) {
    const g = newGame({ cfg: { ...CONFIG, fumblePenalty: 8 } });
    const before = { ...g.players[0].stats };
    assert.equal(act(g), reason);
    for (const s of Object.keys(before)) assert.equal(g.players[0].stats[s], before[s] - loss, `${reason} ${s}`);
    assert.deepEqual(g.players[1].stats, before, '상대는 그대로');
    assert.equal(g.events.at(-1).loss, loss);
  }
});

test('난이도가 높을수록 헛손질 벌점↑ · 수치 감소↑ · 타기까지 시간↓, 기본 설정은 벌점 0', () => {
  const r = LEVELS.map((l) => rulesFor(l));
  const inc = (k) => r.every((x, i) => i === 0 || x[k] > r[i - 1][k]);
  assert.ok(r[0].fumblePenalty > 0 && inc('fumblePenalty'), 'fumblePenalty');
  assert.ok(r[0].decayMul >= 1 && inc('decayMul'), 'decayMul');
  assert.ok(r.every((x, i) => i === 0 || x.burnAfter < r[i - 1].burnAfter), 'burnAfter');
  assert.equal(CONFIG.fumblePenalty, 0);
  const g = newGame();
  g.plates[RICE].stock = 0;
  const before = g.players[0].stats.carb;
  pressFood(g, 0, RICE);
  assert.equal(g.players[0].stats.carb, before);
});

test('헛손질 벌점으로 수치가 0이 되면 다음 틱에 진다', () => {
  const g = newGame({ cfg: { ...CONFIG, fumblePenalty: 8 } });
  g.players[0].stats.vitamin = 5;
  g.plates[RICE].stock = 0;
  pressFood(g, 0, RICE);
  assert.equal(g.players[0].stats.vitamin, 0);
  step(g, DT);
  assert.equal(g.over.winner, 1);
  assert.equal(g.over.cause[0], 'vitamin');
});

test('어려움: 수치가 기본의 2배로 줄고, 익은 음식은 1.8초 만에 탄다', () => {
  const g = newGame({ cfg: rulesFor('hard') });
  run(g, 10);
  const base = newGame();
  run(base, 10);
  const lost = (x) => CONFIG.statStart - x.players[0].stats.carb;
  assert.ok(Math.abs(lost(g) / lost(base) - 2) < 0.01, `${lost(g)} / ${lost(base)}`);
  const h = newGame({ cfg: rulesFor('hard') });
  h.grill[0] = item(MEAT, 'cooked');
  run(h, 1.7);
  assert.equal(h.grill[0].state, 'cooked');
  run(h, 0.2);
  assert.equal(h.grill[0].state, 'burnt');
});

test('콤보: PERFECT를 이어 가면 배수가 1.5 → 1.75 → 2.0 … 최대 2.5, 늦게 먹거나 헛손질하면 끊긴다', () => {
  const g = newGame();
  const p = g.players[0];
  const perfectMeat = () => {
    p.stats.protein = 0.5; // 최대치에 막히지 않게
    p.cooldown = 0;
    g.grill[0] = item(MEAT, 'cooked');
    g.events.length = 0;
    assert.equal(pressSlot(g, 0, 0), 'eat');
    return g.events.find((e) => e.type === 'eat');
  };
  const muls = [1, 2, 3, 4, 5, 6].map(() => perfectMeat().mul);
  assert.deepEqual(muls, [1.5, 1.75, 2, 2.25, 2.5, 2.5]);
  assert.equal(p.combo, 6);
  assert.equal(p.bestCombo, 6);
  // 늦게(PERFECT 아님) 먹으면 끊김
  p.cooldown = 0;
  g.grill[0] = item(MEAT, 'cooked', { cookedFor: 1 });
  pressSlot(g, 0, 0);
  assert.equal(p.combo, 0);
  assert.equal(perfectMeat().mul, 1.5);
  // 밥은 콤보에 영향 없음
  p.cooldown = 0;
  pressFood(g, 0, RICE);
  assert.equal(p.combo, 1);
  // 헛손질하면 끊김
  pressSlot(g, 0, 5);
  assert.equal(p.combo, 0);
  assert.equal(p.bestCombo, 6);
  // 단백질 30 × 2.0 = 60 (3번째 콤보)
  assert.equal(Math.round(30 * comboMul(CONFIG, 3)), 60);
});

test('상대가 올린 고기를 먼저 먹을 수 있다 (뺏어먹기 기록)', () => {
  const g = newGame();
  pressFood(g, 0, MEAT);
  topUp(g);
  run(g, 4.6 + CONFIG.perfectWindow);
  g.players[1].stats.protein = 10;
  assert.equal(pressSlot(g, 1, 0), 'eat');
  assert.equal(g.players[1].stats.protein, 40);
  assert.equal(g.players[1].stolen, 1);
});

test('익고 4초가 지나면 타고, 2초 뒤 저절로 치워진다', () => {
  const g = newGame();
  pressFood(g, 0, MUSH);
  topUp(g);
  run(g, 3.1 + 4.1);
  assert.equal(g.grill[0].state, 'burnt');
  topUp(g);
  run(g, 1.6);
  assert.ok(g.grill[0]);
  run(g, 0.4);
  assert.equal(g.grill[0], null);
});

test('먹기 쿨다운 0.35초 안에는 다시 먹을 수 없다', () => {
  const g = newGame();
  assert.equal(pressFood(g, 0, RICE), 'eat');
  assert.equal(pressFood(g, 0, LETTUCE), 'cooldown');
  run(g, 0.36);
  assert.equal(pressFood(g, 0, LETTUCE), 'eat');
});

// ---------- 경쟁 요소 ----------
test('PERFECT: 익은 직후 0.6초 안에 먹으면 영양이 1.5배', () => {
  const g = newGame();
  g.grill[0] = item(MEAT, 'cooked', { cookedFor: 0.3 });
  g.players[0].stats.protein = 10;
  pressSlot(g, 0, 0);
  assert.equal(g.players[0].stats.protein, 10 + 45);
  assert.equal(g.players[0].perfect, 1);
  g.grill[1] = item(MEAT, 'cooked', { cookedFor: 0.8 });
  g.players[1].stats.protein = 10;
  pressSlot(g, 1, 1);
  assert.equal(g.players[1].stats.protein, 40);
  assert.equal(g.players[1].perfect, 0);
});

test('황금 고기: 30~45초 사이 고기 접시에 나오고, 굽는 데 6초, 먹으면 세 수치 모두 +35', () => {
  const g = createGame({ seed: 9, feverEnabled: false });
  assert.ok(g.nextGolden >= 30 && g.nextGolden <= 45);
  while (!g.plates[MEAT].special) {
    topUp(g);
    step(g, DT);
  }
  assert.equal(g.plates[MEAT].special, 'golden');
  const stock = g.plates[MEAT].stock;
  assert.equal(pressFood(g, 1, MEAT), 'place');
  assert.equal(g.plates[MEAT].special, null);
  assert.equal(g.plates[MEAT].stock, stock); // 일반 재고는 그대로
  const slot = g.grill.findIndex((x) => x && x.golden);
  assert.equal(g.grill[slot].cookTime, 6);
  topUp(g);
  run(g, 5.9);
  assert.equal(g.grill[slot].state, 'raw');
  run(g, 0.2 + CONFIG.perfectWindow);
  for (const s in g.players[0].stats) g.players[0].stats[s] = 20;
  assert.equal(pressSlot(g, 0, slot), 'eat');
  assert.deepEqual(g.players[0].stats, { protein: 55, carb: 55, vitamin: 55 });
  assert.equal(g.players[0].golden, 1);
});

test('황금 고기는 가져간 뒤에야 다음 것이 50~65초 뒤로 예약된다', () => {
  const g = createGame({ seed: 4, feverEnabled: false });
  while (!g.plates[MEAT].special) {
    topUp(g);
    step(g, DT);
  }
  assert.equal(g.nextGolden, Infinity);
  pressFood(g, 0, MEAT);
  const gap = g.nextGolden - g.t;
  assert.ok(gap >= 50 && gap <= 65, gap);
});

test('청양고추: 상추 접시에 나오고, 먹으면 상대가 2초 동안 아무것도 못 먹는다 (올리기는 가능)', () => {
  const g = createGame({ seed: 11, feverEnabled: false });
  assert.ok(g.nextChili >= 40 && g.nextChili <= 60);
  while (!g.plates[LETTUCE].special) {
    topUp(g);
    step(g, DT);
  }
  const stock = g.plates[LETTUCE].stock;
  assert.equal(pressFood(g, 0, LETTUCE), 'chili');
  assert.equal(g.plates[LETTUCE].stock, stock);
  assert.equal(g.players[0].chili, 1);
  assert.equal(g.players[1].spicy, CONFIG.chili.stun);
  assert.equal(pressFood(g, 1, RICE), 'spicy');
  g.grill = g.grill.map(() => null);
  assert.equal(pressFood(g, 1, MEAT), 'place');
  topUp(g);
  run(g, 2.05);
  assert.equal(pressFood(g, 1, RICE), 'eat');
});

test('특수 음식을 끄면 나오지 않는다 (테스트용 옵션)', () => {
  const g = newGame();
  topUp(g);
  run(g, 120);
  assert.equal(g.plates[MEAT].special, null);
  assert.equal(g.plates[LETTUCE].special, null);
});

// ---------- 끝 ----------
test('수치 하나가 0이 되면 즉시 끝나고 상대가 승자, 패배 원인이 기록된다', () => {
  const g = newGame();
  g.players[1].stats.vitamin = 0.001;
  step(g, DT);
  assert.equal(g.over.winner, 0);
  assert.deepEqual(g.over.cause, [null, 'vitamin']);
  assert.ok(g.over.time > 0);
  assert.equal(pressFood(g, 0, RICE), null);
});

test('같은 틱에 둘 다 0이 되면 무승부', () => {
  const g = newGame();
  g.players[0].stats.carb = 0.001;
  g.players[1].stats.protein = 0.001;
  step(g, DT);
  assert.equal(g.over.winner, -1);
});

test('아무것도 안 하면 40~50초 안에 쓰러진다', () => {
  const g = newGame();
  run(g, 120);
  assert.ok(g.over.time >= 40 && g.over.time <= 50, g.over.time);
});

// ---------- 피버 ----------
test('첫 피버는 60~100초 사이에 오고, 3초 전에 예고가 뜬다', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const g = createGame({ seed, specialsEnabled: false });
    assert.ok(g.fever.start >= 60 && g.fever.start <= 100);
    while (g.t < g.fever.start - 2.5) {
      topUp(g);
      step(g, DT);
    }
    assert.ok(feverWarning(g));
    assert.ok(!g.fever.active);
  }
});

function gameAtFever(seed = 3) {
  const g = createGame({ seed, specialsEnabled: false });
  while (!g.fever.active) {
    topUp(g);
    step(g, DT);
  }
  return g;
}

test('피버 중에는 고기가 약 1.1초 만에 익는다', () => {
  const g = gameAtFever();
  g.plates[MEAT].stock = 3;
  pressFood(g, 0, MEAT);
  run(g, 1.0);
  assert.equal(g.grill[0].state, 'raw');
  run(g, 0.2);
  assert.equal(g.grill[0].state, 'cooked');
});

test('피버 직전에 굽던 음식도 피버가 오면 남은 시간이 4배 빨리 줄어든다', () => {
  const g = createGame({ seed: 5, specialsEnabled: false });
  while (g.t < g.fever.start - 1) {
    topUp(g);
    step(g, DT);
  }
  g.grill = g.grill.map(() => null);
  g.plates[MEAT].stock = 3;
  pressFood(g, 0, MEAT);
  run(g, 1.0); // 피버 전 1초 → 남은 3.5초
  assert.ok(g.fever.active);
  run(g, 0.95); // 피버 중 3.5/4 ≈ 0.875초면 익음
  assert.equal(g.grill[0].state, 'cooked');
});

test('피버 중 접시 보충은 2배, 익음→탐 4초와 감소 속도는 그대로', () => {
  const g = gameAtFever();
  g.plates[RICE].stock = 0;
  g.plates[RICE].timer = 0;
  g.grill[0] = item(MEAT, 'cooked');
  const p = g.players[0];
  const before = p.stats.carb;
  const t0 = g.t;
  run(g, FOODS[RICE].refill / 2 + 0.05);
  assert.equal(g.plates[RICE].stock, 1);
  assert.equal(g.grill[0].state, 'cooked');
  const expectLoss = decayRate(t0) * (g.t - t0);
  assert.ok(Math.abs(before - p.stats.carb - expectLoss) < 0.1);
});

test('피버는 8초 뒤 끝나고, 다음 피버는 50~80초 뒤에 온다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = gameAtFever(seed);
    const started = g.t;
    while (g.fever.active) {
      topUp(g);
      step(g, DT);
    }
    assert.ok(Math.abs(g.t - started - CONFIG.fever.duration) < 0.05);
    const gap = g.fever.start - g.t;
    assert.ok(gap >= 50 && gap <= 80, gap);
  }
});

test('같은 시드면 피버·특수 음식 시점이 매번 같다', () => {
  const a = createGame({ seed: 77 });
  const b = createGame({ seed: 77 });
  assert.equal(a.fever.start, b.fever.start);
  assert.equal(a.nextGolden, b.nextGolden);
  assert.equal(a.nextChili, b.nextChili);
});

// ---------- 랭킹 ----------
test('랭킹은 빨리 이긴 순서로 5개까지', () => {
  let list = [];
  for (const t of [100, 300, 200, 50, 400, 250]) list = insertRanking(list, { name: 'A', time: t });
  assert.deepEqual(list.map((r) => r.time), [50, 100, 200, 250, 300]);
  assert.ok(!qualifies(list, 310));
  assert.ok(qualifies(list, 299));
});

// ---------- CPU ----------
test('CPU는 혼자서도 굽고 먹으며, 같은 시드면 똑같이 움직인다', () => {
  const play = () => {
    const g = newGame();
    const cpu = createCpu('normal', 1, 5);
    for (let i = 0; i < 60 * 30; i++) {
      step(g, DT);
      cpu.update(g);
    }
    return g.players[1];
  };
  const a = play();
  const b = play();
  assert.ok(Object.values(a.eaten).reduce((x, y) => x + y) > 5);
  assert.deepEqual(a.eaten, b.eaten);
  assert.deepEqual(a.stats, b.stats);
});

test('CPU는 1P(사람) 자리를 건드리지 않는다', () => {
  const g = newGame();
  const cpu = createCpu('hard', 1, 9);
  for (let i = 0; i < 60 * 20; i++) {
    step(g, DT);
    cpu.update(g);
  }
  assert.ok(Object.values(g.players[0].eaten).every((n) => n === 0));
});

// ---------- 밸런스 (headless 시뮬레이션) ----------
test('밸런스: greedy끼리 100판 평균 300~420초, 420초 초과 5% 미만, 450초 초과 0판', () => {
  const r = summarize('greedy', 'greedy', 100);
  assert.ok(r.avg >= 300 && r.avg <= 420, `avg ${r.avg}`);
  assert.ok(r.times.filter((t) => t > 420).length < 5);
  assert.equal(r.times.filter((t) => t > 450).length, 0);
});

test('밸런스: 키를 아무리 빨리 연타해도 생각하며 플레이하는 쪽을 거의 이기지 못한다 (승률 10% 미만)', () => {
  const r = summarize('random', 'greedy', 100, { reaction: [[0.06, 0.09], [0.22, 0.38]] });
  assert.ok(r.wins[0] < 10, `연타 승 ${r.wins[0]}판`);
});

test('밸런스: 황금 고기·고추를 노리는 쪽이 무시하는 쪽보다 더 많이 이긴다 (55% 이상)', () => {
  const r = summarize('greedy', 'plain', 200);
  assert.ok(r.wins[0] >= 110, `노린 쪽 승 ${r.wins[0]}/200`);
});

test('난이도: 쉬움(예전 어려움)은 잘하는 사람이 50~80% 이긴다', () => {
  const { wins } = vsCpu('easy', 'skilled', 100);
  assert.ok(wins >= 50 && wins <= 80, wins);
});

test('난이도: 보통은 잘하는 사람도 20~45%만 이긴다', () => {
  const { wins } = vsCpu('normal', 'skilled', 100);
  assert.ok(wins >= 20 && wins <= 45, wins);
});

test('난이도: 어려움은 잘하는 사람도 10% 미만, 그래도 한 판이 2분은 간다', () => {
  const r = vsCpu('hard', 'skilled', 100);
  assert.ok(r.wins < 10, r.wins);
  assert.ok(r.avg >= 120, r.avg);
});

test('난이도: 쉬움 < 보통 < 어려움 순서로 이기기 어렵다', () => {
  const w = LEVELS.map((lv) => vsCpu(lv, 'skilled', 100).wins);
  assert.ok(w[0] > w[1] && w[1] > w[2], JSON.stringify(w));
});

test('밸런스: 피버가 실제로 이득이다 (피버 켠 쪽이 평균적으로 더 오래 버팀)', () => {
  const on = summarize('greedy', 'greedy', 60);
  const off = summarize('greedy', 'greedy', 60, { feverEnabled: false });
  assert.ok(on.avg > off.avg, `${on.avg} vs ${off.avg}`);
});

// ---------- 검수: 긴 경기 동안의 불변 조건 ----------
const FUMBLES = ['empty', 'full', 'none', 'raw', 'burnt'];

function playVsCpu(level, seed) {
  const g = createGame({ seed });
  const cpu = createCpu(level, 1, seed * 17 + 1);
  // 사람 쪽은 greedy 봇이 대신 플레이한다
  const rng = mulberry(seed * 5 + 3);
  const bot = BOTS.greedy;
  let next = 0.3;
  const stats = { ticks: 0, cpuFumbles: 0, cpuActions: 0, violations: [] };
  const check = (cond, msg) => {
    if (!cond && stats.violations.length < 5) stats.violations.push(`${g.t.toFixed(2)}s ${msg}`);
  };
  while (!g.over && g.t < 900) {
    step(g, DT);
    if (g.t >= next) {
      bot(g, 0, rng);
      next = g.t + 0.25 + rng() * 0.15;
    }
    const before = g.events.length;
    cpu.update(g);
    for (const ev of g.events.slice(before)) {
      if (ev.player === 1) stats.cpuActions++;
      if (ev.type === 'fail' && ev.player === 1 && FUMBLES.includes(ev.reason)) stats.cpuFumbles++;
    }
    g.events.length = 0;
    stats.ticks++;
    for (const p of g.players) {
      for (const s in p.stats) check(Number.isFinite(p.stats[s]) && p.stats[s] >= 0 && p.stats[s] <= CONFIG.statMax, `수치 범위 ${s}=${p.stats[s]}`);
      check(p.cooldown >= 0 && p.lock >= 0 && p.spicy >= 0, '타이머 음수');
    }
    for (const pl of g.plates) check(pl.stock >= 0 && pl.stock <= CONFIG.plateMax && Number.isFinite(pl.timer), `접시 재고 ${pl.stock}`);
    for (const it of g.grill) {
      if (!it) continue;
      check(['raw', 'cooked', 'burnt'].includes(it.state), `불판 상태 ${it.state}`);
      check(it.progress <= it.cookTime + 1e-9 && Number.isFinite(it.progress), '굽기 진행 초과');
      if (it.state === 'cooked') check(it.cookedFor < CONFIG.burnAfter + DT, '익음이 탐으로 안 넘어감');
      if (it.state === 'burnt') check(Number.isFinite(it.burntFor) && it.burntFor < CONFIG.burntClear + DT, '탄 음식이 안 치워짐');
    }
  }
  return { g, ...stats };
}

test('검수: 난이도별 실제 경기 9판 — 매 틱 불변 조건 위반 0건, 7분 30초 안에 끝남', () => {
  for (const level of LEVELS) {
    for (const seed of [1, 2, 3]) {
      const r = playVsCpu(level, seed);
      assert.deepEqual(r.violations, [], `${level}#${seed}`);
      assert.ok(r.g.over && r.g.over.time < 450, `${level}#${seed} 안 끝남`);
    }
  }
});

test('검수(함정 B): CPU가 헛손질로 헛돌지 않는다 — 헛손질은 CPU 행동의 3% 미만', () => {
  let fumbles = 0;
  let actions = 0;
  for (const level of LEVELS) {
    for (const seed of [4, 5]) {
      const r = playVsCpu(level, seed);
      fumbles += r.cpuFumbles;
      actions += r.cpuActions;
    }
  }
  assert.ok(actions > 200, `CPU 행동 ${actions}`);
  assert.ok(fumbles / actions < 0.03, `헛손질 ${fumbles}/${actions}`);
});

test('검수(함정 A): 불판 8칸이 꽉 차도 교착되지 않는다 — 아무도 안 먹어도 결국 모두 비워진다', () => {
  const g = newGame();
  g.grill = g.grill.map((_, i) => item(i % 2 ? MUSH : MEAT, 'raw', { owner: i % 2 }));
  assert.equal(pressFood(g, 0, MEAT), 'full');
  const limit = FOODS[MEAT].cookTime + CONFIG.burnAfter + CONFIG.burntClear + 0.2;
  for (let t = 0; t < limit; t += DT) {
    topUp(g);
    step(g, DT);
  }
  assert.ok(g.grill.every((x) => x === null));
  run(g, 0.6);
  topUp(g);
  assert.equal(pressFood(g, 0, MEAT), 'place');
});

test('검수: 저장소 접근 자체가 예외를 던져도 랭킹 읽기·쓰기는 조용히 넘어간다', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.deepEqual(loadRanking(['easy', 'normal']), { easy: [], normal: [] });
    assert.doesNotThrow(() => saveRanking({ easy: [{ name: 'A', time: 1 }] }));
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
});
