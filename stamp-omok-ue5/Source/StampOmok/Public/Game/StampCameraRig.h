// 판을 비스듬히 내려다보는 카메라: 끌어 이동, 휠 확대, 부드러운 이동, 흔들림, 메뉴 뒤 천천히 돌기
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StampCameraRig.generated.h"

class USpringArmComponent;
class UCameraComponent;

/** 플레이어별로 저장해 두는 카메라 자세 */
struct FStampCameraPose
{
	FVector2D Focus = FVector2D::ZeroVector;   // 월드 X, Y
	float Distance = 52.f;
};

UCLASS()
class STAMPOMOK_API AStampCameraRig : public AActor
{
	GENERATED_BODY()

public:
	AStampCameraRig();

	virtual void Tick(float DeltaSeconds) override;

	/** 한지 크기 안으로 초점을 가둔다 */
	void SetBounds(double HalfExtent) { BoundsHalf = HalfExtent; }

	FStampCameraPose GetPose() const;
	void SetPose(const FStampCameraPose& Pose, bool bSmooth);

	/** 초점 이동 (월드 cm) */
	void PanBy(const FVector2D& DeltaWorld);
	/** 확대: Factor < 1 이면 가까이. Toward 쪽(월드 XY)으로 조금 끌려간다 */
	void ZoomBy(float Factor, const FVector2D& Toward);
	/** 여러 점이 다 보이도록 맞춘다 */
	void FrameRegion(const FVector2D& Min, const FVector2D& Max);
	void Shake(float Strength);

	/** 메인 메뉴 뒤에서 천천히 좌우로 흔들리며 보기 */
	void SetAttractMode(bool bOn);

	void SetDepthOfField(bool bOn) { bDof = bOn; }

	float GetDistance() const { return Distance; }
	UCameraComponent* GetCamera() const { return Camera; }

private:
	void ApplyToComponents();
	void ClampFocus();

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USpringArmComponent> Arm;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> Camera;

	FVector2D Focus = FVector2D::ZeroVector;
	float Distance = 52.f;
	float Yaw = 0.f;
	float Pitch = -62.f;

	// 부드러운 이동
	bool bTweening = false;
	FVector2D TweenFromFocus = FVector2D::ZeroVector;
	FVector2D TweenToFocus = FVector2D::ZeroVector;
	float TweenFromDistance = 52.f;
	float TweenToDistance = 52.f;
	float TweenFromYaw = 0.f;
	float TweenTime = 0.f;
	float TweenLength = 0.45f;

	float ShakeAmount = 0.f;
	float Clock = 0.f;
	bool bAttract = false;
	bool bDof = true;
	double BoundsHalf = 50.0;
};
