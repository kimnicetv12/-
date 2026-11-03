#!/usr/bin/env python3
"""Bake real-world rally stages into compact JSON files the game can load.

Data sources (downloaded once and cached in tools/.cache):
  * Road network, lakes, forests, buildings: OpenStreetMap API (ODbL).
  * Elevation: AWS Terrain Tiles, Terrarium encoding (Mapzen; EU-DEM / SRTM).

Usage:
  python3 rally/tools/bake_stage.py            # bake every stage
  python3 rally/tools/bake_stage.py turini     # bake one stage

The output goes to rally/stages/<id>.json.
"""
import base64
import heapq
import io
import json
import math
import os
import sys
import time
import urllib.request
import zlib
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.join(HERE, "..", "stages")
UA = "rally-stage-baker/1.0 (offline game asset build)"
R_EARTH = 6378137.0

# ---------------------------------------------------------------------------
# Stage definitions. Waypoints are (lat, lon) and the route between them is
# found on the OSM road graph, preferring the listed roads.
# ---------------------------------------------------------------------------
STAGES = {
    "turini": dict(
        name="La Bollène-Vésubie – Col de Turini",
        rally="Rallye Monte-Carlo",
        country="France",
        flag="🇫🇷",
        surface="tarmac",
        bbox=(7.31, 43.96, 7.41, 44.01),
        waypoints=[(43.9911, 7.3322), (43.9776, 7.3916)],
        prefer=lambda t: t.get("ref") in ("M 70", "D 70") or "Turini" in (t.get("name") or ""),
        width=5.6,
        final_drive=4.6,
        time_of_day="dusk",
        smooth=(40.0, 20.0),
        max_grade=0.12,
        features=[],
        description="몬테카를로 랠리의 전설, 튀리니 고개. 라 볼렌 브쥐비 마을에서 해발 1607m 고개까지 헤어핀을 연달아 오르는 아스팔트 산악 스테이지. 그늘진 구간엔 살얼음이 남아 있다.",
    ),
    "ouninpohja": dict(
        name="Ouninpohja",
        rally="Rally Finland",
        country="Finland",
        flag="🇫🇮",
        surface="gravel",
        bbox=(24.86, 61.72, 25.06, 61.80),
        waypoints="way-ends",
        prefer=lambda t: t.get("name") == "Ouninpohjantie",
        width=6.2,
        final_drive=4.2,
        time_of_day="day",
        smooth=(12.0, 8.0),
        max_grade=0.12,
        features=[],
        description="랠리 핀란드의 상징, 우닌포흐야. 숲과 호수 사이를 지나는 초고속 자갈길과 연속되는 크레스트·점프.",
    ),
    "vargasen": dict(
        name="Vargåsen (Colin's Crest)",
        rally="Rally Sweden",
        country="Sweden",
        flag="🇸🇪",
        surface="snow",
        bbox=(13.22, 59.97, 13.40, 60.07),
        waypoints=[(60.0400587, 13.3135084), (59.9933101, 13.2880113)],
        prefer=lambda t: t.get("highway") == "unclassified",
        width=5.4,
        final_drive=4.4,
        time_of_day="day",
        smooth=(14.0, 8.0),
        max_grade=0.11,
        # Colin's Crest: the DEM is too coarse to contain the jump itself, so
        # the crest is shaped onto the road profile at its real location.
        features=[dict(name="Colin's Crest", lat=60.0050045, lon=13.2927711,
                       profile=[(-110, 0.0), (-25, 1.4), (0, 2.6), (22, -0.6), (75, -1.5), (150, 0.0)])],
        description="랠리 스웨덴 바르고센. 스터드 타이어로 눈 덮인 숲길을 달려 전설의 점프 '콜린스 크레스트'에 도전한다. 눈벽에 기대 코너를 돌아라.",
    ),
}

DRIVABLE = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "service", "track", "motorway_link", "trunk_link",
    "primary_link", "secondary_link", "tertiary_link", "living_street", "road",
}


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, "rb") as f:
            return f.read()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            return data
        except Exception as e:  # network hiccup: back off and retry
            print("  retry", url, e)
            time.sleep(2 ** attempt)
    raise RuntimeError("download failed: " + url)


# ---------------------------------------------------------------------------
# OSM parsing and routing
# ---------------------------------------------------------------------------
def load_osm(stage_id, bbox):
    url = "https://api.openstreetmap.org/api/0.6/map?bbox=%f,%f,%f,%f" % bbox
    data = fetch(url, os.path.join(CACHE, "osm", stage_id + ".osm"))
    root = ET.fromstring(data)
    nodes = {}
    for n in root.iter("node"):
        nodes[n.get("id")] = (float(n.get("lat")), float(n.get("lon")))
    ways = {}
    for w in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in w.iter("tag")}
        refs = [nd.get("ref") for nd in w.iter("nd")]
        ways[w.get("id")] = (refs, tags)
    rels = []
    for r in root.iter("relation"):
        tags = {t.get("k"): t.get("v") for t in r.iter("tag")}
        members = [(m.get("type"), m.get("ref"), m.get("role")) for m in r.iter("member")]
        rels.append((members, tags))
    return nodes, ways, rels


class Projector:
    def __init__(self, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = math.cos(math.radians(lat0)) * R_EARTH * math.pi / 180
        self.ky = R_EARTH * math.pi / 180

    def xz(self, lat, lon):
        # Game axes: +x east, +z south (north is -z), +y up.
        return ((lon - self.lon0) * self.kx, -(lat - self.lat0) * self.ky)

    def latlon(self, x, z):
        return (self.lat0 - z / self.ky, self.lon0 + x / self.kx)


def dist_ll(a, b):
    kx = math.cos(math.radians(a[0])) * 111320
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * kx)


def route(nodes, ways, waypoints, prefer):
    graph = {}
    for wid, (refs, tags) in ways.items():
        if tags.get("highway") not in DRIVABLE:
            continue
        cost_mul = 1.0 if prefer(tags) else 6.0
        oneway = False  # stages are closed roads: drive either way
        for a, b in zip(refs, refs[1:]):
            if a not in nodes or b not in nodes:
                continue
            d = dist_ll(nodes[a], nodes[b]) * cost_mul
            graph.setdefault(a, []).append((b, d))
            if not oneway:
                graph.setdefault(b, []).append((a, d))

    def nearest(p, only_pref=True):
        best, bd = None, 1e18
        for nid in graph:
            d = dist_ll(nodes[nid], p)
            if d < bd:
                best, bd = nid, d
        return best

    path = []
    for a, b in zip(waypoints, waypoints[1:]):
        s, t = nearest(a), nearest(b)
        dist = {s: 0.0}
        prev = {}
        pq = [(0.0, s)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == t:
                break
            if d > dist.get(u, 1e18):
                continue
            for v, w in graph.get(u, ()):
                nd = d + w
                if nd < dist.get(v, 1e18):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))
        seg = [t]
        while seg[-1] != s:
            seg.append(prev[seg[-1]])
        seg.reverse()
        if path and path[-1] == seg[0]:
            seg = seg[1:]
        path.extend(seg)
    return [nodes[n] for n in path]


def way_ends(nodes, ways, prefer):
    """Waypoints for 'drive the whole named road': its two farthest-apart ends."""
    ends = []
    for refs, tags in ways.values():
        if tags.get("highway") in DRIVABLE and prefer(tags):
            for r in (refs[0], refs[-1]):
                if r in nodes:
                    ends.append(nodes[r])
    best, pair = -1, None
    for i in range(len(ends)):
        for j in range(i + 1, len(ends)):
            d = dist_ll(ends[i], ends[j])
            if d > best:
                best, pair = d, (ends[i], ends[j])
    # Start from the western end.
    a, b = pair
    return [a, b] if a[1] < b[1] else [b, a]


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def catmull_rom_resample(pts, step):
    """Centripetal Catmull-Rom through pts, resampled to equal arc length."""
    pts = np.asarray(pts, dtype=float)
    # drop duplicates
    keep = [0]
    for i in range(1, len(pts)):
        if np.linalg.norm(pts[i] - pts[keep[-1]]) > 0.5:
            keep.append(i)
    pts = pts[keep]
    P = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    dense = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0) ** 0.5, 1e-3)
        t2 = t1 + max(np.linalg.norm(p2 - p1) ** 0.5, 1e-3)
        t3 = t2 + max(np.linalg.norm(p3 - p2) ** 0.5, 1e-3)
        n = max(2, int(np.linalg.norm(p2 - p1) / 0.5))
        for k in range(n):
            t = t1 + (t2 - t1) * k / n
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            dense.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    dense.append(P[-2])
    dense = np.array(dense)
    seg = np.linalg.norm(np.diff(dense, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    total = s[-1]
    n = int(total / step)
    out_s = np.linspace(0, total, n + 1)
    x = np.interp(out_s, s, dense[:, 0])
    z = np.interp(out_s, s, dense[:, 1])
    return np.stack([x, z], axis=1), total


def gaussian_smooth(v, sigma_samples):
    if sigma_samples <= 0:
        return v.copy()
    r = int(sigma_samples * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_samples) ** 2)
    k /= k.sum()
    padded = np.concatenate([np.full(r, v[0]), v, np.full(r, v[-1])])
    return np.convolve(padded, k, mode="valid")


def smooth_xy(pts, sigma_samples):
    out = pts.copy()
    out[:, 0] = gaussian_smooth(pts[:, 0], sigma_samples)
    out[:, 1] = gaussian_smooth(pts[:, 1], sigma_samples)
    out[0], out[-1] = pts[0], pts[-1]
    return out


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    pts = np.asarray(pts)
    a, b = pts[0], pts[-1]
    ab = b - a
    L = np.linalg.norm(ab)
    if L < 1e-9:
        d = np.linalg.norm(pts - a, axis=1)
    else:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L
    i = int(np.argmax(d))
    if d[i] > tol:
        left = douglas_peucker(pts[: i + 1], tol)
        right = douglas_peucker(pts[i:], tol)
        return np.vstack([left[:-1], right])
    return np.vstack([a, b])


# ---------------------------------------------------------------------------
# Elevation
# ---------------------------------------------------------------------------
def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (np.asarray(lon) + 180) / 360 * n
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
    return x, y


class DEM:
    def __init__(self, lat_min, lon_min, lat_max, lon_max, z):
        self.z = z
        x0, y1 = tile_xy(lat_min, lon_min, z)
        x1, y0 = tile_xy(lat_max, lon_max, z)
        self.tx0, self.ty0 = int(x0), int(y0)
        tx1, ty1 = int(x1), int(y1)
        w = (tx1 - self.tx0 + 1) * 256
        h = (ty1 - self.ty0 + 1) * 256
        self.img = np.zeros((h, w), dtype=np.float32)
        count = 0
        for ty in range(self.ty0, ty1 + 1):
            for tx in range(self.tx0, tx1 + 1):
                url = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png" % (z, tx, ty)
                data = fetch(url, os.path.join(CACHE, "dem", str(z), "%d_%d.png" % (tx, ty)))
                a = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype(np.float32)
                e = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
                oy, ox = (ty - self.ty0) * 256, (tx - self.tx0) * 256
                self.img[oy:oy + 256, ox:ox + 256] = e
                count += 1
        print("  DEM z%d: %d tiles" % (z, count))

    def sample(self, lat, lon):
        x, y = tile_xy(lat, lon, self.z)
        px = (x - self.tx0) * 256 - 0.5
        py = (y - self.ty0) * 256 - 0.5
        px = np.clip(px, 0, self.img.shape[1] - 1.001)
        py = np.clip(py, 0, self.img.shape[0] - 1.001)
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = px - ix, py - iy
        a = self.img[iy, ix]
        b = self.img[iy, ix + 1]
        c = self.img[iy + 1, ix]
        d = self.img[iy + 1, ix + 1]
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def grid_b64(arr, base, scale, mask=None):
    """Heights as 0.1 m steps, delta-coded along rows (and down column 0),
    zlib-compressed, base64. Decoded in the game with DecompressionStream.
    Cells outside `mask` are stored as 0 = "no data" (the game falls back to
    the coarse far grid there)."""
    q = np.clip(np.round((arr - base) * scale), 1, 65535).astype(np.int32)
    if mask is not None:
        q[~mask] = 0
    d = np.diff(q, axis=1, prepend=0)
    d[:, 0] = np.diff(q[:, 0], prepend=0)
    assert d.min() >= -32768 and d.max() <= 32767
    return base64.b64encode(zlib.compress(d.astype("<i2").tobytes(), 9)).decode("ascii")


def road_b64(road):
    """Road polyline (x, y, z) in centimetres, delta-coded, zlib, base64."""
    q = np.round(road * 100).astype(np.int64)
    d = np.diff(q, axis=0, prepend=np.zeros((1, 3), dtype=np.int64))
    first = d[0].copy()
    d[0] = 0
    assert np.abs(d).max() < 32768
    return [int(v) for v in first], base64.b64encode(zlib.compress(d.astype("<i2").tobytes(), 9)).decode("ascii")


def near_mask(pts, x0, z0, res, nx, nz, radius):
    m = np.zeros((nz, nx), dtype=bool)
    ix = np.clip(np.round((pts[:, 0] - x0) / res).astype(int), 0, nx - 1)
    iz = np.clip(np.round((pts[:, 1] - z0) / res).astype(int), 0, nz - 1)
    m[iz, ix] = True
    for k in range(int(radius / res)):
        g = m.copy()
        g[1:, :] |= m[:-1, :]
        g[:-1, :] |= m[1:, :]
        g[:, 1:] |= m[:, :-1]
        g[:, :-1] |= m[:, 1:]
        if k % 2 == 0:  # alternate square / cross steps for a rounder shape
            g[1:, 1:] |= m[:-1, :-1]
            g[:-1, :-1] |= m[1:, 1:]
            g[1:, :-1] |= m[:-1, 1:]
            g[:-1, 1:] |= m[1:, :-1]
        m = g
    return m


def limit_grade(y, step, gmax, iters=600):
    """Pull a noisy DEM road profile into a drivable one: grades are limited
    to gmax (real roads are built that way; the 25-30 m DEM is not exact on
    steep hillsides) while staying as close as possible to the data."""
    data = y.copy()
    y = y.copy()
    for it in range(iters):
        g = np.diff(y) / step
        excess = np.clip(np.abs(g) - gmax, 0, None) * np.sign(g)
        adj = np.zeros_like(y)
        adj[:-1] += excess * step * 0.5
        adj[1:] -= excess * step * 0.5
        y += adj
        y += 0.01 * (data - y)
        y = gaussian_smooth(y, 1.5)
    # final hard pass: forward/backward clamping, averaged
    f = y.copy()
    for i in range(1, len(f)):
        f[i] = min(max(f[i], f[i - 1] - gmax * step * 1.05), f[i - 1] + gmax * step * 1.05)
    b = y.copy()
    for i in range(len(b) - 2, -1, -1):
        b[i] = min(max(b[i], b[i + 1] - gmax * step * 1.05), b[i + 1] + gmax * step * 1.05)
    return gaussian_smooth((f + b) / 2, 2.0)


def pchip(xk, yk, x):
    """Monotone cubic (Fritsch-Carlson) interpolation."""
    h = np.diff(xk)
    delta = np.diff(yk) / h
    m = np.zeros_like(yk)
    for k in range(1, len(xk) - 1):
        if delta[k - 1] * delta[k] > 0:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
            m[k] = (w1 + w2) / (w1 / delta[k - 1] + w2 / delta[k])
    idx = np.clip(np.searchsorted(xk, x) - 1, 0, len(xk) - 2)
    t = (x - xk[idx]) / h[idx]
    h00 = 2 * t**3 - 3 * t**2 + 1
    h10 = t**3 - 2 * t**2 + t
    h01 = -2 * t**3 + 3 * t**2
    h11 = t**3 - t**2
    return h00 * yk[idx] + h10 * h[idx] * m[idx] + h01 * yk[idx + 1] + h11 * h[idx] * m[idx + 1]


# ---------------------------------------------------------------------------
# Polygons (lakes, forests, buildings)
# ---------------------------------------------------------------------------
def stitch_rings(segments):
    rings = []
    segs = [list(s) for s in segments if len(s) >= 2]
    while segs:
        ring = segs.pop()
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def collect_polygons(nodes, ways, rels, kind):
    def match(t):
        if kind == "water":
            return t.get("natural") == "water" or t.get("landuse") == "reservoir" or t.get("water") in ("lake", "pond", "river")
        if kind == "forest":
            return t.get("landuse") == "forest" or t.get("natural") == "wood"
        if kind == "building":
            return "building" in t
        return False

    rings = []
    for refs, tags in ways.values():
        if match(tags) and len(refs) >= 4 and refs[0] == refs[-1]:
            rings.append(refs)
    for members, tags in rels:
        if tags.get("type") == "multipolygon" and match(tags):
            outer = [ways[ref][0] for (typ, ref, role) in members if typ == "way" and role in ("outer", "") and ref in ways]
            rings += stitch_rings(outer)
    out = []
    for refs in rings:
        if all(r in nodes for r in refs):
            out.append([nodes[r] for r in refs])
    return out


# ---------------------------------------------------------------------------
# Main bake
# ---------------------------------------------------------------------------
def bake(stage_id):
    cfg = STAGES[stage_id]
    print("Baking", stage_id)
    nodes, ways, rels = load_osm(stage_id, cfg["bbox"])
    wps = cfg["waypoints"]
    if wps == "way-ends":
        wps = way_ends(nodes, ways, cfg["prefer"])
    path_ll = route(nodes, ways, wps, cfg["prefer"])
    lat0 = sum(p[0] for p in path_ll) / len(path_ll)
    lon0 = sum(p[1] for p in path_ll) / len(path_ll)
    proj = Projector(lat0, lon0)
    raw = [proj.xz(*p) for p in path_ll]
    STEP = 2.0
    pts, length = catmull_rom_resample(raw, STEP)
    pts = smooth_xy(pts, 2.0)
    print("  route: %d osm nodes, %.0f m" % (len(path_ll), length))

    # DEM region: road bbox + margin for the visible landscape.
    margin_near = 800.0
    margin_far = 6000.0
    xmin, zmin = pts.min(axis=0) - margin_far
    xmax, zmax = pts.max(axis=0) + margin_far
    la_a, lo_a = proj.latlon(xmin, zmax)
    la_b, lo_b = proj.latlon(xmax, zmin)
    dem_far = DEM(min(la_a, la_b), min(lo_a, lo_b), max(la_a, la_b), max(lo_a, lo_b), 11)
    xmin_n, zmin_n = pts.min(axis=0) - margin_near
    xmax_n, zmax_n = pts.max(axis=0) + margin_near
    la_a, lo_a = proj.latlon(xmin_n, zmax_n)
    la_b, lo_b = proj.latlon(xmax_n, zmin_n)
    dem = DEM(min(la_a, la_b), min(lo_a, lo_b), max(la_a, la_b), max(lo_a, lo_b), 14)

    def sample_xz(dem_, X, Z):
        lat = proj.lat0 - Z / proj.ky
        lon = proj.lon0 + X / proj.kx
        return dem_.sample(lat, lon)

    # Road elevation: DEM along the road, smoothed along arc length so the
    # surface is drivable (DEM is ~25-30 m resolution).
    road_y = sample_xz(dem, pts[:, 0], pts[:, 1]).astype(float)
    s1, s2 = cfg["smooth"]
    road_y = gaussian_smooth(road_y, s1 / STEP)
    road_y = gaussian_smooth(road_y, s2 / STEP)
    raw_y = road_y.copy()
    road_y = limit_grade(road_y, STEP, cfg["max_grade"])
    print("  grade limit %.0f%%: max change %.1f m, max grade %.1f%%" % (
        cfg["max_grade"] * 100, np.abs(road_y - raw_y).max(), np.abs(np.diff(road_y)).max() / STEP * 100))
    arc = np.arange(len(pts)) * STEP
    landmarks = []
    for feat in cfg["features"]:
        fx_, fz_ = proj.xz(feat["lat"], feat["lon"])
        i = int(np.argmin(np.hypot(pts[:, 0] - fx_, pts[:, 1] - fz_)))
        ds = np.array([p[0] for p in feat["profile"]], dtype=float)
        dy = np.array([p[1] for p in feat["profile"]], dtype=float)
        rel = arc - arc[i]
        mask = (rel >= ds[0]) & (rel <= ds[-1])
        road_y[mask] += pchip(ds, dy, rel[mask])
        landmarks.append({"name": feat["name"], "s": round(float(arc[i]), 1)})
        print("  feature %s at %.0f m" % (feat["name"], arc[i]))

    # Near grid
    near_res = 16.0
    nx = int((xmax_n - xmin_n) / near_res) + 1
    nz = int((zmax_n - zmin_n) / near_res) + 1
    GX, GZ = np.meshgrid(xmin_n + np.arange(nx) * near_res, zmin_n + np.arange(nz) * near_res)
    near_h = sample_xz(dem, GX, GZ)
    # Far grid (coarse, for horizon mountains)
    far_res = 120.0
    fx = int((xmax - xmin) / far_res) + 1
    fz = int((zmax - zmin) / far_res) + 1
    FX, FZ = np.meshgrid(xmin + np.arange(fx) * far_res, zmin + np.arange(fz) * far_res)
    far_h = sample_xz(dem_far, FX, FZ)
    base = float(min(near_h.min(), far_h.min(), road_y.min())) - 1.0

    # Polygons near the road
    def to_local(poly, tol):
        xy = np.array([proj.xz(*p) for p in poly])
        xy = douglas_peucker(xy, tol)
        return xy

    def in_near(xy):
        return (xy[:, 0].max() > xmin_n and xy[:, 0].min() < xmax_n and
                xy[:, 1].max() > zmin_n and xy[:, 1].min() < zmax_n)

    # spatial check for "close to road"
    from_road = RoadDistance(pts)

    water = []
    for poly in collect_polygons(nodes, ways, rels, "water"):
        xy = to_local(poly, 4.0)
        if len(xy) >= 4 and in_near(xy):
            level = float(np.percentile(sample_xz(dem, xy[:, 0], xy[:, 1]), 20))
            water.append({"y": round(level, 2), "p": [round(float(v), 1) for v in xy[:-1].ravel()]})
    forest = []
    for poly in collect_polygons(nodes, ways, rels, "forest"):
        xy = to_local(poly, 6.0)
        if len(xy) >= 4 and in_near(xy):
            forest.append([round(float(v), 1) for v in xy[:-1].ravel()])
    buildings = []
    for poly in collect_polygons(nodes, ways, rels, "building"):
        xy = to_local(poly, 0.5)
        if len(xy) >= 4 and in_near(xy) and from_road.min_dist(xy) < 250:
            buildings.append([round(float(v), 1) for v in xy[:-1].ravel()])
    print("  polygons: %d water, %d forest, %d buildings" % (len(water), len(forest), len(buildings)))

    road = np.stack([pts[:, 0], road_y, pts[:, 1]], axis=1)
    road_first, road_data = road_b64(road)
    out = {
        "id": stage_id,
        "name": cfg["name"],
        "rally": cfg["rally"],
        "country": cfg["country"],
        "flag": cfg["flag"],
        "surface": cfg["surface"],
        "description": cfg["description"],
        "timeOfDay": cfg["time_of_day"],
        "finalDrive": cfg["final_drive"],
        "width": cfg["width"],
        "length": round(float(length), 1),
        "origin": {"lat": lat0, "lon": lon0},
        "start": {"lat": path_ll[0][0], "lon": path_ll[0][1]},
        "finish": {"lat": path_ll[-1][0], "lon": path_ll[-1][1]},
        "road": {"step": STEP, "count": len(road), "first": road_first, "data": road_data},
        "landmarks": landmarks,
        "terrain": {
            "base": round(base, 2),
            "scale": 10,
            "near": {"x0": round(float(xmin_n), 2), "z0": round(float(zmin_n), 2), "res": near_res,
                     "nx": nx, "nz": nz, "data": grid_b64(near_h, base, 10, near_mask(pts, xmin_n, zmin_n, near_res, nx, nz, margin_near))},
            "far": {"x0": round(float(xmin), 2), "z0": round(float(zmin), 2), "res": far_res,
                    "nx": fx, "nz": fz, "data": grid_b64(far_h, base, 10)},
        },
        "water": water,
        "forest": forest,
        "buildings": buildings,
        "attribution": "Road, water, forest & building data © OpenStreetMap contributors (ODbL). "
                       "Elevation: AWS Terrain Tiles (Mapzen) — EU-DEM / SRTM.",
    }
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, stage_id + ".json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    climb = np.sum(np.clip(np.diff(road_y), 0, None))
    print("  wrote %s (%.0f KB): length %.2f km, elevation %.0f-%.0f m, climb %.0f m"
          % (path, os.path.getsize(path) / 1024, length / 1000, road_y.min(), road_y.max(), climb))


class RoadDistance:
    def __init__(self, pts, cell=50.0):
        self.pts = pts
        self.cell = cell
        self.grid = {}
        for i, (x, z) in enumerate(pts):
            self.grid.setdefault((int(x // cell), int(z // cell)), []).append(i)

    def min_dist(self, xy):
        best = 1e9
        for x, z in xy:
            cx, cz = int(x // self.cell), int(z // self.cell)
            for dx in range(-5, 6):
                for dz in range(-5, 6):
                    for i in self.grid.get((cx + dx, cz + dz), ()):
                        p = self.pts[i]
                        best = min(best, math.hypot(p[0] - x, p[1] - z))
        return best


if __name__ == "__main__":
    ids = sys.argv[1:] or list(STAGES)
    for sid in ids:
        bake(sid)
