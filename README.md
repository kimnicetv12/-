# 🎯 왁뿌볼 던지기

클릭할 때마다 왁뿌볼을 던지고 **속도 +1**. 적을 전부 잡으면 출구가 열리고, 출구에서 **귀환(Stop)할지 전진(Go)할지** 고르는 로블록스 방치형 성장 게임입니다.
죽으면 이번 판에 모은 **미수령 트로피를 전부 잃고** 1스테이지로 돌아갑니다.

## 1. 스튜디오에서 열기 (처음 한 번)

1. 이 저장소에서 **`WakppuBall.rbxlx`** 파일을 받습니다. (파일을 누른 뒤 오른쪽 위의 다운로드 버튼)
2. Roblox Studio를 켜고 **파일(File) → 파일에서 열기(Open from File...)** 로 `WakppuBall.rbxlx`를 엽니다.
3. 위쪽의 **▶ 플레이(Play)** 버튼(또는 `F5`)을 누르면 바로 플레이할 수 있습니다.

> 맵은 스크립트가 게임 시작 순간에 만들기 때문에, 편집 화면에서는 빈 공간처럼 보이는 게 정상입니다. 플레이를 눌러야 로비가 나타납니다.

## 2. 게임 방법

| 조작 | 하는 일 |
| --- | --- |
| 화면 클릭 / 🎯 던지기 버튼 | 왁뿌볼을 던지고 속도 +1 (가까운 적이 있으면 공격) |
| 자동: 켬 | 자동으로 계속 던지기 |
| 보라색 포털 밟기 | 스테이지 1부터 출발 |
| 노란 원(훈련 허수아비) 안에 서 있기 | 가만히 있어도 자동으로 속도 상승 |
| 출구의 초록 발판 | 스테이지 클리어 → 귀환 / 전진 선택 |
| ⚾ 강화 버튼 | 트로피로 던질 때 얻는 속도를 올림 |
| 🔁 환생 버튼 | 속도·레벨을 0으로, 대신 속도 배수가 영구히 올라감 |

- **속도**가 오르면 레벨, 공격력, 공속, 체력, 이동 속도가 함께 오릅니다.
- 스테이지가 깊을수록 적이 세지고, 길이 좁아지고(떨어지면 사망), 보상이 커집니다.
- 화면 위의 **💰 미수령 트로피**는 귀환해야 내 트로피가 됩니다. 죽으면 전부 사라져요.

## 3. 지금 들어 있는 것 (기획서의 MVP 순서 기준)

- [x] 1. 클릭 던지기(수동/자동), 던질 때마다 속도 +1, 레벨
- [x] 2. 적 3종(말랑이·재빠름이·단단이), 스테이지 10개짜리 월드 1개, 적을 전멸시키면 출구가 열림
- [x] 3. 미수령 트로피, 귀환/전진 선택, 사망하면 전부 상실 (사망 연출 포함)
- [x] 4. 훈련 허수아비 1단계 (무료 방치 파밍)
- [x] 볼 강화(트로피 사용처), 환생 1단계 (레벨 조건)
- [x] 권장 레벨 표시, 숫자 팝업, 화면 흔들림, 연속으로 던질수록 높아지는 효과음
- [x] 저장 (속도, 트로피, 강화, 환생, 최고 스테이지)
- [ ] 5. 왁뿌볼 스킨 10종과 트로피 상점
- [ ] 7. 게임패스 (2배 속도, 자동 던지기, 사망 보험)
- [ ] 8. 월드 확장(50스테이지, 보스), 리더보드, 운영자 이벤트

## 4. 밸런스 바꾸기

모든 숫자는 **ReplicatedStorage → Shared → Config** 한 파일에 모여 있습니다.
스튜디오 탐색기(Explorer)에서 `Config`를 더블클릭해서 숫자를 바꾸고 다시 플레이하면 바로 적용됩니다.

| 바꾸고 싶은 것 | Config에서 찾을 곳 |
| --- | --- |
| 월드의 스테이지 수 | `Config.StagesPerWorld` |
| 적 체력 / 공격력 / 수 | `Config.EnemyHealth`, `Config.EnemyDamage`, `Config.EnemyCount` |
| 스테이지 보상 | `Config.StageReward` |
| 레벨업에 필요한 속도 | `Config.SpeedForLevel` |
| 공격력, 공속 | `Config.Damage`, `Config.ThrowsPerSecond` |
| 자동 던지기를 무료로 줄지 | `Config.FreeAutoThrow` |
| 환생 조건과 배수 | `Config.RebirthLevel`, `Config.RebirthMultiplier` |
| 적 종류 (이름, 색, 크기, 속도) | `Config.EnemyTypes` |

## 5. 저장 켜기

스튜디오에서는 기본적으로 저장이 꺼져 있습니다. (꺼져 있어도 게임은 잘 돌아가고, 출력 창에 "[저장]" 경고만 뜹니다.)

1. **파일 → Roblox에 게시(Publish to Roblox)** 로 게임을 한 번 게시합니다.
2. **홈 → 게임 설정(Game Settings) → 보안(Security)** 에서 **Studio에서 API 서비스 사용(Enable Studio Access to API Services)** 을 켭니다.

## 6. 파일 구조

| 스튜디오 위치 | 파일 | 하는 일 |
| --- | --- | --- |
| ReplicatedStorage › Shared | `src/shared/Config.luau` | 밸런스 숫자와 공식 |
| ReplicatedStorage › Shared | `src/shared/Format.luau` | 큰 숫자를 1.2K, 3.4M으로 표시 |
| ServerScriptService › Server | `src/server/Main.server.luau` | 던지기, 스테이지 진행, 귀환/전진, 사망, 허수아비, 저장 |
| ServerScriptService › Server | `src/server/World.luau` | 로비와 스테이지 맵, 적 만들기 |
| ServerScriptService › Server | `src/server/Data.luau` | DataStore 저장/불러오기 |
| StarterPlayerScripts › Client | `src/client/Main.client.luau` | 화면 UI, 클릭 입력, 선택창, 사망 화면 |
| StarterPlayerScripts › Client | `src/client/Effects.luau` | 볼 날아가기, 숫자 팝업, 흔들림, 효과음 |

### 개발자용: Rojo로 빌드하기

`src/` 폴더가 원본이고, `WakppuBall.rbxlx`는 [Rojo](https://rojo.space)로 만든 결과물입니다.

```sh
rojo build default.project.json -o WakppuBall.rbxlx   # 플레이스 파일 다시 만들기
rojo serve                                             # 스튜디오 Rojo 플러그인과 실시간 동기화
selene src                                             # 코드 검사
```

## 7. 출시 전에 확인할 점

- **'왁뿌' 이름과 외형**: 특정 크리에이터나 커뮤니티의 IP라면 공개 전에 사용 허락을 받아야 합니다. 이름은 `Config.GameName`, `Config.BallName`에서 한 번에 바꿀 수 있습니다.
- 기획 문서: [왁뿌볼 던지기 — 기획 초안](https://claude.ai/artifact/7f1GvKKUNxJ7YpAtsRcguE)
