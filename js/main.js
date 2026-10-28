import { CONFIG } from './config.js';
import { createGame, step, pressFood } from './game.js';
import { createCpu, DIFFICULTY, LEVELS } from './ai.js';
import { attachInput } from './input.js';
import { createRenderer, W, H } from './render.js';
import { loadRanking, saveRanking, qualifies, insertRanking } from './ranking.js';

const canvas = document.getElementById('game');
const STEP = 1 / CONFIG.tickRate;
const RESULT_LOCK = 1.2; // 끝난 직후 연타로 바로 재시작되는 것 방지
const LEVEL_KEY = 'bulpan-level';

let screen = 'title'; // title | keytest | countdown | play | pause | result
let game = null;
let cpu = null;
let countdown = 0;
let ranking = loadRanking(LEVELS);
let level = loadLevel();
const ui = { entering: false, name: '', ready: false, rank: 0, lock: 0, cpuPaused: false };

let renderer;
let input;

function loadLevel() {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    return LEVELS.includes(v) ? v : 'easy';
  } catch {
    return 'easy';
  }
}

function setLevel(v) {
  level = v;
  try {
    localStorage.setItem(LEVEL_KEY, v);
  } catch {
    // 저장이 막혀 있어도 이번 세션 동안은 유지
  }
}

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const scale = s >= 1 ? Math.floor(s) : s;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}

function startMatch() {
  const seed = (Math.random() * 2 ** 31) | 0;
  game = createGame({ seed });
  cpu = createCpu(level, 1, seed ^ 0x5bd1e995);
  renderer.reset();
  renderer.setLabels(['나', `CPU ${DIFFICULTY[level].label}`]);
  countdown = CONFIG.countdown + 0.6;
  screen = 'countdown';
}

function finishMatch() {
  screen = 'result';
  ui.lock = RESULT_LOCK;
  ui.ready = false;
  ui.rank = 0;
  ui.name = '';
  ui.entering = game.over.winner === 0 && qualifies(ranking[level], game.over.time);
}

function saveName() {
  const entry = { name: ui.name || '???', time: game.over.time, date: Date.now() };
  ranking = { ...ranking, [level]: insertRanking(ranking[level], entry) };
  saveRanking(ranking);
  ui.rank = ranking[level].indexOf(entry) + 1;
  ui.entering = false;
}

function onKey(code, action) {
  switch (screen) {
    case 'title': {
      const i = LEVELS.indexOf(level);
      if (code === 'Space') startMatch();
      else if (code === 'KeyT') screen = 'keytest';
      else if (code === 'ArrowLeft') setLevel(LEVELS[Math.max(0, i - 1)]);
      else if (code === 'ArrowRight') setLevel(LEVELS[Math.min(LEVELS.length - 1, i + 1)]);
      else if (/^Digit[1-3]$/.test(code)) setLevel(LEVELS[Number(code.slice(5)) - 1]);
      break;
    }
    case 'keytest':
      if (code === 'Escape') screen = 'title';
      break;
    case 'countdown':
      if (code === 'Escape') screen = 'title';
      break;
    case 'play':
      if (code === 'Escape') {
        screen = 'pause';
        return;
      }
      if (!action) return;
      pressFood(game, action.player, action.index);
      break;
    case 'pause':
      if (code === 'Escape') screen = 'play';
      else if (code === 'Backspace') screen = 'title';
      break;
    case 'result':
      if (ui.lock > 0) return;
      if (ui.entering) {
        const ch = /^Key([A-Z])$/.exec(code)?.[1] || /^Digit(\d)$/.exec(code)?.[1];
        if (ch && ui.name.length < 3) ui.name += ch;
        else if (code === 'Backspace') ui.name = ui.name.slice(0, -1);
        else if (code === 'Enter' && ui.name.length > 0) {
          saveName();
          ui.ready = true;
        } else if (code === 'Escape') {
          ui.entering = false;
          ui.ready = true;
        }
        return;
      }
      if (code === 'Space') startMatch();
      else if (code === 'Escape') screen = 'title';
      break;
  }
}

function update(dt) {
  if (screen === 'countdown') {
    countdown -= dt;
    if (countdown <= 0) screen = 'play';
  } else if (screen === 'play') {
    step(game, dt);
    if (!ui.cpuPaused) cpu.update(game);
    if (game.over) finishMatch();
  } else if (screen === 'result') {
    if (ui.lock > 0) {
      ui.lock -= dt;
      if (ui.lock <= 0 && !ui.entering) ui.ready = true;
    }
  }
  if (game) {
    renderer.consume(game.events);
    game.events.length = 0;
  }
  renderer.update(dt, screen === 'play' ? game : null);
}

function draw() {
  switch (screen) {
    case 'title':
      return renderer.drawTitle(ranking[level], level);
    case 'keytest':
      return renderer.drawKeyTest(input.held);
    case 'countdown':
      return renderer.drawCountdown(game, Math.ceil(countdown - 0.6));
    case 'play':
      return renderer.drawGame(game);
    case 'pause':
      return renderer.drawPause(game);
    case 'result':
      return renderer.drawResult(game, ui);
  }
}

async function boot() {
  fit();
  window.addEventListener('resize', fit);
  try {
    await Promise.race([document.fonts.load('12px Galmuri'), new Promise((r) => setTimeout(r, 2000))]);
  } catch {
    // 폰트를 못 받아도 기본 글꼴로 진행
  }
  renderer = createRenderer(canvas);
  input = attachInput(window, onKey);

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 검수용 훅 (자동 테스트에서 상태를 읽고, CPU를 잠시 멈출 수 있다)
  window.__bulpan = {
    get screen() { return screen; },
    get game() { return game; },
    get ranking() { return ranking; },
    get level() { return level; },
    get held() { return [...input.held]; },
    ui,
  };
}

boot();
