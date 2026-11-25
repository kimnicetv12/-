"""파서와 지표 함수의 최소 검증. 실행: python -m pytest -q tests"""
import gzip
from pathlib import Path

import numpy as np
import pytest

from analysis.stats import gini, top_share
from collector.audit import build_home_rows, chzzk_live_index, nearest_slot, to_int
from collector.polite import detect_block, load_settings
from collector.streamrate import parse

ROOT = Path(__file__).resolve().parent.parent

ROW = ('<main><p class="sub">기준일 2026-11-25 · 최근 30일 평균</p><table><tbody id="vs-body">'
       '<tr data-name="가" data-pf="soop" data-ccv="300" data-hours="8.1" data-fol="10">'
       '<td>1</td><td><a href="%EA%B0%80/">가</a></td><td>게임</td></tr>'
       '<tr data-name="나" data-pf="chzzk soop" data-ccv="100" data-hours="" data-fol="5">'
       '<td>2</td><td><a href="%EB%82%98/">나</a></td><td>토크·캠방</td></tr></tbody></table></main>')


def test_parse_minimal():
    date, rows = parse(ROW)
    assert date == "2026-11-25"
    assert [r["platform"] for r in rows] == ["soop", "both"]
    assert rows[0]["avg_ccv_30d"] == 300 and rows[1]["hours_per_day"] is None
    assert rows[1]["category"] == "토크·캠방"


@pytest.mark.skipif(not list((ROOT / "data/raw/streamrate").glob("*.html.gz")), reason="원본 없음")
def test_parse_real_snapshot():
    path = sorted((ROOT / "data/raw/streamrate").glob("*.html.gz"))[0]
    date, rows = parse(gzip.open(path, "rt", encoding="utf-8").read())
    assert len(rows) > 500
    assert {r["platform"] for r in rows} <= {"chzzk", "soop", "both"}
    ranks = [r["rank"] for r in rows]
    assert ranks == sorted(ranks)


def test_gini_and_share():
    assert gini([1, 1, 1, 1]) == pytest.approx(0)
    assert gini([0, 0, 0, 10]) == pytest.approx(0.75)
    assert top_share(np.arange(1, 21), 10) == pytest.approx(155 / 210)


def test_block_detection():
    s = load_settings()
    assert detect_block(429, "", s) == "HTTP 429"
    assert detect_block(200, "<title>Vercel Security Checkpoint</title>", s)
    assert detect_block(200, "<html>ok</html>", s) is None


def test_audit_helpers():
    assert to_int("1,234") == 1234 and to_int("1.2만") == 12000 and to_int(None) is None
    assert nearest_slot(11) == 12 and nearest_slot(1) == 2 and nearest_slot(23) == 22
    resp = [{"body": '{"content":{"slots":[{"slotTitle":"신입","slotContentType":"LIVE_NEW_STREAMER",'
                     '"slotContents":[{"liveId":1,"concurrentUserCount":2,"liveCategoryValue":"게임",'
                     '"channel":{"channelId":"' + "a" * 32 + '","channelName":"x","officialChannel":false}}]}]}}'}]
    idx = chzzk_live_index(resp)
    assert idx["a" * 32]["viewers"] == 2
    cfg = {"channel_id_regex": "/live/([0-9a-f]{32})"}
    seen = [{"href": "https://chzzk.naver.com/live/" + "a" * 32, "top": 10, "left": 5, "section": None, "screen": 1},
            {"href": "https://chzzk.naver.com/live/" + "a" * 32, "top": 10, "left": 5, "section": None, "screen": 2}]
    rows = build_home_rows("chzzk", cfg, seen, resp, [])
    assert len(rows) == 1 and rows[0]["section"] == "신입" and rows[0]["screen"] == 1


def test_history_parsers():
    from datetime import date
    from collector.streamrate_history import page_url, parse_history
    html = ('<table><tr><th>날짜</th><th>방송 시간</th><th>평균 시청자</th><th>최고 시청자</th><th>주 카테고리</th></tr>'
            '<tr><td>11/24(화)</td><td>8.5시간</td><td>24,194</td><td>45,053</td><td>리그 오브 레전드</td></tr>'
            '<tr><td>12/30(화)</td><td>1.0시간</td><td>10</td><td>12</td><td>–</td></tr></table>')
    rows = parse_history(html, date(2026, 11, 25))
    assert rows[0] == {"day": "2026-11-24", "hours": 8.5, "avg_ccv": 24194, "peak_ccv": 45053,
                       "main_category": "리그 오브 레전드"}
    assert rows[1]["day"] == "2025-12-30" and rows[1]["main_category"] is None
    assert page_url("../i/양띵") == "https://stream-rate.com/i/양띵/"


def test_live_snapshot_stats():
    import pandas as pd
    from analysis.live_snapshot import snapshot_stats
    b = pd.DataFrame({"viewers": [500, 300, 100, 60, 40], "official": [1, 0, 0, 0, 0], "tier": [None] * 5})
    m = pd.Series({"round_id": "r", "platform": "chzzk", "total_viewers": 1100, "total_lives": 10,
                   "mode": "threshold", "crossed_threshold": 1})
    out = snapshot_stats(b, m, 49)
    assert out["hakko_live_share"] == pytest.approx(0.6)
    assert out["hakko_viewer_share"] == pytest.approx((1100 - 960) / 1100)
    assert out["official_viewer_share"] == pytest.approx(500 / 1100)
