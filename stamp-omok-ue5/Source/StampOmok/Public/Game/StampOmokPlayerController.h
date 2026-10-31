// 마우스 커서를 보이고, Slate UI를 띄우고, 화면 픽셀 ↔ 한지 위 좌표를 바꾼다
#pragma once

#include "CoreMinimal.h"
#include "Core/StampRules.h"
#include "GameFramework/PlayerController.h"
#include "StampOmokPlayerController.generated.h"

class AStampOmokGameMode;
class SStampOmokHUD;

UCLASS()
class STAMPOMOK_API AStampOmokPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AStampOmokPlayerController();

	/** 게임 모드가 세계를 다 만든 뒤 부른다 */
	void InitStampUI(AStampOmokGameMode* GameMode);

	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	/** 뷰포트 픽셀 → 한지 윗면과 만나는 점(보드 좌표) */
	bool PixelToBoard(const FVector2D& Pixel, StampRules::FVec2& OutBoard) const;

	/** 보드 좌표(높이 Z) → 뷰포트 픽셀 */
	bool BoardToPixel(const StampRules::FVec2& Board, double Z, FVector2D& OutPixel) const;

	FVector2D GetViewportSizePx() const;

private:
	TSharedPtr<SStampOmokHUD> Hud;
};
