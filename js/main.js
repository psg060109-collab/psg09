import { CONFIG } from './config.js';
import { createGame, step, pressFood, pressSlot } from './game.js';
import { createCpu, rulesFor, DIFFICULTY, LEVELS } from './ai.js';
import { attachInput } from './input.js';
import { createRenderer, hitTest, ENDING, W, H } from './render.js';
import { loadRanking, saveRanking, qualifies, insertRanking } from './ranking.js';
import { createAudio, soundsFor } from './audio.js';

const canvas = document.getElementById('game');
const STEP = 1 / CONFIG.tickRate;
const SKIP_AFTER = 0.8; // 승패 연출은 이 시간이 지나면 건너뛸 수 있다 (그 전 입력은 무시: 연타로 넘어가는 것 방지)
const LEVEL_KEY = 'bulpan-level';

let screen = 'title'; // title | help | keytest | countdown | play | pause | result
let game = null;
let cpu = null;
let countdown = 0;
let ranking = loadRanking(LEVELS);
let level = loadLevel();
const ui = { entering: false, name: '', ready: false, rank: 0, lock: 0, anim: 0, cpuPaused: false };

let renderer;
let input;
let touchMode = false;
const audio = createAudio();
let lastCount = 0; // 카운트다운 숫자가 바뀔 때 삑

function setTouchMode(v) {
  if (touchMode === v) return;
  touchMode = v;
  renderer.setTouch(v);
  syncNameForm();
}

// 휴대폰에서는 시작할 때 전체 화면 + 가로 고정을 시도한다 (안 되는 브라우저는 조용히 넘어감)
function goFullscreen() {
  const el = document.documentElement;
  Promise.resolve()
    .then(() => (document.fullscreenElement || !el.requestFullscreen ? null : el.requestFullscreen()))
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

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

// 큰 화면은 정수배로 또렷하게, 휴대폰처럼 작은 화면은 꽉 차게
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const scale = s >= 2 ? Math.floor(s) : s;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}

function startMatch() {
  const seed = (Math.random() * 2 ** 31) | 0;
  game = createGame({ seed, cfg: rulesFor(level) });
  cpu = createCpu(level, 1, seed ^ 0x5bd1e995);
  renderer.reset();
  renderer.setLabels(['나', `CPU ${DIFFICULTY[level].label}`]);
  countdown = CONFIG.countdown + 0.6;
  lastCount = 0;
  screen = 'countdown';
}

function finishMatch() {
  screen = 'result';
  ui.anim = 0;
  ui.lock = ENDING;
  ui.ready = false;
  ui.rank = 0;
  ui.name = '';
  ui.entering = game.over.winner === 0 && qualifies(ranking[level], game.over.time);
  audio.play(game.over.winner === 0 ? 'win' : game.over.winner === 1 ? 'lose' : 'go');
}

// 터치 모드의 이름 입력: 휴대폰 키보드가 뜨는 진짜 입력창
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

function syncNameForm() {
  const show = touchMode && screen === 'result' && ui.entering && ui.lock <= 0;
  if (nameForm.hidden === !show) return;
  nameForm.hidden = !show;
  if (show) {
    nameInput.value = '';
    nameInput.focus();
  }
}

nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  if (!v) return;
  ui.name = v;
  saveName();
  ui.ready = true;
  nameInput.blur();
  syncNameForm();
});
document.getElementById('name-skip').addEventListener('click', () => {
  ui.entering = false;
  ui.ready = true;
  nameInput.blur();
  syncNameForm();
});

function saveName() {
  const entry = { name: ui.name || '???', time: game.over.time, date: Date.now() };
  ranking = { ...ranking, [level]: insertRanking(ranking[level], entry) };
  saveRanking(ranking);
  ui.rank = ranking[level].indexOf(entry) + 1;
  ui.entering = false;
}

function toggleSound() {
  renderer.setMuted(audio.toggle());
  audio.unlock();
}

function onKey(code, action) {
  setTouchMode(false);
  audio.unlock();
  // M: 소리 켜기/끄기 (이름 입력 중에는 글자)
  if (code === 'KeyM' && !(screen === 'result' && ui.entering)) return toggleSound();
  switch (screen) {
    case 'title': {
      const i = LEVELS.indexOf(level);
      if (code === 'Space') startMatch();
      else if (code === 'KeyT') screen = 'keytest';
      else if (code === 'KeyH') screen = 'help';
      else if (code === 'ArrowLeft') setLevel(LEVELS[Math.max(0, i - 1)]);
      else if (code === 'ArrowRight') setLevel(LEVELS[Math.min(LEVELS.length - 1, i + 1)]);
      else if (/^Digit[1-3]$/.test(code)) setLevel(LEVELS[Number(code.slice(5)) - 1]);
      break;
    }
    case 'keytest':
      if (code === 'Escape') screen = 'title';
      break;
    case 'help':
      if (code === 'Escape' || code === 'KeyH' || code === 'Space') screen = 'title';
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
      if (action.kind === 'plate') pressFood(game, 0, action.index);
      else pressSlot(game, 0, action.index);
      break;
    case 'pause':
      if (code === 'Escape') screen = 'play';
      else if (code === 'Backspace') screen = 'title';
      break;
    case 'result':
      if (skipEnding()) return;
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

// 승패 연출 중 입력: SKIP_AFTER가 지났으면 연출을 끝내고 결과판으로. 입력을 썼으면 true
function skipEnding() {
  if (screen !== 'result' || ui.anim >= ENDING) return false;
  if (ui.anim >= SKIP_AFTER) {
    ui.anim = ENDING;
    ui.lock = Math.min(ui.lock, 0.25);
  }
  return true;
}

// 탭·클릭: 화면마다 누른 곳의 동작을 키 입력과 똑같이 처리한다
function onTap(x, y) {
  audio.unlock();
  if (skipEnding()) return;
  const hit = hitTest(screen, x, y, { game, level, ui });
  if (!hit) return;
  switch (hit.type) {
    case 'sound':
      toggleSound();
      break;
    case 'level':
      setLevel(hit.level);
      break;
    case 'start':
    case 'retry':
      if (touchMode) goFullscreen();
      startMatch();
      break;
    case 'help':
      screen = 'help';
      break;
    case 'back':
    case 'title':
      screen = 'title';
      break;
    case 'pause':
      screen = 'pause';
      break;
    case 'resume':
      screen = 'play';
      break;
    case 'plate':
      pressFood(game, 0, hit.index);
      break;
    case 'slot':
      pressSlot(game, 0, hit.index);
      break;
  }
}

function update(dt) {
  if (screen === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown - 0.6);
    if (n !== lastCount && n > 0) audio.play('beep');
    lastCount = n;
    if (countdown <= 0) {
      screen = 'play';
      audio.play('go');
    }
  } else if (screen === 'play') {
    step(game, dt);
    if (!ui.cpuPaused) cpu.update(game);
    // 위기 심장 소리: 내 수치 중 가장 낮은 것이 dangerAt 아래로 내려갈수록 빨리
    const min = Math.min(...Object.values(game.players[0].stats));
    audio.heartbeat(dt, game.over ? 0 : Math.max(0, 1 - min / game.cfg.dangerAt));
    if (game.over) finishMatch();
  } else if (screen === 'result') {
    ui.anim += dt;
    if (ui.lock > 0) {
      ui.lock -= dt;
      if (ui.lock <= 0 && !ui.entering) ui.ready = true;
    }
  }
  syncNameForm();
  if (screen !== 'play') audio.heartbeat(dt, 0);
  if (game) {
    soundsFor(audio, game.events);
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
    case 'help':
      return renderer.drawHelp(level);
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
  renderer.setMuted(audio.muted);
  input = attachInput(window, onKey);
  setTouchMode(window.matchMedia?.('(pointer: coarse)').matches ?? false);
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerType !== 'mouse') setTouchMode(true);
    const r = canvas.getBoundingClientRect();
    onTap(((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height);
  });

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
    get touch() { return touchMode; },
    get muted() { return audio.muted; },
    ui,
  };
}

boot();
