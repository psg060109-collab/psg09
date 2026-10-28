// 기획서 ⑥ 완료 기준 — 핵심 규칙 · 경쟁 요소 · 피버 · 밸런스 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, FOODS, decayRate } from '../js/config.js';
import { createGame, step, pressFood, feverWarning } from '../js/game.js';
import { SPRITE_ROWS, validateRows } from '../js/sprites.js';
import { lookup, GAME_CODES } from '../js/input.js';
import { qualifies, insertRanking } from '../js/ranking.js';
import { summarize } from '../sim/simulate.mjs';

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

test('키는 음식별 4개: 1P Q·W·E·R, 2P U·I·O·P (모두 8개)', () => {
  assert.deepEqual(lookup('KeyQ'), { player: 0, index: RICE });
  assert.deepEqual(lookup('KeyW'), { player: 0, index: MEAT });
  assert.deepEqual(lookup('KeyO'), { player: 1, index: MUSH });
  assert.deepEqual(lookup('KeyP'), { player: 1, index: LETTUCE });
  assert.equal(GAME_CODES.length, 8);
  assert.equal(lookup('KeyA'), null);
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

test('접시가 비었는데 누르면 헛손질: 수치 변화 없이 0.5초 동안 아무 키도 안 먹힌다', () => {
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

test('고기 키: 익은 고기가 있으면 먹는다 (덜 익은 것만 있으면 하나 더 올린다)', () => {
  const g = newGame();
  pressFood(g, 0, MEAT);
  topUp(g);
  run(g, 4.3);
  assert.equal(pressFood(g, 0, MEAT), 'place'); // 아직 덜 익음 → 하나 더 올림
  assert.ok(g.grill[0] && g.grill[1]);
  run(g, 0.3);
  assert.equal(g.grill[0].state, 'cooked');
  g.players[0].stats.protein = 50;
  run(g, CONFIG.perfectWindow + 0.1); // 퍼펙트 구간이 지난 뒤
  g.players[0].stats.protein = 50;
  assert.equal(pressFood(g, 0, MEAT), 'eat');
  assert.equal(g.players[0].stats.protein, 80);
  assert.equal(g.grill[0], null);
});

test('고기 키는 버섯을 먹지 않는다', () => {
  const g = newGame();
  g.grill[2] = item(MUSH, 'cooked', { cookedFor: 2 });
  assert.equal(pressFood(g, 0, MEAT), 'place');
  assert.ok(g.grill[2]);
});

test('익은 것이 여러 개면 곧 탈 것(오래 익은 것)부터 먹는다', () => {
  const g = newGame();
  g.grill[1] = item(MEAT, 'cooked', { cookedFor: 1 });
  g.grill[5] = item(MEAT, 'cooked', { cookedFor: 3 });
  g.grill[6] = item(MEAT, 'raw');
  pressFood(g, 1, MEAT);
  assert.equal(g.grill[5], null);
  assert.ok(g.grill[1] && g.grill[6]);
});

test('1P가 올린 고기를 2P가 먼저 먹을 수 있다 (뺏어먹기 기록)', () => {
  const g = newGame();
  pressFood(g, 0, MEAT);
  topUp(g);
  run(g, 4.6 + CONFIG.perfectWindow);
  g.players[1].stats.protein = 10;
  assert.equal(pressFood(g, 1, MEAT), 'eat');
  assert.equal(g.players[1].stats.protein, 40);
  assert.equal(g.players[1].stolen, 1);
});

test('익고 4초가 지나면 타고, 탄 건 먹히지 않으며, 2초 뒤 저절로 치워진다', () => {
  const g = newGame();
  pressFood(g, 0, MUSH);
  topUp(g);
  run(g, 3.1 + 4.1);
  assert.equal(g.grill[0].state, 'burnt');
  const before = { ...g.players[0].stats };
  g.plates[MUSH].stock = 0;
  assert.equal(pressFood(g, 0, MUSH), 'empty'); // 탄 건 안 먹히고, 접시도 비어 헛손질
  assert.deepEqual(g.players[0].stats, before);
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
  pressFood(g, 0, MEAT);
  assert.equal(g.players[0].stats.protein, 10 + 45);
  assert.equal(g.players[0].perfect, 1);
  g.grill[1] = item(MEAT, 'cooked', { cookedFor: 0.8 });
  g.players[1].stats.protein = 10;
  pressFood(g, 1, MEAT);
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
  assert.equal(pressFood(g, 0, MEAT), 'eat');
  assert.deepEqual(g.players[0].stats, { protein: 55, carb: 55, vitamin: 55 });
  assert.equal(g.players[0].golden, 1);
});

test('황금 고기가 일반 고기와 함께 익어 있으면 황금 고기부터 먹는다', () => {
  const g = newGame();
  g.grill[0] = item(MEAT, 'cooked', { cookedFor: 3 });
  g.grill[1] = item(MEAT, 'cooked', { cookedFor: 1, golden: true, cookTime: 6 });
  pressFood(g, 0, MEAT);
  assert.equal(g.grill[1], null);
  assert.ok(g.grill[0]);
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
test('랭킹은 대결 시간이 긴 순서로 5개까지', () => {
  let list = [];
  for (const t of [100, 300, 200, 50, 400, 250]) list = insertRanking(list, { name: 'A', time: t });
  assert.deepEqual(list.map((r) => r.time), [400, 300, 250, 200, 100]);
  assert.ok(!qualifies(list, 90));
  assert.ok(qualifies(list, 101));
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

test('밸런스: 피버가 실제로 이득이다 (피버 켠 쪽이 평균적으로 더 오래 버팀)', () => {
  const on = summarize('greedy', 'greedy', 60);
  const off = summarize('greedy', 'greedy', 60, { feverEnabled: false });
  assert.ok(on.avg > off.avg, `${on.avg} vs ${off.avg}`);
});
