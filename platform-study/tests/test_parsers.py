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
