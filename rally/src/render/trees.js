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
export function merge(geos) {
  const names = ['position', 'normal', 'color'];
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const arr = new Float32Array(total * 3);
    let off = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, off);
      off += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
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
