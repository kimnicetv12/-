"""연구 2: 종단 추적 (RQ4, 순위 이동성).

SQLite에 쌓인 날짜별 스냅샷으로 플랫폼별 상위권 교체율·순위 상관·신규 진입을 구한다.
지표는 '주간'(7일 간격)과 '비중첩 월간'(30일 간격) 두 가지로 낸다.
stream-rate 수치가 30일 이동평균이라 7일 간격 비교는 겹치는 기간이 23일이므로
교체율이 낮게 나오는 쪽으로 치우친다. 결론은 30일 간격 지표를 우선한다.

사용법
    python -m analysis.longitudinal
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from analysis.concentration import FIG, OUT, PF_KO, PLATFORMS
from collector.polite import ROOT, load_settings

MIN_WEEKS = 8


def load_all() -> pd.DataFrame:
    con = sqlite3.connect(ROOT / load_settings()["paths"]["db"])
    df = pd.read_sql_query("SELECT * FROM rankings", con)
    df = df[(df["category"] != "스포츠") & (df["platform"].isin(PLATFORMS))].copy()
    df["key"] = df["slug"].fillna(df["name"])
    # 플랫폼 내 순위를 다시 매긴다 (전체 순위가 아니라)
    df["pf_rank"] = df.groupby(["snapshot_date", "platform"])["avg_ccv_30d"].rank(ascending=False, method="first")
    return df


def compare(prev: pd.DataFrame, cur: pd.DataFrame) -> dict:
    out = {}
    for n in (20, 50):
        a = set(prev.loc[prev.pf_rank <= n, "key"])
        b = set(cur.loc[cur.pf_rank <= n, "key"])
        out[f"turnover_top{n}"] = 1 - len(a & b) / n
    top50 = cur[cur.pf_rank <= 50]
    out["new_to_list_in_top50"] = int((~top50["key"].isin(prev["key"])).sum())
    m = prev[["key", "pf_rank"]].merge(cur[["key", "pf_rank"]], on="key", suffixes=("_a", "_b"))
    m = m[(m.pf_rank_a <= 100) | (m.pf_rank_b <= 100)]
    out["spearman_top100"] = float(spearmanr(m.pf_rank_a, m.pf_rank_b).statistic) if len(m) > 2 else float("nan")
    out["n_matched"] = int(len(m))
    return out


def pairs(dates: list[str], gap_days: int) -> list[tuple[str, str]]:
    ds = sorted(date.fromisoformat(d) for d in dates)
    have = set(ds)
    return [(d.isoformat(), (d + timedelta(days=gap_days)).isoformat())
            for d in ds if d + timedelta(days=gap_days) in have]


def main() -> int:
    df = load_all()
    dates = sorted(df["snapshot_date"].unique())
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for gap, label in ((7, "weekly"), (30, "monthly_nonoverlap")):
        for a, b in pairs(dates, gap):
            for p in PLATFORMS:
                prev = df[(df.snapshot_date == a) & (df.platform == p)]
                cur = df[(df.snapshot_date == b) & (df.platform == p)]
                rows.append({"window": label, "from": a, "to": b, "platform": p, **compare(prev, cur)})
    res = pd.DataFrame(rows)
    res.to_csv(OUT / "study2_mobility.csv", index=False, encoding="utf-8-sig")

    span = (date.fromisoformat(dates[-1]) - date.fromisoformat(dates[0])).days if dates else 0
    summary = {"n_snapshots": len(dates), "first": dates[0] if dates else None,
               "last": dates[-1] if dates else None, "span_days": span,
               "ready": span >= MIN_WEEKS * 7, "n_pairs": int(len(res))}
    if len(res):
        agg = res.groupby(["window", "platform"])[["turnover_top20", "turnover_top50", "spearman_top100",
                                                   "new_to_list_in_top50"]].mean().reset_index()
        summary["means"] = agg.to_dict(orient="records")
        _figure(res)
    with open(OUT / "study2_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not summary["ready"]:
        print(f"주의: 수집 기간 {span}일. 최소 {MIN_WEEKS}주가 쌓여야 RQ4를 판정한다.")
    return 0


def _figure(res: pd.DataFrame) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.family"] = "NanumGothic"
    plt.rcParams["axes.unicode_minus"] = False
    w = res[res.window == "weekly"]
    if w.empty:
        return
    fig, ax = plt.subplots(figsize=(7, 4), dpi=150)
    for p, c in zip(PLATFORMS, ("#00A86B", "#2F6FEB")):
        s = w[w.platform == p]
        ax.plot(pd.to_datetime(s["to"]), s["turnover_top50"], marker="o", label=f"{PF_KO[p]} 상위 50", color=c)
        ax.plot(pd.to_datetime(s["to"]), s["turnover_top20"], marker="s", ls="--", label=f"{PF_KO[p]} 상위 20", color=c, alpha=0.6)
    ax.set_ylabel("주간 교체율"); ax.set_title("그림 3. 상위권 주간 교체율")
    ax.grid(alpha=0.3); ax.legend(); fig.autofmt_xdate(); fig.tight_layout()
    fig.savefig(FIG / "fig3_weekly_turnover.png"); plt.close(fig)


if __name__ == "__main__":
    raise SystemExit(main())
