/* 음성 입출력: 음성 인식(Web Speech API), 질문 읽어주기(TTS), 마이크 음량 표시. */
(function (root) {
  const SR = root.SpeechRecognition || root.webkitSpeechRecognition;

  class Recognizer {
    constructor({ lang = 'ko-KR', onUpdate, onError } = {}) {
      this.lang = lang;
      this.onUpdate = onUpdate || (() => {});
      this.onError = onError || (() => {});
      this.active = false;
      this.rec = null;
    }

    static get supported() {
      return !!SR;
    }

    start() {
      this.finalText = '';
      this.interim = '';
      this.activity = [];
      this.firstSpeechMs = null;
      this.startedAt = performance.now();
      this.active = true;
      this._spawn();
    }

    _spawn() {
      const rec = new SR();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const t = performance.now() - this.startedAt;
        if (this.firstSpeechMs == null) this.firstSpeechMs = t;
        this.activity.push(t);
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) this.finalText = join(this.finalText, r[0].transcript);
          else interim = join(interim, r[0].transcript);
        }
        this.interim = interim;
        this.onUpdate(join(this.finalText, this.interim));
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.active = false;
          this.onError('마이크 권한이 거부되었습니다. 주소창의 자물쇠 아이콘에서 마이크를 허용해 주세요.');
        } else if (e.error === 'network') {
          this.onError('음성 인식 서버에 연결하지 못했습니다(인터넷 연결 필요).');
        } else if (e.error === 'audio-capture') {
          this.active = false;
          this.onError('마이크를 찾을 수 없습니다.');
        }
      };
      rec.onend = () => {
        // 크롬은 잠깐 조용하면 인식을 스스로 끝내므로, 답변 중이면 다시 켠다
        if (this.active) {
          if (this.interim) {
            this.finalText = join(this.finalText, this.interim);
            this.interim = '';
          }
          try {
            this._spawn();
          } catch (_) { /* 이미 시작됨 */ }
        } else if (this._resolveStop) {
          this._resolveStop();
        }
      };
      this.rec = rec;
      rec.start();
    }

    /** 인식을 멈추고 답변 기록을 돌려준다. */
    stop() {
      const durationMs = performance.now() - this.startedAt;
      this.active = false;
      const done = new Promise((resolve) => {
        this._resolveStop = resolve;
        setTimeout(resolve, 1500); // onend가 오지 않는 경우 대비
      });
      try {
        this.rec && this.rec.stop();
      } catch (_) { /* 이미 멈춤 */ }
      return done.then(() => {
        this._resolveStop = null;
        const transcript = join(this.finalText, this.interim).trim();
        return { transcript, durationMs, firstSpeechMs: this.firstSpeechMs, activity: this.activity.slice() };
      });
    }

    abort() {
      this.active = false;
      try {
        this.rec && this.rec.abort();
      } catch (_) { /* 무시 */ }
    }
  }

  function join(a, b) {
    a = (a || '').trim();
    b = (b || '').trim();
    return a && b ? `${a} ${b}` : a || b;
  }

  /* ---------- 질문 읽어주기 ---------- */
  const synth = root.speechSynthesis;
  let koVoice = null;
  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    koVoice = voices.find((v) => /^ko/i.test(v.lang) && /google/i.test(v.name)) || voices.find((v) => /^ko/i.test(v.lang)) || null;
  }
  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }

  function speak(text, { rate = 1.0 } = {}) {
    return new Promise((resolve) => {
      if (!synth || !text) return resolve();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      if (koVoice) u.voice = koVoice;
      u.rate = rate;
      const fallback = setTimeout(resolve, 2000 + text.length * 250);
      u.onend = u.onerror = () => {
        clearTimeout(fallback);
        resolve();
      };
      synth.speak(u);
    });
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
  }

  /* ---------- 마이크 음량 ---------- */
  class MicMeter {
    async start(onLevel) {
      if (this.stream) return;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = root.AudioContext || root.webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(this.analyser);
      const buf = new Float32Array(this.analyser.fftSize);
      const tick = () => {
        this.analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        onLevel(Math.min(1, rms * 6));
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    }

    stop() {
      cancelAnimationFrame(this.raf);
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      if (this.ctx) this.ctx.close();
      this.stream = this.ctx = this.analyser = null;
    }
  }

  root.Speech = { Recognizer, speak, stopSpeaking, MicMeter, ttsSupported: !!synth };
})(window);
