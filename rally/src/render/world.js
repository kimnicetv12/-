// Builds three.js meshes for a prepared stage.
import * as THREE from 'three';
import { KIND, PolygonSet } from '../world/terrain.js';
import { rng } from '../world/scenery.js';
import { roadTexture, stoneTexture, bannerTexture } from './textures.js';
import { treeGeometries, treeGeometriesHD, colored, merge } from './trees.js';
import { terrainTextures, waterNormal } from './proc.js';
import { terrainMaterial, atmosphere, foliage } from './materials.js';
import { GroundCover } from './vegetation.js';

const PALETTE = {
  tarmac: {
    grass: [0.4, 0.42, 0.25], forest: [0.22, 0.29, 0.16], rock: [0.5, 0.48, 0.45], shoulder: [0.46, 0.42, 0.36],
    slope: [0.48, 0.44, 0.36], snow: [0.9, 0.92, 0.95], snowLine: 1380, lakebed: [0.2, 0.25, 0.25],
  },
  gravel: {
    grass: [0.33, 0.44, 0.2], forest: [0.2, 0.3, 0.15], rock: [0.5, 0.5, 0.47], shoulder: [0.56, 0.48, 0.37],
    slope: [0.42, 0.4, 0.3], snow: null, snowLine: 1e9, lakebed: [0.18, 0.22, 0.2],
  },
  snow: {
    grass: [0.93, 0.95, 0.98], forest: [0.86, 0.89, 0.93], rock: [0.72, 0.74, 0.78], shoulder: [0.94, 0.96, 0.99],
    slope: [0.92, 0.94, 0.97], snow: null, snowLine: 1e9, lakebed: [0.85, 0.9, 0.95],
  },
};

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function hash(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function vertexNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

export class WorldView {
  constructor(prepared, scene, quality) {
    this.p = prepared;
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.treeChunks = [];
    this.disposables = [];
    const st = prepared.stage;
    this.palette = PALETTE[st.surface];
    this.buildTerrain();
    this.buildRoad();
    this.buildIce();
    this.buildTrees();
    this.cover = new GroundCover(prepared, this.group, quality);
    this.buildWalls();
    this.buildPoles();
    this.buildBuildings();
    this.buildWater();
    this.buildGantries();
    this.buildCrowds();
  }

  add(obj) {
    this.group.add(obj);
    return obj;
  }

  // ------------------------------------------------------------------ terrain
  buildTerrain() {
    const { terrain, stage } = this.p;
    const pos = terrain.positions;
    const idx = terrain.indices;
    const nrm = vertexNormals(pos, idx);
    const pal = this.palette;
    const forests = new PolygonSet(stage.forest.map((p) => ({ pts: p })));
    const nv = pos.length / 3;
    const col = new Float32Array(nv * 3);
    const defaultForest = stage.surface !== 'tarmac';
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const ny = nrm[i * 3 + 1];
      const k = terrain.kinds[i];
      const h = hash(x, z);
      let c;
      if (k <= KIND.SHOULDER) c = pal.shoulder;
      else if (k === KIND.LAKEBED) c = pal.lakebed;
      else {
        const inForest = defaultForest ? h > 0.12 : forests.find(x, z) !== null;
        c = inForest ? pal.forest : pal.grass;
        if (k === KIND.SLOPE) c = lerp3(pal.slope, c, 0.35);
        if (ny < 0.82) c = lerp3(c, pal.rock, Math.min(1, (0.82 - ny) * 4));
        if (pal.snow && y > pal.snowLine + (h - 0.5) * 160) c = lerp3(c, pal.snow, Math.min(1, (y - pal.snowLine) / 120 + 0.4));
      }
      const v = 0.9 + h * 0.2;
      col[i * 3] = c[0] * v; col[i * 3 + 1] = c[1] * v; col[i * 3 + 2] = c[2] * v;
    }
    const tex = terrainTextures(stage.surface);
    const mat = terrainMaterial(tex, { snow: stage.surface === 'snow' });
    this.disposables.push(mat, ...Object.values(tex));

    // chunk by triangle centroid
    // small triangles (near the road) in 700 m chunks for culling; the big
    // distant DEM triangles in 4 km chunks to keep draw calls low
    const chunks = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      const ext = Math.max(Math.abs(pos[a] - pos[b]), Math.abs(pos[a] - pos[c]), Math.abs(pos[a + 2] - pos[b + 2]), Math.abs(pos[a + 2] - pos[c + 2]));
      const far = ext > 60;
      const CH = far ? 4000 : 700;
      const key = (far ? 'f' : 'n') + Math.floor(cx / CH) + ',' + Math.floor(cz / CH);
      let list = chunks.get(key);
      if (!list) chunks.set(key, (list = []));
      list.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const remap = new Int32Array(nv).fill(-1);
    for (const list of chunks.values()) {
      const used = [];
      for (const v of list) if (remap[v] < 0) { remap[v] = used.length; used.push(v); }
      const P = new Float32Array(used.length * 3), N = new Float32Array(used.length * 3), C = new Float32Array(used.length * 3), U = new Float32Array(used.length * 2);
      used.forEach((v, j) => {
        P.set(pos.subarray(v * 3, v * 3 + 3), j * 3);
        N.set(nrm.subarray(v * 3, v * 3 + 3), j * 3);
        C.set(col.subarray(v * 3, v * 3 + 3), j * 3);
        U[j * 2] = pos[v * 3] / 7;
        U[j * 2 + 1] = pos[v * 3 + 2] / 7;
      });
      const I = new Uint32Array(list.length);
      for (let k = 0; k < list.length; k++) I[k] = remap[list[k]];
      for (const v of used) remap[v] = -1;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      g.setIndex(new THREE.BufferAttribute(I, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.add(m);
      this.disposables.push(g);
    }
  }

  // --------------------------------------------------------------------- road
  ribbon(i0, i1, u0, u1, lift, vScale, cols = 2) {
    const { road, surface } = this.p;
    const hw = road.halfWidth;
    const n = i1 - i0 + 1;
    const across = cols + 1;
    const P = new Float32Array(n * across * 3), U = new Float32Array(n * across * 2), N = new Float32Array(n * across * 3);
    for (let k = 0; k < n; k++) {
      const i = i0 + k;
      const rx = -road.tz[i], rz = road.tx[i];
      for (let j = 0; j < across; j++) {
        const u = u0 + ((u1 - u0) * j) / cols;
        const o = (k * across + j) * 3;
        P[o] = road.x[i] + rx * u;
        P[o + 1] = surface.profile(road.y[i], Math.abs(u)) + lift;
        P[o + 2] = road.z[i] + rz * u;
        U[(k * across + j) * 2] = (u + hw) / (2 * hw);
        U[(k * across + j) * 2 + 1] = (i * road.step) / vScale;
        N[o + 1] = 1;
      }
    }
    const I = [];
    for (let k = 0; k < n - 1; k++) {
      for (let j = 0; j < cols; j++) {
        const a = k * across + j, b = a + 1, c = a + across, d = c + 1;
        I.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  buildRoad() {
    const { road, stage } = this.p;
    const tex = roadTexture(stage.surface);
    const mat = atmosphere(new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: tex.roughnessMap,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }), 'road');
    mat.userData.envScale = stage.surface === 'snow' ? 0.5 : 0.3;
    this.disposables.push(tex.map, tex.normalMap, tex.roughnessMap, mat);
    const hw = road.halfWidth;
    const step = 250;
    for (let i0 = 0; i0 < road.n - 1; i0 += step) {
      const i1 = Math.min(road.n - 1, i0 + step);
      const g = this.ribbon(i0, i1, -hw, hw, 0.015, 14);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.add(m);
      this.disposables.push(g);
    }
  }

  buildIce() {
    const { road, scenery } = this.p;
    if (!scenery.ice.length) return;
    const mat = atmosphere(new THREE.MeshStandardMaterial({ color: 0xdfe9f3, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 'ice');
    mat.userData.envScale = 1.2;
    this.disposables.push(mat);
    for (const z of scenery.ice) {
      const i0 = Math.floor(z.s0 / road.step), i1 = Math.min(road.n - 1, Math.ceil(z.s1 / road.step));
      const g = this.ribbon(i0, i1, z.u0, z.u1, 0.03, 6, 1);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.add(m);
      this.disposables.push(g);
    }
  }

  // -------------------------------------------------------------------- trees
  buildTrees() {
    const { scenery, road } = this.p;
    const low = treeGeometries();
    const hd = treeGeometriesHD();
    const mat = foliage(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), { sway: 0.012, from: 3, key: 'tree' });
    mat.userData.envScale = 0.2;
    this.disposables.push(mat, ...Object.values(low), ...Object.values(hd));
    const density = this.quality.trees;
    const CH = 300;
    const buckets = new Map();
    const proj = {};
    let k = 0;
    for (const t of scenery.trees) {
      if (density < 1 && (k++ % 10) / 10 >= density) continue;
      road.project(t.x, t.z, proj, 250);
      const key = Math.floor((proj.s ?? 0) / CH);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = {}));
      (b[t.type] ||= []).push(t);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const rand = rng('tree-tint');
    for (const [key, b] of buckets) {
      const near = new THREE.Group();
      const far = new THREE.Group();
      const center = new THREE.Vector3();
      let cnt = 0;
      for (const [type, list] of Object.entries(b)) {
        const imN = new THREE.InstancedMesh(hd[type], mat, list.length);
        const imF = new THREE.InstancedMesh(low[type], mat, list.length);
        list.forEach((t, j) => {
          q.setFromAxisAngle(up, t.rot);
          s.set(t.s * (0.92 + rand() * 0.16), t.s * (0.9 + rand() * 0.25), t.s * (0.92 + rand() * 0.16));
          p.set(t.x, t.y - 0.3, t.z);
          m4.compose(p, q, s);
          imN.setMatrixAt(j, m4);
          imF.setMatrixAt(j, m4);
          const v = 0.82 + rand() * 0.36;
          col.setRGB(v * (0.95 + rand() * 0.1), v, v * (0.9 + rand() * 0.15));
          imN.setColorAt(j, col);
          imF.setColorAt(j, col);
          center.add(p);
          cnt++;
        });
        imN.castShadow = this.quality.treeShadows;
        imN.receiveShadow = true;
        imN.frustumCulled = imF.frustumCulled = false;
        near.add(imN);
        far.add(imF);
      }
      center.divideScalar(cnt || 1);
      const group = new THREE.Group();
      group.add(near, far);
      this.treeChunks.push({ group, near, far, center, s: key * CH });
      this.add(group);
    }
  }

  // -------------------------------------------------------------------- walls
  buildWalls() {
    const { scenery } = this.p;
    if (!scenery.walls.length) return;
    const tex = stoneTexture();
    const mat = atmosphere(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }), 'wall');
    mat.userData.envScale = 0.3;
    this.disposables.push(tex, mat);
    const P = [], U = [], I = [];
    const H = 0.75, T = 0.45, B = 0.4;
    for (const w of scenery.walls) {
      const pts = w.pts;
      let along = 0;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        let dx = b[0] - a[0], dz = b[2] - a[2];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const nx = -dz * T * 0.5, nz = dx * T * 0.5;
        if (k > 0) along += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][2] - pts[k - 1][2]);
        const [x, y, z] = pts[k];
        const base = P.length / 3;
        // 4 verts: outer-bottom, outer-top, inner-top, inner-bottom
        P.push(x + nx, y - B, z + nz, x + nx, y + H, z + nz, x - nx, y + H, z - nz, x - nx, y - B, z - nz);
        U.push(along / 2, 0, along / 2, 0.6, along / 2, 0.8, along / 2, 0);
        if (k > 0) {
          const p0 = base - 4;
          for (let f = 0; f < 3; f++) {
            const a0 = p0 + f, a1 = p0 + f + 1, b0 = base + f, b1 = base + f + 1;
            I.push(a0, b0, a1, a1, b0, b1);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = this.quality.shadows;
    m.receiveShadow = true;
    mat.side = THREE.DoubleSide;
    this.add(m);
    this.disposables.push(g);
  }

  buildPoles() {
    const { scenery, stage } = this.p;
    if (!scenery.poles.length) return;
    const snow = stage.surface === 'snow';
    const h = snow ? 2.2 : 1.1;
    const parts = [
      colored(new THREE.CylinderGeometry(0.035, 0.035, h * 0.8, 5).translate(0, h * 0.4, 0), snow ? 0xd94a1a : 0xf2f2ee),
      colored(new THREE.CylinderGeometry(0.036, 0.036, h * 0.2, 5).translate(0, h * 0.9, 0), snow ? 0xffffff : 0x1a1a1a),
    ];
    const geo = merge(parts);
    const mat = atmosphere(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 'pole');
    const im = new THREE.InstancedMesh(geo, mat, scenery.poles.length);
    const m4 = new THREE.Matrix4();
    scenery.poles.forEach((p, j) => im.setMatrixAt(j, m4.makeTranslation(p.x, p.y - 0.1, p.z)));
    this.add(im);
    this.disposables.push(geo, mat);
  }

  // ---------------------------------------------------------------- buildings
  buildBuildings() {
    const { scenery, stage } = this.p;
    if (!scenery.houses.length) return;
    const rand = rng('houses-' + stage.id);
    const wallColors = stage.surface === 'tarmac' ? [0xb8ab92, 0xa89a80, 0xc4b9a4, 0x9a8c74] : [0x7a2a1e, 0x8a2f22, 0xbfa95e, 0xd6d1c4, 0x6c241a];
    const roofColor = stage.surface === 'tarmac' ? 0x8e4a30 : stage.surface === 'snow' ? 0xeef2f7 : 0x35383b;
    const geos = [];
    for (const h of scenery.houses) {
      const shape = new THREE.Shape();
      for (let k = 0; k < h.pts.length; k += 2) {
        const x = h.pts[k], y = -h.pts[k + 1];
        if (k === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: h.h, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, h.y, 0);
      const ng = g.index ? g.toNonIndexed() : g;
      if (ng !== g) g.dispose();
      const n = ng.attributes.position.count;
      const c = new Float32Array(n * 3);
      const wall = new THREE.Color(wallColors[Math.floor(rand() * wallColors.length)]);
      const roof = new THREE.Color(roofColor);
      for (let i = 0; i < n; i++) {
        const col = ng.attributes.normal.getY(i) > 0.5 ? roof : wall;
        c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      }
      ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
      ng.deleteAttribute('uv');
      geos.push(ng);
      // hip roof up to the footprint centroid
      let cx = 0, cz = 0, area = 0;
      const np = h.pts.length / 2;
      for (let k = 0; k < h.pts.length; k += 2) { cx += h.pts[k]; cz += h.pts[k + 1]; }
      cx /= np; cz /= np;
      for (let k = 0; k < h.pts.length; k += 2) {
        const k2 = (k + 2) % h.pts.length;
        area += h.pts[k] * h.pts[k2 + 1] - h.pts[k2] * h.pts[k + 1];
      }
      const top = h.y + h.h;
      const apex = top + Math.min(3.2, 0.32 * Math.sqrt(Math.abs(area) / 2) + 0.6);
      const rp = [];
      for (let k = 0; k < h.pts.length; k += 2) {
        const k2 = (k + 2) % h.pts.length;
        // keep the face pointing outwards whatever the ring orientation
        if (area > 0) rp.push(h.pts[k2], top, h.pts[k2 + 1], h.pts[k], top, h.pts[k + 1], cx, apex, cz);
        else rp.push(h.pts[k], top, h.pts[k + 1], h.pts[k2], top, h.pts[k2 + 1], cx, apex, cz);
      }
      const roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      roofGeo.computeVertexNormals();
      const rc = new Float32Array(rp.length);
      for (let i = 0; i < rc.length; i += 3) { rc[i] = roof.r; rc[i + 1] = roof.g; rc[i + 2] = roof.b; }
      roofGeo.setAttribute('color', new THREE.BufferAttribute(rc, 3));
      geos.push(roofGeo);
    }
    const g = merge(geos);
    geos.forEach((x) => x.dispose());
    const mat = atmosphere(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), 'house');
    mat.userData.envScale = 0.35;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = this.quality.shadows;
    m.receiveShadow = true;
    this.add(m);
    this.disposables.push(g, mat);
  }

  buildWater() {
    const { stage } = this.p;
    if (!stage.water.length) return;
    const geos = [];
    for (const w of stage.water) {
      const shape = new THREE.Shape();
      for (let k = 0; k < w.p.length; k += 2) {
        if (k === 0) shape.moveTo(w.p[k], -w.p[k + 1]);
        else shape.lineTo(w.p[k], -w.p[k + 1]);
      }
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      g.translate(0, w.y + 0.05, 0);
      geos.push(g.index ? g.toNonIndexed() : g);
      if (g.index) g.dispose();
    }
    const g = merge(geos, ['position', 'normal', 'uv']);
    geos.forEach((x) => x.dispose());
    const frozen = stage.surface === 'snow';
    this.waterNormal = waterNormal();
    this.waterNormal.repeat.set(1 / 9, 1 / 9);
    this.disposables.push(this.waterNormal);
    const mat = atmosphere(frozen
      ? new THREE.MeshStandardMaterial({ color: 0xe6eef7, roughness: 0.28, metalness: 0, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.15, 0.15) })
      : new THREE.MeshStandardMaterial({ color: 0x1b3440, roughness: 0.04, metalness: 0, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.95 }), 'water');
    mat.userData.envScale = 1.3;
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.add(m);
    this.disposables.push(g, mat);
  }

  // -------------------------------------------------------- start/finish etc.
  gantry(s, text, sub, color) {
    const { road, surface } = this.p;
    const smp = road.sample(s, {});
    const hw = road.halfWidth + 1.2;
    const grp = new THREE.Group();
    const postMat = atmosphere(new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 }), 'post');
    const tex = bannerTexture(text, sub, color);
    const banMat = atmosphere(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), 'banner');
    this.disposables.push(postMat, tex, banMat);
    const rx = -smp.tz, rz = smp.tx;
    const y = surface.profile(smp.y, 0);
    for (const sgn of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 0.3), postMat);
      post.position.set(smp.x + rx * hw * sgn, y + 2.5, smp.z + rz * hw * sgn);
      grp.add(post);
      this.p.env.obstacles.addCircle(post.position.x, post.position.z, 0.25, y - 1, 6, 'post');
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 0.3, (hw * 2 + 0.3) * (192 / 1024)), banMat);
    banner.position.set(smp.x, y + 4.6, smp.z);
    banner.rotation.y = Math.atan2(-smp.tx, -smp.tz);
    grp.add(banner);
    this.add(grp);
  }

  buildGantries() {
    const { road, stage } = this.p;
    this.gantry(12, 'START', `${stage.rally} · ${stage.name}`, '#c8102e');
    this.gantry(road.length - 25, 'FINISH', 'FLYING FINISH — STOP CONTROL 200 m', '#0b3d91');
  }

  buildCrowds() {
    const { road, stage, scenery } = this.p;
    const spots = [{ s: 30, n: 40 }, { s: road.length - 40, n: 50 }];
    for (const lm of stage.landmarks) spots.push({ s: lm.s, n: 160 });
    if (stage.id === 'turini') spots.push({ s: road.length - 120, n: 120 });
    const rand = rng('crowd-' + stage.id);
    const people = [];
    const g = {};
    for (const sp of spots) {
      for (let k = 0; k < sp.n; k++) {
        const s = sp.s + (rand() - 0.5) * 90;
        const smp = road.sample(Math.max(0, Math.min(road.length, s)), {});
        const side = rand() < 0.5 ? -1 : 1;
        const u = (road.halfWidth + 5 + rand() * 9) * side;
        const x = smp.x - smp.tz * u, z = smp.z + smp.tx * u;
        const prj = {};
        if (road.project(x, z, prj, 30) && prj.d < road.halfWidth + 4) continue;
        this.p.terrain.ground.query(x, z, g);
        people.push({ x, y: g.y, z, h: 0.9 + rand() * 0.25, c: rand() });
      }
    }
    if (!people.length) return;
    const body = merge([
      colored(new THREE.CylinderGeometry(0.22, 0.2, 1.1, 6).translate(0, 0.95, 0), 0xffffff),
      colored(new THREE.SphereGeometry(0.13, 6, 4).translate(0, 1.65, 0), 0xe0b090),
      colored(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 5).translate(0, 0.22, 0), 0x223044),
    ]);
    const mat = atmosphere(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 'crowd');
    mat.userData.envScale = 0.3;
    const im = new THREE.InstancedMesh(body, mat, people.length);
    const jackets = [0xd62828, 0xf77f00, 0x1d3557, 0x2a9d8f, 0xe9c46a, 0x6a4c93, 0x111111, 0xfafafa];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    people.forEach((p, j) => {
      m4.makeScale(1, p.h, 1).setPosition(p.x, p.y - 0.05, p.z);
      im.setMatrixAt(j, m4);
      im.setColorAt(j, col.setHex(jackets[Math.floor(p.c * jackets.length)]));
    });
    this.add(im);
    this.disposables.push(body, mat);
    void scenery;
  }

  /** Per-frame: only draw tree chunks near the camera. */
  /** Per-frame: tree LOD / culling, ground cover, water ripples. */
  update(camPos, dt = 0) {
    const r2 = this.quality.treeDistance ** 2;
    const d2n = this.quality.treeDetail ** 2;
    for (const c of this.treeChunks) {
      const d2 = c.center.distanceToSquared(camPos);
      c.group.visible = d2 < r2;
      c.near.visible = d2 < d2n;
      c.far.visible = !c.near.visible;
    }
    this.cover.update(camPos);
    if (this.waterNormal) {
      this.waterNormal.offset.x += dt * 0.012;
      this.waterNormal.offset.y += dt * 0.007;
    }
  }

  dispose() {
    this.cover.dispose();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh && o.geometry && !this.disposables.includes(o.geometry)) o.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose?.();
  }
}
