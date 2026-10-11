/* Claude API 연동: 면접관 역할(답변 평가 + 다음 질문 생성)과 최종 총평.
 * 별도 서버 없이 브라우저에서 바로 호출하므로 API 키는 사용자 브라우저에만 저장된다. */
(function (root) {
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-opus-5-5';

  const PERSONAS = {
    kind: '온화한 면접관. 지원자가 긴장하지 않도록 부드럽게 반응하되 평가는 정확하게 한다.',
    standard: '실제 공채 면접관. 중립적이고 담백한 말투로, 평가 기준은 실제 합격선에 맞춘다.',
    strict: '깐깐한 압박 면접관. 답변의 허점·모순·모호한 부분을 날카롭게 파고드는 꼬리질문을 던진다. 단, 인신공격은 하지 않는다.',
  };

  const MODE_LABELS = {
    personality: '인성 면접',
    job: '직무 면접',
    mixed: '종합 면접(인성+직무)',
    pressure: '압박 면접',
  };

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
        required: ['content', 'logic', 'specificity', 'job_fit', 'delivery'],
        additionalProperties: false,
      },
      feedback_good: { type: 'array', items: { type: 'string' }, description: '잘한 점 1~3개, 각 한 문장' },
      feedback_improve: { type: 'array', items: { type: 'string' }, description: '고칠 점 1~4개, 구체적인 행동 지침으로' },
      better_answer: { type: 'string', description: '지원자 답변을 살린 개선 답변 예시(3~5문장, 지원자 1인칭)' },
      interviewer_reaction: { type: 'string', description: '면접관이 실제로 소리 내어 할 짧은 반응 한 문장(평가 내용 누설 금지)' },
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

  class ClaudeError extends Error {
    constructor(message, { status, retryable } = {}) {
      super(message);
      this.status = status;
      this.retryable = !!retryable;
    }
  }

  async function callOnce(apiKey, body) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new ClaudeError('네트워크 연결에 실패했습니다.', { retryable: true });
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error?.message || '';
      } catch (_) { /* 본문 없음 */ }
      if (res.status === 401) throw new ClaudeError('API 키가 올바르지 않습니다.', { status: 401 });
      if (res.status === 403) throw new ClaudeError('이 API 키로는 해당 모델을 쓸 수 없습니다.', { status: 403 });
      if (res.status === 429) throw new ClaudeError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', { status: 429, retryable: true });
      if (res.status >= 500) throw new ClaudeError('Claude 서버가 혼잡합니다.', { status: res.status, retryable: true });
      throw new ClaudeError(`요청 오류(${res.status}) ${detail}`.trim(), { status: res.status });
    }
    const msg = await res.json();
    if (msg.stop_reason === 'refusal') throw new ClaudeError('Claude가 이 답변의 평가를 거절했습니다.');
    if (msg.stop_reason === 'max_tokens') throw new ClaudeError('응답이 길이 제한에 걸려 잘렸습니다.', { retryable: true });
    const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new ClaudeError('응답을 해석하지 못했습니다.', { retryable: true });
    }
  }

  async function call(apiKey, body) {
    try {
      return await callOnce(apiKey, body);
    } catch (e) {
      if (!(e instanceof ClaudeError) || !e.retryable) throw e;
      await new Promise((r) => setTimeout(r, 1500));
      return callOnce(apiKey, body);
    }
  }

  function systemPrompt(settings) {
    const target = [settings.fieldLabel, settings.company].filter(Boolean).join(' / ');
    return [
      `당신은 한국어 채용 면접의 면접관입니다. 지원 분야: ${target}. 면접 유형: ${MODE_LABELS[settings.mode]}.`,
      `면접관 성향: ${PERSONAS[settings.persona]}`,
      '',
      '지원자의 답변은 음성 인식으로 받아쓴 텍스트라 띄어쓰기·오타·오인식이 있을 수 있습니다. 의도를 추정해 평가하고, 인식 오류 자체는 감점하지 마세요.',
      '전달력(delivery) 점수는 함께 제공된 측정 지표를 근거로 매기세요. 참고 기준: 말 속도는 분당 250~340음절이 적절, "음/어" 같은 군말은 분당 1회 이하가 좋고, 2.5초 이상 끊김은 적을수록 좋습니다. 음성 인식은 군말을 일부 누락하므로 지표는 실제보다 적게 잡혔을 수 있습니다.',
      '점수는 실제 면접 합격선 기준으로 냉정하게 매기세요. 5점은 평범한 지원자, 8점 이상은 면접관이 인상 깊게 기억할 수준입니다.',
      '피드백은 지원자 답변의 실제 문장을 짚어서 구체적으로 쓰고, 일반론은 피하세요.',
      settings.resume ? `\n지원자가 제출한 자기소개서/이력 요약(질문에 활용하세요):\n"""\n${settings.resume}\n"""` : '',
    ].join('\n');
  }

  function historyText(history) {
    if (!history.length) return '(이전 문답 없음)';
    return history
      .map((h, i) => `Q${i + 1}. ${h.question}\nA${i + 1}. ${h.transcript || '(무응답)'}`)
      .join('\n\n');
  }

  /** 방금 답변을 평가하고 다음 질문을 받는다. */
  async function evaluateAnswer({ apiKey, settings, history, question, transcript, analysis, remaining }) {
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

    const user = [
      '[지금까지의 문답]',
      historyText(history),
      '',
      '[이번 질문]',
      question,
      '',
      '[지원자 답변(음성 인식)]',
      transcript || '(지원자가 아무 말도 하지 않았습니다)',
      '',
      '[측정된 전달력 지표]',
      JSON.stringify(metrics),
      '',
      `[다음 질문 지침] ${nextRule}`,
    ].join('\n');

    const result = await call(apiKey, {
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(settings),
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EVAL_SCHEMA } },
      fallbacks: 'default',
    });
    // 범위를 벗어난 점수는 잘라낸다
    for (const k of Object.keys(result.scores)) {
      result.scores[k] = Math.max(0, Math.min(10, Math.round(Number(result.scores[k]) || 0)));
    }
    result.source = 'claude';
    return result;
  }

  /** 전체 면접 총평. */
  async function finalReport({ apiKey, settings, results, summary }) {
    const lines = results.map((r, i) => [
      `Q${i + 1}. ${r.question}`,
      `A${i + 1}. ${r.transcript || '(무응답)'}`,
      `점수: ${JSON.stringify(r.evaluation.scores)} / 말 속도 ${r.analysis.rate}음절/분, 군말 ${r.analysis.fillerCount}회, 긴 끊김 ${r.analysis.longPauses}회`,
    ].join('\n'));
    const user = [
      '면접이 끝났습니다. 전체 문답과 항목별 점수를 보고 총평을 작성하세요.',
      '',
      lines.join('\n\n'),
      '',
      `[평균 점수] ${JSON.stringify(summary.avg)} / 종합 ${summary.overall}점`,
    ].join('\n');
    return call(apiKey, {
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(settings),
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: REPORT_SCHEMA } },
      fallbacks: 'default',
    });
  }

  root.Claude = { MODEL, PERSONAS, MODE_LABELS, ClaudeError, evaluateAnswer, finalReport };
})(window);
