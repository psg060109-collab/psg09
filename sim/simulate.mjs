// 브라우저 없이 봇끼리 대결시켜 밸런스를 확인한다.
// 사용법: node sim/simulate.mjs [판 수]
import { CONFIG } from '../js/config.js';
import { createGame, step, mulberry32 } from '../js/game.js';
import { BOTS } from './bots.mjs';

const DT = 1 / CONFIG.tickRate;

// 봇의 반응 시간(초). 사람이 한 번 누르고 다음에 누르기까지 걸리는 시간.
const REACTION = [0.22, 0.38];

export function runMatch(botA, botB, { seed = 1, feverEnabled = true, maxTime = 900, reaction = [REACTION, REACTION] } = {}) {
  const g = createGame({ seed, feverEnabled });
  const rng = mulberry32(seed * 7919 + 13);
  const bots = [BOTS[botA], BOTS[botB]];
  const delay = (pi) => reaction[pi][0] + rng() * (reaction[pi][1] - reaction[pi][0]);
  const next = [delay(0), delay(1)];
  while (!g.over && g.t < maxTime) {
    step(g, DT);
    // 같은 틱에 둘 다 누르면 순서를 무작위로
    const order = rng() < 0.5 ? [0, 1] : [1, 0];
    for (const pi of order) {
      if (g.t >= next[pi]) {
        bots[pi](g, pi, rng);
        next[pi] = g.t + delay(pi);
      }
    }
    g.events.length = 0;
  }
  return { time: g.over ? g.over.time : Infinity, winner: g.over ? g.over.winner : null, cause: g.over?.cause, g };
}

export function summarize(botA, botB, n, opts = {}) {
  const times = [];
  const causes = {};
  const wins = [0, 0, 0]; // 1P, 2P, 무승부
  for (let i = 1; i <= n; i++) {
    const r = runMatch(botA, botB, { ...opts, seed: i });
    times.push(r.time);
    if (r.winner !== null) wins[r.winner === -1 ? 2 : r.winner]++;
    for (const c of r.cause || []) if (c) causes[c] = (causes[c] || 0) + 1;
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / n;
  return { avg, min: times[0], max: times[n - 1], median: times[n >> 1], times, causes, wins };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] || 100);
  const fmt = (r) =>
    `평균 ${r.avg.toFixed(1)}s  최소 ${r.min.toFixed(1)}s  중앙 ${r.median.toFixed(1)}s  최대 ${r.max.toFixed(1)}s  패배원인 ${JSON.stringify(r.causes)}`;
  console.log('idle   vs idle   :', fmt(summarize('idle', 'idle', n)));
  console.log('random vs random :', fmt(summarize('random', 'random', n)));
  console.log('greedy vs greedy :', fmt(summarize('greedy', 'greedy', n)));
  console.log('greedy (피버 끔)  :', fmt(summarize('greedy', 'greedy', n, { feverEnabled: false })));
  const mash = summarize('random', 'greedy', n, { reaction: [[0.06, 0.09], REACTION] });
  console.log('연타(초당 ~14회) vs greedy :', fmt(mash), ` 연타 승 ${mash.wins[0]}판`);
  const g = summarize('greedy', 'greedy', n);
  console.log(`420초 초과: ${g.times.filter((t) => t > 420).length}판, 450초 초과: ${g.times.filter((t) => t > 450).length}판`);
}
