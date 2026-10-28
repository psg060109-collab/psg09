// 순수 게임 로직. DOM·Canvas를 쓰지 않아서 Node에서도 그대로 돌아간다.
import { CONFIG, FOODS, STATS, PLACE_ORDER, decayRate } from './config.js';

const MEAT = 1;
const LETTUCE = 3;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

// cfg: 난이도별 규칙은 ai.js의 rulesFor(level)로 만든다
export function createGame({ seed = Date.now(), cfg = CONFIG, feverEnabled = true, specialsEnabled = true } = {}) {
  const rng = mulberry32(seed);
  const player = () => ({
    stats: Object.fromEntries(STATS.map((s) => [s, cfg.statStart])),
    cooldown: 0,
    spicy: 0, // 남은 매운 시간 (이 동안 못 먹음)
    lock: 0, // 헛손질 뒤 남은 시간 (이 동안 아무 키도 안 먹힘)
    eaten: Object.fromEntries(FOODS.map((f) => [f.id, 0])),
    stolen: 0,
    perfect: 0,
    combo: 0, // 지금 이어지는 PERFECT 수
    bestCombo: 0,
    golden: 0,
    chili: 0,
    lastFood: null, // 앞접시에 보여줄 마지막 음식 { food, golden }
  });
  return {
    cfg,
    rng,
    seed,
    t: 0,
    players: [player(), player()],
    // special: 접시 맨 위에 올라온 특별 음식 ('golden' | 'chili' | null)
    plates: FOODS.map(() => ({ stock: cfg.plateStart, timer: 0, special: null })),
    grill: Array(cfg.grillSlots).fill(null),
    fever: {
      enabled: feverEnabled,
      start: feverEnabled ? between(rng, cfg.fever.firstMin, cfg.fever.firstMax) : Infinity,
      active: false,
      count: 0,
    },
    nextGolden: specialsEnabled ? between(rng, cfg.golden.firstMin, cfg.golden.firstMax) : Infinity,
    nextChili: specialsEnabled ? between(rng, cfg.chili.firstMin, cfg.chili.firstMax) : Infinity,
    over: null, // { winner: 0 | 1 | -1, cause: [stat|null, stat|null], time }
    events: [],
  };
}

export function feverWarning(g) {
  const f = g.fever;
  return !f.active && g.t >= f.start - g.cfg.fever.warning && g.t < f.start;
}

export function feverRemaining(g) {
  return g.fever.active ? g.fever.start + g.cfg.fever.duration - g.t : 0;
}

function emit(g, ev) {
  g.events.push(ev);
}

function updateFever(g) {
  const f = g.fever;
  const c = g.cfg.fever;
  if (!f.active && g.t >= f.start) {
    f.active = true;
    f.count++;
    emit(g, { type: 'feverStart' });
  }
  if (f.active && g.t >= f.start + c.duration) {
    f.active = false;
    f.start = g.t + between(g.rng, c.gapMin, c.gapMax);
    emit(g, { type: 'feverEnd' });
  }
}

// 특별 음식이 접시에 남아 있으면 새로 올리지 않고, 가져간 뒤부터 다음 간격을 잰다
function updateSpecials(g) {
  const cfg = g.cfg;
  const meat = g.plates[MEAT];
  if (g.t >= g.nextGolden) {
    if (!meat.special) {
      meat.special = 'golden';
      emit(g, { type: 'special', kind: 'golden', plate: MEAT });
    }
    g.nextGolden = Infinity;
  }
  const lettuce = g.plates[LETTUCE];
  if (g.t >= g.nextChili) {
    if (!lettuce.special) {
      lettuce.special = 'chili';
      emit(g, { type: 'special', kind: 'chili', plate: LETTUCE });
    }
    g.nextChili = Infinity;
  }
}

export function step(g, dt) {
  if (g.over) return;
  const cfg = g.cfg;
  g.t += dt;
  updateFever(g);
  updateSpecials(g);
  const fever = g.fever.active;

  for (const p of g.players) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.spicy = Math.max(0, p.spicy - dt);
    p.lock = Math.max(0, p.lock - dt);
  }

  // 접시 보충
  g.plates.forEach((pl, i) => {
    if (pl.stock >= cfg.plateMax) {
      pl.timer = 0;
      return;
    }
    pl.timer += dt * (fever ? cfg.fever.refillMul : 1);
    if (pl.timer >= FOODS[i].refill) {
      pl.timer -= FOODS[i].refill;
      pl.stock++;
      emit(g, { type: 'refill', plate: i });
    }
  });

  // 불판
  g.grill.forEach((it, i) => {
    if (!it) return;
    if (it.state === 'raw') {
      it.progress += dt * (fever ? cfg.fever.cookMul : 1);
      if (it.progress >= it.cookTime) {
        it.progress = it.cookTime;
        it.state = 'cooked';
        it.cookedFor = 0;
        emit(g, { type: 'cooked', slot: i });
      }
    } else if (it.state === 'cooked') {
      it.cookedFor += dt;
      if (it.cookedFor >= cfg.burnAfter) {
        it.state = 'burnt';
        it.burntFor = 0;
        emit(g, { type: 'burnt', slot: i, golden: it.golden });
      }
    } else {
      // 탄 음식은 잠시 뒤 저절로 치워진다
      it.burntFor += dt;
      if (it.burntFor >= cfg.burntClear) {
        g.grill[i] = null;
        emit(g, { type: 'discard', slot: i });
      }
    }
  });

  // 수치 감소
  const loss = decayRate(g.t, cfg) * dt;
  const dead = [null, null];
  g.players.forEach((p, pi) => {
    for (const s of STATS) {
      p.stats[s] = Math.max(0, p.stats[s] - loss);
      if (p.stats[s] <= 0 && !dead[pi]) dead[pi] = s;
    }
  });
  if (dead[0] || dead[1]) {
    const winner = dead[0] && dead[1] ? -1 : dead[0] ? 1 : 0;
    g.over = { winner, cause: dead, time: g.t };
    emit(g, { type: 'over', winner });
  }
}

function addGains(g, p, gain, mul = 1) {
  const gains = {};
  for (const s of STATS) {
    const v = Math.round(gain[s] * mul);
    if (v > 0) {
      p.stats[s] = Math.min(g.cfg.statMax, p.stats[s] + v);
      gains[s] = v;
    }
  }
  return gains;
}

function eat(g, pi, foodIndex, { golden = false, perfect = false } = {}) {
  const p = g.players[pi];
  const food = FOODS[foodIndex];
  const base = golden ? Object.fromEntries(STATS.map((s) => [s, g.cfg.golden.gain])) : food.gain;
  const mul = perfect ? comboMul(g.cfg, p.combo) : 1;
  const gains = addGains(g, p, base, mul);
  p.cooldown = g.cfg.eatCooldown;
  p.eaten[food.id]++;
  if (golden) p.golden++;
  if (perfect) p.perfect++;
  p.lastFood = { food: foodIndex, golden };
  emit(g, { type: 'eat', player: pi, food: foodIndex, gains, golden, perfect, combo: perfect ? p.combo : 0, mul });
}

// n번째 연속 PERFECT의 배수 (1번째 = perfectMul)
export function comboMul(cfg, n) {
  return Math.min(cfg.comboMax, cfg.perfectMul + cfg.comboStep * Math.max(0, n - 1));
}

function canEat(g, pi) {
  const p = g.players[pi];
  if (p.spicy > 0) return 'spicy';
  if (p.cooldown > 0) return 'cooldown';
  return null;
}

// 헛손질: 빈 접시·꽉 찬 불판·빈 칸·덜 익은 칸·탄 칸을 누르면 잠시 손이 묶인다 (연타 방지)
const FUMBLES = ['empty', 'full', 'none', 'raw', 'burnt'];
// 그중 빈 접시·덜 익은 칸은 영양도 깎인다. 0이 되면 다음 틱에 진다
const PENALIZED = ['empty', 'raw'];

function fail(g, pi, where, reason) {
  const p = g.players[pi];
  if (FUMBLES.includes(reason)) {
    p.lock = g.cfg.fumbleLock;
    p.combo = 0;
  }
  const loss = PENALIZED.includes(reason) ? g.cfg.fumblePenalty : 0;
  if (loss > 0) for (const s of STATS) p.stats[s] = Math.max(0, p.stats[s] - loss);
  emit(g, { type: 'fail', player: pi, ...where, reason, loss });
  return reason;
}

// 불판에서 이 음식 중 익은 것, 곧 탈 것부터 (황금 고기가 익었으면 그것 먼저). CPU가 칸을 고를 때 쓴다
export function findCooked(g, foodIndex) {
  let best = -1;
  g.grill.forEach((it, i) => {
    if (!it || it.food !== foodIndex || it.state !== 'cooked') return;
    if (best < 0) return void (best = i);
    const b = g.grill[best];
    if (it.golden !== b.golden ? it.golden : it.cookedFor > b.cookedFor) best = i;
  });
  return best;
}

// 접시 키 (Q W E R)
//  밥·상추: 바로 먹기 (상추 접시에 고추가 있으면 고추부터)
//  고기·버섯: 접시에서 불판 빈자리에 올리기
// 결과: 'eat' | 'chili' | 'place' | 'empty' | 'full' | 'cooldown' | 'spicy' | 'locked' | null
export function pressFood(g, pi, i) {
  if (g.over) return null;
  if (g.players[pi].lock > 0) return 'locked';
  const food = FOODS[i];
  const plate = g.plates[i];

  if (!food.grill) {
    if (plate.special === 'chili') {
      const block = canEat(g, pi);
      if (block) return fail(g, pi, { plate: i }, block);
      plate.special = null;
      g.nextChili = g.t + between(g.rng, g.cfg.chili.gapMin, g.cfg.chili.gapMax);
      const p = g.players[pi];
      const gains = addGains(g, p, g.cfg.chili.gain);
      p.cooldown = g.cfg.eatCooldown;
      p.chili++;
      g.players[1 - pi].spicy = g.cfg.chili.stun;
      emit(g, { type: 'chili', player: pi, target: 1 - pi, gains });
      return 'chili';
    }
    if (plate.stock <= 0) return fail(g, pi, { plate: i }, 'empty');
    const block = canEat(g, pi);
    if (block) return fail(g, pi, { plate: i }, block);
    plate.stock--;
    eat(g, pi, i);
    return 'eat';
  }

  const golden = plate.special === 'golden';
  if (!golden && plate.stock <= 0) return fail(g, pi, { plate: i }, 'empty');
  const slot = PLACE_ORDER[pi].find((k) => g.grill[k] === null);
  if (slot === undefined) return fail(g, pi, { plate: i }, 'full');
  if (golden) {
    plate.special = null;
    g.nextGolden = g.t + between(g.rng, g.cfg.golden.gapMin, g.cfg.golden.gapMax);
  } else plate.stock--;
  g.grill[slot] = {
    food: i,
    golden,
    state: 'raw',
    progress: 0,
    cookTime: golden ? g.cfg.golden.cookTime : food.cookTime,
    cookedFor: 0,
    owner: pi,
  };
  emit(g, { type: 'place', player: pi, slot, food: i, golden });
  return 'place';
}

// 불판 칸 키 (Shift+Q W E R = 윗줄 1~4, Shift+U I O P = 아랫줄 5~8): 그 칸의 익은 음식을 먹는다
// 결과: 'eat' | 'none' | 'raw' | 'burnt' | 'cooldown' | 'spicy' | 'locked' | null
export function pressSlot(g, pi, slot) {
  if (g.over) return null;
  if (g.players[pi].lock > 0) return 'locked';
  const it = g.grill[slot];
  if (!it) return fail(g, pi, { slot }, 'none');
  if (it.state !== 'cooked') return fail(g, pi, { slot }, it.state);
  const block = canEat(g, pi);
  if (block) return fail(g, pi, { slot }, block);
  g.grill[slot] = null;
  const stolen = it.owner !== pi;
  if (stolen) g.players[pi].stolen++;
  const perfect = it.cookedFor <= g.cfg.perfectWindow;
  const p = g.players[pi];
  p.combo = perfect ? p.combo + 1 : 0;
  p.bestCombo = Math.max(p.bestCombo, p.combo);
  eat(g, pi, it.food, { golden: it.golden, perfect });
  emit(g, { type: 'grillEat', player: pi, slot, stolen, perfect, golden: it.golden, combo: p.combo });
  return 'eat';
}
