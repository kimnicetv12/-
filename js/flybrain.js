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
    ['intentMatch', '질문이 묻는 것에 답했는지'],
    ['buzzDensity', '키워드·숫자 몰아넣기'],
    ['particles', '자연스러운 문장(조사 사용)'],
    ['variety', '같은 말 반복 없음'],
    ['pastConcrete', '실제로 한 일(과거형 서술)'],
    ['fillerText', '군말·습관어 섞임(글)'],
    ['repeats', '말 반복'],
    ['rateFit', '말 속도 적절성'],
    ['fillers', '군말'],
    ['habits', '습관어'],
    ['pauses', '긴 끊김'],
    ['latency', '첫 마디까지 시간'],
    ['durationFit', '답변 시간 적절성'],
  ];
  // 중요한 냄새일수록 신호가 세다(실제 초파리도 사구체마다 투사뉴런 수·세기가 다르다)
  let GAIN = {};

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
  const STORE_KEY = 'malang.flybrain.v3'; // 입력 구조가 바뀌면 숫자를 올린다(예전 뇌는 버림)
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

  /* ---------- 질문 의도: 질문이 무엇을 묻는지, 그런 답에 보통 나오는 말 ---------- */
  const INTENTS = [
    { q: /자기소개|소개 부탁/, cues: /(저는|입니다|지원자|전공|경험|강점|활동|맡)/g },
    { q: /지원.{0,6}(동기|이유)|왜 .{0,10}지원|동기/, cues: /(지원|관심|계기|이유|회사|귀사|기관|방송사|학과|서비스|제품|비전|하고 싶|되고 싶|기여|직접 써)/g },
    { q: /강점|약점|장점|단점/, cues: /(강점|약점|장점|단점|부족|보완|고치|극복|개선하)/g },
    { q: /갈등|충돌|의견.{0,8}(다르|갈|차이)|다툼/, cues: /(갈등|충돌|부딪|다투|싸웠|싸우|의견|입장|설득|합의|대화|면담|조율|절충|타협|해결|탓)/g },
    { q: /실패|좌절|힘들었던|어려웠던/, cues: /(실패|실수|좌절|어려|힘들|배웠|깨달|다시|극복|교훈)/g },
    { q: /프로젝트|기술적|개발|구현|디버깅|버그/, cues: /(프로젝트|개발|구현|설계|기술|서버|코드|데이터|역할|맡|구조|성능|테스트|배포|API|앱|로그|오류|버그)/g },
    { q: /하시겠습니까|어떻게 하시|대처|대응하|만약|생긴다면|낸다면/, cues: /(먼저|하겠습니다|하겠|대처|대응|확인|보고|설명|양해|해결|조치|공감)/g },
    { q: /마지막으로|하고 싶은 말/, cues: /(감사|마지막|기회|입사|되겠|기여|포부|다짐|하겠)/g },
    { q: /배우|학습|공부하는/, cues: /(배우|배울|공부|학습|문서|강의|정리|연습|익히|만들어)/g },
    { q: /활동|학창|열정적|참여한/, cues: /(활동|동아리|참여|맡|대회|봉사|학생회|멘토링|방송부)/g },
    { q: /팔아|판매해/, cues: /(이 펜|제품|장점|필요|드리|가격|구매|사용|서명)/g },
    { q: /생각하나요|생각하십니까|무엇이라고|조건|덕목/, cues: /(생각합니다|이라고|중요|왜냐하면|때문|이유|조건|덕목)/g },
    { q: /설득/, cues: /(설득|제안|권|판매|팔|손님|고객|동의)/g },
    { q: /합의/, cues: /(합의|의견|근거|측정|정했|맞춰|조율)/g },
  ];

  function intentMatchOf(question, text) {
    const hit = INTENTS.find((it) => it.q.test(question));
    if (!hit) return 0.5; // 모르는 유형의 질문이면 판단 보류
    return clamp01(count(text, hit.cues) / 2);
  }

  /* ---------- 투사뉴런: 답변 → 입력 ---------- */
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
    const wordList = text.match(/[가-힣A-Za-z0-9%]+/g) || [];
    const buzz = count(text, /(첫째|둘째|셋째|결론|결과|성과|달성|개선|향상|프로젝트|경험)/g) + count(text, /\d+/g);

    const f = {
      length: clamp01(syll / 250),
      sentences: clamp01(sentCount / 6),
      conclusionFirst: /^.{0,45}(결론|말씀드리면|핵심은|가장 .{0,12}(은|는)|라고 생각합니다|입니다)/.test(text) ? 1 : 0,
      structure: clamp01(count(text, /(첫째|둘째|셋째|먼저|다음으로|마지막으로|결론|요약하면|정리하면|왜냐하면|예를 들어|그 결과|결과적으로|따라서|그래서|다만|이후)/g) / 4),
      numbers: clamp01(count(text, /\d+(?:[.,]\d+)?|(?:한|두|세|네|다섯)\s?(?:번|명|달|가지|개월)|[일이삼사오육칠팔구십백천만]+\s?(?:년|개월|명|퍼센트|배|회|위)/g) / 3),
      experience: clamp01(count(text, /(경험|당시|때|프로젝트|활동|맡아|맡았|했습니다|했고|였습니다|시절)/g) / 5),
      result: clamp01(count(text, /(결과|성과|높였|줄였|올랐|늘었|개선|달성|받았|배웠|얻었|완성|해결|합의)/g) / 3),
      cliche: clamp01(count(text, /(열정|최선|성실|노력하|열심히|꿈이|꼭 오고|책임감|인재|잘 부탁|성장하고 싶|사람입니다|항상|무엇보다|모든|소통|존중|열린 마음|확신|꼭 필요|원만)/g) / 3),
      relevance: clamp01(relevance),
      jobWords: clamp01(jobWords / 3),
      formal: clamp01(count(text, /(습니다|니다|입니다|겠습니다)/g) / sentCount),
      sentenceFit: fit(avgSent, 20, 55, 30),
      hedges: clamp01(count(text, /(것 같|잘 모르|아마|딱히|글쎄|그냥)/g) / 2),
      listing: clamp01((count(text, /,/g) + count(text, /(그리고|또한|도 중요)/g)) / 5),
      intentMatch: intentMatchOf(question, text),
      buzzDensity: clamp01(buzz / Math.max(1, wordList.length) / 0.4),
      particles: clamp01(wordList.filter((w) => /(은|는|이|가|을|를|에|의|로|와|과|도|에서|에게|으로|부터|까지|처럼|보다|하고|해서|하며|하면서|는데|지만)$/.test(w)).length / Math.max(1, wordList.length) / 0.45),
      variety: wordList.length ? clamp01((new Set(wordList).size / wordList.length - 0.5) / 0.4) : 0,
      pastConcrete: clamp01(count(text, /(했|었|았|였|왔|줬|됐|웠)(습니다|고|는데|어요|거든요|지만|다|더니|으며)/g) / 4),
      fillerText: clamp01(wordList.filter((w) => /^(음|어|아|그러니까|뭐|아무튼|사실|약간|그냥|막|좀|이제|뭔가)$/.test(w)).length / Math.max(1, wordList.length) / 0.08),
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
      const g = GAIN[name] || 1;
      pn[N_TEXT + i * 2] = g * f[name];
      pn[N_TEXT + i * 2 + 1] = g * (1 - f[name]);
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

  /* ---------- 측각(lateral horn): 타고난 경보 회로 ----------
   * 초파리는 배워서 판단하는 버섯체와 별개로, 상한 냄새처럼 위험한 냄새에 바로 반응하는 측각 회로가 있다.
   * 면접에서 '위험한 냄새'는 동문서답·키워드 몰아넣기·빈말·횡설수설. 경보가 울리면 점수를 깎는다.
   * 깎는 양(항목별, 경보 1.0일 때): [질문 적합성, 논리, 구체성, 직무 적합성] */
  const ALARMS = [
    { id: 'offTopic', label: '동문서답 의심', penalty: [6, 2, 2, 4],
      // 너무 짧은 답은 '짧아서' 이미 낮게 나오므로 동문서답으로 또 깎지 않는다
      level: (f) => clamp01((0.34 - f.intentMatch) / 0.34) * clamp01((f.length - 0.12) / 0.15) },
    { id: 'stuffing', label: '키워드만 나열', penalty: [6, 7, 6, 5],
      level: (f) => clamp01((f.buzzDensity - 0.6) / 0.3) },
    { id: 'empty', label: '알맹이 없는 다짐', penalty: [3, 2, 4, 3],
      level: (f) => clamp01((f.cliche - 0.5) / 0.4) * (1 - f.numbers) * (f.pastConcrete < 0.5 ? 1 : 0.5) },
    { id: 'rambling', label: '횡설수설', penalty: [3, 4, 2, 2],
      level: (f) => clamp01((f.fillerText - 0.5) / 0.4) },
  ];

  function lateralHorn(features) {
    const fired = ALARMS.map((a) => ({ id: a.id, label: a.label, level: a.level(features), penalty: a.penalty })).filter((a) => a.level > 0.05);
    const cut = [0, 0, 0, 0, 0];
    fired.forEach((a) => a.penalty.forEach((p, d) => (cut[d] += p * a.level)));
    return { fired, cut };
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

  /** 좋은 답을 엉뚱한 질문에 붙여 '동문서답'을 가르친다(내용은 좋아도 질문에 안 맞으면 감점). */
  function offTopicPairs(entries) {
    const good = entries.filter((e) => e.s[0] >= 7);
    const out = [];
    good.forEach((e, i) => {
      const other = good.slice(i + 1).concat(good.slice(0, i)).find((o) => {
        const ia = INTENTS.findIndex((it) => it.q.test(e.q));
        const ib = INTENTS.findIndex((it) => it.q.test(o.q));
        return ia !== ib && ia >= 0 && ib >= 0;
      });
      if (!other) return;
      out.push({
        field: other.field,
        type: e.type,
        q: other.q,
        a: e.a,
        s: [2, Math.max(0, e.s[1] - 2), Math.max(0, e.s[2] - 2), other.field === e.field ? Math.round(e.s[3] * 0.5) : 2],
        offTopic: true,
      });
    });
    return out;
  }

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
    const samples = seedSamples(entries.concat(offTopicPairs(entries))).map((s) => {
      const { pn, features } = projectionInput(s.args);
      const { cut } = lateralHorn(features);
      // 버섯체는 '경보로 깎일 몫을 뺀 원래 실력'을 배운다. 깎는 건 측각이 한다
      return { ...s, code: kenyon(pn).active, targets: s.targets.map((t, d) => Math.min(10, t + cut[d])) };
    });
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
  const PERSONA_OFFSET = { kind: 0.5, standard: 0, strict: -1 };

  function evaluate({ question, transcript, analysis, field, persona = 'standard' }) {
    if (!brain) init();
    const typed = !!(analysis && analysis.textMode);
    const { pn, features } = projectionInput({ question, transcript, analysis, field });
    const { active, act } = kenyon(pn);
    const mb = brain.readout(active); // 버섯체가 배운 판단
    const horn = lateralHorn(features); // 측각의 타고난 경보
    const offset = PERSONA_OFFSET[persona] || 0; // 면접관 성격(깐깐하면 짜게)
    const raw = mb.map((v, i) => Math.max(0, Math.min(10, v - horn.cut[i] + offset)));
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
      mb,
      alarms: horn.fired,
      hornCut: horn.cut,
      personaOffset: offset,
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
    // 선생님 점수에서 측각 경보·성격 보정 몫을 되돌려, 버섯체가 배울 '원래 실력' 점수로 바꾼다
    const cut = result.hornCut || [0, 0, 0, 0, 0];
    const off = result.personaOffset || 0;
    brain.learn(result.active, DIMS.map((d, i) => (teacherScores[d] == null ? null : Math.max(0, Math.min(10, teacherScores[d] + cut[i] - off)))), lr);
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
    ALARMS, lateralHorn, Brain, featuresOf, projectionInput, setGain: (g) => (GAIN = g), kenyon, wiringOf, wordCode, jaccard, trainInnate, seedSamples,
    init, save, reset, evaluate, learn, remember, stats,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlyBrain = api;
})(typeof window !== 'undefined' ? window : globalThis);
