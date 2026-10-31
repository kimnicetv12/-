// 마루 바닥 + 한지 + 찍힌 도장(데칼) + 판정 표시
#pragma once

#include "CoreMinimal.h"
#include "Core/StampRules.h"
#include "GameFramework/Actor.h"
#include "StampBoard.generated.h"

class UDecalComponent;
class UMaterialInstanceDynamic;
class UStaticMeshComponent;

UCLASS()
class STAMPOMOK_API AStampBoard : public AActor
{
	GENERATED_BODY()

public:
	AStampBoard();

	virtual void Tick(float DeltaSeconds) override;

	/** 도장 지름과 한지 크기(cm)로 판을 만든다 */
	void InitBoard(double InStampDiameter, double InPaperSize);

	double GetPaperSize() const { return PaperSize; }

	// ── 도장 ──
	void ClearStamps();
	/** 도장 하나를 찍는다. 판이 가려져 있으면 보이지 않는다 */
	void AddStamp(int32 Id, const StampRules::FVec2& P, int32 Player, float RotationDeg, int32 Variant);
	/** 판 공개 여부: 공개면 모든 도장이 보인다 */
	void SetRevealed(bool bInRevealed);
	/** 판이 가려진 채로 이 도장만 잠깐 보였다가 사라진다 */
	void FlashStamp(int32 Id, float Seconds);

	// ── 판정·안내 표시 (한지 바로 위에 뜨는 반투명 판) ──
	void ClearMarks();
	void AddRing(const StampRules::FVec2& P, double Radius, const FLinearColor& Color, float Opacity);
	void AddDisc(const StampRules::FVec2& P, double Radius, const FLinearColor& Color, float Opacity);
	void AddLine(const StampRules::FVec2& A, const StampRules::FVec2& B, double Width, const FLinearColor& Color, float Opacity);
	void AddCross(const StampRules::FVec2& P, double Size, const FLinearColor& Color, float Opacity);
	/** 판정 때 자를 따라 움직이는 빛 */
	void SetGlow(bool bVisible, const StampRules::FVec2& P = StampRules::FVec2(), double Radius = 1.0);

private:
	struct FStampVisual
	{
		int32 Id = 0;
		TObjectPtr<UDecalComponent> Decal = nullptr;          // 셋업 에셋이 있을 때: 한지에 스미는 데칼
		TObjectPtr<UStaticMeshComponent> Disc = nullptr;      // 없을 때: 납작한 원기둥
		TObjectPtr<UMaterialInstanceDynamic> Mid = nullptr;
		double BornTime = 0.0;
		double FlashUntil = -1.0;
		float FlashLength = 0.f;
	};

	UStaticMeshComponent* AcquireMark(const TCHAR* MaskName, const FLinearColor& Color, float Opacity);
	void UpdateStampVisibility(FStampVisual& Visual, double Now) const;
	void SetStampOpacity(FStampVisual& Visual, float Opacity) const;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Floor;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Paper;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Glow;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UStaticMeshComponent>> MarkPool;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UMaterialInstanceDynamic>> MarkMids;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UObject>> KeepAlive;   // 런타임에 만든 데칼·MID를 GC에서 지킴

	TArray<FStampVisual> Stamps;
	int32 MarksUsed = 0;
	double StampDiameter = 1.65;
	double PaperSize = 105.6;
	bool bRevealed = false;
	bool bUseDecals = false;
};
