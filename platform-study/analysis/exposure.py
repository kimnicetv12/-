"""연구 3: 추천 노출 감사 분석 (RQ3).

노출 비율 = (홈 추천 카드 중 소규모 방송 비율) ÷ (같은 시각 전체 라이브 중 소규모 방송 비율)
  1보다 작으면 소규모 방송이 '있는 만큼보다 덜' 추천된다.

- 추천 쪽 단위는 회차 안의 고유 채널(섹션이 달라도 같은 채널은 한 번).
- 기준선은 같은 회차의 기준선을 쓰고, 없으면 같은 날 같은 플랫폼의 가장 가까운 기준선(±3시간)을 쓴다.
- 기준선 소규모 방송 비율 = 1 - (시청자순 목록에서 센 50명 이상 방송 수 ÷ 같은 시각 전체 라이브 수).
  치지직 전체 수는 카테고리별 방송 수 합(하한)이라 소규모 방송 비율이 낮게, 노출 비율이 높게 잡힌다.
  따라서 치지직에서 노출 비율이 1보다 작게 나오면 실제 과소 노출은 그보다 더 크다(보수적 추정).
- 신뢰구간은 회차를 단위로 한 부트스트랩. 회차가 5개 미만이면 구간을 내지 않는다.

사용법
    python -m analysis.exposure
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime

import numpy as np
import pandas as pd
import yaml

from analysis.concentration import OUT, PF_KO, PLATFORMS
from collector.polite import ROOT, load_settings

MIN_ROUNDS_FOR_CI = 5
HERO_SECTIONS = {"상단 추천(프리미엄)"}


def load():
    con = sqlite3.connect(ROOT / load_settings()["paths"]["db"])
    q = lambda s: pd.read_sql_query(s, con)
    try:
        return (q("SELECT * FROM audit_runs"), q("SELECT * FROM audit_home"), q("SELECT * FROM audit_baseline"),
                q("SELECT * FROM audit_baseline_meta"))
    except Exception:
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), pd.DataFrame()


def base_share(b: pd.DataFrame, meta: pd.Series | None, small_max: int) -> tuple[float, int | None, str]:
    """기준선 소규모 방송 비율. 전체 수가 있으면 1 - (50명 이상 방송 수 ÷ 전체 라이브 수)."""
    if meta is not None and meta.get("total_lives") and meta.get("crossed_threshold"):
        n_big = int((b.viewers > small_max).sum())
        total = int(meta["total_lives"])
        return 1 - n_big / total, total, str(meta.get("total_source"))
    if len(b):
        return float((b.viewers <= small_max).mean()), len(b), "loaded rows"
    return np.nan, None, ""


def event_flags(runs: pd.DataFrame, base: pd.DataFrame) -> dict[str, int]:
    cfg = yaml.safe_load(open(ROOT / "config/events.yaml", encoding="utf-8")) or {}
    manual = {d["date"] for d in cfg.get("dates") or []}
    thr = cfg.get("auto_threshold_official_viewers", 20000)
    flags = {}
    for rid in runs["round_id"].unique():
        day = f"{rid[:4]}-{rid[4:6]}-{rid[6:8]}"
        b = base[(base.round_id == rid) & (base.official == 1)]
        flags[rid] = int(day in manual or (len(b) and b["viewers"].max() >= thr))
    return flags


def pick_baseline(rid: str, pf: str, runs: pd.DataFrame) -> str | None:
    ok = runs[(runs.kind == "baseline") & (runs.platform == pf) & (runs.status == "ok")]
    if rid in set(ok.round_id):
        return rid
    t0 = datetime.strptime(rid[:13], "%Y%m%dT%H%M")
    best, gap = None, None
    for other in ok.round_id:
        g = abs((datetime.strptime(other[:13], "%Y%m%dT%H%M") - t0).total_seconds())
        if g <= 3 * 3600 and (gap is None or g < gap):
            best, gap = other, g
    return best


def per_round(runs, home, base, meta, small_max: int, include_hero: bool) -> pd.DataFrame:
    flags = event_flags(runs, base) if len(runs) else {}
    rows = []
    for (rid, pf), g in home.groupby(["round_id", "platform"]):
        if not include_hero:
            g = g[~g.section.isin(HERO_SECTIONS)]
        g = g.dropna(subset=["viewers"]).drop_duplicates("channel_id")
        if g.empty:
            continue
        brid = pick_baseline(rid, pf, runs)
        b = base[(base.round_id == brid) & (base.platform == pf)].dropna(subset=["viewers"]) if brid else pd.DataFrame()
        run_b = runs[(runs.round_id == brid) & (runs.platform == pf) & (runs.kind == "baseline")] if brid else pd.DataFrame()
        rec_share = float((g.viewers <= small_max).mean())
        m = meta[(meta.round_id == brid) & (meta.platform == pf)] if brid and len(meta) else pd.DataFrame()
        bshare, total, tsrc = base_share(b, m.iloc[0] if len(m) else None, small_max)
        slot = runs[(runs.round_id == rid) & (runs.platform == pf) & (runs.kind == "home")]["time_slot"]
        rows.append({
            "round_id": rid, "platform": pf, "time_slot": int(slot.iloc[0]) if len(slot) else None,
            "event": flags.get(rid, 0), "n_rec": len(g), "n_rec_small": int((g.viewers <= small_max).sum()),
            "rec_small_share": rec_share, "baseline_round": brid, "n_base_loaded": len(b),
            "n_base_big": int((b.viewers > small_max).sum()) if len(b) else None,
            "total_lives": total, "total_source": tsrc, "base_small_share": bshare,
            "base_reached_end": int(run_b["reached_end"].iloc[0]) if len(run_b) else None,
            "exposure_ratio": rec_share / bshare if bshare and bshare > 0 else np.nan,
            "rec_median_viewers": float(g.viewers.median()),
            "base_median_viewers": float(b.viewers.median()) if len(b) else np.nan,
        })
    return pd.DataFrame(rows)


def ratio_ci(df: pd.DataFrame, reps: int, seed: int):
    """회차 리샘플링: 추천 소규모 방송 수 합 / 추천 수 합 ÷ 기준선 소규모 방송 비율 평균."""
    d = df.dropna(subset=["exposure_ratio"])
    if len(d) == 0:
        return np.nan, np.nan, np.nan, 0
    stat = lambda x: (x.n_rec_small.sum() / x.n_rec.sum()) / x.base_small_share.mean()
    est = float(stat(d))
    if len(d) < MIN_ROUNDS_FOR_CI:
        return est, np.nan, np.nan, len(d)
    rng = np.random.default_rng(seed)
    vals = [stat(d.iloc[rng.integers(0, len(d), len(d))]) for _ in range(reps)]
    lo, hi = np.quantile(vals, [0.025, 0.975])
    return est, float(lo), float(hi), len(d)


def section_breakdown(home: pd.DataFrame, small_max: int) -> pd.DataFrame:
    h = home.dropna(subset=["viewers"])
    tier = h["tier"] if "tier" in h else pd.Series(index=h.index, dtype=object)
    return (h.assign(small=h.viewers <= small_max, partner=tier.eq("PARTNER"), challenger=tier.eq("CHALLENGER"))
             .groupby(["platform", "section"])
             .agg(cards=("channel_id", "size"), small=("small", "sum"), median_viewers=("viewers", "median"),
                  official=("official", "sum"), partner=("partner", "sum"), challenger=("challenger", "sum"))
             .reset_index().sort_values(["platform", "cards"], ascending=[True, False]))


def tier_composition(home: pd.DataFrame, base: pd.DataFrame, runs: pd.DataFrame) -> pd.DataFrame:
    """치지직: 추천 카드와 기준선(50명 이상 목록)의 인증 등급 구성. 기준선은 완료(ok) 회차만."""
    ok = runs[(runs.kind == "baseline") & (runs.status == "ok")][["round_id", "platform"]]
    base = base.merge(ok, on=["round_id", "platform"]) if len(base) else base
    rows = []
    for label, d in (("추천(히어로 제외)", home[~home.section.isin(HERO_SECTIONS)]), ("기준선 목록", base)):
        d = d[(d.platform == "chzzk")].drop_duplicates(["round_id", "channel_id"]) if len(d) else d
        if not len(d) or "tier" not in d:
            continue
        t = d["tier"].fillna("없음(루키·프로)")
        for k, n in t.value_counts().items():
            rows.append({"set": label, "tier": k, "n": int(n), "share": n / len(d)})
    return pd.DataFrame(rows)


def baseline_distribution(base: pd.DataFrame) -> pd.DataFrame:
    bins = [0, 10, 50, 100, 500, 1000, 5000, 10**9]
    labels = ["0-9", "10-49", "50-99", "100-499", "500-999", "1000-4999", "5000+"]
    b = base.dropna(subset=["viewers"]).copy()
    b["bin"] = pd.cut(b.viewers, bins=bins, labels=labels, right=False)
    return b.groupby(["round_id", "platform", "bin"], observed=False).size().unstack(fill_value=0).reset_index()


def main() -> int:
    s = load_settings()
    small_max, reps, seed = s["small_max_viewers"], s["analysis"]["bootstrap_reps"], s["analysis"]["random_seed"]
    runs, home, base, meta = load()
    OUT.mkdir(parents=True, exist_ok=True)
    if home.empty:
        print("감사 데이터가 아직 없다.")
        return 0
    summary = {"small_definition": f"동접 {small_max}명 이하(50명 미만)", "rounds": {}, "by_platform": {}, "by_slot": {}}
    for variant, inc in (("main_excl_hero", False), ("incl_hero", True)):
        pr = per_round(runs, home, base, meta, small_max, inc)
        pr.to_csv(OUT / f"study3_rounds_{variant}.csv", index=False, encoding="utf-8-sig")
        for pf in PLATFORMS:
            est, lo, hi, n = ratio_ci(pr[pr.platform == pf], reps, seed)
            summary["by_platform"].setdefault(variant, {})[pf] = {"ratio": est, "ci_lo": lo, "ci_hi": hi, "n_rounds": n}
            for slot, g in pr[pr.platform == pf].groupby("time_slot"):
                est, lo, hi, n = ratio_ci(g, reps, seed)
                summary["by_slot"].setdefault(variant, {}).setdefault(pf, {})[int(slot)] = {
                    "ratio": est, "ci_lo": lo, "ci_hi": hi, "n_rounds": n}
        summary["rounds"][variant] = pr.to_dict(orient="records")
    section_breakdown(home, small_max).to_csv(OUT / "study3_sections.csv", index=False, encoding="utf-8-sig")
    tier_composition(home, base, runs).to_csv(OUT / "study3_chzzk_tiers.csv", index=False, encoding="utf-8-sig")
    if not base.empty:
        baseline_distribution(base).to_csv(OUT / "study3_baseline_bins.csv", index=False, encoding="utf-8-sig")
    summary["n_home_rounds"] = int(runs[(runs.kind == "home") & (runs.status == "ok")].round_id.nunique())
    summary["n_baselines"] = int(len(runs[(runs.kind == "baseline") & (runs.status == "ok")]))
    summary["ready"] = summary["n_home_rounds"] >= 100
    (OUT / "study3_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=float),
                                             encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("by_platform", "n_home_rounds", "n_baselines")},
                     ensure_ascii=False, indent=1, default=float))
    print(section_breakdown(home, small_max).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
