// 밸런스 검수용 봇. 사람처럼 일정 간격(반응 시간)마다 키를 한 번씩 누른다.
import { FOODS, STATS } from '../js/config.js';
import { pressPlate, pressSlot, feverWarning } from '../js/game.js';

const FOOD_FOR = { carb: [0], protein: [1], vitamin: [2, 3] };

export const BOTS = {
  idle() {},

  random(g, pi, rng) {
    const k = Math.floor(rng() * 12);
    if (k < 4) pressPlate(g, pi, k);
    else pressSlot(g, pi, k - 4);
  },

  greedy(g, pi) {
    const p = g.players[pi];
    const room = (fi) => STATS.every((s) => !FOODS[fi].gain[s] || p.stats[s] + FOODS[fi].gain[s] * 0.5 <= g.cfg.statMax);
    const order = [...STATS].sort((a, b) => p.stats[a] - p.stats[b]);

    // 1. 익은 음식 먹기 (가장 부족한 수치를 채우는 것부터)
    if (p.cooldown <= 0) {
      const cooked = g.grill
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => it && it.state === 'cooked' && room(it.food));
      cooked.sort((a, b) => score(a.it.food) - score(b.it.food));
      if (cooked.length) return pressSlot(g, pi, cooked[0].i);
    }
    function score(fi) {
      return Math.min(...STATS.filter((s) => FOODS[fi].gain[s] > 0).map((s) => order.indexOf(s)));
    }

    // 2. 가장 부족한 수치를 바로 먹을 수 있는 음식으로
    if (p.cooldown <= 0) {
      for (const s of order) {
        if (p.stats[s] > 70) break;
        for (const fi of FOOD_FOR[s]) {
          if (!FOODS[fi].grill && g.plates[fi].stock > 0 && room(fi)) return pressPlate(g, pi, fi);
        }
      }
    }

    // 3. 불판 채우기 (피버 예고 중에는 가득)
    const empty = g.grill.filter((x) => x === null).length;
    const mine = g.grill.filter((x) => x && x.owner === pi).length;
    const want = feverWarning(g) || g.fever.active ? g.cfg.grillSlots : g.cfg.grillSlots / 2;
    if (empty > 0 && mine < want) {
      const need = order.find((s) => s === 'protein' || s === 'vitamin');
      const pref = need === 'protein' ? [1, 2] : [2, 1];
      for (const fi of pref) if (g.plates[fi].stock > 0) return pressPlate(g, pi, fi);
    }

    // 4. 탄 음식 치우기
    const burnt = g.grill.findIndex((x) => x && x.state === 'burnt');
    if (burnt >= 0) return pressSlot(g, pi, burnt);

    // 5. 여유가 있으면 바로 먹는 음식으로 수치 보충
    if (p.cooldown <= 0) {
      for (const s of order) for (const fi of FOOD_FOR[s]) {
        if (!FOODS[fi].grill && g.plates[fi].stock > 0 && room(fi)) return pressPlate(g, pi, fi);
      }
    }
  },
};
