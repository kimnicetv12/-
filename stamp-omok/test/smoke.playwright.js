// 도장오목 화면 흐름 스모크 테스트 (Playwright 필요: npm i -D playwright && npx playwright install chromium)
// 실행: node stamp-omok/test/smoke.playwright.js
// 스크린샷 저장 위치: SHOTS_DIR 환경변수 (기본값: OS 임시 폴더)
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const SHOTS = process.env.SHOTS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-omok-'));
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  await page.goto(`file://${path.resolve(__dirname, '..', 'index.html')}`);
  await page.waitForFunction(() => window.__stampOmok);
  await shot(page, '01-menu');

  const game = () => page.evaluate(() => {
    const s = window.__stampOmok.state;
    return { phase: s.phase, current: s.current, move: s.move, stamps: s.stamps.map((t) => ({ x: t.x, y: t.y, owner: t.owner })), winner: s.winner };
  });
  async function tapWorld(x, y) {
    const s = await page.evaluate(([wx, wy]) => window.__stampOmok.worldToScreen({ x: wx, y: wy }), [x, y]);
    const box = await page.locator('#board').boundingBox();
    await page.mouse.click(box.x + s.x, box.y + s.y);
  }
  // 팔 길이 3, 오른쪽 꺾기 → 착지 = 기준점 + (1.5D, -1.5D) = (+45, -45)
  async function stampTurn(anchor, dir, name) {
    await page.click('#btnReady');
    await page.click(dir === 'left' ? '#dirLeft' : '#dirRight');
    await tapWorld(anchor.x, anchor.y);
    if (name) await shot(page, name);
    await page.click('#btnPlace');
    if (name) { await page.waitForTimeout(700); await shot(page, `${name}-arm`); }
    await page.waitForSelector('#handoff:not([hidden])', { timeout: 5000 });
  }

  await page.click('#btnNew');
  await page.evaluate(() => { window.__stampOmok.CONFIG.ARM_JITTER = 0; window.__stampOmok.CONFIG.STAMP_FLASH_MS = 400; });
  await shot(page, '02-handoff');

  const D = 30;
  const p1Targets = [-2, -1, 0, 1, 2].map((i) => ({ x: i * 1.2 * D, y: 0 }));
  const p1Anchor = (t) => ({ x: t.x - 45, y: t.y + 45 });
  const p2Anchor = (t) => ({ x: t.x + 45, y: t.y + 45 });   // 왼쪽 꺾기

  await stampTurn(p1Anchor(p1Targets[0]), 'right', '03-stamp-anchor');
  await stampTurn(p2Anchor({ x: -100, y: 150 }), 'left');
  await stampTurn(p1Anchor(p1Targets[1]), 'right');
  // 쪽빛이 주홍의 가운데 자리(아직 비어 있음)가 아니라 첫 도장 자리를 노림 → 막힘
  await stampTurn(p2Anchor(p1Targets[0]), 'left');
  let g = await game();
  assert.equal(g.stamps.length, 3, '막힌 도장은 판에 남지 않아야 함');
  await stampTurn(p1Anchor(p1Targets[2]), 'right');
  await stampTurn(p2Anchor({ x: -40, y: 150 }), 'left');
  await stampTurn(p1Anchor(p1Targets[3]), 'right');

  // 쪽빛: 자 확인 (도장 2개라 실패) → 판 공개 화면
  await page.click('#btnReady');
  await page.click('#tabRuler');
  await page.waitForSelector('#dialog:not([hidden])');
  await shot(page, '04-ruler-confirm');
  await page.click('#dlgOk');
  await page.waitForTimeout(600);
  await shot(page, '05-ruler-open');
  await page.click('#btnJudge');
  await page.waitForSelector('#paneResult:not([hidden])', { timeout: 5000 });
  await shot(page, '06-ruler-fail');
  await page.click('#btnPass');

  await stampTurn(p1Anchor(p1Targets[4]), 'right');
  await stampTurn(p2Anchor({ x: 20, y: 150 }), 'left');

  g = await game();
  const mine = g.stamps.filter((s) => s.owner === 0);
  assert.equal(mine.length, 5);
  mine.forEach((s, i) => { assert.ok(Math.abs(s.x - p1Targets[i].x) < 1e-6 && Math.abs(s.y - p1Targets[i].y) < 1e-6, `도장 ${i} 위치`); });

  // 주홍: 자 확인 성공
  await page.click('#btnReady');
  await page.click('#tabRuler');
  await page.click('#dlgOk');
  await page.evaluate(() => window.__stampOmok.setRuler(0, 0, 0));
  await page.waitForTimeout(600);
  await shot(page, '07-ruler-aligned');
  await page.click('#btnJudge');
  await page.waitForSelector('#paneOver:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(200);
  await shot(page, '08-win');
  g = await game();
  assert.equal(g.winner, 0);
  assert.equal(g.phase, 'over');

  // 휠 확대
  const z0 = await page.evaluate(() => window.__stampOmok.cam.zoom);
  const box = await page.locator('#board').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(100);
  const z1 = await page.evaluate(() => window.__stampOmok.cam.zoom);
  assert.ok(z1 > z0, '휠로 확대되어야 함');

  // 게임 방법·설정 화면
  await page.click('#btnToMenu');
  await page.click('#btnHowto');
  await shot(page, '09-howto');
  await page.click('#btnHowtoDone');
  await page.click('#btnSettings');
  await shot(page, '10-settings');

  assert.deepEqual(errors, [], `콘솔 오류: ${errors.join('\n')}`);
  await browser.close();
  console.log(`스모크 테스트 통과 · 스크린샷: ${SHOTS}`);
})().catch((e) => { console.error(e); process.exit(1); });
