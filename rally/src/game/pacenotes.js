// Generates co-driver pace notes from the real road geometry and calls them
// out (Korean speech synthesis + on-screen cards) ahead of the car.
//
// Grading uses the common 1-6 scale (6 = fastest, 1 = slowest) plus hairpin,
// with "long", "tightens", "opens", crests and jumps.

const DIST_STEPS = [30, 50, 70, 100, 150, 200, 250, 300];
const KO_NUM = { 1: '일', 2: '이', 3: '삼', 4: '사', 5: '오', 6: '육' };

function gradeFor(R, angle) {
  if (R < 16 && angle > 2.0) return 'H';
  if (R < 22) return 1;
  if (R < 36) return 2;
  if (R < 56) return 3;
  if (R < 86) return 4;
  if (R < 130) return 5;
  return 6;
}

export function generatePaceNotes(road, landmarks = []) {
  const n = road.n, step = road.step, k = road.curvature;
  const notes = [];
  // ---- corners
  const TH = 1 / 190;
  let i = 0;
  const runs = [];
  while (i < n) {
    if (Math.abs(k[i]) < TH) { i++; continue; }
    const sign = Math.sign(k[i]);
    let j = i;
    while (j < n && Math.sign(k[j]) === sign && Math.abs(k[j]) >= TH * 0.8) j++;
    runs.push({ a: i, b: j - 1, sign });
    i = j;
  }
  // merge same-direction runs separated by short gaps
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.sign === r.sign && (r.a - last.b) * step < 14) last.b = r.b;
    else merged.push({ ...r });
  }
  for (const r of merged) {
    let angle = 0, maxK = 0, apex = r.a;
    for (let q = r.a; q <= r.b; q++) {
      angle += Math.abs(k[q]) * step;
      if (Math.abs(k[q]) > maxK) { maxK = Math.abs(k[q]); apex = q; }
    }
    if (angle < 0.22) continue; // < ~13 degrees: not worth a call
    const R = 1 / maxK;
    const grade = gradeFor(R, angle);
    const len = (r.b - r.a) * step;
    // first-half vs second-half tightness
    const mid = Math.floor((r.a + r.b) / 2);
    let k1 = 0, k2 = 0;
    for (let q = r.a; q <= mid; q++) k1 = Math.max(k1, Math.abs(k[q]));
    for (let q = mid; q <= r.b; q++) k2 = Math.max(k2, Math.abs(k[q]));
    const mods = [];
    if (grade !== 'H' && (angle > 1.75 || (len > 90 && grade !== 6))) mods.push('long');
    if (len > 30 && k2 > k1 * 1.6) mods.push('tightens');
    else if (len > 30 && k1 > k2 * 1.6) mods.push('opens');
    notes.push({ type: 'corner', s: r.a * step, end: r.b * step, apex: apex * step, dir: r.sign > 0 ? 'R' : 'L', grade, mods, R, angle });
  }
  // ---- crests / jumps (convex vertical curvature)
  const vc = road.vcurv;
  let last = -1e9;
  for (let q = 2; q < n - 2; q++) {
    if (vc[q] < vc[q - 1] && vc[q] <= vc[q + 1] && vc[q] < -1 / 160 && (q * step - last) > 60) {
      const Rv = -1 / vc[q];
      notes.push({ type: Rv < 70 ? 'jump' : 'crest', s: q * step - 15, end: q * step, dir: null, grade: null, mods: [], Rv });
      last = q * step;
    }
  }
  for (const lm of landmarks) {
    // named landmark replaces a nearby generated crest/jump
    for (let q = notes.length - 1; q >= 0; q--) {
      if ((notes[q].type === 'jump' || notes[q].type === 'crest') && Math.abs(notes[q].end - lm.s) < 80) notes.splice(q, 1);
    }
    notes.push({ type: 'jump', s: lm.s - 20, end: lm.s, dir: null, grade: null, mods: ['big'], name: lm.name });
  }
  notes.push({ type: 'finish', s: road.length - 25, end: road.length - 25, dir: null, grade: null, mods: [] });
  notes.sort((a, b) => a.s - b.s);
  // ---- distances between notes
  for (let q = 0; q < notes.length - 1; q++) {
    const gap = notes[q + 1].s - notes[q].end;
    notes[q].into = gap < 25;
    if (!notes[q].into) {
      let d = DIST_STEPS[DIST_STEPS.length - 1];
      for (const st of DIST_STEPS) if (gap <= st * 1.15) { d = st; break; }
      notes[q].dist = gap > 380 ? Math.round(gap / 100) * 100 : d;
    }
  }
  for (const nt of notes) nt.text = noteText(nt);
  return notes;
}

export function noteText(n, withDistance = true) {
  let t;
  if (n.type === 'corner') {
    const dir = n.dir === 'L' ? '왼쪽' : '오른쪽';
    const g = n.grade === 'H' ? '헤어핀' : KO_NUM[n.grade];
    t = `${dir} ${g}`;
    if (n.mods.includes('long')) t += ' 롱';
    if (n.mods.includes('tightens')) t += ' 조여짐';
    if (n.mods.includes('opens')) t += ' 열림';
  } else if (n.type === 'crest') t = '크레스트';
  else if (n.type === 'jump') t = n.name ? `빅 점프, ${n.name === "Colin's Crest" ? '콜린스 크레스트' : n.name}, 풀 스로틀` : '점프';
  else if (n.type === 'finish') return '피니시, 끝까지 밟아';
  if (withDistance) {
    if (n.into) t += ', 이어서';
    else if (n.dist) t += `, ${n.dist}`;
  }
  return t;
}

/** Schedules calls as the car approaches each note. */
export class CoDriver {
  constructor(notes, { voice = true, lang = 'ko' } = {}) {
    this.notes = notes;
    this.next = 0;
    this.voice = voice && typeof speechSynthesis !== 'undefined';
    this.voiceObj = null;
    this.listeners = [];
    if (this.voice) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voiceObj = vs.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang)) || null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }
  }

  reset(s = 0) {
    this.next = 0;
    while (this.next < this.notes.length && this.notes[this.next].s < s + 20) this.next++;
    if (this.voice) speechSynthesis.cancel();
  }

  /** Upcoming notes for the HUD (relative distances). */
  upcoming(s, count = 3) {
    const out = [];
    for (let q = this.next - 1; q < this.notes.length && out.length < count; q++) {
      if (q < 0) continue;
      const n = this.notes[q];
      if (n.end < s - 5) continue;
      out.push({ note: n, dist: n.s - s });
    }
    return out;
  }

  update(s, speed) {
    const lead = Math.max(70, speed * 3.6 + 35);
    const parts = [];
    while (this.next < this.notes.length && this.notes[this.next].s < s + lead) {
      const n = this.notes[this.next++];
      if (n.s < s - 10) continue; // passed while resetting
      parts.push(n);
      // chain notes that follow immediately
      if (!n.into) break;
    }
    if (parts.length) this.say(parts.map((p) => p.text).join(', '));
  }

  say(text) {
    for (const l of this.listeners) l(text);
    if (!this.voice) return;
    if (speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    if (this.voiceObj) u.voice = this.voiceObj;
    u.rate = 1.35;
    u.pitch = 1.0;
    u.volume = 1;
    speechSynthesis.speak(u);
  }

  stop() {
    if (this.voice) speechSynthesis.cancel();
  }
}
