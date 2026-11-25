# 치지직·숲 플랫폼 성향과 고착화 — 재현 안내

치지직(CHZZK)과 숲(SOOP)의 시청 집중, 추천 노출, 정책 사다리, 순위 이동성을 공개 자료로 측정하는 연구 코드와 원고다.
규칙은 [`AGENTS.md`](AGENTS.md), 진행 상태는 [`HANDOFF.md`](HANDOFF.md)에 있다.

## 폴더
| 경로 | 내용 |
|---|---|
| `collector/polite.py` | robots.txt 확인, 10초·30초 간격, 차단 시 중단을 강제하는 HTTP 수집기 |
| `collector/streamrate.py` | 연구 1·2b: stream-rate 뷰어십 순위 → SQLite 날짜별 스냅샷 |
| `collector/streamrate_history.py` | 연구 2a: 개인 기록 페이지의 30일 방송일별 동접 → `daily_history` |
| `collector/audit.py` | 연구 3: Playwright 비로그인 홈 추천 + 전체 라이브 기준선 |
| `analysis/` | 연구별 분석 (`concentration`, `longitudinal`, `exposure`, `policy`) |
| `config/` | `settings.yaml`(간격·경로·분석 설정), `selectors.yaml`(DOM 선택자·응답 패턴), `events.yaml`(대형 이벤트 날짜) |
| `data/streamrate.sqlite` | 스냅샷(`snapshots`, `rankings`)과 감사(`audit_*`) 테이블 |
| `data/raw/` | 원본 HTML(gzip)·응답·스크린샷. 감사 원본은 용량 때문에 기본적으로 git에서 뺀다 |
| `data/policy/` | 연구 4 정책 코딩표와 시장 지표 (출처·최초 보도일 KST) |
| `paper/` | 원고 템플릿, 렌더러, docx 빌더, 그림 |

## 설치
```bash
cd platform-study
pip install -r requirements.txt
# Playwright 브라우저: 이미 설치된 Chromium이 있으면 audit.py가 /opt/pw-browsers에서 찾는다.
# 없으면: python -m playwright install chromium
# 그림의 한글 글꼴: NanumGothic (Ubuntu: apt-get install fonts-nanum)
```

## 한 번에 다시 계산하기
```bash
python -m analysis.concentration   # 연구 1 → analysis/out/study1_*, 그림 1·2
python -m analysis.mobility_history # 연구 2a → study2h_*, 그림 3 (30일 회고 패널)
python -m analysis.longitudinal    # 연구 2b → study2_* (스냅샷이 쌓여야 의미 있음)
python -m analysis.live_snapshot   # 연구 5 → study5_*, 그림 5
python -m analysis.exposure        # 연구 3 → study3_*
python -m analysis.policy          # 연구 4 → study4_*, 그림 4
python paper/render.py             # paper_template.md → paper.md (수치를 결과 파일에서 채움)
python paper/build_docx.py         # paper.md → paper.docx
python -m pytest -q tests
```

## 수집 일정 (사람이 자기 컴퓨터에서 실행)
클라우드 세션은 사라지므로 장기 수집은 상시 켜진 컴퓨터에서 돌린다. 모든 시각은 KST.

```cron
# 연구 1·2b: 매일 1회 (stream-rate가 하루 1회 갱신)
30 11 * * *  cd /path/platform-study && python -m collector.streamrate
# 연구 2a: 4주마다 한 번 30일 기록을 다시 받아 회고 패널을 이어 붙인다 (상위 100명 × 2 ≈ 100분)
0 13 */28 * *  cd /path/platform-study && python -m collector.streamrate_history --top 100

# 연구 3: 7일 × 12·18·22·02시 × 시간대당 4회. 각 시간대 첫 회차에만 기준선을 함께 받는다.
0  12,18,22,2 * * *  cd /path/platform-study && python -m collector.audit --baseline
15,30,45 12,18,22,2 * * *  cd /path/platform-study && python -m collector.audit
```
- 기준선 회차(`--baseline`)는 연구 5 전수 스냅샷도 겸한다. 숲까지 전체를 받으려면 `--baseline-mode full`(숲 약 10분).
- 한 회차의 홈 수집은 두 플랫폼 합쳐 약 4분(스크롤 사이 30초 × 3번 × 2)이라 "5분 안에 연달아" 조건을 지킨다.
- 기준선(threshold 모드)은 하꼬 경계(동접 50명 미만)가 나올 때까지만 시청자순 목록을 내리고,
  전체 라이브 수는 숲은 목록 응답의 `totalCount`, 치지직은 카테고리 페이지의 `openLiveCount` 합으로 얻는다.
  끝까지 내리는 검증용 실행은 `--baseline-mode full`.
- 429나 차단 화면이 나오면 `data/logs/blocks.jsonl`에 남기고 멈춘다. 다시 돌리기 전에 원인을 확인한다.
- 대형 스포츠 중계 날은 `config/events.yaml`에 날짜를 적는다.

## 선택자가 깨졌을 때
사이트 개편으로 카드가 0개 잡히면 `config/selectors.yaml`만 고친다. 확인 방법은 HANDOFF.md의 "DOM 점검" 참고.

## 데이터 출처와 제약
- stream-rate.com/viewership: robots.txt 전면 허용. 섭외용으로 추린 약 550명 명단이라 하꼬 구간이 빠져 있다.
- weflview.com 과거 랭킹: 화면이 robots.txt 금지 경로(`/api/`)에서 데이터를 불러와 쓰지 않았다.
- softc.one(소프트콘): 봇 확인 화면(HTTP 429)이 떠서 규칙대로 기록하고 중단했다. 소프트콘 수치는 기사 인용으로만 쓴다.
- 치지직·숲 홈과 목록: robots.txt 전면 허용. 페이지가 스스로 받은 응답만 읽는다.
