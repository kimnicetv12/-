// Low-poly tree geometries (vertex coloured) for instancing.
import * as THREE from 'three';

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Concatenate non-indexed geometries that share attributes. */
export function merge(geos, names = ['position', 'normal', 'color']) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, off);
      off += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/** Whiten upward-facing parts (snow on branches). */
function snowCap(geo, amount) {
  const n = geo.attributes.normal, c = geo.attributes.color;
  for (let i = 0; i < n.count; i++) {
    const up = n.getY(i);
    if (up > 0.25) {
      const t = Math.min(1, (up - 0.25) * 2.2) * amount;
      c.setXYZ(i, c.getX(i) + (0.95 - c.getX(i)) * t, c.getY(i) + (0.97 - c.getY(i)) * t, c.getZ(i) + (1 - c.getZ(i)) * t);
    }
  }
  return geo;
}

function spruce(snow) {
  const parts = [colored(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5).translate(0, 1.1, 0), 0x4a3424)];
  const layers = [[2.6, 4.2, 2.2], [2.0, 3.6, 4.6], [1.35, 3.0, 6.7], [0.7, 2.2, 8.6]];
  for (const [r, h, y] of layers) parts.push(colored(new THREE.ConeGeometry(r, h, 7).translate(0, y, 0), snow ? 0x2c3e30 : 0x1f3a22));
  const g = merge(parts);
  if (snow) snowCap(g, 0.85);
  return g;
}

function pine(snow) {
  const parts = [colored(new THREE.CylinderGeometry(0.16, 0.26, 9, 5).translate(0, 4.5, 0), 0x8a5a3a)];
  parts.push(colored(new THREE.IcosahedronGeometry(2.4, 0).scale(1.2, 0.75, 1.2).translate(0, 9.6, 0), 0x2e4a24));
  parts.push(colored(new THREE.IcosahedronGeometry(1.8, 0).scale(1.2, 0.7, 1.2).translate(0.8, 8.2, 0.4), 0x2a4521));
  const g = merge(parts);
  if (snow) snowCap(g, 0.8);
  return g;
}

function birch() {
  const parts = [colored(new THREE.CylinderGeometry(0.1, 0.16, 7, 5).translate(0, 3.5, 0), 0xe6e2d8)];
  parts.push(colored(new THREE.IcosahedronGeometry(2.0, 0).scale(1, 1.4, 1).translate(0, 7.2, 0), 0x6c9a3a));
  parts.push(colored(new THREE.IcosahedronGeometry(1.4, 0).translate(0.9, 5.6, -0.3), 0x7aa844));
  return merge(parts);
}

function bareBirch() {
  const parts = [colored(new THREE.CylinderGeometry(0.09, 0.15, 7.5, 5).translate(0, 3.75, 0), 0xe8e4dc)];
  parts.push(colored(new THREE.IcosahedronGeometry(1.7, 0).scale(1, 1.5, 1).translate(0, 7.4, 0), 0x5e544c));
  const g = merge(parts);
  return snowCap(g, 0.55);
}

function larch() {
  const parts = [colored(new THREE.CylinderGeometry(0.14, 0.22, 3, 5).translate(0, 1.5, 0), 0x5a4030)];
  parts.push(colored(new THREE.ConeGeometry(2.2, 8.5, 7).translate(0, 6.6, 0), 0x4f6a2a));
  return merge(parts);
}

function broadleaf() {
  const parts = [colored(new THREE.CylinderGeometry(0.16, 0.26, 3.2, 5).translate(0, 1.6, 0), 0x5b4532)];
  parts.push(colored(new THREE.IcosahedronGeometry(2.6, 1).scale(1.1, 0.9, 1.1).translate(0, 4.6, 0), 0x5a6e2c));
  return merge(parts);
}

// ---------------------------------------------------------------- detailed
// Near-camera versions: more segments, organic jitter, darker inner foliage
// and lighter branch tips via vertex colours.

function jitter(geo, seed, amount, keepY = false) {
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 233280 + 49297) % 233280) / 233280);
  const pos = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(k);
    if (!d) seen.set(k, (d = [(rnd() - 0.5) * amount, keepY ? 0 : (rnd() - 0.5) * amount, (rnd() - 0.5) * amount]));
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

function gradientCone(r, h, segs, y, inner, outer, seed) {
  const g = new THREE.ConeGeometry(r, h, segs, 1, false);
  g.translate(0, y, 0);
  const ng = g.toNonIndexed();
  // droop the rim and push tips outwards a little, unevenly
  const pos = ng.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    if (py < y - h / 2 + 0.01) {
      const x = pos.getX(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const f = 1 + 0.16 * Math.sin(ang * 3 + seed) + 0.08 * Math.sin(ang * 7 + seed * 2);
      pos.setXYZ(i, x * f, py - 0.25 * f, z * f);
    }
  }
  ng.computeVertexNormals();
  const n = pos.count;
  const c = new Float32Array(n * 3);
  const ci = new THREE.Color(inner), co = new THREE.Color(outer);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (y + h / 2 - pos.getY(i)) / h)); // 0 at apex, 1 at rim
    const col = ci.clone().lerp(co, t * t);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  ng.deleteAttribute('uv');
  return ng;
}

function blob(r, x, y, z, sx, sy, sz, color, seed, detail = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(x, y, z);
  jitter(g, seed, r * 0.3);
  // soft, rounded shading: normals point out from the crown centre
  const gp = g.attributes.position, gn = g.attributes.normal;
  for (let i = 0; i < gp.count; i++) {
    const nx = (gp.getX(i) - x) / sx, ny = (gp.getY(i) - y) / sy, nz = (gp.getZ(i) - z) / sz;
    const l = Math.hypot(nx, ny, nz) || 1;
    gn.setXYZ(i, nx / l, ny / l, nz / l);
  }
  // darker underside
  const ng = colored(g, color);
  const nrm = ng.attributes.normal, col = ng.attributes.color;
  for (let i = 0; i < nrm.count; i++) {
    const k = 0.72 + 0.28 * (nrm.getY(i) * 0.5 + 0.5);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return ng;
}

function spruceHD(snow) {
  const parts = [colored(new THREE.CylinderGeometry(0.1, 0.24, 3.6, 7).translate(0, 1.8, 0), 0x4a3a2c)];
  const tiers = 7;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const r = 0.45 + 2.6 * Math.pow(1 - f, 0.95);
    const h = 2.9 - f * 0.9;
    const y = 2.4 + f * 8.0 + h / 2;
    parts.push(gradientCone(r, h, 11, y, snow ? 0x1c2c22 : 0x14281a, snow ? 0x3a5444 : 0x2f5530, t * 1.7));
  }
  const g = merge(parts);
  if (snow) snowCap(g, 0.9);
  return g;
}

function pineHD(snow) {
  const parts = [colored(new THREE.CylinderGeometry(0.13, 0.28, 10.5, 7).translate(0, 5.25, 0), 0x9a6040)];
  // a few bare branch stubs
  for (let k = 0; k < 4; k++) {
    const br = new THREE.CylinderGeometry(0.04, 0.07, 1.6, 4).rotateZ(1.1).rotateY(k * 1.7).translate(Math.cos(k * 1.7) * 0.5, 7.2 + k * 0.6, -Math.sin(k * 1.7) * 0.5);
    parts.push(colored(br, 0x6a4430));
  }
  const crown = [[0, 10.4, 0, 2.2], [1.3, 9.6, 0.6, 1.6], [-1.1, 9.8, -0.7, 1.7], [0.4, 9.1, -1.3, 1.4], [-0.5, 11.3, 0.4, 1.3], [0.9, 8.6, 1.0, 1.2]];
  crown.forEach(([x, y, z, r], k) => parts.push(blob(r, x, y, z, 1.25, 0.72, 1.25, k % 2 ? 0x2c4a22 : 0x35562a, k + 3)));
  const g = merge(parts);
  if (snow) snowCap(g, 0.85);
  return g;
}

function birchHD() {
  const trunk = colored(new THREE.CylinderGeometry(0.09, 0.16, 8, 7, 8).translate(0, 4, 0), 0xe9e5dc);
  const pos = trunk.attributes.position, col = trunk.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.sin(y * 7.3) > 0.72 || y < 0.4) col.setXYZ(i, 0.12, 0.11, 0.1);
  }
  const parts = [trunk];
  const crown = [[0, 7.6, 0, 1.9], [0.9, 6.4, 0.4, 1.4], [-0.8, 6.8, -0.5, 1.4], [0.2, 8.6, 0.3, 1.2]];
  crown.forEach(([x, y, z, r], k) => parts.push(blob(r, x, y, z, 1, 1.3, 1, k % 2 ? 0x6f9c3c : 0x82ad48, k + 11)));
  return merge(parts);
}

function bareBirchHD() {
  const trunk = colored(new THREE.CylinderGeometry(0.08, 0.15, 8, 7, 8).translate(0, 4, 0), 0xe9e5dc);
  const pos = trunk.attributes.position, col = trunk.attributes.color;
  for (let i = 0; i < pos.count; i++) if (Math.sin(pos.getY(i) * 7.3) > 0.72) col.setXYZ(i, 0.12, 0.11, 0.1);
  const parts = [trunk];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4;
    const br = new THREE.CylinderGeometry(0.015, 0.05, 2.4, 4).rotateZ(0.7 + (k % 3) * 0.15).rotateY(a).translate(Math.cos(a) * 0.6, 5 + (k % 5) * 0.7, -Math.sin(a) * 0.6);
    parts.push(colored(br, 0x4e463f));
  }
  const g = merge(parts);
  return snowCap(g, 0.6);
}

function larchHD() {
  const parts = [colored(new THREE.CylinderGeometry(0.12, 0.24, 4, 7).translate(0, 2, 0), 0x5a4030)];
  for (let t = 0; t < 4; t++) {
    const f = t / 4;
    parts.push(gradientCone(2.3 * (1 - f) + 0.4, 3.4, 10, 3.6 + f * 6 + 1.7, 0x3a4f20, 0x6a8a36, t * 2.1));
  }
  return merge(parts);
}

function broadleafHD() {
  const parts = [colored(new THREE.CylinderGeometry(0.14, 0.28, 3.6, 7).translate(0, 1.8, 0), 0x5b4532)];
  const crown = [[0, 4.8, 0, 2.3], [1.4, 4.2, 0.5, 1.6], [-1.2, 4.4, -0.6, 1.7], [0.3, 5.9, 0.2, 1.5], [-0.4, 3.9, 1.2, 1.4]];
  crown.forEach(([x, y, z, r], k) => parts.push(blob(r, x, y, z, 1.1, 0.9, 1.1, k % 2 ? 0x56692a : 0x667c33, k + 21)));
  return merge(parts);
}

export function treeGeometriesHD() {
  return {
    spruce: spruceHD(false),
    snowspruce: spruceHD(true),
    pine: pineHD(false),
    snowpine: pineHD(true),
    birch: birchHD(),
    birchbare: bareBirchHD(),
    larch: larchHD(),
    broadleaf: broadleafHD(),
  };
}

export function treeGeometries() {
  return {
    spruce: spruce(false),
    snowspruce: spruce(true),
    pine: pine(false),
    snowpine: pine(true),
    birch: birch(),
    birchbare: bareBirch(),
    larch: larch(),
    broadleaf: broadleaf(),
  };
}

export { colored };
