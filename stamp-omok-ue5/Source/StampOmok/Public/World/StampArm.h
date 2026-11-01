// 가상의 팔: 놋쇠와 나무로 된 도장 기계
//
//   [받침] ─ 어깨 마디(= 팔 기준점 바로 위) ─(위팔: 앞으로)→ 팔꿈치 ─(아래팔: 직각으로 좌/우)→ 도장
//
// 받침은 기준점보다 조금 뒤(−앞)에 놓여, 팔이 아무리 짧아도 도장이 받침 위에 찍히지 않는다.
#pragma once

#include "CoreMinimal.h"
#include "Core/StampRules.h"
#include "GameFramework/Actor.h"
#include "StampArm.generated.h"

class UProceduralMeshComponent;
class UStaticMeshComponent;
class UMaterialInstanceDynamic;

UCLASS()
class STAMPOMOK_API AStampArm : public AActor
{
	GENERATED_BODY()

public:
	AStampArm();

	virtual void Tick(float DeltaSeconds) override;

	/** 도장 지름(cm)에 맞춰 손잡이 크기를 정하고 메시를 만든다 */
	void InitArm(double InStampDiameter);

	/** 기준점에 쉬는 자세로 보인다 (차례의 주인 색) */
	void ShowAt(const StampRules::FVec2& Anchor, StampRules::EBend Bend, int32 Player);
	void HideArm();

	/** 팔을 뻗어 Target에 찍는다. 막혔으면 도장이 종이에 닿지 못하고 튕긴다 */
	void PlayStamp(const StampRules::FArm& Arm, const StampRules::FVec2& Target, bool bBlocked,
		TFunction<void()> OnImpact, TFunction<void()> OnFinished);

	bool IsPlaying() const { return bPlaying; }

	/** 놓기를 누른 뒤 도장이 종이에 닿기까지 걸리는 시간 (초) */
	static float ImpactTime();
	/** 팔이 다 접혀 사라지기까지 걸리는 시간 (초) */
	static float TotalTime();

private:
	void ApplyPose(float T);
	void SetPlayerColors(int32 Player);
	void LayoutRest();

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Base;      // 0 나무, 1 놋쇠 띠, 2 옻칠 상감

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Post;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Stub;          // 받침 기둥 → 어깨 마디

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Shoulder;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Pin;           // 기준점을 가리키는 바늘

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Rod1;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Elbow;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Rod2;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Collar;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> Head;      // 0 나무 몸통, 1 옻칠 띠, 2 인면

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> PointerFwd;    // 받침 위 방향 표시: 앞

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> PointerSide;   // 받침 위 방향 표시: 꺾임

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> PointerTip;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInstanceDynamic> LacquerMid;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInstanceDynamic> InkMid;

	StampRules::FVec2 AnchorPos;
	StampRules::FVec2 ElbowPos;
	StampRules::FVec2 TargetPos;
	StampRules::EBend BendDir = StampRules::EBend::Right;
	double StampDiameter = 1.65;
	double HeadScale = 1.0;
	float Elapsed = 0.f;
	bool bPlaying = false;
	bool bBlockedHit = false;
	bool bImpactFired = false;
	TFunction<void()> ImpactCallback;
	TFunction<void()> FinishCallback;
};
