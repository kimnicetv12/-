// 판을 내려다보는 카메라
#include "Game/StampCameraRig.h"

#include "Camera/CameraComponent.h"
#include "Core/StampOmokSettings.h"
#include "GameFramework/SpringArmComponent.h"

namespace CameraDetail
{
	float EaseInOut(float K)
	{
		return K < 0.5f ? 4.f * K * K * K : 1.f - FMath::Pow(-2.f * K + 2.f, 3.f) / 2.f;
	}
}

AStampCameraRig::AStampCameraRig()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("Arm"));
	Arm->SetupAttachment(Root);
	Arm->bDoCollisionTest = false;
	Arm->bEnableCameraLag = false;
	Arm->bUsePawnControlRotation = false;
	Arm->bInheritPitch = false;
	Arm->bInheritYaw = false;
	Arm->bInheritRoll = false;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Arm, USpringArmComponent::SocketName);

	const UStampOmokSettings& S = UStampOmokSettings::Get();
	Pitch = S.CameraPitch;
	Distance = S.CameraDefaultDistance;
	Camera->SetFieldOfView(S.CameraFov);

	// 하얀 종이가 화면을 채우므로 자동 노출이 어둡게 잡지 않도록 보정
	FPostProcessSettings& PP = Camera->PostProcessSettings;
	PP.bOverride_AutoExposureBias = true;
	PP.AutoExposureBias = 1.4f;
	PP.bOverride_AutoExposureSpeedUp = true;
	PP.AutoExposureSpeedUp = 2.f;
	PP.bOverride_AutoExposureSpeedDown = true;
	PP.AutoExposureSpeedDown = 2.f;
	PP.bOverride_VignetteIntensity = true;
	PP.VignetteIntensity = 0.32f;
	PP.bOverride_BloomIntensity = true;
	PP.BloomIntensity = 0.35f;
	PP.bOverride_FilmGrainIntensity = true;
	PP.FilmGrainIntensity = 0.06f;
	PP.bOverride_SceneFringeIntensity = true;
	PP.SceneFringeIntensity = 0.15f;
	PP.bOverride_DepthOfFieldFstop = true;
	PP.DepthOfFieldFstop = 11.f;
	PP.bOverride_DepthOfFieldFocalDistance = true;
	PP.DepthOfFieldFocalDistance = Distance;
	Camera->PostProcessBlendWeight = 1.f;
}

void AStampCameraRig::ClampFocus()
{
	const double Limit = FMath::Max(0.0, BoundsHalf - 2.0);
	Focus.X = FMath::Clamp(Focus.X, -Limit, Limit);
	Focus.Y = FMath::Clamp(Focus.Y, -Limit, Limit);
	const UStampOmokSettings& S = UStampOmokSettings::Get();
	Distance = FMath::Clamp(Distance, S.CameraMinDistance, S.CameraMaxDistance);
}

FStampCameraPose AStampCameraRig::GetPose() const
{
	FStampCameraPose Pose;
	Pose.Focus = bTweening ? TweenToFocus : Focus;
	Pose.Distance = bTweening ? TweenToDistance : Distance;
	return Pose;
}

void AStampCameraRig::SetPose(const FStampCameraPose& Pose, bool bSmooth)
{
	if (bSmooth)
	{
		TweenFromFocus = Focus;
		TweenFromDistance = Distance;
		TweenFromYaw = Yaw;
		TweenToFocus = Pose.Focus;
		TweenToDistance = Pose.Distance;
		TweenTime = 0.f;
		bTweening = true;
	}
	else
	{
		bTweening = false;
		Focus = Pose.Focus;
		Distance = Pose.Distance;
		ClampFocus();
		ApplyToComponents();
	}
}

void AStampCameraRig::PanBy(const FVector2D& DeltaWorld)
{
	bTweening = false;
	Focus += DeltaWorld;
	ClampFocus();
	ApplyToComponents();
}

void AStampCameraRig::ZoomBy(float Factor, const FVector2D& Toward)
{
	bTweening = false;
	const float Before = Distance;
	Distance *= Factor;
	ClampFocus();
	// 커서 쪽으로 확대: 거리가 줄어든 비율만큼 초점을 커서 지점에 가깝게
	const float Actual = Distance / FMath::Max(Before, 0.001f);
	Focus = Toward + (Focus - Toward) * Actual;
	ClampFocus();
	ApplyToComponents();
}

void AStampCameraRig::FrameRegion(const FVector2D& Min, const FVector2D& Max)
{
	FStampCameraPose Pose;
	Pose.Focus = (Min + Max) * 0.5;
	const double Extent = FMath::Max(Max.X - Min.X, Max.Y - Min.Y) + 12.0;
	const float HalfFov = FMath::DegreesToRadians(Camera->FieldOfView * 0.5f);
	Pose.Distance = static_cast<float>(Extent * 0.62 / FMath::Tan(HalfFov));
	SetPose(Pose, true);
}

void AStampCameraRig::Shake(float Strength)
{
	ShakeAmount = FMath::Max(ShakeAmount, Strength);
}

void AStampCameraRig::SetAttractMode(bool bOn)
{
	bAttract = bOn;
	if (!bOn)
	{
		// 돌던 방향에서 정면으로 부드럽게 돌아온다
		SetPose(GetPose(), true);
	}
}

void AStampCameraRig::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;

	if (bTweening)
	{
		TweenTime += DeltaSeconds;
		const float K = CameraDetail::EaseInOut(FMath::Clamp(TweenTime / TweenLength, 0.f, 1.f));
		Focus = FMath::Lerp(TweenFromFocus, TweenToFocus, static_cast<double>(K));
		Distance = TweenFromDistance * FMath::Pow(TweenToDistance / FMath::Max(TweenFromDistance, 0.001f), K);
		if (!bAttract)
		{
			Yaw = FMath::Lerp(TweenFromYaw, 0.f, K);
		}
		if (K >= 1.f)
		{
			bTweening = false;
		}
		ClampFocus();
	}
	if (bAttract)
	{
		Yaw = 22.f * FMath::Sin(Clock * 0.11f);
	}
	ShakeAmount = FMath::Max(0.f, ShakeAmount - DeltaSeconds * 2.2f);
	ApplyToComponents();
}

void AStampCameraRig::ApplyToComponents()
{
	SetActorLocation(FVector(Focus.X, Focus.Y, 0.0));
	FRotator Rot(Pitch, Yaw, 0.f);
	if (ShakeAmount > 0.f)
	{
		const float S = ShakeAmount * ShakeAmount;
		Rot.Pitch += S * 0.6f * FMath::Sin(Clock * 71.f);
		Rot.Yaw += S * 0.4f * FMath::Sin(Clock * 53.f + 1.3f);
	}
	Arm->SetRelativeRotation(Rot);
	Arm->TargetArmLength = Distance;

	FPostProcessSettings& PP = Camera->PostProcessSettings;
	PP.DepthOfFieldFocalDistance = Distance;
	// 가까이 볼수록 조리개를 조여 판이 너무 흐려지지 않게
	const double Fstop = FMath::GetMappedRangeValueClamped(FVector2D(20.0, 120.0), FVector2D(16.0, 6.0), static_cast<double>(Distance));
	PP.DepthOfFieldFstop = bDof ? static_cast<float>(Fstop) : 64.f;
}
