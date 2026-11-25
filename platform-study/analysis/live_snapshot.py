"""연구 5: 실시간 전수 스냅샷 (RQ2-A, RQ2-A′ 보강).

같은 시각 플랫폼 전체 라이브를 모집단으로 보고, 시청자가 어디에 몰려 있는지 1차 자료로 잰다.
stream-rate 명단(섭외용 상위 약 550명)과 달리 소규모 구간까지 포함한다.

- 숲: 시청자순 목록을 끝까지 받은 회차(full)는 모든 방송의 동접을 안다.
- 치지직: 웹 목록이 120개까지만 나오므로, 동접 50명 이상 방송은 전부 알고(경계를 넘은 회차),
  나머지는 카테고리 합(전체 방송 수·전체 시청자)에서 뺀 값으로 안다.
  그래서 '소규모 구간의 시청자 몫'은 정확하지만 소규모 구간 내부의 분포는 모른다.

출력: analysis/out/study5_*.csv|json, paper/figures/fig5_viewer_share_by_size.png
"""
from __future__ import annotations

import json
import math
import sqlite3

import numpy as np
import pandas as pd

from analysis.concentration import FIG, OUT, PF_KO
from analysis.stats import gini
from collector.polite import ROOT, load_settings

BINS = [(0, 49, "0–49 (소규모)"), (50, 99, "50–99"), (100, 499, "100–499"), (500, 999, "500–999"),
        (1000, 4999, "1,000–4,999"), (5000, 10**9, "5,000+")]


def load():
    con = sqlite3.connect(ROOT / load_settings()["paths"]["db"])
    runs = pd.read_sql_query("SELECT * FROM audit_runs WHERE kind='baseline'", con)
    meta = pd.read_sql_query("SELECT * FROM audit_baseline_meta", con)
    base = pd.read_sql_query("SELECT * FROM audit_baseline", con)
    return runs, meta, base


def fill_tail_estimate(meta: pd.DataFrame, base: pd.DataFrame) -> pd.DataFrame:
    """full 모드에서 시간 제한으로 꼬리 일부를 못 받은 회차의 전체 시청자를 추정한다.

    시청자순 목록이라 못 받은 방송은 모두 마지막으로 받은 방송의 동접(min)보다 작다.
    그래서 전체 시청자 = 받은 합 + 못 받은 수 × 구간 [0, min-1] 의 가운데값으로 추정하고,
    오차 한계(못 받은 수 × (min-1) / 2)와 함께 기록한다. 50명 경계 아래까지 받았을 때만 쓴다.
    """
    meta = meta.copy()
    meta["total_viewers_estimated"] = 0
    meta["total_viewers_margin"] = 0.0
    for i, m in meta.iterrows():
        if pd.notna(m.total_viewers) or m["mode"] != "full" or m.crossed_threshold != 1 or pd.isna(m.total_lives):
            continue
        b = base[(base.round_id == m.round_id) & (base.platform == m.platform)].viewers.dropna()
        if b.empty:
            continue
        missing = max(0, int(m.total_lives) - len(b))
        lo = int(b.min())
        meta.loc[i, "total_viewers"] = b.sum() + missing * (lo - 1) / 2
        meta.loc[i, "total_viewers_estimated"] = 1
        meta.loc[i, "total_viewers_margin"] = missing * (lo - 1) / 2
    return meta


def usable(meta: pd.DataFrame) -> pd.DataFrame:
    """전체 방송 수·전체 시청자가 있는 회차. 50명 경계를 못 넘은 회차는 상위권 몫만 계산한다."""
    return meta.dropna(subset=["total_lives", "total_viewers"])


def snapshot_stats(b: pd.DataFrame, m: pd.Series, small_max: int) -> dict:
    v = b.viewers.dropna().astype(int).sort_values(ascending=False).to_numpy()
    total_v, total_n = float(m.total_viewers), int(m.total_lives)
    big = v[v > small_max]
    k1 = max(1, math.ceil(total_n * 0.01))
    # full: 목록을 동접 0명 꼬리까지 받았다. 수집하는 10여 분 사이 새로 켠 방송은 빠질 수 있다(빠진 수는 기록)
    full = bool(m["mode"] == "full" and len(v) and (v.min() == 0 or m.get("total_viewers_estimated", 0) == 1))
    complete_big = bool(full or m.crossed_threshold == 1)  # 50명 이상 방송을 다 셌는지
    off = b[(b.official == 1) & (b.viewers > small_max)].viewers.sum()
    out = {
        "round_id": m.round_id, "platform": m.platform, "total_lives": total_n, "total_viewers": total_v,
        "full_list": int(full), "viewers_estimated": int(m.get("total_viewers_estimated", 0) or 0),
        "viewers_margin_share": float(m.get("total_viewers_margin", 0) or 0) / total_v,
        "top1_share": v[0] / total_v if len(v) else np.nan,
        "top10_share": v[:10].sum() / total_v,
        "top1pct_n": k1, "top1pct_share": v[:k1].sum() / total_v,
        "complete_above_threshold": int(complete_big), "n_loaded": len(v), "n_missing": total_n - len(v), "min_loaded": int(v.min()) if len(v) else None,
        "small_live_share": 1 - len(big) / total_n if complete_big else np.nan,
        "small_viewer_share": (total_v - big.sum()) / total_v if complete_big else np.nan,
        "official_viewer_share": off / total_v,
        "gini_all": gini(np.concatenate([v, np.zeros(max(0, total_n - len(v)))])) if full else np.nan,
    }
    if "tier" in b and b["tier"].notna().any():
        for t in ("PARTNER", "CHALLENGER"):
            out[f"{t.lower()}_viewer_share"] = b[(b.tier == t) & (b.viewers > small_max)].viewers.sum() / total_v
    for lo, hi, label in BINS:
        if not complete_big and lo < (v.min() if len(v) else 0):
            out[f"bin_{label}"] = np.nan          # 목록에 다 안 들어온 구간
        elif lo == 0:
            out[f"bin_{label}"] = (total_v - big.sum()) / total_v
        else:
            out[f"bin_{label}"] = v[(v >= lo) & (v <= hi)].sum() / total_v
    return out


def figure(df: pd.DataFrame) -> str | None:
    if df.empty:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.family"] = "NanumGothic"
    plt.rcParams["axes.unicode_minus"] = False
    labels = [b[2] for b in BINS]
    df = df[df.complete_above_threshold == 1]
    if df.empty:
        return None
    agg = df.groupby("platform")[[f"bin_{l}" for l in labels]].mean()
    colors = ["#d9d9d9", "#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"]
    fig, ax = plt.subplots(figsize=(8, 2.8), dpi=150)
    for i, pf in enumerate(agg.index):
        left = 0
        for j, l in enumerate(labels):
            w = agg.loc[pf, f"bin_{l}"]
            ax.barh(i, w, left=left, color=colors[j], edgecolor="white", label=l if i == 0 else None)
            if w > 0.06:
                ax.text(left + w / 2, i, f"{w * 100:.0f}%", ha="center", va="center", fontsize=8,
                        color="white" if j >= 4 else "black")
            left += w
    ax.set_yticks(range(len(agg.index)), [PF_KO[p] for p in agg.index])
    ax.set_xlim(0, 1); ax.set_xlabel("전체 동시 시청자 중 비중")
    ax.set_title("그림 5. 방송 규모(동접) 구간별 시청자 몫 — 같은 시각 전체 라이브")
    ax.legend(ncol=6, fontsize=7, loc="upper center", bbox_to_anchor=(0.5, -0.32), frameon=False)
    fig.tight_layout()
    p = FIG / "fig5_viewer_share_by_size.png"; fig.savefig(p, bbox_inches="tight"); plt.close(fig)
    return str(p.relative_to(ROOT))


def main() -> int:
    small_max = load_settings()["small_max_viewers"]
    runs, meta, base = load()
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    meta = fill_tail_estimate(meta, base)
    for _, m in usable(meta).iterrows():
        b = base[(base.round_id == m.round_id) & (base.platform == m.platform)]
        if len(b):
            rows.append(snapshot_stats(b, m, small_max))
    df = pd.DataFrame(rows)
    df.to_csv(OUT / "study5_snapshots.csv", index=False, encoding="utf-8-sig")
    summary = {"n_snapshots": {pf: int((df.platform == pf).sum()) for pf in ("chzzk", "soop")} if len(df) else {},
               "figure": figure(df), "rows": df.to_dict(orient="records")}
    (OUT / "study5_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=float),
                                             encoding="utf-8")
    if len(df):
        cols = ["round_id", "platform", "total_lives", "total_viewers", "top10_share", "top1pct_share",
                "small_live_share", "small_viewer_share", "official_viewer_share", "gini_all"]
        print(df[cols].round(3).to_string(index=False))
    else:
        print("사용할 수 있는 전수 스냅샷이 없다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
