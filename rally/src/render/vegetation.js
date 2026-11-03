// Road-side ground cover: wind-blown grass tufts, verge rocks and soft
// contact shadows under trees. All instanced and chunked along the road so
// only the part near the camera is drawn.
import * as THREE from 'three';
import { rng } from '../world/scenery.js';
import { foliage, atmosphere } from './materials.js';

const GRASS = {
  tarmac: { colors: [0xb8a764, 0x9c9c55, 0xc4b27a, 0x8a8f4e], density: 0.55, rocks: 0.06 },
  gravel: { colors: [0x5f8f3a, 0x6f9a40, 0x86a24a, 0x52803a], density: 1, rocks: 0.035 },
  snow: { colors: [], density: 0, rocks: 0.015 },
};

function grassTexture() {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng('grass-blades');
  for (let i = 0; i < 70; i++) {
    const x = 6 + rand() * (W - 12);
    const h = H * (0.45 + rand() * 0.55);
    const lean = (rand() - 0.5) * 30;
    const w = 2 + rand() * 3;
    const shade = 150 + rand() * 105;
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath();
    g.moveTo(x - w, H);
    g.quadraticCurveTo(x + lean * 0.3, H - h * 0.5, x + lean, H - h);
    g.quadraticCurveTo(x + lean * 0.3 + w * 0.3, H - h * 0.5, x + w, H);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tuftGeometry() {
  const geos = [];
  for (let k = 0; k < 3; k++) {
    // both faces as separate front-facing triangles so the back isn't lit
    // with a flipped (downward) normal
    for (const flip of [0, Math.PI]) {
      const q = new THREE.PlaneGeometry(0.9, 0.55, 1, 1).translate(0, 0.275, 0).rotateY((k * Math.PI) / 3 + flip);
      geos.push(q.toNonIndexed());
    }
  }
  const n = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    P.set(g.attributes.position.array, o * 3);
    U.set(g.attributes.uv.array, o * 2);
    for (let i = 0; i < g.attributes.position.count; i++) N[(o + i) * 3 + 1] = 1; // lit like the ground
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const pos = g.attributes.position;
  const seen = new Map();
  let a = 7;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let f = seen.get(k);
    if (f === undefined) seen.set(k, (f = 0.75 + rnd() * 0.45));
    pos.setXYZ(i, pos.getX(i) * f, Math.max(-0.15, pos.getY(i) * f * 0.7), pos.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

function shadowTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export class GroundCover {
  constructor(prepared, group, quality) {
    this.p = prepared;
    this.group = group;
    this.quality = quality;
    this.chunks = [];
    this.disposables = [];
    const { stage } = prepared;
    const cfg = GRASS[stage.surface];
    const CH = 200;
    const rand = rng('cover-' + stage.id);
    const { road, terrain, surface, scenery } = prepared;
    const g = {};
    const proj = {};
    const hw = road.halfWidth, sh = surface.sh;
    const buckets = new Map();
    const bucket = (s) => {
      const key = Math.floor(s / CH);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { grass: [], rocks: [], shadows: [] }));
      return b;
    };
    const density = cfg.density * quality.grass;
    for (let i = 0; i < road.n; i++) {
      const s = i * road.step;
      for (const side of [-1, 1]) {
        let n = density * 2.2;
        while (n > 0) {
          if (rand() > n) break;
          n -= 1;
          const d = hw + 0.5 + Math.pow(rand(), 1.4) * (sh + 13);
          const along = (rand() - 0.5) * road.step;
          const x = road.x[i] - road.tz[i] * d * side + road.tx[i] * along;
          const z = road.z[i] + road.tx[i] * d * side + road.tz[i] * along;
          if (road.project(x, z, proj, hw + 0.4)) continue;
          if (surface.water.find(x, z)) continue;
          terrain.ground.query(x, z, g);
          if (g.ny < 0.7) continue;
          bucket(s).grass.push([x, g.y, z, 0.6 + rand() * 0.9, rand() * 6.3, rand()]);
        }
        if (rand() < cfg.rocks * quality.grass * 4) {
          const d = hw + 0.6 + rand() * (sh + 8);
          const x = road.x[i] - road.tz[i] * d * side, z = road.z[i] + road.tx[i] * d * side;
          if (!road.project(x, z, proj, hw + 0.5)) {
            terrain.ground.query(x, z, g);
            bucket(s).rocks.push([x, g.y, z, 0.25 + Math.pow(rand(), 2) * 0.9, rand() * 6.3, g.nx, g.ny, g.nz]);
          }
        }
      }
    }
    if (quality.blobShadows) {
      for (const t of scenery.trees) {
        if (!road.project(t.x, t.z, proj, 260)) continue;
        terrain.ground.query(t.x, t.z, g);
        bucket(proj.s).shadows.push([t.x, g.y, t.z, 2.2 * t.s, g.nx, g.ny, g.nz]);
      }
    }

    // materials / geometry
    const gTex = grassTexture();
    const grassGeo = tuftGeometry();
    const grassMat = foliage(new THREE.MeshStandardMaterial({ map: gTex, alphaTest: 0.42, roughness: 0.92 }), { sway: 0.22, from: 0.05, key: 'grass' });
    grassMat.userData.envScale = 0.2;
    const rockGeo = rockGeometry();
    const rockMat = atmosphere(new THREE.MeshStandardMaterial({ color: stage.surface === 'snow' ? 0x8c9096 : 0x7c776e, roughness: 0.9, flatShading: true }), 'rock');
    rockMat.userData.envScale = 0.25;
    const sTex = shadowTexture();
    const shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shMat = atmosphere(new THREE.MeshBasicMaterial({ map: sTex, transparent: true, depthWrite: false, opacity: stage.surface === 'snow' ? 0.32 : 0.45, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 'blob');
    this.disposables.push(gTex, grassGeo, grassMat, rockGeo, rockMat, sTex, shGeo, shMat);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), col = new THREE.Color();
    for (const [key, b] of buckets) {
      const grp = new THREE.Group();
      const center = new THREE.Vector3();
      const i = Math.min(road.n - 1, Math.floor(((key + 0.5) * CH) / road.step));
      center.set(road.x[i], road.y[i], road.z[i]);
      if (b.grass.length && cfg.colors.length) {
        const im = new THREE.InstancedMesh(grassGeo, grassMat, b.grass.length);
        b.grass.forEach(([x, y, z, s, r, c], j) => {
          q.setFromAxisAngle(up, r);
          sc.set(s, s * (0.8 + c * 0.5), s);
          m4.compose(pv.set(x, y - 0.03, z), q, sc);
          im.setMatrixAt(j, m4);
          col.setHex(cfg.colors[Math.floor(c * cfg.colors.length)]);
          im.setColorAt(j, col);
        });
        im.frustumCulled = false;
        im.receiveShadow = true;
        grp.add(im);
      }
      if (b.rocks.length) {
        const im = new THREE.InstancedMesh(rockGeo, rockMat, b.rocks.length);
        b.rocks.forEach(([x, y, z, s, r, nx, ny, nz], j) => {
          q.setFromUnitVectors(up, n.set(nx, ny, nz)).multiply(new THREE.Quaternion().setFromAxisAngle(up, r));
          sc.set(s, s, s * 0.8);
          m4.compose(pv.set(x, y, z), q, sc);
          im.setMatrixAt(j, m4);
        });
        im.frustumCulled = false;
        im.castShadow = quality.shadows;
        im.receiveShadow = true;
        grp.add(im);
      }
      if (b.shadows.length) {
        const im = new THREE.InstancedMesh(shGeo, shMat, b.shadows.length);
        b.shadows.forEach(([x, y, z, s, nx, ny, nz], j) => {
          q.setFromUnitVectors(up, n.set(nx, ny, nz));
          sc.set(s, 1, s);
          m4.compose(pv.set(x, y + 0.06, z), q, sc);
          im.setMatrixAt(j, m4);
        });
        im.frustumCulled = false;
        im.renderOrder = 1;
        grp.add(im);
        grp.userData.hasShadows = true;
      }
      this.chunks.push({ grp, center });
      group.add(grp);
    }
  }

  update(camPos) {
    const g2 = this.quality.grassDistance ** 2;
    const s2 = (this.quality.treeDistance * 0.8) ** 2;
    for (const c of this.chunks) {
      const d2 = c.center.distanceToSquared(camPos);
      c.grp.visible = d2 < Math.max(g2, c.grp.userData.hasShadows ? s2 : 0);
      if (c.grp.visible) for (const ch of c.grp.children) ch.visible = ch.material.map && ch.material.transparent ? d2 < s2 : d2 < g2;
    }
  }

  dispose() {
    for (const c of this.chunks) {
      for (const ch of c.grp.children) ch.dispose?.();
      c.grp.parent?.remove(c.grp);
    }
    for (const d of this.disposables) d.dispose();
  }
}
