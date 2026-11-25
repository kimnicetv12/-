"""연구 4: 정책 내용 분석 (RQ2-C, RQ1) + 시장 지표 재계산.

입력: data/policy/policies.csv, data/policy/market_facts.csv (출처·최초 보도일 포함, 손 코딩)
출력: analysis/out/study4_*.csv|md, paper/figures/fig4_policy_timeline.png
"""
from __future__ import annotations

import json

import pandas as pd

from analysis.concentration import FIG, OUT, PF_KO
from collector.polite import ROOT

LADDER = ["진입", "중간", "상단", "노출"]


def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    pol = pd.read_csv(ROOT / "data/policy/policies.csv", dtype=str).fillna("")
    mkt = pd.read_csv(ROOT / "data/policy/market_facts.csv", dtype=str).fillna("")
    return pol, mkt


def coding_matrix(pol: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for pf, g in pol.groupby("platform"):
        r = {"platform": PF_KO.get(pf, pf), "n_policies": len(g)}
        for step in LADDER:
            r[step] = int(g["ladder_effect"].str.contains(step).sum())
        rows.append(r)
    return pd.DataFrame(rows)


def ladder_detail(pol: pd.DataFrame) -> pd.DataFrame:
    """정책 × 사다리 칸 0/1 행렬."""
    out = pol[["id", "platform", "first_report_kst", "policy", "beneficiary_tiers"]].copy()
    for step in LADDER:
        out[step] = pol["ladder_effect"].str.contains(step).astype(int)
    return out


def market(mkt: pd.DataFrame) -> dict:
    get = lambda i, col: float(mkt.loc[mkt.id == i, col].iloc[0])
    per_user = {pf: get("M02", pf) / get("M01", pf) for pf in ("chzzk", "soop")}
    return {"per_user_hours_2026_08": {k: round(v, 2) for k, v in per_user.items()},
            "ratio_soop_over_chzzk": round(per_user["soop"] / per_user["chzzk"], 2),
            "q3_watch_hours_gap_manh": get("M05", "chzzk") - get("M05", "soop")}


def timeline_md(pol: pd.DataFrame) -> str:
    lines = ["| 최초 보도(KST) | 플랫폼 | 정책 | 혜택 대상 | 사다리 영향 | 출처 |", "|---|---|---|---|---|---|"]
    def key(d):
        return d if d[:4].isdigit() else "9999"
    for _, r in pol.sort_values("first_report_kst", key=lambda s: s.map(key)).iterrows():
        lines.append(f"| {r.first_report_kst} | {PF_KO[r.platform]} | {r.policy} | {r.beneficiary_tiers.replace(';', '·')} | "
                     f"{r.ladder_effect.replace(';', '·')} | {r.source_outlet} |")
    return "\n".join(lines)


def figure(pol: pd.DataFrame) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.family"] = "NanumGothic"
    plt.rcParams["axes.unicode_minus"] = False
    d = pol[pol.first_report_kst.str[:4].str.isdigit()].copy()
    d["date"] = pd.to_datetime(d.first_report_kst.str[:10])
    colors = {"진입": "#E4572E", "중간": "#F3A712", "상단": "#29335C", "노출": "#669BBC"}
    fig, ax = plt.subplots(figsize=(9, 3.6), dpi=150)
    for i, pf in enumerate(["chzzk", "soop"]):
        g = d[d.platform == pf].sort_values("date")
        prev, level = None, 0
        for _, r in g.iterrows():
            steps = [s for s in LADDER if s in r.ladder_effect]
            for j, s in enumerate(steps):
                ax.scatter(r.date, i + (j - (len(steps) - 1) / 2) * 0.12, color=colors[s], s=40, zorder=3)
            # 날짜가 가까운 정책은 이름표를 한 칸씩 위로 올려 겹치지 않게 한다
            level = level + 1 if prev is not None and (r.date - prev).days < 45 else 0
            prev = r.date
            ax.annotate(r.id, (r.date, i + 0.28 + 0.13 * level), fontsize=7, ha="center")
    for s, c in colors.items():
        ax.scatter([], [], color=c, label=s)
    ax.set_yticks([0, 1], [PF_KO["chzzk"], PF_KO["soop"]]); ax.set_ylim(-0.6, 1.9)
    ax.set_title("그림 4. 2024~2026 정책 연표 (색 = 사다리 영향 칸)")
    ax.grid(axis="x", alpha=0.3); ax.legend(ncol=4, fontsize=8, loc="lower right")
    fig.tight_layout()
    p = FIG / "fig4_policy_timeline.png"; fig.savefig(p); plt.close(fig)
    return str(p.relative_to(ROOT))


def main() -> int:
    pol, mkt = load()
    OUT.mkdir(parents=True, exist_ok=True)
    cm = coding_matrix(pol)
    cm.to_csv(OUT / "study4_coding_matrix.csv", index=False, encoding="utf-8-sig")
    ladder_detail(pol).to_csv(OUT / "study4_ladder_detail.csv", index=False, encoding="utf-8-sig")
    (OUT / "study4_timeline.md").write_text(timeline_md(pol), encoding="utf-8")
    summary = {"market": market(mkt), "coding_matrix": cm.to_dict(orient="records"), "figure": figure(pol),
               "undated_policies": pol.loc[~pol.first_report_kst.str[:4].str.isdigit(), "id"].tolist()}
    (OUT / "study4_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(cm.to_string(index=False))
    print(json.dumps(summary["market"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
