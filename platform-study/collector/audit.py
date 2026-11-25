"""연구 3: 추천 노출 감사 (RQ3).

한 회차 = 치지직 홈 → 숲 홈 (두 플랫폼을 5분 안에 연달아) → (선택) 전체 라이브 기준선.
회차마다 새 browser context를 열어 쿠키가 빈 비로그인 상태로 시작한다.

사용법
    python -m collector.audit                  # 홈 추천만
    python -m collector.audit --baseline       # 홈 추천 + 전체 라이브 기준선
    python -m collector.audit --baseline --baseline-max-minutes 20

일정(cron 예시)은 README.md 참고. 7일 × 12·18·22·02시 × 시간대당 4회.
"""
from __future__ import annotations

import argparse
import glob
import gzip
import json
import re
import sqlite3
import sys
import time
import uuid
from pathlib import Path

import yaml

from collector.polite import ROOT, get_logger, load_settings, now_kst, record_block

SLOT_HOURS = (12, 18, 22, 2)

SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_runs (
    round_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    kind TEXT NOT NULL,              -- home | baseline
    started_kst TEXT NOT NULL,
    finished_kst TEXT,
    time_slot INTEGER,               -- 12 | 18 | 22 | 2 (가장 가까운 시간대)
    status TEXT NOT NULL,            -- ok | blocked | error | empty
    n_items INTEGER,
    reached_end INTEGER,             -- 기준선을 끝까지 내렸는지 (1/0)
    sorted_desc INTEGER,             -- 기준선이 시청자 내림차순이었는지 (1/0)
    note TEXT,
    raw_dir TEXT,
    PRIMARY KEY (round_id, platform, kind)
);
CREATE TABLE IF NOT EXISTS audit_home (
    round_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    section TEXT,
    slot_order INTEGER,              -- 섹션 안에서 위→아래, 왼쪽→오른쪽 순서 (1부터)
    screen INTEGER,                  -- 처음 보인 화면 (0 = 첫 화면, 1~3 = 스크롤 후)
    channel TEXT,
    channel_id TEXT,
    live_id TEXT,
    viewers INTEGER,
    category TEXT,
    official INTEGER,                -- 공식·중계 채널 (치지직 officialChannel, 숲은 이름 규칙)
    source TEXT,                     -- 수치를 어디서 읽었는지 (dom | response)
    tier TEXT                        -- 치지직 인증 마크 등급 (PARTNER | CHALLENGER | 없음=루키·프로)
);
CREATE TABLE IF NOT EXISTS audit_baseline (
    round_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    channel_id TEXT,
    live_id TEXT,
    channel TEXT,
    viewers INTEGER,
    category TEXT,
    official INTEGER,
    tier TEXT
);
CREATE TABLE IF NOT EXISTS audit_baseline_meta (
    round_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    mode TEXT,                       -- threshold | full
    n_loaded INTEGER,                -- 받은 방송 수
    min_loaded_viewers INTEGER,      -- 받은 방송 중 최소 동접 (threshold면 하꼬 경계 아래여야 정상)
    crossed_threshold INTEGER,       -- 하꼬 경계를 넘어 내려갔는지
    total_lives INTEGER,             -- 같은 시각 전체 라이브 수
    total_source TEXT,
    total_complete INTEGER,          -- 전체 수 산출 응답을 끝까지 받았는지
    total_viewers INTEGER,           -- 같은 시각 전체 동시 시청자 (치지직: 카테고리 합, 숲: 전체 목록 합)
    PRIMARY KEY (round_id, platform)
);
"""

VISIBLE_JS = """
(cfg) => {
  const H = window.innerHeight, W = window.innerWidth, out = [];
  document.querySelectorAll(cfg.link).forEach((a) => {
    const r = a.getBoundingClientRect();
    if (r.width < 40 || r.height < 30) return;
    if (r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) return;
    const style = window.getComputedStyle(a);
    if (style.visibility === 'hidden' || style.display === 'none') return;
    let section = null;
    const sec = cfg.section ? a.closest(cfg.section) : null;
    if (sec && cfg.title) {
      const t = sec.querySelector(cfg.title);
      if (t) section = t.innerText.trim().split('\\n')[0];
    }
    const rec = {href: a.href, top: r.top + window.scrollY, left: r.left, section};
    const card = cfg.container ? a.closest(cfg.container) : null;
    if (card) {
      const q = (s) => { const e = s ? card.querySelector(s) : null; return e ? e.innerText.trim() : null; };
      rec.viewers = q(cfg.viewers);
      rec.nick = q(cfg.nick);
      rec.categories = cfg.category ? Array.from(card.querySelectorAll(cfg.category)).map(e => e.innerText.trim()) : [];
      rec.broadcast_id = card.getAttribute('data-broadcast-id');
    }
    out.push(rec);
  });
  return out;
}
"""

class Blocked(RuntimeError):
    pass


def load_selectors() -> dict:
    with open(ROOT / "config" / "selectors.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def nearest_slot(hour: int) -> int:
    return min(SLOT_HOURS, key=lambda h: min((hour - h) % 24, (h - hour) % 24))


def to_int(text) -> int | None:
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return int(text)
    t = str(text).replace(",", "").strip()
    m = re.search(r"([\d.]+)\s*(만|천)?", t)
    if not m:
        return None
    v = float(m.group(1))
    if m.group(2) == "만":
        v *= 10000
    elif m.group(2) == "천":
        v *= 1000
    return int(v)


def is_official_name(name: str | None, patterns: list[str]) -> bool:
    if not name:
        return False
    low = name.lower()
    return any(p.lower() in low for p in patterns)


def check_block(page, markers: list[str], status: int | None, url: str, log) -> None:
    if status in (403, 429, 503):
        record_block(url, f"HTTP {status}")
        raise Blocked(f"HTTP {status}")
    html = page.content()[:30000]
    for m in markers:
        if m in html:
            record_block(url, f"marker '{m}'")
            raise Blocked(f"marker '{m}'")


# ---------- 응답 해석 ----------

def chzzk_live_index(responses: list[dict]) -> dict[str, dict]:
    """홈 응답에서 채널 ID → {동접, 카테고리, 공식 여부, 섹션 제목}."""
    idx: dict[str, dict] = {}
    for r in responses:
        try:
            content = json.loads(r["body"]).get("content") or {}
        except (ValueError, KeyError, AttributeError):
            continue
        groups = []
        if isinstance(content, dict):
            if content.get("premiumLives"):
                groups.append(("상단 추천(프리미엄)", "PREMIUM", content["premiumLives"]))
            for slot in content.get("slots") or []:
                groups.append((slot.get("slotTitle"), slot.get("slotContentType"), slot.get("slotContents") or []))
        for title, ctype, items in groups:
            for it in items:
                ch = (it or {}).get("channel") or {}
                cid = ch.get("channelId")
                if not cid or "concurrentUserCount" not in it:
                    continue
                idx.setdefault(cid, {
                    "section": title, "slot_type": ctype, "live_id": str(it.get("liveId")),
                    "viewers": it.get("concurrentUserCount"), "category": it.get("liveCategoryValue"),
                    "channel": ch.get("channelName"),
                    # verifiedMark는 공식 채널이 아니라 등급 인증(PARTNER/CHALLENGER) 표시다
                    "official": bool(ch.get("officialChannel")),
                    "tier": ch.get("verifiedMarkType"),
                })
    return idx


def chzzk_baseline_rows(responses: list[dict], required: str = "") -> list[dict]:
    rows = {}
    for r in responses:
        if required and required not in r.get("url", ""):
            continue
        try:
            content = json.loads(r["body"]).get("content") or {}
        except (ValueError, KeyError, AttributeError):
            continue
        for it in content.get("data") or []:
            ch = it.get("channel") or {}
            key = str(it.get("liveId") or ch.get("channelId"))
            rows[key] = {"channel_id": ch.get("channelId"), "live_id": str(it.get("liveId")),
                         "channel": ch.get("channelName"), "viewers": it.get("concurrentUserCount"),
                         "category": it.get("liveCategoryValue"),
                         "official": int(bool(ch.get("officialChannel"))), "tier": ch.get("verifiedMarkType")}
    return list(rows.values())


def chzzk_has_next(responses: list[dict], required: str = "") -> bool:
    """마지막 목록 응답에 다음 페이지가 있는지."""
    for r in reversed(responses):
        if required and required not in r.get("url", ""):
            continue
        try:
            page = (json.loads(r["body"]).get("content") or {}).get("page") or {}
        except (ValueError, KeyError, AttributeError):
            continue
        return bool(page.get("next"))
    return True


def chzzk_category_total(responses: list[dict], field: str = "openLiveCount") -> tuple[int, int, bool]:
    """카테고리 응답의 field(openLiveCount 또는 concurrentUserCount) 합, 카테고리 수, 끝까지 받았는지."""
    cats, last_next = {}, True
    for r in responses:
        if "size=6" in r.get("url", ""):  # 홈 사이드바용 상위 6개 응답은 중복이라 뺀다
            continue
        try:
            content = json.loads(r["body"]).get("content") or {}
        except (ValueError, KeyError, AttributeError):
            continue
        for c in content.get("data") or []:
            cats[c.get("categoryId")] = c.get(field) or 0
        last_next = bool((content.get("page") or {}).get("next"))
    return sum(cats.values()), len(cats), not last_next


# 숲 목록은 PC+모바일 합계(totalViewCnt)가 카드에 표시되는 값이다
VIEW_KEYS = ("totalViewCnt", "total_view_cnt", "view_cnt", "viewCnt", "current_view_cnt", "concurrentUserCount")
ID_KEYS = ("broad_no", "broadNo", "liveId")
TOTAL_KEYS = ("totalCount", "total_cnt")


def generic_total(responses: list[dict]) -> int | None:
    """목록 응답에 실린 전체 방송 수 (가장 최근 값)."""
    total = None
    for r in responses:
        body = re.sub(r"^[^\[{]*?\(", "", r.get("body") or "").rstrip(");")
        try:
            d = json.loads(body)
        except ValueError:
            continue
        for o in (d, d.get("data") if isinstance(d, dict) else None):
            if isinstance(o, dict):
                for k in TOTAL_KEYS:
                    if k in o:
                        total = to_int(o[k])
    return total


def generic_baseline_rows(responses: list[dict]) -> list[dict]:
    """숲 목록 응답처럼 구조를 모르는 JSON에서 방송 목록을 찾는다."""
    rows = {}

    def walk(o):
        if isinstance(o, list):
            if o and all(isinstance(x, dict) for x in o) and any(k in o[0] for k in VIEW_KEYS):
                for x in o:
                    vk = next((k for k in VIEW_KEYS if k in x), None)
                    ik = next((k for k in ID_KEYS if k in x), None)
                    key = str(x.get(ik)) if ik else json.dumps(x, sort_keys=True)[:200]
                    cats = x.get("categoryTags") or x.get("category_tags") or []
                    rows[key] = {"channel_id": x.get("user_id") or x.get("userId"), "live_id": str(x.get(ik)) if ik else None,
                                 "channel": x.get("user_nick") or x.get("userNick"),
                                 "viewers": to_int(x.get(vk)),
                                 "category": x.get("categoryName") or x.get("category_name") or (cats[0] if cats else None),
                                 "official": None}
            else:
                for x in o:
                    walk(x)
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)

    for r in responses:
        body = r.get("body") or ""
        body = re.sub(r"^[^\[{]*?\(", "", body).rstrip(");")  # JSONP 감싸기 제거
        try:
            walk(json.loads(body))
        except ValueError:
            continue
    return list(rows.values())


# ---------- 수집 ----------

class Capture:
    def __init__(self, patterns: list[str]):
        self.patterns = patterns
        self.items: list[dict] = []

    def __call__(self, resp):
        if not any(p in resp.url for p in self.patterns):
            return
        try:
            self.items.append({"url": resp.url, "status": resp.status, "body": resp.text()})
        except Exception as e:  # 본문이 없거나 이미 버려진 응답
            self.items.append({"url": resp.url, "status": resp.status, "error": str(e)})


def new_context(browser, common):
    return browser.new_context(viewport=common["viewport"], locale=common["locale"],
                               timezone_id=common["timezone_id"])


def collect_home(browser, platform: str, sel: dict, raw_dir: Path, log) -> list[dict]:
    common, cfg = sel["common"], sel[platform]
    ctx = new_context(browser, common)
    assert not ctx.cookies(), "새 context에 쿠키가 있으면 안 된다"
    page = ctx.new_page()
    cap = Capture(cfg.get("home_response_patterns") or [])
    page.on("response", cap)
    try:
        resp = page.goto(cfg["home_url"], wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(common["first_wait_ms"])
        check_block(page, sel["block_markers"], resp.status if resp else None, cfg["home_url"], log)
        js_cfg = {"link": cfg["card_link"], "section": cfg.get("section_container"),
                  "title": cfg.get("section_title"), "container": cfg.get("card_container"),
                  "viewers": cfg.get("viewers"), "nick": cfg.get("nick"), "category": cfg.get("category")}
        seen: list[dict] = []
        for screen in range(common["home_scrolls"] + 1):
            if screen:
                page.mouse.wheel(0, common["scroll_px"])
                time.sleep(common["seconds_between_scrolls"])
            for rec in page.evaluate(VISIBLE_JS, js_cfg):
                rec["screen"] = screen
                seen.append(rec)
            page.screenshot(path=str(raw_dir / f"{platform}_home_s{screen}.jpg"), type="jpeg", quality=60)
        with gzip.open(raw_dir / f"{platform}_home.html.gz", "wt", encoding="utf-8") as f:
            f.write(page.content())
        with gzip.open(raw_dir / f"{platform}_home_responses.json.gz", "wt", encoding="utf-8") as f:
            json.dump(cap.items, f, ensure_ascii=False)
    finally:
        ctx.close()
    return build_home_rows(platform, cfg, seen, cap.items, sel["official_name_patterns"])


def build_home_rows(platform, cfg, seen, responses, official_patterns) -> list[dict]:
    rx = re.compile(cfg["channel_id_regex"])
    api = chzzk_live_index(responses) if platform == "chzzk" else {}
    first: dict[tuple, dict] = {}
    for rec in seen:
        m = rx.search(rec["href"] or "")
        if not m:
            continue
        cid = m.group(1)
        info = api.get(cid, {})
        section = info.get("section") or rec.get("section") or "(제목 없음)"
        key = (section, cid)
        if key in first:
            continue
        if platform == "soop":
            cats = [c for c in rec.get("categories") or [] if c]
            category = cats[1] if len(cats) > 1 else (cats[0] if cats else None)
            name = rec.get("nick")
            row = {"channel": name, "channel_id": cid, "live_id": m.group(2) if m.lastindex > 1 else rec.get("broadcast_id"),
                   "viewers": to_int(rec.get("viewers")), "category": category,
                   "official": int(is_official_name(name, official_patterns)), "source": "dom", "tier": None}
        else:
            name = info.get("channel")
            official = info.get("official")
            if official is None:
                official = is_official_name(name, official_patterns)
            row = {"channel": name, "channel_id": cid, "live_id": info.get("live_id"),
                   "viewers": info.get("viewers"), "category": info.get("category"),
                   "official": int(bool(official) or is_official_name(name, official_patterns)),
                   "source": "response" if info else "dom", "tier": info.get("tier")}
        row.update({"section": section, "screen": rec["screen"], "_top": rec["top"], "_left": rec["left"]})
        first[key] = row
    rows = sorted(first.values(), key=lambda r: (r["section"], r["_top"], r["_left"]))
    order: dict[str, int] = {}
    for r in rows:
        order[r["section"]] = order.get(r["section"], 0) + 1
        r["slot_order"] = order[r["section"]]
        r.pop("_top"); r.pop("_left")
    return rows


def collect_baseline(browser, platform: str, sel: dict, raw_dir: Path, max_minutes: float, mode: str,
                     hakko_max: int, log):
    """시청자순 전체 라이브 목록을 내리며 페이지가 받은 목록 응답을 모은다.

    threshold 모드: 마지막으로 받은 방송의 동접이 hakko_max 이하가 되면 한 페이지 더 받고 멈춘다.
    full 모드: 목록 끝까지 (치지직은 next 없음, 숲은 전체 수만큼).
    """
    common, cfg = sel["common"], sel[platform]
    required = cfg.get("baseline_required_param", "")
    ctx = new_context(browser, common)
    page = ctx.new_page()
    cap = Capture(cfg.get("baseline_response_patterns") or [])
    page.on("response", cap)
    reached_end = crossed = False
    extra_left = common.get("threshold_extra_pages", 1)

    def current_rows():
        if platform == "chzzk":
            return chzzk_baseline_rows(cap.items, required)
        return [r for r in generic_baseline_rows(cap.items) if r.get("live_id")]

    try:
        resp = page.goto(cfg["baseline_url"], wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(common["first_wait_ms"])
        check_block(page, sel["block_markers"], resp.status if resp else None, cfg["baseline_url"], log)
        if cfg.get("baseline_sort_button"):
            time.sleep(common["seconds_between_scrolls"])
            btn = page.locator(cfg["baseline_sort_button"]).first
            if not btn.is_visible() and cfg.get("baseline_sort_fallback_open"):
                page.locator(cfg["baseline_sort_fallback_open"]).first.click()
                page.wait_for_timeout(1500)
            btn.click()
            page.wait_for_timeout(5000)
        deadline = time.monotonic() + max_minutes * 60
        stall, last_n = 0, -1
        while time.monotonic() < deadline:
            rows = current_rows()
            n = len(rows)
            last_viewers = rows[-1]["viewers"] if rows else None
            if platform == "chzzk":
                at_end = n > 0 and not chzzk_has_next(cap.items, required)
            else:
                total = generic_total(cap.items)
                at_end = n > 0 and total is not None and n >= total
            if at_end:
                reached_end = True
                break
            if mode == "threshold" and last_viewers is not None and last_viewers <= hakko_max:
                if crossed and extra_left <= 0:
                    break
                if crossed:
                    extra_left -= 1
                crossed = True
            stall = stall + 1 if n == last_n else 0
            last_n = n
            if n > 0 and stall >= common["baseline_stall_scrolls"]:
                log.warning("baseline %s: 새 방송이 %d번 연속 늘지 않아 멈춤 (n=%d)", platform, stall, n)
                break
            time.sleep(common["seconds_between_scrolls"])
            more = page.locator(cfg["load_more_button"]).last if cfg.get("load_more_button") else None
            if more is not None and more.count() and more.is_visible():
                more.scroll_into_view_if_needed()
                more.click()
            else:
                # 바닥에 닿은 채로 더 내리면 무한 스크롤이 다시 안 걸린다. 본문 위에서 조금 올렸다 내린다
                page.mouse.move(common["viewport"]["width"] * 0.6, common["viewport"]["height"] * 0.6)
                page.mouse.wheel(0, -1500)
                page.wait_for_timeout(700)
                page.mouse.wheel(0, 20000)
            page.wait_for_timeout(3000)
            if any(x.get("status") in (403, 429) for x in cap.items[-3:]):
                record_block(cfg["baseline_url"], "HTTP 429/403 in list responses")
                raise Blocked("list responses returned 429/403")
        with gzip.open(raw_dir / f"{platform}_baseline_responses.json.gz", "wt", encoding="utf-8") as f:
            json.dump(cap.items, f, ensure_ascii=False)
        page.screenshot(path=str(raw_dir / f"{platform}_baseline_end.jpg"), type="jpeg", quality=50)
    finally:
        ctx.close()

    rows = current_rows()
    for r in rows:
        if r.get("official") is None:
            r["official"] = int(is_official_name(r.get("channel"), sel["official_name_patterns"]))
    seq = [r["viewers"] for r in rows if r.get("viewers") is not None]
    # 페이지 사이 몇 초 동안 동접이 변하므로 엄밀한 단조 감소 대신 '역전 5% 미만'을 정렬 확인 기준으로 쓴다
    inversions = sum(a < b for a, b in zip(seq, seq[1:]))
    sorted_desc = int(bool(seq) and inversions / max(1, len(seq) - 1) < 0.05)
    meta = {"mode": mode, "n_loaded": len(rows), "min_loaded_viewers": min(seq) if seq else None,
            "crossed_threshold": int(crossed or reached_end),
            "total_lives": generic_total(cap.items) if platform == "soop" else None,
            "total_source": "list totalCount" if platform == "soop" else None, "total_complete": None,
            "total_viewers": sum(seq) if reached_end else None}
    return rows, reached_end, sorted_desc, meta


def collect_chzzk_total(browser, sel: dict, raw_dir: Path, max_minutes: float, log) -> dict:
    """치지직 카테고리 페이지를 끝까지 내려 카테고리별 openLiveCount를 합한다."""
    common, cfg = sel["common"], sel["chzzk"]
    ctx = new_context(browser, common)
    page = ctx.new_page()
    cap = Capture(cfg.get("total_response_patterns") or [])
    page.on("response", cap)
    try:
        resp = page.goto(cfg["total_url"], wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(common["first_wait_ms"])
        check_block(page, sel["block_markers"], resp.status if resp else None, cfg["total_url"], log)
        deadline = time.monotonic() + max_minutes * 60
        stall, last = 0, -1
        while time.monotonic() < deadline:
            total, ncat, complete = chzzk_category_total(cap.items)
            if complete and ncat:
                break
            stall = stall + 1 if ncat == last else 0
            last = ncat
            if ncat and stall >= common["baseline_stall_scrolls"]:
                break
            time.sleep(common["seconds_between_scrolls"])
            page.mouse.move(common["viewport"]["width"] * 0.6, common["viewport"]["height"] * 0.6)
            page.mouse.wheel(0, -1500)
            page.wait_for_timeout(700)
            page.mouse.wheel(0, 20000)
            page.wait_for_timeout(3000)
        with gzip.open(raw_dir / "chzzk_category_responses.json.gz", "wt", encoding="utf-8") as f:
            json.dump(cap.items, f, ensure_ascii=False)
    finally:
        ctx.close()
    total, ncat, complete = chzzk_category_total(cap.items)
    viewers, _, _ = chzzk_category_total(cap.items, "concurrentUserCount")
    return {"total_lives": total, "total_source": f"category openLiveCount sum ({ncat} categories)",
            "total_complete": int(complete), "total_viewers": viewers}


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(ROOT / load_settings()["paths"]["db"])
    con.executescript(SCHEMA)
    for table, col in (("audit_home", "tier"), ("audit_baseline", "tier"),
                       ("audit_baseline_meta", "total_viewers")):  # 예전 스키마에 열 추가
        cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        if col not in cols:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {'TEXT' if col == 'tier' else 'INTEGER'}")
    return con


def refresh_chzzk_flags(con: sqlite3.Connection, round_id: str) -> int:
    """저장된 홈 응답으로 치지직 카드의 official·tier를 다시 채운다 (판정 규칙을 고친 뒤 재처리용)."""
    raw = ROOT / load_settings()["paths"]["raw_audit"] / round_id / "chzzk_home_responses.json.gz"
    if not raw.exists():
        return 0
    with gzip.open(raw, "rt", encoding="utf-8") as f:
        idx = chzzk_live_index(json.load(f))
    with con:
        for cid, info in idx.items():
            con.execute("UPDATE audit_home SET official=?, tier=? WHERE round_id=? AND platform='chzzk' AND channel_id=?",
                        (int(info["official"]), info.get("tier"), round_id, cid))
    return len(idx)


def save_run(con, round_id, platform, kind, started, status, n, reached_end, sorted_desc, note, raw_dir):
    with con:
        con.execute("INSERT OR REPLACE INTO audit_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (round_id, platform, kind, started, now_kst().isoformat(timespec="seconds"),
                     nearest_slot(int(started[11:13])), status, n, reached_end, sorted_desc, note,
                     str(raw_dir.relative_to(ROOT))))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true", help="전체 라이브 기준선도 수집")
    ap.add_argument("--baseline-max-minutes", type=float)
    ap.add_argument("--baseline-mode", choices=["threshold", "full"], help="기본은 selectors.yaml의 baseline_mode")
    ap.add_argument("--order", choices=["chzzk-first", "soop-first", "alternate"], default="alternate")
    ap.add_argument("--skip-home", action="store_true", help="기준선만 수집 (점검용)")
    ap.add_argument("--platforms", default="chzzk,soop", help="점검용: 수집할 플랫폼 (쉼표 구분)")
    ap.add_argument("--refresh-flags", metavar="ROUND_ID", help="저장된 응답으로 치지직 official·tier만 다시 채우고 끝낸다")
    args = ap.parse_args(argv)
    if args.refresh_flags:
        n = refresh_chzzk_flags(connect(), args.refresh_flags)
        print(f"refreshed {n} chzzk channels in {args.refresh_flags}")
        return 0

    from playwright.sync_api import sync_playwright

    log = get_logger()
    sel = load_selectors()
    if sel["common"]["seconds_between_scrolls"] < 30:
        raise SystemExit("seconds_between_scrolls는 30초 이상이어야 한다 (AGENTS.md 규칙)")
    started_at = now_kst()
    round_id = started_at.strftime("%Y%m%dT%H%M") + "-" + uuid.uuid4().hex[:4]
    raw_dir = ROOT / load_settings()["paths"]["raw_audit"] / round_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    platforms = [p for p in ("chzzk", "soop") if p in args.platforms.split(",")]
    if args.order == "soop-first" or (args.order == "alternate" and started_at.minute // 15 % 2):
        platforms.reverse()
    con = connect()
    exe = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux64/chrome"))
    blocked = False

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe[-1] if exe else None)
        for i, pf in enumerate([] if args.skip_home else platforms):
            if i:
                time.sleep(10)  # 페이지 로드 사이 10초
            started = now_kst().isoformat(timespec="seconds")
            try:
                rows = collect_home(browser, pf, sel, raw_dir, log)
                with con:
                    con.executemany(
                        "INSERT INTO audit_home VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        [(round_id, pf, r["section"], r["slot_order"], r["screen"], r["channel"], r["channel_id"],
                          r["live_id"], r["viewers"], r["category"], r["official"], r["source"], r.get("tier"))
                         for r in rows])
                save_run(con, round_id, pf, "home", started, "ok" if rows else "empty", len(rows), None, None, "", raw_dir)
                log.info("[%s] home %s: %d cards", round_id, pf, len(rows))
            except Blocked as e:
                save_run(con, round_id, pf, "home", started, "blocked", 0, None, None, str(e), raw_dir)
                log.error("[%s] home %s BLOCKED: %s; stopping", round_id, pf, e)
                blocked = True
                break
            except Exception as e:
                save_run(con, round_id, pf, "home", started, "error", 0, None, None, repr(e)[:500], raw_dir)
                log.exception("[%s] home %s failed", round_id, pf)

        if args.baseline and not blocked:
            max_min = args.baseline_max_minutes or sel["common"]["baseline_max_minutes"]
            mode = args.baseline_mode or sel["common"].get("baseline_mode", "threshold")
            hakko_max = load_settings()["hakko_max_viewers"]
            for pf in platforms:
                time.sleep(30)
                started = now_kst().isoformat(timespec="seconds")
                try:
                    rows, end, desc, meta = collect_baseline(browser, pf, sel, raw_dir, max_min, mode, hakko_max, log)
                    if pf == "chzzk" and not end:
                        time.sleep(30)
                        meta.update(collect_chzzk_total(browser, sel, raw_dir, max_min, log))
                    elif end:
                        meta.update({"total_lives": len(rows), "total_source": "full list", "total_complete": 1,
                                     "total_viewers": sum(r["viewers"] or 0 for r in rows)})
                    with con:
                        con.executemany("INSERT INTO audit_baseline VALUES (?,?,?,?,?,?,?,?,?)",
                                        [(round_id, pf, r["channel_id"], r["live_id"], r["channel"], r["viewers"],
                                          r["category"], r["official"], r.get("tier")) for r in rows])
                        con.execute("INSERT OR REPLACE INTO audit_baseline_meta VALUES (?,?,?,?,?,?,?,?,?,?)",
                                    (round_id, pf, meta["mode"], meta["n_loaded"], meta["min_loaded_viewers"],
                                     meta["crossed_threshold"], meta["total_lives"], meta["total_source"],
                                     meta["total_complete"], meta.get("total_viewers")))
                    ok = rows and (end or meta["crossed_threshold"]) and meta["total_lives"]
                    save_run(con, round_id, pf, "baseline", started, "ok" if ok else "incomplete", len(rows),
                             int(end), desc, json.dumps(meta, ensure_ascii=False), raw_dir)
                    log.info("[%s] baseline %s: loaded %d (min %s), total %s (%s), end=%s, sorted=%s",
                             round_id, pf, len(rows), meta["min_loaded_viewers"], meta["total_lives"],
                             meta["total_source"], end, desc)
                except Blocked as e:
                    save_run(con, round_id, pf, "baseline", started, "blocked", 0, 0, None, str(e), raw_dir)
                    log.error("[%s] baseline %s BLOCKED: %s; stopping", round_id, pf, e)
                    break
                except Exception as e:
                    save_run(con, round_id, pf, "baseline", started, "error", 0, 0, None, repr(e)[:500], raw_dir)
                    log.exception("[%s] baseline %s failed", round_id, pf)
        browser.close()
    return 1 if blocked else 0


if __name__ == "__main__":
    sys.exit(main())
