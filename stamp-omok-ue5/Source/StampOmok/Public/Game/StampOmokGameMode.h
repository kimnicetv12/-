// 대국 진행: 세계 만들기, 차례·단계 전환, 도장 기록, 판정, 패널티, 옵션 저장
#pragma once

#include "CoreMinimal.h"
#include "Core/StampOmokSettings.h"
#include "Core/StampOmokTypes.h"
#include "Game/StampCameraRig.h"
#include "GameFramework/GameModeBase.h"
#include "StampOmokGameMode.generated.h"

class AStampArm;
class AStampBoard;
class AStampEnvironment;
class AStampRuler;
class UAudioComponent;

DECLARE_MULTICAST_DELEGATE_TwoParams(FOnStampToast, const FText& /*Message*/, bool /*bWarning*/);

/** 게임 안 설정 화면에서 바꾸는 값 (사용자 설정 ini에 저장) */
struct FStampOptions
{
	float LineTolerance = 0.35f;
	float AngleToleranceDeg = 10.f;
	float ArmMaxLength = 12.f;
	float ArmJitter = 0.06f;
	EStampFailPenalty FailPenalty = EStampFailPenalty::None;
	bool bOverlapEndsTurn = true;
	bool bShowLandingPreview = false;
	bool bLatticeShadow = true;
	bool bDepthOfField = true;
	float MusicVolume = 0.35f;
	float AmbienceVolume = 0.5f;
	float SfxVolume = 1.f;
};

/** 선수별로 이어지는 상태 */
struct FStampPlayerSlot
{
	float ArmLength = 3.f;
	StampRules::EBend Bend = StampRules::EBend::Right;
	FStampCameraPose Camera;
	bool bHasCamera = false;
	int32 OwnTurns = 0;
	int32 RulerBlockedUntil = 0;
	int32 Skip = 0;
};

struct FStampLastAction
{
	int32 Player = -1;
	FText Label;
};

UCLASS()
class STAMPOMOK_API AStampOmokGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AStampOmokGameMode();

	virtual void StartPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer) override;

	// ── 상태 조회 (UI) ──
	EStampPhase GetPhase() const { return Phase; }
	int32 GetCurrent() const { return Current; }
	int32 GetMoveNo() const { return MoveNo; }
	int32 GetWinner() const { return Winner; }
	int32 CountStamps(int32 Player) const;
	const FStampPlayerSlot& GetSlot(int32 Player) const { return Slots[FMath::Clamp(Player, 0, 1)]; }
	const FStampLastAction& GetLastAction() const { return LastAction; }
	bool HasAnchor() const { return bHasAnchor; }
	bool HasGameInProgress() const { return bGameStarted && Phase != EStampPhase::Over; }
	bool IsSkipTurn() const { return Phase == EStampPhase::Handoff && Slots[Current].Skip > 0; }
	int32 RulerBlockedLeft(int32 Player) const;
	double GetRulerDeg() const { return RulerDeg; }
	StampRules::FVec2 GetRulerCenter() const { return RulerCenter; }
	int32 GetRulerCandidateCount() const;
	const StampRules::FJudgeResult& GetJudge() const { return LastJudge; }
	FText GetJudgeMessage() const { return JudgeMessage; }
	FText GetPenaltyNote() const { return PenaltyNote; }
	FText DescribePenalty() const;
	const FStampOptions& GetOptions() const { return Options; }
	StampRules::FRulesConfig GetRulesConfig() const;
	double GetStampDiameter() const;
	AStampCameraRig* GetCameraRig() const { return Rig; }
	AStampRuler* GetRuler() const { return Ruler; }
	bool TryGetAnchorWorld(FVector& OutWorld) const;
	bool IsRevealed() const;

	// ── 행동 ──
	void NewGame();
	void ShowMainMenuBoard();
	void ReadyForTurn();
	void SetAnchor(const StampRules::FVec2& P);
	void SetArmLength(float LengthD);
	void NudgeArm(float DeltaD);
	void SetBend(StampRules::EBend Bend);
	void PlaceStamp();
	bool CanRequestRuler() const;
	void BeginRuler();
	void MoveRuler(const StampRules::FVec2& Center);
	void SetRulerDeg(double Deg);
	void Judge();
	void PassTurn();
	void FitCameraToStamps();
	void CenterCamera();
	void ApplyOptions(const FStampOptions& NewOptions);

	FOnStampToast OnToast;

private:
	void AttachPlayer(APlayerController* PC);
	void LoadOptions();
	void SaveOptions() const;
	void ShowHandoff();
	void BeginTurn();
	void EndTurn(const FText& Label);
	void OnArmImpact();
	void FinishStampAnimation();
	void FinishJudge();
	void RefreshMarks();
	void RefreshArmRest();
	void Toast(const FText& Message, bool bWarning = false);
	FText BuildJudgeMessage(const StampRules::FJudgeResult& Result) const;
	const StampRules::FStamp* FindStamp(int32 Id) const;
	double Now() const;

	UPROPERTY(Transient)
	TObjectPtr<AStampEnvironment> Environment;

	UPROPERTY(Transient)
	TObjectPtr<AStampBoard> Board;

	UPROPERTY(Transient)
	TObjectPtr<AStampArm> Arm;

	UPROPERTY(Transient)
	TObjectPtr<AStampRuler> Ruler;

	UPROPERTY(Transient)
	TObjectPtr<AStampCameraRig> Rig;

	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> Music;

	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> Ambience;

	FStampOptions Options;
	EStampPhase Phase = EStampPhase::Menu;
	bool bGameStarted = false;
	int32 Current = 0;
	int32 MoveNo = 1;
	int32 Winner = -1;
	FStampPlayerSlot Slots[2];
	FStampLastAction LastAction;

	std::vector<StampRules::FStamp> Stamps;
	int32 NextStampId = 1;

	bool bHasAnchor = false;
	StampRules::FVec2 Anchor;

	// 팔 연출 중인 한 수
	double AnimStart = 0.0;
	StampRules::FVec2 PendingTarget;
	bool bPendingBlocked = false;
	bool bPendingOffPaper = false;

	StampRules::FVec2 RulerCenter;
	double RulerDeg = 0.0;

	StampRules::FJudgeResult LastJudge;
	double JudgeStart = 0.0;
	FText JudgeMessage;
	FText PenaltyNote;
};
