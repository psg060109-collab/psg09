// 실제 브라우저(Chromium)로 완료 기준을 확인한다.
// 사용법: npm i -D playwright && node tests/browser.mjs
//   (Playwright가 다른 곳에 깔려 있으면 PLAYWRIGHT_MODULE=/경로/playwright/index.mjs)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = path || 'index.html';
  try {
    const body = await readFile(join(ROOT, file));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/`;

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
  } catch (e) {
    results.push([false, name, e.message]);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function openPage(width = 1920, height = 1080) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL_);
  await page.waitForFunction(() => window.__bulpan);
  return page;
}
const state = (page, expr) => page.evaluate(`(() => { const B = window.__bulpan; return ${expr}; })()`);
const until = (page, expr, timeout = 8000) => page.waitForFunction(`(() => { const B = window.__bulpan; return ${expr}; })()`, null, { timeout });
// 한/영 상태와 무관한지 보려고 key에는 한글 자모를 넣고 code만 맞춘다
const sendKey = (page, code, extra = {}) =>
  page.evaluate(([code, extra]) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: 'ㅂ', bubbles: true, ...extra }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: 'ㅂ', bubbles: true }));
  }, [code, extra]);

const page = await openPage();

await check('타이틀에서 ←→·숫자키로 CPU 난이도를 고르고, 새로고침해도 기억한다', async () => {
  assert((await state(page, 'B.level')) === 'easy');
  await page.keyboard.press('ArrowRight');
  assert((await state(page, 'B.level')) === 'normal');
  await page.keyboard.press('Digit3');
  assert((await state(page, 'B.level')) === 'hard');
  await page.reload();
  await page.waitForFunction(() => window.__bulpan);
  assert((await state(page, 'B.level')) === 'hard');
  await page.keyboard.press('Digit1');
});

await check('타이틀에서 H로 자세한 규칙을 열고 ESC로 돌아온다', async () => {
  await page.keyboard.press('KeyH');
  assert((await state(page, 'B.screen')) === 'help');
  await page.keyboard.press('Escape');
  assert((await state(page, 'B.screen')) === 'title');
});

await check('Space → 3-2-1 카운트다운 후 타이머가 0부터 올라간다', async () => {
  assert((await state(page, 'B.screen')) === 'title');
  await page.keyboard.press('Space');
  assert((await state(page, 'B.screen')) === 'countdown');
  await until(page, "B.screen === 'play'");
  const t1 = await state(page, 'B.game.t');
  await page.waitForTimeout(500);
  const t2 = await state(page, 'B.game.t');
  assert(t1 < 0.3 && t2 > t1, `${t1} → ${t2}`);
});

await check('CPU가 스스로 움직인다 (몇 초 안에 먹거나 불판에 올림)', async () => {
  await until(page, 'Object.values(B.game.players[1].eaten).some((n) => n > 0) || B.game.grill.some((x) => x && x.owner === 1)', 5000);
  // 이후 플레이어 조작 검사는 CPU를 멈추고 한다
  await page.evaluate(() => {
    window.__bulpan.ui.cpuPaused = true;
    const g = window.__bulpan.game;
    g.grill = g.grill.map(() => null);
    g.plates.forEach((p) => (p.stock = 3));
    g.players[0].cooldown = 0;
  });
});

await check('한/영 상태와 관계없이 Q(ㅂ)로 1P가 밥을 먹는다', async () => {
  const before = await state(page, 'B.game.players[0].stats.carb');
  await sendKey(page, 'KeyQ');
  const after = await state(page, 'B.game.players[0].stats.carb');
  assert(after > before + 20, `${before} → ${after}`);
});

await check('키를 꾹 누르고 있어도(반복 입력) 한 번만 처리된다', async () => {
  await page.waitForTimeout(400);
  const stock = await state(page, 'B.game.plates[3].stock');
  await sendKey(page, 'KeyR');
  await page.waitForTimeout(400);
  await sendKey(page, 'KeyR', { repeat: true });
  await sendKey(page, 'KeyR', { repeat: true });
  assert((await state(page, 'B.game.plates[3].stock')) === stock - 1);
});

await check('W로 고기를 올리고, 익으면 Shift+Q로 1번 칸을 먹는다', async () => {
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyW');
  assert((await state(page, 'B.game.grill[0]?.owner')) === 0);
  await until(page, "B.game.grill[0]?.state === 'cooked'");
  const before = await state(page, 'B.game.players[0].stats.protein');
  await page.keyboard.press('Shift+KeyQ');
  assert((await state(page, 'B.game.grill[0]')) === null);
  assert((await state(page, 'B.game.players[0].stats.protein')) > before + 25);
});

await check('Shift+U로 아랫줄 5번 칸의 CPU 버섯을 뺏어 먹고, 탄 음식은 저절로 사라진다', async () => {
  await page.evaluate(() => {
    const g = window.__bulpan.game;
    g.grill[4] = { food: 2, golden: false, state: 'cooked', progress: 3, cookTime: 3, cookedFor: 1, owner: 1 };
    g.grill[7] = { food: 1, golden: false, state: 'burnt', progress: 4.5, cookTime: 4.5, cookedFor: 4, burntFor: 0, owner: 1 };
  });
  await page.waitForTimeout(600);
  await page.keyboard.press('Shift+KeyU');
  assert((await state(page, 'B.game.grill[4]')) === null, '버섯을 먹지 않음');
  assert((await state(page, 'B.game.players[0].stolen')) === 1);
  await until(page, 'B.game.grill[7] === null', 4000);
});

await check('고추를 먹으면 CPU 자리에 매운 상태가 걸린다', async () => {
  await page.evaluate(() => {
    window.__bulpan.game.plates[3].special = 'chili';
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyR');
  assert((await state(page, 'B.game.players[1].spicy')) > 1.5);
  assert((await state(page, 'B.game.players[0].chili')) === 1);
  await until(page, 'B.game.players[1].spicy === 0', 4000);
});

await check('Shift 없이 누른 U·I·O·P는 아무 일도 하지 않는다', async () => {
  const snap = await state(page, 'JSON.stringify(B.game.plates.map((p) => p.stock))');
  for (const k of ['KeyU', 'KeyI', 'KeyO', 'KeyP']) await page.keyboard.press(k);
  assert((await state(page, 'JSON.stringify(B.game.plates.map((p) => p.stock))')) === snap);
});

await check('덜 익은 칸을 Shift로 누르면 헛손질로 잠깐 잠긴다', async () => {
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__bulpan.game.grill[3] = { food: 1, golden: false, state: 'raw', progress: 0, cookTime: 99, cookedFor: 0, owner: 0 };
  });
  await page.keyboard.press('Shift+KeyR');
  assert((await state(page, 'B.game.players[0].lock')) > 0.3);
  assert((await state(page, 'B.game.grill[3]?.state')) === 'raw');
});

await check('ESC로 일시정지하면 시간이 멈추고, 다시 ESC로 계속된다', async () => {
  await page.keyboard.press('Escape');
  const t1 = await state(page, 'B.game.t');
  await page.waitForTimeout(300);
  assert((await state(page, 'B.game.t')) === t1);
  await page.keyboard.press('Escape');
  assert((await state(page, 'B.screen')) === 'play');
});

await check('최악 장면(피버 + 8칸 굽기 + 황금 고기 + 매운 상태 + 파티클)에서도 55fps 이상', async () => {
  await page.evaluate(() => {
    const g = window.__bulpan.game;
    g.fever.start = g.t;
    for (const p of g.players) for (const s in p.stats) p.stats[s] = 100;
    g.plates[1].special = 'golden';
    g.players[0].spicy = 99;
    g.grill = g.grill.map((_, i) => ({ food: 1 + (i % 2), golden: i === 2, state: i % 3 === 0 ? 'burnt' : 'raw', progress: 0, cookTime: 9999, cookedFor: 0, burntFor: -9999, owner: i % 2 }));
  });
  const fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        function f() {
          n++;
          const p = window.__bulpan.game.players;
          for (const pl of p) for (const s in pl.stats) pl.stats[s] = 100;
          if (performance.now() - t0 < 2000) requestAnimationFrame(f);
          else res((n * 1000) / (performance.now() - t0));
        }
        requestAnimationFrame(f);
      }),
  );
  assert(fps >= 55, `fps ${fps.toFixed(1)}`);
});

await check('CPU 수치가 0이 되면 승리 결과 화면, 패배 원인 표시, 직후 연타로는 재시작되지 않는다', async () => {
  await page.evaluate(() => {
    window.__bulpan.game.players[1].stats.vitamin = 0.001;
  });
  await until(page, "B.screen === 'result'");
  assert((await state(page, 'B.game.over.winner')) === 0);
  assert((await state(page, 'B.game.over.cause[1]')) === 'vitamin');
  await page.keyboard.press('Space');
  assert((await state(page, 'B.screen')) === 'result', '결과 화면 직후 Space에 재시작됨');
});

await check('이기면 난이도별 최단 승리 TOP 5에 이름을 저장하고, 새로고침해도 남아 있다', async () => {
  await until(page, 'B.ui.lock <= 0', 5000);
  assert((await state(page, 'B.ui.entering')) === true);
  for (const k of ['KeyA', 'KeyB', 'Digit7', 'KeyX']) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
  const list = await state(page, 'B.ranking.easy');
  assert(list[0].name === 'AB7', JSON.stringify(list));
  await page.reload();
  await page.waitForFunction(() => window.__bulpan);
  const after = await state(page, 'B.ranking');
  assert(after.easy.length === 1 && after.easy[0].name === 'AB7' && after.hard.length === 0, JSON.stringify(after));
});

await check('다시 하기(Space)는 수치·접시·불판을 모두 초기화한다', async () => {
  await page.keyboard.press('Space');
  await until(page, "B.screen === 'play'");
  await page.keyboard.press('KeyW');
  await page.evaluate(() => {
    window.__bulpan.game.players[0].stats.carb = 0.001;
  });
  await until(page, "B.screen === 'result'");
  await until(page, 'B.ui.lock <= 0', 5000);
  assert((await state(page, 'B.ui.entering')) === false, '졌는데 랭킹 입력이 뜸');
  await page.keyboard.press('Space');
  await until(page, "B.screen === 'countdown'");
  const fresh = await state(
    page,
    "B.game.t === 0 && B.game.grill.every((x) => x === null) && B.game.plates.every((p) => p.stock === 3) && B.game.players.every((p) => Object.values(p.stats).every((v) => v === 60))",
  );
  assert(fresh === true);
});

await check('키 테스트 모드에서 Shift와 함께 여러 키를 동시에 누르면 모두 인식된다', async () => {
  await page.reload();
  await page.waitForFunction(() => window.__bulpan);
  await page.keyboard.press('KeyT');
  assert((await state(page, 'B.screen')) === 'keytest');
  const keys = ['ShiftLeft', 'KeyQ', 'KeyW', 'KeyU', 'KeyI'];
  for (const k of keys) await page.keyboard.down(k);
  const held = await state(page, 'B.held');
  assert(keys.every((k) => held.includes(k)), JSON.stringify(held));
  for (const k of keys) await page.keyboard.up(k);
  await page.keyboard.press('Escape');
  assert((await state(page, 'B.screen')) === 'title');
});

await check('승패 연출: 끝나면 약 2초 애니메이션 → 0.8초 전 입력은 무시, 그 뒤 아무 키로 건너뛰면 결과판', async () => {
  await page.keyboard.press('Space');
  await until(page, "B.screen === 'play'");
  await page.evaluate(() => { window.__bulpan.game.players[0].stats.carb = 0.001; });
  await until(page, "B.screen === 'result'");
  await page.keyboard.press('Space');
  assert((await state(page, 'B.screen')) === 'result' && (await state(page, 'B.ui.ready')) === false, '연출 직후 입력에 넘어감');
  await until(page, 'B.ui.anim > 0.9');
  assert((await state(page, 'B.ui.ready')) === false, '아직 결과판이 아니어야 함');
  await page.keyboard.press('KeyX');
  await until(page, 'B.ui.ready === true', 2000);
  assert((await state(page, 'B.screen')) === 'result', '건너뛰기가 재시작까지 하면 안 됨');
  await page.keyboard.press('Escape');
});

await check('난이도 규칙이 경기에 적용되고(어려움: 감소 x3.3·1.8초에 탐·벌점 12), M으로 소리를 끄고 켠다', async () => {
  assert((await state(page, 'B.screen')) === 'title');
  const before = await state(page, 'B.level');
  const m0 = await state(page, 'B.muted');
  await page.keyboard.press('KeyM');
  assert((await state(page, 'B.muted')) === !m0, 'M 끄기');
  await page.keyboard.press('KeyM');
  assert((await state(page, 'B.muted')) === m0, 'M 켜기');
  await page.keyboard.press('Digit3');
  await page.keyboard.press('Space');
  await until(page, "B.screen === 'play'");
  const cfg = await page.evaluate(() => { const c = window.__bulpan.game.cfg; return [c.decayMul, c.burnAfter, c.fumblePenalty]; });
  assert(cfg.join() === '3.3,1.8,12', cfg.join());
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.keyboard.press(`Digit${['easy', 'normal', 'hard'].indexOf(before) + 1}`);
  assert((await state(page, 'B.level')) === before);
});

await check('카운트다운 중 ESC, 일시정지 중 BACKSPACE로 타이틀에 돌아간다', async () => {
  await page.keyboard.press('Escape');
  assert((await state(page, 'B.screen')) === 'title');
  await page.keyboard.press('Space');
  assert((await state(page, 'B.screen')) === 'countdown');
  await page.keyboard.press('Escape');
  assert((await state(page, 'B.screen')) === 'title', '카운트다운 ESC');
  await page.keyboard.press('Space');
  await until(page, "B.screen === 'play'");
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  assert((await state(page, 'B.screen')) === 'title', '일시정지 BACKSPACE');
});

await check('둘이 같은 순간 쓰러지면 무승부 화면이 뜨고 랭킹 입력은 없다', async () => {
  await page.keyboard.press('Space');
  await until(page, "B.screen === 'play'");
  await page.evaluate(() => {
    const g = window.__bulpan.game;
    g.players[0].stats.carb = 0.001;
    g.players[1].stats.vitamin = 0.001;
  });
  await until(page, "B.screen === 'result'");
  assert((await state(page, 'B.game.over.winner')) === -1);
  await until(page, 'B.ui.lock <= 0', 5000);
  assert((await state(page, 'B.ui.entering')) === false);
  await page.keyboard.press('Escape');
});

await check('브라우저 저장소가 막혀 있어도 부팅·플레이·결과까지 에러 없이 된다', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL_);
  await p.waitForFunction(() => window.__bulpan);
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Space');
  await p.waitForFunction(() => window.__bulpan.screen === 'play');
  await p.evaluate(() => { window.__bulpan.game.players[1].stats.carb = 0.001; });
  await p.waitForFunction(() => window.__bulpan.screen === 'result');
  await p.waitForFunction(() => window.__bulpan.ui.lock <= 0, null, { timeout: 5000 });
  for (const k of ['KeyA', 'KeyB', 'KeyC', 'Enter']) await p.keyboard.press(k);
  const ranked = await p.evaluate(() => window.__bulpan.ranking.normal[0]?.name);
  await ctx.close();
  assert(errs.length === 0, errs.join('\n'));
  assert(ranked === 'ABC', '이번 세션 동안은 랭킹이 유지돼야 함');
});

for (const [w, h] of [[1366, 768], [1920, 1080], [1280, 720]]) {
  await check(`${w}×${h} 화면에서 잘리지 않는다`, async () => {
    const p = await openPage(w, h);
    const box = await p.evaluate(() => {
      const r = document.getElementById('game').getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight };
    });
    await p.close();
    assert(box.l >= 0 && box.t >= 0 && box.r <= w && box.b <= h && box.sw <= w && box.sh <= h, JSON.stringify(box));
  });
}

await check('통째 플레이: 상태를 건드리지 않고 부팅→시작→CPU 혼자 먹음→내가 굶어서 패배까지 자연스럽게 흘러간다', async () => {
  const p = await openPage(1366, 768);
  await p.keyboard.press('Space');
  await p.waitForFunction(() => window.__bulpan.screen === 'play');
  await p.waitForFunction(() => window.__bulpan.screen === 'result', null, { timeout: 70000, polling: 500 });
  const r = await p.evaluate(() => {
    const g = window.__bulpan.game;
    return { winner: g.over.winner, time: g.over.time, cpuAte: Object.values(g.players[1].eaten).reduce((a, b) => a + b, 0), cause: g.over.cause[0] };
  });
  await p.close();
  assert(r.winner === 1 && r.cause, JSON.stringify(r));
  // 기본 난이도(쉬움)는 감소 1.8배라 아무것도 안 하면 약 28초에 쓰러진다
  assert(r.time > 22 && r.time < 34, `쓰러진 시간 ${r.time}`);
  assert(r.cpuAte > 10, `CPU가 먹은 수 ${r.cpuAte}`);
});

await check('휴대폰(iPhone 가로): 탭만으로 난이도·시작·올리기·먹기·일시정지·이름 저장·다시 하기, 세로면 회전 안내', async () => {
  const { devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL_);
  await p.waitForFunction(() => window.__bulpan);
  const tap = async (x, y) => {
    const r = await p.evaluate(() => {
      const b = document.getElementById('game').getBoundingClientRect();
      return [b.left, b.top, b.width, b.height];
    });
    await p.touchscreen.tap(r[0] + (x * r[2]) / 640, r[1] + (y * r[3]) / 360);
    await p.waitForTimeout(60);
  };
  const st = (e) => state(p, e);
  assert((await st('B.touch')) === true, '터치 모드가 아님');
  const [cw, , vw, vh] = await p.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return [r.width, r.height, innerWidth, innerHeight];
  });
  assert(cw > vw * 0.75 || cw >= (vh * 640) / 360 - 2, `화면을 덜 채움 ${cw}/${vw}`);
  await tap(320, 244);
  assert((await st('B.level')) === 'normal', '난이도 탭');
  await tap(320, 320);
  await p.waitForFunction(() => window.__bulpan.screen === 'play');
  await p.evaluate(() => { window.__bulpan.ui.cpuPaused = true; });
  await tap(284, 86);
  assert((await st('B.game.grill[0]?.food')) === 1, '고기 접시 탭 → 불판');
  await tap(212, 86);
  assert((await st('B.game.players[0].eaten.rice')) === 1, '밥 접시 탭 → 먹기');
  await p.waitForFunction(() => window.__bulpan.game.grill[0]?.state === 'cooked', null, { timeout: 8000 });
  await tap(215, 164);
  assert((await st('B.game.players[0].eaten.meat')) === 1, '익은 고기 탭 → 먹기');
  await tap(320, 18);
  assert((await st('B.screen')) === 'pause', '타이머 탭 → 일시정지');
  await tap(244, 212);
  assert((await st('B.screen')) === 'play', '계속하기');
  await p.evaluate(() => { window.__bulpan.game.players[1].stats.carb = 0.01; });
  await p.waitForFunction(() => window.__bulpan.screen === 'result');
  await p.waitForFunction(() => window.__bulpan.ui.lock <= 0, null, { timeout: 5000 });
  assert((await p.evaluate(() => !document.getElementById('name-form').hidden)) === true, '이름 입력창');
  await p.fill('#name-input', 'kim9');
  await p.click('#name-form button[type=submit]');
  assert((await st('B.ranking.normal[0]?.name')) === 'KIM', '이름 저장');
  await tap(244, 280);
  assert((await st('B.screen')) === 'countdown', '다시 하기');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(150);
  const rotate = await p.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
  await ctx.close();
  assert(rotate === 'flex', '세로 안내');
  assert(errs.length === 0, errs.join('\n'));
});

await check('PC에서 키를 누르면 키보드 안내로 돌아오고, 마우스 클릭으로도 메뉴를 고를 수 있다', async () => {
  const p = await openPage(1366, 768);
  assert((await state(p, 'B.touch')) === false);
  const r = await p.evaluate(() => {
    const b = document.getElementById('game').getBoundingClientRect();
    return [b.left, b.top, b.width, b.height];
  });
  await p.mouse.click(r[0] + (320 * r[2]) / 640, r[1] + (344 * r[3]) / 360);
  assert((await state(p, 'B.screen')) === 'help', '클릭 → 도움말');
  assert((await state(p, 'B.touch')) === false, '마우스는 터치 모드가 아님');
  await p.close();
});

await check('폰트가 실제로 로드된다', async () => {
  assert((await page.evaluate(() => document.fonts.check('12px Galmuri'))) === true);
});

await check('브라우저 콘솔 에러 0건', async () => {
  assert(errors.length === 0, errors.join('\n'));
});

await browser.close();
server.close();

for (const [ok, name, msg] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${msg ? `\n      → ${msg}` : ''}`);
const failed = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
