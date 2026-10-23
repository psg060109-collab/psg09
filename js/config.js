// 게임의 모든 숫자는 여기에서만 바꾼다. (design/plan.md 기준)

export const STATS = ['protein', 'carb', 'vitamin'];
export const STAT_LABEL = { protein: '단백질', carb: '탄수화물', vitamin: '비타민' };
export const STAT_SHORT = { protein: '단', carb: '탄', vitamin: '비' };

// 접시 순서 = 접시 키 순서 (Q W E R / U I O P)
export const FOODS = [
  { id: 'rice',     name: '밥',   grill: false, cookTime: 0,   gain: { protein: 0,  carb: 22, vitamin: 0  }, refill: 3.3 },
  { id: 'meat',     name: '고기', grill: true,  cookTime: 4.5, gain: { protein: 30, carb: 0,  vitamin: 0  }, refill: 5.0 },
  { id: 'mushroom', name: '버섯', grill: true,  cookTime: 3.0, gain: { protein: 5,  carb: 0,  vitamin: 22 }, refill: 5.0 },
  { id: 'lettuce',  name: '상추', grill: false, cookTime: 0,   gain: { protein: 0,  carb: 0,  vitamin: 10 }, refill: 4.5 },
];

export const CONFIG = {
  tickRate: 60,

  statStart: 60,
  statMax: 100,
  eatCooldown: 0.35,

  plateMax: 3,
  plateStart: 3,

  grillSlots: 8,
  burnAfter: 4.0, // 익은 뒤 탈 때까지 (피버와 관계없이 실제 시간)
  burntClear: 2.0, // 탄 뒤 저절로 치워질 때까지

  // 감소량/초 = base + slope × t (+ rampSlope × (t − rampStart), t > rampStart)
  decayBase: 1.0,
  decaySlope: 0.01,
  rampStart: 390,
  rampSlope: 0.08,

  fever: {
    firstMin: 60,
    firstMax: 100,
    gapMin: 50,
    gapMax: 80,
    duration: 8,
    warning: 3,
    cookMul: 4,
    refillMul: 2,
  },

  countdown: 3,
};

// 집게 키가 집는 음식 (고기, 버섯)
export const TONG_FOODS = [1, 2];

// 빈 불판 칸을 찾는 순서: 1P는 왼쪽 위부터, 2P는 오른쪽 위부터
export const PLACE_ORDER = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [3, 2, 1, 0, 7, 6, 5, 4],
];

export function decayRate(t, cfg = CONFIG) {
  let r = cfg.decayBase + cfg.decaySlope * t;
  if (t > cfg.rampStart) r += cfg.rampSlope * (t - cfg.rampStart);
  return r;
}
