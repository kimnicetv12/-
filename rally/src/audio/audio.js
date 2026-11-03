// Synthesised car audio with WebAudio: 4-cylinder turbo engine with anti-lag
// pops and limiter, turbo whistle, gravel/snow/tarmac tyre noise, stones
// hitting the underbody, wind, impacts.

function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = 0.85 * last + 0.15 * w;
    d[i] = w * 0.6 + last * 0.4;
  }
  return b;
}

function shaper(amount) {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return c;
}

export class CarAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
  }

  /** Must be called from a user gesture (iOS). */
  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const master = (this.master = ctx.createGain());
    master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    this.noise = noiseBuffer(ctx);

    // ---- engine
    const eng = ctx.createGain();
    eng.gain.value = 0;
    const lp = (this.engLP = ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    const ws = (this.engWS = ctx.createWaveShaper());
    ws.curve = shaper(2.2);
    const pre = ctx.createGain();
    pre.gain.value = 0.6;
    this.osc = [];
    const mk = (type, mult, gain) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(pre);
      o.start();
      this.osc.push({ o, mult });
      return o;
    };
    mk('sawtooth', 1, 0.5);
    mk('square', 0.5, 0.28);
    mk('sawtooth', 2, 0.22);
    mk('triangle', 3, 0.12);
    pre.connect(ws).connect(lp).connect(eng).connect(master);
    this.engGain = eng;
    // intake / exhaust roar
    const roar = this.#noiseSource();
    const roarBP = (this.roarBP = ctx.createBiquadFilter());
    roarBP.type = 'bandpass';
    roarBP.Q.value = 0.9;
    const roarG = (this.roarG = ctx.createGain());
    roarG.gain.value = 0;
    roar.connect(roarBP).connect(roarG).connect(master);
    // turbo whistle
    const tw = ctx.createOscillator();
    tw.type = 'sine';
    const twG = (this.turboG = ctx.createGain());
    twG.gain.value = 0;
    tw.connect(twG).connect(master);
    tw.start();
    this.turbo = tw;

    // ---- surface noise
    const surf = this.#noiseSource();
    const sBP = (this.surfBP = ctx.createBiquadFilter());
    sBP.type = 'bandpass';
    sBP.Q.value = 0.6;
    const sG = (this.surfG = ctx.createGain());
    sG.gain.value = 0;
    surf.connect(sBP).connect(sG).connect(master);
    // tyre squeal (tarmac / ice)
    const sq = this.#noiseSource();
    const sqBP = (this.squealBP = ctx.createBiquadFilter());
    sqBP.type = 'bandpass';
    sqBP.Q.value = 9;
    sqBP.frequency.value = 1100;
    const sqG = (this.squealG = ctx.createGain());
    sqG.gain.value = 0;
    sq.connect(sqBP).connect(sqG).connect(master);
    // wind
    const wind = this.#noiseSource();
    const wLP = ctx.createBiquadFilter();
    wLP.type = 'lowpass';
    wLP.frequency.value = 700;
    const wG = (this.windG = ctx.createGain());
    wG.gain.value = 0;
    wind.connect(wLP).connect(wG).connect(master);
    this.stoneTimer = 0;
  }

  #noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 1.5);
    return s;
  }

  burst(freq, q, dur, gain, type = 'bandpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  thump(gain) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
    this.burst(300, 0.8, 0.18, gain * 0.6);
  }

  pops(n = 3) {
    if (!this.ctx) return;
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.burst(500 + Math.random() * 700, 1.5, 0.05 + Math.random() * 0.05, 0.35 + Math.random() * 0.3), i * (40 + Math.random() * 70));
    }
  }

  update(car, dt) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const rpm = car.engine.rpm;
    const thr = car.controls.throttle;
    const load = Math.max(thr, car.engine.cut ? 0 : 0);
    const f0 = (rpm / 60) * 2; // 4-cylinder firing frequency
    for (const { o, mult } of this.osc) o.frequency.setTargetAtTime(f0 * mult, t, 0.012);
    this.engLP.frequency.setTargetAtTime(500 + thr * 2600 + rpm * 0.35, t, 0.03);
    this.engGain.gain.setTargetAtTime(0.1 + load * 0.2 + (rpm / 7500) * 0.08, t, 0.03);
    this.roarBP.frequency.setTargetAtTime(f0 * 2.5 + 200, t, 0.03);
    this.roarG.gain.setTargetAtTime(0.03 + thr * 0.12 * (rpm / 7500), t, 0.05);
    this.turbo.frequency.setTargetAtTime(2200 + car.engine.boost * 3800 * (rpm / 7000), t, 0.08);
    this.turboG.gain.setTargetAtTime(car.engine.boost * 0.012 * thr, t, 0.1);

    // tyres
    const speed = car.velocity.length();
    let loose = 0, slide = 0, snow = 0, contact = 0;
    for (const w of car.wheels) {
      if (!w.contact) continue;
      contact++;
      const id = w.surface.id;
      if (id.startsWith('gravel') || id === 'dirt' || id === 'grass') loose++;
      if (id.startsWith('snow')) snow++;
      if (id === 'tarmac' || id === 'tarmacDirty' || id === 'ice') slide += Math.max(0, w.slipSpeed - 1.5);
    }
    const sp = Math.min(speed / 30, 1.5);
    const surfGain = contact ? (loose * 0.06 + snow * 0.035 + (contact - loose - snow) * 0.012) * sp : 0;
    this.surfBP.frequency.setTargetAtTime(snow > loose ? 600 : 1300 + speed * 15, t, 0.1);
    this.surfG.gain.setTargetAtTime(surfGain, t, 0.05);
    this.squealG.gain.setTargetAtTime(Math.min(0.12, slide * 0.012), t, 0.05);
    this.squealBP.frequency.setTargetAtTime(950 + Math.min(slide, 10) * 25, t, 0.05);
    this.windG.gain.setTargetAtTime(Math.min(0.12, (speed * speed) / 18000), t, 0.2);

    // gravel stones pinging the underbody
    if (loose > 0 && speed > 5) {
      this.stoneTimer -= dt * speed * 0.25 * loose;
      if (this.stoneTimer < 0) {
        this.stoneTimer = Math.random() * 2;
        this.burst(2500 + Math.random() * 3000, 6, 0.03, 0.05 + Math.random() * 0.06);
      }
    }

    for (const e of car.events) {
      if (e.type === 'pop' && Math.random() < 0.8) this.pops(2 + Math.floor(Math.random() * 3));
      else if (e.type === 'limiter') this.pops(1);
      else if (e.type === 'shift') this.burst(180, 2, 0.06, 0.2);
      else if (e.type === 'land') this.thump(Math.min(0.9, 0.2 + e.air * 0.6));
    }
  }

  impact(speed) {
    this.thump(Math.min(1, speed / 10));
    this.burst(900, 0.6, 0.25, Math.min(0.8, speed / 12), 'lowpass');
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    this.ctx?.resume();
  }
}
