const test = require('node:test');
const assert = require('node:assert');
const AI = require('../js/ai.js');

test('JSON Schema를 Gemini responseSchema로 바꾼다', () => {
  const g = AI.toGeminiSchema(AI.EVAL_SCHEMA);
  assert.strictEqual(g.type, 'OBJECT');
  assert.strictEqual(g.properties.scores.type, 'OBJECT');
  assert.strictEqual(g.properties.scores.properties.logic.type, 'INTEGER');
  assert.strictEqual(g.properties.feedback_good.items.type, 'STRING');
  assert.deepStrictEqual(g.required, AI.EVAL_SCHEMA.required);
  assert.ok(!JSON.stringify(g).includes('additionalProperties'));
});

test('코드펜스나 잡담이 섞인 JSON도 읽는다', () => {
  assert.deepStrictEqual(AI.parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepStrictEqual(AI.parseJSON('결과입니다: {"a":2} 끝'), { a: 2 });
  assert.throws(() => AI.parseJSON('없음'), AI.AIError);
});

test('평가 결과를 화면용 모양으로 정리한다', () => {
  const ev = AI.normalizeEvaluation({
    scores: { content: 12, logic: '7', specificity: -3, job_fit: 6.6 },
    feedback_good: '하나뿐',
    feedback_improve: ['a', '', 'b'],
    next_question: '  다음?  ',
    next_is_follow_up: 'true',
  });
  assert.deepStrictEqual(ev.scores, { content: 10, logic: 7, specificity: 0, job_fit: 7, delivery: 5 });
  assert.deepStrictEqual(ev.feedback_good, ['하나뿐']);
  assert.deepStrictEqual(ev.feedback_improve, ['a', 'b']);
  assert.strictEqual(ev.next_question, '다음?');
  assert.strictEqual(ev.next_is_follow_up, true);
  assert.strictEqual(ev.source, 'ai');
});
