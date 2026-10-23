// 순수 게임 로직. DOM·Canvas를 쓰지 않아서 Node에서도 그대로 돌아간다.
import { CONFIG, FOODS, STATS, PLACE_ORDER, decayRate } from './config.js';

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

export function createGame({ seed = Date.now(), cfg = CONFIG, feverEnabled = true } = {}) {
  const rng = mulberry32(seed);
  const player = () => ({
    stats: Object.fromEntries(STATS.map((s) => [s, cfg.statStart])),
    cooldown: 0,
    eaten: Object.fromEntries(FOODS.map((f) => [f.id, 0])),
    stolen: 0,
  });
  return {
    cfg,
    rng,
    seed,
    t: 0,
    players: [player(), player()],
    plates: FOODS.map(() => ({ stock: cfg.plateStart, timer: 0 })),
    grill: Array(cfg.grillSlots).fill(null),
    fever: {
      enabled: feverEnabled,
      start: feverEnabled ? between(rng, cfg.fever.firstMin, cfg.fever.firstMax) : Infinity,
      active: false,
      count: 0,
    },
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

export function step(g, dt) {
  if (g.over) return;
  const cfg = g.cfg;
  g.t += dt;
  updateFever(g);
  const fever = g.fever.active;

  for (const p of g.players) p.cooldown = Math.max(0, p.cooldown - dt);

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
    const food = FOODS[it.food];
    if (it.state === 'raw') {
      it.progress += dt * (fever ? cfg.fever.cookMul : 1);
      if (it.progress >= food.cookTime) {
        it.progress = food.cookTime;
        it.state = 'cooked';
        it.cookedFor = 0;
        emit(g, { type: 'cooked', slot: i });
      }
    } else if (it.state === 'cooked') {
      it.cookedFor += dt;
      if (it.cookedFor >= cfg.burnAfter) {
        it.state = 'burnt';
        it.burntFor = 0;
        emit(g, { type: 'burnt', slot: i });
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

function eat(g, pi, foodIndex) {
  const p = g.players[pi];
  const food = FOODS[foodIndex];
  const gains = {};
  for (const s of STATS) {
    const before = p.stats[s];
    p.stats[s] = Math.min(g.cfg.statMax, before + food.gain[s]);
    if (food.gain[s] > 0) gains[s] = food.gain[s];
  }
  p.cooldown = g.cfg.eatCooldown;
  p.eaten[food.id]++;
  emit(g, { type: 'eat', player: pi, food: foodIndex, gains });
}

// 접시 키. 결과: 'eat' | 'place' | 'empty' | 'full' | 'cooldown' | null
export function pressPlate(g, pi, plateIndex) {
  if (g.over) return null;
  const plate = g.plates[plateIndex];
  const food = FOODS[plateIndex];
  if (plate.stock <= 0) {
    emit(g, { type: 'fail', player: pi, plate: plateIndex, reason: 'empty' });
    return 'empty';
  }
  if (!food.grill) {
    if (g.players[pi].cooldown > 0) return 'cooldown';
    plate.stock--;
    eat(g, pi, plateIndex);
    return 'eat';
  }
  const slot = PLACE_ORDER[pi].find((i) => g.grill[i] === null);
  if (slot === undefined) {
    emit(g, { type: 'fail', player: pi, plate: plateIndex, reason: 'full' });
    return 'full';
  }
  plate.stock--;
  g.grill[slot] = { food: plateIndex, state: 'raw', progress: 0, cookedFor: 0, owner: pi };
  emit(g, { type: 'place', player: pi, slot, food: plateIndex });
  return 'place';
}

// 집게 키: 그 음식 중 익은 것, 곧 탈 것부터 먹는다.
// 결과: 'eat' | 'raw'(아직 안 익음) | 'none'(불판에 없음) | 'cooldown' | null
export function pressTongs(g, pi, foodIndex) {
  if (g.over) return null;
  let best = -1;
  let anyRaw = false;
  g.grill.forEach((it, i) => {
    if (!it || it.food !== foodIndex) return;
    if (it.state === 'raw') anyRaw = true;
    else if (it.state === 'cooked' && (best < 0 || it.cookedFor > g.grill[best].cookedFor)) best = i;
  });
  if (best < 0) {
    const reason = anyRaw ? 'raw' : 'none';
    emit(g, { type: 'fail', player: pi, tongs: foodIndex, reason });
    return reason;
  }
  if (g.players[pi].cooldown > 0) return 'cooldown';
  const it = g.grill[best];
  g.grill[best] = null;
  const stolen = it.owner !== pi;
  if (stolen) g.players[pi].stolen++;
  eat(g, pi, it.food);
  emit(g, { type: 'grillEat', player: pi, slot: best, stolen });
  return 'eat';
}
