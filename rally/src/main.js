// App entry: menus, stage loading, render loop.
import * as THREE from 'three';
import { loadStage } from './world/stageData.js';
import { prepareStageAsync } from './game/prepare.js';
import { StageRun } from './game/session.js';
import { STAGES } from './game/stages.js';
import { WorldView } from './render/world.js';
import { CarModel } from './render/carModel.js';
import { Environment } from './render/environment.js';
import { Particles, emitFromCar } from './render/particles.js';
import { CameraRig } from './render/cameraRig.js';
import { PostFX } from './render/post.js';
import { SHARED } from './render/materials.js';
import { CarAudio } from './audio/audio.js';
import { Controls } from './input/controls.js';
import { Hud } from './ui/hud.js';
import { loadSettings, saveSettings, DEFAULTS, QUALITY, loadBest, saveBest, formatTime } from './ui/settings.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const settings = loadSettings();
const audio = new CarAudio();
audio.setVolume(settings.volume);
const controls = new Controls($('touch'), settings);
const hud = new Hud($('hud'));
const stageCache = new Map();
const coarse = matchMedia('(pointer: coarse)').matches;
let game = null;

// ------------------------------------------------------------------ renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(66, 1, 0.3, 9000);
let pixelRatio = 1;

function quality() {
  return QUALITY[settings.quality] || QUALITY.medium;
}

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  game?.particles?.setViewport(h * pixelRatio);
  game?.post?.setSize();
}
function applyQuality() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, quality().pixelRatio);
  renderer.shadowMap.enabled = quality().shadows;
  resize();
}
window.addEventListener('resize', resize);
applyQuality();

// ---------------------------------------------------------------------- menu
async function getStage(id) {
  if (!stageCache.has(id)) stageCache.set(id, loadStage(new URL(`../stages/${id}.json`, import.meta.url)));
  return stageCache.get(id);
}

function drawPreview(cv, stage) {
  const g = cv.getContext('2d');
  const W = (cv.width = cv.clientWidth * 2 || 640), H = (cv.height = Math.round(W * 9 / 16));
  const pts = stage.roadPoints, n = pts.length / 3;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, pts[i * 3]); x1 = Math.max(x1, pts[i * 3]);
    z0 = Math.min(z0, pts[i * 3 + 2]); z1 = Math.max(z1, pts[i * 3 + 2]);
    y0 = Math.min(y0, pts[i * 3 + 1]); y1 = Math.max(y1, pts[i * 3 + 1]);
  }
  const prof = H * 0.24;
  const pad = 16;
  const sc = Math.min((W - 2 * pad) / (x1 - x0), (H - prof - 2 * pad) / (z1 - z0));
  const ox = (W - (x1 - x0) * sc) / 2, oz = (H - prof - (z1 - z0) * sc) / 2;
  g.clearRect(0, 0, W, H);
  g.lineJoin = g.lineCap = 'round';
  g.strokeStyle = '#f5c02a';
  g.lineWidth = 3.5;
  g.beginPath();
  for (let i = 0; i < n; i += 2) {
    const X = ox + (pts[i * 3] - x0) * sc, Y = oz + (pts[i * 3 + 2] - z0) * sc;
    if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
  }
  g.stroke();
  g.fillStyle = '#3fcf7a';
  g.beginPath(); g.arc(ox + (pts[0] - x0) * sc, oz + (pts[2] - z0) * sc, 7, 0, 7); g.fill();
  g.fillStyle = '#eef1f3';
  g.fillRect(ox + (pts[(n - 1) * 3] - x0) * sc - 6, oz + (pts[(n - 1) * 3 + 2] - z0) * sc - 6, 12, 12);
  // elevation profile strip
  const top = H - prof + 8;
  g.fillStyle = 'rgba(245,192,42,0.18)';
  g.strokeStyle = 'rgba(238,241,243,0.75)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, H);
  for (let i = 0; i < n; i += 2) {
    const X = (i / (n - 1)) * W;
    const Y = top + (1 - (pts[i * 3 + 1] - y0) / (y1 - y0 || 1)) * (prof - 14);
    g.lineTo(X, Y);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(238,241,243,0.8)';
  g.font = '600 20px "IBM Plex Mono", monospace';
  g.fillText(`${Math.round(y0)}–${Math.round(y1)} m`, 10, top + 16);
}

function buildMenu() {
  const list = $('stageList');
  list.innerHTML = '';
  for (const meta of STAGES) {
    const best = loadBest(meta.id);
    const card = document.createElement('article');
    card.className = 'stage-card';
    card.innerHTML = `
      <div class="rally"><span>${meta.flag} ${meta.rally}</span><span>${meta.surfaceLabel}</span></div>
      <div><h2>${meta.title}</h2><div class="sub">${meta.sub}</div></div>
      <canvas class="stage-map" aria-label="${meta.title} 코스 지도와 고도"></canvas>
      <div class="facts">
        <div class="fact"><b data-f="len">–</b><small>거리 km</small></div>
        <div class="fact"><b data-f="climb">–</b><small>고저차 m</small></div>
        <div class="fact"><b data-f="ref">–</b><small>목표 시간</small></div>
      </div>
      <p class="stage-desc" data-f="desc"></p>
      <div class="card-foot">
        <div class="best">${best ? `베스트 <em>${formatTime(best.time)}</em>` : '아직 기록 없음'}</div>
        <button class="go-btn" type="button">출발</button>
      </div>`;
    card.querySelector('.go-btn').addEventListener('click', () => startStage(meta));
    list.appendChild(card);
    getStage(meta.id).then((stage) => {
      const pts = stage.roadPoints;
      let lo = Infinity, hi = -Infinity;
      for (let i = 1; i < pts.length; i += 3) { lo = Math.min(lo, pts[i]); hi = Math.max(hi, pts[i]); }
      card.querySelector('[data-f="len"]').textContent = (stage.length / 1000).toFixed(2);
      card.querySelector('[data-f="climb"]').textContent = Math.round(hi - lo);
      card.querySelector('[data-f="ref"]').textContent = formatTime((stage.length / 1000 / meta.refSpeed) * 3600, 0);
      card.querySelector('[data-f="desc"]').textContent = stage.description;
      drawPreview(card.querySelector('canvas'), stage);
    }).catch((e) => {
      card.querySelector('[data-f="desc"]').textContent = '스테이지 데이터를 불러오지 못했습니다: ' + e.message;
    });
  }
}

// ------------------------------------------------------------------ settings
function bindSettings() {
  const seg = (id, key, after) => {
    const root = $(id);
    const sync = () => root.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === settings[key])));
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      settings[key] = b.dataset.v;
      sync();
      saveSettings(settings);
      await after?.(b.dataset.v);
    });
    sync();
    return sync;
  };
  const syncSteer = seg('segSteer', 'steering', async (v) => {
    if (v === 'tilt') {
      const ok = await controls.enableTilt();
      $('tiltNote').textContent = ok ? '기울기: 태블릿을 핸들처럼 돌린다. 출발 순간의 자세가 중앙이다.' : '이 브라우저에서는 기울기 센서를 쓸 수 없어 슬라이드 조향을 사용합니다.';
      if (!ok) { settings.steering = 'slide'; syncSteer(); saveSettings(settings); }
    }
    updateSteerHint();
  });
  const syncQ = seg('segQuality', 'quality', () => applyQuality());
  const range = (id, out, key, fmt) => {
    const r = $(id), o = $(out);
    const show = () => { o.textContent = fmt(Number(r.value)); };
    r.value = settings[key];
    show();
    r.addEventListener('input', () => {
      settings[key] = Number(r.value);
      show();
      saveSettings(settings);
      if (key === 'volume') audio.setVolume(settings.volume);
    });
    return () => { r.value = settings[key]; show(); };
  };
  const syncers = [
    range('rngSens', 'outSens', 'sensitivity', (v) => v.toFixed(2) + '×'),
    range('rngLin', 'outLin', 'linearity', (v) => v.toFixed(2)),
    range('rngBias', 'outBias', 'brakeBias', (v) => Math.round(v * 100) + '%'),
    range('rngFinal', 'outFinal', 'finalOffset', (v) => (v === 0 ? '기본' : v < 0 ? '짧게' : '길게') + (v ? ` ${Math.abs(v * 25).toFixed(0)}%` : '')),
    range('rngSpring', 'outSpring', 'springScale', (v) => Math.round(v * 100) + '%'),
    range('rngLsd', 'outLsd', 'rearLsd', (v) => Math.round(v * 100) + '%'),
    range('rngVol', 'outVol', 'volume', (v) => Math.round(v * 100) + '%'),
  ];
  const check = (id, key) => {
    const c = $(id);
    c.checked = !!settings[key];
    c.addEventListener('change', () => { settings[key] = c.checked; saveSettings(settings); });
    return () => { c.checked = !!settings[key]; };
  };
  syncers.push(
    check('optAutoGear', 'autoGear'), check('optCounter', 'counterSteer'), check('optABS', 'abs'),
    check('optTCS', 'tcs'), check('optSpeedSteer', 'speedSteer'), check('optVoice', 'voice'),
  );
  $('btnDefaults').addEventListener('click', () => {
    const q = settings.quality;
    Object.assign(settings, DEFAULTS, { quality: q });
    saveSettings(settings);
    syncers.forEach((f) => f());
    syncSteer();
    syncQ();
    audio.setVolume(settings.volume);
    updateSteerHint();
  });
  $('btnSettings').addEventListener('click', () => openSettings(false));
  $('btnCloseSettings').addEventListener('click', closeSettings);
  updateSteerHint();
}

let settingsFromPause = false;
function openSettings(fromPause) {
  settingsFromPause = fromPause;
  $('settings').hidden = false;
}
function closeSettings() {
  $('settings').hidden = true;
  if (settingsFromPause && game) {
    game.applyLiveSettings();
    $('pause').hidden = false;
  }
}

function updateSteerHint() {
  $('steerHint').textContent = settings.steering === 'tilt' ? '태블릿을 핸들처럼 돌려 조향' : settings.steering === 'buttons' ? '왼쪽 절반: 좌 · 오른쪽 절반: 우' : '왼쪽 아무 곳이나 누르고 좌우로 밀기';
}

$('btnFullscreen').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else await document.exitFullscreen();
  } catch {
    $('btnFullscreen').textContent = '전체 화면 미지원';
  }
});
$('btnRotateDismiss').addEventListener('click', () => { $('rotate').dataset.dismissed = '1'; });

// --------------------------------------------------------------------- game

class Game {
  constructor(prepared, meta) {
    this.meta = meta;
    this.prepared = prepared;
    this.run = new StageRun(prepared, settings, meta);
    this.rig = new CameraRig(camera, prepared.terrain.ground);
    this.rig.setMode(settings.camera);
    this.buildView();
    this.best = loadBest(meta.id);
    this.paused = false;
    this.fpsAvg = 60;
    this.lowFor = 0;
    this.lastLights = -1;
    hud.setStage(this.run, this.best);
    this.run.codriver.listeners.push((t) => hud.callout(t));
    $('btnCam').textContent = this.rig.label;
    this.applyLiveSettings();
  }

  /** (Re)build everything visual for the current quality preset. */
  buildView() {
    if (this.scene) this.disposeView();
    const q = (this.q = quality());
    const prepared = this.prepared;
    this.scene = new THREE.Scene();
    this.env = new Environment(this.scene, renderer, prepared.stage, q);
    this.world = new WorldView(prepared, this.scene, q);
    this.carModel = new CarModel(this.run.car, undefined, { headlights: prepared.stage.timeOfDay === 'dusk' });
    this.scene.add(this.carModel.root);
    this.carModel.setView(this.rig.mode);
    this.particles = new Particles(this.scene);
    this.particles.setViewport(app.clientHeight * pixelRatio);
    const tint = { dusk: [0.95, 0.72, 0.58], day: [1, 0.98, 0.95], winter: [0.92, 0.95, 1] }[this.env.key];
    this.particles.setLight(...tint);
    // image-based lighting strength per material
    this.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (m.isMeshStandardMaterial) m.envMapIntensity = this.env.envIntensity * (m.userData.envScale ?? 1);
    });
    let lo = Infinity;
    for (let i = 0; i < prepared.road.n; i += 10) lo = Math.min(lo, prepared.road.y[i]);
    SHARED.uHazeBase.value = lo;
    camera.far = Math.max(4600, this.env.fogFar + 900);
    camera.updateProjectionMatrix();
    this.post = q.post ? new PostFX(renderer, this.scene, camera, q, this.env.key) : null;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.needsUpdate = true;
  }

  disposeView() {
    this.world.dispose();
    this.env.dispose();
    this.carModel.dispose();
    this.particles.dispose();
    this.post?.dispose();
    this.scene.clear();
    renderer.renderLists.dispose();
  }

  applyLiveSettings() {
    if (this.q !== quality()) this.buildView();
    const car = this.run.car;
    car.assists.autoGear = settings.autoGear;
    car.assists.abs = settings.abs;
    car.assists.tcs = settings.tcs;
    car.assists.counterSteer = settings.counterSteer ? 0.8 : false;
    this.run.codriver.voice = settings.voice && typeof speechSynthesis !== 'undefined';
    $('gearBox').hidden = settings.autoGear;
    const a = [];
    if (settings.autoGear) a.push('AUTO');
    if (settings.abs) a.push('ABS');
    if (settings.tcs) a.push('TCS');
    if (settings.counterSteer) a.push('CS');
    hud.setAssists(a);
    updateSteerHint();
  }

  frame(dt) {
    const run = this.run;
    const car = run.car;
    const input = controls.update(dt, Math.abs(car.speed));
    run.update(dt, input);

    // messages from the run
    for (const m of run.messages) {
      if (m === 'GO') hud.banner(null);
      else if (m.startsWith('split:')) {
        const k = Number(m.slice(6));
        hud.splitLine(k, run.splits[k]);
      } else if (m === 'finish') this.onFinish();
      else if (m === 'hint:stuck') hud.toast('움직일 수 없다면 오른쪽 위 [복귀]', 2.5);
      else hud.toast(m);
    }
    run.messages.length = 0;

    // countdown lights
    if (run.state === 'countdown') {
      const lit = Math.max(0, Math.min(5, Math.floor(5.2 - run.countdown)));
      if (lit !== this.lastLights) {
        this.lastLights = lit;
        const lights = Array.from({ length: 5 }, (_, i) => `<i class="${i < lit ? 'red' : ''}"></i>`).join('');
        hud.banner(`<div class="startlights">${lights}</div>${Math.max(1, Math.min(5, Math.ceil(run.countdown - 0.2)))}<small>가속 페달로 회전수를 올려 두세요</small>`);
      }
    } else if (this.lastLights !== 99 && run.state === 'running') {
      this.lastLights = 99;
      hud.banner(`<div class="startlights">${'<i class="green"></i>'.repeat(5)}</div>GO`);
      setTimeout(() => { if (game === this && this.run.state === 'running') hud.banner(null); }, 900);
    }

    // collisions -> sound / shake
    const hits = run.p.env.obstacles.hits;
    let hard = 0;
    for (const h of hits) hard = Math.max(hard, h.speed);
    hits.length = 0;
    if (hard > 1.5) {
      audio.impact(hard);
      this.rig.shake += hard * 2;
      if (hard > 6) hud.toast('충돌!', 1.2);
    }

    // visuals
    for (const e of car.events) if (e.type === 'pop' || e.type === 'limiter') this.carModel.pop();
    this.carModel.update(dt);
    SHARED.uTime.value += dt;
    let rough = 0;
    for (const w of car.wheels) if (w.contact) rough += w.surface.rough * 0.25;
    this.rig.update(car, dt, rough);
    this.carModel.setView(this.rig.mode);
    camera.updateMatrixWorld();
    this.env.update(camera, car.position, dt);
    this.world.update(camera.position, dt);
    emitFromCar(this.particles, car, dt, quality().particles);
    this.particles.update(dt);
    audio.update(car, dt);
    car.events.length = 0;
    hud.update(dt, run);
    if (this.post) {
      const blur = this.rig.mode === 'bumper' ? 1.2 : this.rig.attached ? 0.8 : 1;
      this.post.render(dt, Math.max(0, Math.min(1, (Math.abs(car.speed) - 22) / 30)) * blur);
    } else renderer.render(this.scene, camera);
    this.adaptResolution(dt);
  }

  adaptResolution(dt) {
    const fps = 1 / Math.max(dt, 1e-3);
    this.fpsAvg += (fps - this.fpsAvg) * Math.min(1, dt * 2);
    if (this.fpsAvg < 40) this.lowFor += dt; else this.lowFor = 0;
    if (this.lowFor > 2.5 && pixelRatio > 0.75) {
      pixelRatio = Math.max(0.75, pixelRatio - 0.15);
      resize();
      this.lowFor = 0;
    }
  }

  onFinish() {
    const run = this.run;
    const total = run.finishTime;
    hud.banner(`FINISH<small>${formatTime(total, 2)}</small>`);
    run.codriver.stop();
    const prev = this.best;
    const isBest = !prev || total < prev.time;
    if (isBest) saveBest(this.meta.id, { time: total, splits: run.splits, date: Date.now() });
    const ref = (run.p.road.length / 1000 / this.meta.refSpeed) * 3600;
    const ratio = total / ref;
    const medal = ratio <= 1 ? 'WRC 페이스' : ratio <= 1.12 ? '골드' : ratio <= 1.3 ? '실버' : ratio <= 1.6 ? '브론즈' : '완주';
    setTimeout(() => {
      if (game !== this) return;
      $('resTitle').textContent = `${this.meta.title} 완주`;
      const avg = (run.p.road.length / Math.max(1, run.time)) * 3.6;
      $('resBody').innerHTML = `
        <div class="facts" style="grid-template-columns:repeat(2,1fr);gap:14px">
          <div class="fact"><b style="font-size:44px">${formatTime(total, 2)}</b><small>최종 기록${run.penalty ? ` (페널티 +${run.penalty}초 포함)` : ''}</small></div>
          <div class="fact"><b style="font-size:44px;color:var(--signal)">${medal}</b><small>목표 ${formatTime(ref, 0)} 대비 ${(ratio * 100).toFixed(0)}%</small></div>
          <div class="fact"><b>${avg.toFixed(1)}</b><small>평균 속도 km/h</small></div>
          <div class="fact"><b>${(run.topSpeed * 3.6).toFixed(0)}</b><small>최고 속도 km/h</small></div>
          <div class="fact"><b>${run.resets}</b><small>복귀 횟수</small></div>
          <div class="fact"><b>${isBest ? '신기록' : formatTime(prev.time, 2)}</b><small>${isBest ? (prev ? `이전 ${formatTime(prev.time, 2)}` : '첫 완주') : '개인 베스트'}</small></div>
        </div>
        <p class="note">목표 시간은 Rally2 차량의 이 노면 평균 속도(${this.meta.refSpeed} km/h)로 계산한 추정치입니다.</p>`;
      $('results').hidden = false;
    }, 2600);
  }

  dispose() {
    this.run.codriver.stop();
    this.disposeView();
  }
}

async function startStage(meta) {
  audio.start(); // inside the click gesture (iOS)
  if (settings.steering === 'tilt') {
    controls.enableTilt().then((ok) => {
      if (!ok) { settings.steering = 'slide'; updateSteerHint(); hud.toast('기울기 센서를 쓸 수 없어 슬라이드 조향으로 바꿨습니다', 3); }
    });
  }
  try { await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
  $('menu').hidden = true;
  $('loading').hidden = false;
  $('loadError').hidden = true;
  $('loadActions').hidden = true;
  $('loadTitle').textContent = `${meta.flag} ${meta.title}`;
  const prog = (f, text) => { $('loadBar').style.width = `${Math.round(f * 100)}%`; $('loadText').textContent = text; };
  try {
    prog(0.02, '실제 도로·고도 데이터를 내려받는 중');
    const stage = await getStage(meta.id);
    const prepared = await prepareStageAsync(stage, (f, t) => prog(0.1 + f * 0.85, t));
    if (game) { game.dispose(); game = null; }
    game = new Game(prepared, meta);
    prog(1, '출발선으로');
    await new Promise((r) => setTimeout(r, 50));
    $('loading').hidden = true;
    $('hud').hidden = false;
    $('touch').hidden = false;
    controls.recenterTilt();
    resize();
  } catch (e) {
    console.error(e);
    $('loadError').textContent = `스테이지를 준비하지 못했습니다.\n${e.message}`;
    $('loadError').hidden = false;
    $('loadActions').hidden = false;
  }
}

function toMenu() {
  if (game) { game.dispose(); game = null; }
  controls.releaseAll();
  ['hud', 'touch', 'pause', 'results', 'loading'].forEach((id) => ($(id).hidden = true));
  $('menu').hidden = false;
  buildMenu();
  audio.suspend();
}

function pause(on) {
  if (!game) return;
  if (on && !$('results').hidden) return;
  game.paused = on;
  $('pause').hidden = !on;
  if (on) {
    const r = game.run;
    $('pauseInfo').textContent = `${game.meta.title} · ${formatTime(r.time)} · 진행 ${(Math.min(1, r.maxS / r.finishS) * 100).toFixed(0)}%`;
    audio.suspend();
    speechSynthesis?.cancel?.();
    controls.releaseAll();
  } else audio.resume();
}

$('btnPause').addEventListener('click', () => pause(true));
$('btnResume').addEventListener('click', () => pause(false));
$('btnRestart').addEventListener('click', () => {
  if (!game) return;
  $('pause').hidden = true;
  $('results').hidden = true;
  game.run.restart();
  game.lastLights = -1;
  game.rig.initialized = false;
  game.paused = false;
  hud.setStage(game.run, game.best);
  audio.resume();
});
$('btnQuit').addEventListener('click', toMenu);
$('btnPauseSettings').addEventListener('click', () => { $('pause').hidden = true; openSettings(true); });
$('btnResMenu').addEventListener('click', toMenu);
$('btnResRetry').addEventListener('click', () => {
  $('results').hidden = true;
  game.best = loadBest(game.meta.id);
  $('btnRestart').click();
});
$('btnLoadBack').addEventListener('click', toMenu);
$('btnReset').addEventListener('click', () => game?.run.resetToRoad());
$('btnCam').addEventListener('click', () => {
  if (!game) return;
  settings.camera = game.rig.cycle();
  saveSettings(settings);
  game.carModel.setView(game.rig.mode);
  $('btnCam').textContent = game.rig.label;
});
controls.on('reset', () => game?.run.resetToRoad());
controls.on('camera', () => $('btnCam').click());
controls.on('pause', () => game && pause(!game.paused));
controls.on('shiftUp', () => game?.run.car.shift(1));
controls.on('shiftDown', () => game?.run.car.shift(-1));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

// ---------------------------------------------------------------------- loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game && !game.paused) game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

buildMenu();
bindSettings();
window.__game = () => game; // handy for debugging in the console
window.__controls = controls;
window.__renderer = renderer;
window.__camera = camera;
