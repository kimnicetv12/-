const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/flybrain.js');
const M = require('../js/metrics.js');

const GOOD = '결론부터 말씀드리면 저는 고객 데이터를 다루는 데 강점이 있습니다. 카페 아르바이트에서 신메뉴 판매가 하루 8잔에 그쳤을 때 시음 컵을 드리는 방법을 제안했고, 2주 만에 하루 26잔으로 늘렸습니다. 그 결과 다른 지점에도 이 방식이 공유됐고, 설득은 경험을 먼저 드리는 것이라는 걸 배웠습니다.';
const BAD = '음 저는 그냥 열심히 하는 사람입니다. 뽑아주시면 최선을 다하겠습니다.';
const spoken = (t, extra = {}) => ({ ...M.analyzeDelivery({ transcript: t, durationMs: 45000, firstSpeechMs: 1500, activity: [] }), rate: 300, fillerPerMin: 0.5, habitPerMin: 1, longPauses: 0, firstSpeechSec: 1.5, speakingSec: 45, ...extra });

F.init({ fresh: true });

test('케년세포 2000개 중 정확히 5%(100개)만 켜진다', () => {
  const r = F.evaluate({ question: '지원 동기는?', transcript: GOOD, analysis: spoken(GOOD), field: 'sales' });
  assert.strictEqual(F.N_KC, 2000);
  assert.strictEqual(r.active.length, 100);
  assert.strictEqual(new Set(r.active).size, 100);
});

test('배선은 고정이라 같은 답이면 같은 지문이 나온다', () => {
  const a = F.evaluate({ question: 'Q', transcript: GOOD, analysis: spoken(GOOD), field: 'sales' });
  const b = F.evaluate({ question: 'Q', transcript: GOOD, analysis: spoken(GOOD), field: 'sales' });
  assert.deepStrictEqual(a.active, b.active);
});

test('좋은 답이 나쁜 답보다 높은 점수를 받는다', () => {
  const g = F.evaluate({ question: '설득해 본 경험을 말씀해 주세요.', transcript: GOOD, analysis: spoken(GOOD), field: 'sales' });
  const b = F.evaluate({ question: '설득해 본 경험을 말씀해 주세요.', transcript: BAD, analysis: spoken(BAD), field: 'sales' });
  for (const d of ['content', 'logic', 'specificity', 'job_fit']) assert.ok(g.scores[d] > b.scores[d], `${d}: ${g.scores[d]} > ${b.scores[d]}`);
  assert.strictEqual(g.typeLabel === undefined, false);
});

test('말하기 습관이 나쁘면 전달력 점수가 내려가고, 타이핑이면 전달력은 비운다', () => {
  const ok = F.evaluate({ question: 'Q', transcript: GOOD, analysis: spoken(GOOD), field: 'sales' });
  const messy = F.evaluate({ question: 'Q', transcript: GOOD, analysis: spoken(GOOD, { rate: 400, fillerPerMin: 5, longPauses: 4, firstSpeechSec: 7 }), field: 'sales' });
  assert.ok(ok.scores.delivery > messy.scores.delivery);
  const typed = F.evaluate({ question: 'Q', transcript: GOOD, analysis: { textMode: true }, field: 'sales' });
  assert.strictEqual(typed.scores.delivery, null);
});

test('선생님 점수로 배우면 그쪽으로 점수가 움직인다(도파민 학습)', () => {
  const args = { question: '지원 동기는?', transcript: BAD, analysis: spoken(BAD), field: 'general' };
  const before = F.evaluate(args);
  for (let i = 0; i < 5; i++) F.learn(F.evaluate(args), { content: 9, logic: 9, specificity: 9, job_fit: 9, delivery: 9 });
  const after = F.evaluate(args);
  assert.ok(after.raw[0] > before.raw[0]);
  assert.ok(F.stats().lessons >= 5);
  F.init({ fresh: true });
});

test('같은 답을 또 하면 알아본다(FlyHash 기억)', () => {
  const first = F.evaluate({ question: 'Q1', transcript: GOOD, analysis: spoken(GOOD), field: 'sales' });
  F.remember({ question: 'Q1', result: first });
  const again = F.evaluate({ question: 'Q2', transcript: GOOD.replace('26잔', '스물여섯 잔'), analysis: spoken(GOOD), field: 'sales' });
  assert.ok(again.similar && again.similar.sim >= 0.45);
  const other = F.evaluate({ question: 'Q3', transcript: BAD, analysis: spoken(BAD), field: 'sales' });
  assert.strictEqual(other.similar, null);
});

test('뇌를 저장했다 불러와도 같은 점수가 나온다', () => {
  const b = new F.Brain();
  F.trainInnate(b, require('../js/flycorpus.js').ENTRIES, 5);
  const b2 = F.Brain.deserialize(b.serialize());
  const code = F.kenyon(F.projectionInput({ question: 'Q', transcript: GOOD, analysis: { textMode: true }, field: 'sales' }).pn).active;
  b.readout(code).forEach((v, i) => assert.ok(Math.abs(v - b2.readout(code)[i]) < 0.1));
});

test('함정 답변: 키워드만 나열하면 측각 경보가 울리고 좋은 답보다 한참 낮다', () => {
  F.init({ fresh: true });
  const q = '처음 보는 사람을 설득해 본 경험을 말씀해 주세요.';
  const stuffed = '결론부터 첫째 설득 경험 3년 고객 50명 성과 20% 달성 결과 둘째 개선 향상 결과적으로 성과 달성입니다.';
  const s = F.evaluate({ question: q, transcript: stuffed, analysis: { textMode: true }, field: 'sales' });
  const g = F.evaluate({ question: q, transcript: GOOD, analysis: { textMode: true }, field: 'sales' });
  assert.ok(s.alarms.some((a) => a.id === 'stuffing' && a.level > 0.5));
  assert.ok(M.overallFromScores(g.scores) - M.overallFromScores(s.scores) >= 30);
});

test('함정 답변: 같은 좋은 답이라도 엉뚱한 질문에 하면 동문서답으로 깎인다', () => {
  const on = F.evaluate({ question: '처음 보는 사람을 설득해 본 경험을 말씀해 주세요.', transcript: GOOD, analysis: { textMode: true }, field: 'sales' });
  const off = F.evaluate({ question: '공직자에게 가장 중요한 덕목은 무엇이라고 생각하나요?', transcript: GOOD, analysis: { textMode: true }, field: 'sales' });
  assert.ok(off.alarms.some((a) => a.id === 'offTopic'));
  assert.ok(on.scores.content - off.scores.content >= 3);
});

test('깐깐한 면접관이면 같은 답도 더 짜게, 선생님 점수를 배울 땐 그 몫을 되돌린다', () => {
  const args = { question: 'Q', transcript: GOOD, analysis: { textMode: true }, field: 'sales' };
  const std = F.evaluate({ ...args, persona: 'standard' });
  const strict = F.evaluate({ ...args, persona: 'strict' });
  assert.ok(strict.raw[0] < std.raw[0]);
  assert.strictEqual(strict.personaOffset, -1);
});
