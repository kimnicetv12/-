# 도장오목 · UE5 PC 버전

칸 없는 한지 위에서 두 사람이 번갈아 도장을 찍는 눈가림 오목입니다. 한 컴퓨터를 번갈아 쓰는 로컬 2인 대전이고, 마우스와 키보드로 합니다.
웹 프로토타입(`../stamp-omok`)과 규칙은 같고, 언리얼 엔진 5로 다시 만들었습니다.

| 웹 프로토타입 | UE5 PC 버전 |
| --- | --- |
| 2D 캔버스 | 3D 마루 위 한지, 늦은 오후 햇빛과 문살 그림자 (Lumen, 가상 그림자 맵) |
| 원형 도장 그림 | 한지 결에 스며드는 인주 데칼 (도장마다 농도·회전이 다름) |
| 선으로 그린 팔 | 놋쇠·나무로 된 도장 기계가 뻗고, 꺾이고, 내려찍고, 접힘 |
| 반투명 자 | 청자빛 아크릴 자, 눈금, 허용 오차 띠, 놋쇠 손잡이 |
| 웹 오디오 합성음 | 합성한 효과음, 마루 바람 소리, 가야금 풍 음악 |

## 빌드하고 실행하기

**필요한 것**
- Unreal Engine 5.4 이상 (프로젝트는 5.6 기준이며, 다른 버전이면 열 때 변환을 묻습니다)
- Windows: Visual Studio 2022 ("C++를 사용한 게임 개발" 워크로드)
- macOS: Xcode

**순서**
1. `StampOmok.uproject`를 오른쪽 클릭하고 **Generate Visual Studio project files**를 고르거나, 그냥 더블클릭해 엽니다.
2. "모듈을 다시 빌드할까요?"라고 물으면 **예**를 고릅니다. C++ 모듈이 컴파일됩니다.
3. 에디터가 처음 열리면 `Content/Python/init_unreal.py`가 셋업을 한 번 자동으로 돌립니다. 셋업은 다음을 만듭니다.
   - 텍스처·소리 가져오기
   - 머티리얼 8개
   - 맵 `/Game/StampOmok/Maps/StampOmok`

   진행 창이 닫히면 끝난 것입니다.
4. **플레이**(Alt+P)를 누르거나, 독립 실행으로 실행합니다.
5. 배포하려면 **플랫폼 > Windows > 프로젝트 패키지**를 씁니다. 글꼴과 UI 이미지(`Content/Slate`), `/Game/StampOmok` 에셋이 함께 들어갑니다.

**셋업을 다시 돌리려면** 출력 로그 아래 입력 줄을 `Python`으로 바꾸고 아래를 입력합니다.
```
import stamp_omok_setup; stamp_omok_setup.run(force=True)
```
셋업 전에 플레이해도 게임은 돌아갑니다. 다만 엔진 기본 재질로 보이고, 화면 위에 셋업하라는 안내가 나옵니다.

## 조작

| 입력 | 하는 일 |
| --- | --- |
| 왼쪽 클릭 | 팔 기준점(어깨) 정하기 |
| 왼쪽 끌기 | 기준점·자 끌기, 빈 곳이면 판 이동 |
| 오른쪽·가운데 끌기 | 판 이동 |
| 휠 | 커서 쪽으로 확대·축소 |
| W / S (Shift) | 팔 길이 0.1씩 (1씩) |
| A / D | 팔꿈치를 왼쪽 / 오른쪽으로 |
| Space · Enter | 놓기 · 판정하기 · 차례 넘기기 · 준비 |
| R | 자 확인 (확인 창 뒤 판 공개) |
| Q / E (Shift) | 자 돌리기 0.5°씩 (5°씩) |
| C · F | 판 가운데로 · 도장 전체 보기 |
| Esc | 메뉴 |

## 폴더 구조

```
stamp-omok-ue5/
├── StampOmok.uproject
├── Config/                     렌더링(Lumen·VSM·DBuffer 데칼), 기본 맵·게임 모드, 패키징
├── Source/StampOmok/
│   ├── Core/   StampRules       규칙 엔진 (순수 C++, 언리얼 의존성 없음)
│   │           StampLathe       회전체 메시 생성 (순수 C++)
│   │           StampOmokSettings  설정값 모음 (프로젝트 설정 > Game > Stamp Omok)
│   │           StampAssets      에셋 경로·대체물·효과음
│   ├── World/  StampBoard       마루, 한지, 인주 데칼, 판정 표시
│   │           StampArm         도장 기계 (뻗기·꺾기·찍기·접기 연출)
│   │           StampRuler       아크릴 자
│   │           StampEnvironment 해·하늘빛·대기·안개·문살 그림자
│   ├── Game/   StampOmokGameMode  대국 진행 (단계, 차례, 판정, 패널티, 옵션 저장)
│   │           StampCameraRig   내려다보는 카메라 (이동·확대·흔들림·피사계 심도)
│   │           StampOmokPlayerController  커서, UI, 화면↔한지 좌표 변환
│   └── UI/     SStampOmokHUD    Slate로 만든 모든 화면
│               SBoardInputLayer 판 위 마우스 입력
├── Content/Python/             에디터 셋업 스크립트
├── Content/Slate/              UI 글꼴(고운바탕·고운돋움, OFL)과 UI 이미지 (파일 그대로 패키징)
├── SourceArt/                  셋업이 가져오는 원본 텍스처·소리
├── Tools/generate_assets.py    원본 에셋 생성기 (numpy + Pillow)
└── Tests/RulesTest/            언리얼 없이 도는 규칙·메시 테스트
```

블루프린트나 UMG 에셋 없이 C++과 셋업 스크립트만으로 만들었기 때문에, 저장소에는 바이너리 `.uasset`이 없습니다.

## 설정값

`UStampOmokSettings`(프로젝트 설정 > Game > Stamp Omok)에 모두 모여 있습니다.
- 도장 크기: `StoneDiameterCm`, `StampRatio`
- 판정: `LineTolerance`, `AngleToleranceDeg`, `MaxGap`, `RulerLength`
- 팔: `ArmMaxLength`, `ArmSplit`, `ArmJitter`
- 카메라와 연출

길이 값은 따로 적지 않으면 도장 지름의 배수입니다. 게임 안 설정 화면에서 바꾼 값은 사용자 설정 파일(`GameUserSettings.ini`)에 저장됩니다.

## 테스트

```bash
# 언리얼 없이: 규칙 엔진 20개 + 회전체 메시 감김 방향
g++ -std=c++17 -I Source/StampOmok/Public Tests/RulesTest/rules_test.cpp Source/StampOmok/Private/Core/StampRules.cpp -o rules_test && ./rules_test
g++ -std=c++17 -I Source/StampOmok/Public Tests/RulesTest/lathe_test.cpp -o lathe_test && ./lathe_test
```
에디터 안에서는 **도구 > 세션 프론트엔드 > Automation**에서 `StampOmok.Rules`를 실행합니다.

## 문제가 생기면

- **회전체(도장 손잡이·받침)가 안쪽이 뒤집혀 보이면**: `Source/StampOmok/Private/World/StampMeshUtil.cpp`의 `StampLathe::Build(..., true)`를 `false`로 바꿉니다.
- **인면 글자가 좌우로 뒤집혀 보이면**: 데칼 투사 방향 때문입니다. `StampBoard.cpp`의 데칼 회전을 `FRotator(-90.f, 180.f, RotationDeg)`로 바꿉니다.
- **화면이 너무 밝거나 어두우면**: `StampCameraRig.cpp`의 `AutoExposureBias`(기본 1.4)를 조정합니다.
- **셋업 머티리얼이 컴파일 오류를 내면**: 출력 로그의 `[StampOmok]` 줄을 확인한 뒤 `run(force=True)`로 다시 만듭니다.
