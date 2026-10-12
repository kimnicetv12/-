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

test('Gemini 키는 예전 형식과 새 형식 모두 받는다', () => {
  const re = AI.PROVIDERS.gemini.keyPattern;
  assert.ok(re.test('AIzaSyD-abcdefghijklmnopqrstuvwxyz012'));
  assert.ok(re.test('AQ.Ab8Rxxxxxxxxxxxxxxxxxxxx-yyyyyyyy_zz'));
  assert.ok(!re.test('sk-ant-abc'));
});

test('면접관 반응은 짧은 맞장구만 남긴다', () => {
  assert.strictEqual(AI.cleanReaction('네, 잘 들었습니다.'), '네, 잘 들었습니다.');
  assert.strictEqual(AI.cleanReaction('좋습니다. 그럼 다음으로 넘어가죠.'), '좋습니다.');
  assert.strictEqual(AI.cleanReaction('자기소개가 짧은데, 돌발 상황은 무엇이었나요?'), '');
  assert.strictEqual(AI.cleanReaction(''), '');
});

test('타이핑 답변이면 말하기 지표를 AI에게 보내지 않는다', () => {
  const settings = { fieldLabel: 'IT', mode: 'mixed', persona: 'standard', followUps: true };
  const base = { settings, history: [], question: 'Q', transcript: 'A', remaining: 2 };
  const typed = AI.evalUserPrompt({ ...base, analysis: { textMode: true, rate: 9999 } });
  assert.ok(!typed.includes('9999'));
  assert.ok(typed.includes('타이핑'));
  const spoken = AI.evalUserPrompt({ ...base, analysis: { textMode: false, rate: 300 } });
  assert.ok(spoken.includes('300'));
});
