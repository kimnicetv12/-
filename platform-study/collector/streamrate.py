"""연구 1·2: stream-rate.com 뷰어십 순위를 파싱해 SQLite에 날짜별 스냅샷으로 쌓는다.

사용법
    python -m collector.streamrate            # 오늘 스냅샷 수집 (하루 1회)
    python -m collector.streamrate --from-file data/raw/streamrate/2026-11-25.html.gz
"""
from __future__ import annotations

import argparse
import gzip
import re
import sqlite3
import sys
from pathlib import Path

from bs4 import BeautifulSoup

from collector.polite import ROOT, BlockedError, PoliteSession, get_logger, load_settings, now_kst

PLATFORM_MAP = {"chzzk": "chzzk", "soop": "soop", "chzzk soop": "both"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_date TEXT PRIMARY KEY,   -- 페이지의 기준일 (YYYY-MM-DD)
    collected_at_kst TEXT NOT NULL,
    source_url TEXT NOT NULL,
    n_rows INTEGER NOT NULL,
    raw_file TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rankings (
    snapshot_date TEXT NOT NULL REFERENCES snapshots(snapshot_date),
    rank INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,                         -- stream-rate 개별 페이지 경로 (채널 식별용)
    platform TEXT NOT NULL,            -- chzzk | soop | both
    category TEXT,
    avg_ccv_30d INTEGER NOT NULL,      -- 최근 30일 평균 동시 시청자
    hours_per_day REAL,
    followers INTEGER,
    PRIMARY KEY (snapshot_date, rank)
);
CREATE INDEX IF NOT EXISTS idx_rankings_slug ON rankings(slug);
"""


def _num(value: str | None, cast=int):
    if value in (None, ""):
        return None
    try:
        return cast(value)
    except ValueError:
        return None


def parse(html: str) -> tuple[str, list[dict]]:
    """HTML에서 (기준일, 행 목록)을 뽑는다."""
    soup = BeautifulSoup(html, "lxml")
    sub = soup.select_one("main p.sub")
    m = re.search(r"기준일\s*(\d{4}-\d{2}-\d{2})", sub.get_text() if sub else html)
    if not m:
        raise ValueError("기준일을 찾지 못했다. 페이지 구조가 바뀌었는지 확인할 것")
    snapshot_date = m.group(1)

    rows = []
    for tr in soup.select("#vs-body tr[data-name]"):
        tds = tr.find_all("td")
        rank = _num(tds[0].get_text(strip=True)) if tds else None
        link = tr.select_one("a[href]")
        pf_raw = (tr.get("data-pf") or "").strip()
        rows.append({
            "rank": rank,
            "name": tr["data-name"],
            "slug": link["href"].strip("/") if link else None,
            "platform": PLATFORM_MAP.get(pf_raw, pf_raw or "unknown"),
            "category": tds[2].get_text(strip=True) if len(tds) > 2 else None,
            "avg_ccv_30d": _num(tr.get("data-ccv")),
            "hours_per_day": _num(tr.get("data-hours"), float),
            "followers": _num(tr.get("data-fol")),
        })
    if not rows:
        raise ValueError("순위 행이 0개다. 페이지 구조가 바뀌었는지 확인할 것")
    # 순위 칸이 비어 있으면 표 순서를 순위로 쓴다
    for i, r in enumerate(rows, start=1):
        if r["rank"] is None:
            r["rank"] = i
    return snapshot_date, rows


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    settings = load_settings()
    db_path = db_path or ROOT / settings["paths"]["db"]
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    return con


def store(con: sqlite3.Connection, snapshot_date: str, rows: list[dict], raw_file: str,
          source_url: str, collected_at: str) -> bool:
    """스냅샷을 저장한다. 같은 기준일이 이미 있으면 덮어쓰지 않고 False."""
    if con.execute("SELECT 1 FROM snapshots WHERE snapshot_date=?", (snapshot_date,)).fetchone():
        return False
    with con:
        con.execute("INSERT INTO snapshots VALUES (?,?,?,?,?)",
                    (snapshot_date, collected_at, source_url, len(rows), raw_file))
        con.executemany(
            "INSERT INTO rankings VALUES (:snapshot_date,:rank,:name,:slug,:platform,:category,"
            ":avg_ccv_30d,:hours_per_day,:followers)",
            [{"snapshot_date": snapshot_date, **r} for r in rows])
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-file", help="이미 받아 둔 HTML(.html 또는 .html.gz)을 다시 적재")
    args = ap.parse_args(argv)
    log = get_logger()
    settings = load_settings()
    url = settings["streamrate"]["url"]
    collected_at = now_kst().isoformat(timespec="seconds")

    if args.from_file:
        path = Path(args.from_file)
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as f:
            html = f.read()
        raw_rel = str(path.relative_to(ROOT)) if path.is_absolute() else str(path)
    else:
        try:
            resp = PoliteSession(settings).get(url)
        except BlockedError as e:
            log.error("수집 중단: %s", e)
            return 2
        resp.encoding = "utf-8"
        html = resp.text

    snapshot_date, rows = parse(html)

    if not args.from_file:
        raw_dir = ROOT / settings["paths"]["raw_streamrate"]
        raw_dir.mkdir(parents=True, exist_ok=True)
        raw_path = raw_dir / f"{snapshot_date}.html.gz"
        with gzip.open(raw_path, "wt", encoding="utf-8") as f:
            f.write(html)
        raw_rel = str(raw_path.relative_to(ROOT))

    con = connect()
    stored = store(con, snapshot_date, rows, raw_rel, url, collected_at)
    log.info("snapshot %s: %d rows, %s", snapshot_date, len(rows),
             "stored" if stored else "already present (skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
