// 가상의 팔: 놋쇠와 나무로 된 도장 기계
#include "World/StampArm.h"

#include "Components/StaticMeshComponent.h"
#include "Core/StampAssets.h"
#include "Core/StampOmokTypes.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "World/StampMeshUtil.h"

namespace ArmDetail
{
	// 크기 (cm)
	constexpr double BaseRadius = 1.5;
	constexpr double BaseTop = 0.62;
	constexpr double BaseBehind = 2.6;     // 받침 중심이 기준점보다 뒤로 물러난 거리
	constexpr double RodZ = 2.7;           // 팔대 높이
	constexpr double RodRadius = 0.14;
	constexpr double PostRadius = 0.2;
	constexpr double JointRadius = 0.3;
	constexpr double CollarRadius = 0.95;  // 도장을 잡는 고리 (손잡이 몸통보다 넓다)
	constexpr double HeadLift = 1.5;       // 들린 도장의 인면 높이
	constexpr double BlockedStop = 0.55;   // 막혔을 때 인면이 멈추는 높이

	// 시간 (초)
	constexpr float Reach1 = 0.42f;
	constexpr float Reach2 = 0.38f;
	constexpr float Settle = 0.12f;
	constexpr float Press = 0.16f;
	constexpr float Hold = 0.1f;
	constexpr float Lift = 0.24f;
	constexpr float Retract = 0.5f;
	constexpr float Tail = 0.15f;

	constexpr float ImpactAt = Reach1 + Reach2 + Settle + Press;
	constexpr float RetractAt = ImpactAt + Hold + Lift;
	constexpr float EndAt = RetractAt + Retract + Tail;

	float EaseOut(float K) { return 1.f - FMath::Pow(1.f - K, 3.f); }
	float EaseIn(float K) { return K * K * K; }
	float EaseInOut(float K) { return K < 0.5f ? 4.f * K * K * K : 1.f - FMath::Pow(-2.f * K + 2.f, 3.f) / 2.f; }
	float Clamp01(float K) { return FMath::Clamp(K, 0.f, 1.f); }

	/** 도장 손잡이 단면: 인면(0~0.16), 옻칠 띠, 잘록한 목, 둥근 꼭지 — 높이 약 3.6cm */
	std::vector<StampLathe::FProfilePoint> HeadFace()
	{
		return {{0.0, 0.0, false}, {0.80, 0.0, false}, {0.825, 0.04, false}, {0.825, 0.16, false}, {0.0, 0.16, false}};
	}
	std::vector<StampLathe::FProfilePoint> HeadBand()
	{
		return {{0.70, 0.16, false}, {0.835, 0.16, false}, {0.85, 0.2, true}, {0.85, 0.44, true}, {0.82, 0.5, false}, {0.70, 0.5, false}};
	}
	std::vector<StampLathe::FProfilePoint> HeadBody()
	{
		return {{0.0, 0.5, false}, {0.80, 0.5, false}, {0.78, 0.8, true}, {0.72, 1.4, true}, {0.62, 2.0, true}, {0.5, 2.45, true},
			{0.44, 2.68, true}, {0.47, 2.85, true}, {0.6, 3.05, true}, {0.63, 3.22, true}, {0.56, 3.42, true}, {0.38, 3.57, true}, {0.0, 3.63, false}};
	}
	std::vector<StampLathe::FProfilePoint> BaseWood()
	{
		return {{0.0, 0.0, false}, {BaseRadius, 0.0, false}, {BaseRadius, 0.42, false}, {BaseRadius - 0.07, 0.55, true}, {BaseRadius - 0.25, BaseTop, false}, {0.0, BaseTop, false}};
	}
	std::vector<StampLathe::FProfilePoint> BaseBrass()
	{
		return {{BaseRadius - 0.03, 0.12, false}, {BaseRadius + 0.03, 0.12, false}, {BaseRadius + 0.03, 0.27, false}, {BaseRadius - 0.03, 0.27, false}};
	}
	std::vector<StampLathe::FProfilePoint> BaseInlay()
	{
		return {{0.0, BaseTop - 0.01, false}, {0.95, BaseTop - 0.01, false}, {0.95, BaseTop + 0.03, false}, {0.0, BaseTop + 0.03, false}};
	}
	/** 고리(토러스) 단면: 관 반지름 0.11 */
	std::vector<StampLathe::FProfilePoint> CollarRing()
	{
		std::vector<StampLathe::FProfilePoint> Out;
		const int Steps = 16;
		for (int I = 0; I <= Steps; ++I)
		{
			const double Phi = -UE_DOUBLE_PI / 2.0 + 2.0 * UE_DOUBLE_PI * I / Steps;
			Out.push_back({CollarRadius + 0.11 * FMath::Cos(Phi), 0.11 * FMath::Sin(Phi), true});
		}
		return Out;
	}
}

float AStampArm::ImpactTime()
{
	return ArmDetail::ImpactAt;
}

float AStampArm::TotalTime()
{
	return ArmDetail::EndAt;
}

AStampArm::AStampArm()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	auto MakeMesh = [this](const TCHAR* Name) -> UStaticMeshComponent*
	{
		UStaticMeshComponent* Comp = CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Comp->SetupAttachment(Root);
		Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		return Comp;
	};
	auto MakeProc = [this](const TCHAR* Name) -> UProceduralMeshComponent*
	{
		UProceduralMeshComponent* Comp = CreateDefaultSubobject<UProceduralMeshComponent>(Name);
		Comp->SetupAttachment(Root);
		Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		return Comp;
	};

	Base = MakeProc(TEXT("Base"));
	Post = MakeMesh(TEXT("Post"));
	Stub = MakeMesh(TEXT("Stub"));
	Shoulder = MakeMesh(TEXT("Shoulder"));
	Pin = MakeMesh(TEXT("Pin"));
	Rod1 = MakeMesh(TEXT("Rod1"));
	Elbow = MakeMesh(TEXT("Elbow"));
	Rod2 = MakeMesh(TEXT("Rod2"));
	Collar = MakeProc(TEXT("Collar"));
	Head = MakeProc(TEXT("Head"));
	PointerFwd = MakeMesh(TEXT("PointerFwd"));
	PointerSide = MakeMesh(TEXT("PointerSide"));
	PointerTip = MakeMesh(TEXT("PointerTip"));
}

void AStampArm::InitArm(double InStampDiameter)
{
	StampDiameter = InStampDiameter;
	HeadScale = StampDiameter / 1.65;

	UMaterialInstanceDynamic* Wood = StampAssets::MakeMaterial(this, TEXT("M_Wood"), StampOmok::Srgb(126, 82, 46));
	UMaterialInstanceDynamic* Brass = StampAssets::MakeMaterial(this, TEXT("M_Brass"), StampOmok::Srgb(201, 163, 92));
	LacquerMid = StampAssets::MakeMaterial(this, TEXT("M_Lacquer"), StampOmok::PlayerLook(0).Lacquer);
	InkMid = StampAssets::MakeMaterial(this, TEXT("M_Lacquer"), StampOmok::PlayerLook(0).Ink);

	StampMeshUtil::BuildLathe(Base, 0, ArmDetail::BaseWood(), 48);
	StampMeshUtil::BuildLathe(Base, 1, ArmDetail::BaseBrass(), 48);
	StampMeshUtil::BuildLathe(Base, 2, ArmDetail::BaseInlay(), 48);
	Base->SetMaterial(0, Wood);
	Base->SetMaterial(1, Brass);
	Base->SetMaterial(2, LacquerMid);

	StampMeshUtil::BuildLathe(Head, 0, ArmDetail::HeadBody(), 40);
	StampMeshUtil::BuildLathe(Head, 1, ArmDetail::HeadBand(), 40);
	StampMeshUtil::BuildLathe(Head, 2, ArmDetail::HeadFace(), 40);
	Head->SetMaterial(0, Wood);
	Head->SetMaterial(1, LacquerMid);
	Head->SetMaterial(2, InkMid);
	Head->SetRelativeScale3D(FVector(HeadScale));

	StampMeshUtil::BuildLathe(Collar, 0, ArmDetail::CollarRing(), 40);
	Collar->SetMaterial(0, Brass);
	Collar->SetRelativeScale3D(FVector(HeadScale, HeadScale, 1.0));

	UStaticMesh* Cylinder = StampAssets::EngineShape(TEXT("Cylinder"));
	UStaticMesh* Sphere = StampAssets::EngineShape(TEXT("Sphere"));
	UStaticMesh* Cone = StampAssets::EngineShape(TEXT("Cone"));
	for (UStaticMeshComponent* Comp : {Post.Get(), Stub.Get(), Pin.Get(), Rod1.Get(), Rod2.Get(), PointerFwd.Get(), PointerSide.Get()})
	{
		Comp->SetStaticMesh(Cylinder);
		Comp->SetMaterial(0, Brass);
	}
	for (UStaticMeshComponent* Comp : {Shoulder.Get(), Elbow.Get()})
	{
		Comp->SetStaticMesh(Sphere);
		Comp->SetMaterial(0, Brass);
		Comp->SetRelativeScale3D(FVector(ArmDetail::JointRadius * 2.0 / 100.0));
	}
	PointerTip->SetStaticMesh(Cone);
	PointerTip->SetMaterial(0, Brass);

	HideArm();
}

void AStampArm::SetPlayerColors(int32 Player)
{
	const StampOmok::FPlayerLook& Look = StampOmok::PlayerLook(Player);
	if (LacquerMid)
	{
		LacquerMid->SetVectorParameterValue(TEXT("Color"), Look.Lacquer);
		LacquerMid->SetVectorParameterValue(TEXT("Tint"), Look.Lacquer);
	}
	if (InkMid)
	{
		InkMid->SetVectorParameterValue(TEXT("Color"), Look.Ink);
		InkMid->SetVectorParameterValue(TEXT("Tint"), Look.Ink);
	}
}

void AStampArm::ShowAt(const StampRules::FVec2& Anchor, StampRules::EBend Bend, int32 Player)
{
	AnchorPos = Anchor;
	BendDir = Bend;
	ElbowPos = Anchor;
	TargetPos = Anchor;
	SetPlayerColors(Player);
	SetActorHiddenInGame(false);
	LayoutRest();
	ApplyPose(0.f);
}

void AStampArm::HideArm()
{
	bPlaying = false;
	SetActorHiddenInGame(true);
}

void AStampArm::PlayStamp(const StampRules::FArm& Arm, const StampRules::FVec2& Target, bool bBlocked,
	TFunction<void()> OnImpact, TFunction<void()> OnFinished)
{
	AnchorPos = Arm.Start;
	ElbowPos = Arm.Elbow;
	TargetPos = Target;
	bBlockedHit = bBlocked;
	bImpactFired = false;
	ImpactCallback = MoveTemp(OnImpact);
	FinishCallback = MoveTemp(OnFinished);
	Elapsed = 0.f;
	bPlaying = true;
	SetActorHiddenInGame(false);
	LayoutRest();
	ApplyPose(0.f);
}

void AStampArm::LayoutRest()
{
	using StampOmok::BoardToWorld;
	const StampRules::FVec2 BaseCenter{AnchorPos.X, AnchorPos.Y - ArmDetail::BaseBehind};
	const FVector BaseW = BoardToWorld(BaseCenter, StampOmok::PaperZ);
	const FVector ShoulderW = BoardToWorld(AnchorPos, ArmDetail::RodZ);

	Base->SetRelativeLocation(BaseW);
	StampMeshUtil::PlaceRod(Post, BaseW + FVector(0, 0, ArmDetail::BaseTop), FVector(BaseW.X, BaseW.Y, ArmDetail::RodZ), ArmDetail::PostRadius);
	StampMeshUtil::PlaceRod(Stub, FVector(BaseW.X, BaseW.Y, ArmDetail::RodZ), ShoulderW, ArmDetail::RodRadius);
	Shoulder->SetRelativeLocation(ShoulderW);
	StampMeshUtil::PlaceRod(Pin, BoardToWorld(AnchorPos, StampOmok::PaperZ + 0.05), BoardToWorld(AnchorPos, ArmDetail::RodZ), 0.035);

	// 받침 위 방향 표시: 길이는 고정이라 착지 거리를 드러내지 않는다
	const double Side = BendDir == StampRules::EBend::Right ? 1.0 : -1.0;
	const double Z = StampOmok::PaperZ + ArmDetail::BaseTop + 0.08;
	const StampRules::FVec2 P0{BaseCenter.X, BaseCenter.Y - 0.5};
	const StampRules::FVec2 P1{BaseCenter.X, BaseCenter.Y + 0.55};
	const StampRules::FVec2 P2{BaseCenter.X + Side * 0.55, BaseCenter.Y + 0.55};
	const StampRules::FVec2 P3{BaseCenter.X + Side * 0.9, BaseCenter.Y + 0.55};
	StampMeshUtil::PlaceRod(PointerFwd, BoardToWorld(P0, Z), BoardToWorld(P1, Z), 0.07);
	StampMeshUtil::PlaceRod(PointerSide, BoardToWorld(P1, Z), BoardToWorld(P2, Z), 0.07);
	// 엔진 원뿔: 높이 100, 꼭짓점이 +Z
	const FVector TipA = BoardToWorld(P2, Z);
	const FVector TipB = BoardToWorld(P3, Z);
	PointerTip->SetRelativeLocationAndRotation((TipA + TipB) * 0.5, FRotationMatrix::MakeFromZ((TipB - TipA).GetSafeNormal()).Rotator());
	PointerTip->SetRelativeScale3D(FVector(0.0034, 0.0034, 0.0035));
}

void AStampArm::ApplyPose(float T)
{
	using namespace ArmDetail;
	using StampOmok::BoardToWorld;

	const FVector ShoulderW = BoardToWorld(AnchorPos, RodZ);
	const FVector ElbowW = BoardToWorld(ElbowPos, RodZ);
	const FVector TargetW = BoardToWorld(TargetPos, RodZ);

	// 경로 위치 S: 0(어깨) → 1(팔꿈치) → 2(도장 자리)
	float S = 0.f;
	float FaceZ = static_cast<float>(HeadLift);
	float Squash = 1.f;
	double Shake = 0.0;
	if (bPlaying)
	{
		if (T < RetractAt)
		{
			S = EaseOut(Clamp01(T / Reach1)) + EaseOut(Clamp01((T - Reach1) / Reach2));
		}
		else
		{
			S = 2.f * (1.f - EaseInOut(Clamp01((T - RetractAt) / Retract)));
		}
		const float PressStart = Reach1 + Reach2 + Settle;
		const float Bottom = bBlockedHit ? static_cast<float>(BlockedStop) : StampOmok::PaperZ;
		if (T >= PressStart && T < ImpactAt)
		{
			FaceZ = FMath::Lerp(static_cast<float>(HeadLift), Bottom, EaseIn(Clamp01((T - PressStart) / Press)));
		}
		else if (T >= ImpactAt && T < ImpactAt + Hold)
		{
			FaceZ = Bottom;
		}
		else if (T >= ImpactAt + Hold && T < RetractAt)
		{
			FaceZ = FMath::Lerp(Bottom, static_cast<float>(HeadLift), EaseOut(Clamp01((T - ImpactAt - Hold) / Lift)));
		}
		if (T >= ImpactAt && T < ImpactAt + 0.12f && !bBlockedHit)
		{
			Squash = 1.f - 0.06f * (1.f - (T - ImpactAt) / 0.12f);
		}
		if (bBlockedHit && T >= ImpactAt && T < ImpactAt + 0.45f)
		{
			const float K = T - ImpactAt;
			Shake = FMath::Sin(K * 60.f) * 0.16 * (1.0 - K / 0.45);
		}
	}

	FVector Tip;
	if (S <= 1.f)
	{
		Tip = FMath::Lerp(ShoulderW, ElbowW, static_cast<double>(S));
	}
	else
	{
		Tip = FMath::Lerp(ElbowW, TargetW, static_cast<double>(S - 1.f));
	}
	Tip.Y += Shake;

	// 팔대는 고리 바깥 가장자리까지만 닿는다
	const double CollarR = CollarRadius * HeadScale;
	if (S <= 1.f)
	{
		const FVector Dir = (ElbowW - ShoulderW).GetSafeNormal();
		const FVector End = Tip - Dir * CollarR;
		const bool bLong = FVector::Dist(ShoulderW, Tip) > CollarR + 0.05;
		StampMeshUtil::PlaceRod(Rod1, ShoulderW, bLong ? End : ShoulderW, RodRadius);
		Rod2->SetVisibility(false);
		Elbow->SetVisibility(false);
	}
	else
	{
		StampMeshUtil::PlaceRod(Rod1, ShoulderW, ElbowW, RodRadius);
		const FVector Dir = (TargetW - ElbowW).GetSafeNormal();
		const bool bLong = FVector::Dist(ElbowW, Tip) > CollarR + 0.05;
		StampMeshUtil::PlaceRod(Rod2, ElbowW, bLong ? Tip - Dir * CollarR : ElbowW, RodRadius);
		Elbow->SetVisibility(true);
		Elbow->SetRelativeLocation(ElbowW);
	}

	Collar->SetRelativeLocation(FVector(Tip.X, Tip.Y, RodZ));
	Head->SetRelativeLocation(FVector(Tip.X, Tip.Y, FaceZ));
	Head->SetRelativeScale3D(FVector(HeadScale, HeadScale, HeadScale * Squash));
}

void AStampArm::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bPlaying)
	{
		return;
	}
	Elapsed += DeltaSeconds;
	ApplyPose(Elapsed);
	if (!bImpactFired && Elapsed >= ArmDetail::ImpactAt)
	{
		bImpactFired = true;
		if (ImpactCallback)
		{
			ImpactCallback();
		}
	}
	if (Elapsed >= ArmDetail::EndAt)
	{
		bPlaying = false;
		SetActorHiddenInGame(true);
		TFunction<void()> Done = MoveTemp(FinishCallback);
		if (Done)
		{
			Done();
		}
	}
}
