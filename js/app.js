/* 화면 흐름: 설정 → 질문/답변 반복 → 결과 리포트 */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const STORE = {
    keys: 'malang.keys',
    settings: 'malang.settings',
    history: 'malang.history',
  };
  const SCORE_LABELS = {
    content: '질문 적합성',
    logic: '논리·구조',
    specificity: '구체성',
    job_fit: '직무 적합성',
    delivery: '전달력',
  };

  const state = {
    settings: null,
    bank: [],
    asked: [],
    results: [],
    current: null, // { question, followUp }
    phase: 'idle', // ready | recording | review | evaluating | feedback | done
    raw: null,
    timer: null,
    startedAt: 0,
    recognizer: null,
    meter: null,
    report: null,
  };

  /* ---------- 유틸 ---------- */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      return null;
    }
    return null;
  }

  let toastTimer;
  function toast(msg, ms = 3500) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  function show(screen) {
    for (const id of ['setup', 'interview', 'report']) $(`#screen-${id}`).hidden = id !== screen;
    window.scrollTo(0, 0);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function mascot(state, opts) {
    return Mascot.mount(h('div'), { state, ...opts });
  }

  /* ---------- 설정 화면 ---------- */
  function initSetup() {
    Mascot.mount($('#brand-mascot'), { state: 'idle' });
    Mascot.mount($('#hello-mascot'), { state: 'idle' });

    const tiles = $('#field-tiles');
    Object.entries(Questions.FIELDS).forEach(([value, f], i) => {
      tiles.append(h('label', { class: 'pick' },
        h('input', { type: 'radio', name: 'field', value, checked: i === 0 }),
        h('span', {}, h('i', {}, f.icon), f.label)));
    });

    const form = $('#setup-form');
    const saved = store(STORE.settings);
    if (saved) {
      for (const [k, v] of Object.entries(saved)) {
        const el = form.elements[k];
        if (!el || k === 'model') continue;
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v;
      }
    }
    const keys = store(STORE.keys) || {};
    $('#remember-key').checked = Object.keys(keys).length > 0;
    syncProvider(saved && saved.model);

    form.elements.provider.forEach((r) => r.addEventListener('change', () => syncProvider()));
    $('#api-key').addEventListener('input', () => setApiStatus($('#api-key').value.trim() ? '확인 전' : '미연결', ''));
    $('#check-key').addEventListener('click', checkKey);
    form.elements.persona.forEach((r) => r.addEventListener('change', () => {
      $('#hello-mascot').classList.toggle('with-glasses', r.value === 'strict' && r.checked);
    }));
    $('#hello-mascot').classList.toggle('with-glasses', form.elements.persona.value === 'strict');

    if (!Speech.Recognizer.supported) {
      const w = $('#support-warning');
      w.hidden = false;
      w.textContent = '이 브라우저는 음성 인식을 지원하지 않아요. 크롬(Chrome)이나 엣지(Edge)로 열면 말로 답변할 수 있어요. 지금은 타이핑으로만 진행돼요.';
      form.elements.inputMode.value = 'text';
      form.querySelector('input[name="inputMode"][value="voice"]').disabled = true;
      $('#mic-test').disabled = true;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      startInterview(readSettings());
    });
    $('#mic-test').addEventListener('click', toggleMicTest);
    $('#clear-history').addEventListener('click', () => {
      if (!confirm('연습 기록을 모두 지울까요?')) return;
      store(STORE.history, null);
      renderHistory();
    });
    renderHistory();
  }

  function provider() {
    return $('#setup-form').elements.provider.value;
  }

  function syncProvider(preferredModel) {
    const p = AI.PROVIDERS[provider()];
    const keys = store(STORE.keys) || {};
    $('#api-key').value = keys[provider()] || '';
    $('#api-key').placeholder = p.keyHint;
    $('#key-link').href = p.keyUrl;
    $('#key-link').textContent = provider() === 'gemini' ? '무료 키 받기 →' : '키 받기 →';
    $('#model-row').hidden = provider() !== 'gemini';
    // 예전 기본값(gemini-3.8-flash)은 무료 등급에서 자주 혼잡해 느렸다 → 빠른 새 기본값으로 바꿔 준다
    const pick = !preferredModel || preferredModel === 'gemini-3.8-flash' ? p.defaultModel : preferredModel;
    fillModels(p.fallbackModels, pick);
    setApiStatus($('#api-key').value ? '확인 전' : '미연결', '');
  }

  function fillModels(models, selected) {
    const sel = $('#model-select');
    const list = [...new Set([selected, ...models].filter(Boolean))];
    const fast = AI.PROVIDERS.gemini.defaultModel;
    sel.replaceChildren(...list.map((m) => h('option', { value: m, selected: m === selected }, m === fast ? `${m} · 빠름(추천)` : m)));
  }

  function setApiStatus(text, kind) {
    const s = $('#api-status');
    s.textContent = text;
    s.className = `api-status ${kind || ''}`;
  }

  async function checkKey() {
    const key = $('#api-key').value.trim();
    const p = AI.PROVIDERS[provider()];
    if (!key) return setApiStatus('키를 입력해 주세요', 'bad');
    if (!p.keyPattern.test(key)) return setApiStatus(`키 모양이 이상해요 (${p.keyHint} 형태)`, 'bad');
    if (provider() !== 'gemini') return setApiStatus('형식 확인됨 ✓ (실제 연결은 면접 중 확인)', 'ok');
    setApiStatus('확인 중…', '');
    $('#check-key').disabled = true;
    try {
      const models = await AI.listGeminiModels(key);
      const current = $('#model-select').value;
      const preferred = p.fallbackModels.filter((m) => models.includes(m));
      const pick = models.includes(current) ? current : preferred[0] || models[0];
      fillModels([...preferred, ...models], pick);
      setApiStatus(`연결됨 ✓ 사용 가능한 모델 ${models.length}개`, 'ok');
    } catch (e) {
      setApiStatus(e.message, 'bad');
    } finally {
      $('#check-key').disabled = false;
    }
  }

  function readSettings() {
    const f = $('#setup-form').elements;
    const settings = {
      field: f.field.value,
      fieldLabel: Questions.FIELDS[f.field.value].label,
      company: f.company.value.trim(),
      mode: f.mode.value,
      persona: f.persona.value,
      count: Number(f.count.value),
      timeLimit: Number(f.timeLimit.value),
      feedbackTiming: f.feedbackTiming.value,
      inputMode: Speech.Recognizer.supported ? f.inputMode.value : 'text',
      tts: f.tts.checked && Speech.ttsSupported,
      followUps: f.followUps.checked,
      autoStart: f.autoStart.checked,
      resume: f.resume.value.trim(),
      provider: f.provider.value,
      model: f.model.value,
    };
    const apiKey = f.apiKey.value.trim();
    const keys = store(STORE.keys) || {};
    if (f.rememberKey.checked && apiKey) keys[settings.provider] = apiKey;
    else delete keys[settings.provider];
    store(STORE.keys, Object.keys(keys).length ? keys : null);
    store(STORE.settings, { ...settings, fieldLabel: undefined });
    return { ...settings, ai: apiKey ? { provider: settings.provider, apiKey, model: settings.model } : null };
  }

  let testRec = null;
  let testMeter = null;
  async function toggleMicTest() {
    const btn = $('#mic-test');
    const box = $('#mic-test-box');
    if (testRec) {
      testRec.abort();
      testMeter.stop();
      testRec = testMeter = null;
      btn.textContent = '🎤 마이크 테스트';
      box.hidden = true;
      Mascot.setState($('#hello-mascot'), 'idle');
      return;
    }
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    btn.textContent = '테스트 끝내기';
    Mascot.setState($('#hello-mascot'), 'listening');
    testMeter = new Speech.MicMeter();
    try {
      await testMeter.start((lv) => {
        $('#test-meter').style.width = `${lv * 100}%`;
        Mascot.setLevel($('#hello-mascot'), lv);
      });
    } catch (e) {
      toast('마이크를 켤 수 없어요. 브라우저의 마이크 권한을 확인해 주세요.');
    }
    testRec = new Speech.Recognizer({
      onUpdate: (text) => ($('#mic-test-text').textContent = text),
      onError: (msg) => toast(msg),
    });
    testRec.start();
  }

  /** 이번 주(월~일) 날짜 목록과 그날 연습했는지 */
  function weekStamps(list) {
    const days = new Set(list.map((r) => new Date(r.date).toDateString()));
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return ['월', '화', '수', '목', '금', '토', '일'].map((name, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { name, done: days.has(d.toDateString()), today: d.toDateString() === today.toDateString() };
    });
  }

  function renderHistory() {
    const list = store(STORE.history) || [];
    const week = weekStamps(list);
    $('#stamps').replaceChildren(...week.map((d) =>
      h('li', { class: `slot${d.done ? ' done' : ''}${d.today ? ' today' : ''}` },
        h('span', { class: 'ink' }, d.done ? h('span', {}, '참', h('br'), '잘했어요') : ''),
        h('small', {}, d.name))));
    $('#week-count').textContent = `${week.filter((d) => d.done).length} / 7`;
    $('#best').textContent = `최고 기록 ${list.length ? `${Math.max(...list.map((r) => r.overall))}점` : '-'}`;
    $('#history-card').hidden = !list.length;
    $('#history-list').replaceChildren(
      ...list.slice(0, 10).map((r) =>
        h('li', {},
          h('span', {},
            h('b', {}, `${AI.MODE_LABELS[r.mode] || r.mode}`), ` · ${r.field} · ${r.count}문항`,
            h('br'),
            h('small', { class: 'hint' }, new Date(r.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))),
          h('span', { class: 'score' }, `${r.overall}점`))),
    );
    if (list.length) {
      const last = list[0];
      $('#hello-text').replaceChildren(
        '다시 왔군요! 지난번엔 ', h('b', {}, `${last.overall}점`), '이었어요.', h('br'),
        '오늘은 그보다 더 잘할 수 있을 거예요!');
    }
  }

  /* ---------- 면접 진행 ---------- */
  function startInterview(settings) {
    if (testRec) toggleMicTest();
    state.settings = settings;
    state.bank = Questions.buildQuestionSet({ field: settings.field, mode: settings.mode, count: 40 });
    state.asked = [];
    state.results = [];
    state.report = null;

    Mascot.mount($('#interviewer'), { state: 'idle', glasses: settings.persona === 'strict' });
    $('#mode-label').textContent = `${AI.MODE_LABELS[settings.mode]} · ${settings.company || settings.fieldLabel}`;
    $('#engine-label').textContent = settings.ai
      ? `🪰 초파리 뇌 채점 + ${settings.ai.provider === 'gemini' ? '✨ Gemini' : '🧠 Claude'} 선생님`
      : '🪰 초파리 뇌 채점';
    $('#time-limit-label').textContent = `/ ${fmtTime(settings.timeLimit)}`;
    $('#key-hint').hidden = settings.inputMode !== 'voice';

    if (settings.inputMode === 'voice') {
      state.recognizer = new Speech.Recognizer({ onUpdate: renderLive, onError: (m) => toast(m, 6000) });
      state.meter = new Speech.MicMeter();
      state.meter.start((lv) => {
        if (state.phase !== 'recording') return;
        Mascot.setLevel($('#interviewer'), lv);
        $('#btn-stop').style.setProperty('--level', lv.toFixed(3));
      }).catch(() => toast('마이크를 켤 수 없어요. 브라우저의 마이크 권한을 확인해 주세요.', 6000));
    }
    show('interview');
    askQuestion({ question: Questions.OPENER, followUp: false });
  }

  function updateProgress() {
    const done = state.results.length;
    $('#skewer').replaceChildren(...Array.from({ length: state.settings.count }, (_, i) => {
      const r = state.results[i];
      const cls = r ? tierOf(r.evaluation.overall) : i === done ? 'now' : '';
      return h('li', { class: `bead ${cls}`, title: r ? `Q${i + 1}: ${r.evaluation.overall}점` : `Q${i + 1}` });
    }));
    $('#skewer').setAttribute('aria-label', `${state.settings.count}문항 중 ${done}문항 완료`);
    $('#q-index').textContent = `Q${Math.min(done + 1, state.settings.count)}`;
    $('#progress-label').textContent = `${Math.min(state.results.length + 1, state.settings.count)}/${state.settings.count}`;
  }

  async function askQuestion({ question, followUp, reaction }) {
    state.current = { question, followUp };
    state.asked.push(question);
    state.raw = null;
    updateProgress();
    $('#question-text').textContent = question;
    $('#followup-tag').hidden = !followUp;
    $('#reaction').hidden = !reaction;
    $('#reaction').textContent = reaction || '';
    $('#sheet').hidden = true;
    $('#answer-foot').hidden = true;
    $('#live-transcript').replaceChildren();
    $('#live-transcript').hidden = false;
    $('#answer-edit').hidden = true;
    $('#answer-edit').value = '';
    $('#edit-hint').hidden = true;
    resetTimer();
    setMic([]);

    const face = $('#interviewer');
    if (state.settings.tts) {
      Mascot.setState(face, 'talking');
      await Speech.speak(reaction ? `${reaction} ${question}` : question);
    }
    if (state.current.question !== question) return; // 읽는 도중 면접 종료 등
    Mascot.setState(face, 'idle');

    if (state.settings.inputMode === 'text') {
      state.phase = 'recording';
      $('#live-transcript').hidden = true;
      $('#answer-edit').hidden = false;
      $('#answer-edit').placeholder = '답변을 입력하세요.';
      $('#answer-edit').focus();
      startTimer();
      showFoot({ retry: false });
    } else {
      state.phase = 'ready';
      setMic(['start']);
      if (state.settings.autoStart) startAnswer();
    }
  }

  function setMic(visible) {
    $('#btn-start').hidden = !visible.includes('start');
    $('#btn-stop').hidden = !visible.includes('stop');
  }

  function showFoot({ retry }) {
    $('#answer-foot').hidden = false;
    $('#btn-retry').hidden = !retry;
  }

  function renderLive(text) {
    const box = $('#live-transcript');
    const fin = state.recognizer.finalText;
    const interim = text.slice(fin.length).trim();
    box.replaceChildren(fin, interim ? h('span', { class: 'interim' }, ` ${interim}`) : '');
  }

  function resetTimer() {
    clearInterval(state.timer);
    $('#timer').textContent = '0:00';
    $('#timebar-fill').style.width = '0';
    $('#timebar-fill').classList.remove('over');
  }

  function startTimer() {
    state.startedAt = performance.now();
    const limit = state.settings.timeLimit;
    state.timer = setInterval(() => {
      const sec = (performance.now() - state.startedAt) / 1000;
      $('#timer').textContent = fmtTime(sec);
      $('#timebar-fill').style.width = `${Math.min(100, (sec / limit) * 100)}%`;
      $('#timebar-fill').classList.toggle('over', sec > limit * 0.85);
      if (sec >= limit && state.phase === 'recording') {
        if (state.settings.inputMode === 'voice') {
          toast('⏰ 답변 시간이 끝났어요!');
          stopAnswer();
        } else {
          clearInterval(state.timer);
          toast('⏰ 제한 시간이 지났어요. 마무리해서 제출하세요.');
        }
      }
    }, 200);
  }

  function startAnswer() {
    if (state.phase !== 'ready') return;
    Speech.stopSpeaking();
    state.phase = 'recording';
    $('#live-transcript').replaceChildren();
    Mascot.setState($('#interviewer'), 'listening');
    $('#rec').hidden = false;
    state.recognizer.start();
    startTimer();
    setMic(['stop']);
  }

  async function stopAnswer() {
    if (state.phase !== 'recording') return;
    state.phase = 'review';
    clearInterval(state.timer);
    setMic([]);
    $('#rec').hidden = true;
    Mascot.setLevel($('#interviewer'), 0);
    Mascot.setState($('#interviewer'), 'idle');
    state.raw = await state.recognizer.stop();
    const edit = $('#answer-edit');
    edit.value = state.raw.transcript;
    edit.placeholder = '인식된 말이 없어요. 다시 답변하거나 직접 입력하세요.';
    edit.hidden = false;
    $('#live-transcript').hidden = true;
    $('#edit-hint').hidden = false;
    showFoot({ retry: true });
  }

  function retryAnswer() {
    $('#answer-edit').hidden = true;
    $('#edit-hint').hidden = true;
    $('#answer-foot').hidden = true;
    $('#live-transcript').hidden = false;
    $('#live-transcript').replaceChildren();
    resetTimer();
    state.phase = 'ready';
    setMic(['start']);
  }

  async function submitAnswer() {
    if (state.phase !== 'review' && state.phase !== 'recording') return;
    const textMode = state.settings.inputMode === 'text';
    const transcript = $('#answer-edit').value.trim();
    clearInterval(state.timer);
    const raw = textMode
      ? { transcript, durationMs: performance.now() - state.startedAt, firstSpeechMs: null, activity: [] }
      : state.raw;
    const analysis = Metrics.analyzeDelivery(raw);
    analysis.textMode = textMode;
    $('#answer-foot').hidden = true;

    const { question, followUp } = state.current;
    const remaining = state.settings.count - (state.results.length + 1);

    // 1) 초파리 뇌는 이 컴퓨터 안에서 바로 채점한다(인터넷 불필요, 1초 이내)
    const fly = FlyBrain.evaluate({ question, transcript, analysis, field: state.settings.field, persona: state.settings.persona });
    const evaluation = Metrics.ruleBasedEvaluation({ question, analysis, timeLimitSec: state.settings.timeLimit });
    // 측각 경보가 울렸으면 왜 깎였는지 맨 앞에 알려 준다
    const ALARM_TIPS = {
      offTopic: '질문이 묻는 것에 대한 답이 잘 안 보여요. 첫 문장에서 질문에 바로 답하고 시작하세요.',
      stuffing: '키워드와 숫자만 늘어놓았어요. "상황 → 내가 한 일 → 결과"를 문장으로 이어서 말하세요.',
      empty: '다짐과 좋은 말뿐이고 실제로 한 일이 없어요. 경험 하나를 숫자와 함께 말해 보세요.',
      rambling: '군말이 많고 핵심이 안 보여요. 결론 한 문장부터 말한 뒤 이유를 붙이세요.',
    };
    const tips = fly.alarms.filter((a) => a.level >= 0.5).map((a) => ALARM_TIPS[a.id]).filter(Boolean);
    evaluation.feedback_improve = tips.concat(evaluation.feedback_improve).slice(0, 4);
    if (tips.length) evaluation.feedback_good = evaluation.feedback_good.filter((t) => !/구조가 드러|구체적입니다/.test(t));
    evaluation.scores = { ...fly.scores };
    evaluation.overall = Metrics.overallFromScores(evaluation.scores);
    evaluation.fly = fly;
    evaluation.teacherOverall = null;
    FlyBrain.remember({ question, result: fly });
    FlyBrain.save();

    const record = { question, followUp, transcript, analysis, evaluation, remaining };
    state.results.push(record);
    updateProgress();

    // 2) AI 선생님은 뒤에서 따로 부른다. 늦거나 실패해도 결과 화면은 기다리지 않는다
    record.aiPromise = state.settings.ai ? askTeacher(record) : null;

    const face = $('#interviewer');
    if (state.settings.feedbackTiming === 'each') {
      state.phase = 'feedback';
      Mascot.setState(face, moodFor(evaluation.overall));
      renderSheet(record);
      return;
    }
    // 실전 모드: 다음 질문만 정해지면 바로 넘어간다(AI가 늦으면 질문 은행에서)
    state.phase = 'evaluating';
    Mascot.setState(face, 'thinking');
    $('#reaction').hidden = false;
    $('#reaction').textContent = '음… 다음 질문을 고르는 중이에요';
    await waitTeacher(record);
    if (state.phase !== 'evaluating') return; // 그 사이 면접 종료
    goNext(record);
  }

  const TEACHER_BUDGET_MS = 15000; // AI 선생님을 기다리는 최대 시간

  /** AI 선생님 채점·피드백·다음 질문을 받아 기록에 더하고, 초파리 뇌가 배운다. */
  async function askTeacher(record) {
    const ev = record.evaluation;
    try {
      const ai = await AI.evaluateAnswer({
        ai: state.settings.ai,
        settings: state.settings,
        history: state.results.filter((r) => r !== record).map((r) => ({ question: r.question, transcript: r.transcript })),
        question: record.question,
        transcript: record.transcript,
        analysis: record.analysis,
        remaining: record.remaining,
        budgetMs: TEACHER_BUDGET_MS,
      });
      if (record.analysis.textMode) ai.scores.delivery = null;
      ev.teacherScores = ai.scores;
      ev.teacherOverall = Metrics.overallFromScores(ai.scores);
      ev.feedback_good = ai.feedback_good;
      ev.feedback_improve = ai.feedback_improve;
      ev.better_answer = ai.better_answer;
      ev.interviewer_reaction = ai.interviewer_reaction;
      ev.next_question = ai.next_question;
      ev.next_is_follow_up = ai.next_is_follow_up;
      ev.source = 'ai';
      FlyBrain.learn(ev.fly, ai.scores);
      FlyBrain.save();
    } catch (e) {
      record.aiError = e.message;
    }
    record.aiDone = true;
    refreshSheet(record);
  }

  /** 다음으로 넘어가기 전에 AI 선생님 답을 기다린다(이미 왔으면 바로). */
  function waitTeacher(record) {
    return record.aiPromise || Promise.resolve();
  }

  function goNext(record) {
    const ev = record.evaluation;
    const next = record.remaining > 0 ? nextQuestion(ev, record.remaining) : null;
    const reaction = ev.source === 'ai' ? ev.interviewer_reaction : '';
    if (next) askQuestion({ ...next, reaction });
    else finish();
  }

  function tierOf(score) {
    return score >= 75 ? 'good' : score >= 55 ? 'okay' : 'low';
  }

  function moodFor(score) {
    return { good: 'happy', okay: 'cheer', low: 'sad' }[tierOf(score)];
  }

  function nextQuestion(evaluation, remaining) {
    if (evaluation.next_question) {
      return { question: evaluation.next_question, followUp: !!evaluation.next_is_follow_up };
    }
    if (remaining === 1) return { question: Questions.CLOSER, followUp: false };
    const pick = state.bank.slice(1, -1).find((q) => !state.asked.includes(q));
    return { question: pick || Questions.CLOSER, followUp: false };
  }

  function renderSheet(record) {
    const ev = record.evaluation;
    const tier = tierOf(ev.overall);
    const title = { good: '아주 좋았어요!', okay: '좋아요, 조금만 더!', low: '괜찮아요, 다시 해봐요!' }[tier];
    const sheet = $('#sheet');
    sheet.className = `memo-wrap ${tier}`;
    const last = record.remaining <= 0;
    const nextBtn = h('button', {
      type: 'button',
      class: 'btn btn-main btn-wide',
      onclick: async (e) => {
        const btn = e.currentTarget;
        if (!record.aiDone && record.aiPromise) {
          btn.disabled = true;
          btn.textContent = '✨ AI 선생님 질문 기다리는 중…';
          await waitTeacher(record);
        }
        if (state.phase === 'feedback') goNext(record);
      },
    }, last ? '성적표 보기' : '다음 질문');
    sheet._record = record;
    $('#sheet-body').replaceChildren(
      h('div', { class: 'memo-head' },
        mascot(moodFor(ev.overall), { glasses: state.settings.persona === 'strict' }),
        h('div', { class: 'memo-title' },
          h('p', { class: 'memo-kicker' }, `면접관 메모 · Q${state.results.indexOf(record) + 1} · 🪰 초파리 뇌 채점`),
          h('p', { class: 'memo-h' }, title)),
        stamp(`${ev.overall}`, '점', tier)),
      h('div', { class: 'panel' }, scoreBars(ev.scores), deliveryTiles(record.analysis)),
      flyPanel(ev),
      h('div', { class: 'panel feedback-panel' }, feedbackBody(record)),
      h('div', { class: 'actions' }, nextBtn),
    );
    sheet.hidden = false;
    sheet.scrollTop = 0;
    const cv = sheet.querySelector('canvas.fly-canvas');
    if (cv) FlyView.draw(cv, ev.fly);
    nextBtn.focus({ preventScroll: true });
  }

  /** 피드백 칸: AI 선생님을 기다리는 중이면 안내를, 오면 AI 피드백을, 실패하면 기본 피드백을 보여 준다. */
  function feedbackBody(record) {
    const ev = record.evaluation;
    if (record.aiPromise && !record.aiDone) {
      return h('div', {},
        h('p', { class: 'ai-wait' }, h('span', { class: 'dots' }), '✨ AI 선생님이 피드백을 쓰는 중… (점수는 이미 나왔어요)'),
        feedbackLists(ev));
    }
    return h('div', {},
      record.aiError ? h('p', { class: 'hint' }, `AI 선생님 연결이 안 돼서 기본 피드백을 보여 드려요. (${record.aiError})`) : '',
      feedbackLists(ev));
  }

  /** AI 선생님 답이 도착하면, 지금 보고 있는 메모의 피드백·초파리 칸만 바꾼다. */
  function refreshSheet(record) {
    const sheet = $('#sheet');
    if (sheet.hidden || sheet._record !== record) return;
    const fb = sheet.querySelector('.feedback-panel');
    if (fb) fb.replaceChildren(feedbackBody(record));
    const notes = sheet.querySelector('.fly-notes');
    if (notes) notes.replaceChildren(...flyNotes(record.evaluation));
  }

  function flyNotes(ev) {
    const f = ev.fly;
    const notes = [
      h('li', {}, '답변 유형: ', h('b', {}, f.typeLabel), ` (확신 ${Math.round(f.typeConfidence * 100)}%)`),
      h('li', {}, `케년세포 ${FlyBrain.N_KC.toLocaleString()}개 중 ${f.active.length}개가 반응 · 익숙함 ${Math.round(f.familiarity * 100)}%`),
    ];
    f.alarms.filter((a) => a.level >= 0.3).forEach((a) => {
      // 항목별 감점을 종합 점수(100점) 기준으로 환산
      const keys = ['content', 'logic', 'specificity', 'job_fit'];
      const wsum = ev.scores.delivery == null ? 0.8 : 1;
      const cut = Math.round((keys.reduce((x, k, d) => x + a.penalty[d] * Metrics.WEIGHTS[k], 0) * a.level * 10) / wsum);
      notes.push(h('li', { class: 'warn' }, `🚨 측각 경보: ${a.label} (세기 ${Math.round(a.level * 100)}% · 약 ${cut}점 감점)`));
    });
    if (f.personaOffset) notes.push(h('li', {}, `면접관 성격 반영: ${f.personaOffset < 0 ? '깐깐해서 항목마다 1점씩 짜게' : '다정해서 항목마다 0.5점씩 후하게'}`));
    if (f.similar) {
      const same = f.similar.sim >= 0.45;
      notes.push(h('li', { class: 'warn' }, `${same ? '거의 같은 답이에요' : '예전 답변과 많이 닮았어요'} (단어 지문 ${Math.round(f.similar.sim * 100)}% 겹침 · "${f.similar.question.slice(0, 18)}…" 때 답)`));
    }
    if (ev.teacherOverall != null) {
      notes.push(h('li', {}, `✨ AI 선생님 점수 ${ev.teacherOverall}점 → 초파리가 보고 배웠어요 (배운 횟수 ${FlyBrain.stats().lessons}회)`));
    }
    return notes;
  }

  /** 초파리 뇌가 이 답변을 어떻게 봤는지: 그림 + 인식 결과 + 점수 피드백으로 가르치기 */
  function flyPanel(ev) {
    const f = ev.fly;
    if (!f) return '';
    const teach = (delta, label) => (e) => {
      const target = {};
      for (const [k, v] of Object.entries(ev.scores)) target[k] = v == null ? null : Math.max(0, Math.min(10, v + delta));
      FlyBrain.learn(f, target, 0.2);
      FlyBrain.save();
      e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => (b.disabled = true));
      toast(`🪰 "${label}" 기억했어요! (배운 횟수 ${FlyBrain.stats().lessons}회)`);
    };
    return h('div', { class: 'panel fly' },
      h('h3', {}, '🪰 초파리 뇌가 본 이 답변'),
      h('canvas', { class: 'fly-canvas', role: 'img', 'aria-label': `초파리 뇌 활성 그림: 케년세포 ${f.active.length}개 반응` }),
      h('ul', { class: 'fly-notes' }, flyNotes(ev)),
      h('div', { class: 'fly-teach' },
        h('span', {}, '이 점수 어때요?'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: teach(-1.5, '더 낮아야 해요') }, '더 낮게'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: teach(0, '딱 맞아요') }, '딱 맞아요'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: teach(1.5, '더 높아야 해요') }, '더 높게')));
  }

  /** 도장: 동그란 테두리 안에 큰 글자 + 작은 글자 */
  function stamp(big, small, tier) {
    return h('div', { class: `stamp ${tier}`, 'aria-label': `${big}${small}` }, h('b', {}, big), h('small', {}, small));
  }

  function scoreBars(scores) {
    return h('div', { class: 'scores' },
      Object.entries(SCORE_LABELS).map(([k, name]) => {
        const v = scores[k];
        const na = v == null;
        return h('div', { class: `score-row${na ? ' na' : ''}`, title: na ? `${name}: 측정 안 함` : `${name}: ${v} / 10` },
          h('span', { class: 'name' }, name),
          h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${na ? 0 : v * 10}%` })),
          h('span', { class: 'val' }, na ? '—' : `${v}`));
      }));
  }

  function deliveryTiles(a) {
    if (a.textMode) return h('p', { class: 'hint' }, '⌨️ 타이핑 답변이라 말하기 지표는 측정하지 않았어요.');
    const fillerDetail = Object.entries(a.fillers).map(([w, n]) => `${w} ${n}`).join(', ');
    const rateColor = a.rateVerdict === '적절' ? 't-green' : a.rate ? 't-orange' : '';
    return h('div', { class: 'stat-tiles' },
      statTile('말 속도', a.rate ? `${a.rate}` : '—', a.rate ? `음절/분 · ${a.rateVerdict}` : '인식된 말 없음', rateColor || 't-blue'),
      statTile('군말', `${a.fillerCount}회`, fillerDetail || '음/어 등', a.fillerPerMin > 2 ? 't-orange' : 't-green'),
      statTile('긴 끊김', `${a.longPauses}회`, a.longestPauseSec ? `최장 ${a.longestPauseSec}초` : '2.5초 이상', a.longPauses >= 2 ? 't-orange' : 't-green'),
      statTile('첫 마디', a.firstSpeechSec == null ? '—' : `${a.firstSpeechSec}초`, `답변 ${a.durationSec}초`, 't-blue'));
  }

  function statTile(label, value, sub, cls) {
    return h('div', { class: `stat-tile ${cls || ''}` },
      h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
  }

  function feedbackLists(ev) {
    return h('div', {},
      ev.feedback_good.length ? [h('h3', {}, '잘한 점'), h('ul', { class: 'good' }, ev.feedback_good.map((t) => h('li', {}, t)))] : '',
      ev.feedback_improve.length ? [h('h3', {}, '고칠 점'), h('ul', { class: 'improve' }, ev.feedback_improve.map((t) => h('li', {}, t)))] : '',
      ev.better_answer ? [h('h3', {}, ev.source === 'ai' ? '이렇게 말해 보세요' : '답변 구성 팁'), h('p', { class: 'better' }, ev.better_answer)] : '');
  }

  function quit() {
    if (!confirm('면접을 그만할까요? 지금까지 답한 내용으로 결과를 보여 드릴게요.')) return;
    stopEverything();
    if (state.results.length) finish();
    else {
      renderHistory();
      show('setup');
    }
  }

  function stopEverything() {
    state.phase = 'done';
    state.current = { question: null };
    clearInterval(state.timer);
    $('#rec').hidden = true;
    Speech.stopSpeaking();
    if (state.recognizer) state.recognizer.abort();
    if (state.meter) state.meter.stop();
    $('#sheet').hidden = true;
    $('#answer-foot').hidden = true;
  }

  /* ---------- 결과 ---------- */
  async function finish() {
    stopEverything();
    const summary = Metrics.summarizeSession(state.results);
    state.report = { summary, ai: null, aiPending: false, date: new Date().toISOString() };
    saveHistory(summary);
    const wantAI = state.settings.ai && state.results.some((r) => r.evaluation.source === 'ai');
    state.report.aiPending = !!wantAI;
    renderReport();
    show('report');
    if (summary.overall >= 70) confetti();

    if (wantAI) {
      try {
        state.report.ai = await AI.finalReport({ ai: state.settings.ai, settings: state.settings, results: state.results, summary });
      } catch (e) {
        toast(`총평 생성 실패: ${e.message}`, 6000);
      }
      state.report.aiPending = false;
      renderReport();
    }
  }

  function saveHistory(summary) {
    const list = store(STORE.history) || [];
    list.unshift({
      date: new Date().toISOString(),
      field: state.settings.company || state.settings.fieldLabel,
      mode: state.settings.mode,
      count: state.results.length,
      overall: summary.overall,
    });
    store(STORE.history, list.slice(0, 30));
  }

  function renderReport() {
    const { summary, ai, aiPending } = state.report;
    const s = state.settings;
    const voiceAnswers = state.results.filter((r) => !r.analysis.textMode).length;
    const grade = Metrics.gradeFor(summary.overall);

    let aiBox;
    if (ai) {
      aiBox = h('div', { class: 'card' },
        h('h2', {}, '💬 말랑이의 총평'),
        h('p', {}, ai.overall_comment),
        h('h3', {}, '강점'), h('ul', { class: 'good' }, ai.strengths.map((t) => h('li', {}, t))),
        h('h3', {}, '보완점'), h('ul', { class: 'improve' }, ai.weaknesses.map((t) => h('li', {}, t))),
        ai.delivery_comment ? [h('h3', {}, '말하기 습관'), h('p', {}, ai.delivery_comment)] : '',
        h('h3', {}, '다음 연습 계획'), h('ol', {}, ai.practice_plan.map((t) => h('li', {}, t))));
    } else if (aiPending) {
      aiBox = h('div', { class: 'card ai-loading' }, mascot('thinking'), h('p', {}, '말랑이가 총평을 쓰는 중이에요…'));
    } else if (!s.ai) {
      aiBox = h('div', { class: 'card ai-loading' }, mascot('cheer'),
        h('p', { class: 'hint' }, '무료 Gemini 키를 연결하면 AI 선생님이 답변 내용을 읽고 총평·꼬리질문을 해 주고, 초파리 뇌도 그 채점을 보며 더 빨리 배워요.'));
    }

    $('#report').replaceChildren(
      h('div', { class: 'report-card' },
        h('div', { class: 'report-top' },
          h('div', {},
            h('p', { class: 'memo-kicker' }, `${new Date(state.report.date).toLocaleDateString('ko-KR')} · ${AI.MODE_LABELS[s.mode]}`),
            h('h1', {}, '면접 성적표'),
            h('p', { class: 'grade-line' }, `${s.company || s.fieldLabel} · ${state.results.length}문항`)),
          mascot(summary.overall >= 70 ? 'happy' : 'cheer', { glasses: s.persona === 'strict' })),
        h('div', { class: 'report-score' },
          h('div', {}, h('span', { class: 'total' }, `${summary.overall}`), h('span', { class: 'of' }, ' / 100')),
          stamp(grade, '', `big ${tierOf(summary.overall)}`)),
        h('div', { class: 'stat-tiles' },
          voiceAnswers ? statTile('평균 말 속도', summary.avgRate ? `${summary.avgRate}` : '—', `적정 ${Metrics.IDEAL_RATE.min}~${Metrics.IDEAL_RATE.max}음절/분`, 't-blue') : '',
          voiceAnswers ? statTile('군말', `${summary.totalFillers}회`, '음, 어 등', 't-orange') : '',
          voiceAnswers ? statTile('습관어', `${summary.totalHabits}회`, '약간, 뭔가 등', 't-orange') : '',
          voiceAnswers ? statTile('긴 끊김', `${summary.totalLongPauses}회`, '2.5초 이상', 't-red') : '')),
      h('div', { class: 'card' }, h('h2', {}, '📊 항목별 평균'), scoreBars(summary.avg)),
      flyReport(),
      aiBox || '',
      h('div', { class: 'card' },
        h('h2', {}, '📝 질문별 다시보기'),
        state.results.map((r, i) =>
          h('details', { class: 'qa', open: i === 0 },
            h('summary', {},
              h('span', {}, `Q${i + 1}. `, r.followUp ? h('span', { class: 'followup-mini' }, '[꼬리] ') : '', r.question),
              h('span', { class: 'pts' }, `${r.evaluation.overall}점`)),
            h('h3', {}, '내 답변'),
            h('p', { class: 'said' }, r.transcript || '(무응답)'),
            h('div', { style: 'margin-top:12px' }, scoreBars(r.evaluation.scores)),
            deliveryTiles(r.analysis),
            feedbackLists(r.evaluation)))),
    );
  }

  /** 성적표의 초파리 뇌 요약: 답변 유형, 반복 답변, AI 선생님과 얼마나 비슷하게 채점했는지 */
  function flyReport() {
    const rs = state.results.filter((r) => r.evaluation.fly);
    if (!rs.length) return '';
    const types = {};
    rs.forEach((r) => (types[r.evaluation.fly.typeLabel] = (types[r.evaluation.fly.typeLabel] || 0) + 1));
    const repeats = rs.filter((r) => r.evaluation.fly.similar).length;
    const taught = rs.filter((r) => r.evaluation.teacherOverall != null);
    const gap = taught.length ? Math.round(taught.reduce((sum, r) => sum + Math.abs(r.evaluation.overall - r.evaluation.teacherOverall), 0) / taught.length) : null;
    const st = FlyBrain.stats();
    return h('div', { class: 'card' },
      h('h2', {}, '🪰 초파리 뇌 리포트'),
      h('div', { class: 'stat-tiles' },
        statTile('가장 많은 유형', Object.entries(types).sort((a, b) => b[1] - a[1])[0][0], Object.entries(types).map(([t, n]) => `${t} ${n}`).join(' · '), 't-blue'),
        statTile('반복 답변', `${repeats}회`, '예전 답과 단어 지문이 겹친 답', repeats ? 't-orange' : 't-green'),
        gap != null ? statTile('AI 선생님과 차이', `±${gap}점`, '같은 답을 두고 매긴 종합 점수 차', gap <= 10 ? 't-green' : 't-orange') : '',
        statTile('지금까지 배운 횟수', `${st.lessons}회`, `케년세포 ${st.kc.toLocaleString()}개 · 입력 ${st.pn}개`, 't-blue')),
      h('p', { class: 'hint' }, '점수는 초파리 버섯체(mushroom body)를 본뜬 모델이 매겼어요. 답변을 2,000개 케년세포 중 100개만 켜지는 지문으로 바꾸고, 출력뉴런이 그 지문을 보고 좋음·나쁨을 판단해요.'));
  }

  function confetti() {
    const box = $('#confetti');
    const colors = ['#ffb3c1', '#ffd59e', '#bfe3b4', '#c9ccff', '#fff3e6', '#f7a6b9'];
    box.replaceChildren(...Array.from({ length: 60 }, (_, i) => h('i', {
      style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-duration:${1.8 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.5}s;transform:rotate(${Math.random() * 360}deg)`,
    })));
    setTimeout(() => box.replaceChildren(), 4500);
  }

  function reportText() {
    const { summary, ai } = state.report;
    const s = state.settings;
    const L = [];
    L.push('말랑 면접 결과', `${new Date(state.report.date).toLocaleString('ko-KR')}`);
    L.push(`${AI.MODE_LABELS[s.mode]} / ${s.company || s.fieldLabel}`, '');
    L.push(`종합 ${summary.overall}점 (${Metrics.gradeFor(summary.overall)})`);
    for (const [k, name] of Object.entries(SCORE_LABELS)) L.push(`- ${name}: ${summary.avg[k] == null ? '측정 안 함' : `${summary.avg[k]}/10`}`);
    L.push(`평균 말 속도 ${summary.avgRate}음절/분, 군말 ${summary.totalFillers}회, 습관어 ${summary.totalHabits}회, 긴 끊김 ${summary.totalLongPauses}회`, '');
    if (ai) {
      L.push('[면접관 총평]', ai.overall_comment, '', '강점:', ...ai.strengths.map((t) => `+ ${t}`), '', '보완점:', ...ai.weaknesses.map((t) => `! ${t}`));
      L.push('', '말하기 습관:', ai.delivery_comment, '', '연습 계획:', ...ai.practice_plan.map((t, i) => `${i + 1}. ${t}`), '');
    }
    state.results.forEach((r, i) => {
      L.push('----------------------------------------', `Q${i + 1}. ${r.question}`, `A. ${r.transcript || '(무응답)'}`,
        `점수 ${r.evaluation.overall}점 (초파리 뇌)${r.evaluation.teacherOverall != null ? ` · AI 선생님 ${r.evaluation.teacherOverall}점` : ''}${r.evaluation.fly ? ` · 유형 ${r.evaluation.fly.typeLabel}` : ''}`);
      r.evaluation.feedback_good.forEach((t) => L.push(`+ ${t}`));
      r.evaluation.feedback_improve.forEach((t) => L.push(`! ${t}`));
      if (r.evaluation.better_answer) L.push(`→ ${r.evaluation.better_answer}`);
      L.push('');
    });
    return L.join('\n');
  }

  function download() {
    const blob = new Blob([reportText()], { type: 'text/plain;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `면접결과_${new Date().toISOString().slice(0, 10)}.txt` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- 이벤트 연결 ---------- */
  function bind() {
    $('#btn-start').addEventListener('click', startAnswer);
    $('#btn-stop').addEventListener('click', stopAnswer);
    $('#btn-retry').addEventListener('click', retryAnswer);
    $('#btn-submit').addEventListener('click', submitAnswer);
    $('#replay').addEventListener('click', async () => {
      if (state.phase === 'recording' || !state.current.question) return;
      Mascot.setState($('#interviewer'), 'talking');
      await Speech.speak(state.current.question);
      if (state.phase === 'ready') Mascot.setState($('#interviewer'), 'idle');
    });
    $('#quit').addEventListener('click', quit);
    $('#again').addEventListener('click', () => {
      renderHistory();
      startInterview(state.settings);
    });
    $('#home').addEventListener('click', () => {
      renderHistory();
      renderFlyStats();
      show('setup');
    });
    $('#download').addEventListener('click', download);
    $('#print').addEventListener('click', () => window.print());

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || $('#screen-interview').hidden) return;
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY)$/.test(e.target.tagName)) return;
      if (state.phase === 'ready') {
        e.preventDefault();
        startAnswer();
      } else if (state.phase === 'recording' && state.settings.inputMode === 'voice') {
        e.preventDefault();
        stopAnswer();
      }
    });
  }

  /** exe 실행기로 열렸으면, 창이 열려 있다는 신호를 보내 실행기가 창 닫힘을 알 수 있게 한다. */
  function pingLauncher() {
    if (!new URLSearchParams(location.search).has('launcher')) return;
    const ping = () => fetch('/__malang/ping', { cache: 'no-store' }).catch(() => {});
    ping();
    setInterval(ping, 10000);
  }

  function renderFlyStats() {
    const st = FlyBrain.stats();
    $('#fly-stats').textContent = st.lessons
      ? `지금까지 ${st.lessons}번 배웠고, 답변 ${st.memories}개를 기억하고 있어요.`
      : '예시 답변 36개로 기본기를 익혔어요. 연습할수록 더 배워요.';
  }

  FlyBrain.init();
  initSetup();
  bind();
  renderFlyStats();
  $('#fly-reset').addEventListener('click', () => {
    if (!confirm('초파리 뇌가 배운 것과 기억한 답변을 모두 지우고 처음 상태로 돌릴까요?')) return;
    FlyBrain.reset();
    renderFlyStats();
    toast('🪰 초파리 뇌를 처음 상태로 돌렸어요.');
  });
  pingLauncher();
})();
