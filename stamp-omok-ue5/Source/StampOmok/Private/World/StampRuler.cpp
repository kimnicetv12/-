// 자
#include "World/StampRuler.h"

#include "Components/StaticMeshComponent.h"
#include "Core/StampAssets.h"
#include "Core/StampOmokTypes.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "World/StampMeshUtil.h"

namespace RulerDetail
{
	constexpr double Thickness = 0.22;   // 아크릴 두께 (cm)
	constexpr double Lift = 0.12;        // 종이에서 살짝 뜬 높이

	std::vector<StampLathe::FProfilePoint> Knob()
	{
		return {{0.0, 0.0, false}, {0.42, 0.0, false}, {0.42, 0.1, false}, {0.36, 0.22, true}, {0.3, 0.42, true},
			{0.36, 0.6, true}, {0.32, 0.72, true}, {0.18, 0.8, true}, {0.0, 0.82, false}};
	}
}

AStampRuler::AStampRuler()
{
	PrimaryActorTick.bCanEverTick = false;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	Pivot->SetupAttachment(Root);

	auto MakeMesh = [this](const TCHAR* Name) -> UStaticMeshComponent*
	{
		UStaticMeshComponent* Comp = CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Comp->SetupAttachment(Pivot);
		Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		return Comp;
	};
	Body = MakeMesh(TEXT("Body"));
	CenterLine = MakeMesh(TEXT("CenterLine"));
	Band = MakeMesh(TEXT("Band"));

	KnobA = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("KnobA"));
	KnobA->SetupAttachment(Pivot);
	KnobB = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("KnobB"));
	KnobB->SetupAttachment(Pivot);
}

void AStampRuler::InitRuler(double InStampDiameter, double LengthD, double WidthD, double ToleranceD)
{
	StampDiameter = InStampDiameter;
	HalfLength = LengthD * StampDiameter * 0.5;
	HalfWidth = WidthD * StampDiameter * 0.5;

	UStaticMesh* Cube = StampAssets::EngineShape(TEXT("Cube"));
	UStaticMesh* Plane = StampAssets::EngineShape(TEXT("Plane"));
	const double Top = StampOmok::PaperZ + RulerDetail::Lift + RulerDetail::Thickness;

	// 아크릴 몸체 (로컬 X = 자 방향)
	Body->SetStaticMesh(Cube);
	Body->SetRelativeLocation(FVector(0.0, 0.0, StampOmok::PaperZ + RulerDetail::Lift + RulerDetail::Thickness * 0.5));
	Body->SetRelativeScale3D(FVector(HalfLength * 2.0 / 100.0, HalfWidth * 2.0 / 100.0, RulerDetail::Thickness / 100.0));
	Body->SetMaterial(0, StampAssets::MakeMaterial(this, TEXT("M_Acrylic"), StampOmok::Srgb(169, 198, 183)));
	Body->SetCastShadow(true);

	// 눈금: 도장 반 개마다, 한 개마다 길게 (위·아래 가장자리)
	for (UStaticMeshComponent* Old : TickMarks)
	{
		if (Old)
		{
			Old->DestroyComponent();
		}
	}
	TickMarks.Reset();
	UMaterialInstanceDynamic* TickMid = StampAssets::MakeMaterial(this, TEXT("M_Overlay"), StampOmok::Srgb(30, 61, 54));
	if (TickMid)
	{
		TickMid->SetScalarParameterValue(TEXT("Opacity"), 0.85f);
		TickMid->SetTextureParameterValue(TEXT("Mask"), StampAssets::FindTexture(TEXT("T_Mask_Solid")));
	}
	const int32 HalfSteps = FMath::RoundToInt(HalfLength / (StampDiameter * 0.5));
	for (int32 K = -HalfSteps; K <= HalfSteps; ++K)
	{
		const bool bMajor = K % 2 == 0;
		const double X = K * StampDiameter * 0.5;
		const double Len = HalfWidth * (bMajor ? 0.42 : 0.24);
		for (const double Edge : {-1.0, 1.0})
		{
			UStaticMeshComponent* TickMark = NewObject<UStaticMeshComponent>(this);
			TickMark->SetupAttachment(Pivot);
			TickMark->SetStaticMesh(Plane);
			TickMark->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			TickMark->SetCastShadow(false);
			TickMark->SetMaterial(0, TickMid);
			StampMeshUtil::PlacePlane(TickMark, FVector(X, Edge * (HalfWidth - Len * 0.5), Top + 0.01), bMajor ? 0.07 : 0.045, Len, 0.f);
			TickMark->RegisterComponent();
			TickMarks.Add(TickMark);
		}
	}

	// 가운데 선 (판정 직선)
	CenterLine->SetStaticMesh(Plane);
	StampMeshUtil::PlacePlane(CenterLine, FVector(0.0, 0.0, Top + 0.02), HalfLength * 2.0, 0.05, 0.f);
	if (UMaterialInstanceDynamic* LineMid = StampAssets::MakeMaterial(this, TEXT("M_Overlay"), StampOmok::Srgb(150, 110, 40)))
	{
		LineMid->SetScalarParameterValue(TEXT("Opacity"), 0.95f);
		LineMid->SetTextureParameterValue(TEXT("Mask"), StampAssets::FindTexture(TEXT("T_Mask_Solid")));
		CenterLine->SetMaterial(0, LineMid);
	}
	CenterLine->SetCastShadow(false);

	// 허용 오차 띠: 종이 위에 놋쇠빛으로
	Band->SetStaticMesh(Plane);
	if (UMaterialInstanceDynamic* BandMid = StampAssets::MakeMaterial(this, TEXT("M_Overlay"), StampOmok::Srgb(210, 173, 91)))
	{
		BandMid->SetScalarParameterValue(TEXT("Opacity"), 0.32f);
		BandMid->SetTextureParameterValue(TEXT("Mask"), StampAssets::FindTexture(TEXT("T_Mask_Solid")));
		Band->SetMaterial(0, BandMid);
	}
	Band->SetCastShadow(false);
	SetTolerance(ToleranceD);

	// 양 끝 손잡이
	UMaterialInstanceDynamic* Brass = StampAssets::MakeMaterial(this, TEXT("M_Brass"), StampOmok::Srgb(201, 163, 92));
	for (UProceduralMeshComponent* Knob : {KnobA.Get(), KnobB.Get()})
	{
		StampMeshUtil::BuildLathe(Knob, 0, RulerDetail::Knob(), 32);
		Knob->SetMaterial(0, Brass);
		Knob->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
	KnobA->SetRelativeLocation(FVector(-HalfLength, 0.0, Top - 0.02));
	KnobB->SetRelativeLocation(FVector(HalfLength, 0.0, Top - 0.02));

	ShowRuler(false);
}

void AStampRuler::SetTolerance(double ToleranceD)
{
	const double Tol = ToleranceD * StampDiameter;
	StampMeshUtil::PlacePlane(Band, FVector(0.0, 0.0, StampOmok::PaperZ + 0.03), HalfLength * 2.0, Tol * 2.0, 0.f);
}

void AStampRuler::ShowRuler(bool bVisible)
{
	SetActorHiddenInGame(!bVisible);
}

void AStampRuler::SetPose(const StampRules::FVec2& Center, double AngleDeg)
{
	CenterPos = Center;
	AngleDegrees = AngleDeg;
	Pivot->SetRelativeLocationAndRotation(StampOmok::BoardToWorld(Center, 0.0),
		FRotator(0.f, StampOmok::BoardAngleToYaw(FMath::DegreesToRadians(AngleDeg)), 0.f));
}

void AStampRuler::SetHandleHighlight(int32 HandleIndex)
{
	if (HandleIndex == Highlighted)
	{
		return;
	}
	Highlighted = HandleIndex;
	KnobA->SetRelativeScale3D(FVector(HandleIndex == 0 ? 1.25 : 1.0));
	KnobB->SetRelativeScale3D(FVector(HandleIndex == 1 ? 1.25 : 1.0));
}

void AStampRuler::GetEnds(StampRules::FVec2& OutA, StampRules::FVec2& OutB) const
{
	const double A = FMath::DegreesToRadians(AngleDegrees);
	const double Ux = FMath::Cos(A) * HalfLength;
	const double Uy = FMath::Sin(A) * HalfLength;
	OutA = StampRules::FVec2{CenterPos.X - Ux, CenterPos.Y - Uy};
	OutB = StampRules::FVec2{CenterPos.X + Ux, CenterPos.Y + Uy};
}
