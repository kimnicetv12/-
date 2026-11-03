# 🎯 왁뿌볼 던지기

> 🏁 **새 프로젝트:** 태블릿용 3D 랠리 시뮬레이터 *Special Stage*는 [`rally/`](rally/README.md) 폴더에 있습니다.

클릭할 때마다 왁뿌볼을 던지고 **속도 +1**. 키보드 키로 된 길을 따라 적을 전부 잡으면 안전지대가 열리고,
**🟡 노란 발판(귀환해서 트로피 받기)** 과 **🟢 초록 포털(다음 스테이지로 전진)** 중 하나를 고릅니다.
죽거나 떨어지면 이번 판에 모은 **미수령 트로피를 전부 잃습니다.**

게임 구성과 화면 배치는 로블록스 인기작 *+1 Speed Keyboard Escape*를 참고했고, 던지기와 스톱 or 고는 우리 기획 그대로입니다.

## 1. 스튜디오에서 열기

1. 이 저장소에서 **`WakppuBall.rbxlx`** 파일을 받습니다.
2. Roblox Studio → **파일(File) → 파일에서 열기(Open from File...)** 로 엽니다.
3. **▶ 플레이(Play)** 버튼(또는 `F5`)을 누릅니다.

> 맵은 스크립트가 게임 시작 순간에 만들기 때문에, 편집 화면에서는 빈 공간처럼 보이는 게 정상입니다.

## 2. 원작에서 가져온 구성

| 원작 (+1 Speed Keyboard Escape) | 왁뿌볼 던지기 |
| --- | --- |
| 걸을 때마다 속도 +1 | **던질 때마다** 속도 +1 (클릭 / 자동) |
| 키보드 키로 된 스테이지, 떨어지면 처음으로 | 키보드 키로 된 길 + 점프 구간, 떨어지면 사망 |
| 장애물·추격자 | 길목의 적을 전부 잡아야 출구가 열림 |
| 스테이지 끝 노란 패드 = Wins 받고 귀환 | **🟡 노란 발판 = 귀환(Stop)**, **🟢 초록 포털 = 전진(Go)** |
| Wins | 🏆 트로피 (귀환해야 받음, 죽으면 미수령분 상실) |
| 스폰의 숫자 버튼 (+2, +3 … +500) | 로비의 **던지기 파워 발판** 10단계 |
| 트레드밀 (초코 x1 ~ 운영자 x100) | **훈련 허수아비** 5종 (나무 x1 무료 ~ 운영자 x100) |
| 트레일 (하나만 장착) | **왁뿌볼 스킨** 13종 (일반 → 신화, 보스 전용 3종) |
| 오라 (트레일 위에 곱해짐) | **오라** 4종 |
| 환생 (레벨 조건, 영구 배수) | 환생 (Lv 15, 25, 40… / x1.5, x2, x2.5…) |
| 월드 2 = Lv 120, 월드 3 = Lv 400 | 같음: 말랑 초원 → 사탕 왕국(Lv 120) → 별빛 우주(Lv 400) |
| 스테이지 텔레포트 (Wins 사용) | 🌀 텔레포트 (트로피 사용, 도착해 본 스테이지까지) |
| 코드, 무료 선물 상자 | 🎟️ 코드, 🎁 무료 선물 (4시간마다) |
| 운영자 이벤트 (속도 x20,000 등) | 채팅에 `/event 10 30` → 전 서버 속도 10배 30분 |
| 게임패스 (2배, 트레드밀, 트레일) | 2배 속도, 자동 던지기, 2배 트로피, 사망 보험, 허수아비 4종, 스킨 3종 |
| 랭킹 | 로비의 속도 TOP 10 보드 |

### 화면 배치

- **왼쪽:** 🛒 상점 · 🌀 텔레포트 · 🎟️ 코드 · 🎁 선물
- **오른쪽:** 🔁 환생 (Lv 진행도와 준비되면 빨간 배지) · 🤖 자동 던지기
- **위:** 🏆 트로피, 운영자 이벤트 배너, 스테이지 중에는 💰 미수령 트로피
- **아래:** ⚡ 속도와 레벨 막대, 🎯 던지기 버튼

## 3. 운영자가 할 일

### 게임패스 연결

1. 게임을 Roblox에 게시합니다.
2. 크리에이터 대시보드에서 게임패스를 만듭니다.
3. 그 번호를 `ReplicatedStorage › Shared › Config`의 `Config.GamePasses`에 있는 `id = 0` 자리에 넣습니다.

`id`가 0인 게임패스는 게임 안에서 "준비 중"으로 표시됩니다. 스튜디오에서 유료 기능을 미리 시험하려면 `Config.StudioOwnsAllPasses = true`로 바꾸세요.

### 운영자 이벤트

게임 주인 또는 스튜디오에서 채팅에 입력합니다.
- `/event 10 30`: 모든 서버에서 속도 10배, 30분
- `/event off`: 이벤트 종료

다른 운영자는 `Config.Admins`에 UserId를 넣으면 됩니다.

### 저장 켜기

1. 게임을 게시합니다.
2. **게임 설정 → 보안 → Studio에서 API 서비스 사용**을 켭니다.

꺼져 있어도 게임은 돌아가고 저장만 건너뜁니다.

### 밸런스

모든 숫자는 `Config` 한 파일에 있습니다.

| 바꾸고 싶은 것 | 찾을 곳 |
| --- | --- |
| 월드별 권장 레벨, 보상, 입장 레벨 | `Config.Worlds` |
| 스테이지 수 (지금 13) | `Config.StagesPerWorld` |
| 적 체력 (권장 레벨 기준으로 자동 계산) | `Config.TargetStageSeconds`, `Config.EnemyHealth` |
| 던지기 파워 발판 가격 | `Config.Pads` |
| 스킨 / 오라 가격과 배수 | `Config.Skins`, `Config.Auras` |
| 환생 조건과 배수 | `REBIRTH_LEVELS`, `REBIRTH_MULTS` |
| 코드 | `Config.Codes` |
| 자동 던지기 무료 여부 | `Config.FreeAutoThrow` |

## 4. 파일 구조

| 스튜디오 위치 | 파일 | 하는 일 |
| --- | --- | --- |
| ReplicatedStorage › Shared | `src/shared/Config.luau` | 모든 밸런스 숫자와 공식 |
| ReplicatedStorage › Shared | `src/shared/Format.luau` | 1.2K, 3.4M 숫자 표시 |
| ServerScriptService › Server | `src/server/Main.server.luau` | 던지기, 스테이지, 귀환/전진, 상점, 환생, 텔레포트, 코드, 선물, 이벤트, 랭킹 |
| ServerScriptService › Server | `src/server/World.luau` | 로비와 키보드 스테이지, 적과 보스 만들기 |
| ServerScriptService › Server | `src/server/Data.luau` | 저장/불러오기 |
| ServerScriptService › Server | `src/server/Passes.luau` | 게임패스 확인과 구매 창 |
| StarterPlayerScripts › Client | `src/client/Main.client.luau` | 화면(HUD), 입력, 알림, 사망 화면 |
| StarterPlayerScripts › Client | `src/client/Menus.luau` | 상점, 텔레포트, 코드, 환생 창 |
| StarterPlayerScripts › Client | `src/client/Ui.luau` | 버튼과 창 디자인 도구 |
| StarterPlayerScripts › Client | `src/client/State.luau` | 내 정보 읽기 |
| StarterPlayerScripts › Client | `src/client/Effects.luau` | 볼 날아가기, 숫자 팝업, 흔들림, 효과음 |

## 5. 개발자용

```sh
rojo build default.project.json -o WakppuBall.rbxlx      # 플레이스 파일 만들기
selene src                                                # 코드 검사

# 자동 플레이 테스트: 가짜 로블록스 환경에서 서버와 클라이언트 코드를 실제로 돌립니다
# (입장, 던지기, 스테이지 클리어, 귀환, 사망, 낙사, 상점, 코드, 텔레포트, 이벤트, 게임패스, 환생, 보스, 저장)
cargo build --release --manifest-path tools/luaurun/Cargo.toml
tools/luaurun/target/release/luaurun --run tests/playtest.luau
```

## 6. 다음 작업 후보

- 광고 보고 부활 / Robux 부활 (개발자 상품)
- 그룹 가입 보상, 플레이 시간 보상
- 스테이지 장애물 (사라지는 다리, 움직이는 벽)
- 월드 3 이후 새 월드, 스테이지 50개 확장
- 실제 아이콘 이미지와 효과음 에셋으로 교체
