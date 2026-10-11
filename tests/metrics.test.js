const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/metrics.js');
const Q = require('../js/questions.js');

test('음절 수는 한글 글자와 영문/숫자 단어를 센다', () => {
  assert.strictEqual(M.countSyllables('안녕하세요'), 5);
  assert.strictEqual(M.countSyllables('React 3년'), 2 + 2 + 1);
});

test('군말과 습관어를 구분해서 센다', () => {
  const r = M.countFillers('음 저는 어어 약간 그 경험이 음... 있습니다 있습니다');
  assert.deepStrictEqual(r.fillers, { 음: 2, 어: 1 });
  assert.deepStrictEqual(r.habits, { 약간: 1 });
  assert.strictEqual(r.repeats, 1);
  // "저"(1인칭)와 "그"(지시어)는 군말로 치지 않는다
  assert.strictEqual(M.countFillers('저는 그 일을 했습니다').fillerCount, 0);
});

test('구조 표현과 수치를 찾는다', () => {
  const s = M.countStructure('결론부터 말씀드리면 첫째 6개월 동안 30% 개선했습니다');
  assert.ok(s.markers.includes('결론부터'));
  assert.ok(s.markers.includes('첫째'));
  assert.ok(s.numbers.length >= 2);
});

test('말 속도와 긴 끊김을 계산한다', () => {
  const text = '가'.repeat(150);
  const a = M.analyzeDelivery({ transcript: text, durationMs: 32000, firstSpeechMs: 2000, activity: [2000, 3000, 8000, 32000] });
  assert.strictEqual(a.rate, 300); // 150음절 / 30초
  assert.strictEqual(a.rateVerdict, '적절');
  assert.strictEqual(a.longPauses, 2);
  assert.strictEqual(a.longestPauseSec, 24);
});

test('간이 채점은 0~10 점수와 100점 종합을 낸다', () => {
  const analysis = M.analyzeDelivery({
    transcript: '결론부터 말씀드리면 저는 첫째 3년간 고객 응대를 하며 만족도를 20% 높였습니다 '.repeat(4),
    durationMs: 45000, firstSpeechMs: 1500, activity: Array.from({ length: 40 }, (_, i) => 1500 + i * 1000),
  });
  const ev = M.ruleBasedEvaluation({ question: '지원 동기가 무엇인가요?', analysis, timeLimitSec: 90 });
  for (const v of Object.values(ev.scores)) assert.ok(v >= 0 && v <= 10);
  assert.ok(ev.overall > 50 && ev.overall <= 100);
  assert.ok(ev.feedback_good.length > 0);
});

test('타이핑 답변은 전달력을 빼고 종합 점수를 낸다', () => {
  const analysis = { ...M.analyzeDelivery({ transcript: '짧은 답', durationMs: 5000, firstSpeechMs: null, activity: [] }), textMode: true };
  const ev = M.ruleBasedEvaluation({ question: 'Q', analysis, timeLimitSec: 60 });
  assert.strictEqual(ev.scores.delivery, null);
  assert.strictEqual(M.overallFromScores({ content: 10, logic: 10, specificity: 10, job_fit: 10, delivery: null }), 100);
  const sum = M.summarizeSession([{ analysis, evaluation: ev }]);
  assert.strictEqual(sum.avg.delivery, null);
  assert.strictEqual(sum.totalFillers, 0);
});

test('질문 세트는 자기소개로 시작해 마무리 질문으로 끝난다', () => {
  for (const mode of ['personality', 'job', 'mixed', 'pressure']) {
    const set = Q.buildQuestionSet({ field: 'broadcast', mode, count: 5 });
    assert.strictEqual(set.length, 5);
    assert.strictEqual(set[0], Q.OPENER);
    assert.strictEqual(set[4], Q.CLOSER);
    assert.strictEqual(new Set(set).size, 5);
  }
});

test('타이핑 답변의 분량은 글자 수로 판단한다', () => {
  const transcript = '저는 대학 시절 삼 년 동안 교내 방송국에서 아나운서로 활동했습니다 '.repeat(8);
  const analysis = { ...M.analyzeDelivery({ transcript, durationMs: 3000, firstSpeechMs: null, activity: [] }), textMode: true };
  const ev = M.ruleBasedEvaluation({ question: 'Q', analysis, timeLimitSec: 90 });
  assert.strictEqual(ev.scores.content, 9);
});
