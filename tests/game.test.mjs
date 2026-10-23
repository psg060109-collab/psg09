// 기획서 ⑥ 완료 기준 — 핵심 규칙 · 피버 · 밸런스 (node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, FOODS, decayRate } from '../js/config.js';
import { createGame, step, pressPlate, pressSlot, feverWarning } from '../js/game.js';
import { SPRITE_ROWS, validateRows } from '../js/sprites.js';
import { lookup, GAME_CODES } from '../js/input.js';
import { qualifies, insertRanking } from '../js/ranking.js';
import { summarize } from '../sim/simulate.mjs';

const DT = 1 / 60;
const RICE = 0, MEAT = 1, MUSH = 2, LETTUCE = 3;

function newGame(opts = {}) {
  return createGame({ seed: 42, feverEnabled: false, ...opts });
}
function run(g, sec) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) step(g, DT);
}
// 감소 없이 시간만 흘리고 싶을 때 수치를 꽉 채워 둔다
function topUp(g) {
  for (const p of g.players) for (const s in p.stats) p.stats[s] = 100;
}

test('스프라이트는 모두 16×16', () => {
  for (const [name, rows] of Object.entries(SPRITE_ROWS)) assert.ok(validateRows(rows), name);
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

test('1P가 밥을 먹으면 재고가 1 줄고 탄수화물이 22 오른다 (최대 100)', () => {
  const g = newGame();
  const before = g.players[0].stats.carb;
  assert.equal(pressPlate(g, 0, RICE), 'eat');
  assert.equal(g.plates[RICE].stock, 2);
  assert.equal(g.players[0].stats.carb, before + 22);
  g.players[0].stats.carb = 95;
  g.players[0].cooldown = 0;
  pressPlate(g, 0, RICE);
  assert.equal(g.players[0].stats.carb, 100);
});

test('2P도 같은 밥 접시를 쓴다', () => {
  const g = newGame();
  pressPlate(g, 0, RICE);
  const before = g.players[1].stats.carb;
  pressPlate(g, 1, RICE);
  assert.equal(g.plates[RICE].stock, 1);
  assert.equal(g.players[1].stats.carb, before + 22);
});

test('접시 재고가 0이면 키를 눌러도 수치가 변하지 않는다', () => {
  const g = newGame();
  g.plates[RICE].stock = 0;
  const before = g.players[0].stats.carb;
  assert.equal(pressPlate(g, 0, RICE), 'empty');
  assert.equal(g.players[0].stats.carb, before);
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

test('1P는 1번 칸부터, 2P는 4번 칸부터 올리고, 윗줄이 차면 1P는 5번·2P는 8번', () => {
  const g = newGame();
  pressPlate(g, 0, MEAT);
  assert.equal(g.grill[0].owner, 0);
  pressPlate(g, 1, MEAT);
  assert.equal(g.grill[3].owner, 1);
  g.grill = g.grill.map(() => null);
  for (let i = 0; i < 4; i++) g.grill[i] = { food: MEAT, state: 'raw', progress: 0, cookedFor: 0, owner: 0 };
  g.plates[MEAT].stock = 3;
  pressPlate(g, 0, MEAT);
  assert.ok(g.grill[4]);
  pressPlate(g, 1, MEAT);
  assert.ok(g.grill[7]);
});

test('아랫줄 5~8번 칸도 먹거나 치울 수 있다 (Z·X·C·V / M·,·.·/)', () => {
  assert.deepEqual(lookup('KeyZ'), { player: 0, kind: 'grill', index: 4 });
  assert.deepEqual(lookup('KeyV'), { player: 0, kind: 'grill', index: 7 });
  assert.deepEqual(lookup('KeyM'), { player: 1, kind: 'grill', index: 4 });
  assert.deepEqual(lookup('Slash'), { player: 1, kind: 'grill', index: 7 });
  assert.equal(GAME_CODES.length, 24);
  const g = newGame();
  g.grill[6] = { food: MEAT, state: 'cooked', progress: 4.5, cookedFor: 0, owner: 0 };
  assert.equal(pressSlot(g, 1, 6), 'eat');
  assert.equal(g.grill[6], null);
});

test('불판 8칸이 모두 차 있으면 고기·버섯 재고가 줄지 않는다', () => {
  const g = newGame();
  g.grill = g.grill.map(() => ({ food: MEAT, state: 'raw', progress: 0, cookedFor: 0, owner: 0 }));
  assert.equal(pressPlate(g, 0, MUSH), 'full');
  assert.equal(g.plates[MUSH].stock, 3);
});

test('고기는 4.5초 전에는 먹히지 않고, 익으면 누른 사람의 단백질이 30 오른다', () => {
  const g = newGame();
  pressPlate(g, 0, MEAT);
  topUp(g);
  run(g, 4.3);
  assert.equal(pressSlot(g, 0, 0), 'raw');
  assert.ok(g.grill[0]);
  run(g, 0.3);
  assert.equal(g.grill[0].state, 'cooked');
  g.players[0].stats.protein = 50;
  assert.equal(pressSlot(g, 0, 0), 'eat');
  assert.equal(g.players[0].stats.protein, 80);
  assert.equal(g.grill[0], null);
});

test('1P가 올린 고기를 2P가 먼저 먹을 수 있다 (뺏어먹기 기록)', () => {
  const g = newGame();
  pressPlate(g, 0, MEAT);
  topUp(g);
  run(g, 4.6);
  g.players[1].stats.protein = 10;
  assert.equal(pressSlot(g, 1, 0), 'eat');
  assert.equal(g.players[1].stats.protein, 40);
  assert.equal(g.players[1].stolen, 1);
});

test('익고 4초가 지나면 타고, 누르면 수치 변화 없이 칸이 빈다', () => {
  const g = newGame();
  pressPlate(g, 0, MUSH);
  topUp(g);
  run(g, 3.1 + 4.1);
  assert.equal(g.grill[0].state, 'burnt');
  const before = { ...g.players[0].stats };
  assert.equal(pressSlot(g, 0, 0), 'discard');
  assert.deepEqual(g.players[0].stats, before);
  assert.equal(g.grill[0], null);
});

test('먹기 쿨다운 0.35초 안에는 다시 먹을 수 없다', () => {
  const g = newGame();
  assert.equal(pressPlate(g, 0, RICE), 'eat');
  assert.equal(pressPlate(g, 0, LETTUCE), 'cooldown');
  run(g, 0.36);
  assert.equal(pressPlate(g, 0, LETTUCE), 'eat');
});

test('수치 하나가 0이 되면 즉시 끝나고 상대가 승자, 패배 원인이 기록된다', () => {
  const g = newGame();
  g.players[1].stats.vitamin = 0.001;
  step(g, DT);
  assert.equal(g.over.winner, 0);
  assert.deepEqual(g.over.cause, [null, 'vitamin']);
  assert.ok(g.over.time > 0);
  assert.equal(pressPlate(g, 0, RICE), null);
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
    const g = createGame({ seed });
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
  const g = createGame({ seed });
  while (!g.fever.active) {
    topUp(g);
    step(g, DT);
  }
  return g;
}

test('피버 중에는 고기가 약 1.1초 만에 익는다', () => {
  const g = gameAtFever();
  g.plates[MEAT].stock = 3;
  pressPlate(g, 0, MEAT);
  run(g, 1.0);
  assert.equal(g.grill[0].state, 'raw');
  run(g, 0.2);
  assert.equal(g.grill[0].state, 'cooked');
});

test('피버 직전에 굽던 음식도 피버가 오면 남은 시간이 4배 빨리 줄어든다', () => {
  const g = createGame({ seed: 5 });
  while (g.t < g.fever.start - 1) {
    topUp(g);
    step(g, DT);
  }
  g.grill = g.grill.map(() => null);
  g.plates[MEAT].stock = 3;
  pressPlate(g, 0, MEAT);
  run(g, 1.0); // 피버 전 1초 → 남은 3.5초
  assert.ok(g.fever.active);
  run(g, 0.95); // 피버 중 3.5/4 ≈ 0.875초면 익음
  assert.equal(g.grill[0].state, 'cooked');
});

test('피버 중 접시 보충은 2배, 익음→탐 4초와 감소 속도는 그대로', () => {
  const g = gameAtFever();
  g.plates[RICE].stock = 0;
  g.plates[RICE].timer = 0;
  g.grill[0] = { food: MEAT, state: 'cooked', progress: 4.5, cookedFor: 0, owner: 0 };
  const p = g.players[0];
  const before = p.stats.carb;
  const t0 = g.t;
  run(g, FOODS[RICE].refill / 2 + 0.05);
  assert.equal(g.plates[RICE].stock, 1);
  assert.equal(g.grill[0].state, 'cooked'); // 1.7초만 지남
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

test('같은 시드면 피버 시점이 매번 같다', () => {
  const a = createGame({ seed: 77 });
  const b = createGame({ seed: 77 });
  assert.equal(a.fever.start, b.fever.start);
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

test('밸런스: 피버가 실제로 이득이다 (피버 켠 쪽이 평균적으로 더 오래 버팀)', () => {
  const on = summarize('greedy', 'greedy', 60);
  const off = summarize('greedy', 'greedy', 60, { feverEnabled: false });
  assert.ok(on.avg > off.avg, `${on.avg} vs ${off.avg}`);
});
