"""연구 1: 시청 집중도 횡단 분석 (RQ2-A′).

사용법
    python -m analysis.concentration                 # 가장 최근 스냅샷
    python -m analysis.concentration --date 2026-11-25

출력: analysis/out/study1_*.csv, study1_summary.json, paper/figures/fig1_*.png
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from analysis.stats import bootstrap_diff, count_at_least, gini, top_share
from collector.polite import ROOT, load_settings

OUT = ROOT / "analysis" / "out"
FIG = ROOT / "paper" / "figures"
PLATFORMS = ["chzzk", "soop"]
PF_KO = {"chzzk": "치지직", "soop": "숲(SOOP)"}


def load_snapshot(date: str | None = None) -> tuple[str, pd.DataFrame]:
    settings = load_settings()
    con = sqlite3.connect(ROOT / settings["paths"]["db"])
    if date is None:
        date = con.execute("SELECT max(snapshot_date) FROM snapshots").fetchone()[0]
    df = pd.read_sql_query("SELECT * FROM rankings WHERE snapshot_date=? ORDER BY rank", con, params=(date,))
    return date, df


def platform_values(df: pd.DataFrame, platform: str, *, include_both=False, games_only=False,
                    drop_top1=False, include_sports=False) -> np.ndarray:
    """플랫폼별 30일 평균 동접 배열(내림차순)."""
    pf = df["platform"] == platform
    if include_both:
        pf |= df["platform"] == "both"
    sub = df[pf]
    if not include_sports:
        sub = sub[sub["category"] != "스포츠"]
    if games_only:
        sub = sub[sub["category"] == "게임"]
    vals = np.sort(sub["avg_ccv_30d"].to_numpy(dtype=float))[::-1]
    return vals[1:] if drop_top1 else vals


SCENARIOS = {
    "main": {},
    "drop_top1": {"drop_top1": True},
    "include_simulcast": {"include_both": True},
    "games_only": {"games_only": True},
}


def describe(df: pd.DataFrame, top_ns, thresholds, reps, seed) -> pd.DataFrame:
    records = []
    for scen, kw in SCENARIOS.items():
        vals = {p: platform_values(df, p, **kw) for p in PLATFORMS}
        for n in top_ns:
            tops = {p: vals[p][:n] for p in PLATFORMS}
            if min(len(t) for t in tops.values()) < n:
                note = f"표본 부족(치지직 {len(tops['chzzk'])}, 숲 {len(tops['soop'])})"
            else:
                note = ""
            row = {"scenario": scen, "top_n": n, "note": note}
            for p in PLATFORMS:
                t = tops[p]
                row[f"{p}_n"] = len(t)
                row[f"{p}_sum"] = int(t.sum())
                row[f"{p}_top10_share"] = top_share(t, 10)
                row[f"{p}_top3_share"] = top_share(t, 3)
                row[f"{p}_gini"] = gini(t)
                for th in thresholds:
                    row[f"{p}_ge{th}"] = count_at_least(t, th)
            for metric, fn in (("top10_share", lambda x: top_share(x, 10)),
                               ("top3_share", lambda x: top_share(x, 3)), ("gini", gini)):
                est, lo, hi = bootstrap_diff(tops["chzzk"], tops["soop"], fn, reps, seed)
                row[f"diff_{metric}_soop_minus_chzzk"] = est
                row[f"diff_{metric}_ci_lo"] = lo
                row[f"diff_{metric}_ci_hi"] = hi
            records.append(row)
    return pd.DataFrame(records)


def full_list_counts(df: pd.DataFrame, thresholds) -> pd.DataFrame:
    """명단 전체(스포츠·동시 송출 제외)의 플랫폼별 규모 분포."""
    rows = []
    for p in PLATFORMS:
        v = platform_values(df, p)
        r = {"platform": p, "n": len(v), "sum_ccv": int(v.sum()), "median": float(np.median(v)),
             "min": int(v.min()), "max": int(v.max()), "under_50": int((v < 50).sum())}
        for th in thresholds:
            r[f"ge{th}"] = count_at_least(v, th)
        rows.append(r)
    return pd.DataFrame(rows)


def figures(df: pd.DataFrame, date: str) -> list[str]:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.family"] = "NanumGothic"
    plt.rcParams["axes.unicode_minus"] = False
    FIG.mkdir(parents=True, exist_ok=True)
    colors = {"chzzk": "#00A86B", "soop": "#2F6FEB"}
    paths = []

    # 그림 1: 순위-규모 (로그)
    fig, ax = plt.subplots(figsize=(7, 4.2), dpi=150)
    for p in PLATFORMS:
        v = platform_values(df, p)[:150]
        ax.plot(np.arange(1, len(v) + 1), v, marker="o", ms=2.5, lw=1.2, label=PF_KO[p], color=colors[p])
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("플랫폼 내 순위 (로그)"); ax.set_ylabel("30일 평균 동시 시청자 (로그)")
    ax.set_title(f"그림 1. 개인 방송인 순위-규모 분포 (상위 150명, {date})")
    ax.grid(alpha=0.3, which="both"); ax.legend()
    p1 = FIG / "fig1_rank_size.png"; fig.tight_layout(); fig.savefig(p1); plt.close(fig)
    paths.append(str(p1.relative_to(ROOT)))

    # 그림 2: 로렌츠 곡선 (상위 100명)
    fig, ax = plt.subplots(figsize=(5, 5), dpi=150)
    for p in PLATFORMS:
        v = np.sort(platform_values(df, p)[:100])
        cum = np.insert(np.cumsum(v) / v.sum(), 0, 0)
        ax.plot(np.linspace(0, 1, len(cum)), cum, label=f"{PF_KO[p]} (지니 {gini(v):.3f})", color=colors[p])
    ax.plot([0, 1], [0, 1], ls="--", color="gray", lw=0.8)
    ax.set_xlabel("방송인 누적 비율 (작은 순)"); ax.set_ylabel("시청자 누적 비율")
    ax.set_title("그림 2. 상위 100명 로렌츠 곡선")
    ax.legend(); ax.grid(alpha=0.3)
    p2 = FIG / "fig2_lorenz_top100.png"; fig.tight_layout(); fig.savefig(p2); plt.close(fig)
    paths.append(str(p2.relative_to(ROOT)))
    return paths


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    args = ap.parse_args(argv)
    s = load_settings()["analysis"]
    date, df = load_snapshot(args.date)
    OUT.mkdir(parents=True, exist_ok=True)

    table = describe(df, s["top_ns"], s["viewer_thresholds"], s["bootstrap_reps"], s["random_seed"])
    table.to_csv(OUT / "study1_concentration.csv", index=False, encoding="utf-8-sig")
    counts = full_list_counts(df, s["viewer_thresholds"])
    counts.to_csv(OUT / "study1_full_list.csv", index=False, encoding="utf-8-sig")
    figs = figures(df, date)

    composition = df.groupby(["platform", "category"]).size().reset_index(name="n")
    summary = {
        "snapshot_date": date,
        "n_total": int(len(df)),
        "composition": composition.to_dict(orient="records"),
        "excluded": {"sports": int((df["category"] == "스포츠").sum()),
                     "simulcast": int((df["platform"] == "both").sum())},
        "bootstrap_reps": s["bootstrap_reps"],
        "seed": s["random_seed"],
        "figures": figs,
    }
    with open(OUT / "study1_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    pd.set_option("display.width", 200)
    main_rows = table[table.scenario == "main"]
    print(main_rows[["top_n", "chzzk_top10_share", "soop_top10_share", "diff_top10_share_soop_minus_chzzk",
                     "diff_top10_share_ci_lo", "diff_top10_share_ci_hi", "chzzk_gini", "soop_gini"]].round(4))
    print(table[["scenario", "top_n", "diff_top10_share_soop_minus_chzzk", "diff_top10_share_ci_lo",
                 "diff_top10_share_ci_hi", "diff_gini_soop_minus_chzzk", "diff_gini_ci_lo",
                 "diff_gini_ci_hi", "note"]].round(4).to_string())
    print(counts.to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
