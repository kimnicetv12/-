"""규칙을 지키는 HTTP 수집기.

- robots.txt를 확인하고 금지 경로는 요청하지 않는다.
- 페이지 로드 사이 10초, 같은 사이트 연속 요청 사이 30초 이상을 둔다.
- 429·403·차단 화면이 보이면 기록하고 BlockedError로 중단한다.
- 프록시 순환, 헤더 위장, CAPTCHA 우회는 하지 않는다.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.robotparser
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))

HARD_MIN_PAGE = 10
HARD_MIN_SITE = 30


class BlockedError(RuntimeError):
    """사이트가 차단 신호를 보냈다. 수집을 멈춰야 한다."""


class RobotsDisallowed(RuntimeError):
    """robots.txt가 금지한 경로다."""


def load_settings() -> dict:
    with open(ROOT / "config" / "settings.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def now_kst() -> datetime:
    return datetime.now(KST)


def get_logger() -> logging.Logger:
    settings = load_settings()
    log_path = ROOT / settings["paths"]["log"]
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("collector")
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        fh = logging.FileHandler(log_path, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(fh)
        sh = logging.StreamHandler()
        sh.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
        logger.addHandler(sh)
    return logger


def detect_block(status: int, body: str, settings: dict) -> str | None:
    """차단 신호가 있으면 그 이유를, 없으면 None을 돌려준다."""
    signals = settings["block_signals"]
    if status in signals["status_codes"]:
        return f"HTTP {status}"
    head = body[:20000]
    for marker in signals["body_markers"]:
        if marker in head:
            return f"marker '{marker}'"
    return None


@dataclass
class _SiteState:
    robots: urllib.robotparser.RobotFileParser | None = None
    last_request: float = 0.0
    blocked: str | None = None


class PoliteSession:
    def __init__(self, settings: dict | None = None):
        self.settings = settings or load_settings()
        rl = self.settings["rate_limit"]
        self.min_page = max(HARD_MIN_PAGE, rl["min_seconds_between_page_loads"])
        self.min_site = max(HARD_MIN_SITE, rl["min_seconds_same_site"])
        self.timeout = rl["request_timeout_seconds"]
        self.session = requests.Session()
        self.session.headers["User-Agent"] = self.settings["user_agent"]
        self.sites: dict[str, _SiteState] = {}
        self.last_any = 0.0
        self.log = get_logger()

    def _site(self, url: str) -> _SiteState:
        host = urlparse(url).netloc
        if host not in self.sites:
            self.sites[host] = _SiteState()
        return self.sites[host]

    def _wait(self, site: _SiteState) -> None:
        now = time.monotonic()
        wait = 0.0
        if self.last_any:
            wait = max(wait, self.min_page - (now - self.last_any))
        if site.last_request:
            wait = max(wait, self.min_site - (now - site.last_request))
        if wait > 0:
            time.sleep(wait)

    def _robots(self, url: str, site: _SiteState) -> urllib.robotparser.RobotFileParser:
        if site.robots is None:
            p = urlparse(url)
            robots_url = f"{p.scheme}://{p.netloc}/robots.txt"
            self._wait(site)
            resp = self.session.get(robots_url, timeout=self.timeout)
            site.last_request = self.last_any = time.monotonic()
            rp = urllib.robotparser.RobotFileParser()
            if resp.status_code == 200 and "html" not in resp.headers.get("content-type", ""):
                rp.parse(resp.text.splitlines())
            elif resp.status_code in (401, 403):
                rp.disallow_all = True
            else:
                rp.allow_all = True
            reason = detect_block(resp.status_code, resp.text, self.settings)
            if reason:
                site.blocked = reason
                self.log.warning("blocked while reading robots %s: %s", robots_url, reason)
                raise BlockedError(f"{robots_url}: {reason}")
            site.robots = rp
        return site.robots

    def get(self, url: str) -> requests.Response:
        site = self._site(url)
        if site.blocked:
            raise BlockedError(f"{urlparse(url).netloc} already blocked: {site.blocked}")
        rp = self._robots(url, site)
        if not rp.can_fetch(self.settings["user_agent"], url):
            self.log.warning("robots.txt disallows %s; skipped", url)
            raise RobotsDisallowed(url)
        self._wait(site)
        resp = self.session.get(url, timeout=self.timeout)
        site.last_request = self.last_any = time.monotonic()
        reason = detect_block(resp.status_code, resp.text, self.settings)
        if reason:
            site.blocked = reason
            self.log.warning("BLOCKED %s: %s; stopping this site", url, reason)
            record_block(url, reason)
            raise BlockedError(f"{url}: {reason}")
        self.log.info("GET %s -> %s (%d bytes)", url, resp.status_code, len(resp.content))
        return resp


def record_block(url: str, reason: str) -> None:
    """차단 기록을 data/logs/blocks.jsonl에 남긴다."""
    path = ROOT / "data" / "logs" / "blocks.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps({"at_kst": now_kst().isoformat(timespec="seconds"),
                            "url": url, "reason": reason}, ensure_ascii=False) + "\n")
