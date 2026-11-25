"""연구 2 보조: stream-rate 개인 뷰어십 기록 페이지에서 최근 30일 방송일별 기록을 모은다.

`/viewership/<slug>/` 페이지의 '방송일별 기록' 표(날짜, 방송 시간, 평균 시청자, 최고 시청자, 주 카테고리)를
SQLite `daily_history`에 쌓는다. 8주 종단 수집이 쌓이기 전에 순위 이동성을 30일 회고 패널로 시범 분석하는 데 쓴다.

사용법
    python -m collector.streamrate_history --top 100     # 최신 스냅샷의 플랫폼별 상위 100명
같은 스냅샷 기준으로 이미 받은 채널은 건너뛰므로 중간에 끊겨도 다시 돌리면 이어서 받는다.
"""
from __future__ import annotations

import argparse
import gzip
import re
import sys
from datetime import date

from bs4 import BeautifulSoup

from collector.polite import ROOT, BlockedError, PoliteSession, get_logger, load_settings
from collector.streamrate import connect

SCHEMA = """
CREATE TABLE IF NOT EXISTS daily_history (
    snapshot_date TEXT NOT NULL,       -- 어느 스냅샷 명단을 기준으로 받았는지
    slug TEXT NOT NULL,
    name TEXT,
    platform TEXT,
    day TEXT NOT NULL,                 -- 방송일 (YYYY-MM-DD)
    hours REAL,
    avg_ccv INTEGER,                   -- 그날 평균 동시 시청자
    peak_ccv INTEGER,
    main_category TEXT,
    PRIMARY KEY (snapshot_date, slug, day)
);
CREATE TABLE IF NOT EXISTS daily_history_pages (
    snapshot_date TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL,              -- ok | empty | error
    n_days INTEGER,
    PRIMARY KEY (snapshot_date, slug)
);
"""


def _int(text: str):
    t = re.sub(r"[^\d]", "", text or "")
    return int(t) if t else None


def parse_history(html: str, snapshot: date) -> list[dict]:
    """'방송일별 기록' 표를 읽는다. 날짜는 MM/DD라서 기준일보다 뒤 달이면 전년도로 본다."""
    soup = BeautifulSoup(html, "lxml")
    table = None
    for tb in soup.find_all("table"):
        head = tb.find("tr")
        if head and "평균 시청자" in head.get_text() and "날짜" in head.get_text():
            table = tb
            break
    if table is None:
        return parse_profile_chart(html, snapshot)
    rows = []
    for tr in table.find_all("tr")[1:]:
        tds = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(tds) < 4:
            continue
        m = re.match(r"(\d{1,2})/(\d{1,2})", tds[0])
        if not m:
            continue
        month, day = int(m.group(1)), int(m.group(2))
        year = snapshot.year - 1 if month > snapshot.month else snapshot.year
        hours = re.search(r"([\d.]+)", tds[1])
        rows.append({"day": date(year, month, day).isoformat(),
                     "hours": float(hours.group(1)) if hours else None,
                     "avg_ccv": _int(tds[2]), "peak_ccv": _int(tds[3]),
                     "main_category": tds[4] if len(tds) > 4 and tds[4] not in ("–", "-") else None})
    return rows


def parse_profile_chart(html: str, snapshot: date) -> list[dict]:
    """기록 표가 없는 프로필 페이지(/i/<이름>/): '방송일별 동시 시청자' 그래프의 점(MM/DD · N명)만 읽는다."""
    soup = BeautifulSoup(html, "lxml")
    head = next((h for h in soup.find_all("h2") if "방송일별 동시 시청자" in h.get_text()), None)
    fig = head.find_next("figure") if head else None
    if fig is None:
        return []
    rows = []
    for m in re.finditer(r"(\d{1,2})/(\d{1,2}) · ([\d,]+)명", fig.get_text(" ")):
        month, day = int(m.group(1)), int(m.group(2))
        year = snapshot.year - 1 if month > snapshot.month else snapshot.year
        rows.append({"day": date(year, month, day).isoformat(), "hours": None, "avg_ccv": _int(m.group(3)),
                     "peak_ccv": None, "main_category": None})
    return rows


def page_url(slug: str) -> str:
    """명단의 링크는 대부분 기록 페이지 slug지만, 일부는 프로필 페이지(../i/<이름>)로만 이어진다."""
    if slug.startswith("../i/"):
        return f"https://stream-rate.com/i/{slug[5:]}/"
    return f"https://stream-rate.com/viewership/{slug}/"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=100, help="플랫폼별 상위 N명 (스포츠·동시 송출 제외)")
    args = ap.parse_args(argv)
    log = get_logger()
    con = connect()
    con.executescript(SCHEMA)
    snap = con.execute("SELECT max(snapshot_date) FROM snapshots").fetchone()[0]
    targets = []
    for pf in ("chzzk", "soop"):
        targets += con.execute(
            "SELECT slug, name, platform FROM rankings WHERE snapshot_date=? AND platform=? AND category!='스포츠' "
            "ORDER BY avg_ccv_30d DESC LIMIT ?", (snap, pf, args.top)).fetchall()
    done = {r[0] for r in con.execute("SELECT slug FROM daily_history_pages WHERE snapshot_date=?", (snap,))}
    todo = [t for t in targets if t[0] and t[0] not in done]
    log.info("history: snapshot %s, %d targets, %d to fetch", snap, len(targets), len(todo))
    raw_dir = ROOT / load_settings()["paths"]["raw_streamrate"] / f"history-{snap}"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = PoliteSession()
    snap_d = date.fromisoformat(snap)
    for i, (slug, name, pf) in enumerate(todo, 1):
        url = page_url(slug)
        try:
            resp = session.get(url)
        except BlockedError as e:
            log.error("history 중단: %s", e)
            return 2
        except Exception as e:  # 네트워크 오류는 기록하고 다음 채널로
            with con:
                con.execute("INSERT OR REPLACE INTO daily_history_pages VALUES (?,?,?,?)", (snap, slug, "error", 0))
            log.warning("history %s failed: %r", slug, e)
            continue
        resp.encoding = "utf-8"
        with gzip.open(raw_dir / f"{slug.replace('/', '_')[:120]}.html.gz", "wt", encoding="utf-8") as f:
            f.write(resp.text)
        rows = parse_history(resp.text, snap_d)
        with con:
            con.executemany("INSERT OR REPLACE INTO daily_history VALUES (?,?,?,?,?,?,?,?,?)",
                            [(snap, slug, name, pf, r["day"], r["hours"], r["avg_ccv"], r["peak_ccv"],
                              r["main_category"]) for r in rows])
            con.execute("INSERT OR REPLACE INTO daily_history_pages VALUES (?,?,?,?)",
                        (snap, slug, "ok" if rows else "empty", len(rows)))
        if i % 20 == 0:
            log.info("history: %d/%d", i, len(todo))
    log.info("history: done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
