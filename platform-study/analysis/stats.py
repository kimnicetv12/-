"""집중도 지표와 부트스트랩 공통 함수."""
from __future__ import annotations

import numpy as np


def gini(values) -> float:
    """지니계수 (0 = 완전 균등, 1 = 한 명 독점)."""
    x = np.sort(np.asarray(values, dtype=float))
    n = x.size
    if n == 0 or x.sum() == 0:
        return float("nan")
    idx = np.arange(1, n + 1)
    return float((2 * (idx * x).sum()) / (n * x.sum()) - (n + 1) / n)


def top_share(values, k: int = 10) -> float:
    """상위 k명이 전체 합에서 차지하는 비중."""
    x = np.sort(np.asarray(values, dtype=float))[::-1]
    total = x.sum()
    return float(x[:k].sum() / total) if total else float("nan")


def count_at_least(values, threshold: float) -> int:
    return int((np.asarray(values) >= threshold).sum())


def bootstrap_diff(a, b, stat, reps: int, seed: int, alpha: float = 0.05):
    """stat(b) - stat(a)의 점추정과 백분위 신뢰구간.

    각 표본 안에서 복원 추출한다. 상위 N명 명단 자체를 모집단으로 보는 근사이므로,
    "명단 구성이 조금 달랐다면" 정도의 불확실성으로 해석한다.
    """
    rng = np.random.default_rng(seed)
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    diffs = np.empty(reps)
    for i in range(reps):
        diffs[i] = stat(rng.choice(b, b.size, replace=True)) - stat(rng.choice(a, a.size, replace=True))
    lo, hi = np.quantile(diffs, [alpha / 2, 1 - alpha / 2])
    return float(stat(b) - stat(a)), float(lo), float(hi)


def bootstrap_ci(x, stat, reps: int, seed: int, alpha: float = 0.05):
    rng = np.random.default_rng(seed)
    x = np.asarray(x, dtype=float)
    vals = np.array([stat(rng.choice(x, x.size, replace=True)) for _ in range(reps)])
    lo, hi = np.quantile(vals, [alpha / 2, 1 - alpha / 2])
    return float(stat(x)), float(lo), float(hi)
