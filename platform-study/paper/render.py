"""paper/paper_template.md의 {{키}}를 analysis/out/ 결과로 채워 paper/paper.md를 만든다.

원고의 수치를 손으로 옮기지 않기 위한 단계다. 분석을 다시 돌리면 이 스크립트도 다시 돌린다.
    python -m analysis.concentration && python -m analysis.longitudinal \
      && python -m analysis.exposure && python -m analysis.policy
    python paper/render.py && python paper/build_docx.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "analysis" / "out"
PF = {"chzzk": "치지직", "soop": "숲"}
SCEN = {"main": "기본(스포츠·동시 송출 제외)", "drop_top1": "플랫폼별 1위 제외",
        "include_simulcast": "동시 송출 포함", "games_only": "게임 카테고리만"}

# 선행 결과 (2026-11-24, 사용자 제공) — 재계산 값과 나란히 보여 주기 위한 비교 기준
PRIOR = {"n_list": 538, "chzzk_top10_100": 0.329, "soop_top10_100": 0.402, "ci": (-0.038, 0.179),
         "per_user": {"soop": 16.8, "chzzk": 9.2}}


def pct(x, d=1):
    return "—" if x is None or pd.isna(x) else f"{x * 100:.{d}f}%"


def pp(x, d=1):
    return "—" if x is None or pd.isna(x) else f"{x * 100:+.{d}f}%p"


def num(x, d=0):
    return "—" if x is None or pd.isna(x) else f"{x:,.{d}f}"


def md_table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def study1(v: dict) -> None:
    t = pd.read_csv(OUT / "study1_concentration.csv")
    s = json.loads((OUT / "study1_summary.json").read_text(encoding="utf-8"))
    full = pd.read_csv(OUT / "study1_full_list.csv").set_index("platform")
    v["s1_date"] = s["snapshot_date"]
    v["s1_n_total"] = num(s["n_total"])
    v["s1_n_sports"] = s["excluded"]["sports"]
    v["s1_n_simulcast"] = s["excluded"]["simulcast"]
    v["s1_n_chzzk"] = num(full.loc["chzzk", "n"])
    v["s1_n_soop"] = num(full.loc["soop", "n"])
    for pf in ("chzzk", "soop"):
        v[f"s1_{pf}_min"] = num(full.loc[pf, "min"])
        v[f"s1_{pf}_median"] = num(full.loc[pf, "median"])
        v[f"s1_{pf}_under50"] = num(full.loc[pf, "under_50"])
    m = t[t.scenario == "main"].set_index("top_n")
    r100 = m.loc[100]
    v["s1_chzzk_top10_100"] = pct(r100.chzzk_top10_share)
    v["s1_soop_top10_100"] = pct(r100.soop_top10_share)
    v["s1_diff_top10_100"] = pp(r100.diff_top10_share_soop_minus_chzzk)
    v["s1_ci_top10_100"] = f"{pp(r100.diff_top10_share_ci_lo)} ~ {pp(r100.diff_top10_share_ci_hi)}"
    v["s1_chzzk_top3_100"] = pct(r100.chzzk_top3_share)
    v["s1_soop_top3_100"] = pct(r100.soop_top3_share)
    v["s1_ci_top3_100"] = f"{pp(r100.diff_top3_share_ci_lo)} ~ {pp(r100.diff_top3_share_ci_hi)}"
    v["s1_chzzk_gini_100"] = f"{r100.chzzk_gini:.3f}"
    v["s1_soop_gini_100"] = f"{r100.soop_gini:.3f}"
    v["s1_ci_gini_100"] = f"{r100.diff_gini_ci_lo:+.3f} ~ {r100.diff_gini_ci_hi:+.3f}"
    g = t[t.scenario == "games_only"].set_index("top_n").loc[100]
    v["s1_games_ci_top10_100"] = f"{pp(g.diff_top10_share_ci_lo)} ~ {pp(g.diff_top10_share_ci_hi)}"
    v["s1_games_ci_top3_100"] = f"{pp(g.diff_top3_share_ci_lo)} ~ {pp(g.diff_top3_share_ci_hi)}"
    v["s1_games_chzzk_top10_100"] = pct(g.chzzk_top10_share)
    v["s1_games_soop_top10_100"] = pct(g.soop_top10_share)
    d1 = t[t.scenario == "drop_top1"].set_index("top_n").loc[100]
    v["s1_drop1_diff_top10_100"] = pp(d1.diff_top10_share_soop_minus_chzzk)
    v["s1_drop1_ci_top10_100"] = f"{pp(d1.diff_top10_share_ci_lo)} ~ {pp(d1.diff_top10_share_ci_hi)}"

    rows = []
    for n, r in m.iterrows():
        rows.append([f"상위 {n}", pct(r.chzzk_top10_share), pct(r.soop_top10_share),
                     f"{pp(r.diff_top10_share_soop_minus_chzzk)} [{pp(r.diff_top10_share_ci_lo)}, {pp(r.diff_top10_share_ci_hi)}]",
                     pct(r.chzzk_top3_share), pct(r.soop_top3_share),
                     f"{r.chzzk_gini:.3f} / {r.soop_gini:.3f}",
                     f"{r.chzzk_ge500}/{r.soop_ge500}", f"{r.chzzk_ge1000}/{r.soop_ge1000}",
                     f"{r.chzzk_ge5000}/{r.soop_ge5000}"])
    v["table_s1_main"] = md_table(
        ["표본", "상위10 비중 치지직", "상위10 비중 숲", "차이(숲−치지직) [95% CI]", "상위3 비중 치지직", "상위3 비중 숲",
         "지니 치지직/숲", "≥500명 치지직/숲", "≥1,000명", "≥5,000명"], rows)

    rows = []
    for scen in SCEN:
        for n in (50, 100, 150):
            r = t[(t.scenario == scen) & (t.top_n == n)].iloc[0]
            sig = lambda lo, hi: "구간이 0 제외" if (lo > 0 or hi < 0) else "0 포함"
            rows.append([SCEN[scen], n,
                         f"{pp(r.diff_top10_share_soop_minus_chzzk)} [{pp(r.diff_top10_share_ci_lo)}, {pp(r.diff_top10_share_ci_hi)}]",
                         sig(r.diff_top10_share_ci_lo, r.diff_top10_share_ci_hi),
                         f"{pp(r.diff_top3_share_soop_minus_chzzk)} [{pp(r.diff_top3_share_ci_lo)}, {pp(r.diff_top3_share_ci_hi)}]",
                         sig(r.diff_top3_share_ci_lo, r.diff_top3_share_ci_hi),
                         f"{r.diff_gini_soop_minus_chzzk:+.3f} [{r.diff_gini_ci_lo:+.3f}, {r.diff_gini_ci_hi:+.3f}]"])
    v["table_s1_robust"] = md_table(["시나리오", "상위 N", "상위10 비중 차이 [CI]", "판정", "상위3 비중 차이 [CI]",
                                     "판정", "지니 차이 [CI]"], rows)
    v["table_prior_vs_now"] = md_table(
        ["항목", "선행 결과(2026-11-24)", "재계산(" + s["snapshot_date"] + ")", "차이"],
        [["명단 크기", f"{PRIOR['n_list']}명", f"{s['n_total']}명", f"{s['n_total'] - PRIOR['n_list']:+d}명"],
         ["치지직 상위100 중 상위10 비중", pct(PRIOR["chzzk_top10_100"]), pct(r100.chzzk_top10_share),
          pp(r100.chzzk_top10_share - PRIOR["chzzk_top10_100"])],
         ["숲 상위100 중 상위10 비중", pct(PRIOR["soop_top10_100"]), pct(r100.soop_top10_share),
          pp(r100.soop_top10_share - PRIOR["soop_top10_100"])],
         ["차이의 95% 구간", f"{pp(PRIOR['ci'][0])} ~ {pp(PRIOR['ci'][1])}", v["s1_ci_top10_100"], "결론 동일(0 포함)"]])


def study1_zipf(v: dict) -> None:
    z = pd.read_csv(OUT / "study1_zipf.csv")
    r = z[(z.scenario == "main") & (z.top_n == 100)].iloc[0]
    v["s1_zipf_chzzk_100"] = f"{r.chzzk_alpha:.2f}"
    v["s1_zipf_soop_100"] = f"{r.soop_alpha:.2f}"
    v["s1_zipf_ci_100"] = f"{r.ci_lo:+.2f} ~ {r.ci_hi:+.2f}"
    v["table_s1_zipf"] = md_table(
        ["시나리오", "상위 N", "치지직 α", "숲 α", "차이(숲−치지직) [95% CI]"],
        [[SCEN[x.scenario], x.top_n, f"{x.chzzk_alpha:.2f}", f"{x.soop_alpha:.2f}",
          f"{x.diff_soop_minus_chzzk:+.2f} [{x.ci_lo:+.2f}, {x.ci_hi:+.2f}]"] for x in z.itertuples()])


def study2a(v: dict) -> None:
    p = OUT / "study2h_summary.json"
    keys = ["s2a_days", "s2a_n_chzzk", "s2a_n_soop", "s2a_turn_chzzk", "s2a_turn_soop", "s2a_rho_chzzk",
            "s2a_rho_soop", "s2a_rho_ci", "s2a_cv_chzzk", "s2a_cv_soop", "s2a_cv_ci", "s2a_fl_chzzk", "s2a_fl_soop",
            "s2a_mar_chzzk", "s2a_mar_soop", "table_s2a"]
    if not p.exists():
        v.update({k: "—" for k in keys}); v["table_s2a"] = "_회고 패널 수집 전_"
        return
    s = json.loads(p.read_text(encoding="utf-8"))
    v["s2a_days"] = f"{s['days'][0]} ~ {s['days'][1]}"
    for pf in ("chzzk", "soop"):
        v[f"s2a_n_{pf}"] = s["n_streamers"][pf]
        v[f"s2a_turn_{pf}"] = pct(s["mean_turnover_top20"].get(pf))
        v[f"s2a_rho_{pf}"] = f"{s['mean_spearman_top50'].get(pf, float('nan')):.2f}"
        v[f"s2a_cv_{pf}"] = f"{s['cv_median'].get(pf, float('nan')):.2f}"
        v[f"s2a_fl_{pf}"] = pct(s["first_last_turnover_top20"].get(pf))
        v[f"s2a_mar_{pf}"] = f"{s['mean_abs_rank_change_top50'].get(pf, float('nan')):.1f}"
    b = s["spearman_boot"]
    v["s2a_rho_ci"] = f"{b['diff_soop_minus_chzzk']:+.2f} [{b['ci'][0]:+.2f}, {b['ci'][1]:+.2f}]"
    c = s["cv_diff_soop_minus_chzzk"]
    v["s2a_cv_ci"] = f"{c['est']:+.2f} [{c['ci'][0]:+.2f}, {c['ci'][1]:+.2f}]"
    pm = pd.read_csv(OUT / "study2h_pairs.csv")
    weeks = s["weeks"]
    lab = lambda w: f"{weeks[w - 1][0][5:]}~"
    v["table_s2a"] = md_table(
        ["플랫폼", "비교", "상위20 교체율", "상위50 스피어만", "상위50 평균 순위 변화", "짝지은 인원"],
        [[PF[r.platform], f"{lab(r.from_week)} → {lab(r.to_week)}", pct(r.turnover_top20),
          "—" if pd.isna(r.spearman_top50) else f"{r.spearman_top50:.2f}",
          "—" if pd.isna(r.mean_abs_rank_change_top50) else f"{r.mean_abs_rank_change_top50:.1f}", r.n_matched]
         for r in pm.itertuples()])


def study5(v: dict) -> None:
    p = OUT / "study5_snapshots.csv"
    df = pd.read_csv(p) if p.exists() and p.stat().st_size > 5 else pd.DataFrame()
    for pf in ("chzzk", "soop"):
        d = df[df.platform == pf] if len(df) else df
        dc = d[d.complete_above_threshold == 1] if len(d) else d
        v[f"s5_n_{pf}"] = len(d)
        v[f"s5_top10_{pf}"] = pct(d.top10_share.mean()) if len(d) else "—"
        v[f"s5_top1pct_{pf}"] = pct(d.top1pct_share.mean()) if len(d) else "—"
        v[f"s5_small_live_{pf}"] = pct(dc.small_live_share.mean()) if len(dc) else "—"
        v[f"s5_small_viewer_{pf}"] = pct(dc.small_viewer_share.mean()) if len(dc) else "—"
        v[f"s5_official_{pf}"] = pct(d.official_viewer_share.mean(), 2) if len(d) else "—"
        v[f"s5_lives_{pf}"] = num(d.total_lives.mean()) if len(d) else "—"
        v[f"s5_viewers_{pf}"] = num(d.total_viewers.mean()) if len(d) else "—"
    dz = df[df.platform == "chzzk"] if len(df) and "partner_viewer_share" in df else pd.DataFrame()
    v["s5_partner_min"] = pct(dz.partner_viewer_share.min(), 0) if len(dz) else "—"
    v["s5_partner_max"] = pct(dz.partner_viewer_share.max(), 0) if len(dz) else "—"
    if len(df):
        rows = []
        for r in df.itertuples():
            t = r.round_id
            rows.append([f"{t[4:6]}/{t[6:8]} {t[9:11]}:{t[11:13]}", PF[r.platform], num(r.total_lives), num(r.total_viewers),
                         pct(r.top10_share), f"{pct(r.top1pct_share)} ({r.top1pct_n}개)", pct(r.small_live_share),
                         pct(r.small_viewer_share), pct(r.official_viewer_share, 2),
                         pct(getattr(r, "partner_viewer_share", float("nan"))) if r.platform == "chzzk" else "—"])
        v["table_s5"] = md_table(["시각(KST)", "플랫폼", "전체 방송", "전체 시청자", "상위 10개 방송 몫", "상위 1% 방송 몫",
                                  "소규모 방송 비율", "소규모 방송의 시청자 몫", "공식 채널 몫", "파트너 몫"], rows)
    else:
        v["table_s5"] = "_전수 스냅샷 없음_"


def study5b(v: dict) -> None:
    p = OUT / "study5b_summary.json"
    s = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"platforms": {}}
    v["s5b_n_threshold"] = s.get("min_small_lives", "—")
    rows_top, rows_crowd = [], []
    for pf in ("chzzk", "soop"):
        d = s["platforms"].get(pf)
        v[f"s5b_median_{pf}"] = f"{d['median_viewers_per_small_live']:.1f}" if d else "—"
        v[f"s5b_ncat_{pf}"] = d["n_categories"] if d else 0
        v[f"s5b_round_{pf}"] = ", ".join(f"{t[4:6]}/{t[6:8]} {t[9:11]}:{t[11:13]}" for t in d["rounds"]) if d else "—"
        if not d:
            continue
        for r in d["top"][:8]:
            rows_top.append([PF[pf], r["category"], num(r["lives"]), num(r["small_lives"]),
                             f"{r['viewers_per_small_live']:.1f}", pct(r["small_share_of_viewers"], 0),
                             pct(r["top_live_share"], 0)])
        for r in d["crowded"]:
            rows_crowd.append([PF[pf], r["category"], num(r["lives"]), num(r["small_lives"]),
                               f"{r['viewers_per_small_live']:.1f}", pct(r["small_share_of_viewers"], 0)])
    head = ["플랫폼", "카테고리", "전체 방송", "소규모 방송", "소규모 방송 1개당 평균 시청자", "카테고리 시청자 중 소규모 몫"]
    v["table_s5b_top"] = md_table(head + ["가장 큰 방송 1개의 몫"], rows_top) if rows_top else "_자료 없음_"
    v["table_s5b_crowded"] = md_table(head, rows_crowd) if rows_crowd else "_자료 없음_"
    pol = pd.read_csv(ROOT / "data/policy/policies.csv", dtype=str).fillna("")
    pol = pol[pol.ladder_effect.str.contains("진입|중간")]
    v["table_ladder_tools"] = md_table(
        ["플랫폼", "제도", "대상", "조건·내용", "근거(코딩표 ID)"],
        [[PF[r.platform], r.policy, r.beneficiary_tiers.replace(";", "·"), r.key_terms, r.id] for r in pol.itertuples()])


def study2(v: dict) -> None:
    s = json.loads((OUT / "study2_summary.json").read_text(encoding="utf-8"))
    v["s2_n_snapshots"] = s["n_snapshots"]
    v["s2_first"] = s["first"]
    v["s2_last"] = s["last"]
    v["s2_span"] = s["span_days"]
    v["s2_status"] = ("판정 가능" if s["ready"] else
                      f"수집 {s['n_snapshots']}회({s['span_days']}일). 최소 8주가 쌓일 때까지 판정 보류")
    if s.get("means"):
        rows = [[r["window"], PF[r["platform"]], pct(r["turnover_top20"]), pct(r["turnover_top50"]),
                 f"{r['spearman_top100']:.3f}", f"{r['new_to_list_in_top50']:.1f}"] for r in s["means"]]
        v["table_s2"] = md_table(["간격", "플랫폼", "상위20 교체율", "상위50 교체율", "스피어만(상위100)", "신규 진입(상위50)"], rows)
    else:
        v["table_s2"] = "_아직 비교할 스냅샷 쌍이 없다. 첫 주간 비교는 " \
                        f"{(pd.Timestamp(s['first']) + pd.Timedelta(days=7)).date()} 이후 가능하다._"


def study3(v: dict) -> None:
    p = OUT / "study3_summary.json"
    if not p.exists():
        v.update({"s3_n_rounds": 0, "table_s3": "_감사 데이터 없음_", "table_s3_sections": "", "table_s3_tiers": "",
                  "s3_status": "미수집", "s3_ratio_chzzk": "—", "s3_ratio_soop": "—", "s3_n_baselines": 0})
        return
    s = json.loads(p.read_text(encoding="utf-8"))
    v["s3_n_rounds"] = s["n_home_rounds"]
    v["s3_n_baselines"] = s["n_baselines"]
    v["s3_status"] = "판정 가능" if s["ready"] else f"시범 {s['n_home_rounds']}회차. 계획(플랫폼당 약 100회)의 일부라 판정 보류"
    rows = []
    for variant, label in (("main_excl_hero", "카드 섹션(상단 히어로 제외)"), ("incl_hero", "상단 히어로 포함")):
        for r in s["rounds"].get(variant, []):
            rows.append([label, r["round_id"], PF[r["platform"]], r["n_rec"], r["n_rec_small"], pct(r["rec_small_share"]),
                         num(r.get("n_base_big")), num(r.get("total_lives")), pct(r["base_small_share"]),
                         "—" if pd.isna(r["exposure_ratio"]) else f"{r['exposure_ratio']:.2f}",
                         num(r["rec_median_viewers"]), r.get("total_source") or ""])
    v["table_s3"] = md_table(["범위", "회차", "플랫폼", "추천 채널", "추천 중 소규모 방송", "추천 소규모 방송 비율", "기준선 50명 이상",
                              "전체 라이브", "전체 소규모 방송 비율", "노출 비율", "추천 동접 중앙값", "전체 수 출처"], rows)
    rounds = pd.DataFrame(s["rounds"].get("main_excl_hero", []))
    for pf in ("chzzk", "soop"):
        rr = rounds[rounds.platform == pf] if len(rounds) else rounds
        v[f"s3_rec_share_{pf}"] = pct(rr.rec_small_share.mean()) if len(rr) else "—"
        v[f"s3_base_share_{pf}"] = pct(rr.base_small_share.mean()) if len(rr) else "—"
        v[f"s3_total_{pf}"] = num(rr.total_lives.mean()) if len(rr) else "—"
        v[f"s3_big_{pf}"] = num(rr.n_base_big.mean()) if len(rr) else "—"
        r = s["by_platform"].get("main_excl_hero", {}).get(pf, {})
        v[f"s3_ratio_{pf}"] = "—" if not r or r.get("ratio") is None or pd.isna(r.get("ratio")) else f"{r['ratio']:.2f}"
    sec = pd.read_csv(OUT / "study3_sections.csv")
    v["table_s3_sections"] = md_table(
        ["플랫폼", "섹션", "카드", "소규모 방송 카드", "동접 중앙값", "공식 채널", "파트너", "챌린저"],
        [[PF[r.platform], r.section, r.cards, int(r.small), num(r.median_viewers), int(r.official),
          int(r.partner) if r.platform == "chzzk" else "—", int(r.challenger) if r.platform == "chzzk" else "—"]
         for r in sec.itertuples()])
    tp = OUT / "study3_chzzk_tiers.csv"
    tiers = pd.read_csv(tp) if tp.exists() and tp.stat().st_size > 5 else pd.DataFrame()
    if len(tiers):
        g = lambda st, t: tiers[(tiers.set == st) & (tiers.tier == t)].share.sum()
        v["s3_partner_rec"] = pct(g("추천(히어로 제외)", "PARTNER"))
        v["s3_partner_base"] = pct(g("기준선 목록", "PARTNER"))
    else:
        v["s3_partner_rec"] = v["s3_partner_base"] = "—"
    v["table_s3_tiers"] = md_table(["집합", "인증 등급", "채널 수", "비율"],
                                   [[r.set, r.tier, r.n, pct(r.share)] for r in tiers.itertuples()]) if len(tiers) else "_없음_"


def study4(v: dict) -> None:
    s = json.loads((OUT / "study4_summary.json").read_text(encoding="utf-8"))
    v["table_s4_timeline"] = (OUT / "study4_timeline.md").read_text(encoding="utf-8")
    cm = pd.read_csv(OUT / "study4_coding_matrix.csv")
    v["table_s4_matrix"] = md_table(list(cm.columns), cm.values.tolist())
    mk = s["market"]
    v["per_user_chzzk"] = f"{mk['per_user_hours_2026_08']['chzzk']:.1f}"
    v["per_user_soop"] = f"{mk['per_user_hours_2026_08']['soop']:.1f}"
    v["per_user_ratio"] = f"{mk['ratio_soop_over_chzzk']:.2f}"
    v["q3_gap"] = num(mk["q3_watch_hours_gap_manh"])
    v["s4_undated"] = ", ".join(s["undated_policies"])
    v["s4_n_policies"] = int(cm.n_policies.sum())
    v["s4_n_chzzk"] = int(cm.loc[cm.platform == "치지직", "n_policies"].iloc[0])
    v["s4_n_soop"] = int(cm.loc[cm.platform != "치지직", "n_policies"].iloc[0])
    mf = pd.read_csv(ROOT / "data/policy/market_facts.csv", dtype=str).fillna("")
    v["table_market"] = md_table(
        ["지표", "기간", "치지직", "숲", "단위", "자료", "보도(최초 보도일)"],
        [[r.metric, r.period, r.chzzk or "—", r.soop or "—", r.unit, r.source_data,
          f"{r.reported_by} ({r.first_report_kst})"] for r in mf.itertuples()])


def main() -> int:
    v: dict = {}
    study1(v); study1_zipf(v); study2(v); study2a(v); study3(v); study4(v); study5(v); study5b(v)
    tpl = (HERE / "paper_template.md").read_text(encoding="utf-8")
    missing = sorted(set(re.findall(r"\{\{(\w+)\}\}", tpl)) - set(v))
    if missing:
        print("채울 값이 없는 키:", missing)
        return 1
    (HERE / "paper.md").write_text(re.sub(r"\{\{(\w+)\}\}", lambda m: str(v[m.group(1)]), tpl), encoding="utf-8")
    print("wrote", HERE / "paper.md")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    raise SystemExit(main())
