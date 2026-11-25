"""연구 2 보조: 30일 회고 패널로 본 주간 순위 이동성 (RQ4 시범).

`daily_history`(개인 기록 페이지의 방송일별 평균 동접)를 주(월~일) 단위로 묶어 플랫폼 안 순위를 매긴다.
- 주간 규모 = 그 주 방송일의 평균 동접 평균 (방송일 2일 미만이면 그 주는 순위에서 뺀다)
- 지표: 연속한 주 사이 상위 20명 교체율, 상위 50명 순위의 스피어만 상관, 첫 주→마지막 주 교체율,
  방송인별 방송일 동접 변동계수(CV)의 중앙값
- 플랫폼 간 차이의 95% 구간: 방송인을 단위로 한 부트스트랩

한계: 표본은 기준일 명단의 상위권이라 30일 동안 떨어져 나간 방송인이 빠진다(생존자 편향).
그래서 교체율은 실제보다 낮게 나온다. 두 플랫폼에 같은 편향이 걸리므로 비교에는 쓸 수 있다.
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

TOP_TURNOVER = 20
TOP_SPEARMAN = 50
MIN_DAYS = 2


def load() -> pd.DataFrame:
    con = sqlite3.connect(ROOT / load_settings()["paths"]["db"])
    try:
        df = pd.read_sql_query("SELECT * FROM daily_history", con)
    except Exception:
        return pd.DataFrame()
    if df.empty:
        return df
    snap = df.snapshot_date.max()
    df = df[df.snapshot_date == snap].copy()
    df["day"] = pd.to_datetime(df.day)
    return df


def full_weeks(df: pd.DataFrame) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """자료 기간 안에 온전히 들어가는 월~일 주."""
    first, last = df.day.min(), df.day.max()
    start = first + pd.Timedelta(days=(7 - first.weekday()) % 7)
    weeks = []
    while start + pd.Timedelta(days=6) <= last:
        weeks.append((start, start + pd.Timedelta(days=6)))
        start += pd.Timedelta(days=7)
    return weeks


def weekly_table(df: pd.DataFrame, weeks) -> pd.DataFrame:
    rows = []
    for i, (a, b) in enumerate(weeks, 1):
        w = df[(df.day >= a) & (df.day <= b)]
        g = w.groupby(["platform", "slug"]).agg(days=("avg_ccv", "size"), ccv=("avg_ccv", "mean"),
                                                hours=("hours", "sum")).reset_index()
        g = g[g.days >= MIN_DAYS]
        g["week"] = i
        g["rank"] = g.groupby("platform")["ccv"].rank(ascending=False, method="first")
        rows.append(g)
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()


def pair_metrics(wk: pd.DataFrame, pf: str, w1: int, w2: int) -> dict:
    a = wk[(wk.platform == pf) & (wk.week == w1)]
    b = wk[(wk.platform == pf) & (wk.week == w2)]
    ta = set(a[a["rank"] <= TOP_TURNOVER].slug)
    tb = set(b[b["rank"] <= TOP_TURNOVER].slug)
    m = a[["slug", "rank"]].merge(b[["slug", "rank"]], on="slug", suffixes=("_a", "_b"))
    m = m[(m.rank_a <= TOP_SPEARMAN) | (m.rank_b <= TOP_SPEARMAN)]
    return {"platform": pf, "from_week": w1, "to_week": w2,
            "turnover_top20": 1 - len(ta & tb) / TOP_TURNOVER if len(ta) == TOP_TURNOVER else np.nan,
            "spearman_top50": float(spearmanr(m.rank_a, m.rank_b).statistic) if len(m) > 3 else np.nan,
            "mean_abs_rank_change_top50": float((m.rank_a - m.rank_b).abs().mean()) if len(m) else np.nan,
            "n_matched": len(m)}


def cv_by_streamer(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby(["platform", "slug"]).avg_ccv.agg(["mean", "std", "size"]).reset_index()
    g = g[g["size"] >= 5]
    g["cv"] = g["std"] / g["mean"]
    return g


def boot_diff_median(a, b, reps, seed):
    rng = np.random.default_rng(seed)
    a, b = np.asarray(a), np.asarray(b)
    d = [np.median(rng.choice(b, b.size)) - np.median(rng.choice(a, a.size)) for _ in range(reps)]
    return float(np.median(b) - np.median(a)), *map(float, np.quantile(d, [0.025, 0.975]))


def boot_spearman_diff(wk, weeks_pairs, reps, seed):
    """방송인을 다시 뽑아 순위를 다시 매긴 뒤, 주간 스피어만 평균의 플랫폼 차이(숲−치지직)."""
    rng = np.random.default_rng(seed)

    def mean_rho(sub):
        vals = []
        for w1, w2 in weeks_pairs:
            a, b = sub[sub.week == w1], sub[sub.week == w2]
            m = a[["slug", "ccv"]].merge(b[["slug", "ccv"]], on="slug")
            if len(m) > 3:
                vals.append(spearmanr(m.ccv_x, m.ccv_y).statistic)
        return np.mean(vals) if vals else np.nan

    def top(sub):
        keep = sub.groupby("slug").ccv.mean().sort_values(ascending=False).index[:TOP_SPEARMAN]
        return sub[sub.slug.isin(keep)]

    est = {pf: mean_rho(top(wk[wk.platform == pf])) for pf in PLATFORMS}
    diffs = []
    slugs = {pf: wk[wk.platform == pf].slug.unique() for pf in PLATFORMS}
    for _ in range(reps // 5):  # 순위 재계산이 무거워 1,000회
        r = {}
        for pf in PLATFORMS:
            pick = rng.choice(slugs[pf], slugs[pf].size)
            sub = pd.concat([wk[(wk.platform == pf) & (wk.slug == s)].assign(slug=f"{s}#{i}")
                             for i, s in enumerate(pick)])
            r[pf] = mean_rho(top(sub))
        diffs.append(r["soop"] - r["chzzk"])
    lo, hi = np.nanquantile(diffs, [0.025, 0.975])
    return est, float(est["soop"] - est["chzzk"]), float(lo), float(hi)


def figure(wk: pd.DataFrame, weeks) -> str | None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.family"] = "NanumGothic"
    plt.rcParams["axes.unicode_minus"] = False
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.8), dpi=150, sharey=True)
    for ax, pf in zip(axes, PLATFORMS):
        sub = wk[wk.platform == pf]
        last = sub[sub.week == sub.week.max()]
        top10 = last.nsmallest(10, "rank").slug
        for s in sub.slug.unique():
            t = sub[sub.slug == s].sort_values("week")
            hl = s in set(top10)
            ax.plot(t.week, t["rank"], color="#2F6FEB" if hl else "#cccccc", lw=1.4 if hl else 0.6,
                    alpha=1 if hl else 0.6, marker="o" if hl else None, ms=3)
        ax.set_title(f"{PF_KO[pf]}: 주간 순위 (마지막 주 상위 10명 강조)", fontsize=9)
        ax.set_xticks(range(1, len(weeks) + 1), [f"{a:%m/%d}~" for a, _ in weeks], fontsize=8)
        ax.set_ylim(51, 0); ax.grid(alpha=0.3)
    axes[0].set_ylabel("플랫폼 안 순위 (상위 50)")
    fig.suptitle("그림 3. 30일 회고 패널의 주간 순위 변동", fontsize=10)
    fig.tight_layout()
    p = FIG / "fig3_weekly_rank_history.png"; fig.savefig(p); plt.close(fig)
    return str(p.relative_to(ROOT))


def main() -> int:
    s = load_settings()["analysis"]
    df = load()
    OUT.mkdir(parents=True, exist_ok=True)
    if df.empty:
        print("daily_history가 비어 있다. python -m collector.streamrate_history 먼저.")
        return 0
    weeks = full_weeks(df)
    wk = weekly_table(df, weeks)
    pairs = [(i, i + 1) for i in range(1, len(weeks))]
    pm = pd.DataFrame([pair_metrics(wk, pf, a, b) for pf in PLATFORMS for a, b in pairs + [(1, len(weeks))]])
    pm.to_csv(OUT / "study2h_pairs.csv", index=False, encoding="utf-8-sig")
    cv = cv_by_streamer(df)
    cv.to_csv(OUT / "study2h_cv.csv", index=False, encoding="utf-8-sig")
    cv_diff = boot_diff_median(cv[cv.platform == "chzzk"].cv, cv[cv.platform == "soop"].cv, s["bootstrap_reps"],
                               s["random_seed"])
    rho_est, rho_diff, rho_lo, rho_hi = boot_spearman_diff(wk, pairs, s["bootstrap_reps"], s["random_seed"])
    consec = pm[pm.to_week - pm.from_week == 1]
    summary = {
        "snapshot_date": df.snapshot_date.iloc[0], "days": [str(df.day.min().date()), str(df.day.max().date())],
        "weeks": [[str(a.date()), str(b.date())] for a, b in weeks],
        "n_streamers": {pf: int(df[df.platform == pf].slug.nunique()) for pf in PLATFORMS},
        "n_pages_ok": int(df.slug.nunique()),
        "mean_turnover_top20": consec.groupby("platform").turnover_top20.mean().to_dict(),
        "mean_spearman_top50": consec.groupby("platform").spearman_top50.mean().to_dict(),
        "mean_abs_rank_change_top50": consec.groupby("platform").mean_abs_rank_change_top50.mean().to_dict(),
        "first_last_turnover_top20": pm[pm.to_week - pm.from_week > 1].set_index("platform").turnover_top20.to_dict(),
        "spearman_boot": {"chzzk": rho_est["chzzk"], "soop": rho_est["soop"], "diff_soop_minus_chzzk": rho_diff,
                          "ci": [rho_lo, rho_hi]},
        "cv_median": cv.groupby("platform").cv.median().to_dict(),
        "cv_diff_soop_minus_chzzk": {"est": cv_diff[0], "ci": [cv_diff[1], cv_diff[2]]},
        "figure": figure(wk, weeks),
    }
    (OUT / "study2h_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=float),
                                              encoding="utf-8")
    print(pm.round(3).to_string(index=False))
    print(json.dumps({k: summary[k] for k in ("n_streamers", "mean_turnover_top20", "mean_spearman_top50",
                                              "spearman_boot", "cv_median", "cv_diff_soop_minus_chzzk")},
                     ensure_ascii=False, indent=1, default=float))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
