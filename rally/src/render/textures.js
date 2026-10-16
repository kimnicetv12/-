// Procedural canvas textures (no image assets needed).
import * as THREE from 'three';
import { rng } from '../world/scenery.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function noiseFill(ctx, w, h, base, amp, rand, size = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      const n = (rand() - 0.5) * amp;
      for (let yy = 0; yy < size; yy++) {
        for (let xx = 0; xx < size; xx++) {
          const k = ((y + yy) * w + (x + xx)) * 4;
          d[k] = Math.max(0, Math.min(255, base[0] + n));
          d[k + 1] = Math.max(0, Math.min(255, base[1] + n));
          d[k + 2] = Math.max(0, Math.min(255, base[2] + n));
          d[k + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function speckle(ctx, w, h, count, colors, rand, rMin = 0.5, rMax = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const r = rMin + rand() * (rMax - rMin);
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, r, r * (0.6 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function finish(c, repeatAlong = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = repeatAlong ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Road surface texture: u across the road (0..1), v along it. */
export function roadTexture(surface) {
  const W = 256, H = 1024;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rand = rng('road-' + surface);
  if (surface === 'tarmac') {
    noiseFill(ctx, W, H, [70, 70, 72], 26, rand, 2);
    speckle(ctx, W, H, 2500, ['#8a8a8a', '#5a5a5c', '#9a968e'], rand, 0.4, 1.4);
    // patched repairs
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(40,40,42,${0.25 + rand() * 0.25})`;
      ctx.fillRect(rand() * W * 0.7, rand() * H, 30 + rand() * 60, 40 + rand() * 120);
    }
    // rubber lines from previous cars along the racing lines
    for (const u of [0.3, 0.38, 0.62, 0.7]) {
      const grd = ctx.createLinearGradient((u - 0.04) * W, 0, (u + 0.04) * W, 0);
      grd.addColorStop(0, 'rgba(20,20,20,0)');
      grd.addColorStop(0.5, 'rgba(20,20,20,0.35)');
      grd.addColorStop(1, 'rgba(20,20,20,0)');
      ctx.fillStyle = grd;
      ctx.fillRect((u - 0.04) * W, 0, 0.08 * W, H);
    }
    // worn white edge lines
    ctx.fillStyle = 'rgba(235,235,225,0.75)';
    ctx.fillRect(W * 0.035, 0, W * 0.025, H);
    ctx.fillRect(W * 0.94, 0, W * 0.025, H);
    // dashed centre line, faded
    ctx.fillStyle = 'rgba(235,235,225,0.4)';
    for (let y = 0; y < H; y += 256) ctx.fillRect(W * 0.494, y, W * 0.012, 100);
  } else if (surface === 'gravel') {
    noiseFill(ctx, W, H, [150, 128, 98], 40, rand, 2);
    speckle(ctx, W, H, 6000, ['#c9b590', '#7d6a50', '#a49070', '#5e5242', '#d8cbb0'], rand, 0.5, 2.2);
    // two compacted wheel tracks
    for (const u of [0.28, 0.72]) {
      const grd = ctx.createLinearGradient((u - 0.12) * W, 0, (u + 0.12) * W, 0);
      grd.addColorStop(0, 'rgba(95,80,60,0)');
      grd.addColorStop(0.5, 'rgba(95,80,60,0.55)');
      grd.addColorStop(1, 'rgba(95,80,60,0)');
      ctx.fillStyle = grd;
      ctx.fillRect((u - 0.12) * W, 0, 0.24 * W, H);
    }
    // loose stones on the crown and edges
    ctx.globalAlpha = 0.6;
    speckle(ctx, W * 0.12, H, 900, ['#d9ccb0', '#bba98a'], rand, 0.8, 2.6);
    ctx.translate(W * 0.44, 0);
    speckle(ctx, W * 0.12, H, 600, ['#d9ccb0', '#bba98a'], rand, 0.8, 2.6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(W * 0.88, 0);
    speckle(ctx, W * 0.12, H, 900, ['#d9ccb0', '#bba98a'], rand, 0.8, 2.6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    noiseFill(ctx, W, H, [212, 220, 231], 16, rand, 2);
    speckle(ctx, W, H, 1500, ['#f4f7fb', '#c9d3df', '#b9c5d3'], rand, 1, 3);
    // polished icy ruts with gravel showing through
    for (const u of [0.28, 0.72]) {
      const grd = ctx.createLinearGradient((u - 0.11) * W, 0, (u + 0.11) * W, 0);
      grd.addColorStop(0, 'rgba(150,165,185,0)');
      grd.addColorStop(0.5, 'rgba(120,136,158,0.75)');
      grd.addColorStop(1, 'rgba(150,165,185,0)');
      ctx.fillStyle = grd;
      ctx.fillRect((u - 0.11) * W, 0, 0.22 * W, H);
      ctx.save();
      ctx.beginPath();
      ctx.rect((u - 0.07) * W, 0, 0.14 * W, H);
      ctx.clip();
      speckle(ctx, W, H, 700, ['#7a7068', '#8f8577', '#a39a8d'], rand, 0.4, 1.4);
      ctx.restore();
    }
  }
  return finish(c);
}

/** Tileable ground detail (greyscale, multiplied with vertex colours). */
export function groundDetailTexture(kind) {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const rand = rng('ground-' + kind);
  if (kind === 'snow') {
    noiseFill(ctx, S, S, [236, 236, 236], 16, rand, 2);
    speckle(ctx, S, S, 500, ['#ffffff', '#e2e2e2'], rand, 1, 4);
  } else {
    noiseFill(ctx, S, S, [205, 205, 205], 50, rand, 2);
    speckle(ctx, S, S, 1800, ['#ffffff', '#9a9a9a', '#e8e8e8', '#7a7a7a'], rand, 0.6, 3.5);
  }
  return finish(c, true, 4);
}

export function stoneTexture() {
  const W = 256, H = 64;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rand = rng('stone');
  noiseFill(ctx, W, H, [150, 146, 136], 30, rand, 2);
  ctx.strokeStyle = 'rgba(60,58,52,0.7)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 3; row++) {
    let x = rand() * -20;
    while (x < W) {
      const w = 22 + rand() * 30;
      ctx.strokeRect(x, row * 21 + 1, w, 20);
      x += w;
    }
  }
  return finish(c, true, 4);
}

/** Banner for the start / finish gantry. */
export function bannerTexture(text, sub, color) {
  const c = canvas(1024, 192);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 192);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 150, 1024, 42);
  ctx.font = 'bold 110px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 78);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(sub, 512, 172);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Car livery for the extruded body sides (shape coordinates in metres). */
export function liveryTexture(scheme) {
  const W = 1024, H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  // the texture covers x in [-2.1, 2.1] (length) and y in [0, 1.45] (height)
  ctx.fillStyle = scheme.base;
  ctx.fillRect(0, 0, W, H);
  // sweeping stripes
  ctx.fillStyle = scheme.a;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72);
  ctx.bezierCurveTo(W * 0.35, H * 0.55, W * 0.6, H * 0.95, W, H * 0.62);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.fillStyle = scheme.b;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.82);
  ctx.bezierCurveTo(W * 0.35, H * 0.66, W * 0.6, H * 1.02, W, H * 0.74);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  // door number
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(W * 0.53, H * 0.52, 62, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(scheme.number, W * 0.53, H * 0.53);
  // sponsor-free decals
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('RALLY2', W * 0.3, H * 0.5);
  ctx.fillText('4WD', W * 0.77, H * 0.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function softDotTexture() {
  const S = 64;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  return t;
}
