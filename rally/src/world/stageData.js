// Loads a baked stage JSON (see tools/bake_stage.py) and decodes its
// compressed road polyline and elevation grids.

async function inflateBase64(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).arrayBuffer();
}

async function decodeRoad(road) {
  const d = new Int16Array(await inflateBase64(road.data));
  const n = road.count;
  const pts = new Float64Array(n * 3);
  let x = road.first[0], y = road.first[1], z = road.first[2];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      x += d[i * 3];
      y += d[i * 3 + 1];
      z += d[i * 3 + 2];
    }
    pts[i * 3] = x / 100;
    pts[i * 3 + 1] = y / 100;
    pts[i * 3 + 2] = z / 100;
  }
  return pts;
}

async function decodeGrid(g, base, scale) {
  const d = new Int16Array(await inflateBase64(g.data));
  const { nx, nz } = g;
  const h = new Float32Array(nx * nz);
  const valid = new Uint8Array(nx * nz);
  let col0 = 0;
  for (let r = 0; r < nz; r++) {
    col0 += d[r * nx];
    let q = col0;
    for (let c = 0; c < nx; c++) {
      if (c > 0) q += d[r * nx + c];
      const k = r * nx + c;
      if (q > 0) {
        h[k] = base + q / scale;
        valid[k] = 1;
      }
    }
  }
  return { x0: g.x0, z0: g.z0, res: g.res, nx, nz, h, valid };
}

/** Bilinear sample of an elevation grid. Returns NaN outside / no data. */
export function sampleGrid(g, x, z) {
  const fx = (x - g.x0) / g.res;
  const fz = (z - g.z0) / g.res;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= g.nx - 1 || iz >= g.nz - 1) return NaN;
  const k = iz * g.nx + ix;
  if (!(g.valid[k] && g.valid[k + 1] && g.valid[k + g.nx] && g.valid[k + g.nx + 1])) return NaN;
  const tx = fx - ix;
  const tz = fz - iz;
  const a = g.h[k] + (g.h[k + 1] - g.h[k]) * tx;
  const b = g.h[k + g.nx] + (g.h[k + g.nx + 1] - g.h[k + g.nx]) * tx;
  return a + (b - a) * tz;
}

export async function loadStage(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`stage ${url}: HTTP ${res.status}`);
  return decodeStage(await res.json());
}

export async function decodeStage(json) {
  const t = json.terrain;
  const [road, near, far] = await Promise.all([
    decodeRoad(json.road),
    decodeGrid(t.near, t.base, t.scale),
    decodeGrid(t.far, t.base, t.scale),
  ]);
  return {
    ...json,
    roadPoints: road,
    near,
    far,
    /** Bare-earth elevation (DEM) at x,z. */
    dem(x, z) {
      const h = sampleGrid(near, x, z);
      if (h === h) return h;
      const f = sampleGrid(far, x, z);
      return f === f ? f : t.base;
    },
  };
}
