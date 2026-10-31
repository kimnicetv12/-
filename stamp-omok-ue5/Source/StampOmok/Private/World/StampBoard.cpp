// 마루 바닥 + 한지 + 찍힌 도장 + 판정 표시
#include "World/StampBoard.h"

#include "Components/DecalComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Core/StampAssets.h"
#include "Core/StampOmokTypes.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "World/StampMeshUtil.h"

namespace BoardDetail
{
	constexpr float MarkZ = StampOmok::PaperZ + 0.05f;  // 표시판 높이 (한지 바로 위)
	constexpr float InkInSeconds = 0.16f;              // 인주가 종이에 옮겨지는 시간
	constexpr float FlashFadeSeconds = 0.45f;
}

AStampBoard::AStampBoard()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Floor = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Floor"));
	Floor->SetupAttachment(Root);
	Floor->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Paper = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Paper"));
	Paper->SetupAttachment(Root);
	Paper->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Glow = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Root);
	Glow->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Glow->SetCastShadow(false);
	Glow->SetVisibility(false);
}

void AStampBoard::InitBoard(double InStampDiameter, double InPaperSize)
{
	StampDiameter = InStampDiameter;
	PaperSize = InPaperSize;
	bUseDecals = StampAssets::FindMaterial(TEXT("MD_Ink")) != nullptr;

	// 마루: 6m 정사각, 윗면이 Z = 0
	Floor->SetStaticMesh(StampAssets::EngineShape(TEXT("Cube")));
	Floor->SetRelativeLocation(FVector(0.0, 0.0, -2.0));
	Floor->SetRelativeScale3D(FVector(6.0, 6.0, 0.04));
	if (UMaterialInstanceDynamic* MaruMid = StampAssets::MakeMaterial(this, TEXT("M_Maru"), StampOmok::Srgb(150, 104, 64)))
	{
		MaruMid->SetScalarParameterValue(TEXT("Tiling"), 4.f);   // 600cm에 4장 → 널 한 장 폭 약 19cm
		Floor->SetMaterial(0, MaruMid);
	}

	// 한지: 아주 얇은 상자 (가장자리가 살짝 보이도록)
	const double Thick = StampOmok::PaperZ;
	Paper->SetStaticMesh(StampAssets::EngineShape(TEXT("Cube")));
	Paper->SetRelativeLocation(FVector(0.0, 0.0, Thick * 0.5));
	Paper->SetRelativeScale3D(FVector(PaperSize / 100.0, PaperSize / 100.0, Thick / 100.0));
	if (UMaterialInstanceDynamic* PaperMid = StampAssets::MakeMaterial(this, TEXT("M_Hanji"), StampOmok::Srgb(236, 230, 214)))
	{
		PaperMid->SetScalarParameterValue(TEXT("Tiling"), static_cast<float>(PaperSize / 26.0));   // 텍스처 한 장 ≈ 26cm
		Paper->SetMaterial(0, PaperMid);
	}

	// 판 가운데 옅은 십자: 두 사람이 공유하는 유일한 인쇄 표시
	if (bUseDecals)
	{
		UDecalComponent* Cross = NewObject<UDecalComponent>(this, TEXT("OriginCross"));
		Cross->SetupAttachment(Root);
		Cross->DecalSize = FVector(1.0, StampDiameter * 0.45, StampDiameter * 0.45);
		Cross->SetRelativeLocationAndRotation(FVector(0.0, 0.0, StampOmok::PaperZ), FRotator(-90.f, 0.f, 0.f));
		UMaterialInstanceDynamic* CrossMid = UMaterialInstanceDynamic::Create(StampAssets::FindMaterial(TEXT("MD_Ink")), this);
		CrossMid->SetVectorParameterValue(TEXT("Color"), StampOmok::Srgb(60, 52, 42));
		CrossMid->SetScalarParameterValue(TEXT("Opacity"), 0.28f);
		CrossMid->SetTextureParameterValue(TEXT("Mask"), StampAssets::FindTexture(TEXT("T_Mask_Cross")));
		Cross->SetDecalMaterial(CrossMid);
		Cross->SetFadeScreenSize(0.f);
		Cross->RegisterComponent();
		KeepAlive.Add(Cross);
		KeepAlive.Add(CrossMid);
	}
	else
	{
		AddCross(StampRules::FVec2(), StampDiameter * 0.9, StampOmok::Srgb(60, 52, 42), 0.3f);
	}

	Glow->SetStaticMesh(StampAssets::EngineShape(TEXT("Plane")));
	if (UMaterialInstanceDynamic* GlowMid = StampAssets::MakeMaterial(this, TEXT("M_Overlay"), StampOmok::Srgb(240, 200, 110)))
	{
		GlowMid->SetScalarParameterValue(TEXT("Opacity"), 0.65f);
		GlowMid->SetTextureParameterValue(TEXT("Mask"), StampAssets::FindTexture(TEXT("T_Mask_Glow")));
		Glow->SetMaterial(0, GlowMid);
	}
}

void AStampBoard::ClearStamps()
{
	for (FStampVisual& Visual : Stamps)
	{
		if (Visual.Decal)
		{
			Visual.Decal->DestroyComponent();
		}
		if (Visual.Disc)
		{
			Visual.Disc->DestroyComponent();
		}
	}
	Stamps.Reset();
}

void AStampBoard::AddStamp(int32 Id, const StampRules::FVec2& P, int32 Player, float RotationDeg, int32 Variant)
{
	const StampOmok::FPlayerLook& Look = StampOmok::PlayerLook(Player);
	FStampVisual Visual;
	Visual.Id = Id;
	Visual.BornTime = GetWorld()->GetTimeSeconds();

	// 같은 인주라도 찍을 때마다 농도가 조금씩 다르다
	const float Shade = FMath::FRandRange(0.9f, 1.06f);
	const FLinearColor Ink = FLinearColor(Look.Ink.R * Shade, Look.Ink.G * Shade, Look.Ink.B * Shade, 1.f);
	const FVector Where = StampOmok::BoardToWorld(P);

	if (bUseDecals)
	{
		UDecalComponent* Decal = NewObject<UDecalComponent>(this);
		Decal->SetupAttachment(Root);
		Decal->DecalSize = FVector(1.0, StampDiameter * 0.5, StampDiameter * 0.5);
		// 데칼은 로컬 X 방향으로 투사: Pitch −90 이면 아래로, Roll 로 도장을 돌린다
		Decal->SetRelativeLocationAndRotation(Where, FRotator(-90.f, 0.f, RotationDeg));
		Decal->SetFadeScreenSize(0.f);
		Decal->SetSortOrder(10 + Id);
		UMaterialInstanceDynamic* Mid = UMaterialInstanceDynamic::Create(StampAssets::FindMaterial(TEXT("MD_Ink")), this);
		Mid->SetVectorParameterValue(TEXT("Color"), Ink);
		Mid->SetScalarParameterValue(TEXT("Opacity"), 0.f);
		const FString MaskName = FString::Printf(TEXT("T_Seal_%s_%d"), Look.SealKey, FMath::Clamp(Variant, 0, 2));
		Mid->SetTextureParameterValue(TEXT("Mask"), StampAssets::FindTexture(*MaskName));
		Decal->SetDecalMaterial(Mid);
		Decal->RegisterComponent();
		Visual.Decal = Decal;
		Visual.Mid = Mid;
		KeepAlive.Add(Decal);
		KeepAlive.Add(Mid);
	}
	else
	{
		UStaticMeshComponent* Disc = NewObject<UStaticMeshComponent>(this);
		Disc->SetupAttachment(Root);
		Disc->SetStaticMesh(StampAssets::EngineShape(TEXT("Cylinder")));
		Disc->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Disc->SetCastShadow(false);
		Disc->SetRelativeLocation(Where + FVector(0.0, 0.0, 0.01));
		Disc->SetRelativeScale3D(FVector(StampDiameter / 100.0, StampDiameter / 100.0, 0.0002));
		UMaterialInstanceDynamic* Mid = StampAssets::MakeMaterial(this, TEXT("__none__"), Ink);
		Disc->SetMaterial(0, Mid);
		Disc->RegisterComponent();
		Visual.Disc = Disc;
		Visual.Mid = Mid;
		KeepAlive.Add(Disc);
		KeepAlive.Add(Mid);
	}
	Stamps.Add(Visual);
	UpdateStampVisibility(Stamps.Last(), Visual.BornTime);
}

void AStampBoard::SetRevealed(bool bInRevealed)
{
	bRevealed = bInRevealed;
	const double Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	for (FStampVisual& Visual : Stamps)
	{
		UpdateStampVisibility(Visual, Now);
	}
}

void AStampBoard::FlashStamp(int32 Id, float Seconds)
{
	const double Now = GetWorld()->GetTimeSeconds();
	for (FStampVisual& Visual : Stamps)
	{
		if (Visual.Id == Id)
		{
			Visual.FlashUntil = Now + Seconds;
			Visual.FlashLength = Seconds;
			UpdateStampVisibility(Visual, Now);
		}
	}
}

void AStampBoard::SetStampOpacity(FStampVisual& Visual, float Opacity) const
{
	if (Visual.Decal)
	{
		Visual.Decal->SetVisibility(Opacity > 0.001f);
		if (Visual.Mid)
		{
			Visual.Mid->SetScalarParameterValue(TEXT("Opacity"), Opacity);
		}
	}
	if (Visual.Disc)
	{
		Visual.Disc->SetVisibility(Opacity > 0.5f);
	}
}

void AStampBoard::UpdateStampVisibility(FStampVisual& Visual, double Now) const
{
	// 인주가 옮겨지는 짧은 순간
	const float InkIn = FMath::Clamp(static_cast<float>((Now - Visual.BornTime) / BoardDetail::InkInSeconds), 0.f, 1.f);
	float Opacity = 0.f;
	if (bRevealed)
	{
		Opacity = InkIn;
	}
	else if (Now < Visual.FlashUntil)
	{
		const double Left = Visual.FlashUntil - Now;
		Opacity = InkIn * FMath::Clamp(static_cast<float>(Left / BoardDetail::FlashFadeSeconds), 0.f, 1.f);
	}
	SetStampOpacity(Visual, Opacity);
}

void AStampBoard::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const double Now = GetWorld()->GetTimeSeconds();
	for (FStampVisual& Visual : Stamps)
	{
		const bool bInking = Now - Visual.BornTime < BoardDetail::InkInSeconds + 0.05;
		const bool bFlashing = Visual.FlashUntil > 0.0 && Now < Visual.FlashUntil + 0.05;
		if (bInking || bFlashing)
		{
			UpdateStampVisibility(Visual, Now);
		}
	}
}

UStaticMeshComponent* AStampBoard::AcquireMark(const TCHAR* MaskName, const FLinearColor& Color, float Opacity)
{
	if (MarksUsed >= MarkPool.Num())
	{
		UStaticMeshComponent* Mark = NewObject<UStaticMeshComponent>(this);
		Mark->SetupAttachment(Root);
		Mark->SetStaticMesh(StampAssets::EngineShape(TEXT("Plane")));
		Mark->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Mark->SetCastShadow(false);
		UMaterialInstanceDynamic* Mid = StampAssets::MakeMaterial(this, TEXT("M_Overlay"), Color);
		Mark->SetMaterial(0, Mid);
		Mark->RegisterComponent();
		MarkPool.Add(Mark);
		MarkMids.Add(Mid);
	}
	UStaticMeshComponent* Mark = MarkPool[MarksUsed];
	UMaterialInstanceDynamic* Mid = MarkMids[MarksUsed];
	++MarksUsed;
	Mark->SetVisibility(true);
	Mark->SetTranslucentSortPriority(MarksUsed);
	if (Mid)
	{
		Mid->SetVectorParameterValue(TEXT("Color"), Color);
		Mid->SetScalarParameterValue(TEXT("Opacity"), Opacity);
		Mid->SetTextureParameterValue(TEXT("Mask"), StampAssets::FindTexture(MaskName));
	}
	return Mark;
}

void AStampBoard::ClearMarks()
{
	for (UStaticMeshComponent* Mark : MarkPool)
	{
		Mark->SetVisibility(false);
	}
	MarksUsed = 0;
}

void AStampBoard::AddRing(const StampRules::FVec2& P, double Radius, const FLinearColor& Color, float Opacity)
{
	UStaticMeshComponent* Mark = AcquireMark(TEXT("T_Mask_Ring"), Color, Opacity);
	// 링 텍스처의 고리 반지름은 한 변의 0.44배
	const double Size = Radius / 0.44;
	StampMeshUtil::PlacePlane(Mark, StampOmok::BoardToWorld(P, BoardDetail::MarkZ + MarksUsed * 0.002), Size, Size, 0.f);
}

void AStampBoard::AddDisc(const StampRules::FVec2& P, double Radius, const FLinearColor& Color, float Opacity)
{
	UStaticMeshComponent* Mark = AcquireMark(TEXT("T_Mask_Glow"), Color, Opacity);
	StampMeshUtil::PlacePlane(Mark, StampOmok::BoardToWorld(P, BoardDetail::MarkZ + MarksUsed * 0.002), Radius * 2.0, Radius * 2.0, 0.f);
}

void AStampBoard::AddLine(const StampRules::FVec2& A, const StampRules::FVec2& B, double Width, const FLinearColor& Color, float Opacity)
{
	const double Len = StampOmok::Dist(A, B);
	if (Len < 1e-3)
	{
		return;
	}
	UStaticMeshComponent* Mark = AcquireMark(TEXT("T_Mask_Solid"), Color, Opacity);
	const StampRules::FVec2 Mid{(A.X + B.X) * 0.5, (A.Y + B.Y) * 0.5};
	const double Angle = FMath::Atan2(B.Y - A.Y, B.X - A.X);
	StampMeshUtil::PlacePlane(Mark, StampOmok::BoardToWorld(Mid, BoardDetail::MarkZ + MarksUsed * 0.002), Len, Width, StampOmok::BoardAngleToYaw(Angle));
}

void AStampBoard::AddCross(const StampRules::FVec2& P, double Size, const FLinearColor& Color, float Opacity)
{
	UStaticMeshComponent* Mark = AcquireMark(TEXT("T_Mask_X"), Color, Opacity);
	StampMeshUtil::PlacePlane(Mark, StampOmok::BoardToWorld(P, BoardDetail::MarkZ + MarksUsed * 0.002), Size, Size, 0.f);
}

void AStampBoard::SetGlow(bool bVisible, const StampRules::FVec2& P, double Radius)
{
	Glow->SetVisibility(bVisible);
	if (bVisible)
	{
		StampMeshUtil::PlacePlane(Glow, StampOmok::BoardToWorld(P, BoardDetail::MarkZ + 0.2), Radius * 2.0, Radius * 2.0, 0.f);
	}
}
