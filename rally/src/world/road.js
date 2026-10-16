// Road centreline model: dense polyline with arc length, tangents, curvature
// and a spatial hash for nearest-point queries.

export class Road {
  /**
   * @param {Float64Array} pts  x,y,z triples, equally spaced by `step` metres
   * @param {number} step
   * @param {number} halfWidth
   */
  constructor(pts, step, halfWidth) {
    const n = pts.length / 3;
    this.n = n;
    this.step = step;
    this.halfWidth = halfWidth;
    this.length = (n - 1) * step;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.z = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = pts[i * 3];
      this.y[i] = pts[i * 3 + 1];
      this.z[i] = pts[i * 3 + 2];
    }
    // Unit tangents (central differences) and signed curvature (+ = right).
    this.tx = new Float64Array(n);
    this.tz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = this.x[b] - this.x[a];
      const dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    const k = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      const fx = this.tx[i - 1], fz = this.tz[i - 1];
      const gx = this.tx[i + 1], gz = this.tz[i + 1];
      const cross = -gx * fz + gz * fx; // g · right(f)
      const dot = gx * fx + gz * fz;
      k[i] = Math.atan2(cross, dot) / (2 * step);
    }
    this.curvature = smooth(k, Math.max(1, Math.round(6 / step)));
    // Grade (dy/ds) and vertical curvature (d2y/ds2), smoothed.
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      g[i] = (this.y[b] - this.y[a]) / ((b - a) * step);
    }
    this.grade = smooth(g, 3);
    const vc = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4);
      vc[i] = (this.grade[b] - this.grade[a]) / ((b - a) * step || 1);
    }
    this.vcurv = smooth(vc, 4);
    this.#buildHash(12);
  }

  #buildHash(cell) {
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minx = Math.min(minx, this.x[i]); maxx = Math.max(maxx, this.x[i]);
      minz = Math.min(minz, this.z[i]); maxz = Math.max(maxz, this.z[i]);
    }
    const pad = 64;
    this.hx0 = minx - pad;
    this.hz0 = minz - pad;
    this.hcell = cell;
    this.hnx = Math.ceil((maxx - minx + 2 * pad) / cell) + 1;
    this.hnz = Math.ceil((maxz - minz + 2 * pad) / cell) + 1;
    const counts = new Int32Array(this.hnx * this.hnz + 1);
    const forEachCell = (i, fn) => {
      const x0 = Math.min(this.x[i], this.x[i + 1]), x1 = Math.max(this.x[i], this.x[i + 1]);
      const z0 = Math.min(this.z[i], this.z[i + 1]), z1 = Math.max(this.z[i], this.z[i + 1]);
      const cx0 = Math.floor((x0 - this.hx0) / cell), cx1 = Math.floor((x1 - this.hx0) / cell);
      const cz0 = Math.floor((z0 - this.hz0) / cell), cz1 = Math.floor((z1 - this.hz0) / cell);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cz * this.hnx + cx);
    };
    for (let i = 0; i < this.n - 1; i++) forEachCell(i, (c) => counts[c + 1]++);
    for (let c = 0; c < this.hnx * this.hnz; c++) counts[c + 1] += counts[c];
    const fill = counts.slice();
    this.hidx = new Int32Array(counts[this.hnx * this.hnz]);
    for (let i = 0; i < this.n - 1; i++) forEachCell(i, (c) => { this.hidx[fill[c]++] = i; });
    this.hoff = counts;
  }

  /** Project (x,z) onto segment i. Writes into out: t, d, u, s, y. */
  projectSegment(i, x, z, out) {
    const ax = this.x[i], az = this.z[i];
    const dx = this.x[i + 1] - ax, dz = this.z[i + 1] - az;
    const l2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, pz = az + dz * t;
    const l = Math.sqrt(l2);
    // signed lateral offset, + = right of travel direction
    out.u = ((x - ax) * -dz + (z - az) * dx) / l;
    out.d = Math.hypot(x - px, z - pz);
    out.i = i;
    out.t = t;
    out.s = (i + t) * this.step;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
    return out;
  }

  /** Nearest point on the whole road within maxDist. Returns false if none. */
  project(x, z, out, maxDist = 40) {
    const c = this.hcell;
    const cx0 = Math.max(0, Math.floor((x - maxDist - this.hx0) / c));
    const cx1 = Math.min(this.hnx - 1, Math.floor((x + maxDist - this.hx0) / c));
    const cz0 = Math.max(0, Math.floor((z - maxDist - this.hz0) / c));
    const cz1 = Math.min(this.hnz - 1, Math.floor((z + maxDist - this.hz0) / c));
    let best = maxDist, bi = -1;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = cz * this.hnx + cx;
        for (let k = this.hoff[cell]; k < this.hoff[cell + 1]; k++) {
          const i = this.hidx[k];
          this.projectSegment(i, x, z, _tmp);
          if (_tmp.d < best) { best = _tmp.d; bi = i; }
        }
      }
    }
    if (bi < 0) return false;
    this.projectSegment(bi, x, z, out);
    return true;
  }

  /** Nearest point searching only segments [hint-back, hint+fwd]. */
  projectLocal(x, z, hint, back, fwd, out) {
    const i0 = Math.max(0, hint - back);
    const i1 = Math.min(this.n - 2, hint + fwd);
    let best = Infinity, bi = i0;
    for (let i = i0; i <= i1; i++) {
      this.projectSegment(i, x, z, _tmp);
      if (_tmp.d < best) { best = _tmp.d; bi = i; }
    }
    return this.projectSegment(bi, x, z, out);
  }

  /**
   * Nearest point of every separate road "leg" within radius (e.g. both
   * sides of a hairpin). Fills legs[] with {d,u,y,i,s}; returns the count.
   */
  legs(x, z, radius, legs) {
    const c = this.hcell;
    const cx0 = Math.max(0, Math.floor((x - radius - this.hx0) / c));
    const cx1 = Math.min(this.hnx - 1, Math.floor((x + radius - this.hx0) / c));
    const cz0 = Math.max(0, Math.floor((z - radius - this.hz0) / c));
    const cz1 = Math.min(this.hnz - 1, Math.floor((z + radius - this.hz0) / c));
    let m = 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = cz * this.hnx + cx;
        for (let k = this.hoff[cell]; k < this.hoff[cell + 1]; k++) {
          const i = this.hidx[k];
          this.projectSegment(i, x, z, _tmp);
          if (_tmp.d < radius && m < _cand.length) {
            _candI[m] = i;
            _candD[m] = _tmp.d;
            m++;
          }
        }
      }
    }
    if (m === 0) return 0;
    // sort candidates by index (insertion sort; m is small)
    for (let a = 1; a < m; a++) {
      const ii = _candI[a], dd = _candD[a];
      let b = a - 1;
      while (b >= 0 && _candI[b] > ii) { _candI[b + 1] = _candI[b]; _candD[b + 1] = _candD[b]; b--; }
      _candI[b + 1] = ii; _candD[b + 1] = dd;
    }
    const gap = Math.ceil((2 * radius) / this.step) + 3;
    let count = 0;
    let bestI = _candI[0], bestD = _candD[0], last = _candI[0];
    const flush = () => {
      if (count < legs.length) {
        this.projectSegment(bestI, x, z, legs[count]);
        count++;
      }
    };
    for (let a = 1; a < m; a++) {
      const i = _candI[a];
      if (i === last) continue;
      if (i - last > gap) {
        flush();
        bestI = i; bestD = _candD[a];
      } else if (_candD[a] < bestD) {
        bestI = i; bestD = _candD[a];
      }
      last = i;
    }
    flush();
    // nearest first
    for (let a = 1; a < count; a++) {
      const L = legs[a];
      let b = a - 1;
      while (b >= 0 && legs[b].d > L.d) { legs[b + 1] = legs[b]; b--; }
      legs[b + 1] = L;
    }
    return count;
  }

  /** Interpolated centreline sample at arc length s. */
  sample(s, out) {
    const f = Math.max(0, Math.min(this.n - 1.000001, s / this.step));
    const i = Math.floor(f), t = f - i;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    const tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t;
    const tz = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    out.i = i;
    return out;
  }
}

export function makeProjection() {
  return { i: 0, t: 0, d: 0, u: 0, s: 0, y: 0 };
}

const _tmp = makeProjection();
const _cand = new Array(4096);
const _candI = new Int32Array(4096);
const _candD = new Float64Array(4096);

export function smooth(arr, radius) {
  const n = arr.length;
  const out = new Float64Array(n);
  const sigma = radius / 2;
  const w = [];
  for (let k = -radius; k <= radius; k++) w.push(Math.exp(-0.5 * (k / sigma) ** 2));
  for (let i = 0; i < n; i++) {
    let s = 0, ws = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      s += arr[j] * w[k + radius];
      ws += w[k + radius];
    }
    out[i] = s / ws;
  }
  return out;
}
