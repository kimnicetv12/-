// In-stage heads-up display (DOM overlay).
import { noteIcon, noteLabel, noteMods } from './noteIcons.js';
import { formatTime } from './settings.js';

const LED_COUNT = 10;

export class Hud {
  constructor(root) {
    const $ = (id) => root.querySelector('#' + id);
    this.el = {
      root, stage: $('hudStage'), clock: $('hudClock'), splits: $('hudSplits'), penalty: $('hudPenalty'),
      notes: $('hudNotes'), callout: $('hudCallout'), minimap: $('minimap'), progress: $('hudProgress'),
      leds: $('hudLeds'), gear: $('hudGear'), speed: $('hudSpeed'), surface: $('hudSurface'), assist: $('hudAssist'),
      tyres: [...$('hudTyres').children], banner: $('hudBanner'), toast: $('hudToast'), cam: $('btnCam'),
    };
    this.el.leds.innerHTML = '';
    for (let i = 0; i < LED_COUNT; i++) {
      const led = document.createElement('i');
      led.className = i < 5 ? 'g' : i < 8 ? 'y' : 'r';
      this.el.leds.appendChild(led);
    }
    this.ledEls = [...this.el.leds.children];
    this.noteKey = '';
    this.toastTimer = 0;
    this.calloutTimer = 0;
    this.last = {};
  }

  setStage(run, best) {
    const { stage, road } = run.p;
    this.run = run;
    this.best = best;
    this.el.stage.textContent = `${run.meta.flag} ${run.meta.title} · ${(road.length / 1000).toFixed(2)} km`;
    this.el.splits.innerHTML = '';
    this.el.penalty.textContent = '';
    this.noteKey = '';
    this.#prepareMap(road);
    void stage;
  }

  #prepareMap(road) {
    const c = this.el.minimap;
    const W = c.width, H = c.height;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < road.n; i++) {
      x0 = Math.min(x0, road.x[i]); x1 = Math.max(x1, road.x[i]);
      z0 = Math.min(z0, road.z[i]); z1 = Math.max(z1, road.z[i]);
    }
    const pad = 18;
    const sc = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (z1 - z0 || 1));
    const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
    this.map = { x0, z0, sc, ox, oz };
    const bg = document.createElement('canvas');
    bg.width = W; bg.height = H;
    const g = bg.getContext('2d');
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 9;
    const path = () => {
      g.beginPath();
      for (let i = 0; i < road.n; i += 3) {
        const [px, py] = this.#mp(road.x[i], road.z[i]);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
    };
    path(); g.stroke();
    g.strokeStyle = 'rgba(238,241,243,0.9)';
    g.lineWidth = 4;
    path(); g.stroke();
    const [sx, sy] = this.#mp(road.x[0], road.z[0]);
    const [fx, fy] = this.#mp(road.x[road.n - 1], road.z[road.n - 1]);
    g.fillStyle = '#3fcf7a'; g.beginPath(); g.arc(sx, sy, 7, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(fx - 7, fy - 7, 14, 14);
    g.fillStyle = '#000'; g.fillRect(fx - 7, fy - 7, 7, 7); g.fillRect(fx, fy, 7, 7);
    this.mapBg = bg;
  }

  #mp(x, z) {
    const m = this.map;
    return [m.ox + (x - m.x0) * m.sc, m.oz + (z - m.z0) * m.sc];
  }

  toast(text, seconds = 2.2) {
    this.el.toast.textContent = text;
    this.el.toast.hidden = false;
    this.toastTimer = seconds;
  }

  banner(html) {
    if (html === null) { this.el.banner.hidden = true; return; }
    this.el.banner.innerHTML = html;
    this.el.banner.hidden = false;
  }

  callout(text) {
    this.el.callout.textContent = text;
    this.calloutTimer = 2.5;
  }

  splitLine(k, t) {
    const best = this.best?.splits?.[k];
    const div = document.createElement('div');
    let delta = '';
    if (best) {
      const d = t - best;
      delta = ` <span class="${d <= 0 ? 'faster' : 'slower'}">${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(1)}</span>`;
    }
    div.innerHTML = `S${k + 1} ${formatTime(t)}${delta}`;
    this.el.splits.appendChild(div);
  }

  update(dt, run) {
    const car = run.car;
    const t = run.state === 'countdown' ? 0 : run.state === 'finished' ? run.finishTime - run.penalty : run.time;
    const clock = formatTime(t);
    if (clock !== this.last.clock) { this.el.clock.textContent = clock; this.last.clock = clock; }
    const pen = run.penalty ? `페널티 +${run.penalty}초` : '';
    if (pen !== this.last.pen) { this.el.penalty.textContent = pen; this.last.pen = pen; }

    // speed / gear / LEDs
    const kmh = Math.round(Math.abs(car.speed) * 3.6);
    if (kmh !== this.last.kmh) { this.el.speed.textContent = kmh; this.last.kmh = kmh; }
    const gear = car.shiftTimer > 0 ? '·' : car.gear === -1 ? 'R' : car.gear === 0 ? 'N' : String(car.gear);
    if (gear !== this.last.gear) { this.el.gear.textContent = gear; this.last.gear = gear; }
    const rpm = car.engine.rpm;
    const lit = Math.max(0, Math.min(LED_COUNT, Math.round(((rpm - 3000) / (7200 - 3000)) * LED_COUNT)));
    if (lit !== this.last.lit) {
      this.ledEls.forEach((e, i) => e.classList.toggle('on', i < lit));
      this.last.lit = lit;
    }
    const flash = rpm > 7000 && (performance.now() % 160) < 80;
    if (flash !== this.last.flash) { this.el.leds.classList.toggle('flash', flash); this.last.flash = flash; }

    // tyre slip lamps
    car.wheels.forEach((w, i) => {
      const s = w.contact ? Math.min(1, w.slide / 1.5) : -1;
      const col = s < 0 ? '#5a6570' : s < 0.15 ? '#46d36f' : s < 0.55 ? '#ffcf3a' : '#ff4a3a';
      if (this.last['t' + i] !== col) { this.el.tyres[i].style.background = col; this.last['t' + i] = col; }
    });
    const fw = car.wheels[0].surface;
    const surf = car.airTime > 0.15 ? '공중' : fw.label;
    if (surf !== this.last.surf) {
      this.el.surface.textContent = surf;
      this.el.surface.className = fw.id === 'ice' ? 'warn' : '';
      this.last.surf = surf;
    }

    // progress + minimap
    const { road } = run.p;
    const frac = Math.min(1, run.maxS / run.finishS);
    const fw2 = `${(frac * 100).toFixed(1)}%`;
    if (fw2 !== this.last.prog) { this.el.progress.style.width = fw2; this.last.prog = fw2; }
    const c = this.el.minimap, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.mapBg, 0, 0);
    const [px, py] = this.#mp(car.position.x, car.position.z);
    const f = car.forward;
    const ang = Math.atan2(f.z, f.x);
    g.save();
    g.translate(px, py);
    g.rotate(ang);
    g.fillStyle = '#f5c02a';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, 8); g.lineTo(-4, 0); g.lineTo(-8, -8); g.closePath();
    g.fill(); g.stroke();
    g.restore();

    // pace notes
    const up = run.codriver.upcoming(run.maxS, 3);
    const key = up.map((u) => u.note.s).join(',');
    if (key !== this.noteKey) {
      this.noteKey = key;
      this.el.notes.innerHTML = up.map((u, i) => {
        const n = u.note;
        const warn = n.type === 'jump' || n.grade === 'H' || n.grade === 1;
        return `<div class="pn ${i === 0 ? 'next' : 'later'} ${warn ? 'warn' : ''}">${noteIcon(n)}<div><div class="g">${noteLabel(n)}</div><div class="d" data-i="${i}"></div></div><div class="m">${noteMods(n)}</div></div>`;
      }).join('');
      this.distEls = [...this.el.notes.querySelectorAll('.d')];
    }
    up.forEach((u, i) => {
      const el = this.distEls?.[i];
      if (!el) return;
      const d = Math.max(0, Math.round(u.dist / 10) * 10);
      const txt = u.dist <= 0 ? '지금' : `${d} m`;
      if (el.textContent !== txt) el.textContent = txt;
    });

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.hidden = true;
    }
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.el.callout.textContent = '';
    }
    void road;
  }

  setAssists(list) {
    this.el.assist.textContent = list.join(' · ');
  }
}
