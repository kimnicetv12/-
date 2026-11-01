// 도장오목 핵심 로직 단위 테스트 (의존성 없음)
// 실행: node stamp-omok/test/core.test.js
// index.html 안의 <script id="core-logic"> 부분만 꺼내 Node vm에서 실행한다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script id="core-logic">([\s\S]*?)<\/script>/);
if (!m) throw new Error('core-logic 스크립트를 찾지 못했습니다');
const sandbox = { console, Math };
vm.createContext(sandbox);
vm.runInContext(
  `${m[1]}\n;globalThis.core = { CONFIG, CONFIG_DEFAULTS, stampDiameter, computeArm, applyJitter, findOverlap,
    projectOnLine, lineAngleDiff, fitLineLeastSquares, forEachCombination, rulerCandidates, judgeRuler };`,
  sandbox,
);
const core = sandbox.core;
const cfg = (over = {}) => ({ ...core.CONFIG_DEFAULTS, ...over });
const D = core.stampDiameter(cfg());
const deg = (d) => (d * Math.PI) / 180;
const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≉ ${b}`);

/** 중심 c에서 각도 angle 방향으로 spacing 간격의 n개 점 */
function rowOf(n, c, angle, spacing, owner = 0) {
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: c.x + ux * (i - mid) * spacing, y: c.y + uy * (i - mid) * spacing, owner }));
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('도장 지름은 바둑돌의 3/4', () => {
  assert.equal(D, 30);
  assert.equal(core.stampDiameter(cfg({ STONE_DIAMETER: 48 })), 36);
});

test('L자 팔: 앞으로 절반, 직각으로 꺾여 절반', () => {
  const s = { x: 100, y: 100 };
  const r = core.computeArm(s, 4, 'right', cfg());
  near(r.elbow.x, 100); near(r.elbow.y, 100 - 2 * D);
  near(r.hand.x, 100 + 2 * D); near(r.hand.y, 100 - 2 * D);
  const l = core.computeArm(s, 4, 'left', cfg());
  near(l.hand.x, 100 - 2 * D); near(l.hand.y, 100 - 2 * D);
});

test('팔 길이는 최소·최대로 잘림', () => {
  const s = { x: 0, y: 0 };
  const big = core.computeArm(s, 99, 'right', cfg());
  near(big.length, 12 * D);
  const small = core.computeArm(s, 0, 'right', cfg());
  near(small.length, 0.5 * D);
});

test('위팔 비율 설정 반영 + 다른 앞 방향', () => {
  const r = core.computeArm({ x: 0, y: 0 }, 4, 'right', cfg({ ARM_SPLIT: 0.25 }));
  near(r.hand.y, -1 * D); near(r.hand.x, 3 * D);
  // 앞이 오른쪽(+x)이면, 오른쪽으로 꺾음 = 아래(+y)
  const f = core.computeArm({ x: 0, y: 0 }, 2, 'right', cfg(), { x: 1, y: 0 });
  near(f.hand.x, D); near(f.hand.y, D);
});

test('손떨림 0이면 그대로, 있으면 3σ 안', () => {
  const p = { x: 10, y: 20 };
  assert.deepEqual({ ...core.applyJitter(p, cfg({ ARM_JITTER: 0 }), Math.random) }, p);
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) {
    const q = core.applyJitter(p, cfg({ ARM_JITTER: 0.1 }), rng);
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y) <= 3 * 0.1 * D + 1e-9);
  }
});

test('겹침: 중심 거리 < 지름이면 겹침, 딱 맞닿음은 허용', () => {
  const stamps = [{ x: 0, y: 0, owner: 1 }];
  assert.ok(core.findOverlap({ x: D - 0.1, y: 0 }, stamps, cfg()));
  assert.equal(core.findOverlap({ x: D, y: 0 }, stamps, cfg()), null);
  assert.equal(core.findOverlap({ x: 0, y: D * 1.5 }, stamps, cfg()), null);
});

test('최소제곱 피팅: 가로·세로·대각선', () => {
  const h = core.fitLineLeastSquares(rowOf(5, { x: 0, y: 0 }, 0, 40));
  near(core.lineAngleDiff(h.angle, 0), 0); near(h.maxResidual, 0);
  const v = core.fitLineLeastSquares(rowOf(5, { x: 3, y: 7 }, Math.PI / 2, 40));
  near(core.lineAngleDiff(v.angle, Math.PI / 2), 0); near(v.cx, 3); near(v.cy, 7);
  const d = core.fitLineLeastSquares(rowOf(5, { x: 0, y: 0 }, deg(-35), 40));
  near(core.lineAngleDiff(d.angle, deg(-35)), 0, 1e-9);
});

test('최소제곱 피팅: 잔차와 가장 먼 점', () => {
  const pts = [0, 1, 2, 3, 4].map((i) => ({ x: i * 36, y: i === 2 ? 10 : 0 }));
  const f = core.fitLineLeastSquares(pts);
  assert.equal(f.worst, 2);
  near(f.maxResidual, 8, 1e-6); // 평균 y=2 → 가운데 점 잔차 8
});

test('직선 각도 차는 방향과 무관', () => {
  near(core.lineAngleDiff(deg(10), deg(190)), 0, 1e-9);
  near(core.lineAngleDiff(deg(-80), deg(80)), deg(20), 1e-9);
});

test('조합 개수: 7C5 = 21', () => {
  let n = 0;
  core.forEachCombination(7, 5, () => { n++; return false; });
  assert.equal(n, 21);
  assert.equal(core.forEachCombination(3, 5, () => true), false);
});

test('자 판정: 30° 다섯 줄 성공', () => {
  const c = { x: 50, y: -20 };
  const stamps = rowOf(5, c, deg(30), 1.2 * D);
  const r = core.judgeRuler({ ...c, angle: deg(30) }, stamps, 0, cfg());
  assert.equal(r.success, true, r.message);
  assert.equal(r.code, 'WIN');
  assert.equal(r.ordered.length, 5);
});

test('자 판정: 자가 줄에서 0.5D 비켜나면 띠 밖 → 개수 부족', () => {
  const stamps = rowOf(5, { x: 0, y: 0 }, 0, 1.2 * D);
  const r = core.judgeRuler({ x: 0, y: 0.5 * D, angle: 0 }, stamps, 0, cfg());
  assert.equal(r.success, false);
  assert.equal(r.code, 'NOT_ENOUGH');
});

test('자 판정: 8°는 통과, 12°는 끝 도장이 띠 밖, 각도 허용 5°면 어긋남', () => {
  const stamps = rowOf(5, { x: 0, y: 0 }, 0, 1.2 * D);
  assert.equal(core.judgeRuler({ x: 0, y: 0, angle: deg(8) }, stamps, 0, cfg()).success, true);
  assert.equal(core.judgeRuler({ x: 0, y: 0, angle: deg(12) }, stamps, 0, cfg()).code, 'NOT_ENOUGH');
  assert.equal(core.judgeRuler({ x: 0, y: 0, angle: deg(8) }, stamps, 0, cfg({ ANGLE_TOLERANCE_DEG: 5 })).code, 'MISALIGNED');
});

test('자 판정: 띠 안이지만 지그재그면 최소제곱 직선성 실패', () => {
  const ys = [0.3, 0.3, -0.3, 0.3, 0.3];
  const stamps = ys.map((y, i) => ({ x: i * 1.2 * D, y: y * D, owner: 0 }));
  const r = core.judgeRuler({ x: 2.4 * D, y: 0, angle: 0 }, stamps, 0, cfg());
  assert.equal(r.code, 'NOT_STRAIGHT', r.message);
});

test('자 판정: 이웃 간격이 너무 넓음', () => {
  const xs = [0, 1.2, 2.4, 3.6, 6.1];
  const stamps = xs.map((x) => ({ x: x * D, y: 0, owner: 0 }));
  const r = core.judgeRuler({ x: 3.05 * D, y: 0, angle: 0 }, stamps, 0, cfg());
  assert.equal(r.code, 'GAP');
  assert.equal(core.judgeRuler({ x: 3.05 * D, y: 0, angle: 0 }, stamps, 0, cfg({ MAX_GAP: 0 })).success, true);
});

test('자 판정: 상대 도장이 사이를 막음', () => {
  const mine = rowOf(5, { x: 0, y: 0 }, 0, 2 * D);
  const opp = { x: -1 * D, y: 0, owner: 1 }; // 2번과 3번 사이, 양쪽에 딱 맞닿음
  assert.equal(core.findOverlap(opp, mine, cfg()), null);
  const r = core.judgeRuler({ x: 0, y: 0, angle: 0 }, [...mine, opp], 0, cfg());
  assert.equal(r.code, 'BLOCKED');
  assert.equal(core.judgeRuler({ x: 0, y: 0, angle: 0 }, [...mine, opp], 0, cfg({ BLOCK_BY_OPPONENT: false })).success, true);
});

test('자 판정: 줄 바깥쪽 상대 도장은 막지 않음', () => {
  const mine = rowOf(5, { x: 0, y: 0 }, 0, 1.2 * D);
  const opp = { x: 3.6 * D, y: 0, owner: 1 };
  assert.equal(core.judgeRuler({ x: 0, y: 0, angle: 0 }, [...mine, opp], 0, cfg()).success, true);
});

test('자 판정: 여섯 개 줄도 승리, 상대 도장은 개수에 안 들어감', () => {
  assert.equal(core.judgeRuler({ x: 0, y: 0, angle: 0 }, rowOf(6, { x: 0, y: 0 }, 0, 1.2 * D), 0, cfg()).success, true);
  const mixed = rowOf(5, { x: 0, y: 0 }, 0, 1.2 * D).map((s, i) => ({ ...s, owner: i < 3 ? 0 : 1 }));
  const r = core.judgeRuler({ x: 0, y: 0, angle: 0 }, mixed, 0, cfg());
  assert.equal(r.code, 'NOT_ENOUGH');
  assert.equal(r.candidates.length, 3);
});

test('자 판정: 줄 위 바깥값 하나가 끼어도 나머지 다섯으로 승리', () => {
  const xs = [0, 1.2, 2.4, 3.6, 4.8];
  const stamps = xs.map((x) => ({ x: x * D, y: 0, owner: 0 }));
  stamps.push({ x: 1.8 * D, y: 0.33 * D, owner: 0 }); // 띠 안이지만 줄에서 살짝 벗어난 여섯째 (겹침 무시한 가상 배치)
  const r = core.judgeRuler({ x: 2.4 * D, y: 0, angle: 0 }, stamps, 0, cfg());
  assert.equal(r.success, true, r.message);
});

test('자 길이 밖 도장은 후보가 아님', () => {
  const stamps = rowOf(5, { x: 0, y: 0 }, 0, 2 * D); // 양 끝이 ±4D
  const c = core.rulerCandidates({ x: 0, y: 0, angle: 0 }, stamps, 0, cfg({ RULER_LENGTH: 6 }));
  assert.equal(c.length, 3);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} 통과`);
process.exit(failed ? 1 : 0);
