// 판 위 마우스 입력: 클릭 = 팔 기준점, 끌기 = 화면 이동, 휠 = 확대, 자 몸통·손잡이 끌기
#pragma once

#include "CoreMinimal.h"
#include "Core/StampRules.h"
#include "Widgets/SCompoundWidget.h"

class AStampOmokGameMode;
class AStampOmokPlayerController;

class SBoardInputLayer : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SBoardInputLayer) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AStampOmokGameMode>, GameMode)
		SLATE_ARGUMENT(TWeakObjectPtr<AStampOmokPlayerController>, PlayerController)
		SLATE_ARGUMENT(TWeakPtr<SWidget>, FocusTarget)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual FReply OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseMove(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseWheel(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FCursorReply OnCursorQuery(const FGeometry& MyGeometry, const FPointerEvent& CursorEvent) const override;
	virtual void OnMouseCaptureLost(const FCaptureLostEvent& CaptureLostEvent) override;
	virtual void OnMouseLeave(const FPointerEvent& MouseEvent) override;

private:
	enum class EDrag : uint8
	{
		None,
		Pending,     // 눌렀지만 아직 안 움직임 (떼면 클릭)
		Pan,
		Anchor,
		MoveRuler,
		RotateRuler
	};

	enum class EHover : uint8
	{
		None,
		Paper,
		Anchor,
		RulerBody,
		RulerHandle
	};

	FVector2D ToPixel(const FGeometry& Geometry, const FPointerEvent& Event) const;
	float PixelScale(const FGeometry& Geometry) const;
	EHover HitTest(const FVector2D& Pixel, float Scale, int32& OutHandle) const;
	void UpdateHover(const FVector2D& Pixel, float Scale);
	FReply TakeFocus(FReply Reply) const;

	TWeakObjectPtr<AStampOmokGameMode> GameMode;
	TWeakObjectPtr<AStampOmokPlayerController> PlayerController;
	TWeakPtr<SWidget> FocusTarget;

	EDrag Drag = EDrag::None;
	EHover Hover = EHover::None;
	FVector2D PressPixel = FVector2D::ZeroVector;
	FVector2D LastPixel = FVector2D::ZeroVector;
	StampRules::FVec2 GrabOffset;
	FKey PressedButton;
};
