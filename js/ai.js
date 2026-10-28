// 컴퓨터 상대(CPU)와 밸런스 검수용 봇. 사람처럼 일정 간격(반응 시간)마다 키를 한 번씩 누른다.
import { CONFIG, FOODS, STATS } from './config.js';
import { pressFood, pressSlot, findCooked, feverWarning, mulberry32 } from './game.js';

const RICE = 0, MEAT = 1, MUSH = 2, LETTUCE = 3;
const FOOD_FOR = { carb: [RICE], protein: [MEAT], vitamin: [MUSH, LETTUCE] };

// specials: 황금 고기·고추를 노리는지 (끄면 그런 게 있어도 신경 쓰지 않는다)
export function makeGreedy({ specials = true } = {}) {
  return function greedy(g, pi) {
    const p = g.players[pi];
    const room = (fi) => STATS.every((s) => !FOODS[fi].gain[s] || p.stats[s] + FOODS[fi].gain[s] * 0.5 <= g.cfg.statMax);
    const order = [...STATS].sort((a, b) => p.stats[a] - p.stats[b]);
    const cooked = (fi) => g.grill.some((it) => it && it.food === fi && it.state === 'cooked');
    const goldenSlot = g.grill.findIndex((it) => it && it.golden && it.state === 'cooked');
    const ready = p.cooldown <= 0 && p.spicy <= 0;
    const score = (fi) => Math.min(...STATS.filter((s) => FOODS[fi].gain[s] > 0).map((s) => order.indexOf(s)));

    if (ready) {
      // 1. 황금 고기가 익었으면 무조건, 고추가 나오면 바로 (상대 공격)
      if (specials && goldenSlot >= 0) return pressSlot(g, pi, goldenSlot);
      if (specials && g.plates[LETTUCE].special === 'chili') return pressFood(g, pi, LETTUCE);
      // 2. 익은 음식 (가장 부족한 수치부터)
      const eatable = [MEAT, MUSH].filter((fi) => cooked(fi) && room(fi)).sort((a, b) => score(a) - score(b));
      if (eatable.length) return pressSlot(g, pi, findCooked(g, eatable[0]));
      // 3. 가장 부족한 수치를 바로 먹는 음식으로
      for (const s of order) {
        if (p.stats[s] > 70) break;
        for (const fi of FOOD_FOR[s]) {
          if (!FOODS[fi].grill && g.plates[fi].stock > 0 && room(fi)) return pressFood(g, pi, fi);
        }
      }
    }

    // 4. 불판 채우기 (황금 고기는 바로, 피버 예고 중에는 가득)
    const empty = g.grill.filter((x) => x === null).length;
    if (specials && empty > 0 && g.plates[MEAT].special === 'golden' && !cooked(MEAT)) return pressFood(g, pi, MEAT);
    const mine = g.grill.filter((x) => x && x.owner === pi).length;
    const want = feverWarning(g) || g.fever.active ? g.cfg.grillSlots : g.cfg.grillSlots / 2;
    if (empty > 0 && mine < want) {
      const need = order.find((s) => s === 'protein' || s === 'vitamin');
      const pref = need === 'protein' ? [MEAT, MUSH] : [MUSH, MEAT];
      for (const fi of pref) if (g.plates[fi].stock > 0) return pressFood(g, pi, fi);
    }

    // 5. 여유가 있으면 바로 먹는 음식으로 수치 보충
    if (ready) {
      for (const s of order) for (const fi of FOOD_FOR[s]) {
        if (!FOODS[fi].grill && g.plates[fi].stock > 0 && room(fi)) return pressFood(g, pi, fi);
      }
    }
  };
}

export const BOTS = {
  idle() {},

  // 키 12개(접시 4 + 불판 칸 8) 중 아무거나
  random(g, pi, rng) {
    const k = Math.floor(rng() * 12);
    if (k < 4) pressFood(g, pi, k);
    else pressSlot(g, pi, k - 4);
  },

  greedy: makeGreedy(),
  plain: makeGreedy({ specials: false }),
};

// 난이도: 반응 시간(초), 망설임(행동을 건너뛸 확률), 황금 고기·고추를 노리는지
export const DIFFICULTY = {
  // rules: 그 난이도에서 바뀌는 게임 규칙 (나·CPU 모두 똑같이 적용)
  //  fumblePenalty 헛손질 벌점 · decayMul 수치 감소 배수 · burnAfter 익은 뒤 탈 때까지(초)
  // 한 판 평균(잘하는 사람 기준): 쉬움 약 3분 · 보통 약 2분 · 어려움 약 1분. 길이는 decayMul로 맞춘다
  easy: { label: '쉬움', reaction: [0.24, 0.36], slip: 0, specials: true, rules: { fumblePenalty: 8, decayMul: 1.8, burnAfter: 2.5 } },
  normal: { label: '보통', reaction: [0.2, 0.28], slip: 0, specials: true, rules: { fumblePenalty: 10, decayMul: 2.4, burnAfter: 2.0 } },
  hard: { label: '어려움', reaction: [0.14, 0.2], slip: 0, specials: true, rules: { fumblePenalty: 12, decayMul: 3.3, burnAfter: 1.8 } },
};

export function rulesFor(level) {
  return { ...CONFIG, ...DIFFICULTY[level].rules };
}
export const LEVELS = Object.keys(DIFFICULTY);

// 매 틱 update(g)를 부르면 반응 시간마다 한 번씩 키를 누른다
export function createCpu(level, pi = 1, seed = 1) {
  const d = DIFFICULTY[level];
  const bot = makeGreedy({ specials: d.specials });
  const rng = mulberry32(seed);
  const delay = () => d.reaction[0] + rng() * (d.reaction[1] - d.reaction[0]);
  let next = delay();
  return {
    level,
    update(g) {
      if (g.over || g.t < next) return;
      if (rng() >= d.slip) bot(g, pi);
      next = g.t + delay();
    },
  };
}
