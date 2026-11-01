// 마루 위 오후 햇빛
#include "World/StampEnvironment.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Core/StampAssets.h"
#include "Core/StampOmokSettings.h"

namespace EnvironmentDetail
{
	// 해 높이·방향: 카메라 뒤(−X)에서 들어와 판 쪽(+X)으로 비스듬히 내려온다
	constexpr float SunPitch = -36.f;
	constexpr float SunYaw = 14.f;
}

AStampEnvironment::AStampEnvironment()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Sun = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Sun"));
	Sun->SetupAttachment(Root);
	Sun->SetMobility(EComponentMobility::Movable);
	Sun->SetRelativeRotation(FRotator(EnvironmentDetail::SunPitch, EnvironmentDetail::SunYaw, 0.f));
	Sun->Intensity = 7.5f;
	Sun->bUseTemperature = true;
	Sun->Temperature = 4600.f;          // 늦은 오후의 따뜻한 해
	Sun->LightSourceAngle = 0.8f;       // 문살 그림자가 살짝 번지도록
	Sun->bAtmosphereSunLight = true;

	SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
	SkyLight->SetupAttachment(Root);
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;
	SkyLight->bRealTimeCapture = true;
	SkyLight->Intensity = 1.2f;

	Atmosphere = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("Atmosphere"));
	Atmosphere->SetupAttachment(Root);

	Fog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("Fog"));
	Fog->SetupAttachment(Root);
	Fog->FogDensity = 0.004f;
	Fog->FogHeightFalloff = 0.2f;

	Lattice = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Lattice"));
	Lattice->SetupAttachment(Root);
	Lattice->SetMobility(EComponentMobility::Movable);
	Lattice->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Lattice->SetHiddenInGame(true);
	Lattice->bCastHiddenShadow = true;
	Lattice->CastShadow = true;
}

void AStampEnvironment::BeginPlay()
{
	Super::BeginPlay();
	BuildLattice();
	SetLatticeShadow(UStampOmokSettings::Get().bWindowLatticeShadow);
}

void AStampEnvironment::SetLatticeShadow(bool bEnabled)
{
	if (Lattice)
	{
		Lattice->SetCastShadow(bEnabled);
		Lattice->SetCastHiddenShadow(bEnabled);
	}
}

void AStampEnvironment::BuildLattice()
{
	if (!Lattice)
	{
		return;
	}
	Lattice->SetStaticMesh(StampAssets::EngineShape(TEXT("Cube")));
	Lattice->ClearInstances();

	// 해가 오는 쪽 수평 방향에 창을 세운다. 창 중심 높이 Hc의 빛이 판 가운데(원점)에 떨어지도록 거리 = Hc / tan(고도)
	const FVector LightDir = FRotator(EnvironmentDetail::SunPitch, EnvironmentDetail::SunYaw, 0.f).Vector();
	const FVector Horizontal = FVector(LightDir.X, LightDir.Y, 0.0).GetSafeNormal();
	const FVector Right = FVector(-Horizontal.Y, Horizontal.X, 0.0);
	const double Elevation = FMath::DegreesToRadians(-EnvironmentDetail::SunPitch);
	const double CenterHeight = 120.0;
	const FVector WindowBase = -Horizontal * (CenterHeight / FMath::Tan(Elevation));
	const FRotator Facing = FRotationMatrix::MakeFromXZ(Horizontal, FVector::UpVector).Rotator();

	auto AddBar = [&](double Across, double Height, double Width, double Tall, double Depth)
	{
		const FVector Pos = WindowBase + Right * Across + FVector::UpVector * Height;
		Lattice->AddInstance(FTransform(Facing, Pos, FVector(Depth / 100.0, Width / 100.0, Tall / 100.0)));
	};

	// 창 구멍: 가로 ±80, 높이 50 ~ 190 (cm)
	const double HalfW = 80.0, Bottom = 50.0, Top = 190.0;
	const double MidH = (Bottom + Top) * 0.5, OpenH = Top - Bottom;

	// 벽: 창 밖으로 햇빛을 막아 바닥에 창 모양 빛만 남긴다
	AddBar(-HalfW - 200.0, MidH, 400.0, 600.0, 6.0);
	AddBar(HalfW + 200.0, MidH, 400.0, 600.0, 6.0);
	AddBar(0.0, Top + 150.0, HalfW * 2.0 + 10.0, 300.0, 6.0);
	AddBar(0.0, Bottom - 150.0, HalfW * 2.0 + 10.0, 300.0, 6.0);

	// 문틀
	AddBar(-HalfW + 2.5, MidH, 5.0, OpenH, 4.0);
	AddBar(HalfW - 2.5, MidH, 5.0, OpenH, 4.0);
	AddBar(0.0, Top - 2.5, HalfW * 2.0, 5.0, 4.0);
	AddBar(0.0, Bottom + 2.5, HalfW * 2.0, 5.0, 4.0);
	AddBar(0.0, MidH, 4.0, OpenH, 4.0);   // 두 짝 사이 울거미

	// 띠살: 촘촘한 세로살 + 위·가운데·아래 가로 띠
	for (double X = -HalfW + 9.0; X < HalfW - 6.0; X += 6.5)
	{
		if (FMath::Abs(X) < 3.5)
		{
			continue;
		}
		AddBar(X, MidH, 1.1, OpenH, 2.0);
	}
	for (const double Band : {Top - 20.0, MidH, Bottom + 20.0})
	{
		for (int32 K = -1; K <= 1; ++K)
		{
			AddBar(0.0, Band + K * 2.6, HalfW * 2.0, 1.0, 2.0);
		}
	}
}
