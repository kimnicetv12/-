# HANDOFF — 작업 상태

마지막 갱신: 2026-11-25 (KST)

## 끝난 것
- [x] 연구 1 수집기·분석 (`collector/streamrate.py`, `analysis/concentration.py`). 첫 스냅샷 2026-11-25, 555명
- [x] 연구 4 정책 코딩표 18건(치지직 10, 숲 8) + 시장 지표 6건 (`data/policy/`), 분석 (`analysis/policy.py`)
- [x] 연구 2 분석 코드 (`analysis/longitudinal.py`). 스냅샷 1회뿐이라 결과 없음
- [x] 연구 3 수집기 (`collector/audit.py`) + 선택자 (`config/selectors.yaml`) + 분석 (`analysis/exposure.py`).
  시범 1회차 `20261125T1137-ab5a`(홈 두 플랫폼 + 숲 기준선) + 치지직 기준선 재수집 `20261125T1152-fdd3`.
  시범 노출 비율: 치지직 0.53, 숲 0.29 (상단 히어로 제외, n=1이라 판정 안 함)
- [x] 원고 템플릿·렌더러·docx 빌더 (`paper/`), `paper/paper.md`·`paper/paper.docx` 초고
- [x] 테스트 7개 (`tests/test_parsers.py`)
- [x] **확장(2026-11-25 오후)**: 연구 2a 30일 회고 패널(`collector/streamrate_history.py`, `analysis/mobility_history.py`),
  연구 5 실시간 전수 스냅샷(`analysis/live_snapshot.py`, 기준선 메타에 `total_viewers` 추가), 연구 1 순위-규모 기울기(`study1_zipf.csv`)
- [x] **재정비**: 원고를 '중계권 집중 vs 스타 집중' 틀과 가설 H1~H6으로 다시 짰다. 부록 B에 H2·H5·H6 사전 분석 계획.
  논문 가치 평가는 `paper/ASSESSMENT.md`

## 남은 것 (순서대로)
1. **연구 2 수집 8주**: `python -m collector.streamrate`를 매일 1회. 클라우드 세션은 사라지므로 상시 켜진 컴퓨터의 cron에서 돌린다 (README "수집 일정").
   2027-01-20 전후로 8주가 찬다. 그 뒤 `python -m analysis.longitudinal` → 원고 4.3 갱신.
2. **연구 3 수집 7일 × 4시간대 × 4회**: README의 cron 예시대로. 끝나면 `python -m analysis.exposure` → 원고 4.4, 판정표 RQ3 갱신.
   - 대형 스포츠 중계 날짜는 `config/events.yaml`에 적는다.
   - 하루 한 번은 `--baseline-mode full`로 끝까지 내려, threshold 모드의 전체 수 근사(특히 치지직 카테고리 합)를 검증한다.
3. 숲 홈 상단 히어로(큰 플레이어 + 오른쪽 4개)는 카드 선택자로 잡히지 않는다. 치지직 상단(premiumLives)은 응답으로 잡힌다.
   비교를 맞추려고 주 지표는 양쪽 히어로를 빼고 계산한다(`main_excl_hero`). 숲 히어로까지 넣으려면 선택자를 추가해야 한다.
4. 참고문헌 서지 확인, 정책 코딩표의 `검색 요약`·`2차 출처` 행을 원문으로 확인.
5. 매번 분석을 다시 돌린 뒤 `python paper/render.py && python paper/build_docx.py`.

## 예약된 수집 (이 세션에 send_later로 걸어 둠)
- 2026-11-25 18:05 KST, 22:05 KST: `collector.audit --baseline --baseline-mode full` 한 회차씩 → 저녁 시간대 연구 3·5 자료.
  세션이 끝나 있으면 사람이 같은 명령을 돌리면 된다.

## 연구 3 기준선의 제약 (중요)
- 치지직 웹은 시청자순 목록을 **120개(20 × 6페이지)까지만** 불러온다. 120번째가 동접 49 이하일 때만 50명 이상 방송을 다 센 것이다
  (`audit_baseline_meta.crossed_threshold=1`, `audit_runs.status='ok'`). 저녁·밤처럼 50명 이상이 120개를 넘으면 `incomplete`로 남고,
  분석은 그 회차를 기준선으로 쓰지 않는다. 시간대별 대안(카테고리별 목록 등)은 아직 없다 → 22·02시 결과 해석에 주의.
- 치지직 전체 라이브 수 = 카테고리 페이지 `openLiveCount` 합(하한). 숲 = 목록 응답 `totalCount`.
- 치지직 응답의 `verifiedMark`는 공식 채널이 아니라 등급 인증(PARTNER/CHALLENGER)이다. `official`은 `officialChannel`만 쓰고,
  등급은 `tier` 열에 따로 저장한다(시범 1회차는 `--refresh-flags`로 재처리함).

## 이번 세션에서 확인한 사실 (선행 결과와 다른 점)
- 루키 문턱으로 적혀 있던 "팔로워 150명·누적 시청자 500명·20시간"은 **루키 → 프로 전환 조건**이다. 루키는 조건 없음.
- 치지직 홈에 **'신입 스트리머 인사드립니다!' 슬롯(LIVE_NEW_STREAMER)**과 **'🎊팔로워 50명 돌파🎊' 슬롯**이 있다. "소규모 방송 노출 장치는 숲에만"은 틀렸다.
- 치지직 '전체 방송' 페이지 기본 정렬은 **추천순(100개)**이다. 기준선은 '시청자순' 버튼을 눌러야 한다.
- 챌린저 등급 최초 보도는 2026-10-01(머니투데이 URL 기준 11:23), 시행 2026-11-01.
- 숲 베스트 기준이 2026년 6월부터 완화됐다(500 → 100시간, 방송일 60 → 30일).
- stream-rate 명단이 538명 → 555명으로 늘었다. 연구 1 결론은 같다.

## 수집 중단·제외 기록
- softc.one: Vercel 봇 확인 화면(HTTP 429) → 중단. 소프트콘 수치는 기사 인용만.
- weflview.com 과거 랭킹: 데이터가 robots.txt 금지 경로 `/api/`에서 와서 사용 안 함.
- 시범 0회차(2026-11-25 11:21): 숲 카드 선택자 오류(li만 잡음)와 치지직 기준선 정렬 오류(추천순)로 폐기, DB에서 삭제.

## DOM 점검 (선택자가 깨졌을 때)
1. `python -m collector.audit` 한 번 돌리고 `data/raw/audit/<회차>/`의 스크린샷과 `*_home.html.gz`를 본다.
2. 숲: 카드 = `[data-type="cBox"]`, 동접 = `[data-testid="view-count"]`. 치지직: 카드 = `a[href^="/live/"]`, 수치는 홈 응답(`.../topics/HOME/sub-topics/HOME/main...`).
3. 바뀐 부분만 `config/selectors.yaml`에 반영하고 `tests/` 실행.
