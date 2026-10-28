// 밸런스 검수용 봇. 사람처럼 일정 간격(반응 시간)마다 키를 한 번씩 누른다.
import { FOODS, STATS } from '../js/config.js';
import { pressFood, feverWarning } from '../js/game.js';

const RICE = 0, MEAT = 1, MUSH = 2, LETTUCE = 3;
const FOOD_FOR = { carb: [RICE], protein: [MEAT], vitamin: [MUSH, LETTUCE] };

// specials: 황금 고기·고추를 노리는지 (끄면 그런 게 있어도 신경 쓰지 않는다)
function makeGreedy({ specials = true } = {}) {
  return function greedy(g, pi) {
    const p = g.players[pi];
    const room = (fi) => STATS.every((s) => !FOODS[fi].gain[s] || p.stats[s] + FOODS[fi].gain[s] * 0.5 <= g.cfg.statMax);
    const order = [...STATS].sort((a, b) => p.stats[a] - p.stats[b]);
    const cooked = (fi) => g.grill.some((it) => it && it.food === fi && it.state === 'cooked');
    const goldenCooked = g.grill.some((it) => it && it.golden && it.state === 'cooked');
    const ready = p.cooldown <= 0 && p.spicy <= 0;
    const score = (fi) => Math.min(...STATS.filter((s) => FOODS[fi].gain[s] > 0).map((s) => order.indexOf(s)));

    if (ready) {
      // 1. 황금 고기가 익었으면 무조건, 고추가 나오면 바로 (상대 공격)
      if (specials && goldenCooked) return pressFood(g, pi, MEAT);
      if (specials && g.plates[LETTUCE].special === 'chili') return pressFood(g, pi, LETTUCE);
      // 2. 익은 음식 (가장 부족한 수치부터)
      const eatable = [MEAT, MUSH].filter((fi) => cooked(fi) && room(fi)).sort((a, b) => score(a) - score(b));
      if (eatable.length) return pressFood(g, pi, eatable[0]);
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
      // 익은 게 있으면 키가 '먹기'가 되므로, 올리려면 그 음식이 익은 게 없어야 한다
      for (const fi of pref) if (g.plates[fi].stock > 0 && !cooked(fi)) return pressFood(g, pi, fi);
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

  random(g, pi, rng) {
    pressFood(g, pi, Math.floor(rng() * 4));
  },

  greedy: makeGreedy(),
  plain: makeGreedy({ specials: false }),
};
