// 도장오목 설정값 모음 (프로젝트 설정 > Game > Stamp Omok 에서 편집, Config/DefaultGame.ini 에 저장)
// 길이 값은 따로 적지 않으면 '도장 지름(D)'의 배수입니다.
#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "Core/StampRules.h"
#include "StampOmokSettings.generated.h"

/** 자 확인 실패 패널티 */
UENUM()
enum class EStampFailPenalty : uint8
{
	None,       // 차례만 넘어감
	SkipTurn,   // 다음 차례 한 번 쉼
	Cooldown    // 정해진 차례 동안 자 확인 금지
};

UCLASS(config = Game, defaultconfig, meta = (DisplayName = "Stamp Omok"))
class STAMPOMOK_API UStampOmokSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UStampOmokSettings();

	static const UStampOmokSettings& Get();

	/** 규칙 엔진이 쓰는 설정으로 변환 */
	StampRules::FRulesConfig ToRulesConfig() const;

	// ── 판·도장 크기 ──────────────────────────────
	/** 기준 바둑돌 지름 (cm) */
	UPROPERTY(EditAnywhere, config, Category = "Board", meta = (ClampMin = "0.5", ClampMax = "10"))
	float StoneDiameterCm = 2.2f;

	/** 도장 지름 = 바둑돌 지름 × 이 비율 (명세: 3/4) */
	UPROPERTY(EditAnywhere, config, Category = "Board", meta = (ClampMin = "0.2", ClampMax = "2"))
	float StampRatio = 0.75f;

	/** 한지 한 변 길이 (D). 카메라는 이 안에서만 움직입니다 */
	UPROPERTY(EditAnywhere, config, Category = "Board", meta = (ClampMin = "20", ClampMax = "200"))
	float PaperSizeD = 64.f;

	// ── 승리 판정(자) ─────────────────────────────
	UPROPERTY(EditAnywhere, config, Category = "Judge", meta = (ClampMin = "3", ClampMax = "9"))
	int32 WinCount = 5;

	/** 허용 오차: 도장 중심 ↔ 직선 최대 거리 (D) */
	UPROPERTY(EditAnywhere, config, Category = "Judge", meta = (ClampMin = "0.05", ClampMax = "1"))
	float LineTolerance = 0.35f;

	/** 최소제곱 피팅 직선과 자의 각도 차 허용 (도) */
	UPROPERTY(EditAnywhere, config, Category = "Judge", meta = (ClampMin = "1", ClampMax = "45"))
	float AngleToleranceDeg = 10.f;

	/** 줄 안 이웃 도장 중심 사이 최대 간격 (D, 0 = 검사 안 함) */
	UPROPERTY(EditAnywhere, config, Category = "Judge", meta = (ClampMin = "0", ClampMax = "10"))
	float MaxGap = 2.f;

	/** 다섯 도장 사이를 상대 도장이 막으면 무효 */
	UPROPERTY(EditAnywhere, config, Category = "Judge")
	bool bBlockByOpponent = true;

	/** 자 길이·폭 (D) */
	UPROPERTY(EditAnywhere, config, Category = "Judge", meta = (ClampMin = "5", ClampMax = "30"))
	float RulerLength = 9.f;

	UPROPERTY(EditAnywhere, config, Category = "Judge", meta = (ClampMin = "0.5", ClampMax = "4"))
	float RulerWidth = 1.3f;

	// ── 가상의 팔 ─────────────────────────────────
	UPROPERTY(EditAnywhere, config, Category = "Arm", meta = (ClampMin = "0.1"))
	float ArmMinLength = 0.5f;

	/** 팔 최대 길이 (D) */
	UPROPERTY(EditAnywhere, config, Category = "Arm", meta = (ClampMin = "1", ClampMax = "40"))
	float ArmMaxLength = 12.f;

	UPROPERTY(EditAnywhere, config, Category = "Arm")
	float ArmDefaultLength = 3.f;

	UPROPERTY(EditAnywhere, config, Category = "Arm", meta = (ClampMin = "0.01"))
	float ArmStep = 0.1f;

	/** 위팔(앞으로 뻗는 구간) 비율. 나머지는 팔꿈치에서 직각으로 꺾인 아래팔 */
	UPROPERTY(EditAnywhere, config, Category = "Arm", meta = (ClampMin = "0", ClampMax = "1"))
	float ArmSplit = 0.5f;

	/** 손떨림 표준편차 (D, 0 = 계산값에 정확히 찍힘) */
	UPROPERTY(EditAnywhere, config, Category = "Arm", meta = (ClampMin = "0", ClampMax = "0.5"))
	float ArmJitter = 0.06f;

	// ── 규칙 옵션 ─────────────────────────────────
	/** 겹쳐서 못 찍었을 때도 차례 소모 */
	UPROPERTY(EditAnywhere, config, Category = "Rules")
	bool bOverlapEndsTurn = true;

	UPROPERTY(EditAnywhere, config, Category = "Rules")
	EStampFailPenalty FailPenalty = EStampFailPenalty::None;

	UPROPERTY(EditAnywhere, config, Category = "Rules", meta = (ClampMin = "1", ClampMax = "10"))
	int32 CooldownTurns = 2;

	/** 착지점 미리보기 (쉬운 모드) */
	UPROPERTY(EditAnywhere, config, Category = "Rules")
	bool bShowLandingPreview = false;

	/** 찍은 직후 방금 찍은 내 도장만 보였다 사라지는 시간 (초) */
	UPROPERTY(EditAnywhere, config, Category = "Rules", meta = (ClampMin = "0", ClampMax = "5"))
	float StampFlashSeconds = 1.1f;

	// ── 카메라 ────────────────────────────────────
	UPROPERTY(EditAnywhere, config, Category = "Camera", meta = (ClampMin = "5"))
	float CameraMinDistance = 20.f;

	UPROPERTY(EditAnywhere, config, Category = "Camera", meta = (ClampMin = "10"))
	float CameraMaxDistance = 175.f;

	UPROPERTY(EditAnywhere, config, Category = "Camera")
	float CameraDefaultDistance = 52.f;

	/** 내려다보는 각도 (도, 음수) */
	UPROPERTY(EditAnywhere, config, Category = "Camera", meta = (ClampMin = "-89", ClampMax = "-20"))
	float CameraPitch = -62.f;

	UPROPERTY(EditAnywhere, config, Category = "Camera", meta = (ClampMin = "15", ClampMax = "90"))
	float CameraFov = 36.f;

	// ── 연출 ──────────────────────────────────────
	/** 창살 그림자 (해가 문살 사이로 들어오는 오후) */
	UPROPERTY(EditAnywhere, config, Category = "Presentation")
	bool bWindowLatticeShadow = true;

	/** 피사계 심도 */
	UPROPERTY(EditAnywhere, config, Category = "Presentation")
	bool bDepthOfField = true;

	UPROPERTY(EditAnywhere, config, Category = "Presentation", meta = (ClampMin = "0", ClampMax = "1"))
	float MusicVolume = 0.35f;

	UPROPERTY(EditAnywhere, config, Category = "Presentation", meta = (ClampMin = "0", ClampMax = "1"))
	float AmbienceVolume = 0.5f;

	UPROPERTY(EditAnywhere, config, Category = "Presentation", meta = (ClampMin = "0", ClampMax = "1"))
	float SfxVolume = 1.f;
};
