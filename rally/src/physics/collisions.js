// Static obstacles (tree trunks, posts, stone walls, buildings) and the
// car-vs-obstacle impulse response. The car footprint is an oriented box.

import { Vector3, Quaternion } from 'three';

const CELL = 16;
const HALF_W = 0.9;
const HALF_L = 2.02;

const _n = new Vector3(), _r = new Vector3(), _vp = new Vector3(), _t = new Vector3();
const _a = new Vector3(), _b = new Vector3(), _qi = new Quaternion();

export class Obstacles {
  constructor() {
    this.circles = []; // {x, z, r, y0, h, kind}
    this.segments = []; // {ax, az, bx, bz, t, y0, h, kind}
    this.cells = new Map();
    this.hits = [];
  }

  addCircle(x, z, r, y0, h, kind = 'tree') {
    const o = { type: 0, x, z, r, y0, h, kind };
    this.circles.push(o);
    this.#insert(o, x - r, z - r, x + r, z + r);
  }

  addSegment(ax, az, bx, bz, t, y0, h, kind = 'wall') {
    const o = { type: 1, ax, az, bx, bz, t, y0, h, kind };
    this.segments.push(o);
    this.#insert(o, Math.min(ax, bx) - t, Math.min(az, bz) - t, Math.max(ax, bx) + t, Math.max(az, bz) + t);
  }

  #insert(o, x0, z0, x1, z1) {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const k = cx * 73856093 ^ cz * 19349663;
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(o);
      }
    }
  }

  nearby(x, z, out) {
    out.length = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.cells.get((cx + dx) * 73856093 ^ (cz + dz) * 19349663);
        if (list) for (const o of list) if (!out.includes(o)) out.push(o);
      }
    }
    return out;
  }

  /** Resolve penetrations between the car body and obstacles. */
  collide(car, dt) {
    const p = car.position;
    const q = car.quaternion;
    const f = _a.set(0, 0, -1).applyQuaternion(q);
    let fx = f.x, fz = f.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const rx = -fz, rz = fx;
    const list = this.nearby(p.x, p.z, _list);
    for (const o of list) {
      if (p.y + 1.0 < o.y0 || p.y - 0.45 > o.y0 + o.h) continue;
      if (o.type === 0) {
        const dx = o.x - p.x, dz = o.z - p.z;
        const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
        const qx = Math.max(-HALF_W, Math.min(HALF_W, lx));
        const qz = Math.max(-HALF_L, Math.min(HALF_L, lz));
        let ex = lx - qx, ez = lz - qz;
        let d = Math.hypot(ex, ez);
        let depth, nlx, nlz;
        if (d > 1e-6) {
          if (d >= o.r) continue;
          depth = o.r - d;
          nlx = -ex / d; nlz = -ez / d; // from obstacle towards car
        } else {
          // centre inside the box: push out along the shallowest axis
          const px = HALF_W - Math.abs(lx), pz = HALF_L - Math.abs(lz);
          if (px < pz) { depth = px + o.r; nlx = -Math.sign(lx) || 1; nlz = 0; }
          else { depth = pz + o.r; nlx = 0; nlz = -Math.sign(lz) || 1; }
        }
        const nx = nlx * rx + nlz * fx, nz = nlx * rz + nlz * fz;
        const cpx = p.x + qx * rx + qz * fx, cpz = p.z + qx * rz + qz * fz;
        this.#resolve(car, cpx, cpz, nx, nz, depth, o);
      } else {
        // sample the box outline against the thick segment
        for (const [sx, sz] of OUTLINE) {
          const wx = p.x + sx * rx + sz * fx, wz = p.z + sx * rz + sz * fz;
          const abx = o.bx - o.ax, abz = o.bz - o.az;
          const l2 = abx * abx + abz * abz || 1e-9;
          let t = ((wx - o.ax) * abx + (wz - o.az) * abz) / l2;
          t = Math.max(0, Math.min(1, t));
          const cx = o.ax + abx * t, cz = o.az + abz * t;
          let ex = wx - cx, ez = wz - cz;
          const d = Math.hypot(ex, ez);
          const rad = o.t * 0.5;
          if (d >= rad) continue;
          let nx, nz;
          if (d > 1e-6) { nx = ex / d; nz = ez / d; }
          else { nx = -abz; nz = abx; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
          // make sure the normal points away from the car centre side the
          // point came from (prevents tunnelling flips)
          if ((p.x - cx) * nx + (p.z - cz) * nz < 0 && d < rad * 0.5) { nx = -nx; nz = -nz; }
          this.#resolve(car, wx, wz, nx, nz, rad - d, o);
        }
      }
    }
  }

  #resolve(car, cpx, cpz, nx, nz, depth, o) {
    const p = car.position;
    const v = car.velocity;
    const w = car.angularVelocity;
    _n.set(nx, 0, nz);
    _r.set(cpx - p.x, 0.1, cpz - p.z);
    _vp.copy(w).cross(_r).add(v);
    const vn = _vp.dot(_n);
    // positional correction
    p.addScaledVector(_n, Math.max(0, depth - 0.005) * 0.85);
    if (vn >= 0) return;
    const m = car.mass;
    _qi.copy(car.quaternion).invert();
    const invI = (vec) => {
      const b = _t.copy(vec).applyQuaternion(_qi);
      b.set(b.x / car.I.x, b.y / car.I.y, b.z / car.I.z);
      return b.applyQuaternion(car.quaternion);
    };
    const rn = _a.copy(_r).cross(_n);
    const k = 1 / m + invI(rn).dot(rn);
    const e = o.kind === 'tree' ? 0.12 : 0.2;
    const j = (-(1 + e) * vn) / k;
    // friction
    _b.copy(_vp).addScaledVector(_n, -vn);
    const vt = _b.length();
    const impulse = _a.copy(_n).multiplyScalar(j);
    if (vt > 1e-4) {
      const jt = Math.min(vt / k, 0.45 * j);
      impulse.addScaledVector(_b, -jt / vt);
    }
    v.addScaledVector(impulse, 1 / m);
    w.add(invI(_b.copy(_r).cross(impulse)));
    this.hits.push({ speed: -vn, kind: o.kind });
  }
}

const OUTLINE = [];
for (const sx of [-HALF_W, 0, HALF_W]) for (const sz of [-HALF_L, -HALF_L / 2, 0, HALF_L / 2, HALF_L]) {
  if (sx === 0 && Math.abs(sz) < HALF_L) continue;
  OUTLINE.push([sx, sz]);
}
const _list = [];
