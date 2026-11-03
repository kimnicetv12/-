// Procedural, tileable textures (height noise -> albedo detail / normal /
// roughness maps) generated at load time, so the game ships no image assets.
import * as THREE from 'three';
import { rng } from '../world/scenery.js';

/** Periodic value-noise fBm on a size×size torus. Returns Float32Array 0..1. */
export function fbm(size, { seed = 'n', octaves = 5, base = 4, gain = 0.5, ridged = false, warp = 0 } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    const L = (x, y) => lat[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let fx = (x / size) * cells, fy = (y / size) * cells;
        if (warp) {
          fx += Math.sin((y / size) * Math.PI * 2 * 3) * warp;
          fy += Math.cos((x / size) * Math.PI * 2 * 3) * warp;
        }
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = L(ix, iy), b = L(ix + 1, iy), c = L(ix, iy + 1), d = L(ix + 1, iy + 1);
        let v = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
        if (ridged) v = 1 - Math.abs(v * 2 - 1);
        out[y * size + x] += v * amp;
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export function normalize01(h) {
  let lo = Infinity, hi = -Infinity;
  for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const r = hi - lo || 1;
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / r;
  return h;
}

function canvasFrom(size, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(canvas, srgb = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Greyscale detail texture (0.5 = neutral; shaders multiply by value*2). */
export function detailTexture(h, size, contrast = 1) {
  return tex(canvasFrom(size, (d) => {
    for (let i = 0; i < h.length; i++) {
      const v = Math.max(0, Math.min(255, (0.5 + (h[i] - 0.5) * contrast) * 255));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
  }));
}

/** Tangent-space normal map from a periodic height field. */
export function normalTexture(h, size, strength = 2) {
  return tex(canvasFrom(size, (d) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
        const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
        let nx = -hx * strength, ny = -hy * strength, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const k = (y * size + x) * 4;
        d[k] = (nx * 0.5 + 0.5) * 255;
        d[k + 1] = (ny * 0.5 + 0.5) * 255;
        d[k + 2] = (nz * 0.5 + 0.5) * 255;
        d[k + 3] = 255;
      }
    }
  }));
}

/** Height field from an existing canvas' luminance (for road textures). */
export function heightFromCanvas(canvas, blur = 1) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  for (let b = 0; b < blur; b++) {
    const t = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += out[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      t[y * w + x] = s / 9;
    }
    out = t;
  }
  return { h: out, w, hgt: h };
}

export function normalFromHeight({ h, w, hgt }, strength = 3) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hgt);
  const d = img.data;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const hx = h[y * w + ((x + 1) % w)] - h[y * w + ((x - 1 + w) % w)];
      const hy = h[((y + 1) % hgt) * w + x] - h[((y - 1 + hgt) % hgt) * w + x];
      let nx = -hx * strength, ny = -hy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const k = (y * w + x) * 4;
      d[k] = (nx / l * 0.5 + 0.5) * 255;
      d[k + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[k + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

/** Ground / rock / snow detail sets used by the terrain shader. */
export function terrainTextures(surface) {
  const S = 256;
  const ground = normalize01(fbm(S, { seed: 'ground-' + surface, octaves: 6, base: 4, gain: 0.55 }));
  const pebbles = normalize01(fbm(S, { seed: 'peb-' + surface, octaves: 3, base: 32, gain: 0.5 }));
  for (let i = 0; i < ground.length; i++) ground[i] = ground[i] * 0.7 + pebbles[i] * 0.3;
  const rock = normalize01(fbm(S, { seed: 'rock', octaves: 6, base: 3, gain: 0.6, ridged: true, warp: 0.35 }));
  return {
    ground: detailTexture(ground, S, surface === 'snow' ? 0.35 : 0.9),
    groundN: normalTexture(ground, S, surface === 'snow' ? 3 : 7),
    rock: detailTexture(rock, S, 1.1),
    rockN: normalTexture(rock, S, 9),
  };
}

/** Animated-water normal map. */
export function waterNormal() {
  const S = 256;
  const h = normalize01(fbm(S, { seed: 'water', octaves: 4, base: 6, gain: 0.5 }));
  return normalTexture(h, S, 4);
}
