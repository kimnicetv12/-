/* AI 면접관 연동: Google Gemini(무료 키) 또는 Claude.
 * 답변 평가 + 다음 질문 생성, 그리고 최종 총평을 담당한다.
 * 별도 서버 없이 브라우저에서 바로 호출하므로 API 키는 사용자 브라우저에만 저장된다. */
(function (root) {
  const PROVIDERS = {
    gemini: {
      label: 'Google Gemini (무료 키 가능)',
      keyHint: 'AIza... 또는 AQ....',
      // 예전 형식(AIza...)과 새 형식(AQ....) 모두 허용
      keyPattern: /^(AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_.-]{20,})$/,
      keyUrl: 'https://aistudio.google.com/apikey',
      // 실측: flash-lite가 2초대로 가장 빠르고, 무료 등급에서 혼잡(503)도 가장 적었다
      defaultModel: 'gemini-3.5-flash-lite',
      // 기본 모델이 없거나, 혼잡하거나, 무료 한도에 걸리거나, 늦으면 차례로 시도
      fallbackModels: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.6-flash'],
    },
    claude: {
      label: 'Anthropic Claude',
      keyHint: 'sk-ant-...',
      keyPattern: /^sk-ant-[0-9A-Za-z_-]{20,}$/,
      keyUrl: 'https://console.anthropic.com/settings/keys',
      defaultModel: 'claude-opus-5-5',
      fallbackModels: ['claude-opus-5-5'],
    },
  };

  const PERSONAS = {
    kind: '온화한 면접관. 지원자가 긴장하지 않도록 부드럽게 반응하되 평가는 정확하게 한다.',
    standard: '실제 공채 면접관. 중립적이고 담백한 말투로, 평가 기준은 실제 합격선에 맞춘다.',
    strict: '깐깐한 압박 면접관. 답변의 허점·모순·모호한 부분을 날카롭게 파고드는 꼬리질문을 던진다. 단, 인신공격은 하지 않는다.',
  };

  const MODE_LABELS = {
    personality: '인성 면접',
    job: '직무 면접',
    mixed: '종합 면접',
    pressure: '압박 면접',
  };

  const SCORE_KEYS = ['content', 'logic', 'specificity', 'job_fit', 'delivery'];
  const scoreProp = (desc) => ({ type: 'integer', description: `${desc} (0~10 정수)` });

  const EVAL_SCHEMA = {
    type: 'object',
    properties: {
      scores: {
        type: 'object',
        properties: {
          content: scoreProp('질문 의도에 맞는 답을 했는가'),
          logic: scoreProp('결론-근거-예시 구조와 논리 흐름'),
          specificity: scoreProp('경험·수치·사례로 뒷받침되는 구체성'),
          job_fit: scoreProp('지원 분야·직무와의 연관성, 인재상 부합'),
          delivery: scoreProp('제공된 측정 지표 기반 전달력(속도·군말·끊김)'),
        },
        required: SCORE_KEYS,
        additionalProperties: false,
      },
      feedback_good: { type: 'array', items: { type: 'string' }, description: '잘한 점 1~3개, 각 한 문장' },
      feedback_improve: { type: 'array', items: { type: 'string' }, description: '고칠 점 1~4개, 구체적인 행동 지침으로' },
      better_answer: { type: 'string', description: '지원자 답변을 살린 개선 답변 예시(3~5문장, 지원자 1인칭)' },
      interviewer_reaction: { type: 'string', description: '다음 질문 직전에 면접관이 하는 짧은 맞장구 한마디(40자 이내, 예: "네, 잘 들었습니다."). 질문·평가·지적을 넣지 말 것' },
      next_question: { type: 'string', description: '다음에 던질 질문. 더 물을 질문이 없으면 빈 문자열' },
      next_is_follow_up: { type: 'boolean', description: '다음 질문이 방금 답변에 대한 꼬리질문이면 true' },
    },
    required: ['scores', 'feedback_good', 'feedback_improve', 'better_answer', 'interviewer_reaction', 'next_question', 'next_is_follow_up'],
    additionalProperties: false,
  };

  const REPORT_SCHEMA = {
    type: 'object',
    properties: {
      overall_comment: { type: 'string', description: '면접관 총평 3~5문장' },
      strengths: { type: 'array', items: { type: 'string' }, description: '전체 면접에서 드러난 강점 2~3개' },
      weaknesses: { type: 'array', items: { type: 'string' }, description: '가장 시급한 보완점 2~3개' },
      delivery_comment: { type: 'string', description: '말하기 습관(속도·군말·끊김)에 대한 코멘트 2~3문장' },
      practice_plan: { type: 'array', items: { type: 'string' }, description: '다음 연습 때 할 구체적 훈련 3개' },
    },
    required: ['overall_comment', 'strengths', 'weaknesses', 'delivery_comment', 'practice_plan'],
    additionalProperties: false,
  };

  class AIError extends Error {
    constructor(message, { status, retryable, modelMissing, retryThinking } = {}) {
      super(message);
      this.status = status;
      this.retryable = !!retryable;
      this.modelMissing = !!modelMissing;
      this.retryThinking = !!retryThinking;
    }
  }

  /* ---------- 공통 유틸 (Node 테스트 대상) ---------- */

  /** JSON Schema → Gemini responseSchema(OpenAPI 부분집합: 대문자 type, additionalProperties 없음) */
  function toGeminiSchema(schema) {
    const out = { type: String(schema.type).toUpperCase() };
    if (schema.description) out.description = schema.description;
    if (schema.properties) {
      out.properties = {};
      for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = toGeminiSchema(v);
      out.propertyOrdering = Object.keys(schema.properties);
    }
    if (schema.required) out.required = schema.required.slice();
    if (schema.items) out.items = toGeminiSchema(schema.items);
    return out;
  }

  /** 모델 응답 문자열에서 JSON 객체를 꺼낸다(코드펜스·앞뒤 잡담 허용). */
  function parseJSON(text) {
    const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      return JSON.parse(t);
    } catch (_) {
      const s = t.indexOf('{');
      const e = t.lastIndexOf('}');
      if (s >= 0 && e > s) {
        try {
          return JSON.parse(t.slice(s, e + 1));
        } catch (__) { /* 아래에서 처리 */ }
      }
      throw new AIError('AI 응답을 해석하지 못했습니다.', { retryable: true });
    }
  }

  const strList = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean);

  /** 반응은 짧은 맞장구만 남긴다. 질문을 품고 있으면 다음 질문과 겹치므로 버린다. */
  function cleanReaction(text) {
    const t = String(text || '').trim();
    if (!t || /[?？]/.test(t)) return '';
    const first = t.split(/(?<=[.!。])\s+/)[0];
    return first.length > 60 ? '' : first;
  }

  /** 모델마다 들쭉날쭉한 출력을 화면이 기대하는 모양으로 맞춘다. */
  function normalizeEvaluation(raw) {
    const scores = {};
    for (const k of SCORE_KEYS) {
      const n = Number(raw && raw.scores && raw.scores[k]);
      scores[k] = Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 5;
    }
    return {
      scores,
      feedback_good: strList(raw.feedback_good).slice(0, 3),
      feedback_improve: strList(raw.feedback_improve).slice(0, 4),
      better_answer: String(raw.better_answer || '').trim(),
      interviewer_reaction: cleanReaction(raw.interviewer_reaction),
      next_question: String(raw.next_question || '').trim(),
      next_is_follow_up: raw.next_is_follow_up === true || raw.next_is_follow_up === 'true',
      source: 'ai',
    };
  }

  function normalizeReport(raw) {
    return {
      overall_comment: String(raw.overall_comment || '').trim(),
      strengths: strList(raw.strengths),
      weaknesses: strList(raw.weaknesses),
      delivery_comment: String(raw.delivery_comment || '').trim(),
      practice_plan: strList(raw.practice_plan),
    };
  }

  /* ---------- 프롬프트 ---------- */

  function systemPrompt(settings) {
    const target = [settings.fieldLabel, settings.company].filter(Boolean).join(' / ');
    return [
      `당신은 한국어 채용 면접의 면접관입니다. 지원 분야: ${target}. 면접 유형: ${MODE_LABELS[settings.mode]}.`,
      `면접관 성향: ${PERSONAS[settings.persona]}`,
      '',
      '지원자의 답변은 음성 인식으로 받아쓴 텍스트라 띄어쓰기·오타·오인식이 있을 수 있습니다. 의도를 추정해 평가하고, 인식 오류 자체는 감점하지 마세요.',
      '전달력(delivery) 점수는 함께 제공된 측정 지표를 근거로 매기세요. 참고 기준: 말 속도는 분당 250~340음절이 적절, "음/어" 같은 군말은 분당 1회 이하가 좋고, 2.5초 이상 끊김은 적을수록 좋습니다. 음성 인식은 군말을 일부 누락하므로 지표는 실제보다 적게 잡혔을 수 있습니다.',
      '점수는 실제 면접 합격선 기준으로 냉정하게 매기세요. 5점은 평범한 지원자, 8점 이상은 면접관이 인상 깊게 기억할 수준입니다.',
      '피드백은 지원자 답변의 실제 문장을 짚어서 구체적으로 쓰고, 일반론은 피하세요. 모든 출력은 한국어로 작성하세요.',
      settings.resume ? `\n지원자가 제출한 자기소개서/이력 요약(질문에 활용하세요):\n"""\n${settings.resume}\n"""` : '',
    ].join('\n');
  }

  function historyText(history) {
    if (!history.length) return '(이전 문답 없음)';
    return history.map((h, i) => `Q${i + 1}. ${h.question}\nA${i + 1}. ${h.transcript || '(무응답)'}`).join('\n\n');
  }

  function evalUserPrompt({ settings, history, question, transcript, analysis, remaining }) {
    const metrics = {
      답변_시간_초: analysis.durationSec,
      첫_마디까지_초: analysis.firstSpeechSec,
      말_속도_분당_음절: analysis.rate,
      군말_횟수: analysis.fillerCount,
      군말_목록: analysis.fillers,
      습관어_목록: analysis.habits,
      긴_끊김_횟수: analysis.longPauses,
      가장_긴_끊김_초: analysis.longestPauseSec,
    };
    const nextRule = remaining <= 0
      ? '이번이 마지막 질문이었습니다. next_question은 빈 문자열로 두세요.'
      : remaining === 1
        ? '남은 질문은 1개이며 마무리 질문입니다. next_question에 "마지막으로 하고 싶은 말" 류의 마무리 질문을 넣으세요.'
        : `남은 질문은 ${remaining}개입니다. ${settings.followUps ? '답변에 허점이나 더 파고들 부분이 있으면 꼬리질문을, 아니면 아직 다루지 않은 새 주제의 질문을 하세요. 꼬리질문은 한 주제에 연속 2번까지만.' : '꼬리질문 없이 아직 다루지 않은 새 주제로 질문하세요.'} 이미 한 질문은 반복하지 마세요.`;
    return [
      '[지금까지의 문답]', historyText(history), '',
      '[이번 질문]', question, '',
      '[지원자 답변(음성 인식)]', transcript || '(지원자가 아무 말도 하지 않았습니다)', '',
      ...(analysis.textMode
        ? ['[전달력] 지원자가 타이핑으로 답했으므로 말하기 지표가 없습니다. 말 속도·군말·끊김·답변 시간에 대한 피드백은 쓰지 말고, delivery 점수는 5로 두세요.', '']
        : ['[측정된 전달력 지표]', JSON.stringify(metrics), '']),
      `[다음 질문 지침] ${nextRule}`,
      'interviewer_reaction은 "네, 알겠습니다."처럼 짧은 맞장구만 쓰고, 다음 질문 내용은 next_question에만 쓰세요.',
      '',
      '정해진 JSON 형식으로만 답하세요.',
    ].join('\n');
  }

  function reportUserPrompt({ results, summary }) {
    const lines = results.map((r, i) => [
      `Q${i + 1}. ${r.question}`,
      `A${i + 1}. ${r.transcript || '(무응답)'}`,
      r.analysis.textMode
        ? `점수: ${JSON.stringify(r.evaluation.scores)} / 타이핑 답변(말하기 지표 없음)`
        : `점수: ${JSON.stringify(r.evaluation.scores)} / 말 속도 ${r.analysis.rate}음절/분, 군말 ${r.analysis.fillerCount}회, 긴 끊김 ${r.analysis.longPauses}회`,
    ].join('\n'));
    const allTyped = results.every((r) => r.analysis.textMode);
    return [
      '면접이 끝났습니다. 전체 문답과 항목별 점수를 보고 총평을 작성하세요.', '',
      lines.join('\n\n'), '',
      `[평균 점수] ${JSON.stringify(summary.avg)} / 종합 ${summary.overall}점`, '',
      allTyped ? '모든 답변이 타이핑이라 말하기 습관은 측정하지 않았습니다. delivery_comment에는 "타이핑 답변이라 말하기 습관은 평가하지 않았습니다."라고만 쓰세요.' : '',
      '정해진 JSON 형식으로만 답하세요.',
    ].join('\n');
  }

  /* ---------- 시간 제한 ---------- */
  const ATTEMPT_MS = 9000; // 모델 하나를 기다리는 최대 시간
  const COOLDOWN_MS = 120000; // 혼잡·한도·지연으로 실패한 모델은 2분간 뒤로 미룬다

  async function fetchWithin(url, opts, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(500, ms));
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new AIError('응답이 너무 늦어요.', { status: 408, retryable: true });
      throw new AIError('네트워크 연결에 실패했습니다.', { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Gemini ---------- */
  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const workingModel = {}; // 성공한 모델 기억
  const cooldown = new Map(); // 모델 → 이 시각까지 뒤로 미룸
  const noThinkingCfg = new Set(); // 생각 설정을 거부한 모델
  // 생각(thinking)을 줄이면 훨씬 빨라진다. 모델마다 허용하는 가장 낮은 단계
  const THINKING = {
    'gemini-3.8-flash': 'low',
    'gemini-3.6-flash': 'minimal',
    'gemini-3.5-flash': 'minimal',
    'gemini-3.5-flash-lite': 'minimal',
  };

  async function geminiOnce(apiKey, model, { system, user, schema, maxTokens }, ms) {
    const level = noThinkingCfg.has(model) ? null : THINKING[model];
    const res = await fetchWithin(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
          maxOutputTokens: maxTokens,
          ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
        },
      }),
    }, ms);
    let data = null;
    try {
      data = await res.json();
    } catch (_) { /* 본문 없음 */ }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || '';
      if (res.status === 400 && level && /think/i.test(msg)) {
        noThinkingCfg.add(model);
        throw new AIError('생각 설정 없이 다시 시도합니다.', { status: 400, retryThinking: true });
      }
      if (res.status === 400 && /api key/i.test(msg)) throw new AIError('Gemini API 키가 올바르지 않습니다.', { status: 400 });
      if (res.status === 403) throw new AIError('이 키로는 Gemini API를 쓸 수 없습니다. AI Studio에서 키를 다시 확인하세요.', { status: 403 });
      if (res.status === 404) throw new AIError(`모델 ${model}을(를) 찾을 수 없습니다.`, { status: 404, modelMissing: true });
      if (res.status === 429) throw new AIError('무료 사용량 한도(분당/일일 요청 수)에 걸렸습니다.', { status: 429, retryable: true });
      if (res.status >= 500) throw new AIError('Gemini 서버가 혼잡합니다.', { status: res.status, retryable: true });
      throw new AIError(`요청 오류(${res.status}) ${msg}`.trim(), { status: res.status });
    }
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new AIError(`Gemini가 요청을 차단했습니다(${data.promptFeedback.blockReason}).`);
    }
    const cand = (data.candidates || [])[0];
    if (!cand) throw new AIError('Gemini가 빈 응답을 보냈습니다.', { retryable: true });
    if (cand.finishReason === 'MAX_TOKENS') throw new AIError('응답이 길이 제한에 걸려 잘렸습니다.', { retryable: true });
    const text = ((cand.content && cand.content.parts) || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
    if (!text && cand.finishReason && cand.finishReason !== 'STOP') {
      throw new AIError(`Gemini가 응답을 중단했습니다(${cand.finishReason}).`);
    }
    return parseJSON(text);
  }

  /** 테스트용: 기억해 둔 모델 상태를 비운다 */
  function resetGeminiState() {
    delete workingModel.gemini;
    cooldown.clear();
    noThinkingCfg.clear();
  }

  /** 시도할 모델 순서: 마지막으로 성공한 모델 → 고른 모델 → 나머지. 쉬는 중인 모델은 맨 뒤로. */
  function geminiOrder(preferred, now = Date.now()) {
    const all = [...new Set([workingModel.gemini, preferred, ...PROVIDERS.gemini.fallbackModels].filter(Boolean))];
    const ready = all.filter((m) => !(cooldown.get(m) > now));
    const resting = all.filter((m) => cooldown.get(m) > now).sort((a, b) => cooldown.get(a) - cooldown.get(b));
    return ready.concat(resting);
  }

  async function gemini(apiKey, preferred, req) {
    let lastErr = new AIError('AI 선생님이 제한 시간 안에 답하지 못했어요.', { status: 408 });
    for (let pass = 0; pass < 2; pass++) {
      for (const model of geminiOrder(preferred)) {
        const left = req.deadline - Date.now();
        if (left < 1200) throw lastErr;
        try {
          let out;
          try {
            out = await geminiOnce(apiKey, model, req, Math.min(ATTEMPT_MS, left));
          } catch (e) {
            if (!e.retryThinking) throw e;
            out = await geminiOnce(apiKey, model, req, Math.min(ATTEMPT_MS, req.deadline - Date.now()));
          }
          workingModel.gemini = model;
          cooldown.delete(model);
          return out;
        } catch (e) {
          lastErr = e;
          // 모델이 없거나(404), 한도(429, 모델별로 따로 셈)·혼잡(5xx)·지연(408)이면 다음 모델로
          if (!(e.modelMissing || e.status === 429 || e.status === 408 || e.status >= 500 || (e.retryable && !e.status))) throw e;
          if (workingModel.gemini === model) delete workingModel.gemini;
          cooldown.set(model, Date.now() + (e.modelMissing ? 24 * 3600e3 : COOLDOWN_MS));
        }
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    throw lastErr;
  }

  /** 키 확인 겸 사용 가능한 텍스트 모델 목록 */
  async function listGeminiModels(apiKey) {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || '';
      if (/api key/i.test(msg) || res.status === 400 || res.status === 403) throw new AIError('Gemini API 키가 올바르지 않습니다.', { status: res.status });
      throw new AIError(`모델 목록을 불러오지 못했습니다(${res.status}).`, { status: res.status, retryable: true });
    }
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-/.test(n) && !/(tts|live|image|embedding|transcribe|robotics|audio|vision|aqa|computer|banana|omni|customtools|research)/i.test(n));
  }

  /* ---------- Claude ---------- */
  async function claudeOnce(apiKey, model, { system, user, schema, effort, deadline }) {
    const res = await fetchWithin('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { effort, format: { type: 'json_schema', schema } },
          fallbacks: 'default',
        }),
    }, deadline - Date.now());
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error?.message || '';
      } catch (_) { /* 본문 없음 */ }
      if (res.status === 401) throw new AIError('Claude API 키가 올바르지 않습니다.', { status: 401 });
      if (res.status === 403) throw new AIError('이 API 키로는 해당 모델을 쓸 수 없습니다.', { status: 403 });
      if (res.status === 429) throw new AIError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', { status: 429, retryable: true });
      if (res.status >= 500) throw new AIError('Claude 서버가 혼잡합니다.', { status: res.status, retryable: true });
      throw new AIError(`요청 오류(${res.status}) ${detail}`.trim(), { status: res.status });
    }
    const msg = await res.json();
    if (msg.stop_reason === 'refusal') throw new AIError('Claude가 이 답변의 평가를 거절했습니다.');
    if (msg.stop_reason === 'max_tokens') throw new AIError('응답이 길이 제한에 걸려 잘렸습니다.', { retryable: true });
    return parseJSON((msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
  }

  /* ---------- 공개 API ---------- */
  /** budgetMs 안에 끝내거나 포기한다. 포기하면 앱은 초파리 뇌 점수와 기본 피드백으로 진행한다. */
  async function call(ai, req, budgetMs) {
    const deadline = Date.now() + budgetMs;
    const r = { ...req, deadline };
    if (ai.provider !== 'claude') return gemini(ai.apiKey, ai.model || PROVIDERS.gemini.defaultModel, r);
    const model = ai.model || PROVIDERS.claude.defaultModel;
    try {
      return await claudeOnce(ai.apiKey, model, r);
    } catch (e) {
      if (!(e instanceof AIError) || !e.retryable || deadline - Date.now() < 3000) throw e;
      await new Promise((res) => setTimeout(res, 800));
      return claudeOnce(ai.apiKey, model, r);
    }
  }

  /** 방금 답변을 평가하고 다음 질문을 받는다. ai = { provider, apiKey, model } */
  async function evaluateAnswer({ ai, settings, history, question, transcript, analysis, remaining, budgetMs = 15000 }) {
    const raw = await call(ai, {
      system: systemPrompt(settings),
      user: evalUserPrompt({ settings, history, question, transcript, analysis, remaining }),
      schema: EVAL_SCHEMA,
      effort: 'low',
      maxTokens: 4096,
    }, budgetMs);
    return normalizeEvaluation(raw);
  }

  /** 전체 면접 총평. */
  async function finalReport({ ai, settings, results, summary, budgetMs = 20000 }) {
    const raw = await call(ai, {
      system: systemPrompt(settings),
      user: reportUserPrompt({ results, summary }),
      schema: REPORT_SCHEMA,
      effort: 'low',
      maxTokens: 4096,
    }, budgetMs);
    return normalizeReport(raw);
  }

  const api = {
    PROVIDERS, PERSONAS, MODE_LABELS, EVAL_SCHEMA, REPORT_SCHEMA, AIError,
    toGeminiSchema, parseJSON, cleanReaction, normalizeEvaluation, normalizeReport, systemPrompt, evalUserPrompt,
    evaluateAnswer, finalReport, listGeminiModels, geminiOrder, resetGeminiState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AI = api;
})(typeof window !== 'undefined' ? window : globalThis);
