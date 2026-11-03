// Touch (slide / tilt / buttons), keyboard and gamepad input, merged into
// analog driver controls.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class Controls {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;
    this.state = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this.touch = { steer: 0, throttle: 0, brake: 0, handbrake: 0, active: false };
    this.keys = new Set();
    this.kb = { steer: 0, throttle: 0, brake: 0 };
    this.tilt = { value: 0, zero: null, available: false, enabled: false };
    this.pointers = new Map();
    this.handlers = {};
    this.source = 'touch';
    this.#bindTouch();
    this.#bindKeys();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name) {
    this.handlers[name]?.();
  }

  // ---------------------------------------------------------------- touch
  #bindTouch() {
    const $ = (id) => this.root.querySelector('#' + id);
    this.el = {
      steer: $('steerZone'), knob: $('steerKnob'), track: $('steerTrack'),
      gas: $('gasPedal'), brake: $('brakePedal'), hb: $('hbBtn'), up: $('gearUp'), down: $('gearDown'),
      wheel: $('wheelIcon'),
    };
    const roleOf = (target) => {
      for (const [role, el] of Object.entries({ gas: this.el.gas, brake: this.el.brake, hb: this.el.hb, up: this.el.up, down: this.el.down, steer: this.el.steer })) {
        if (el && (el === target || el.contains(target))) return role;
      }
      return null;
    };
    const down = (e) => {
      const role = roleOf(e.target);
      if (!role) return;
      e.preventDefault();
      this.source = 'touch';
      try { e.target.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      const p = { role, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.pointers.set(e.pointerId, p);
      if (role === 'up') this.emit('shiftUp');
      if (role === 'down') this.emit('shiftDown');
      this.#updateTouch();
    };
    const move = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      p.x = e.clientX;
      p.y = e.clientY;
      this.#updateTouch();
    };
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      this.#updateTouch();
    };
    const opts = { passive: false };
    this.root.addEventListener('pointerdown', down, opts);
    window.addEventListener('pointermove', move, opts);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  #updateTouch() {
    const t = this.touch;
    t.throttle = t.brake = t.handbrake = 0;
    let steer = null;
    const mode = this.settings.steering;
    for (const p of this.pointers.values()) {
      if (p.role === 'gas' || p.role === 'brake') {
        const r = (p.role === 'gas' ? this.el.gas : this.el.brake).getBoundingClientRect();
        const v = clamp((r.bottom - p.y) / r.height, 0, 1);
        const amount = clamp(0.3 + 0.75 * v, 0, 1);
        if (p.role === 'gas') t.throttle = Math.max(t.throttle, amount);
        else t.brake = Math.max(t.brake, amount);
      } else if (p.role === 'hb') t.handbrake = 1;
      else if (p.role === 'steer') {
        if (mode === 'buttons') {
          const r = this.el.steer.getBoundingClientRect();
          steer = (steer ?? 0) + (p.x < r.left + r.width / 2 ? -1 : 1);
        } else if (mode === 'slide') {
          const range = Math.min(240, window.innerWidth * 0.15) / this.settings.sensitivity;
          steer = clamp((p.x - p.x0) / range, -1, 1);
          p.steerRange = range;
        }
      }
    }
    t.active = this.pointers.size > 0;
    t.steerTouch = steer;
    // visuals
    this.el.gas.style.setProperty('--v', t.throttle);
    this.el.brake.style.setProperty('--v', t.brake);
    this.el.hb.classList.toggle('on', t.handbrake > 0);
    const sp = [...this.pointers.values()].find((p) => p.role === 'steer');
    if (this.el.track) {
      if (sp && mode === 'slide') {
        const rr = this.root.getBoundingClientRect();
        this.el.track.style.display = 'block';
        this.el.track.style.left = `${sp.x0 - rr.left}px`;
        this.el.track.style.top = `${sp.y0 - rr.top}px`;
        this.el.track.style.width = `${sp.steerRange * 2}px`;
      } else this.el.track.style.display = 'none';
    }
  }

  // ----------------------------------------------------------------- tilt
  /** Turn on tilt steering. Resolves false if no motion data arrives. */
  async enableTilt() {
    const DM = window.DeviceMotionEvent;
    if (!DM) return false;
    if (typeof DM.requestPermission === 'function') {
      try {
        if ((await DM.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    if (!this.tiltBound) {
      this.tiltBound = true;
      window.addEventListener('devicemotion', (e) => {
        const g = e.accelerationIncludingGravity;
        if (!g || g.x === null) return;
        this.tilt.available = true;
        const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * (Math.PI / 180);
        // gravity in screen coordinates
        const sx = g.x * Math.cos(angle) + g.y * Math.sin(angle);
        const sy = -g.x * Math.sin(angle) + g.y * Math.cos(angle);
        const a = Math.atan2(sx, -sy);
        if (this.tilt.zero === null) this.tilt.zero = a;
        let d = a - this.tilt.zero;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        this.tilt.raw = d;
      });
    }
    this.tilt.zero = null;
    // some browsers / embedded frames expose the API but never deliver data
    for (let t = 0; t < 15 && !this.tilt.available; t++) await new Promise((r) => setTimeout(r, 100));
    this.tilt.enabled = this.tilt.available;
    return this.tilt.available;
  }

  recenterTilt() {
    this.tilt.zero = null;
  }

  // ------------------------------------------------------------- keyboard
  #bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.source = 'keyboard';
      const k = e.code;
      if (k === 'KeyE' || k === 'ShiftRight' || k === 'ShiftLeft') this.emit('shiftUp');
      if (k === 'KeyQ' || k === 'ControlLeft' || k === 'ControlRight') this.emit('shiftDown');
      if (k === 'KeyC') this.emit('camera');
      if (k === 'KeyR') this.emit('reset');
      if (k === 'Escape' || k === 'KeyP') this.emit('pause');
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // ---------------------------------------------------------------- update
  update(dt, speed) {
    const s = this.state;
    const K = this.keys;
    // keyboard: ramped digital inputs
    const left = K.has('ArrowLeft') || K.has('KeyA');
    const right = K.has('ArrowRight') || K.has('KeyD');
    const tgt = (right ? 1 : 0) - (left ? 1 : 0);
    const steerRate = tgt === 0 ? 6 : Math.sign(tgt) !== Math.sign(this.kb.steer) ? 7 : 3.2;
    this.kb.steer += clamp(tgt - this.kb.steer, -steerRate * dt, steerRate * dt);
    const ramp = (cur, on, up, down) => clamp(cur + (on ? up : -down) * dt, 0, 1);
    this.kb.throttle = ramp(this.kb.throttle, K.has('ArrowUp') || K.has('KeyW'), 5, 8);
    this.kb.brake = ramp(this.kb.brake, K.has('ArrowDown') || K.has('KeyS'), 6, 9);
    const kbHand = K.has('Space') ? 1 : 0;

    // gamepad
    let gp = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    let gSteer = 0, gThr = 0, gBrk = 0, gHb = 0;
    if (gp) {
      const ax = gp.axes[0] || 0;
      gSteer = Math.abs(ax) < 0.06 ? 0 : Math.sign(ax) * (Math.abs(ax) - 0.06) / 0.94;
      gThr = gp.buttons[7]?.value || 0;
      gBrk = gp.buttons[6]?.value || 0;
      gHb = gp.buttons[0]?.pressed || gp.buttons[2]?.pressed ? 1 : 0;
      const edge = (i, name) => {
        const pressed = !!gp.buttons[i]?.pressed;
        this.gpPrev ||= {};
        if (pressed && !this.gpPrev[i]) this.emit(name);
        this.gpPrev[i] = pressed;
      };
      edge(5, 'shiftUp');
      edge(4, 'shiftDown');
      edge(3, 'camera');
      edge(9, 'pause');
      edge(8, 'reset');
      if (Math.abs(gSteer) > 0.1 || gThr > 0.05 || gBrk > 0.05) this.source = 'gamepad';
    }

    // touch steering
    const t = this.touch;
    let touchSteer;
    const mode = this.settings.steering;
    if (mode === 'tilt' && this.tilt.enabled) {
      const range = (32 * Math.PI) / 180 / this.settings.sensitivity;
      touchSteer = clamp((this.tilt.raw || 0) / range, -1, 1);
    } else if (mode === 'buttons') {
      const target = clamp(t.steerTouch ?? 0, -1, 1);
      this.btnSteer = (this.btnSteer || 0) + clamp(target - (this.btnSteer || 0), -dt * (target === 0 ? 6 : 3), dt * (target === 0 ? 6 : 3));
      touchSteer = this.btnSteer;
    } else touchSteer = t.steerTouch ?? 0;

    let steer;
    if (this.source === 'gamepad') steer = gSteer;
    else if (this.source === 'keyboard') steer = this.kb.steer;
    else steer = touchSteer;
    // response curve: finer control around centre
    const gamma = this.source === 'keyboard' ? 1 : this.settings.linearity;
    steer = Math.sign(steer) * Math.pow(Math.abs(steer), gamma);
    // optional speed-sensitive steering (assist)
    if (this.settings.speedSteer) steer *= 1 / (1 + Math.max(0, speed - 10) * 0.025);

    s.steer = clamp(steer, -1, 1);
    s.throttle = Math.max(t.throttle, this.kb.throttle, gThr);
    s.brake = Math.max(t.brake, this.kb.brake, gBrk);
    s.handbrake = Math.max(t.handbrake, kbHand, gHb);
    if (this.el.wheel) this.el.wheel.style.transform = `rotate(${s.steer * 120}deg)`;
    return s;
  }

  releaseAll() {
    this.pointers.clear();
    this.keys.clear();
    this.#updateTouch();
  }
}
