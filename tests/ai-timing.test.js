const test = require('node:test');
const assert = require('node:assert');
const AI = require('../js/ai.js');

const settings = { fieldLabel: 'IT', mode: 'mixed', persona: 'standard', followUps: true };
const args = (budgetMs) => ({
  ai: { provider: 'gemini', apiKey: 'AIzaTESTTESTTESTTESTTESTTEST', model: AI.PROVIDERS.gemini.defaultModel },
  settings, history: [], question: 'Q', transcript: 'A', analysis: { textMode: true }, remaining: 2, budgetMs,
});
const okBody = (next) => JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
  scores: { content: 7, logic: 7, specificity: 7, job_fit: 7, delivery: 7 }, feedback_good: ['g'], feedback_improve: ['i'],
  better_answer: 'b', interviewer_reaction: '네.', next_question: next, next_is_follow_up: false }) }] } }] });
test.beforeEach(() => AI.resetGeminiState());
const modelOf = (url) => decodeURIComponent(url.split('/models/')[1].split(':')[0]);

test('AI가 응답하지 않아도 제한 시간 안에 포기한다', async () => {
  const calls = [];
  globalThis.fetch = (url, opts) => new Promise((_, reject) => {
    calls.push(modelOf(url));
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const t = Date.now();
  await assert.rejects(AI.evaluateAnswer(args(3000)));
  const took = Date.now() - t;
  assert.ok(took < 3600, `${took}ms 걸림`);
});

test('혼잡한 모델은 건너뛰고, 다음에는 뒤로 미룬다', async () => {
  const seen = [];
  globalThis.fetch = async (url, opts) => {
    const m = modelOf(url);
    seen.push({ m, body: JSON.parse(opts.body) });
    if (m === 'gemini-3.5-flash-lite') return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 });
    return new Response(okBody(`${m}에서 온 질문`), { status: 200 });
  };
  const r = await AI.evaluateAnswer(args(10000));
  assert.ok(r.next_question.startsWith('gemini-3.8-flash'));
  assert.deepStrictEqual(AI.geminiOrder('gemini-3.5-flash-lite').slice(0, 1), ['gemini-3.8-flash']);
  assert.strictEqual(AI.geminiOrder('gemini-3.5-flash-lite').at(-1), 'gemini-3.5-flash-lite');
  // 생각은 최소로: flash-lite는 minimal, 3.8-flash는 low
  assert.strictEqual(seen[0].body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.strictEqual(seen[1].body.generationConfig.thinkingConfig.thinkingLevel, 'low');
});

test('생각 설정을 거부하는 모델은 설정 없이 다시 보낸다', async () => {
  const bodies = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push(body);
    if (body.generationConfig.thinkingConfig) return new Response(JSON.stringify({ error: { message: 'thinking_level is not supported' } }), { status: 400 });
    return new Response(okBody('다음'), { status: 200 });
  };
  const r = await AI.evaluateAnswer({ ...args(10000), ai: { provider: 'gemini', apiKey: 'AIzaTESTTESTTESTTESTTESTTEST', model: 'gemini-3.6-flash' } });
  assert.strictEqual(r.next_question, '다음');
  assert.ok(!bodies.at(-1).generationConfig.thinkingConfig);
});
