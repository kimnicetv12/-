/* 초파리 뇌 엔진: 초파리 버섯체(mushroom body) 회로를 본뜬 답변 인식·평가 모델
 *
 *   투사뉴런(PN, 64)  ──무작위 7개씩──▶  케년세포(KC, 2000)  ──APL 억제: 상위 5%만 발화──▶
 *   출력뉴런(MBON, 평가 항목마다 '좋음'·'나쁨' 한 쌍)  ◀── 도파민뉴런(DAN)이 학습 신호
 *
 * - 인식: 답변 하나가 KC 2000개 중 100개만 켜지는 '희소 코드(냄새 지문)'가 된다.
 *   이 지문으로 답변 유형을 알아보고, 예전에 했던 답과 겹치는지 찾는다(FlyHash, Dasgupta 2017).
 * - 평가: 켜진 KC→MBON 시냅스 세기의 비율이 점수가 된다.
 * - 학습: 선생님 점수(AI 면접관·사용자 피드백)가 오면 도파민처럼 켜진 시냅스만 고친다
 *   (KC→MBON 가소성, Hige 2015 / 초파리식 연속학습, Shen·Dasgupta·Navlakha 2023).
 */
(function (root) {
  const Metrics = root.Metrics || (typeof require !== 'undefined' ? require('./metrics.js') : null);
  const Corpus = root.FlyCorpus || (typeof require !== 'undefined' ? require('./flycorpus.js') : null);

  const N_TEXT = 8; // 답변 글자 '냄새' 채널
  const FEATURES = [
    // [이름, 설명]
    ['length', '답변 분량'],
    ['sentences', '문장 수'],
    ['conclusionFirst', '결론부터 말하기'],
    ['structure', '구조 표현(첫째·결과적으로…)'],
    ['numbers', '숫자·수치'],
    ['experience', '경험 서술'],
    ['result', '결과·배운 점'],
    ['cliche', '상투적 표현(열정·최선…)'],
    ['relevance', '질문과의 관련성'],
    ['jobWords', '직무 관련 단어'],
    ['formal', '격식 있는 끝맺음'],
    ['sentenceFit', '문장 길이 적절성'],
    ['hedges', '자신 없는 표현'],
    ['listing', '단어 나열'],
    ['repeats', '말 반복'],
    ['rateFit', '말 속도 적절성'],
    ['fillers', '군말'],
    ['habits', '습관어'],
    ['pauses', '긴 끊김'],
    ['latency', '첫 마디까지 시간'],
    ['durationFit', '답변 시간 적절성'],
  ];
  const DELIVERY_FEATURES = ['rateFit', 'fillers', 'habits', 'pauses', 'latency', 'durationFit'];
  const N_PN = N_TEXT + FEATURES.length * 2; // 각 특징은 ON·OFF 두 채널(64)
  const N_KC = 2000;
  const PN_PER_KC = 7;
  const N_ACTIVE = Math.round(N_KC * 0.05); // APL 억제 후 남는 KC
  const DIMS = ['content', 'logic', 'specificity', 'job_fit', 'delivery'];
  const TYPES = ['star', 'claim', 'abstract', 'list', 'short'];
  const TYPE_LABELS = {
    star: '경험(STAR)형',
    claim: '결론·근거형',
    abstract: '추상·다짐형',
    list: '나열형',
    short: '단답형',
  };
  const STORE_KEY = 'malang.flybrain.v2';
  const SIMILAR_AT = 0.25; // 단어 지문이 이만큼 겹치면 '닮은 답'(0.45 이상이면 거의 같은 답)
  const MEMORY_KEY = 'malang.flymemory.v1';

  const JOB_WORDS = {
    general: ['엑셀', '고객', '매출', '비용', '업무', '협업', '데이터', '관리', '회계', '보고', '프로세스', '재고', '팀'],
    it: ['개발', '코드', '서버', '프로젝트', '데이터', 'API', '성능', '버그', '테스트', '배포', '리액트', '쿼리', '알고리즘', '로그', '기술'],
    public: ['민원', '공정', '행정', '규정', '국민', '주민', '공공', '정책', '원칙', '공직', '선례'],
    broadcast: ['방송', '생방송', '뉴스', '시청자', '원고', '발음', '진행', '아나운서', '멘트', '송출', '마이크', '대본'],
    sales: ['고객', '판매', '매출', '목표', '설득', '계약', '영업', '서비스', '응대', '만족', '손님'],
    university: ['학과', '탐구', '전공', '연구', '공부', '수업', '실험', '보고서', '대회', '진로', '학업'],
  };

  /* ---------- 작은 도구 ---------- */
  function rng(seed) {
    // mulberry32: 같은 씨앗이면 언제나 같은 배선
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const count = (text, re) => (text.match(re) || []).length;
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  /** 가운데가 1이고 범위를 벗어날수록 줄어드는 적합도 */
  function fit(v, lo, hi, spread) {
    if (v >= lo && v <= hi) return 1;
    const d = v < lo ? lo - v : v - hi;
    return clamp01(1 - d / spread);
  }

  /* ---------- 투사뉴런: 답변 → 64개 입력 ---------- */
  function sentencesOf(text) {
    return text.split(/(?<=[다요죠까])\s+|[.!?。]\s*/).map((s) => s.trim()).filter((s) => s.length > 1);
  }

  function stem(word) {
    return word.replace(/(은|는|이|가|을|를|에|의|도|로|으로|과|와|요|에서|하는|하신|했던|인가요|입니까|나요)$/, '');
  }

  function featuresOf({ question = '', transcript = '', analysis = {}, field = 'general' }) {
    const text = String(transcript || '').trim();
    const syll = Metrics ? Metrics.countSyllables(text) : text.length;
    const sents = sentencesOf(text);
    const sentCount = Math.max(1, sents.length);
    const avgSent = syll / sentCount;
    const qWords = (question.match(/[가-힣A-Za-z]{2,}/g) || []).map(stem).filter((w) => w.length >= 2);
    const relevance = qWords.length ? qWords.filter((w) => text.includes(w.slice(0, 2))).length / qWords.length : 0.5;
    const jobWords = (JOB_WORDS[field] || JOB_WORDS.general).filter((w) => text.includes(w)).length;
    const a = analysis;
    const typed = !!a.textMode || a.rate == null;

    const f = {
      length: clamp01(syll / 250),
      sentences: clamp01(sentCount / 6),
      conclusionFirst: /^.{0,45}(결론|말씀드리면|핵심은|가장 .{0,12}(은|는)|라고 생각합니다|입니다)/.test(text) ? 1 : 0,
      structure: clamp01(count(text, /(첫째|둘째|셋째|먼저|다음으로|마지막으로|결론|요약하면|정리하면|왜냐하면|예를 들어|그 결과|결과적으로|따라서|그래서|다만|이후)/g) / 4),
      numbers: clamp01(count(text, /\d+(?:[.,]\d+)?|(?:한|두|세|네|다섯)\s?(?:번|명|달|가지|개월)|[일이삼사오육칠팔구십백천만]+\s?(?:년|개월|명|퍼센트|배|회|위)/g) / 3),
      experience: clamp01(count(text, /(경험|당시|때|프로젝트|활동|맡아|맡았|했습니다|했고|였습니다|시절)/g) / 5),
      result: clamp01(count(text, /(결과|성과|높였|줄였|올랐|늘었|개선|달성|받았|배웠|얻었|완성|해결|합의)/g) / 3),
      cliche: clamp01(count(text, /(열정|최선|성실|노력하|열심히|꿈이|꼭 오고|책임감|인재|잘 부탁|성장하고 싶)/g) / 3),
      relevance: clamp01(relevance),
      jobWords: clamp01(jobWords / 3),
      formal: clamp01(count(text, /(습니다|니다|입니다|겠습니다)/g) / sentCount),
      sentenceFit: fit(avgSent, 20, 55, 30),
      hedges: clamp01(count(text, /(것 같|잘 모르|아마|딱히|글쎄|그냥)/g) / 2),
      listing: clamp01((count(text, /,/g) + count(text, /(그리고|또한|도 중요)/g)) / 5),
      repeats: clamp01((a.repeats || 0) / 3),
      // 말하기 특징: 타이핑이면 '모름(0.5)'
      rateFit: typed ? 0.5 : a.rate ? fit(a.rate, 250, 340, 120) : 0,
      fillers: typed ? 0.5 : clamp01((a.fillerPerMin || 0) / 4),
      habits: typed ? 0.5 : clamp01((a.habitPerMin || 0) / 6),
      pauses: typed ? 0.5 : clamp01((a.longPauses || 0) / 4),
      latency: typed ? 0.5 : clamp01((a.firstSpeechSec || 0) / 8),
      durationFit: typed ? 0.5 : fit(a.speakingSec || 0, 25, 100, 40),
    };
    return f;
  }

  function projectionInput(args) {
    const f = featuresOf(args);
    const pn = new Float32Array(N_PN);
    // 글자 냄새: 단어 안의 두 글자 조각을 24개 채널에 흩뿌린다
    const words = String(args.transcript || '').match(/[가-힣A-Za-z0-9]+/g) || [];
    for (const w of words) {
      for (let i = 0; i < w.length - 1; i++) pn[fnv(w.slice(i, i + 2)) % N_TEXT] += 1;
    }
    let max = 0;
    for (let i = 0; i < N_TEXT; i++) max = Math.max(max, pn[i]);
    if (max > 0) for (let i = 0; i < N_TEXT; i++) pn[i] /= max;
    // 특징마다 ON(값)·OFF(1-값) 채널: 실제 초파리 사구체처럼 켜질 때·꺼질 때 반응하는 쌍
    FEATURES.forEach(([name], i) => {
      pn[N_TEXT + i * 2] = f[name];
      pn[N_TEXT + i * 2 + 1] = 1 - f[name];
    });
    return { pn, features: f };
  }

  /* ---------- 케년세포: 무작위 배선 + APL 억제 ---------- */
  const WIRING = (() => {
    const r = rng(20240415);
    const w = new Uint8Array(N_KC * PN_PER_KC);
    for (let k = 0; k < N_KC; k++) {
      const picked = new Set();
      while (picked.size < PN_PER_KC) picked.add(Math.floor(r() * N_PN));
      [...picked].forEach((p, j) => (w[k * PN_PER_KC + j] = p));
    }
    return w;
  })();

  /** k번 케년세포가 실제로 연결된 투사뉴런 7개 */
  function wiringOf(k) {
    return Array.from(WIRING.subarray(k * PN_PER_KC, (k + 1) * PN_PER_KC));
  }

  function kenyon(pn) {
    const act = new Float32Array(N_KC);
    for (let k = 0; k < N_KC; k++) {
      let s = 0;
      for (let j = 0; j < PN_PER_KC; j++) s += pn[WIRING[k * PN_PER_KC + j]];
      act[k] = s;
    }
    // APL 뉴런의 전역 억제: 가장 강한 5%만 살아남는다
    const order = Array.from(act.keys()).sort((a, b) => act[b] - act[a] || a - b);
    return { active: order.slice(0, N_ACTIVE).sort((a, b) => a - b), act };
  }

  /* ---------- 반복 답변 찾기: 단어 냄새만 맡는 두 번째 회로 (FlyHash) ---------- */
  const N_WORD_PN = 256;
  // 어느 답변에나 나오는 끝맺음·조사 조각은 냄새로 치지 않는다
  const COMMON = new Set(['습니', '니다', '입니', '했습', '있습', '겠습', '하겠', '합니', '었습', '였습', '하는', '에서', '으로', '하고', '해서', '저는', '제가', '그리', '리고', '것이', '하게', '되었', '었고', '했고', '하며', '면서', '에게', '까지', '부터', '대한', '같은', '있는', '하면', '생각', '각합']);
  const WORD_WIRING = (() => {
    const r = rng(99);
    const idx = new Uint8Array(N_KC * PN_PER_KC);
    const wt = new Float32Array(N_KC * PN_PER_KC); // 시냅스마다 세기가 조금씩 다르다
    for (let k = 0; k < N_KC; k++) {
      const picked = new Set();
      while (picked.size < PN_PER_KC) picked.add(Math.floor(r() * N_WORD_PN));
      [...picked].forEach((p, j) => {
        idx[k * PN_PER_KC + j] = p;
        wt[k * PN_PER_KC + j] = 0.5 + r();
      });
    }
    return { idx, wt };
  })();

  function wordCode(transcript) {
    const pn = new Float32Array(N_WORD_PN);
    const words = String(transcript || '').match(/[가-힣A-Za-z0-9]+/g) || [];
    for (const w of words) {
      for (let i = 0; i < w.length - 1; i++) {
        const g = w.slice(i, i + 2);
        if (!COMMON.has(g)) pn[fnv(g) % N_WORD_PN] = 1; // 있다/없다만 본다
      }
    }
    const act = new Float32Array(N_KC);
    for (let k = 0; k < N_KC; k++) {
      let s = 0;
      for (let j = 0; j < PN_PER_KC; j++) s += pn[WORD_WIRING.idx[k * PN_PER_KC + j]] * WORD_WIRING.wt[k * PN_PER_KC + j];
      act[k] = s;
    }
    return Array.from(act.keys()).sort((a, b) => act[b] - act[a] || a - b).slice(0, N_ACTIVE);
  }

  /* ---------- 버섯체 출력뉴런 + 도파민 학습 ---------- */
  class Brain {
    constructor() {
      this.good = DIMS.map(() => new Float32Array(N_KC).fill(0.5));
      this.bad = DIMS.map(() => new Float32Array(N_KC).fill(0.5));
      this.usage = new Uint16Array(N_KC);
      // 유형 인식용 출력뉴런: 유형마다 하나, 켜진 KC에서 받는 힘이 가장 큰 유형으로 알아본다
      this.typeW = TYPES.map(() => new Float32Array(N_KC));
      this.lessons = 0; // 선생님에게 배운 횟수
      // 출력뉴런의 이득(gain)·기준점: 타고난 학습 후 맞춘다. 점수 = 5 + gain × (원래 출력 − center)
      this.gain = DIMS.map(() => 1);
      this.center = DIMS.map(() => 5);
    }

    /** 켜진 KC에서 '좋음'·'나쁨' 출력뉴런이 받는 힘의 비율 → 0~10점.
     *  한 번도 배운 적 없는 KC는 아무 정보가 없으니 투표에서 뺀다(전부 처음이면 모두 쓴다). */
    readout(active) {
      const voters = active.filter((k) => this.usage[k] > 0);
      const use = voters.length ? voters : active;
      return DIMS.map((_, d) => {
        let g = 0;
        let b = 0;
        for (const k of use) {
          g += this.good[d][k];
          b += this.bad[d][k];
        }
        const raw = (g / (g + b || 1)) * 10;
        // 뉴런처럼 끝으로 갈수록 천천히 포화한다(10점·0점은 거의 안 나온다)
        return 5 + 4.9 * Math.tanh((this.gain[d] * (raw - this.center[d])) / 4.9);
      });
    }

    /** 예시들의 원래 출력과 정답을 비교해 항목마다 이득을 맞춘다(최소제곱). */
    calibrate(samples) {
      const keep = { gain: this.gain.slice(), center: this.center.slice() };
      this.gain = DIMS.map(() => 1);
      this.center = DIMS.map(() => 5);
      const raws = samples.map((s) => this.readout(s.code));
      DIMS.forEach((_, d) => {
        const xs = raws.map((r) => r[d]);
        const ys = samples.map((s) => s.targets[d]);
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const my = ys.reduce((a, b) => a + b, 0) / ys.length;
        let sxy = 0;
        let sxx = 0;
        xs.forEach((x, i) => {
          sxy += (x - mx) * (ys[i] - my);
          sxx += (x - mx) ** 2;
        });
        const slope = sxx ? sxy / sxx : 1;
        keep.gain[d] = Math.max(0.5, Math.min(6, slope));
        keep.center[d] = mx - (my - 5) / keep.gain[d];
      });
      this.gain = keep.gain;
      this.center = keep.center;
    }

    recognizeType(active) {
      const power = TYPES.map((_, t) => active.reduce((s, k) => s + this.typeW[t][k], 0));
      const best = power.indexOf(Math.max(...power));
      const total = power.reduce((a, b) => a + b, 0);
      return { type: TYPES[best], confidence: total ? power[best] / total : 0 };
    }

    learnType(active, type, lr = 0.1) {
      const ti = TYPES.indexOf(type);
      if (ti < 0) return;
      TYPES.forEach((_, t) => {
        const y = t === ti ? 1 : 0;
        for (const k of active) this.typeW[t][k] += lr * (y - this.typeW[t][k]);
      });
    }

    /** 도파민 학습: 켜진 시냅스만 선생님 점수 쪽으로 옮긴다(좋으면 '나쁨' 시냅스 약화, 나쁘면 '좋음' 약화) */
    learn(active, targets, lr = 0.12) {
      DIMS.forEach((_, d) => {
        const t = targets[d];
        if (t == null || Number.isNaN(t)) return;
        const y = clamp01(t / 10);
        for (const k of active) {
          this.good[d][k] += lr * (y - this.good[d][k]);
          this.bad[d][k] += lr * (1 - y - this.bad[d][k]);
        }
      });
      for (const k of active) this.usage[k] = Math.min(65535, this.usage[k] + 1);
    }

    familiarity(active) {
      return active.filter((k) => this.usage[k] > 0).length / active.length;
    }

    serialize() {
      const pack = (arrs) => {
        const bytes = new Uint8Array(arrs.length * N_KC);
        arrs.forEach((a, d) => a.forEach((v, k) => (bytes[d * N_KC + k] = Math.round(clamp01(v) * 255))));
        return toB64(bytes);
      };
      return JSON.stringify({ v: 2, lessons: this.lessons, gain: this.gain, center: this.center, good: pack(this.good), bad: pack(this.bad), type: pack(this.typeW), usage: toB64(new Uint8Array(this.usage.buffer)) });
    }

    static deserialize(json) {
      const o = JSON.parse(json);
      if (o.v !== 2) throw new Error('version');
      const b = new Brain();
      const unpack = (s, arrs) => {
        const bytes = fromB64(s);
        arrs.forEach((a, d) => a.forEach((_, k) => (a[k] = bytes[d * N_KC + k] / 255)));
      };
      unpack(o.good, b.good);
      unpack(o.bad, b.bad);
      unpack(o.type, b.typeW);
      b.usage = new Uint16Array(fromB64(o.usage).buffer.slice(0));
      b.lessons = o.lessons || 0;
      if (o.gain) b.gain = o.gain;
      if (o.center) b.center = o.center;
      return b;
    }
  }

  function toB64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  /* ---------- 타고난 지식: 예시 답변으로 미리 배운 뇌 ---------- */
  // 같은 답을 말하기 습관만 바꿔 세 번 들려준다(좋음·빠르고 군말 많음·느리고 자주 끊김)
  const VOICES = [
    { rate: 300, fillerPerMin: 0.3, habitPerMin: 1, longPauses: 0, firstSpeechSec: 1.5, speakingSec: 50 },
    { rate: 395, fillerPerMin: 4, habitPerMin: 5, longPauses: 1, firstSpeechSec: 2, speakingSec: 35 },
    { rate: 195, fillerPerMin: 2.5, habitPerMin: 2, longPauses: 4, firstSpeechSec: 6.5, speakingSec: 80 },
  ];

  function seedSamples(entries) {
    const out = [];
    for (const e of entries) {
      const base = Metrics ? Metrics.analyzeDelivery({ transcript: e.a, durationMs: 50000, firstSpeechMs: 1500, activity: [] }) : {};
      VOICES.forEach((v) => {
        const analysis = { ...base, ...v, textMode: false };
        analysis.rateVerdict = v.rate < 250 ? '느림' : v.rate > 340 ? '빠름' : '적절';
        const delivery = Metrics ? Metrics.deliveryScore(analysis) : 5;
        out.push({ entry: e, args: { question: e.q, transcript: e.a, analysis, field: e.field }, targets: [...e.s, delivery] });
      });
    }
    return out;
  }

  function trainInnate(brain, entries, epochs = 30) {
    const samples = seedSamples(entries).map((s) => ({ ...s, code: kenyon(projectionInput(s.args).pn).active }));
    const r = rng(7);
    for (let ep = 0; ep < epochs; ep++) {
      const order = samples.slice().sort(() => r() - 0.5);
      for (const s of order) {
        brain.learn(s.code, s.targets, 0.08);
        brain.learnType(s.code, s.entry.type, 0.08);
      }
    }
    for (const s of samples) for (const k of s.code) brain.usage[k] = 1;
    brain.calibrate(samples);
    return samples;
  }

  /* ---------- 공개 API ---------- */
  let brain = null;
  let memory = [];

  function storage() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (_) {
      return null;
    }
  }

  function init({ fresh = false } = {}) {
    const ls = storage();
    brain = null;
    if (!fresh && ls) {
      try {
        const saved = ls.getItem(STORE_KEY);
        if (saved) brain = Brain.deserialize(saved);
      } catch (_) {
        brain = null;
      }
      try {
        memory = JSON.parse(ls.getItem(MEMORY_KEY)) || [];
      } catch (_) {
        memory = [];
      }
    }
    const entries = Corpus ? Corpus.ENTRIES : [];
    if (!brain) {
      brain = new Brain();
      trainInnate(brain, entries);
    }
    return brain;
  }

  function save() {
    const ls = storage();
    if (!ls || !brain) return;
    try {
      ls.setItem(STORE_KEY, brain.serialize());
      ls.setItem(MEMORY_KEY, JSON.stringify(memory.slice(-120)));
    } catch (_) { /* 저장 공간 부족 등 */ }
  }

  function reset() {
    const ls = storage();
    if (ls) {
      try {
        ls.removeItem(STORE_KEY);
        ls.removeItem(MEMORY_KEY);
      } catch (_) { /* 무시 */ }
    }
    memory = [];
    init({ fresh: true });
  }

  function jaccard(a, b) {
    let inter = 0;
    for (const k of a) if (b.has(k)) inter += 1;
    return inter / (a.size + b.size - inter || 1);
  }

  /** 인식 + 평가. 아직 배우지는 않는다(점수를 먼저 내고, 선생님 점수가 오면 learn). */
  function evaluate({ question, transcript, analysis, field }) {
    if (!brain) init();
    const typed = !!(analysis && analysis.textMode);
    const { pn, features } = projectionInput({ question, transcript, analysis, field });
    const { active, act } = kenyon(pn);
    const raw = brain.readout(active);
    const scores = {};
    DIMS.forEach((d, i) => (scores[d] = Math.round(raw[i])));
    if (typed) scores.delivery = null;

    // 유형 인식: 유형 출력뉴런 중 가장 세게 반응한 것
    const code = new Set(active);
    const { type, confidence } = brain.recognizeType(active);

    // 기억: 예전에 했던 답과 단어 냄새 지문이 얼마나 겹치나
    const words = wordCode(transcript);
    const wset = new Set(words);
    let similar = null;
    for (const m of memory) {
      const sim = jaccard(wset, new Set(m.code));
      if (!similar || sim > similar.sim) similar = { sim, question: m.question, date: m.date };
    }

    return {
      scores,
      raw,
      active,
      pn: Array.from(pn),
      kcActivity: act,
      features,
      type,
      typeLabel: TYPE_LABELS[type],
      typeConfidence: confidence,
      wordCode: words,
      similar: similar && similar.sim >= SIMILAR_AT ? similar : null,
      familiarity: brain.familiarity(active),
      lessons: brain.lessons,
    };
  }

  /** 선생님 점수(0~10, 항목별)로 배운다. delivery가 null이면 그 항목은 건너뛴다. */
  function learn(result, teacherScores, lr = 0.12) {
    if (!brain) init();
    brain.learn(result.active, DIMS.map((d) => (teacherScores[d] == null ? null : teacherScores[d])), lr);
    brain.lessons += 1;
  }

  function remember({ question, result }) {
    if (!String(result.wordCode || '').length) return;
    memory.push({ question, code: result.wordCode, date: new Date().toISOString() });
    if (memory.length > 120) memory = memory.slice(-120);
  }

  function stats() {
    if (!brain) init();
    return { lessons: brain.lessons, memories: memory.length, kc: N_KC, pn: N_PN, active: N_ACTIVE, pnPerKc: PN_PER_KC };
  }

  const api = {
    N_PN, N_KC, N_ACTIVE, PN_PER_KC, DIMS, TYPES, FEATURES, DELIVERY_FEATURES, TYPE_LABELS,
    Brain, featuresOf, projectionInput, kenyon, wiringOf, wordCode, jaccard, trainInnate, seedSamples,
    init, save, reset, evaluate, learn, remember, stats,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlyBrain = api;
})(typeof window !== 'undefined' ? window : globalThis);
