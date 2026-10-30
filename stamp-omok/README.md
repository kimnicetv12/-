# 도장오목

칸이 없는 한지 위에서 두 사람이 번갈아 **도장**을 찍는 오목 변형 게임입니다.
판은 늘 가려져 있고, 누군가 **자**를 대어 승리를 선언할 때만 공개됩니다.
한 기기를 돌려 쓰는 로컬 2인(핫시트) 대전이며, 외부 라이브러리 없이 HTML 파일 하나로 동작합니다.

## 실행

- `index.html`을 휴대폰 브라우저로 열면 바로 플레이할 수 있습니다 (세로 화면).
- 같은 와이파이의 휴대폰으로 열려면 이 폴더에서 `python3 -m http.server 8000`을 실행하고 `http://<PC IP>:8000`에 접속하세요.
- 글꼴(Gowun Batang/Dodum)만 Google Fonts에서 받으며, 오프라인이면 시스템 글꼴로 대체됩니다.

## 규칙

1. 차례마다 **도장 찍기**와 **자 확인** 중 하나만 합니다. 둘 다 차례 하나를 씁니다.
2. **도장 찍기**: 판이 가려진 채로 진행됩니다. 판을 눌러 팔 기준점(어깨)을 정하고, 팔 길이와 꺾는 방향(좌/우)을 고른 뒤 [놓기]를 누르세요.
   팔은 화면 위쪽으로 길이의 절반을 뻗고, 팔꿈치에서 직각으로 꺾여 나머지 절반을 갑니다. 그 끝에 도장이 찍힙니다.
3. 도장 지름은 바둑돌의 3/4이고, 이미 있는 도장과 겹치는 자리에는 찍히지 않습니다 ("쿵" 하고 막힘).
4. **자 확인**: 판이 두 사람 모두에게 공개됩니다. 자를 끌어 놓고 양 끝 손잡이로 돌려 맞춘 뒤 [판정하기]를 누르세요.
5. 내 도장 5개의 중심이 자의 허용 띠 안에 들고 한 직선에 고르게 놓여 있으면 승리합니다. 실패하면 차례만 넘어가며, 설정에서 벌칙을 고를 수 있습니다.

## 파일 구조

```
stamp-omok/
├── index.html               게임 전체 (CSS + 두 개의 <script>)
│   ├── <script id="core-logic">  CONFIG + 순수 함수 (DOM 없음, Node에서 테스트)
│   └── <script>                  화면·입력·연출·효과음
└── test/
    ├── core.test.js         핵심 로직 단위 테스트 (의존성 없음)
    └── smoke.playwright.js  실제 화면을 조작하는 흐름 테스트 (Playwright)
```

## 핵심 로직 (`core-logic`)

| 함수 | 역할 |
| --- | --- |
| `computeArm(start, length, dir, cfg)` | L자 팔: `hand = start + 앞·L·SPLIT + 옆·L·(1−SPLIT)` |
| `applyJitter(p, cfg, rng)` | 손떨림 (가우시안, 3σ에서 자름) |
| `findOverlap(p, stamps, cfg)` | 중심 거리 < 도장 지름이면 겹침 |
| `fitLineLeastSquares(points)` | 직교 최소제곱 직선: 방향 θ = ½·atan2(2Sxy, Sxx−Syy) |
| `rulerCandidates(ruler, …)` | 자의 허용 띠 안에 중심이 든 내 도장 |
| `judgeRuler(ruler, stamps, owner, cfg)` | 후보 5개 조합마다 ① 피팅 잔차 ≤ 허용 오차 ② 피팅 직선과 자의 각도·위치 차 ③ 이웃 간격 ④ 상대 도장 가로막기를 차례로 검사 |

길이 설정값은 모두 **도장 지름(D)의 배수**입니다. 도장 크기(`STONE_DIAMETER`, `STAMP_RATIO`), 허용 오차(`LINE_TOLERANCE`),
팔 최대 길이(`ARM_MAX_LENGTH`) 등은 파일 맨 위 `CONFIG`에 모여 있고, 일부는 게임 안 [설정]에서도 바꿀 수 있습니다.

## 테스트

```bash
node stamp-omok/test/core.test.js            # 핵심 로직 20개
npm i -D playwright && npx playwright install chromium
node stamp-omok/test/smoke.playwright.js     # 메뉴 → 다섯 줄 완성 → 실패·성공 판정까지
```
