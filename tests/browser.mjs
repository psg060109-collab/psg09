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
  await page.waitForTimeout(1300);
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
  await page.waitForTimeout(1300);
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
