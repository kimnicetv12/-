#!/usr/bin/env python3
"""도장오목 원본 에셋 생성기 (텍스처 · UI 이미지 · 효과음 · 음악 · 글꼴 부분집합)

언리얼 밖에서 numpy + Pillow 로 만든다. 결과물은 저장소에 함께 들어 있으므로
다시 만들 필요가 있을 때만 실행하면 된다.

  python3 Tools/generate_assets.py --fonts <글꼴 폴더>

<글꼴 폴더>에는 다음 OFL 글꼴이 있어야 한다 (github.com/google/fonts 의 ofl/ 아래).
  GowunBatang-Bold.ttf, GowunBatang-Regular.ttf, GowunDodum-Regular.ttf  → UI 글꼴 (부분집합으로 줄여 Content/Slate/Fonts 에 저장)
  NotoSerifTC[wght].ttf                                                  → 도장 한자(朱, 藍) 굽기용 (저장소에 넣지 않음)
"""
import argparse
import math
import os
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "SourceArt", "Textures")
AUD = os.path.join(ROOT, "SourceArt", "Audio")
UI = os.path.join(ROOT, "Content", "Slate", "StampOmok")
FONTS_OUT = os.path.join(ROOT, "Content", "Slate", "Fonts")

INK_SHU = (200, 52, 31)     # 주홍 인주
INK_AI = (43, 75, 140)      # 쪽빛


# ───────────────────────────── 공통 도구 ─────────────────────────────
def rng(seed):
    return np.random.default_rng(seed)


def tileable_value_noise(size, cells, seed):
    """경계가 이어지는 값 노이즈 (cells × cells 격자, 코사인 보간)"""
    r = rng(seed)
    grid = r.random((cells, cells))
    coords = np.arange(size) * cells / size
    i0 = np.floor(coords).astype(int)
    f = coords - i0
    f = (1 - np.cos(f * np.pi)) / 2
    i1 = (i0 + 1) % cells
    i0 = i0 % cells
    a = grid[np.ix_(i0, i0)]
    b = grid[np.ix_(i0, i1)]
    c = grid[np.ix_(i1, i0)]
    d = grid[np.ix_(i1, i1)]
    fy = f[:, None]
    fx = f[None, :]
    top = a * (1 - fx) + b * fx
    bot = c * (1 - fx) + d * fx
    return top * (1 - fy) + bot * fy


def fbm(size, base_cells, octaves, seed, gain=0.5):
    total = np.zeros((size, size))
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        cells = base_cells * (2 ** o)
        if cells > size:
            break
        total += amp * tileable_value_noise(size, cells, seed + o * 101)
        norm += amp
        amp *= gain
    return total / norm


def blur_wrap(arr, radius):
    """경계를 감싸는 가우시안 흐림 (주파수 영역 곱 = 원형 합성곱이라 타일 이음매가 생기지 않음)"""
    if radius <= 0:
        return arr
    h, w = arr.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * radius) ** 2 * (fx * fx + fy * fy))
    return np.fft.irfft2(np.fft.rfft2(arr) * g, s=arr.shape)


def normal_from_height(h, strength):
    """높이 맵 → 탄젠트 공간 노멀 (DirectX 규약: 초록이 아래쪽 기울기)"""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / n, ny / n, nz / n], axis=-1) * 0.5 + 0.5
    return (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)


def to_u8(a):
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_png(arr, path, mode=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr, mode=mode).save(path, optimize=True)
    print(f"  {os.path.relpath(path, ROOT)}  {os.path.getsize(path) // 1024} KB")


def save_jpg(arr, path, quality=92):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr).save(path, quality=quality, subsampling=0, optimize=True)
    print(f"  {os.path.relpath(path, ROOT)}  {os.path.getsize(path) // 1024} KB")


def draw_wrapped(size, strokes, width_scale=1.0, supersample=2):
    """경계를 넘는 선을 반대편에도 그려 이음매 없는 타일을 만든다. strokes: [(points, width, value)]"""
    s = size * supersample
    img = Image.new("F", (s, s), 0.0)
    draw = ImageDraw.Draw(img)
    for pts, width, value in strokes:
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                p = [((x + ox) * supersample, (y + oy) * supersample) for x, y in pts]
                draw.line(p, fill=float(value), width=max(1, int(round(width * supersample * width_scale))), joint="curve")
    return np.array(img.resize((size, size), Image.BILINEAR))


def curve_points(x, y, length, angle, bend, wiggle, r, steps=14):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = angle + bend * (t - 0.5) + wiggle * math.sin(t * math.pi * 2 + r.random() * 6)
        if i == 0:
            px, py = x, y
        else:
            px += math.cos(a) * length / steps
            py += math.sin(a) * length / steps
        pts.append((px, py))
    return pts


# ───────────────────────────── 한지 ─────────────────────────────
def make_hanji(size=2048, seed=7):
    print("한지")
    r = rng(seed)
    # 닥섬유 두께 차이에서 오는 구름무늬
    cloud = fbm(size, 8, 6, seed, gain=0.6)
    cloud = (cloud - cloud.mean()) / (cloud.std() + 1e-6)

    # 섬유: 가늘고 긴 반투명 결 (세 가지 크기)
    strokes_dark, strokes_light, strokes_height = [], [], []
    for count, length, width in ((2600, (20, 90), (0.6, 1.2)), (650, (80, 260), (0.8, 1.8)), (90, (260, 620), (1.2, 2.4))):
        for _ in range(count):
            x, y = r.random() * size, r.random() * size
            pts = curve_points(x, y, r.uniform(*length), r.random() * math.pi * 2, r.uniform(-1.2, 1.2), r.uniform(0, 0.25), r)
            w = r.uniform(*width)
            v = r.uniform(0.35, 1.0)
            if r.random() < 0.62:
                strokes_light.append((pts, w, v))
            else:
                strokes_dark.append((pts, w * 0.8, v))
            strokes_height.append((pts, w, v))
    light = draw_wrapped(size, strokes_light)
    dark = draw_wrapped(size, strokes_dark)
    fib_h = draw_wrapped(size, strokes_height)

    # 껍질 티끌 (드물게 박힌 갈색 조각)
    flecks = []
    for _ in range(140):
        x, y = r.random() * size, r.random() * size
        pts = curve_points(x, y, r.uniform(3, 14), r.random() * math.pi * 2, r.uniform(-0.6, 0.6), 0.0, r, steps=4)
        flecks.append((pts, r.uniform(1.2, 3.2), r.uniform(0.5, 1.0)))
    fleck = draw_wrapped(size, flecks)

    grain = r.random((size, size))
    grain = blur_wrap(grain, 0.7)

    base = np.array([0.925, 0.900, 0.840])           # 따뜻한 미색
    tint = np.array([0.985, 0.975, 0.950])
    col = base[None, None, :] * (1 + 0.016 * cloud[..., None])
    col = col * (1 - 0.10 * dark[..., None]) + (tint - col) * 0.55 * light[..., None]
    col = col * (1 - 0.55 * fleck[..., None] * np.array([0.55, 0.62, 0.75]))
    col += (grain[..., None] - 0.5) * 0.035
    albedo = to_u8(col)
    save_jpg(albedo, os.path.join(TEX, "T_Hanji_D.jpg"))

    height = 0.55 * cloud * 0.15 + 0.9 * blur_wrap(fib_h, 0.8) + 0.5 * (grain - 0.5) + 0.6 * fleck
    save_png(normal_from_height(height, 2.2), os.path.join(TEX, "T_Hanji_N.png"))
    # 메뉴·카드용 작은 한지 타일
    small = Image.fromarray(albedo).resize((512, 512), Image.LANCZOS)
    os.makedirs(UI, exist_ok=True)
    small.save(os.path.join(UI, "UI_Paper.png"), optimize=True)
    print(f"  Content/Slate/StampOmok/UI_Paper.png")
    return albedo


# ───────────────────────────── 마루 (바닥 나무) ─────────────────────────────
def make_maru(size=2048, seed=11):
    """소나무 마루: 통나무를 비스듬히 켠 널(판재 무늬 아치) + 결 방향으로 늘어난 물관 줄무늬"""
    print("마루")
    planks = 8                       # 가로로 8장 (타일 이음매가 널 경계에 걸림)
    pw = size // planks
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    u = (xx % pw) / pw               # 널 안의 가로 위치 (0~1)
    v = yy / size                    # 결 방향 위치 (0~1, 주기 1로 이어짐)
    plank_id = (xx // pw).astype(int)

    # 결 방향으로 16배 늘린 노이즈 = 물관·잔결
    def streaks(seed_, cells_x, cells_y):
        n = tileable_value_noise(size, cells_x, seed_)
        small = Image.fromarray((n * 255).astype(np.uint8)).resize((size, size // cells_y * 1 or 1), Image.BILINEAR)
        return np.array(small.resize((size, size), Image.BICUBIC)).astype(np.float64) / 255

    warp = fbm(size, 6, 4, seed, gain=0.5) - 0.5
    pores = streaks(seed + 3, 512, 16)
    fine = streaks(seed + 4, 256, 8)
    col = np.zeros((size, size, 3))
    height = np.zeros((size, size))
    early = np.array([196, 150, 98]) / 255     # 춘재 (밝은 결)
    late = np.array([150, 102, 60]) / 255      # 추재 (진한 결)
    for p in range(planks):
        m = plank_id == p
        pr = rng(seed * 31 + p)
        # 통나무 중심에서 떨어진 거리 = 나이테 반지름. 켠 깊이가 v를 따라 주기적으로 변해 아치가 생김
        cx = pr.uniform(-1.4, -0.35) if pr.random() < 0.5 else pr.uniform(1.35, 2.4)   # 통나무 중심은 널 밖 → 닫힌 고리 없음
        depth = pr.uniform(1.0, 1.9) + 0.32 * np.sin(2 * np.pi * (v + pr.random())) + 0.12 * np.sin(4 * np.pi * (v + pr.random()))
        radius = np.sqrt(((u - cx) * 1.0) ** 2 + depth ** 2)
        density = pr.uniform(11, 17)
        ringc = radius * density + 0.35 * warp + 0.12 * (fine - 0.5)
        f = ringc - np.floor(ringc)
        # 춘재→추재 전환은 완만, 추재→다음 해 춘재는 급격
        band = (np.clip((f - 0.70) / 0.23, 0, 1) ** 1.6 * (f < 0.93) + np.clip((1 - f) / 0.07, 0, 1) * (f >= 0.93)) * 0.85
        tint = pr.uniform(0.9, 1.08)
        c = early[None, None, :] * (1 - band[..., None]) + late[None, None, :] * band[..., None]
        c = c * tint * (0.9 + 0.16 * pores[..., None]) * (0.96 + 0.08 * fine[..., None])
        col[m] = c[m]
        height[m] = (0.8 * (1 - band) + 0.25 * pores)[m]
    # 널 사이 홈과 모서리 그늘
    seam = np.minimum(u, 1 - u) * pw
    groove = np.clip(1 - seam / 2.5, 0, 1)
    edge = np.clip(1 - seam / 14, 0, 1) ** 2
    col *= (1 - 0.6 * groove - 0.08 * edge)[..., None]
    height -= 2.0 * groove + 0.2 * edge
    # 세월에 닳은 얼룩과 윤
    wear = fbm(size, 3, 4, seed + 5)
    col *= (0.88 + 0.22 * wear)[..., None]
    save_jpg(to_u8(col), os.path.join(TEX, "T_Maru_D.jpg"), quality=90)
    save_png(normal_from_height(height, 3.0), os.path.join(TEX, "T_Maru_N.png"))


# ───────────────────────────── 도장 인면 ─────────────────────────────
def glyph_mask(size, ch, font_path, box, weight=900, offset=(0, 0), rotate=0.0):
    """한자를 box(정사각형 한 변 비율) 안에 꽉 차게 그린 마스크"""
    font = ImageFont.truetype(font_path, int(size * box))
    try:
        font.set_variation_by_axes([weight])
    except Exception:
        pass
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    l, t, rr, b = d.textbbox((0, 0), ch, font=font)
    w, h = rr - l, b - t
    scale = box * size / max(w, h)
    font = ImageFont.truetype(font_path, int(size * box * scale))
    try:
        font.set_variation_by_axes([weight])
    except Exception:
        pass
    l, t, rr, b = d.textbbox((0, 0), ch, font=font)
    w, h = rr - l, b - t
    x = (size - w) / 2 - l + offset[0] * size
    y = (size - h) / 2 - t + offset[1] * size
    d.text((x, y), ch, fill=255, font=font)
    if rotate:
        img = img.rotate(rotate, resample=Image.BICUBIC)
    return np.array(img).astype(np.float64) / 255


def disc(size, radius, cx=0.5, cy=0.5, feather=1.5):
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.hypot(xx + 0.5 - cx * size, yy + 0.5 - cy * size)
    return np.clip((radius * size - d) / feather + 0.5, 0, 1)


def ring(size, radius, width, feather=1.5):
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.hypot(xx + 0.5 - size / 2, yy + 0.5 - size / 2)
    return np.clip((width * size / 2 - np.abs(d - radius * size)) / feather + 0.5, 0, 1)


def square_frame(size, half, width, feather=1.5):
    yy, xx = np.mgrid[0:size, 0:size]
    cx = np.abs(xx + 0.5 - size / 2) / size
    cy = np.abs(yy + 0.5 - size / 2) / size
    outer = np.clip((half - np.maximum(cx, cy)) * size / feather + 0.5, 0, 1)
    inner = np.clip((half - width - np.maximum(cx, cy)) * size / feather + 0.5, 0, 1)
    return outer - inner


def ink_grunge(mask, size, seed, edge=0.035, voids=0.12):
    """인주가 고르게 묻지 않은 느낌: 가장자리 갉힘 + 안쪽 빈 점 + 농도 차이"""
    r = rng(seed)
    n_edge = fbm(size, 16, 4, seed)
    n_void = fbm(size, 48, 3, seed + 7)
    n_dens = fbm(size, 6, 3, seed + 13)
    speck = r.random((size, size))
    soft = blur_wrap(mask, 2.0)
    # 가장자리(soft가 0.5 근처)를 노이즈로 깎음
    m = np.clip((soft - 0.5 + (n_edge - 0.5) * edge * 8) * 6 + 0.5, 0, 1) * (mask > 0.02)
    m = np.minimum(m, np.clip(mask * 1.4, 0, 1))
    hole = (n_void > 1 - voids).astype(np.float64) * 0.85
    m *= 1 - blur_wrap(hole, 1.2)
    m *= 1 - (speck > 0.985) * 0.9
    m *= 0.78 + 0.22 * n_dens
    return np.clip(m, 0, 1)


def make_seals(serif_font, size=1024):
    print("도장 인면")
    outputs = {}
    for variant in range(3):
        r = rng(100 + variant)
        rot = r.uniform(-2.5, 2.5)
        off = (r.uniform(-0.006, 0.006), r.uniform(-0.006, 0.006))
        # 주홍(朱): 꽉 찬 원에 흰 글씨 — 백문인
        body = disc(size, 0.475)
        g = glyph_mask(size, "朱", serif_font, 0.56, offset=off, rotate=rot)
        inner_ring = ring(size, 0.40, 0.030)
        shu = np.clip(body - g - inner_ring, 0, 1)
        shu = ink_grunge(shu, size, 300 + variant)
        save_png(to_u8(shu), os.path.join(TEX, f"T_Seal_Shu_{variant}.png"), mode="L")
        # 쪽빛(藍): 굵은 고리 + 네모 인면 + 색 글씨 — 주문인
        outer = ring(size, 0.445, 0.075)
        frame = square_frame(size, 0.255, 0.035)
        g2 = glyph_mask(size, "藍", serif_font, 0.40, offset=off, rotate=rot)
        wash = disc(size, 0.43) * 0.10
        ai = np.clip(np.maximum.reduce([outer, frame, g2, wash]), 0, 1)
        ai = ink_grunge(ai, size, 400 + variant, voids=0.09)
        save_png(to_u8(ai), os.path.join(TEX, f"T_Seal_Ai_{variant}.png"), mode="L")
        outputs[(0, variant)] = shu
        outputs[(1, variant)] = ai
    # UI 아이콘: 인주 색을 입힌 투명 PNG
    for player, ink, name in ((0, INK_SHU, "Shu"), (1, INK_AI, "Ai")):
        m = outputs[(player, 0)]
        rgba = np.zeros((size, size, 4), np.uint8)
        rgba[..., 0], rgba[..., 1], rgba[..., 2] = ink
        rgba[..., 3] = to_u8(m)
        img = Image.fromarray(rgba, "RGBA").resize((512, 512), Image.LANCZOS)
        img.save(os.path.join(UI, f"UI_Seal_{name}.png"), optimize=True)
        print(f"  Content/Slate/StampOmok/UI_Seal_{name}.png")


# ───────────────────────────── 겹쳐 그리는 표시들 ─────────────────────────────
def make_overlays():
    print("표시용 마스크")
    s = 512
    save_png(to_u8(ring(s, 0.44, 0.07, feather=2.5)), os.path.join(TEX, "T_Mask_Ring.png"), mode="L")
    yy, xx = np.mgrid[0:s, 0:s]
    d = np.hypot(xx + 0.5 - s / 2, yy + 0.5 - s / 2) / (s / 2)
    save_png(to_u8(np.clip(1 - d, 0, 1) ** 1.6), os.path.join(TEX, "T_Mask_Glow.png"), mode="L")
    # 막힘 표시 ✕ (붓으로 그은 두 획)
    img = Image.new("L", (s * 2, s * 2), 0)
    dr = ImageDraw.Draw(img)
    for (a, b) in (((0.2, 0.2), (0.8, 0.8)), ((0.8, 0.2), (0.2, 0.8))):
        dr.line([(a[0] * s * 2, a[1] * s * 2), (b[0] * s * 2, b[1] * s * 2)], fill=255, width=int(s * 0.16))
    xm = np.array(img.resize((s, s), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))) / 255
    save_png(to_u8(ink_grunge(xm, s, 77, voids=0.05)), os.path.join(TEX, "T_Mask_X.png"), mode="L")
    # 가운데 십자 (한지에 찍힌 옅은 표시)
    img = Image.new("L", (s, s), 0)
    dr = ImageDraw.Draw(img)
    dr.line([(s * 0.1, s / 2), (s * 0.9, s / 2)], fill=255, width=7)
    dr.line([(s / 2, s * 0.1), (s / 2, s * 0.9)], fill=255, width=7)
    dr.ellipse([s * 0.42, s * 0.42, s * 0.58, s * 0.58], outline=255, width=5)
    save_png(np.array(img.filter(ImageFilter.GaussianBlur(1.0))), os.path.join(TEX, "T_Mask_Cross.png"), mode="L")
    save_png(np.full((8, 8), 255, np.uint8), os.path.join(TEX, "T_Mask_Solid.png"), mode="L")


# ───────────────────────────── 소리 ─────────────────────────────
SR = 44100


def write_wav(path, x, sr=SR, fade_out=0.015):
    """16비트 모노 WAV. 반복용이 아니면 끝을 짧게 줄여 '틱' 소리를 막는다"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    x = np.asarray(x, dtype=np.float64).copy()
    if fade_out > 0:
        m = min(len(x), int(fade_out * sr))
        x[-m:] *= np.linspace(1, 0, m)
    peak = np.max(np.abs(x)) + 1e-9
    x = x / peak * 0.89
    data = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())
    print(f"  {os.path.relpath(path, ROOT)}  {os.path.getsize(path) // 1024} KB")


def biquad(x, kind, f0, q, sr=SR):
    """RBJ 쿡북 2차 필터 (f0는 상수 또는 샘플별 배열)"""
    n = len(x)
    f0 = np.broadcast_to(np.asarray(f0, dtype=np.float64), (n,))
    y = np.zeros(n)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(n):
        w0 = 2 * math.pi * f0[i] / sr
        alpha = math.sin(w0) / (2 * q)
        cw = math.cos(w0)
        if kind == "bp":
            b0, b1, b2 = alpha, 0.0, -alpha
        elif kind == "lp":
            b0 = b2 = (1 - cw) / 2
            b1 = 1 - cw
        else:  # hp
            b0 = b2 = (1 + cw) / 2
            b1 = -(1 + cw)
        a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
        yi = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1, y2, y1 = x1, x[i], y1, yi
        y[i] = yi
    return y


def env(n, attack, decay, sr=SR):
    t = np.arange(n) / sr
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def sweep_sine(n, f0, f1, sr=SR):
    t = np.arange(n) / sr
    f = f0 * (f1 / f0) ** (t / t[-1])
    return np.sin(2 * np.pi * np.cumsum(f) / sr)


def pluck(freq, dur, sr=SR, bright=0.55, seed=0, decay=0.996):
    """Karplus–Strong 뜯는 현 (가야금 느낌)"""
    r = rng(seed)
    n = int(dur * sr)
    period = int(sr / freq)
    buf = r.uniform(-1, 1, period)
    buf = biquad(np.concatenate([buf, buf]), "lp", sr * bright * 0.25, 0.7, sr)[period:]
    out = np.zeros(n)
    for i in range(n):
        j = i % period
        v = buf[j]
        nxt = buf[(j + 1) % period]
        buf[j] = decay * 0.5 * (v + nxt)
        out[i] = v
    # 몸통 울림
    body = biquad(out, "bp", freq * 2.0, 1.2, sr) * 0.35
    a = np.clip(np.arange(n) / (0.004 * sr), 0, 1)
    return (out + body) * a


def make_sounds():
    print("효과음")
    r = rng(5)
    # 도장 쿵: 낮은 울림 + 종이 마찰 + 인주 떨어지는 '찍'
    n = int(0.55 * SR)
    thump = sweep_sine(n, 150, 42) * env(n, 0.003, 0.11)
    paper = biquad(r.uniform(-1, 1, n), "bp", 1600, 0.9) * env(n, 0.001, 0.035)
    body = biquad(r.uniform(-1, 1, n), "lp", 320, 0.7) * env(n, 0.002, 0.07) * 1.6
    m = int(0.30 * SR)
    stick = np.zeros(n)
    stick[m:] = biquad(r.uniform(-1, 1, n - m), "bp", 3400, 2.5) * env(n - m, 0.002, 0.018) * 0.35
    write_wav(os.path.join(AUD, "SFX_Stamp.wav"), thump * 1.1 + paper * 0.6 + body + stick)

    # 막힘: 나무끼리 딱 부딪힘
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    knock = (np.sin(2 * np.pi * 186 * t) + 0.6 * np.sin(2 * np.pi * 431 * t) + 0.3 * np.sin(2 * np.pi * 977 * t)) * env(n, 0.001, 0.05)
    click = biquad(r.uniform(-1, 1, n), "bp", 2200, 1.5) * env(n, 0.0005, 0.012)
    k2 = np.zeros(n)
    k2[int(0.11 * SR):] = knock[: n - int(0.11 * SR)] * 0.45
    write_wav(os.path.join(AUD, "SFX_Blocked.wav"), knock + click * 0.8 + k2)

    # 팔 뻗기: 놋쇠 관절이 드르륵 + 바람
    n = int(0.95 * SR)
    whoosh = biquad(r.uniform(-1, 1, n), "bp", np.geomspace(380, 1800, n), 1.1) * np.sin(np.linspace(0, np.pi, n)) ** 1.5
    ratchet = np.zeros(n)
    for k in range(14):
        p = int((0.05 + k * 0.055) * SR)
        if p + 600 < n:
            ratchet[p:p + 600] += biquad(r.uniform(-1, 1, 600), "bp", 4200 + 300 * (k % 3), 4) * env(600, 0.0003, 0.002)
    write_wav(os.path.join(AUD, "SFX_Arm.wav"), whoosh * 0.55 + ratchet * 0.35)

    # 자 내려놓기: 아크릴이 종이에 닿는 소리
    n = int(0.35 * SR)
    clack = biquad(r.uniform(-1, 1, n), "bp", 2800, 2.2) * env(n, 0.0005, 0.02)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 620 * t) * env(n, 0.001, 0.04) * 0.4
    slide = biquad(r.uniform(-1, 1, n), "bp", 900, 0.8) * env(n, 0.02, 0.08) * 0.25
    write_wav(os.path.join(AUD, "SFX_Ruler.wav"), clack + tone + slide)

    # 판정 훑기
    n = int(1.0 * SR)
    sweep = biquad(r.uniform(-1, 1, n), "bp", np.geomspace(600, 4200, n), 5) * np.sin(np.linspace(0, np.pi, n))
    write_wav(os.path.join(AUD, "SFX_Sweep.wav"), sweep)

    # 승리: 평조 아르페지오 (가야금)
    notes = [392.0, 440.0, 523.25, 587.33, 783.99]
    n = int(3.2 * SR)
    out = np.zeros(n)
    for i, f in enumerate(notes):
        p = int(i * 0.13 * SR)
        s = pluck(f, 3.2 - i * 0.13, seed=50 + i)
        out[p:p + len(s)] += s[: n - p] * (0.9 if i < 4 else 1.2)
    write_wav(os.path.join(AUD, "SFX_Win.wav"), out)

    # 실패: 낮게 두 번 뜯음
    n = int(1.6 * SR)
    out = np.zeros(n)
    for i, f in enumerate((293.66, 220.0)):
        p = int(i * 0.22 * SR)
        s = pluck(f, 1.6 - i * 0.22, seed=60 + i)
        out[p:p + len(s)] += s[: n - p]
    write_wav(os.path.join(AUD, "SFX_Fail.wav"), out)

    # 딸깍 (버튼·기준점)
    n = int(0.08 * SR)
    tick = biquad(r.uniform(-1, 1, n), "bp", 3000, 3) * env(n, 0.0003, 0.006) + np.sin(2 * np.pi * 1400 * np.arange(n) / SR) * env(n, 0.0005, 0.01) * 0.3
    write_wav(os.path.join(AUD, "SFX_Tick.wav"), tick)

    # 차례 넘기기: 한지 넘기는 바스락
    n = int(0.8 * SR)
    am = np.abs(biquad(r.uniform(-1, 1, n), "lp", 30, 0.7))
    am = am / am.max()
    rustle = biquad(r.uniform(-1, 1, n), "hp", 2500, 0.7) * am * np.sin(np.linspace(0, np.pi, n)) ** 0.7
    write_wav(os.path.join(AUD, "SFX_Handoff.wav"), rustle)


def make_ambience(seconds=24, sr=32000):
    """마루 위 오후: 바람과 먼 새소리. 처음과 끝을 겹쳐 이음매 없이 반복"""
    print("환경음")
    r = rng(9)
    n = seconds * sr
    fade = sr * 2
    total = n + fade
    brown = np.cumsum(r.uniform(-1, 1, total))
    brown = brown - np.convolve(brown, np.ones(4000) / 4000, mode="same")
    wind = biquad(brown, "lp", 420, 0.7, sr)
    swell = 0.55 + 0.45 * np.sin(np.linspace(0, 2 * np.pi * 3, total) + 1.3)
    leaves = biquad(r.uniform(-1, 1, total), "hp", 3500, 0.7, sr) * (0.2 + 0.8 * swell ** 3) * 0.05
    out = wind / (np.abs(wind).max() + 1e-9) * swell * 0.5 + leaves
    # 먼 새소리 (짧은 주파수 미끄럼 두세 번)
    t_bird = 1.5
    while t_bird < seconds - 1.5:
        for k in range(int(r.integers(2, 4))):
            m = int(r.uniform(0.07, 0.13) * sr)
            f0 = r.uniform(2800, 4200)
            f1 = f0 * r.uniform(1.15, 1.5)
            chirp = sweep_sine(m, f0, f1, sr) * np.sin(np.linspace(0, np.pi, m)) ** 2 * 0.06
            p = int((t_bird + k * 0.16) * sr)
            out[p:p + m] += chirp
        t_bird += r.uniform(4.0, 7.5)
    loop = out[:n].copy()
    x = np.linspace(0, 1, fade)
    loop[:fade] = out[:fade] * x + out[n:n + fade] * (1 - x)
    write_wav(os.path.join(AUD, "AMB_Maru.wav"), loop, sr, fade_out=0)


def make_music(sr=32000):
    """가야금 느낌의 느린 평조 선율 (Karplus–Strong), 반복용"""
    print("음악")
    scale = [196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25]   # 평조 (솔라도레미)
    beat = 60 / 54
    phrase = [
        (5, 2), (4, 1), (3, 1), (4, 3), (2, 1),
        (3, 2), (2, 1), (1, 1), (2, 3), (0, 1),
        (1, 2), (2, 1), (4, 1), (5, 2), (4, 2),
        (3, 1), (2, 1), (1, 2), (0, 4),
    ]
    total_beats = sum(b for _, b in phrase) * 2
    n = int(total_beats * beat * sr) + sr * 4
    out = np.zeros(n)
    t = 0.0
    seed = 0
    for rep in range(2):
        for idx, beats in phrase:
            f = scale[idx] * (1 if rep == 0 else 1)
            dur = min(beats * beat + 1.8, 5.0)
            s = pluck(f, dur, sr, seed=seed)
            seed += 1
            p = int(t * sr)
            out[p:p + len(s)] += s[: max(0, min(len(s), n - p))] * (0.8 + 0.2 * (beats > 1))
            # 낮은 옥타브 받침 (마디 머리)
            if beats >= 2 and rep == 1:
                lo = pluck(scale[idx] / 2, dur, sr, seed=seed + 500) * 0.35
                out[p:p + len(lo)] += lo[: max(0, min(len(lo), n - p))]
            t += beats * beat
    loop_len = int(total_beats * beat * sr)
    tail = out[loop_len:loop_len + sr * 4]
    loop = out[:loop_len].copy()
    loop[: len(tail)] += tail                     # 꼬리 울림을 처음에 겹쳐 이음매를 숨김
    write_wav(os.path.join(AUD, "MUS_Gayageum.wav"), loop, sr, fade_out=0)


# ───────────────────────────── 글꼴 부분집합 ─────────────────────────────
def subset_fonts(font_dir):
    print("글꼴 부분집합")
    chars = set()
    for cp in range(0xAC00, 0xD7A4):                  # KS X 1001 완성형 2,350자
        ch = chr(cp)
        try:
            # 파이썬 euc-kr은 8바이트 확장으로 모든 음절을 인코딩하므로, 2바이트인 것만 KS X 1001 완성형
            if len(ch.encode("euc-kr")) == 2:
                chars.add(cp)
        except UnicodeEncodeError:
            pass
    for cp in range(0x20, 0x7F):
        chars.add(cp)
    for ch in "·×±°…←→↑↓◀▶−–—“”‘’「」『』《》、。％":
        chars.add(ord(ch))
    # 소스에 쓰인 글자 전부 (KS X 1001 밖 글자도 빠지지 않게)
    for base, _, files in os.walk(os.path.join(ROOT, "Source")):
        for f in files:
            if f.endswith((".cpp", ".h")):
                with open(os.path.join(base, f), encoding="utf-8-sig") as fh:
                    chars.update(ord(c) for c in fh.read() if ord(c) >= 0xAC00 and ord(c) < 0xD7A4)
    os.makedirs(FONTS_OUT, exist_ok=True)
    uni = ",".join(f"U+{c:04X}" for c in sorted(chars))
    for name in ("GowunBatang-Bold.ttf", "GowunBatang-Regular.ttf", "GowunDodum-Regular.ttf"):
        src = os.path.join(font_dir, name)
        dst = os.path.join(FONTS_OUT, name)
        subprocess.run([sys.executable, "-m", "fontTools.subset", src, f"--unicodes={uni}", f"--output-file={dst}",
                        "--layout-features=*", "--no-hinting", "--desubroutinize"], check=True)
        print(f"  {os.path.relpath(dst, ROOT)}  {os.path.getsize(dst) // 1024} KB")
    lic = os.path.join(font_dir, "OFL.txt")
    if os.path.exists(lic):
        with open(lic, encoding="utf-8") as fh, open(os.path.join(FONTS_OUT, "OFL.txt"), "w", encoding="utf-8") as out:
            out.write("Gowun Batang, Gowun Dodum — SIL Open Font License 1.1\n\n" + fh.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", required=True, help="OFL 글꼴이 있는 폴더")
    ap.add_argument("--only", default="", help="쉼표로 구분: hanji,maru,seals,overlays,sounds,ambience,music,fonts")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    want = lambda k: not only or k in only
    if want("hanji"):
        make_hanji()
    if want("maru"):
        make_maru()
    if want("seals"):
        make_seals(os.path.join(args.fonts, "NotoSerifTC[wght].ttf"))
    if want("overlays"):
        make_overlays()
    if want("sounds"):
        make_sounds()
    if want("ambience"):
        make_ambience()
    if want("music"):
        make_music()
    if want("fonts"):
        subset_fonts(args.fonts)


if __name__ == "__main__":
    main()
