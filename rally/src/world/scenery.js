// Deterministic placement of road-side scenery (trees, stone parapets, snow
// poles, ice patches, buildings) shared by the renderer and the physics.

import { PolygonSet } from './terrain.js';
import { makeProjection } from './road.js';
import { Obstacles } from '../physics/collisions.js';

export function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BIOME = {
  // base: tree probability outside mapped forest, forest: inside
  tarmac: { base: 0.18, forest: 0.85, types: ['pine', 'pine', 'larch', 'broadleaf'], treeLine: 1700 },
  gravel: { base: 0.7, forest: 0.95, types: ['spruce', 'spruce', 'pine', 'pine', 'birch'], treeLine: 9999 },
  snow: { base: 0.75, forest: 0.95, types: ['snowspruce', 'snowspruce', 'snowpine', 'birchbare'], treeLine: 9999 },
};

/**
 * @returns {{trees: {x,y,z,s,rot,type}[], walls, poles, buildings, ice, obstacles}}
 */
export function buildScenery(stage, road, surface, ground) {
  const rand = rng(stage.id);
  const hw = road.halfWidth;
  const sh = surface.sh;
  const biome = BIOME[stage.surface];
  const forests = new PolygonSet(stage.forest.map((p) => ({ pts: p })));
  const buildings = new PolygonSet(stage.buildings.map((p) => ({ pts: p })));
  const water = surface.water;
  const proj = makeProjection();
  const g = { y: 0, nx: 0, ny: 1, nz: 0 };
  const obstacles = new Obstacles();
  const trees = [];

  // --- trees: walk the road and scatter on both sides -------------------------
  const clearance = hw + sh + 1.6;
  for (let s = 0; s < road.length; s += 2.2) {
    const i = Math.min(road.n - 1, Math.floor(s / road.step));
    const x0 = road.x[i], z0 = road.z[i];
    const rx = -road.tz[i], rz = road.tx[i];
    for (const side of [-1, 1]) {
      // near band (dense, collidable) + far band (sparser)
      for (let k = 0; k < 3; k++) {
        const far = k > 0;
        const d = far ? clearance + 14 + Math.pow(rand(), 1.6) * 150 : clearance + rand() * 14;
        if (far && rand() > 0.55) continue;
        const along = (rand() - 0.5) * 2.2;
        const x = x0 + rx * d * side + road.tx[i] * along;
        const z = z0 + rz * d * side + road.tz[i] * along;
        if (road.project(x, z, proj, clearance)) continue; // too close to some part of the road
        if (water.find(x, z) || buildings.find(x, z)) continue;
        const inForest = forests.find(x, z) !== null;
        if (rand() > (inForest ? biome.forest : biome.base)) continue;
        if (!ground.query(x, z, g)) continue;
        if (g.ny < 0.72) continue; // cliffs
        if (g.y > biome.treeLine + (rand() - 0.5) * 80) continue;
        const type = biome.types[Math.floor(rand() * biome.types.length)];
        const scale = 0.75 + rand() * 0.6;
        const t = { x, y: g.y, z, s: scale, rot: rand() * Math.PI * 2, type };
        trees.push(t);
        if (d < clearance + 30) obstacles.addCircle(x, z, 0.22 + 0.12 * scale, g.y - 0.5, 12, 'tree');
      }
    }
  }

  // --- stone parapets on drops (Monte-Carlo mountain roads) --------------------
  const walls = [];
  if (stage.surface === 'tarmac') {
    let run = null;
    const flush = () => {
      if (run && run.pts.length >= 3) walls.push(run);
      run = null;
    };
    for (const side of [-1, 1]) {
      for (let i = 0; i < road.n; i += 2) {
        const rx = -road.tz[i], rz = road.tx[i];
        const u = (hw + 0.45) * side;
        const x = road.x[i] + rx * u, z = road.z[i] + rz * u;
        // how far does the ground drop just outside the road?
        const ox = road.x[i] + rx * (hw + 7) * side, oz = road.z[i] + rz * (hw + 7) * side;
        ground.query(ox, oz, g);
        const drop = road.y[i] - g.y;
        const curved = Math.abs(road.curvature[i]) > 1 / 60 && Math.sign(road.curvature[i]) === -side;
        const clearOfRoad = !road.project(x, z, proj, hw + 0.4);
        if (clearOfRoad && (drop > 2.6 || (curved && drop > 1.2))) {
          ground.query(x, z, g);
          if (!run) run = { side, pts: [] };
          run.pts.push([x, g.y, z]);
        } else flush();
      }
      flush();
    }
    for (const w of walls) {
      for (let k = 0; k < w.pts.length - 1; k++) {
        const a = w.pts[k], b = w.pts[k + 1];
        obstacles.addSegment(a[0], a[2], b[0], b[2], 0.45, Math.min(a[1], b[1]) - 0.3, 1.0, 'wall');
      }
    }
  }

  // --- snow poles (Sweden) and edge posts --------------------------------------
  const poles = [];
  const poleEvery = stage.surface === 'snow' ? 40 : 60;
  for (let s = 20; s < road.length - 20; s += poleEvery) {
    const i = Math.floor(s / road.step);
    for (const side of [-1, 1]) {
      if (stage.surface === 'tarmac' && rand() < 0.5) continue;
      const rx = -road.tz[i], rz = road.tx[i];
      const u = (hw + (stage.surface === 'snow' ? 1.9 : 0.9)) * side;
      const x = road.x[i] + rx * u, z = road.z[i] + rz * u;
      ground.query(x, z, g);
      poles.push({ x, y: g.y, z });
    }
  }

  // --- ice patches (Monte-Carlo: shaded high sections) -------------------------
  const ice = [];
  if (stage.surface === 'tarmac') {
    let maxY = -Infinity;
    for (let i = 0; i < road.n; i++) maxY = Math.max(maxY, road.y[i]);
    for (let s = 400; s < road.length - 150; s += 160 + rand() * 380) {
      const i = Math.floor(s / road.step);
      if (road.y[i] < maxY - 520) continue;
      if (rand() < 0.45) continue;
      const len = 18 + rand() * 45;
      const u0 = -hw + rand() * hw * 0.6;
      const u1 = u0 + hw * (0.7 + rand() * 0.9);
      ice.push({ s0: s, s1: s + len, u0, u1: Math.min(hw, u1) });
    }
  }

  // --- buildings near the road ------------------------------------------------
  const houses = [];
  for (const b of buildings.items) {
    // OSM centrelines run close to houses in villages; never let a house
    // stand on the (widened) stage road
    let tooClose = false;
    for (let k = 0; k < b.pts.length && !tooClose; k += 2) {
      if (road.project(b.pts[k], b.pts[k + 1], proj, hw + 2) && proj.d < hw + 1.5) tooClose = true;
    }
    if (tooClose) continue;
    let cx = 0, cz = 0;
    const n = b.pts.length / 2;
    for (let k = 0; k < b.pts.length; k += 2) { cx += b.pts[k]; cz += b.pts[k + 1]; }
    cx /= n; cz /= n;
    let minY = Infinity;
    for (let k = 0; k < b.pts.length; k += 2) {
      ground.query(b.pts[k], b.pts[k + 1], g);
      minY = Math.min(minY, g.y);
    }
    const h = 3.2 + rand() * 3.5;
    houses.push({ pts: b.pts, y: minY - 0.3, h, roof: rand() });
    if (road.project(cx, cz, proj, 60)) {
      for (let k = 0; k < b.pts.length; k += 2) {
        const k2 = (k + 2) % b.pts.length;
        obstacles.addSegment(b.pts[k], b.pts[k + 1], b.pts[k2], b.pts[k2 + 1], 0.4, minY - 0.3, h + 0.3, 'building');
      }
    }
  }

  return { trees, walls, poles, ice, houses, obstacles };
}
