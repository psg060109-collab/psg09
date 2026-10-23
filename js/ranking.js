// 부스 랭킹: 가장 오래 이어진 대결 TOP 5. 이 브라우저에만 저장된다.
const KEY = 'bulpan-ranking-v1';
export const RANK_SIZE = 5;

export function loadRanking(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => typeof r.time === 'number').slice(0, RANK_SIZE) : [];
  } catch {
    return [];
  }
}

export function qualifies(list, time) {
  return list.length < RANK_SIZE || time > list[list.length - 1].time;
}

export function insertRanking(list, entry) {
  return [...list, entry].sort((a, b) => b.time - a.time).slice(0, RANK_SIZE);
}

export function saveRanking(list, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 저장이 막힌 브라우저에서는 이번 세션 동안만 유지
  }
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
