# 🥌 컬링 오목 (가제: STONE LINE) — Claude Code 개발 프롬프트

> **사용법**: 이 파일의 `---` 아래 내용을 **전부 복사**해서, 새 빈 폴더(또는 새 Unity 프로젝트 폴더)에서 실행한 Claude Code에 그대로 붙여넣으세요.
> 한 번에 다 만들기엔 큰 작업이므로, 프롬프트 안에 **단계(마일스톤)별로 진행하고 단계마다 보고하라**는 지시가 들어 있습니다.
> 이후 수정은 같은 폴더에 생기는 `CLAUDE.md` 덕분에 언제든 Claude Code에 "○○ 바꿔줘"라고만 말하면 됩니다. (`MODIFY_EXAMPLES.md` 참고)

---

## 0. 너의 역할

너는 Unity(C#) 모바일 게임 전문 시니어 개발자다. 아래 기획서에 따라 **컬링 + 오목을 결합한 1인용 모바일 게임**을 처음부터 끝까지 구현한다.
- 코드는 **컴파일 가능하고 바로 실행 가능한 상태**로 작성한다. 의사코드·TODO로 남기지 않는다.
- 내가 Unity 에디터에서 수작업으로 오브젝트를 연결하지 않아도 되도록, **에디터 자동 셋업 메뉴**(아래 9장)로 씬·프리팹·ScriptableObject를 생성하게 만든다.
- 모든 밸런스 수치는 코드에 하드코딩하지 말고 **ScriptableObject 설정 파일**로 뺀다.
- 나중에 Claude로 계속 수정할 프로젝트이므로 **문서화(CLAUDE.md, docs/)와 구조의 일관성**을 최우선으로 한다.
- 기획이 모호한 부분은 합리적인 기본값을 정하고 진행하되, `docs/DECISIONS.md`에 "무엇을 왜 그렇게 정했는지" 기록한다.

## 1. 게임 한 줄 요약

플레이어와 AI가 번갈아 가며 **지정된 발사 구역에서 돌 하나를 밀어 던지고**, 돌은 판 위를 미끄러지며 벽·장애물·다른 돌과 **물리적으로 부딪히고 튕긴다**. 격자 없이 자유롭게 멈춘 돌들이 **같은 색으로 N개 한 줄(N = 3, 4, 5 중 플레이어가 선택)** 을 먼저 이루는 쪽이 승리한다.

## 2. 기술 스택 / 프로젝트 설정

| 항목 | 값 |
| --- | --- |
| 엔진 | **Unity 6 LTS (6000.0.x)**. 2022.3 LTS에서도 컴파일되도록 버전 차이 API는 `#if UNITY_6000_0_OR_NEWER`로 분기 (예: `Rigidbody2D.linearDamping` vs `drag`) |
| 렌더 | URP 2D, **탑뷰 2D** |
| 물리 | **Physics 2D** (`Rigidbody2D`, `CircleCollider2D`, `PhysicsMaterial2D`) |
| 입력 | **Input System 패키지** (터치 + 에디터 마우스 동시 지원) |
| UI | uGUI + TextMeshPro, **세로(Portrait) 고정**, 기준 해상도 1080×1920, **Safe Area 대응** |
| 다국어 | **Unity Localization 패키지** (ko / en / ja) |
| 결제 | **Unity IAP** (실제 키 없이도 동작하도록 `FakeStore`/모의 모드 지원) |
| 광고 | `IAdService` 인터페이스 + `MockAdService` 구현 (실제 SDK는 나중에 교체) |
| 저장 | JSON 파일 (`Application.persistentDataPath`), 버전 필드 포함 |
| 타깃 | Android / iOS, 60fps |
| 기타 | Asset Serialization = **Force Text**, Unity용 `.gitignore` 포함 |

## 3. 게임 규칙

### 3-1. 기본 진행
1. 게임 시작 시 플레이어가 **줄 수 N(3/4/5)**, **판(보드)**, **AI 난이도**를 고른다.
2. 선공은 무작위(설정에서 "항상 선공" 옵션 가능). 플레이어는 흑, AI는 백 (스킨에 따라 외형은 달라도 진영 구분은 명확히).
3. 각 턴에 자기 돌 **1개**를 판 하단(플레이어)/상단(AI)의 **발사 구역(Launch Zone)** 안 원하는 위치에 놓고 던진다.
4. 판 위의 **모든 돌이 멈추면**(모든 속도 < `restVelocityThreshold`가 `restDuration` 동안 유지, 혹은 최대 `maxSettleTime` 초과 시 강제 정지) 턴 판정을 한다.
5. 판 밖으로 나가거나 구멍에 빠진 돌은 **제거**된다.
6. 턴 판정 순서:
   - 양쪽 모두 줄 검사.
   - **던진 사람만** 줄 완성 → 던진 사람 승리.
   - **상대만** 줄 완성(내가 쳐서 상대 줄을 만들어 줌) → 상대 승리 ("자책골").
   - **둘 다** 완성 → 던진 사람 승리.
7. 각자 최대 돌 개수(`maxStonesPerPlayer`, N별 기본값 3줄:8 / 4줄:10 / 5줄:12)를 모두 던져도 승부가 안 나면 **판 위 가장 긴 줄** 비교 → 같으면 판 위 남은 돌 수 → 그래도 같으면 무승부.

### 3-2. "한 줄" 판정 (격자 없는 오목) — 핵심 시스템
격자가 없으므로 다음 규칙으로 "연결된 직선"을 정의한다. 수치는 모두 `LineRuleConfig` ScriptableObject로 조정 가능.
- **연결 거리**: 같은 색 두 돌의 중심 거리 ≤ `linkDistance` (기본 = 돌 지름 × 1.35) 이면 이웃.
- **직선성**: 줄 A→B→C…에서 각 구간 방향이 **줄 전체의 기준 방향**과 이루는 각이 `angleTolerance`(기본 18°) 이내.
- **간격 금지**: 줄 사이에 다른 색 돌이 끼어 있으면(선분과 상대 돌 원이 교차) 끊긴 것으로 본다.
- 알고리즘: 같은 색 돌로 이웃 그래프를 만든 뒤, 모든 이웃 쌍(a,b)을 시작 방향으로 삼아 양방향으로 확장하며 가장 긴 직선 체인을 찾는다. 중복 체인 제거. 돌 수가 적으므로 O(n³) 이내면 충분.
- 결과 구조체 `LineResult { int length; List<Stone> stones; Vector2 direction; }`를 반환하고, **승리 시 해당 돌들을 선으로 이어 반짝이는 연출**을 한다.
- **디버그 기즈모**: 에디터/개발 빌드에서 이웃 연결선과 감지된 줄을 표시하는 토글.
- `LineDetector`는 **MonoBehaviour에 의존하지 않는 순수 C# 클래스**로 만들어 (입력: `IReadOnlyList<StoneData{Vector2 pos; int owner; float radius}>`) AI 시뮬레이션과 테스트에서 재사용한다.

### 3-3. 던지기 조작
- 발사 구역 안을 터치 → 돌이 그 위치에 놓임 (구역 안에서 좌우로 드래그해 위치 조정).
- **뒤로 당기는 슬링샷 방식**: 당긴 반대 방향으로 발사, 당긴 길이 = 힘 (0~`maxPower`, 최소 힘 미만이면 취소).
- 조준 중에는 **짧은 예상 궤적 점선**(첫 충돌 지점까지만, 이후 반사는 보여주지 않음)과 **파워 게이지**를 표시.
- **회전(컬)**: 화면 하단 좌/우 회전 버튼(없음/좌/우). 회전을 주면 이동 중 진행 방향의 수직으로 약한 힘(`curlForce`)이 가해져 휘어 간다. 컬링 느낌의 핵심이므로 반드시 구현.
- 발사 후 카메라는 고정(판 전체가 보이도록 자동 맞춤), 돌이 움직이는 동안 입력 잠금.

### 3-4. 물리
- 돌: `Rigidbody2D`(중력 0, 회전 고정 해제 가능), `CircleCollider2D`, `CollisionDetectionMode2D.Continuous`, `Interpolate`.
- 감속: 기본 `linearDamping` + 바닥 재질 구역(얼음/모래 등)에 들어가면 damping을 해당 구역 값으로 변경 (`SurfaceZone` 트리거).
- 돌↔돌 충돌: 반발계수 `stoneBounciness`(기본 0.85), 운동량이 자연스럽게 전달되게.
- 벽: `wallBounciness`(기본 0.6).
- 충돌 시 **세기 비례 효과음 + 작은 파티클 + 약한 진동(Handheld.Vibrate 대신 설정에서 끌 수 있는 래퍼)**.
- 모든 물리 수치는 `PhysicsConfig` ScriptableObject.
- AI 예측용으로 **별도 물리 씬**(`LocalPhysicsMode.Physics2D` + `PhysicsScene2D.Simulate`)에서 현재 판 상태를 복제해 시뮬레이션할 수 있게 `ShotSimulator`를 만든다. (실제 게임 물리와 동일한 설정을 공유해야 함)

## 4. 보드(판) — 각자 개성 있는 장애물

보드는 `BoardDefinition` ScriptableObject(이름 로컬라이즈 키, 썸네일, 프리팹, 해금 비용, 권장 N, 설명) + 보드 프리팹으로 구성한다. 최소 **6종**:

| # | 이름 | 특징 |
| --- | --- | --- |
| 1 | **클래식 빙판** | 사각 벽만 있는 기본 판. 튜토리얼용, 기본 해금 |
| 2 | **얼음 호수** | 중앙에 마찰이 매우 낮은 얼음 구역 → 돌이 멀리 미끄러짐. 가장자리 일부는 벽이 없어 밖으로 떨어질 수 있음 |
| 3 | **범퍼 정원** | 원형 범퍼 기둥(반발 1.2 이상, 맞으면 튕겨 나감 + 빛남) 5~7개 배치 |
| 4 | **모래 사막** | 모래 구역(마찰 큼, 돌이 빨리 멈춤) + 바위 벽 칸막이로 길이 나뉨 |
| 5 | **블랙홀 정거장** | 구멍 2~3개(빠지면 돌 제거), 구멍 주변에 약한 끌림(PointEffector2D) |
| 6 | **풍차 마을** | 천천히 회전하는 막대 장애물(Kinematic Rigidbody2D) + 좌우로 왕복하는 이동 벽 |

- 장애물은 재사용 가능한 컴포넌트로: `Bumper`, `SurfaceZone`(마찰 배수), `Hole`, `GravityWell`, `Rotator`, `PingPongMover`, `OneWayWall`(선택).
- 새 보드를 추가할 때 **코드 수정 없이** 프리팹 + `BoardDefinition`만 만들면 되도록 설계. 방법을 `docs/HOW_TO_ADD_CONTENT.md`에 적는다.
- 플레이 화면 보드 선택 시 **썸네일 + 장애물 요약 아이콘** 표시. 잠긴 보드는 골드로 해금 (기본 해금: 1번만).

## 5. AI (상대) — "적당히 약하게"

### 5-1. 구조
- `IOpponentAI` 인터페이스: `ShotDecision Decide(BoardSnapshot snapshot, MatchRules rules)` (코루틴/async로 여러 프레임에 분산해 프레임 드랍 방지).
- `ShotDecision { Vector2 launchPosition; Vector2 direction; float power; CurlType curl; }`
- 방식: **후보 샷 샘플링 → `ShotSimulator`로 결과 예측 → 평가 함수로 점수 → 난이도에 따라 선택 → 실행 시 노이즈 추가**.

### 5-2. 평가 함수 (`BoardEvaluator`, 순수 C#)
- 내 최장 직선 길이와 "열린 줄"(양 끝이 막히지 않고 연장 가능한 공간 존재) 보너스.
- 상대의 **N-1 위협 줄**을 깨뜨리거나 막으면 큰 보너스 (방어).
- 상대 돌을 판 밖으로 쳐내면 보너스, 내 돌이 나가면 패널티.
- 이번 샷으로 **상대 줄을 완성시켜 주면 매우 큰 패널티** (자책골 회피).
- 가중치는 `AIProfile` ScriptableObject에 있음.

### 5-3. 줄 수(N)에 따른 AI 변화
`AIProfile`에 N별 가중치 세트를 둔다.
- **3줄**: 승부가 빠르므로 **방어 가중치 높음**, 상대 2연결도 즉시 위협으로 판단, 공격은 짧고 직선적인 샷 위주.
- **4줄**: 공격/방어 균형. 열린 3연결을 만드는 샷 선호.
- **5줄**: 장기전. **판 중앙 확보·돌 뭉치기(포지셔닝)** 가중치 높음, 상대 돌 쳐내기 비중 증가, 위협 판단은 3연결부터.

### 5-4. 난이도 (일부러 약하게)
| 난이도 | 후보 샷 수 | 선택 방식 | 실행 노이즈(각도/힘) | 실수 확률 | 방어 인식 |
| --- | --- | --- | --- | --- | --- |
| 쉬움 | 12 | 상위 50% 중 무작위 | ±8° / ±20% | 25% (무작위 샷) | N-1 위협만 가끔(50%) 인식 |
| 보통 | 30 | 상위 3개 중 가중 무작위 | ±4° / ±10% | 10% | N-1 위협 인식 |
| 어려움 | 60 | 최고점 | ±2° / ±5% | 3% | N-2 위협까지 인식 |

- **어려움도 완벽하지 않게**: 노이즈와 실수 확률을 0으로 만들지 않는다. 컬(회전)은 어려움만 사용.
- 생각하는 연출: AI 턴에 0.6~1.2초 조준 애니메이션 후 발사.
- 승률 밸런스 목표(평균적인 플레이어 기준): 쉬움 80%, 보통 55%, 어려움 35% 플레이어 승. `docs/AI.md`에 튜닝 방법 기술.
- 에디터 메뉴 **AI vs AI 자동 대전 시뮬레이션**(100판, 헤드리스 물리 씬)으로 난이도 간 승률을 로그로 출력하는 툴을 제공.

## 6. 골드 / 보상

- `RewardConfig` ScriptableObject:
  - 승리 기본: 쉬움 20 / 보통 40 / 어려움 70
  - 줄 수 배율: 3줄 ×1.0 / 4줄 ×1.3 / 5줄 ×1.6
  - 보드 보너스: 보드별 +0~20%
  - 패배 위로금: 승리 기본의 20%, 무승부 40%
  - 빠른 승리 보너스: 남은 돌 1개당 +2
  - 결과 화면 **광고 보고 2배** 버튼 (광고 제거 구매자는 광고 시청 없이 버튼만 눌러 바로 2배)
- 결과 화면: 승/패, 사용 턴, 획득 골드 카운트업 애니메이션, [다시하기] [다른 설정] [홈].
- 골드는 `Wallet` 서비스를 통해서만 증감 (이벤트 `OnGoldChanged`로 UI 갱신).

## 7. 화면(UI) 구성

모든 화면은 세로 모바일, Safe Area 적용, 버튼 최소 터치 영역 120px, 버튼 눌림 애니메이션 + 효과음. 상단 바에는 항상 **프로필 아이콘 · 이름 · 보유 골드** 표시.

### 7-1. 입장(메인) 화면
- 게임 로고, 배경에 돌이 천천히 굴러다니는 연출.
- 큰 버튼: **▶ 플레이**, **🛒 상점**, **🎨 스킨**, **⚙ 설정** (모두 클릭 가능, 각 화면으로 전환).
- 첫 실행 시 이름 입력 팝업 → 간단 튜토리얼(클래식 빙판, 3줄, 쉬움) 제안.

### 7-2. 플레이 설정 화면
- **줄 수**: 3 / 4 / 5 토글.
- **판**: 가로 스크롤 카드(썸네일, 이름, 특징, 잠금 시 해금 비용).
- **AI 난이도**: 쉬움 / 보통 / 어려움 (각각 예상 보상 표시).
- **선공**: 무작위 / 나 먼저 / AI 먼저.
- [시작] 버튼. 마지막 선택값 저장.

### 7-3. 인게임 화면
- 상단: 내 남은 돌 / AI 남은 돌, 목표 "N줄", 현재 턴 표시, 일시정지 버튼.
- 하단: 파워 게이지, 컬 버튼(좌/없음/우).
- 일시정지 메뉴: 계속 / 다시하기 / 설정(사운드) / 기권(홈).
- 줄 3개 이상 연결되면 해당 돌 사이에 희미한 연결선 표시(설정에서 끌 수 있는 "줄 도우미").

### 7-4. 상점 화면
- **골드 상점**: 골드 팩 4종 (예: 500 / 1,200 / 3,000 / 8,000 골드), 가격은 IAP 카탈로그에서 로컬 통화로 표시.
- **광고 제거** (비소모성): 판 사이 전면 광고 제거 + 보상형 광고(2배·무료 골드)는 시청 없이 즉시 지급.
- **스타터 팩** (선택): 광고 제거 + 골드 + 한정 스킨 묶음.
- **구매 복원** 버튼 (iOS 필수).
- **무료 골드**: 보상형 광고 시청 시 50골드 (하루 5회 제한).
- 실제 결제 키가 없으면 개발 빌드에서 모의 결제로 동작하고, 화면 구석에 "TEST STORE" 표시.

### 7-5. 스킨 화면
- 탭 3개: **판 스킨 / 돌 스킨 / 트레일**.
- 그리드 카드: 미리보기, 이름, 가격(골드), 상태(구매 / 장착 / 장착중).
- 선택 시 상단 **미리보기 영역**에서 실제 판 위에 돌이 트레일을 그리며 굴러가는 애니메이션.
- 각 카테고리 최소 6종, 등급(일반/희귀/전설)별 가격. 예시:
  - 판: 기본 원목, 대리석, 네온 그리드, 벚꽃, 우주, 얼음 왕국
  - 돌: 기본 흑백, 유리구슬, 금속, 보석, 행성, 귀여운 동물 얼굴
  - 트레일: 없음(기본), 하얀 줄, 무지개, 불꽃, 별가루, 하트
- 판 스킨은 **보드 종류(장애물 배치)와 독립적인 외형(바닥 텍스처·색·테두리)** 이다. 어떤 보드에도 적용됨.
- AI 돌은 플레이어 스킨과 구분되는 대비 색으로 자동 틴트.
- 스킨 데이터: `SkinDefinition` ScriptableObject (id, 카테고리, 등급, 가격, 스프라이트/머티리얼, 트레일 설정 `Gradient/width/time`, 파티클 프리팹 선택).
- 그래픽 에셋이 없으므로 **스프라이트는 코드/셰이더로 절차 생성**(원형 그라데이션, 패턴)하거나 단색 플레이스홀더로 만들되, 나중에 이미지만 교체하면 되도록 구조화.

### 7-6. 설정 화면
- **이름 변경** (2~12자, 금칙어 필터 훅만 마련).
- **프로필 변경**: 기본 아바타 12종 중 선택 (+ 프로필 테두리 색).
- **언어 변경**: 한국어 / English / 日本語 (즉시 반영, 저장). 모든 UI 문자열은 Localization 테이블 사용, 하드코딩 금지.
- 배경음 / 효과음 볼륨 슬라이더, 진동 on/off, 줄 도우미 on/off, 궤적 미리보기 on/off.
- 개인정보처리방침 / 이용약관 링크(placeholder URL), 버전 정보, 데이터 초기화(확인 팝업).

## 8. 아키텍처

### 8-1. 폴더 구조 (이대로 생성)
```
Assets/_Project/
  Scripts/
    Core/        GameBootstrap, ServiceLocator, SceneLoader, EventBus
    Gameplay/    MatchController, TurnManager, Stone, LaunchController, AimPreview, CameraFitter
    Physics/     PhysicsConfig, SurfaceZone, Bumper, Hole, GravityWell, Rotator, PingPongMover, ShotSimulator
    Rules/       LineDetector, LineRuleConfig, MatchRules, WinChecker, BoardSnapshot (순수 C#)
    AI/          IOpponentAI, SimpleAI, BoardEvaluator, AIProfile, ShotDecision
    Economy/     Wallet, RewardCalculator, RewardConfig, ShopService, IAPService, IAdService, MockAdService
    Cosmetics/   SkinDefinition, SkinCatalog, SkinService, SkinApplier
    Boards/      BoardDefinition, BoardCatalog
    Data/        SaveSystem, SaveData(PlayerProfile, Settings, Inventory, Progress), Migration
    UI/          Screens/(Main, PlaySetup, InGame, Result, Shop, Skins, Settings), Widgets/, UIRouter, SafeArea
    Localization/
  Editor/        ProjectSetupMenu, ContentGenerator, AIBattleSimulator, Debug tools
  Tests/
    EditMode/    LineDetectorTests, WinCheckerTests, RewardCalculatorTests, BoardEvaluatorTests, SaveSystemTests
    PlayMode/    StoneSettleTests, CollisionTests
  Configs/       (ScriptableObject 에셋)
  Prefabs/  Scenes/  Art/  Audio/
```
- Assembly Definition(`Game.Runtime`, `Game.Editor`, `Game.Tests.EditMode`, `Game.Tests.PlayMode`)으로 분리.
- 씬: `Boot`(서비스 초기화) → `Main`(메뉴 전체, 화면은 패널 전환) → `Game`(대전).
- 서비스 간 의존은 인터페이스 + 간단한 ServiceLocator(또는 생성자 주입). 싱글턴 남용 금지.
- 게임 상태는 명시적 상태 머신: `Setup → PlayerAiming → Moving → Settling → Judging → AITurn … → Result`.

### 8-2. 코드 규칙
- C# 네이밍: PascalCase 공개 멤버, `_camelCase` private 필드, `[SerializeField] private`.
- 매직 넘버 금지 → Config SO.
- 게임 규칙·AI 평가·보상 계산·줄 판정은 **순수 C#** 으로 유닛 테스트 가능하게.
- 공개 클래스/메서드에 XML 주석(한국어 가능).
- 런타임 `FindObjectOfType` 사용 금지(셋업 시점 제외).

## 9. 에디터 자동 셋업 (중요)

`Tools > StoneLine > Setup Project` 메뉴 하나로 다음을 생성/갱신:
1. 필요한 태그·레이어·물리 충돌 매트릭스·Player Settings(세로 고정, 패키지명 `com.yourname.stoneline`).
2. 모든 Config ScriptableObject 기본값 에셋.
3. 보드 6종 프리팹 + `BoardDefinition` + 썸네일(렌더 텍스처로 캡처).
4. 스킨 18종 이상 `SkinDefinition` + 절차 생성 스프라이트.
5. `Boot`, `Main`, `Game` 씬과 UI 계층 전체, Build Settings 등록.
6. Localization 테이블(ko/en/ja) 키와 기본 번역.

멱등적으로 동작(여러 번 실행해도 중복 생성 없음)하게 만든다. 셋업 후 `Boot` 씬에서 Play 하면 바로 게임이 돼야 한다.

## 10. 저장 데이터

```json
{
  "version": 1,
  "profile": { "name": "", "avatarId": "avatar_01", "frameColor": "#FFFFFF" },
  "wallet": { "gold": 0 },
  "inventory": { "ownedSkins": ["board_default","stone_default","trail_none"], "equipped": { "board": "", "stone": "", "trail": "" }, "unlockedBoards": ["classic"] },
  "purchases": { "removeAds": false },
  "settings": { "language": "ko", "bgm": 0.8, "sfx": 1.0, "vibration": true, "lineHelper": true, "aimPreview": true },
  "lastMatchSetup": { "lineLength": 3, "boardId": "classic", "difficulty": "Easy", "firstTurn": "Random" },
  "stats": { "played": 0, "wins": 0, "byDifficulty": {} },
  "adLimits": { "date": "", "freeGoldCount": 0 }
}
```
- 저장 시 임시 파일에 쓰고 교체(원자적 저장). 버전 마이그레이션 훅. 파손 시 백업에서 복구.

## 11. 진행 방식 (마일스톤)

각 단계가 끝날 때마다 **무엇을 만들었는지, 에디터에서 어떻게 확인하는지, 다음 단계**를 짧게 보고하고 git 커밋한다. 커밋 메시지는 `feat(gameplay): ...` 같은 Conventional Commits 형식.

1. **M1 기반**: 프로젝트 구조, asmdef, `.gitignore`, `CLAUDE.md`, `docs/` 뼈대, Config SO, SaveSystem, 셋업 메뉴 골격.
2. **M2 물리 & 던지기**: 돌, 슬링샷 조작, 컬, 궤적 미리보기, 정지 판정, 클래식 보드 1개로 혼자 던져보기.
3. **M3 규칙**: `LineDetector`, `WinChecker`, 턴 매니저, 결과 화면 + EditMode 테스트 통과.
4. **M4 AI**: `ShotSimulator`, `BoardEvaluator`, 난이도·N별 프로필, AI 대전 시뮬레이터.
5. **M5 보드**: 장애물 컴포넌트 + 보드 6종.
6. **M6 메타**: 메인/플레이설정/설정 화면, 골드 보상, 다국어.
7. **M7 상점 & 스킨**: IAP(모의), 광고 인터페이스, 스킨 18종+, 미리보기.
8. **M8 마감**: 사운드 훅, 진동, 연출, 성능 점검(모바일 60fps), 버그 수정, 문서 최종화.

## 12. 완료 기준 (Acceptance Criteria)

- [ ] `Tools > StoneLine > Setup Project` 실행 → `Boot` 씬 Play → 메인 화면의 플레이/상점/스킨/설정 버튼이 모두 동작.
- [ ] 3/4/5줄, 6개 보드, 3개 난이도 조합 모두 대전 시작부터 결과 화면까지 오류 없이 진행.
- [ ] 돌끼리, 돌-벽, 돌-장애물 충돌이 자연스럽게 튕기고, 모든 돌이 멈춘 뒤에만 판정.
- [ ] 비스듬한 직선 줄도 정확히 감지, 사이에 상대 돌이 끼면 끊긴 줄로 판정 (테스트로 증명).
- [ ] AI가 N에 따라 다르게 행동하고, 어려움 난이도도 이길 수 있음.
- [ ] 승/패/무 후 골드 지급, 스킨 구매·장착이 저장되어 재시작 후에도 유지.
- [ ] 언어 변경 시 모든 UI 텍스트가 즉시 바뀜.
- [ ] EditMode 테스트 전부 통과, 콘솔 에러/경고 0.

## 13. 나중에 Claude로 계속 수정할 수 있게 — 반드시 생성할 문서

1. **`CLAUDE.md` (프로젝트 루트)** — Claude Code가 매 세션 자동으로 읽는 파일. 다음을 포함:
   - 게임 개요 3줄, 기술 스택, 폴더 구조 지도.
   - "무엇을 바꾸려면 어디를 고치나" 표 (예: 물리 수치 → `Configs/PhysicsConfig.asset`, 줄 판정 → `Rules/LineDetector.cs`, AI 강도 → `Configs/AI/*.asset`, 보상 → `RewardConfig`, 새 보드/스킨 → `docs/HOW_TO_ADD_CONTENT.md`).
   - 코드 규칙(8-2), 테스트 실행 방법(Unity CLI: `Unity -batchmode -runTests -testPlatform EditMode ...`).
   - 변경 시 규칙: 수치는 Config로, 새 문자열은 Localization 테이블에 ko/en/ja 모두 추가, 규칙 변경 시 테스트 갱신, `docs/CHANGELOG.md` 기록, 셋업 메뉴가 계속 멱등적으로 동작하도록 유지.
   - 하지 말아야 할 것: `.meta` 파일 임의 삭제, 씬 YAML 직접 대량 편집(가능하면 셋업 메뉴 코드로 수정), 저장 데이터 구조 변경 시 마이그레이션 없이 필드 삭제.
2. **`docs/GAME_DESIGN.md`** — 이 기획서의 최신판(변경 시 함께 갱신).
3. **`docs/ARCHITECTURE.md`** — 상태 머신 다이어그램, 서비스 의존 관계, 씬 흐름.
4. **`docs/AI.md`** — 평가 함수 항목·가중치 의미·튜닝 방법·AI 대전 시뮬레이터 사용법.
5. **`docs/HOW_TO_ADD_CONTENT.md`** — 보드/장애물/스킨/언어/상점 상품 추가 절차 (단계별 체크리스트).
6. **`docs/DECISIONS.md`**, **`docs/CHANGELOG.md`**.
7. **`.claude/commands/`** 에 자주 쓸 커스텀 슬래시 명령 프롬프트 파일:
   - `add-board.md` (새 보드 추가), `add-skin.md` (새 스킨 추가), `tune-ai.md` (AI 난이도 조정), `balance-gold.md` (보상 조정), `add-language.md` (언어 추가), `run-tests.md` (테스트 실행 후 실패 수정).

---

지금 M1부터 시작해. 시작 전에 이 기획에서 구현상 충돌하거나 위험한 부분이 있으면 먼저 3줄 이내로 짚고, 바로 진행해.
