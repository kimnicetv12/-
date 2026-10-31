// 자: 반투명 청자빛 아크릴 막대 + 가운데 선 + 허용 오차 띠 + 양 끝 놋쇠 손잡이
#pragma once

#include "CoreMinimal.h"
#include "Core/StampRules.h"
#include "GameFramework/Actor.h"
#include "StampRuler.generated.h"

class UStaticMeshComponent;
class UProceduralMeshComponent;
class UMaterialInstanceDynamic;

UCLASS()
class STAMPOMOK_API AStampRuler : public AActor
{
	GENERATED_BODY()

public:
	AStampRuler();

	/** 도장 지름(cm), 자 길이·폭(D), 허용 오차(D)로 모양을 만든다 */
	void InitRuler(double InStampDiameter, double LengthD, double WidthD, double ToleranceD);

	/** 허용 오차가 바뀌면 띠 폭만 다시 맞춘다 */
	void SetTolerance(double ToleranceD);

	void ShowRuler(bool bVisible);

	/** 중심(보드 좌표)과 각도(보드 +X 기준 반시계, 도) */
	void SetPose(const StampRules::FVec2& Center, double AngleDeg);

	/** 손잡이 강조 (마우스가 올라가거나 끄는 중) */
	void SetHandleHighlight(int32 HandleIndex);

	/** 양 끝 손잡이 위치 (보드 좌표) */
	void GetEnds(StampRules::FVec2& OutA, StampRules::FVec2& OutB) const;

	double GetHalfLength() const { return HalfLength; }
	double GetHalfWidth() const { return HalfWidth; }

private:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Pivot;       // 위치·회전이 걸리는 곳

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Body;

	/** 눈금 (도장 반 개마다, 위·아래 가장자리) */
	UPROPERTY(Transient)
	TArray<TObjectPtr<UStaticMeshComponent>> TickMarks;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> CenterLine;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Band;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> KnobA;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UProceduralMeshComponent> KnobB;

	StampRules::FVec2 CenterPos;
	double AngleDegrees = 0.0;
	double StampDiameter = 1.65;
	double HalfLength = 7.4;
	double HalfWidth = 1.07;
	int32 Highlighted = -1;
};
