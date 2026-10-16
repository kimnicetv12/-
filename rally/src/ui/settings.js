// Player settings (persisted per browser when storage is available).

const KEY = 'specialstage.settings.v1';

export function defaultQuality() {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
}

export const DEFAULTS = {
  steering: 'slide',
  sensitivity: 1.0,
  linearity: 1.45,
  autoGear: true,
  counterSteer: false,
  abs: false,
  tcs: false,
  speedSteer: false,
  voice: true,
  brakeBias: 0.62,
  finalOffset: 0,
  springScale: 1,
  rearLsd: 0.4,
  quality: null,
  volume: 0.8,
  camera: 'chase',
};

export function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    s = {};
  }
  const out = { ...DEFAULTS, ...s };
  if (!out.quality) out.quality = defaultQuality();
  return out;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: keep settings for this session only */
  }
}

export const QUALITY = {
  low: {
    pixelRatio: 1, shadows: false, treeShadows: false, shadowMap: 512, shadowRange: 45, trees: 0.5, treeDistance: 600, treeDetail: 0,
    fogScale: 0.75, particles: 0.5, grass: 0, grassDistance: 0, blobShadows: false, post: false, bloom: false, aa: null, lensFlare: false,
  },
  medium: {
    pixelRatio: 1.25, shadows: true, treeShadows: false, shadowMap: 1024, shadowRange: 42, trees: 0.8, treeDistance: 900, treeDetail: 130,
    fogScale: 0.9, particles: 0.8, grass: 0.55, grassDistance: 110, blobShadows: true, post: true, bloom: true, aa: 'fxaa', lensFlare: false,
  },
  high: {
    pixelRatio: 1.6, shadows: true, treeShadows: true, shadowMap: 2048, shadowRange: 48, trees: 1, treeDistance: 1300, treeDetail: 230,
    fogScale: 1, particles: 1, grass: 0.9, grassDistance: 170, blobShadows: true, post: true, bloom: true, aa: 'smaa', lensFlare: true,
  },
  ultra: {
    pixelRatio: 2, shadows: true, treeShadows: true, shadowMap: 4096, shadowRange: 60, trees: 1, treeDistance: 1900, treeDetail: 400,
    fogScale: 1.15, particles: 1, grass: 1.35, grassDistance: 250, blobShadows: true, post: true, bloom: true, aa: 'smaa', lensFlare: true,
  },
};

export function loadBest(id) {
  try {
    return JSON.parse(localStorage.getItem('specialstage.best.' + id) || 'null');
  } catch {
    return null;
  }
}

export function saveBest(id, rec) {
  try {
    localStorage.setItem('specialstage.best.' + id, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
}

export function formatTime(t, digits = 1) {
  if (!Number.isFinite(t)) return '–:––.–';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(digits).padStart(digits ? 3 + digits : 2, '0');
  return `${m}:${ss}`;
}
