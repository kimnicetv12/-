/* 발화 분석: 말 속도, 군말, 쉼, 첫 반응 시간 등 전달력 지표를 계산하고
 * API 키가 없을 때 쓰는 간이 채점을 제공한다. 브라우저와 Node 양쪽에서 동작. */
(function (root) {
  // 단독으로 쓰이면 의미 없는 간투사
  const FILLERS = ['음', '으음', '음음', '어', '어어', '아', '에', '엄', '흠', '응'];
  // 의미는 있지만 습관적으로 남발하기 쉬운 말
  const HABIT_WORDS = ['약간', '뭔가', '그냥', '막', '이제', '좀', '사실', '그러니까', '뭐랄까', '솔직히', '진짜', '되게'];
  const STRUCTURE_MARKERS = [
    '첫째', '둘째', '셋째', '첫 번째', '두 번째', '세 번째', '먼저', '다음으로', '마지막으로',
    '결론적으로', '결론부터', '요약하면', '정리하면', '왜냐하면', '이유는', '예를 들어', '예컨대',
    '그 결과', '결과적으로', '따라서', '그래서', '반면', '하지만',
  ];
  const NUMBER_RE = /\d+(?:[.,]\d+)?\s*(?:%|퍼센트|년|개월|달|주|일|시간|분|명|건|배|번|회|위|등|만|억|원|개)?|(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:번|명|달|가지|개월|해)|(?:[일이삼사오육칠팔구십백천만]+)\s*(?:년|개월|명|퍼센트|배|회|위|등)/g;

  const IDEAL_RATE = { min: 250, max: 340 }; // 음절/분
  const LONG_PAUSE_MS = 2500;

  function normalizeToken(tok) {
    return tok.replace(/[.,!?~…·"'()\[\]]/g, '').trim();
  }

  function countSyllables(text) {
    const hangul = (text.match(/[가-힣]/g) || []).length;
    // 영어 단어·숫자는 대략 단어당 2음절로 계산
    const latin = (text.match(/[A-Za-z]+|\d+/g) || []).length * 2;
    return hangul + latin;
  }

  function countFillers(text) {
    const tokens = text.split(/\s+/).map(normalizeToken).filter(Boolean);
    const fillers = {};
    const habits = {};
    let repeats = 0;
    tokens.forEach((tok, i) => {
      // "음..." "어어" 처럼 늘어진 형태도 같은 간투사로 본다
      const squashed = tok.replace(/(.)\1+/g, '$1');
      if (FILLERS.includes(tok) || FILLERS.includes(squashed)) {
        const key = squashed;
        fillers[key] = (fillers[key] || 0) + 1;
      } else if (HABIT_WORDS.includes(tok)) {
        habits[tok] = (habits[tok] || 0) + 1;
      }
      if (i > 0 && tok.length >= 1 && tok === tokens[i - 1] && !FILLERS.includes(tok)) repeats += 1;
    });
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    return { fillers, habits, fillerCount: sum(fillers), habitCount: sum(habits), repeats, wordCount: tokens.length };
  }

  function countStructure(text) {
    const found = STRUCTURE_MARKERS.filter((m) => text.includes(m));
    const numbers = (text.match(NUMBER_RE) || []).map((s) => s.trim()).filter(Boolean);
    return { markers: found, numbers };
  }

  /**
   * answer: {
   *   transcript: string,          // 최종 인식 결과
   *   durationMs: number,          // 답변 시작~종료
   *   firstSpeechMs: number|null,  // 시작 후 첫 인식까지
   *   activity: number[],          // 인식 이벤트가 온 시각(ms, 답변 시작 기준)
   * }
   */
  function analyzeDelivery(answer) {
    const text = (answer.transcript || '').trim();
    const durationSec = Math.max(0, (answer.durationMs || 0) / 1000);
    const firstSpeechSec = answer.firstSpeechMs == null ? null : answer.firstSpeechMs / 1000;
    const syllables = countSyllables(text);

    const activity = (answer.activity || []).slice().sort((a, b) => a - b);
    let longPauses = 0;
    let longestPauseSec = 0;
    for (let i = 1; i < activity.length; i++) {
      const gap = activity[i] - activity[i - 1];
      if (gap >= LONG_PAUSE_MS) longPauses += 1;
      longestPauseSec = Math.max(longestPauseSec, gap / 1000);
    }

    // 말 속도는 첫 발화 이후부터 마지막 발화까지를 기준으로 본다
    const speechStart = firstSpeechSec == null ? 0 : firstSpeechSec;
    const speechEnd = activity.length ? activity[activity.length - 1] / 1000 : durationSec;
    const speakingSec = Math.max(1, speechEnd - speechStart);
    const rate = syllables > 0 ? Math.round((syllables / speakingSec) * 60) : 0;

    const f = countFillers(text);
    const minutes = Math.max(speakingSec / 60, 0.25);
    const s = countStructure(text);

    return {
      durationSec: Math.round(durationSec * 10) / 10,
      speakingSec: Math.round(speakingSec * 10) / 10,
      firstSpeechSec: firstSpeechSec == null ? null : Math.round(firstSpeechSec * 10) / 10,
      syllables,
      rate,
      rateVerdict: rate === 0 ? '측정 불가' : rate < IDEAL_RATE.min ? '느림' : rate > IDEAL_RATE.max ? '빠름' : '적절',
      fillers: f.fillers,
      habits: f.habits,
      fillerCount: f.fillerCount,
      habitCount: f.habitCount,
      fillerPerMin: Math.round((f.fillerCount / minutes) * 10) / 10,
      habitPerMin: Math.round((f.habitCount / minutes) * 10) / 10,
      repeats: f.repeats,
      wordCount: f.wordCount,
      longPauses,
      longestPauseSec: Math.round(longestPauseSec * 10) / 10,
      structureMarkers: s.markers,
      numbers: s.numbers,
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function deliveryScore(a) {
    let score = 10;
    if (a.rate === 0) return 0;
    if (a.rate < IDEAL_RATE.min) score -= Math.min(3, (IDEAL_RATE.min - a.rate) / 30);
    if (a.rate > IDEAL_RATE.max) score -= Math.min(3, (a.rate - IDEAL_RATE.max) / 30);
    score -= Math.min(3, Math.max(0, a.fillerPerMin - 1) * 0.6);
    score -= Math.min(1.5, Math.max(0, a.habitPerMin - 3) * 0.3);
    score -= Math.min(2, a.longPauses * 0.7);
    score -= Math.min(1, a.repeats * 0.3);
    if (a.firstSpeechSec != null && a.firstSpeechSec > 5) score -= 1;
    return Math.round(clamp(score, 0, 10));
  }

  /** API 키 없이 쓰는 간이 채점. 내용 평가는 분량·구조·수치 같은 겉모양만 본다. */
  function ruleBasedEvaluation({ question, analysis, timeLimitSec }) {
    const a = analysis;
    const good = [];
    const improve = [];

    const idealMin = Math.min(30, timeLimitSec * 0.4);
    const idealMax = timeLimitSec * 0.95;
    // 타이핑 답변은 걸린 시간 대신 '말로 했다면 걸렸을 시간'(분당 300음절)으로 분량을 본다
    const spokenSec = a.textMode ? Math.round((a.syllables / 300) * 60) : a.speakingSec;
    const overTime = !a.textMode && a.durationSec > idealMax;
    let lengthScore;
    if (spokenSec < idealMin * 0.5 || a.syllables < 40) lengthScore = 3;
    else if (spokenSec < idealMin) lengthScore = 6;
    else if (overTime) lengthScore = 7;
    else lengthScore = 9;

    const logic = clamp(4 + a.structureMarkers.length * 1.5, 0, 10);
    const specificity = clamp(4 + Math.min(a.numbers.length, 3) * 2, 0, 10);
    const delivery = a.textMode ? null : deliveryScore(a);
    const content = lengthScore;
    const jobFit = Math.round((content + specificity) / 2);

    if (lengthScore >= 9) good.push('답변 분량이 적절합니다.');
    else if (lengthScore <= 6) improve.push(`답변이 짧습니다(약 ${spokenSec}초 분량). 경험 → 행동 → 결과 순으로 30초 이상 채워 보세요.`);
    if (overTime) improve.push('제한 시간을 거의 다 썼습니다. 결론을 먼저 말하고 핵심만 전달해 보세요.');
    if (a.structureMarkers.length >= 2) good.push(`'${a.structureMarkers.slice(0, 2).join("', '")}' 같은 연결어로 구조가 드러납니다.`);
    else improve.push('"결론부터 말씀드리면", "첫째/둘째" 같은 표현으로 답변 구조를 드러내 보세요.');
    if (a.numbers.length) good.push(`수치(${a.numbers.slice(0, 3).join(', ')})를 들어 구체적입니다.`);
    else improve.push('기간·인원·성과 같은 숫자를 넣으면 훨씬 구체적으로 들립니다.');
    // 타이핑 답변은 말하기 지표를 평가하지 않는다
    if (!a.textMode) {
      if (a.rateVerdict === '적절') good.push(`말 속도가 안정적입니다(분당 ${a.rate}음절).`);
      else if (a.rateVerdict === '빠름') improve.push(`말이 빠릅니다(분당 ${a.rate}음절). 문장 끝에서 한 박자 쉬어 보세요.`);
      else if (a.rateVerdict === '느림') improve.push(`말이 느린 편입니다(분당 ${a.rate}음절). 문장 사이 공백을 줄여 보세요.`);
      if (a.fillerCount === 0) good.push('"음/어" 같은 군말이 거의 없습니다.');
      else if (a.fillerPerMin > 2) improve.push(`군말이 ${a.fillerCount}회 나왔습니다. 생각할 땐 소리를 내지 말고 잠깐 멈추는 편이 낫습니다.`);
      if (a.habitCount >= 3) {
        const top = Object.entries(a.habits).sort((x, y) => y[1] - x[1])[0];
        improve.push(`습관어 '${top[0]}'를 ${top[1]}회 사용했습니다.`);
      }
      if (a.longPauses >= 2) improve.push(`2.5초 이상 말이 끊긴 구간이 ${a.longPauses}번 있었습니다.`);
      if (a.firstSpeechSec != null && a.firstSpeechSec > 5) improve.push(`첫 마디까지 ${a.firstSpeechSec}초 걸렸습니다. "네, 말씀드리겠습니다"로 시간을 벌어 보세요.`);
    }

    const scores = { content, logic: Math.round(logic), specificity: Math.round(specificity), job_fit: jobFit, delivery };
    return {
      scores,
      overall: overallFromScores(scores),
      feedback_good: good.slice(0, 3),
      feedback_improve: improve.slice(0, 4),
      better_answer: genericTip(question),
      interviewer_reaction: '네, 잘 들었습니다.',
      next_question: '',
      next_is_follow_up: false,
      source: 'rule',
    };
  }

  const WEIGHTS = { content: 0.25, logic: 0.2, specificity: 0.2, job_fit: 0.15, delivery: 0.2 };

  /** 가중 평균(100점). 측정하지 않은 항목(null)은 빼고 가중치를 다시 나눈다. */
  function overallFromScores(scores) {
    let total = 0;
    let weight = 0;
    for (const [k, w] of Object.entries(WEIGHTS)) {
      if (scores[k] == null) continue;
      total += scores[k] * w;
      weight += w;
    }
    return weight ? Math.round((total / weight) * 10) : 0;
  }

  function genericTip(question) {
    if (question.includes('자기소개')) {
      return '한 문장 슬로건("○○한 지원자 ○○○입니다") → 직무와 연결되는 경험 1~2개(수치 포함) → 입사 후 기여 순서로 구성해 보세요.';
    }
    if (/경험|사례|때/.test(question)) {
      return 'STAR 기법: 상황(Situation) → 과제(Task) → 내 행동(Action) → 결과(Result, 가능하면 수치)로 말해 보세요.';
    }
    if (/동기|왜/.test(question)) {
      return '결론(지원 이유 한 줄) → 근거가 되는 본인 경험 → 회사/직무와의 연결 → 포부 순으로 말해 보세요.';
    }
    return '결론을 먼저 한 문장으로 말하고, 근거 1~2개와 짧은 예시로 뒷받침한 뒤 다시 결론으로 마무리해 보세요.';
  }

  function summarizeSession(results) {
    const n = results.length || 1;
    const keys = Object.keys(WEIGHTS);
    const avg = {};
    keys.forEach((k) => {
      const vals = results.map((r) => r.evaluation.scores[k]).filter((v) => v != null);
      avg[k] = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
    });
    const overall = Math.round(results.reduce((s, r) => s + r.evaluation.overall, 0) / n);
    const totals = results.reduce(
      (t, r) => {
        const a = r.analysis;
        if (a.textMode) return t;
        t.fillers += a.fillerCount;
        t.habits += a.habitCount;
        t.pauses += a.longPauses;
        if (a.rate) { t.rateSum += a.rate; t.rateN += 1; }
        return t;
      },
      { fillers: 0, habits: 0, pauses: 0, rateSum: 0, rateN: 0 },
    );
    return {
      avg,
      overall,
      avgRate: totals.rateN ? Math.round(totals.rateSum / totals.rateN) : 0,
      totalFillers: totals.fillers,
      totalHabits: totals.habits,
      totalLongPauses: totals.pauses,
    };
  }

  function gradeFor(overall) {
    if (overall >= 85) return '합격권';
    if (overall >= 70) return '경쟁력 있음';
    if (overall >= 55) return '보완 필요';
    return '집중 연습 필요';
  }

  const api = {
    FILLERS, HABIT_WORDS, STRUCTURE_MARKERS, IDEAL_RATE, WEIGHTS,
    countSyllables, countFillers, countStructure, analyzeDelivery, deliveryScore,
    ruleBasedEvaluation, overallFromScores, summarizeSession, gradeFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Metrics = api;
})(typeof window !== 'undefined' ? window : globalThis);
