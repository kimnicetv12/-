// Builds the drivable world surface: one irregular triangle mesh that contains
// the road (exact cross-sections every 2 m), its shoulders / ditches / snow
// banks, cut-and-fill slopes and the surrounding real-world DEM terrain.
// The same triangles are used for rendering and for physics ground queries,
// so what you see is exactly what the tyres touch.

import Delaunator from '../../vendor/delaunator/index.js';
import { makeProjection } from './road.js';

// Road-side cross-section profiles, measured outward from the road edge:
// [distance from edge (m), height relative to the edge (m)].
export const ROADSIDE = {
  tarmac: { crown: 0.04, blend: 18, shoulder: [[0, 0], [0.5, -0.05], [1.4, -0.16]] },
  gravel: { crown: 0.07, blend: 20, shoulder: [[0, 0], [0.8, -0.1], [1.6, -0.42], [2.4, -0.22]] },
  snow: { crown: 0.03, blend: 20, shoulder: [[0, 0], [0.6, 0.12], [1.4, 0.42], [2.3, 0.62], [3.6, 0.3]] },
};

export const KIND = { CENTER: 0, EDGE: 1, SHOULDER: 2, SLOPE: 3, NATURAL: 4, LAKEBED: 5 };

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class PolygonSet {
  constructor(polys) {
    this.items = polys.map((p) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < p.pts.length; i += 2) {
        x0 = Math.min(x0, p.pts[i]); x1 = Math.max(x1, p.pts[i]);
        z0 = Math.min(z0, p.pts[i + 1]); z1 = Math.max(z1, p.pts[i + 1]);
      }
      return { ...p, x0, z0, x1, z1 };
    });
  }

  find(x, z) {
    for (const it of this.items) {
      if (x < it.x0 || x > it.x1 || z < it.z0 || z > it.z1) continue;
      if (pointInPoly(it.pts, x, z)) return it;
    }
    return null;
  }
}

/** Height of the world surface (road + roadside + DEM) at x,z. */
export class SurfaceModel {
  constructor(stage, road) {
    this.stage = stage;
    this.road = road;
    this.side = ROADSIDE[stage.surface];
    this.hw = road.halfWidth;
    this.sh = this.side.shoulder[this.side.shoulder.length - 1][0];
    this.reach = this.hw + this.sh + this.side.blend;
    this.water = new PolygonSet(stage.water.map((w) => ({ pts: w.p, y: w.y })));
    this.legs = Array.from({ length: 8 }, makeProjection);
  }

  shoulderOffset(dEdge) {
    const s = this.side.shoulder;
    if (dEdge <= 0) return 0;
    for (let k = 1; k < s.length; k++) {
      if (dEdge <= s[k][0]) {
        const t = (dEdge - s[k - 1][0]) / (s[k][0] - s[k - 1][0]);
        return s[k - 1][1] + (s[k][1] - s[k - 1][1]) * t;
      }
    }
    return s[s.length - 1][1];
  }

  /** Height across a road leg at absolute lateral distance d. */
  profile(yCenter, d) {
    const crown = this.side.crown;
    if (d <= this.hw) return yCenter - crown * (d / this.hw);
    return yCenter - crown + this.shoulderOffset(d - this.hw);
  }

  demWithWater(x, z) {
    const h = this.stage.dem(x, z);
    const w = this.water.find(x, z);
    if (w) return { h: Math.min(h, w.y - 1.6), lake: true };
    return { h, lake: false };
  }

  heightAt(x, z) {
    const legs = this.legs;
    const n = this.road.legs(x, z, this.reach, legs);
    if (n === 0) return this.demWithWater(x, z).h;
    const L0 = legs[0];
    if (L0.d <= this.hw + this.sh) return this.profile(L0.y, L0.d);
    let A = 0, sumW = 0, sumY = 0;
    const edgeEnd = -this.side.crown + this.side.shoulder[this.side.shoulder.length - 1][1];
    for (let k = 0; k < n; k++) {
      const delta = legs[k].d - this.hw - this.sh;
      const a = 1 - smoothstep(0, this.side.blend, delta);
      if (a <= 0) continue;
      const w = a / Math.max(delta, 0.05) ** 2;
      sumW += w;
      sumY += w * (legs[k].y + edgeEnd);
      A = Math.max(A, a);
    }
    const D = this.demWithWater(x, z).h;
    if (sumW === 0) return D;
    return A * (sumY / sumW) + (1 - A) * D;
  }
}

/**
 * Generate the terrain point cloud and triangulate it.
 * Returns { positions, indices, kinds, ground }.
 */
export function buildTerrain(stage, road, surface) {
  const xs = [], zs = [], kinds = [];
  const hw = road.halfWidth;
  const side = surface.side;
  const sh = surface.sh;
  const proj = makeProjection();

  const add = (x, z, kind) => { xs.push(x); zs.push(z); kinds.push(kind); };

  // 1) road cross-sections
  const shoulderOffsets = side.shoulder.slice(1).map((p) => hw + p[0]);
  const slope = [[3, 1], [8, 2], [15, 3], [24, 5]];
  for (let i = 0; i < road.n; i++) {
    // every 2 m in bends / over crests, every 4 m on straights
    const bendy = Math.abs(road.curvature[i]) > 1 / 90 || Math.abs(road.vcurv[i]) > 1 / 250;
    if (i % 2 === 1 && !bendy && i !== road.n - 1) continue;
    const x = road.x[i], z = road.z[i];
    const rx = -road.tz[i], rz = road.tx[i];
    add(x, z, KIND.CENTER);
    for (const sgn of [-1, 1]) {
      add(x + rx * hw * sgn, z + rz * hw * sgn, KIND.EDGE);
      const outer = [];
      for (const o of shoulderOffsets) outer.push([o, KIND.SHOULDER]);
      for (const [o, every] of slope) if (i % every === 0) outer.push([hw + sh + o, KIND.SLOPE]);
      for (const [o, kind] of outer) {
        const px = x + rx * o * sgn, pz = z + rz * o * sgn;
        // Skip points that actually belong to another part of the road
        // (inside of hairpins, parallel legs).
        if (road.project(px, pz, proj, o - 0.35)) continue;
        add(px, pz, kind);
      }
    }
  }
  const nRoadPts = xs.length;

  // 2) DEM grid points away from the road
  const clear = hw + sh + 24 + 7;
  const near = stage.near;
  for (let iz = 0; iz < near.nz; iz++) {
    for (let ix = 0; ix < near.nx; ix++) {
      if (!near.valid[iz * near.nx + ix]) continue;
      const x = near.x0 + ix * near.res, z = near.z0 + iz * near.res;
      const hit = road.project(x, z, proj, 150);
      if (hit && proj.d < clear) continue;
      if (!hit && (ix % 2 || iz % 2)) continue;
      add(x, z, KIND.NATURAL);
    }
  }
  const far = stage.far;
  for (let iz = 0; iz < far.nz; iz++) {
    for (let ix = 0; ix < far.nx; ix++) {
      const x = far.x0 + ix * far.res, z = far.z0 + iz * far.res;
      // only where the detailed grid has no data (with a margin)
      const fx = (x - near.x0) / near.res, fz = (z - near.z0) / near.res;
      let covered = false;
      const r = Math.ceil(far.res / near.res);
      for (let dz = -r; dz <= r && !covered; dz++) {
        for (let dx = -r; dx <= r && !covered; dx++) {
          const cx = Math.round(fx) + dx, cz = Math.round(fz) + dz;
          if (cx >= 0 && cz >= 0 && cx < near.nx && cz < near.nz && near.valid[cz * near.nx + cx]) covered = true;
        }
      }
      if (!covered) add(x, z, KIND.NATURAL);
    }
  }

  const n = xs.length;
  const coords = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) { coords[2 * i] = xs[i]; coords[2 * i + 1] = zs[i]; }
  const del = new Delaunator(coords);
  const indices = del.triangles;

  const positions = new Float32Array(n * 3);
  const kindArr = new Uint8Array(kinds);
  for (let i = 0; i < n; i++) {
    let y;
    if (i < nRoadPts) {
      y = surface.heightAt(xs[i], zs[i]);
    } else {
      // natural point: DEM unless near enough to be shaped by the road
      const hit = road.project(xs[i], zs[i], proj, surface.reach);
      if (hit) y = surface.heightAt(xs[i], zs[i]);
      else {
        const r = surface.demWithWater(xs[i], zs[i]);
        y = r.h;
        if (r.lake) kindArr[i] = KIND.LAKEBED;
      }
    }
    positions[i * 3] = xs[i];
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = zs[i];
  }

  // Delaunator's winding in (x, z) already gives upward (+y) face normals
  // with three.js' counter-clockwise front faces.

  const ground = new GroundIndex(positions, indices);
  return { positions, indices, kinds: kindArr, ground, roadPointCount: nRoadPts };
}

/** Spatial index over the terrain triangles for height/normal queries. */
export class GroundIndex {
  constructor(pos, tris) {
    this.pos = pos;
    this.tris = tris;
    const nt = tris.length / 3;
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      minx = Math.min(minx, pos[i]); maxx = Math.max(maxx, pos[i]);
      minz = Math.min(minz, pos[i + 2]); maxz = Math.max(maxz, pos[i + 2]);
    }
    this.x0 = minx; this.z0 = minz;
    this.fine = this.#grid(nt, minx, minz, maxx, maxz, 8, (e) => e <= 64);
    this.coarse = this.#grid(nt, minx, minz, maxx, maxz, 128, (e) => e > 64);
    this.last = 0;
  }

  #grid(nt, minx, minz, maxx, maxz, cell, accept) {
    const nx = Math.ceil((maxx - minx) / cell) + 1;
    const nz = Math.ceil((maxz - minz) / cell) + 1;
    const off = new Int32Array(nx * nz + 1);
    const p = this.pos, t = this.tris;
    const range = (k) => {
      const a = t[k * 3] * 3, b = t[k * 3 + 1] * 3, c = t[k * 3 + 2] * 3;
      const x0 = Math.min(p[a], p[b], p[c]), x1 = Math.max(p[a], p[b], p[c]);
      const z0 = Math.min(p[a + 2], p[b + 2], p[c + 2]), z1 = Math.max(p[a + 2], p[b + 2], p[c + 2]);
      if (!accept(Math.max(x1 - x0, z1 - z0))) return null;
      return [Math.floor((x0 - minx) / cell), Math.floor((x1 - minx) / cell), Math.floor((z0 - minz) / cell), Math.floor((z1 - minz) / cell)];
    };
    const ranges = new Array(nt);
    for (let k = 0; k < nt; k++) {
      const r = (ranges[k] = range(k));
      if (!r) continue;
      for (let cz = r[2]; cz <= r[3]; cz++) for (let cx = r[0]; cx <= r[1]; cx++) off[cz * nx + cx + 1]++;
    }
    for (let c = 0; c < nx * nz; c++) off[c + 1] += off[c];
    const fill = off.slice();
    const idx = new Int32Array(off[nx * nz]);
    for (let k = 0; k < nt; k++) {
      const r = ranges[k];
      if (!r) continue;
      for (let cz = r[2]; cz <= r[3]; cz++) for (let cx = r[0]; cx <= r[1]; cx++) idx[fill[cz * nx + cx]++] = k;
    }
    return { cell, nx, nz, off, idx };
  }

  #test(k, x, z, out) {
    const p = this.pos, t = this.tris;
    const a = t[k * 3] * 3, b = t[k * 3 + 1] * 3, c = t[k * 3 + 2] * 3;
    const ax = p[a], az = p[a + 2], bx = p[b], bz = p[b + 2], cx = p[c], cz = p[c + 2];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (d === 0) return false;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    const l3 = 1 - l1 - l2;
    const eps = -1e-7;
    if (l1 < eps || l2 < eps || l3 < eps) return false;
    const ay = p[a + 1], by = p[b + 1], cy = p[c + 1];
    out.y = l1 * ay + l2 * by + l3 * cy;
    // normal = (b - a) x (c - a), oriented up
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
    out.tri = k;
    return true;
  }

  /** Ground height and normal under (x,z). Returns false off the map. */
  query(x, z, out) {
    if (this.#test(this.last, x, z, out)) return true;
    for (const g of [this.fine, this.coarse]) {
      const cx = Math.floor((x - this.x0) / g.cell), cz = Math.floor((z - this.z0) / g.cell);
      if (cx < 0 || cz < 0 || cx >= g.nx || cz >= g.nz) continue;
      const cell = cz * g.nx + cx;
      for (let k = g.off[cell]; k < g.off[cell + 1]; k++) {
        const tri = g.idx[k];
        if (this.#test(tri, x, z, out)) { this.last = tri; return true; }
      }
    }
    out.y = -1000; out.nx = 0; out.ny = 1; out.nz = 0; out.tri = -1;
    return false;
  }
}
