// 대국 진행
#include "Game/StampOmokGameMode.h"

#include "Components/AudioComponent.h"
#include "Core/StampAssets.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Game/StampOmokPlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/ConfigCacheIni.h"
#include "StampOmok.h"
#include "World/StampArm.h"
#include "World/StampBoard.h"
#include "World/StampEnvironment.h"
#include "World/StampRuler.h"

namespace GameModeDetail
{
	constexpr float JudgeSeconds = 0.95f;
	const TCHAR* OptionsSection = TEXT("/Script/StampOmok.StampOmokOptions");

	FText Txt(const FString& S)
	{
		return FText::FromString(S);
	}

	FString NumberWord(int32 N)
	{
		static const TCHAR* Words[] = {TEXT("영"), TEXT("한"), TEXT("두"), TEXT("세"), TEXT("네"), TEXT("다섯"), TEXT("여섯"), TEXT("일곱"), TEXT("여덟"), TEXT("아홉")};
		return N >= 0 && N < 10 ? FString(Words[N]) : FString::FromInt(N);
	}
}

AStampOmokGameMode::AStampOmokGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;
	DefaultPawnClass = nullptr;
	PlayerControllerClass = AStampOmokPlayerController::StaticClass();
}

double AStampOmokGameMode::Now() const
{
	return GetWorld() ? static_cast<double>(GetWorld()->GetTimeSeconds()) : 0.0;
}

StampRules::FRulesConfig AStampOmokGameMode::GetRulesConfig() const
{
	StampRules::FRulesConfig Cfg = UStampOmokSettings::Get().ToRulesConfig();
	Cfg.LineTolerance = Options.LineTolerance;
	Cfg.AngleToleranceDeg = Options.AngleToleranceDeg;
	Cfg.ArmMaxLength = Options.ArmMaxLength;
	Cfg.ArmJitter = Options.ArmJitter;
	return Cfg;
}

double AStampOmokGameMode::GetStampDiameter() const
{
	return StampRules::StampDiameter(GetRulesConfig());
}

// ───────────────────────────── 세계 만들기 ─────────────────────────────

void AStampOmokGameMode::StartPlay()
{
	LoadOptions();
	const UStampOmokSettings& S = UStampOmokSettings::Get();
	const double D = GetStampDiameter();

	UWorld* World = GetWorld();
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Environment = World->SpawnActor<AStampEnvironment>(AStampEnvironment::StaticClass(), FTransform::Identity, Params);
	Board = World->SpawnActor<AStampBoard>(AStampBoard::StaticClass(), FTransform::Identity, Params);
	Arm = World->SpawnActor<AStampArm>(AStampArm::StaticClass(), FTransform::Identity, Params);
	Ruler = World->SpawnActor<AStampRuler>(AStampRuler::StaticClass(), FTransform::Identity, Params);
	Rig = World->SpawnActor<AStampCameraRig>(AStampCameraRig::StaticClass(), FTransform::Identity, Params);

	Board->InitBoard(D, S.PaperSizeD * D);
	Arm->InitArm(D);
	Ruler->InitRuler(D, S.RulerLength, S.RulerWidth, Options.LineTolerance);
	Rig->SetBounds(Board->GetPaperSize() * 0.5);
	Rig->SetDepthOfField(Options.bDepthOfField);

	Super::StartPlay();

	for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
	{
		AttachPlayer(It->Get());
	}

	if (USoundBase* MusicSound = StampAssets::FindSound(TEXT("MUS_Gayageum")))
	{
		Music = UGameplayStatics::SpawnSound2D(this, MusicSound, Options.MusicVolume, 1.f, 0.f, nullptr, true, false);
	}
	if (USoundBase* AmbSound = StampAssets::FindSound(TEXT("AMB_Maru")))
	{
		Ambience = UGameplayStatics::SpawnSound2D(this, AmbSound, Options.AmbienceVolume, 1.f, 0.f, nullptr, true, false);
	}

	ShowMainMenuBoard();

	if (!StampAssets::HasProjectAssets() && GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, 30.f, FColor::Orange,
			TEXT("StampOmok: /Game/StampOmok 에셋이 없습니다. 에디터에서 Content/Python/stamp_omok_setup.py 를 실행하세요 (README 참고)."));
	}
}

void AStampOmokGameMode::HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer)
{
	// 폰 없이 카메라 리그를 보는 방식이라 기본 재시작(폰 생성)은 하지 않는다
	if (Rig)
	{
		AttachPlayer(NewPlayer);
	}
}

void AStampOmokGameMode::AttachPlayer(APlayerController* PC)
{
	if (!PC || !Rig)
	{
		return;
	}
	PC->SetViewTarget(Rig);
	if (AStampOmokPlayerController* StampPC = Cast<AStampOmokPlayerController>(PC))
	{
		StampPC->InitStampUI(this);
	}
}

// ───────────────────────────── 옵션 ─────────────────────────────

void AStampOmokGameMode::LoadOptions()
{
	const UStampOmokSettings& S = UStampOmokSettings::Get();
	Options.LineTolerance = S.LineTolerance;
	Options.AngleToleranceDeg = S.AngleToleranceDeg;
	Options.ArmMaxLength = S.ArmMaxLength;
	Options.ArmJitter = S.ArmJitter;
	Options.FailPenalty = S.FailPenalty;
	Options.bOverlapEndsTurn = S.bOverlapEndsTurn;
	Options.bShowLandingPreview = S.bShowLandingPreview;
	Options.bLatticeShadow = S.bWindowLatticeShadow;
	Options.bDepthOfField = S.bDepthOfField;
	Options.MusicVolume = S.MusicVolume;
	Options.AmbienceVolume = S.AmbienceVolume;
	Options.SfxVolume = S.SfxVolume;
	if (!GConfig)
	{
		return;
	}
	const TCHAR* Sec = GameModeDetail::OptionsSection;
	GConfig->GetFloat(Sec, TEXT("LineTolerance"), Options.LineTolerance, GGameUserSettingsIni);
	GConfig->GetFloat(Sec, TEXT("AngleToleranceDeg"), Options.AngleToleranceDeg, GGameUserSettingsIni);
	GConfig->GetFloat(Sec, TEXT("ArmMaxLength"), Options.ArmMaxLength, GGameUserSettingsIni);
	GConfig->GetFloat(Sec, TEXT("ArmJitter"), Options.ArmJitter, GGameUserSettingsIni);
	int32 Penalty = static_cast<int32>(Options.FailPenalty);
	if (GConfig->GetInt(Sec, TEXT("FailPenalty"), Penalty, GGameUserSettingsIni))
	{
		Options.FailPenalty = static_cast<EStampFailPenalty>(FMath::Clamp(Penalty, 0, 2));
	}
	GConfig->GetBool(Sec, TEXT("bOverlapEndsTurn"), Options.bOverlapEndsTurn, GGameUserSettingsIni);
	GConfig->GetBool(Sec, TEXT("bShowLandingPreview"), Options.bShowLandingPreview, GGameUserSettingsIni);
	GConfig->GetBool(Sec, TEXT("bLatticeShadow"), Options.bLatticeShadow, GGameUserSettingsIni);
	GConfig->GetBool(Sec, TEXT("bDepthOfField"), Options.bDepthOfField, GGameUserSettingsIni);
	GConfig->GetFloat(Sec, TEXT("MusicVolume"), Options.MusicVolume, GGameUserSettingsIni);
	GConfig->GetFloat(Sec, TEXT("AmbienceVolume"), Options.AmbienceVolume, GGameUserSettingsIni);
	GConfig->GetFloat(Sec, TEXT("SfxVolume"), Options.SfxVolume, GGameUserSettingsIni);
}

void AStampOmokGameMode::SaveOptions() const
{
	if (!GConfig)
	{
		return;
	}
	const TCHAR* Sec = GameModeDetail::OptionsSection;
	GConfig->SetFloat(Sec, TEXT("LineTolerance"), Options.LineTolerance, GGameUserSettingsIni);
	GConfig->SetFloat(Sec, TEXT("AngleToleranceDeg"), Options.AngleToleranceDeg, GGameUserSettingsIni);
	GConfig->SetFloat(Sec, TEXT("ArmMaxLength"), Options.ArmMaxLength, GGameUserSettingsIni);
	GConfig->SetFloat(Sec, TEXT("ArmJitter"), Options.ArmJitter, GGameUserSettingsIni);
	GConfig->SetInt(Sec, TEXT("FailPenalty"), static_cast<int32>(Options.FailPenalty), GGameUserSettingsIni);
	GConfig->SetBool(Sec, TEXT("bOverlapEndsTurn"), Options.bOverlapEndsTurn, GGameUserSettingsIni);
	GConfig->SetBool(Sec, TEXT("bShowLandingPreview"), Options.bShowLandingPreview, GGameUserSettingsIni);
	GConfig->SetBool(Sec, TEXT("bLatticeShadow"), Options.bLatticeShadow, GGameUserSettingsIni);
	GConfig->SetBool(Sec, TEXT("bDepthOfField"), Options.bDepthOfField, GGameUserSettingsIni);
	GConfig->SetFloat(Sec, TEXT("MusicVolume"), Options.MusicVolume, GGameUserSettingsIni);
	GConfig->SetFloat(Sec, TEXT("AmbienceVolume"), Options.AmbienceVolume, GGameUserSettingsIni);
	GConfig->SetFloat(Sec, TEXT("SfxVolume"), Options.SfxVolume, GGameUserSettingsIni);
	GConfig->Flush(false, GGameUserSettingsIni);
}

void AStampOmokGameMode::ApplyOptions(const FStampOptions& NewOptions)
{
	Options = NewOptions;
	Options.LineTolerance = FMath::Clamp(Options.LineTolerance, 0.05f, 1.f);
	Options.ArmMaxLength = FMath::Clamp(Options.ArmMaxLength, 2.f, 40.f);
	Options.ArmJitter = FMath::Clamp(Options.ArmJitter, 0.f, 0.5f);
	for (FStampPlayerSlot& Slot : Slots)
	{
		Slot.ArmLength = FMath::Clamp(Slot.ArmLength, UStampOmokSettings::Get().ArmMinLength, Options.ArmMaxLength);
	}
	if (Ruler)
	{
		Ruler->SetTolerance(Options.LineTolerance);
	}
	if (Environment)
	{
		Environment->SetLatticeShadow(Options.bLatticeShadow);
	}
	if (Rig)
	{
		Rig->SetDepthOfField(Options.bDepthOfField);
	}
	if (Music)
	{
		Music->SetVolumeMultiplier(FMath::Max(Options.MusicVolume, 0.001f));
	}
	if (Ambience)
	{
		Ambience->SetVolumeMultiplier(FMath::Max(Options.AmbienceVolume, 0.001f));
	}
	SaveOptions();
	RefreshMarks();
}

FText AStampOmokGameMode::DescribePenalty() const
{
	switch (Options.FailPenalty)
	{
	case EStampFailPenalty::SkipTurn:
		return GameModeDetail::Txt(TEXT("실패하면 다음 차례를 한 번 쉽니다"));
	case EStampFailPenalty::Cooldown:
		return GameModeDetail::Txt(FString::Printf(TEXT("실패하면 내 다음 %d차례 동안 자를 쓸 수 없어요"), UStampOmokSettings::Get().CooldownTurns));
	default:
		return GameModeDetail::Txt(TEXT("실패하면 차례만 넘어갑니다"));
	}
}

// ───────────────────────────── 조회 ─────────────────────────────

int32 AStampOmokGameMode::CountStamps(int32 Player) const
{
	int32 N = 0;
	for (const StampRules::FStamp& S : Stamps)
	{
		N += S.Owner == Player ? 1 : 0;
	}
	return N;
}

int32 AStampOmokGameMode::RulerBlockedLeft(int32 Player) const
{
	const FStampPlayerSlot& Slot = GetSlot(Player);
	return FMath::Max(0, Slot.RulerBlockedUntil - Slot.OwnTurns + 1);
}

int32 AStampOmokGameMode::GetRulerCandidateCount() const
{
	const StampRules::FRuler R{RulerCenter, FMath::DegreesToRadians(RulerDeg)};
	return static_cast<int32>(StampRules::RulerCandidates(R, Stamps, Current, GetRulesConfig()).size());
}

bool AStampOmokGameMode::TryGetAnchorWorld(FVector& OutWorld) const
{
	if (!bHasAnchor)
	{
		return false;
	}
	OutWorld = StampOmok::BoardToWorld(Anchor);
	return true;
}

bool AStampOmokGameMode::IsRevealed() const
{
	return Phase == EStampPhase::Ruler || Phase == EStampPhase::Judging || Phase == EStampPhase::Result
		|| Phase == EStampPhase::Over || Phase == EStampPhase::Menu;
}

const StampRules::FStamp* AStampOmokGameMode::FindStamp(int32 Id) const
{
	for (const StampRules::FStamp& S : Stamps)
	{
		if (S.Id == Id)
		{
			return &S;
		}
	}
	return nullptr;
}

void AStampOmokGameMode::Toast(const FText& Message, bool bWarning)
{
	OnToast.Broadcast(Message, bWarning);
}

// ───────────────────────────── 메뉴 · 새 대국 · 차례 ─────────────────────────────

void AStampOmokGameMode::ShowMainMenuBoard()
{
	// 메뉴 뒤 장식 판: 주홍 한 줄과 흩어진 쪽빛
	Phase = EStampPhase::Menu;
	bGameStarted = false;
	Stamps.clear();
	Board->ClearStamps();
	Board->ClearMarks();
	Arm->HideArm();
	Ruler->ShowRuler(false);
	const double D = GetStampDiameter();
	int32 Id = 1;
	for (int32 I = 0; I < 5; ++I)
	{
		const double T = (I - 2) * 1.25 * D;
		const StampRules::FVec2 P{-6.0 + T * FMath::Cos(0.45) + FMath::FRandRange(-0.1, 0.1), 2.0 + T * FMath::Sin(0.45)};
		Board->AddStamp(Id++, P, 0, FMath::FRandRange(-12.f, 12.f), I % 3);
	}
	const StampRules::FVec2 Others[] = {{-2.0, -4.5}, {3.5, 1.0}, {-11.0, -2.5}, {1.0, 7.5}, {6.5, -3.0}};
	for (const StampRules::FVec2& P : Others)
	{
		const int32 Variant = Id % 3;
		Board->AddStamp(Id++, P, 1, FMath::FRandRange(-12.f, 12.f), Variant);
	}
	Board->SetRevealed(true);
	FStampCameraPose Pose;
	Pose.Focus = FVector2D(0.0, -2.0);
	Pose.Distance = 46.f;
	Rig->SetPose(Pose, false);
	Rig->SetAttractMode(true);
}

void AStampOmokGameMode::NewGame()
{
	Stamps.clear();
	NextStampId = 1;
	Board->ClearStamps();
	Board->ClearMarks();
	Board->SetRevealed(false);
	Arm->HideArm();
	Ruler->ShowRuler(false);
	Rig->SetAttractMode(false);

	const UStampOmokSettings& S = UStampOmokSettings::Get();
	for (int32 I = 0; I < 2; ++I)
	{
		Slots[I] = FStampPlayerSlot();
		Slots[I].ArmLength = FMath::Clamp(S.ArmDefaultLength, S.ArmMinLength, Options.ArmMaxLength);
		Slots[I].Bend = I == 0 ? StampRules::EBend::Right : StampRules::EBend::Left;
	}
	Current = 0;
	MoveNo = 1;
	Winner = -1;
	LastAction = FStampLastAction();
	bGameStarted = true;
	ShowHandoff();
}

void AStampOmokGameMode::ShowHandoff()
{
	Phase = EStampPhase::Handoff;
	bHasAnchor = false;
	Board->SetRevealed(false);
	Board->ClearMarks();
	Board->SetGlow(false);
	Arm->HideArm();
	Ruler->ShowRuler(false);
	StampAssets::PlaySfx(this, TEXT("SFX_Handoff"), 0.8f);
}

void AStampOmokGameMode::ReadyForTurn()
{
	if (Phase != EStampPhase::Handoff)
	{
		return;
	}
	FStampPlayerSlot& Slot = Slots[Current];
	if (Slot.Skip > 0)
	{
		Slot.Skip = FMath::Max(0, Slot.Skip - 1);
		LastAction = FStampLastAction{Current, GameModeDetail::Txt(TEXT("쉼"))};
		Current = 1 - Current;
		++MoveNo;
		ShowHandoff();
		return;
	}
	BeginTurn();
}

void AStampOmokGameMode::BeginTurn()
{
	FStampPlayerSlot& Slot = Slots[Current];
	++Slot.OwnTurns;
	Slot.ArmLength = FMath::Clamp(Slot.ArmLength, UStampOmokSettings::Get().ArmMinLength, Options.ArmMaxLength);
	if (Slot.bHasCamera)
	{
		Rig->SetPose(Slot.Camera, false);
	}
	else
	{
		FStampCameraPose Pose;
		Pose.Distance = UStampOmokSettings::Get().CameraDefaultDistance;
		Rig->SetPose(Pose, false);
	}
	Phase = EStampPhase::Stamp;
	bHasAnchor = false;
	Board->SetRevealed(false);
	RefreshMarks();
}

void AStampOmokGameMode::EndTurn(const FText& Label)
{
	FStampPlayerSlot& Slot = Slots[Current];
	Slot.Camera = Rig->GetPose();
	Slot.bHasCamera = true;
	LastAction = FStampLastAction{Current, Label};
	Current = 1 - Current;
	++MoveNo;
	ShowHandoff();
}

// ───────────────────────────── 도장 찍기 ─────────────────────────────

void AStampOmokGameMode::SetAnchor(const StampRules::FVec2& P)
{
	if (Phase != EStampPhase::Stamp)
	{
		return;
	}
	const double Half = Board->GetPaperSize() * 0.5 - 0.5;
	Anchor = StampRules::FVec2{FMath::Clamp(P.X, -Half, Half), FMath::Clamp(P.Y, -Half, Half)};
	bHasAnchor = true;
	RefreshArmRest();
	RefreshMarks();
}

void AStampOmokGameMode::SetArmLength(float LengthD)
{
	if (Phase != EStampPhase::Stamp)
	{
		return;
	}
	const float Step = FMath::Max(UStampOmokSettings::Get().ArmStep, 0.01f);
	const float Snapped = FMath::RoundToFloat(LengthD / Step) * Step;
	Slots[Current].ArmLength = FMath::Clamp(Snapped, UStampOmokSettings::Get().ArmMinLength, Options.ArmMaxLength);
	RefreshMarks();
}

void AStampOmokGameMode::NudgeArm(float DeltaD)
{
	SetArmLength(Slots[Current].ArmLength + DeltaD);
}

void AStampOmokGameMode::SetBend(StampRules::EBend Bend)
{
	if (Phase != EStampPhase::Stamp)
	{
		return;
	}
	Slots[Current].Bend = Bend;
	RefreshArmRest();
	RefreshMarks();
}

void AStampOmokGameMode::RefreshArmRest()
{
	if (Phase == EStampPhase::Stamp && bHasAnchor)
	{
		Arm->ShowAt(Anchor, Slots[Current].Bend, Current);
	}
	else if (Phase != EStampPhase::Animating)
	{
		Arm->HideArm();
	}
}

void AStampOmokGameMode::PlaceStamp()
{
	if (Phase != EStampPhase::Stamp || !bHasAnchor)
	{
		return;
	}
	const StampRules::FRulesConfig Cfg = GetRulesConfig();
	const FStampPlayerSlot& Slot = Slots[Current];
	const StampRules::FArm ArmGeom = StampRules::ComputeArm(Anchor, Slot.ArmLength, Slot.Bend, Cfg);
	PendingTarget = StampRules::ApplyJitter(ArmGeom.Hand, Cfg, FMath::FRand(), FMath::FRand());
	const double D = StampRules::StampDiameter(Cfg);
	const double Half = Board->GetPaperSize() * 0.5 - D * 0.5;
	bPendingOffPaper = FMath::Abs(PendingTarget.X) > Half || FMath::Abs(PendingTarget.Y) > Half;
	bPendingBlocked = !bPendingOffPaper && StampRules::FindOverlap(PendingTarget, Stamps, Cfg) >= 0;

	Phase = EStampPhase::Animating;
	AnimStart = Now();
	Board->ClearMarks();
	TWeakObjectPtr<AStampOmokGameMode> WeakThis(this);
	Arm->PlayStamp(ArmGeom, PendingTarget, bPendingBlocked || bPendingOffPaper,
		[WeakThis]()
		{
			if (WeakThis.IsValid())
			{
				WeakThis->OnArmImpact();
			}
		},
		nullptr);
	StampAssets::PlaySfx(this, TEXT("SFX_Arm"), 0.7f);
}

void AStampOmokGameMode::OnArmImpact()
{
	if (Phase != EStampPhase::Animating)
	{
		return;
	}
	if (bPendingBlocked || bPendingOffPaper)
	{
		StampAssets::PlaySfx(this, TEXT("SFX_Blocked"));
		Rig->Shake(0.5f);
		Board->AddCross(PendingTarget, GetStampDiameter() * 0.8, StampOmok::Srgb(226, 85, 59), 0.9f);
		Toast(GameModeDetail::Txt(bPendingOffPaper ? TEXT("종이 밖이라 찍히지 않았어요") : TEXT("쿵! 무언가에 막혀 찍히지 않았어요")), true);
		return;
	}
	StampRules::FStamp Stamp;
	Stamp.Id = NextStampId++;
	Stamp.P = PendingTarget;
	Stamp.Owner = Current;
	Stamps.push_back(Stamp);
	Board->AddStamp(Stamp.Id, Stamp.P, Stamp.Owner, FMath::FRandRange(-13.f, 13.f), FMath::RandRange(0, 2));
	Board->FlashStamp(Stamp.Id, UStampOmokSettings::Get().StampFlashSeconds);
	StampAssets::PlaySfx(this, TEXT("SFX_Stamp"), 1.f, 0.06f);
	Rig->Shake(0.7f);
}

void AStampOmokGameMode::FinishStampAnimation()
{
	Board->ClearMarks();
	const bool bFailed = bPendingBlocked || bPendingOffPaper;
	if (bFailed && !Options.bOverlapEndsTurn)
	{
		Phase = EStampPhase::Stamp;
		RefreshArmRest();
		RefreshMarks();
		return;
	}
	EndTurn(GameModeDetail::Txt(TEXT("도장 찍기")));
}

// ───────────────────────────── 자 확인 ─────────────────────────────

bool AStampOmokGameMode::CanRequestRuler() const
{
	return Phase == EStampPhase::Stamp && RulerBlockedLeft(Current) == 0;
}

void AStampOmokGameMode::BeginRuler()
{
	if (!CanRequestRuler())
	{
		return;
	}
	Phase = EStampPhase::Ruler;
	bHasAnchor = false;
	Arm->HideArm();
	Board->SetRevealed(true);
	if (!Stamps.empty())
	{
		double Sx = 0.0, Sy = 0.0;
		for (const StampRules::FStamp& S : Stamps)
		{
			Sx += S.P.X;
			Sy += S.P.Y;
		}
		const double Count = static_cast<double>(Stamps.size());
		RulerCenter = StampRules::FVec2{Sx / Count, Sy / Count};
	}
	else
	{
		const FStampCameraPose Pose = Rig->GetPose();
		RulerCenter = StampOmok::WorldToBoard(FVector(Pose.Focus.X, Pose.Focus.Y, 0.0));
	}
	RulerDeg = 0.0;
	Ruler->SetPose(RulerCenter, RulerDeg);
	Ruler->ShowRuler(true);
	FitCameraToStamps();
	StampAssets::PlaySfx(this, TEXT("SFX_Ruler"));
	Toast(GameModeDetail::Txt(TEXT("판 공개! 이제 두 사람 모두 화면을 볼 수 있어요")));
	RefreshMarks();
}

void AStampOmokGameMode::MoveRuler(const StampRules::FVec2& Center)
{
	if (Phase != EStampPhase::Ruler)
	{
		return;
	}
	const double Half = Board->GetPaperSize() * 0.5;
	RulerCenter = StampRules::FVec2{FMath::Clamp(Center.X, -Half, Half), FMath::Clamp(Center.Y, -Half, Half)};
	Ruler->SetPose(RulerCenter, RulerDeg);
	RefreshMarks();
}

void AStampOmokGameMode::SetRulerDeg(double Deg)
{
	if (Phase != EStampPhase::Ruler)
	{
		return;
	}
	RulerDeg = FMath::Fmod(FMath::Fmod(Deg, 180.0) + 180.0, 180.0);
	Ruler->SetPose(RulerCenter, RulerDeg);
	RefreshMarks();
}

void AStampOmokGameMode::Judge()
{
	if (Phase != EStampPhase::Ruler)
	{
		return;
	}
	const StampRules::FRuler R{RulerCenter, FMath::DegreesToRadians(RulerDeg)};
	LastJudge = StampRules::JudgeRuler(R, Stamps, Current, GetRulesConfig());
	JudgeMessage = BuildJudgeMessage(LastJudge);
	JudgeStart = Now();
	Phase = EStampPhase::Judging;
	StampAssets::PlaySfx(this, TEXT("SFX_Sweep"), 0.8f);
}

void AStampOmokGameMode::FinishJudge()
{
	Board->SetGlow(false);
	FStampPlayerSlot& Slot = Slots[Current];
	if (LastJudge.bSuccess)
	{
		Phase = EStampPhase::Over;
		Winner = Current;
		StampAssets::PlaySfx(this, TEXT("SFX_Win"), 1.f, 0.f);
		Rig->Shake(0.3f);
		// 다섯 도장이 화면 가운데 오도록
		FVector2D Min(TNumericLimits<double>::Max(), TNumericLimits<double>::Max());
		FVector2D Max(-TNumericLimits<double>::Max(), -TNumericLimits<double>::Max());
		for (int32 Id : LastJudge.ChosenIds)
		{
			if (const StampRules::FStamp* S = FindStamp(Id))
			{
				const FVector W = StampOmok::BoardToWorld(S->P);
				Min.X = FMath::Min(Min.X, W.X);
				Min.Y = FMath::Min(Min.Y, W.Y);
				Max.X = FMath::Max(Max.X, W.X);
				Max.Y = FMath::Max(Max.Y, W.Y);
			}
		}
		if (Min.X <= Max.X)
		{
			Rig->FrameRegion(Min, Max);
		}
	}
	else
	{
		Phase = EStampPhase::Result;
		StampAssets::PlaySfx(this, TEXT("SFX_Fail"), 0.9f, 0.f);
		switch (Options.FailPenalty)
		{
		case EStampFailPenalty::SkipTurn:
			Slot.Skip = 1;
			PenaltyNote = GameModeDetail::Txt(TEXT("벌칙: 다음 차례 쉼"));
			break;
		case EStampFailPenalty::Cooldown:
			Slot.RulerBlockedUntil = Slot.OwnTurns + UStampOmokSettings::Get().CooldownTurns;
			PenaltyNote = GameModeDetail::Txt(FString::Printf(TEXT("벌칙: %d차례 자 확인 금지"), UStampOmokSettings::Get().CooldownTurns));
			break;
		default:
			PenaltyNote = GameModeDetail::Txt(TEXT("차례만 넘어가요"));
			break;
		}
	}
	RefreshMarks();
}

void AStampOmokGameMode::PassTurn()
{
	if (Phase == EStampPhase::Result)
	{
		EndTurn(GameModeDetail::Txt(TEXT("자 확인 실패")));
	}
}

FText AStampOmokGameMode::BuildJudgeMessage(const StampRules::FJudgeResult& Result) const
{
	const StampRules::FRulesConfig Cfg = GetRulesConfig();
	const double D = StampRules::StampDiameter(Cfg);
	const int32 TolPct = FMath::RoundToInt(Cfg.LineTolerance * 100.0);
	const FString Count = GameModeDetail::NumberWord(Cfg.WinCount);
	switch (Result.Code)
	{
	case StampRules::EJudgeCode::NotEnough:
		return GameModeDetail::Txt(FString::Printf(TEXT("자의 허용 띠 안에 든 내 도장이 %d개예요. %d개가 필요해요."), static_cast<int32>(Result.CandidateIds.size()), Cfg.WinCount));
	case StampRules::EJudgeCode::NotStraight:
		return GameModeDetail::Txt(FString::Printf(TEXT("%s 도장이 한 줄에서 벗어났어요. 가장 먼 도장이 도장 지름의 %d%%만큼 비켜 있어요 (허용 %d%%)."),
			*Count, FMath::RoundToInt(Result.Fit.MaxResidual / D * 100.0), TolPct));
	case StampRules::EJudgeCode::Misaligned:
		return GameModeDetail::Txt(FString::Printf(TEXT("자가 도장 줄과 어긋났어요. 각도 차 %.1f° (허용 %.0f°)."),
			FMath::RadiansToDegrees(Result.AngleDiff), Cfg.AngleToleranceDeg));
	case StampRules::EJudgeCode::Gap:
		return GameModeDetail::Txt(FString::Printf(TEXT("줄 사이가 너무 벌어졌어요. 가장 넓은 간격이 도장 %.1f개 (허용 %.1f개)."), Result.MaxGap / D, Cfg.MaxGap));
	case StampRules::EJudgeCode::Blocked:
		return GameModeDetail::Txt(FString::Printf(TEXT("상대 도장이 %s 도장 사이를 가로막고 있어요."), *Count));
	case StampRules::EJudgeCode::Win:
	default:
		return GameModeDetail::Txt(FString::Printf(TEXT("%s 도장이 한 줄! 최대 오차 도장 지름의 %d%%."), *Count, FMath::RoundToInt(Result.Fit.MaxResidual / D * 100.0)));
	}
}

// ───────────────────────────── 카메라 ─────────────────────────────

void AStampOmokGameMode::FitCameraToStamps()
{
	if (Stamps.empty())
	{
		CenterCamera();
		return;
	}
	FVector2D Min(TNumericLimits<double>::Max(), TNumericLimits<double>::Max());
	FVector2D Max(-TNumericLimits<double>::Max(), -TNumericLimits<double>::Max());
	for (const StampRules::FStamp& S : Stamps)
	{
		const FVector W = StampOmok::BoardToWorld(S.P);
		Min.X = FMath::Min(Min.X, W.X);
		Min.Y = FMath::Min(Min.Y, W.Y);
		Max.X = FMath::Max(Max.X, W.X);
		Max.Y = FMath::Max(Max.Y, W.Y);
	}
	Rig->FrameRegion(Min, Max);
}

void AStampOmokGameMode::CenterCamera()
{
	if (IsRevealed() && !Stamps.empty())
	{
		FitCameraToStamps();
		return;
	}
	FStampCameraPose Pose;
	Pose.Distance = UStampOmokSettings::Get().CameraDefaultDistance;
	Rig->SetPose(Pose, true);
}

// ───────────────────────────── 표시 · 진행 ─────────────────────────────

void AStampOmokGameMode::RefreshMarks()
{
	if (!Board)
	{
		return;
	}
	Board->ClearMarks();
	const StampRules::FRulesConfig Cfg = GetRulesConfig();
	const double D = StampRules::StampDiameter(Cfg);
	const FLinearColor Brass = StampOmok::Srgb(214, 172, 80);
	const FLinearColor Alert = StampOmok::Srgb(226, 85, 59);

	switch (Phase)
	{
	case EStampPhase::Stamp:
		if (bHasAnchor && Options.bShowLandingPreview)
		{
			const FStampPlayerSlot& Slot = Slots[Current];
			const StampRules::FArm A = StampRules::ComputeArm(Anchor, Slot.ArmLength, Slot.Bend, Cfg);
			const FLinearColor Ink = StampOmok::PlayerLook(Current).Ink;
			Board->AddLine(A.Start, A.Elbow, 0.08, Ink, 0.45f);
			Board->AddLine(A.Elbow, A.Hand, 0.08, Ink, 0.45f);
			Board->AddRing(A.Hand, D * 0.5, Ink, 0.6f);
		}
		break;

	case EStampPhase::Ruler:
	{
		const StampRules::FRuler R{RulerCenter, FMath::DegreesToRadians(RulerDeg)};
		for (const StampRules::FCandidate& C : StampRules::RulerCandidates(R, Stamps, Current, Cfg))
		{
			Board->AddRing(Stamps[static_cast<size_t>(C.Index)].P, D * 0.62, Brass, 0.85f);
		}
		break;
	}

	case EStampPhase::Judging:
	{
		// 자를 따라 지나간 자리까지만 후보를 짚는다
		const float K = FMath::Clamp(static_cast<float>((Now() - JudgeStart) / GameModeDetail::JudgeSeconds), 0.f, 1.f);
		const double Angle = FMath::DegreesToRadians(RulerDeg);
		const double Half = Cfg.RulerLength * D * 0.5;
		const double Pos = -Half + 2.0 * Half * K;
		for (int32 Id : LastJudge.CandidateIds)
		{
			if (const StampRules::FStamp* S = FindStamp(Id))
			{
				if (StampRules::ProjectOnLine(S->P, RulerCenter, Angle).T <= Pos)
				{
					Board->AddRing(S->P, D * 0.62, Brass, 0.85f);
				}
			}
		}
		break;
	}

	case EStampPhase::Result:
	case EStampPhase::Over:
	{
		const FLinearColor LineColor = LastJudge.bSuccess ? StampOmok::PlayerLook(Current).Ink : Alert;
		for (int32 Id : LastJudge.CandidateIds)
		{
			if (const StampRules::FStamp* S = FindStamp(Id))
			{
				Board->AddRing(S->P, D * 0.62, Brass, 0.55f);
			}
		}
		if (LastJudge.bHasFit && !LastJudge.ChosenIds.empty())
		{
			// 최소제곱 피팅 직선
			const StampRules::FLineFit& F = LastJudge.Fit;
			double TMin = 1e9, TMax = -1e9;
			for (int32 Id : LastJudge.ChosenIds)
			{
				if (const StampRules::FStamp* S = FindStamp(Id))
				{
					const double T = StampRules::ProjectOnLine(S->P, F.Center, F.Angle).T;
					TMin = FMath::Min(TMin, T);
					TMax = FMath::Max(TMax, T);
				}
			}
			TMin -= D * 0.8;
			TMax += D * 0.8;
			const StampRules::FVec2 A{F.Center.X + F.Dir.X * TMin, F.Center.Y + F.Dir.Y * TMin};
			const StampRules::FVec2 B{F.Center.X + F.Dir.X * TMax, F.Center.Y + F.Dir.Y * TMax};
			Board->AddLine(A, B, LastJudge.bSuccess ? 0.12 : 0.07, LineColor, 0.85f);
			if (LastJudge.bSuccess)
			{
				for (int32 Id : LastJudge.ChosenIds)
				{
					if (const StampRules::FStamp* S = FindStamp(Id))
					{
						Board->AddDisc(S->P, D * 0.95, Brass, 0.5f);
						Board->AddRing(S->P, D * 0.66, Brass, 1.f);
					}
				}
			}
		}
		if (LastJudge.Code == StampRules::EJudgeCode::NotStraight)
		{
			if (const StampRules::FStamp* S = FindStamp(LastJudge.WorstId))
			{
				Board->AddRing(S->P, D * 0.72, Alert, 1.f);
			}
		}
		else if (LastJudge.Code == StampRules::EJudgeCode::Gap && LastJudge.GapAt > 0)
		{
			const StampRules::FStamp* P = FindStamp(LastJudge.ChosenIds[static_cast<size_t>(LastJudge.GapAt - 1)]);
			const StampRules::FStamp* Q = FindStamp(LastJudge.ChosenIds[static_cast<size_t>(LastJudge.GapAt)]);
			if (P && Q)
			{
				Board->AddLine(P->P, Q->P, 0.16, Alert, 0.9f);
			}
		}
		else if (LastJudge.Code == StampRules::EJudgeCode::Blocked)
		{
			if (const StampRules::FStamp* S = FindStamp(LastJudge.BlockerId))
			{
				Board->AddRing(S->P, D * 0.72, Alert, 1.f);
				Board->AddCross(S->P, D * 0.7, Alert, 0.9f);
			}
		}
		break;
	}

	default:
		break;
	}
}

void AStampOmokGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (Phase == EStampPhase::Animating)
	{
		const double Elapsed = Now() - AnimStart;
		const double Flash = (bPendingBlocked || bPendingOffPaper) ? 0.0 : UStampOmokSettings::Get().StampFlashSeconds;
		if (Elapsed >= FMath::Max(static_cast<double>(AStampArm::TotalTime()), AStampArm::ImpactTime() + Flash + 0.1))
		{
			FinishStampAnimation();
		}
	}
	else if (Phase == EStampPhase::Judging)
	{
		const double Elapsed = Now() - JudgeStart;
		const float K = FMath::Clamp(static_cast<float>(Elapsed / GameModeDetail::JudgeSeconds), 0.f, 1.f);
		const double D = GetStampDiameter();
		const double Half = GetRulesConfig().RulerLength * D * 0.5;
		const double Angle = FMath::DegreesToRadians(RulerDeg);
		const double Pos = -Half + 2.0 * Half * K;
		Board->SetGlow(true, StampRules::FVec2{RulerCenter.X + FMath::Cos(Angle) * Pos, RulerCenter.Y + FMath::Sin(Angle) * Pos}, D * 1.4);
		RefreshMarks();
		if (Elapsed >= GameModeDetail::JudgeSeconds)
		{
			FinishJudge();
		}
	}
}
