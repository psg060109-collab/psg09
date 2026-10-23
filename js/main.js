import { CONFIG, TONG_FOODS } from './config.js';
import { createGame, step, pressPlate, pressTongs } from './game.js';
import { attachInput } from './input.js';
import { createRenderer, W, H } from './render.js';
import { loadRanking, saveRanking, qualifies, insertRanking } from './ranking.js';

const canvas = document.getElementById('game');
const STEP = 1 / CONFIG.tickRate;
const RESULT_LOCK = 1.2; // 끝난 직후 연타로 바로 재시작되는 것 방지

let screen = 'title'; // title | keytest | countdown | play | pause | result
let game = null;
let countdown = 0;
let ranking = loadRanking();
const ui = { entering: false, name: '', ready: false, rank: 0, lock: 0 };

let renderer;
let input;

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const scale = s >= 1 ? Math.floor(s) : s;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}

function startMatch() {
  game = createGame({ seed: (Math.random() * 2 ** 31) | 0 });
  renderer.reset();
  countdown = CONFIG.countdown + 0.6;
  screen = 'countdown';
}

function finishMatch() {
  screen = 'result';
  ui.lock = RESULT_LOCK;
  ui.ready = false;
  ui.rank = 0;
  ui.name = '';
  ui.entering = qualifies(ranking, game.over.time);
}

function saveName() {
  const entry = { name: ui.name || '???', time: game.over.time, date: Date.now() };
  ranking = insertRanking(ranking, entry);
  saveRanking(ranking);
  ui.rank = ranking.indexOf(entry) + 1;
  ui.entering = false;
}

function onKey(code, action) {
  switch (screen) {
    case 'title':
      if (code === 'Space') startMatch();
      else if (code === 'KeyT') screen = 'keytest';
      break;
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
      if (action.kind === 'plate') pressPlate(game, action.player, action.index);
      else pressTongs(game, action.player, TONG_FOODS[action.index]);
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
      return renderer.drawTitle(ranking);
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

  // 검수용 훅 (자동 테스트에서 상태를 읽는다)
  window.__bulpan = { get screen() { return screen; }, get game() { return game; }, get ranking() { return ranking; }, get held() { return [...input.held]; }, ui };
}

boot();
