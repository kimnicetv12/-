"""연구 5b: 카테고리별 소규모 방송의 여건 (실천적 함의용).

같은 시각 전수 스냅샷에서 카테고리마다
- 방송 수, 시청자 수, 소규모 방송(동접 50명 미만) 비율
- 소규모 방송 1개당 평균 시청자 (카테고리 안의 큰 방송을 뺀 '나머지 몫')
- 카테고리 시청자 중 가장 큰 방송 1개의 몫 (알 수 있을 때)
을 구한다. "어느 카테고리에서 작은 방송도 시청자를 나눠 받는가"를 보는 기술 통계이며,
한 시각의 스냅샷이라 시간대·요일에 따라 달라질 수 있다.

- 숲: full 모드 회차의 전체 목록으로 정확히 계산한다.
- 치지직: 카테고리 페이지 응답(카테고리별 방송 수·시청자)에서, 목록으로 아는 50명 이상 방송을 빼서 계산한다.
  50명 이상 방송을 다 센 회차(경계를 넘은 회차)만 쓴다.

출력: analysis/out/study5b_categories.csv, study5b_summary.json, paper/figures/fig6_category_small.png
"""
from __future__ import annotations

import gzip
import json
import sqlite3

import numpy as np
import pandas as pd

from analysis.concentration import FIG, OUT, PF_KO
from collector.polite import ROOT, load_settings

MIN_SMALL_LIVES = 8   # 소규모 방송이 이 수 이상인 카테고리만 순위에 올린다


def load():
    con = sqlite3.connect(ROOT / load_settings()["paths"]["db"])
    meta = pd.read_sql_query("SELECT * FROM audit_baseline_meta", con)
    base = pd.read_sql_query("SELECT * FROM audit_baseline", con)
    runs = pd.read_sql_query("SELECT * FROM audit_runs WHERE kind='baseline'", con)
    return meta, base, runs


def soop_categories(b: pd.DataFrame, small_max: int) -> pd.DataFrame:
    b = b.dropna(subset=["viewers"]).copy()
    b["category"] = b["category"].fillna("(미분류)")
    b["small"] = b.viewers <= small_max
    g = b.groupby("category").agg(lives=("viewers", "size"), viewers=("viewers", "sum"),
                                  small_lives=("small", "sum"), top_live=("viewers", "max"))
    small = b[b.small].groupby("category").viewers.agg(small_viewers="sum", small_median="median")
    g = g.join(small).fillna({"small_viewers": 0})
    return g.reset_index()


def chzzk_categories(round_id: str, b: pd.DataFrame, small_max: int) -> pd.DataFrame:
    raw = ROOT / load_settings()["paths"]["raw_audit"] / round_id / "chzzk_category_responses.json.gz"
    if not raw.exists():
        return pd.DataFrame()
    cats = {}
    with gzip.open(raw, "rt", encoding="utf-8") as f:
        for r in json.load(f):
            if "size=6" in r.get("url", ""):
                continue
            try:
                for c in (json.loads(r["body"]).get("content") or {}).get("data") or []:
                    cats[c["categoryValue"]] = (c.get("openLiveCount") or 0, c.get("concurrentUserCount") or 0)
            except (ValueError, KeyError):
                continue
    g = pd.DataFrame([{"category": k, "lives": v[0], "viewers": v[1]} for k, v in cats.items()])
    big = b[b.viewers > small_max].groupby("category").viewers.agg(big_lives="size", big_viewers="sum",
                                                                     top_live="max")
    g = g.merge(big, left_on="category", right_index=True, how="left").fillna(
        {"big_lives": 0, "big_viewers": 0})
    g["small_lives"] = (g.lives - g.big_lives).clip(lower=0)
    g["small_viewers"] = (g.viewers - g.big_viewers).clip(lower=0)
    g["small_median"] = np.nan  # 치지직은 소규모 방송 하나하나의 동접을 모른다
    return g[["category", "lives", "viewers", "small_lives", "top_live", "small_viewers", "small_median"]]


def finish(g: pd.DataFrame, platform: str, round_id: str) -> pd.DataFrame:
    g = g.copy()
    g["platform"] = platform
    g["round_id"] = round_id
    g["small_share_of_lives"] = g.small_lives / g.lives
    g["small_share_of_viewers"] = g.small_viewers / g.viewers.replace(0, np.nan)
    g["viewers_per_small_live"] = g.small_viewers / g.small_lives.replace(0, np.nan)
    g["top_live_share"] = g.top_live / g.viewers.replace(0, np.nan)
    return g


def figure(df: pd.DataFrame) -> str | None:
    d = df[df.small_lives >= MIN_SMALL_LIVES]
    if d.empty:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.family"] = "NanumGothic"
    plt.rcParams["axes.unicode_minus"] = False
    pfs = [p for p in ("chzzk", "soop") if (d.platform == p).any()]
    fig, axes = plt.subplots(1, len(pfs), figsize=(5.2 * len(pfs), 4.6), dpi=150, squeeze=False)
    for ax, pf in zip(axes[0], pfs):
        x = d[d.platform == pf]
        ax.scatter(x.small_lives, x.viewers_per_small_live, s=12 + 60 * x.small_share_of_viewers.fillna(0),
                   color="#2F6FEB" if pf == "soop" else "#00A86B", alpha=0.6)
        for _, r in x.nlargest(6, "viewers_per_small_live").iterrows():
            ax.annotate(r.category, (r.small_lives, r.viewers_per_small_live), fontsize=7, xytext=(3, 3),
                        textcoords="offset points")
        for _, r in x.nlargest(3, "small_lives").iterrows():
            ax.annotate(r.category, (r.small_lives, r.viewers_per_small_live), fontsize=7, xytext=(3, -9),
                        textcoords="offset points", color="#555")
        ax.set_xscale("log")
        ax.set_xlabel("카테고리 안 소규모 방송 수 (경쟁, 로그)")
        ax.set_ylabel("소규모 방송 1개당 평균 시청자")
        ax.set_title(f"{PF_KO[pf]}", fontsize=10)
        ax.grid(alpha=0.3)
    fig.suptitle("그림 6. 카테고리별 소규모 방송의 경쟁과 시청자 몫 (점 크기 = 카테고리 시청자 중 소규모 몫)", fontsize=10)
    fig.tight_layout()
    p = FIG / "fig6_category_small.png"; fig.savefig(p); plt.close(fig)
    return str(p.relative_to(ROOT))


def main() -> int:
    small_max = load_settings()["small_max_viewers"]
    meta, base, runs = load()
    OUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for _, m in meta.iterrows():
        b = base[(base.round_id == m.round_id) & (base.platform == m.platform)]
        if m.platform == "soop" and m["mode"] == "full" and len(b) and b.viewers.min() == 0:
            frames.append(finish(soop_categories(b, small_max), "soop", m.round_id))
        elif m.platform == "chzzk" and m.crossed_threshold == 1:
            g = chzzk_categories(m.round_id, b, small_max)
            if len(g):
                frames.append(finish(g, "chzzk", m.round_id))
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    df.to_csv(OUT / "study5b_categories.csv", index=False, encoding="utf-8-sig")
    summary = {"min_small_lives": MIN_SMALL_LIVES, "figure": figure(df) if len(df) else None, "platforms": {}}
    for pf in ("chzzk", "soop"):
        d = df[(df.platform == pf) & (df.small_lives >= MIN_SMALL_LIVES)] if len(df) else df
        if not len(d):
            continue
        summary["platforms"][pf] = {
            "rounds": sorted(d.round_id.unique().tolist()),
            "n_categories": int(len(d)),
            "median_viewers_per_small_live": float(d.viewers_per_small_live.median()),
            "top": d.nlargest(10, "viewers_per_small_live")[
                ["category", "lives", "small_lives", "viewers_per_small_live", "small_share_of_viewers",
                 "top_live_share"]].to_dict(orient="records"),
            "crowded": d.nlargest(5, "small_lives")[
                ["category", "lives", "small_lives", "viewers_per_small_live", "small_share_of_viewers"]
            ].to_dict(orient="records"),
        }
    (OUT / "study5b_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=float),
                                              encoding="utf-8")
    for pf, s in summary["platforms"].items():
        print(pf, s["rounds"], "categories", s["n_categories"], "median vps", round(s["median_viewers_per_small_live"], 1))
        print(pd.DataFrame(s["top"]).round(2).to_string(index=False))
        print(pd.DataFrame(s["crowded"]).round(2).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
