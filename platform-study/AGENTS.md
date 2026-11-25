# AGENTS.md — 치지직·숲 플랫폼 집중·고착화 연구

이 폴더에서 일하는 사람과 에이전트가 지켜야 할 규칙이다. 작업 상태는 `HANDOFF.md`에 남긴다.

## 연구 질문
- RQ1. 숲(SOOP)은 플랫폼으로서 경쟁 우위(메리트)를 갖는가?
- RQ2. 치지직은 대형 쪽으로 고착화되는가?
  - 2-A: 시청이 공식·중계 채널로 쏠리는가
  - 2-A′: 시청이 대형 개인 스트리머로 쏠리는가
  - 2-C: 정책이 대형 위주로 설계돼 작은 방송인의 사다리를 끊는가
- RQ3. 치지직 추천 알고리즘은 소규모 방송(동접 50명 미만)를 덜 노출하는가?
- RQ4. 상위권은 시간이 지나도 같은 사람들로 굳어 있는가(순위 이동성)? 두 플랫폼 비교.

## 연구 구성
| 연구 | RQ | 코드 | 데이터 |
|---|---|---|---|
| 1 시청 집중도 횡단 | 2-A′ | `collector/streamrate.py`, `analysis/concentration.py` | stream-rate.com/viewership |
| 2a 30일 회고 패널 | 4 (H6 시범) | `collector/streamrate_history.py`, `analysis/mobility_history.py` | stream-rate 개인 기록 페이지 (방송일별) |
| 2b 8주 전향 패널 | 4 (H6) | 연구 1 수집기 매일 1회, `analysis/longitudinal.py` | SQLite 날짜별 스냅샷 (최소 8주) |
| 3 추천 노출 감사 | 3 | `collector/audit.py`, `analysis/exposure.py` | 비로그인 홈 + 전체 라이브 기준선 |
| 4 정책 내용 분석 | 2-C, 1 | `data/policy/*.csv`, `analysis/policy.py` | 보도자료·기사 (최초 보도일 KST) |
| 5 실시간 전수 스냅샷 | 2-A, 2-A′ (H2) | `collector/audit.py --baseline`, `analysis/live_snapshot.py` | 같은 시각 전체 라이브 + 카테고리 합 |

가설 H1~H6과 주 지표·판정 기준은 원고 1.3절, 미검증 가설의 분석 계획은 부록 B에 고정돼 있다.
계획에서 벗어난 분석은 원고에 '탐색'으로 표시한다. 논문 가치 평가는 `paper/ASSESSMENT.md`.

## 윤리·수집 규칙 (반드시 지킬 것)
1. IP·프록시 순환, CAPTCHA 우회, 봇 탐지 회피, 가짜 계정 생성은 하지 않는다.
   이 규칙은 "사람이 조사한다"고 밝히는 것으로 면제되지 않는다. 접근 통제를 넘는 행위이기 때문이다.
2. 서명이 필요한 비공개 API를 흉내 내지 않는다. 페이지가 스스로 보낸 응답을 읽는 것만 허용한다.
3. robots.txt를 지킨다. 금지 경로(예: weflview `/api/`)는 직접이든 간접이든 쓰지 않는다.
4. 페이지 로드 사이 10초 이상, 같은 사이트 연속 요청 사이 30초 이상. `collector/polite.py`와
   `config/selectors.yaml`의 하한(10초·30초)을 낮추지 않는다.
5. 429·403·차단 화면이 나오면 `data/logs/blocks.jsonl`에 기록하고 그 사이트 수집을 중단한다.
6. 개인정보는 수집하지 않는다. 채널명, 채널 ID, 공개 수치(동접·팔로워·방송시간)만 저장한다.
7. 비로그인 상태로만 감사한다. 회차마다 새 browser context(빈 쿠키)를 연다.

## 분석 규칙
- 논문의 수치는 모두 `analysis/` 코드로 다시 계산한다. 손으로 옮겨 적지 않는다.
- 선행 결과(2026-11-24)와 다르면 원고에 차이와 이유를 적는다.
- 부트스트랩 5,000회, 시드 `config/settings.yaml`의 `random_seed`.
- 연구 1: 스포츠·동시 송출 제외가 기본. 강건성 = 1위 제외 / 동시 송출 포함 / 게임만.
- 연구 3: 소규모 방송 = 동접 49명 이하. 노출 비율 = 추천 중 소규모 방송 비율 ÷ 전체 라이브 중 소규모 방송 비율.
  기준선을 끝까지 내리지 못한 회차는 표시하고 해석에서 구분한다.
- 연구 4: 출처는 최초 보도일(KST). 재게시는 note에 "재보도"로 구분. 모르면 "날짜 확인 불가".

## 산출물 위치
- 데이터: `data/streamrate.sqlite`, 원본 `data/raw/`, 로그 `data/logs/`
- 분석 결과: `analysis/out/`
- 논문: `paper/paper.md`, `paper/paper.docx` (`python paper/build_docx.py`), 그림 `paper/figures/`
