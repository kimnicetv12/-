/* 화면 흐름: 설정 → 질문/답변 반복 → 결과 리포트 */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const STORE = {
    key: 'aiInterview.apiKey',
    settings: 'aiInterview.settings',
    history: 'aiInterview.history',
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

  /* ---------- 설정 화면 ---------- */
  function initSetup() {
    const select = $('#field-select');
    for (const [value, f] of Object.entries(Questions.FIELDS)) select.append(h('option', { value }, f.label));

    const form = $('#setup-form');
    const saved = store(STORE.settings);
    if (saved) {
      for (const [k, v] of Object.entries(saved)) {
        const el = form.elements[k];
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v;
      }
    }
    const key = store(STORE.key);
    if (key) {
      $('#api-key').value = key;
      $('#remember-key').checked = true;
    }
    updateApiStatus();
    $('#api-key').addEventListener('input', updateApiStatus);

    if (!Speech.Recognizer.supported) {
      const w = $('#support-warning');
      w.hidden = false;
      w.textContent = '이 브라우저는 음성 인식을 지원하지 않습니다. 크롬(Chrome)이나 엣지(Edge)로 열면 말로 답변할 수 있어요. 지금은 타이핑 모드로만 진행됩니다.';
      $('#input-mode').value = 'text';
      $('#input-mode').querySelector('option[value="voice"]').disabled = true;
      $('#mic-test').disabled = true;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      startInterview(readSettings());
    });
    $('#mic-test').addEventListener('click', toggleMicTest);
    $('#clear-history').addEventListener('click', () => {
      store(STORE.history, null);
      renderHistory();
    });
    renderHistory();
  }

  function updateApiStatus() {
    const has = $('#api-key').value.trim().startsWith('sk-');
    const s = $('#api-status');
    s.textContent = has ? '연결됨: AI 면접관 + 꼬리질문 + 내용 채점' : '미연결: 기본 질문 + 간이 채점';
    s.className = has ? 'api-ok' : '';
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
    };
    const apiKey = f.apiKey.value.trim();
    if (f.rememberKey.checked && apiKey) store(STORE.key, apiKey);
    else store(STORE.key, null);
    store(STORE.settings, { ...settings, fieldLabel: undefined });
    return { ...settings, apiKey };
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
      btn.textContent = '마이크 테스트';
      box.hidden = true;
      return;
    }
    box.hidden = false;
    btn.textContent = '테스트 끝내기';
    testMeter = new Speech.MicMeter();
    try {
      await testMeter.start((lv) => ($('#test-meter').style.width = `${lv * 100}%`));
    } catch (e) {
      toast('마이크를 켤 수 없습니다. 브라우저의 마이크 권한을 확인해 주세요.');
    }
    testRec = new Speech.Recognizer({
      onUpdate: (text) => ($('#mic-test-text').textContent = text),
      onError: (msg) => toast(msg),
    });
    testRec.start();
  }

  function renderHistory() {
    const list = store(STORE.history) || [];
    $('#history-card').hidden = !list.length;
    const body = $('#history-body');
    body.replaceChildren(
      ...list.slice(0, 15).map((r) =>
        h('tr', {},
          h('td', {}, new Date(r.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
          h('td', {}, r.field),
          h('td', {}, Claude.MODE_LABELS[r.mode] || r.mode),
          h('td', {}, `${r.count}개`),
          h('td', {}, `${r.overall}점`))),
    );
  }

  /* ---------- 면접 진행 ---------- */
  function startInterview(settings) {
    if (testRec) toggleMicTest();
    state.settings = settings;
    state.bank = Questions.buildQuestionSet({ field: settings.field, mode: settings.mode, count: 40 });
    state.asked = [];
    state.results = [];
    state.report = null;

    $('#mode-label').textContent = `${Claude.MODE_LABELS[settings.mode]} · ${settings.company || settings.fieldLabel}`;
    $('#engine-label').textContent = settings.apiKey ? 'AI 면접관 (Claude)' : '기본 모드 (간이 채점)';
    $('#time-limit-label').textContent = `/ ${fmtTime(settings.timeLimit)}`;
    $('#live-meter-wrap').hidden = settings.inputMode !== 'voice';
    $('#key-hint').hidden = settings.inputMode !== 'voice';

    if (settings.inputMode === 'voice') {
      state.recognizer = new Speech.Recognizer({ onUpdate: renderLive, onError: (m) => toast(m, 6000) });
      state.meter = new Speech.MicMeter();
      state.meter.start((lv) => ($('#live-meter').style.width = `${lv * 100}%`)).catch(() => {
        toast('마이크를 켤 수 없습니다. 브라우저의 마이크 권한을 확인해 주세요.', 6000);
      });
    }
    show('interview');
    askQuestion({ question: Questions.OPENER, followUp: false });
  }

  async function askQuestion({ question, followUp, reaction }) {
    state.current = { question, followUp };
    state.asked.push(question);
    state.raw = null;
    $('#progress-label').textContent = `질문 ${state.results.length + 1} / ${state.settings.count}`;
    $('#question-text').textContent = question;
    $('#followup-tag').hidden = !followUp;
    $('#reaction').hidden = !reaction;
    $('#reaction').textContent = reaction || '';
    $('#feedback').hidden = true;
    $('#evaluating').hidden = true;
    $('#live-transcript').replaceChildren();
    $('#live-transcript').hidden = false;
    $('#answer-edit').hidden = true;
    $('#answer-edit').value = '';
    $('#edit-hint').hidden = true;
    resetTimer();
    setButtons([]);

    if (state.settings.tts) await Speech.speak(reaction ? `${reaction} ${question}` : question);
    if (state.current.question !== question) return; // 읽는 도중 면접 종료 등

    if (state.settings.inputMode === 'text') {
      state.phase = 'recording';
      $('#live-transcript').hidden = true;
      $('#answer-edit').hidden = false;
      $('#answer-edit').placeholder = '답변을 입력하세요.';
      $('#answer-edit').focus();
      startTimer();
      setButtons(['submit']);
    } else {
      state.phase = 'ready';
      setButtons(['start']);
      if (state.settings.autoStart) startAnswer();
    }
  }

  function setButtons(visible) {
    const map = { start: '#btn-start', stop: '#btn-stop', retry: '#btn-retry', submit: '#btn-submit' };
    for (const [k, sel] of Object.entries(map)) $(sel).hidden = !visible.includes(k);
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
          toast('답변 시간이 끝났습니다.');
          stopAnswer();
        } else {
          clearInterval(state.timer);
          toast('제한 시간이 지났습니다. 마무리해서 제출하세요.');
        }
      }
    }, 200);
  }

  function startAnswer() {
    if (state.phase !== 'ready') return;
    Speech.stopSpeaking();
    state.phase = 'recording';
    $('#live-transcript').replaceChildren();
    state.recognizer.start();
    startTimer();
    setButtons(['stop']);
  }

  async function stopAnswer() {
    if (state.phase !== 'recording') return;
    state.phase = 'review';
    clearInterval(state.timer);
    setButtons([]);
    state.raw = await state.recognizer.stop();
    const edit = $('#answer-edit');
    edit.value = state.raw.transcript;
    edit.placeholder = '인식된 말이 없습니다. 다시 답변하거나 직접 입력하세요.';
    edit.hidden = false;
    $('#live-transcript').hidden = true;
    $('#edit-hint').hidden = false;
    setButtons(['retry', 'submit']);
  }

  function retryAnswer() {
    $('#answer-edit').hidden = true;
    $('#edit-hint').hidden = true;
    $('#live-transcript').hidden = false;
    $('#live-transcript').replaceChildren();
    resetTimer();
    state.phase = 'ready';
    setButtons(['start']);
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

    state.phase = 'evaluating';
    setButtons([]);
    $('#evaluating').hidden = false;

    const { question, followUp } = state.current;
    const remaining = state.settings.count - (state.results.length + 1);
    let evaluation;
    if (state.settings.apiKey) {
      try {
        evaluation = await Claude.evaluateAnswer({
          apiKey: state.settings.apiKey,
          settings: state.settings,
          history: state.results.map((r) => ({ question: r.question, transcript: r.transcript })),
          question,
          transcript,
          analysis,
          remaining,
        });
        if (textMode) evaluation.scores.delivery = null;
        evaluation.overall = Metrics.overallFromScores(evaluation.scores);
      } catch (e) {
        toast(`AI 채점 실패: ${e.message} 이번 답변은 간이 채점으로 대신합니다.`, 6000);
      }
    }
    if (!evaluation) evaluation = Metrics.ruleBasedEvaluation({ question, analysis, timeLimitSec: state.settings.timeLimit });
    if (state.phase !== 'evaluating') return; // 채점 중 면접 종료

    state.results.push({ question, followUp, transcript, analysis, evaluation });
    $('#evaluating').hidden = true;

    const next = remaining > 0 ? nextQuestion(evaluation, remaining) : null;
    if (state.settings.feedbackTiming === 'each') {
      state.phase = 'feedback';
      renderFeedback(evaluation, analysis, next);
    } else if (next) {
      askQuestion({ ...next, reaction: evaluation.source === 'claude' ? evaluation.interviewer_reaction : '' });
    } else {
      finish();
    }
  }

  function nextQuestion(evaluation, remaining) {
    if (evaluation.next_question && evaluation.next_question.trim()) {
      return { question: evaluation.next_question.trim(), followUp: !!evaluation.next_is_follow_up };
    }
    if (remaining === 1) return { question: Questions.CLOSER, followUp: false };
    const pick = state.bank.slice(1, -1).find((q) => !state.asked.includes(q));
    return { question: pick || Questions.CLOSER, followUp: false };
  }

  function renderFeedback(ev, analysis, next) {
    const box = $('#feedback');
    box.replaceChildren(
      h('h2', {}, `이번 답변 ${ev.overall}점`, ev.source === 'rule' ? h('span', { class: 'muted' }, '  (간이 채점)') : ''),
      scoreBars(ev.scores),
      deliveryTiles(analysis),
      feedbackLists(ev),
      h('div', { class: 'actions' },
        h('button', {
          type: 'button',
          class: 'primary',
          onclick: () => (next ? askQuestion({ ...next, reaction: ev.source === 'claude' ? ev.interviewer_reaction : '' }) : finish()),
        }, next ? '다음 질문' : '결과 보기')),
    );
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (a.textMode) return h('p', { class: 'hint' }, '타이핑 답변이라 말하기 지표는 측정하지 않았습니다.');
    const fillerDetail = Object.entries(a.fillers).map(([w, n]) => `${w} ${n}`).join(', ');
    return h('div', { class: 'tiles', style: 'margin-top:16px' },
      tile('말 속도', a.rate ? `${a.rate}` : '—', a.rate ? `음절/분 · ${a.rateVerdict}` : '인식된 말 없음'),
      tile('군말', `${a.fillerCount}회`, fillerDetail || '음/어 등'),
      tile('긴 끊김', `${a.longPauses}회`, a.longestPauseSec ? `최장 ${a.longestPauseSec}초` : '2.5초 이상'),
      tile('첫 마디까지', a.firstSpeechSec == null ? '—' : `${a.firstSpeechSec}초`, `답변 ${a.durationSec}초`));
  }

  function tile(label, value, sub) {
    return h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
  }

  function feedbackLists(ev) {
    return h('div', {},
      ev.feedback_good.length ? [h('h3', {}, '잘한 점'), h('ul', { class: 'good' }, ev.feedback_good.map((t) => h('li', {}, t)))] : '',
      ev.feedback_improve.length ? [h('h3', {}, '고칠 점'), h('ul', { class: 'improve' }, ev.feedback_improve.map((t) => h('li', {}, t)))] : '',
      ev.better_answer ? [h('h3', {}, ev.source === 'claude' ? '이렇게 말해 보세요' : '답변 구성 팁'), h('p', { class: 'better' }, ev.better_answer)] : '');
  }

  function quit() {
    if (!confirm('면접을 종료할까요? 지금까지 답한 내용으로 결과를 보여 드립니다.')) return;
    stopEverything();
    if (state.results.length) finish();
    else show('setup');
  }

  function stopEverything() {
    state.phase = 'done';
    state.current = { question: null };
    clearInterval(state.timer);
    Speech.stopSpeaking();
    if (state.recognizer) state.recognizer.abort();
    if (state.meter) state.meter.stop();
  }

  /* ---------- 결과 ---------- */
  async function finish() {
    stopEverything();
    const summary = Metrics.summarizeSession(state.results);
    state.report = { summary, ai: null, date: new Date().toISOString() };
    saveHistory(summary);
    renderReport();
    show('report');

    if (state.settings.apiKey && state.results.some((r) => r.evaluation.source === 'claude')) {
      $('#ai-report').replaceChildren(h('div', { class: 'spinner' }), h('p', { class: 'center muted' }, '면접관 총평을 작성하는 중…'));
      try {
        state.report.ai = await Claude.finalReport({ apiKey: state.settings.apiKey, settings: state.settings, results: state.results, summary });
      } catch (e) {
        toast(`총평 생성 실패: ${e.message}`, 6000);
      }
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
    const { summary, ai } = state.report;
    const s = state.settings;
    const voiceAnswers = state.results.filter((r) => !r.analysis.textMode).length;

    const aiBox = h('div', { id: 'ai-report' });
    if (ai) {
      aiBox.append(
        h('h2', {}, '면접관 총평'),
        h('p', {}, ai.overall_comment),
        h('h3', {}, '강점'), h('ul', { class: 'good' }, ai.strengths.map((t) => h('li', {}, t))),
        h('h3', {}, '보완점'), h('ul', { class: 'improve' }, ai.weaknesses.map((t) => h('li', {}, t))),
        h('h3', {}, '말하기 습관'), h('p', {}, ai.delivery_comment),
        h('h3', {}, '다음 연습 계획'), h('ol', {}, ai.practice_plan.map((t) => h('li', {}, t))),
      );
    } else if (!s.apiKey) {
      aiBox.append(h('p', { class: 'hint' }, 'Claude API 키를 연결하면 답변 내용을 실제로 읽고 평가한 총평과 꼬리질문을 받을 수 있습니다. 지금 점수는 말하기 지표와 답변 형식 위주의 간이 채점입니다.'));
    }

    $('#report').replaceChildren(
      h('div', { class: 'card' },
        h('h2', {}, '면접 결과'),
        h('p', { class: 'muted' }, `${Claude.MODE_LABELS[s.mode]} · ${s.company || s.fieldLabel} · 질문 ${state.results.length}개`),
        h('div', { class: 'hero' },
          h('div', {},
            h('div', { class: 'big' }, `${summary.overall}`, h('small', {}, ' / 100')),
            h('div', { class: 'grade' }, Metrics.gradeFor(summary.overall))),
          scoreBars(summary.avg)),
        voiceAnswers
          ? h('div', { class: 'tiles', style: 'margin-top:20px' },
            tile('평균 말 속도', summary.avgRate ? `${summary.avgRate}` : '—', `음절/분 (적정 ${Metrics.IDEAL_RATE.min}~${Metrics.IDEAL_RATE.max})`),
            tile('군말 합계', `${summary.totalFillers}회`, '음, 어 등'),
            tile('습관어 합계', `${summary.totalHabits}회`, '약간, 뭔가, 그냥 등'),
            tile('긴 끊김 합계', `${summary.totalLongPauses}회`, '2.5초 이상'))
          : ''),
      h('div', { class: 'card' }, aiBox),
      h('div', { class: 'card' },
        h('h2', {}, '질문별 상세'),
        state.results.map((r, i) =>
          h('details', { class: 'qa', open: i === 0 },
            h('summary', {},
              h('span', {}, `Q${i + 1}. ${r.followUp ? '[꼬리] ' : ''}${r.question}`),
              h('span', { class: 'pts' }, `${r.evaluation.overall}점`)),
            h('h3', {}, '내 답변'),
            h('p', { class: 'said' }, r.transcript || '(무응답)'),
            scoreBars(r.evaluation.scores),
            deliveryTiles(r.analysis),
            feedbackLists(r.evaluation))),
      ),
    );
  }

  function reportText() {
    const { summary, ai } = state.report;
    const s = state.settings;
    const L = [];
    L.push('AI 면접 훈련기 결과', `${new Date(state.report.date).toLocaleString('ko-KR')}`);
    L.push(`${Claude.MODE_LABELS[s.mode]} / ${s.company || s.fieldLabel}`, '');
    L.push(`종합 ${summary.overall}점 (${Metrics.gradeFor(summary.overall)})`);
    for (const [k, name] of Object.entries(SCORE_LABELS)) L.push(`- ${name}: ${summary.avg[k] == null ? '측정 안 함' : `${summary.avg[k]}/10`}`);
    L.push(`평균 말 속도 ${summary.avgRate}음절/분, 군말 ${summary.totalFillers}회, 습관어 ${summary.totalHabits}회, 긴 끊김 ${summary.totalLongPauses}회`, '');
    if (ai) {
      L.push('[면접관 총평]', ai.overall_comment, '', '강점:', ...ai.strengths.map((t) => `+ ${t}`), '', '보완점:', ...ai.weaknesses.map((t) => `! ${t}`));
      L.push('', '말하기 습관:', ai.delivery_comment, '', '연습 계획:', ...ai.practice_plan.map((t, i) => `${i + 1}. ${t}`), '');
    }
    state.results.forEach((r, i) => {
      L.push('----------------------------------------', `Q${i + 1}. ${r.question}`, `A. ${r.transcript || '(무응답)'}`, `점수 ${r.evaluation.overall}점`);
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
    $('#replay').addEventListener('click', () => {
      if (state.phase === 'recording') return;
      Speech.speak(state.current.question);
    });
    $('#quit').addEventListener('click', quit);
    $('#again').addEventListener('click', () => {
      renderHistory();
      startInterview(state.settings);
    });
    $('#home').addEventListener('click', () => {
      renderHistory();
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

  initSetup();
  bind();
})();
