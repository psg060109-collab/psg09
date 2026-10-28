// 부스 랭킹: 난이도별 최단 승리 시간 TOP 5. 이 브라우저에만 저장된다.
const KEY = 'bulpan-ranking-v2';
export const RANK_SIZE = 5;

function clean(list) {
  return Array.isArray(list) ? list.filter((r) => r && typeof r.time === 'number').slice(0, RANK_SIZE) : [];
}

// { easy: [...], normal: [...], hard: [...] }
export function loadRanking(levels, storage = globalThis.localStorage) {
  let data = {};
  try {
    data = JSON.parse(storage.getItem(KEY) || '{}') || {};
  } catch {
    data = {};
  }
  return Object.fromEntries(levels.map((lv) => [lv, clean(data[lv])]));
}

// 빨리 이길수록 좋은 기록
export function qualifies(list, time) {
  return list.length < RANK_SIZE || time < list[list.length - 1].time;
}

export function insertRanking(list, entry) {
  return [...list, entry].sort((a, b) => a.time - b.time).slice(0, RANK_SIZE);
}

export function saveRanking(ranking, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(ranking));
  } catch {
    // 저장이 막힌 브라우저에서는 이번 세션 동안만 유지
  }
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
