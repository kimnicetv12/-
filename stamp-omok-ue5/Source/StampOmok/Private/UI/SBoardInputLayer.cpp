// 판 위 마우스 입력
#include "UI/SBoardInputLayer.h"

#include "Core/StampAssets.h"
#include "Core/StampOmokTypes.h"
#include "Game/StampCameraRig.h"
#include "Game/StampOmokGameMode.h"
#include "Game/StampOmokPlayerController.h"
#include "Widgets/SNullWidget.h"
#include "World/StampRuler.h"

namespace InputDetail
{
	constexpr float DragThresholdPx = 6.f;
	constexpr float AnchorGrabPx = 28.f;
	constexpr float HandleGrabPx = 30.f;
	constexpr float RulerBodyMinPx = 22.f;
}

void SBoardInputLayer::Construct(const FArguments& InArgs)
{
	GameMode = InArgs._GameMode;
	PlayerController = InArgs._PlayerController;
	FocusTarget = InArgs._FocusTarget;
	ChildSlot[SNullWidget::NullWidget];
}

FVector2D SBoardInputLayer::ToPixel(const FGeometry& Geometry, const FPointerEvent& Event) const
{
	const FVector2D Local = Geometry.AbsoluteToLocal(Event.GetScreenSpacePosition());
	const FVector2D Size = Geometry.GetLocalSize();
	const AStampOmokPlayerController* PC = PlayerController.Get();
	const FVector2D Viewport = PC ? PC->GetViewportSizePx() : Size;
	return FVector2D(Local.X / FMath::Max(Size.X, 1.0) * Viewport.X, Local.Y / FMath::Max(Size.Y, 1.0) * Viewport.Y);
}

float SBoardInputLayer::PixelScale(const FGeometry& Geometry) const
{
	const FVector2D Size = Geometry.GetLocalSize();
	const AStampOmokPlayerController* PC = PlayerController.Get();
	return PC ? static_cast<float>(PC->GetViewportSizePx().X / FMath::Max(Size.X, 1.0)) : 1.f;
}

FReply SBoardInputLayer::TakeFocus(FReply Reply) const
{
	if (TSharedPtr<SWidget> Target = FocusTarget.Pin())
	{
		Reply.SetUserFocus(Target.ToSharedRef(), EFocusCause::Mouse);
	}
	return Reply;
}

SBoardInputLayer::EHover SBoardInputLayer::HitTest(const FVector2D& Pixel, float Scale, int32& OutHandle) const
{
	OutHandle = -1;
	AStampOmokGameMode* GM = GameMode.Get();
	AStampOmokPlayerController* PC = PlayerController.Get();
	if (!GM || !PC)
	{
		return EHover::None;
	}
	StampRules::FVec2 Board;
	if (!PC->PixelToBoard(Pixel, Board))
	{
		return EHover::None;
	}
	if (GM->GetPhase() == EStampPhase::Stamp && GM->HasAnchor())
	{
		FVector AnchorWorld;
		FVector2D AnchorPx;
		if (GM->TryGetAnchorWorld(AnchorWorld) && PC->BoardToPixel(StampOmok::WorldToBoard(AnchorWorld), StampOmok::PaperZ, AnchorPx)
			&& FVector2D::Distance(AnchorPx, Pixel) <= InputDetail::AnchorGrabPx * Scale)
		{
			return EHover::Anchor;
		}
	}
	if (GM->GetPhase() == EStampPhase::Ruler && GM->GetRuler())
	{
		StampRules::FVec2 EndA, EndB;
		GM->GetRuler()->GetEnds(EndA, EndB);
		const StampRules::FVec2 Ends[2] = {EndA, EndB};
		for (int32 I = 0; I < 2; ++I)
		{
			FVector2D EndPx;
			if (PC->BoardToPixel(Ends[I], StampOmok::PaperZ + 0.5, EndPx) && FVector2D::Distance(EndPx, Pixel) <= InputDetail::HandleGrabPx * Scale)
			{
				OutHandle = I;
				return EHover::RulerHandle;
			}
		}
		const StampRules::FProjection Q = StampRules::ProjectOnLine(Board, GM->GetRulerCenter(), FMath::DegreesToRadians(GM->GetRulerDeg()));
		// 자 폭이 화면에서 너무 얇으면 최소 폭만큼은 잡히게
		FVector2D CenterPx, SidePx;
		double MinHalf = GM->GetRuler()->GetHalfWidth();
		if (PC->BoardToPixel(GM->GetRulerCenter(), StampOmok::PaperZ, CenterPx)
			&& PC->BoardToPixel(StampRules::FVec2{GM->GetRulerCenter().X + 1.0, GM->GetRulerCenter().Y}, StampOmok::PaperZ, SidePx))
		{
			const double PxPerCm = FMath::Max(FVector2D::Distance(CenterPx, SidePx), 0.001);
			MinHalf = FMath::Max(MinHalf, InputDetail::RulerBodyMinPx * Scale / PxPerCm);
		}
		if (FMath::Abs(Q.T) <= GM->GetRuler()->GetHalfLength() && FMath::Abs(Q.D) <= MinHalf)
		{
			return EHover::RulerBody;
		}
	}
	return EHover::Paper;
}

void SBoardInputLayer::UpdateHover(const FVector2D& Pixel, float Scale)
{
	int32 Handle = -1;
	Hover = HitTest(Pixel, Scale, Handle);
	if (AStampOmokGameMode* GM = GameMode.Get())
	{
		if (AStampRuler* Ruler = GM->GetRuler())
		{
			if (Drag == EDrag::None)
			{
				Ruler->SetHandleHighlight(Handle);
			}
		}
	}
}

FReply SBoardInputLayer::OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	AStampOmokGameMode* GM = GameMode.Get();
	AStampOmokPlayerController* PC = PlayerController.Get();
	if (!GM || !PC)
	{
		return FReply::Unhandled();
	}
	const FVector2D Pixel = ToPixel(MyGeometry, MouseEvent);
	const float Scale = PixelScale(MyGeometry);
	PressPixel = Pixel;
	LastPixel = Pixel;
	PressedButton = MouseEvent.GetEffectingButton();

	if (PressedButton == EKeys::RightMouseButton || PressedButton == EKeys::MiddleMouseButton)
	{
		Drag = EDrag::Pan;
		return TakeFocus(FReply::Handled().CaptureMouse(SharedThis(this)));
	}
	if (PressedButton != EKeys::LeftMouseButton)
	{
		return FReply::Unhandled();
	}

	int32 Handle = -1;
	const EHover Hit = HitTest(Pixel, Scale, Handle);
	StampRules::FVec2 Board;
	const bool bOnPaper = PC->PixelToBoard(Pixel, Board);
	Drag = EDrag::Pending;
	if (Hit == EHover::Anchor && bOnPaper)
	{
		FVector AnchorWorld;
		GM->TryGetAnchorWorld(AnchorWorld);
		const StampRules::FVec2 A = StampOmok::WorldToBoard(AnchorWorld);
		GrabOffset = StampRules::FVec2{A.X - Board.X, A.Y - Board.Y};
		Drag = EDrag::Anchor;
	}
	else if (Hit == EHover::RulerHandle)
	{
		Drag = EDrag::RotateRuler;
		if (AStampRuler* Ruler = GM->GetRuler())
		{
			Ruler->SetHandleHighlight(Handle);
		}
	}
	else if (Hit == EHover::RulerBody && bOnPaper)
	{
		const StampRules::FVec2 C = GM->GetRulerCenter();
		GrabOffset = StampRules::FVec2{C.X - Board.X, C.Y - Board.Y};
		Drag = EDrag::MoveRuler;
	}
	return TakeFocus(FReply::Handled().CaptureMouse(SharedThis(this)));
}

FReply SBoardInputLayer::OnMouseMove(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	AStampOmokGameMode* GM = GameMode.Get();
	AStampOmokPlayerController* PC = PlayerController.Get();
	if (!GM || !PC)
	{
		return FReply::Unhandled();
	}
	const FVector2D Pixel = ToPixel(MyGeometry, MouseEvent);
	const float Scale = PixelScale(MyGeometry);
	if (!HasMouseCapture())
	{
		UpdateHover(Pixel, Scale);
		return FReply::Unhandled();
	}

	if (Drag == EDrag::Pending && FVector2D::Distance(Pixel, PressPixel) > InputDetail::DragThresholdPx * Scale)
	{
		Drag = EDrag::Pan;
	}

	StampRules::FVec2 Board;
	const bool bOnPaper = PC->PixelToBoard(Pixel, Board);
	switch (Drag)
	{
	case EDrag::Pan:
	{
		// 같은 카메라로 직전·현재 픽셀을 한지에 비춰 그 차이만큼 옮긴다 → 커서 밑 종이가 따라온다
		StampRules::FVec2 Prev;
		if (bOnPaper && PC->PixelToBoard(LastPixel, Prev))
		{
			if (AStampCameraRig* Rig = GM->GetCameraRig())
			{
				const FVector Delta = StampOmok::BoardToWorld(Prev) - StampOmok::BoardToWorld(Board);
				Rig->PanBy(FVector2D(Delta.X, Delta.Y));
			}
		}
		break;
	}
	case EDrag::Anchor:
		if (bOnPaper)
		{
			GM->SetAnchor(StampRules::FVec2{Board.X + GrabOffset.X, Board.Y + GrabOffset.Y});
		}
		break;
	case EDrag::MoveRuler:
		if (bOnPaper)
		{
			GM->MoveRuler(StampRules::FVec2{Board.X + GrabOffset.X, Board.Y + GrabOffset.Y});
		}
		break;
	case EDrag::RotateRuler:
		if (bOnPaper)
		{
			const StampRules::FVec2 C = GM->GetRulerCenter();
			const double Deg = FMath::RadiansToDegrees(FMath::Atan2(Board.Y - C.Y, Board.X - C.X));
			GM->SetRulerDeg(Deg);
		}
		break;
	default:
		break;
	}
	LastPixel = Pixel;
	return FReply::Handled();
}

FReply SBoardInputLayer::OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (!HasMouseCapture() || MouseEvent.GetEffectingButton() != PressedButton)
	{
		return FReply::Unhandled();
	}
	AStampOmokGameMode* GM = GameMode.Get();
	AStampOmokPlayerController* PC = PlayerController.Get();
	const FVector2D Pixel = ToPixel(MyGeometry, MouseEvent);
	if (GM && PC && Drag == EDrag::Pending && PressedButton == EKeys::LeftMouseButton && GM->GetPhase() == EStampPhase::Stamp)
	{
		StampRules::FVec2 Board;
		if (PC->PixelToBoard(Pixel, Board))
		{
			GM->SetAnchor(Board);
			StampAssets::PlaySfx(GM, TEXT("SFX_Tick"), 0.7f);
		}
	}
	Drag = EDrag::None;
	if (GM && GM->GetRuler())
	{
		GM->GetRuler()->SetHandleHighlight(-1);
	}
	UpdateHover(Pixel, PixelScale(MyGeometry));
	return FReply::Handled().ReleaseMouseCapture();
}

FReply SBoardInputLayer::OnMouseWheel(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	AStampOmokGameMode* GM = GameMode.Get();
	AStampOmokPlayerController* PC = PlayerController.Get();
	if (!GM || !PC || !GM->GetCameraRig())
	{
		return FReply::Unhandled();
	}
	StampRules::FVec2 Board;
	FVector2D Toward(GM->GetCameraRig()->GetPose().Focus);
	if (PC->PixelToBoard(ToPixel(MyGeometry, MouseEvent), Board))
	{
		const FVector W = StampOmok::BoardToWorld(Board);
		Toward = FVector2D(W.X, W.Y);
	}
	const float Factor = FMath::Exp(-MouseEvent.GetWheelDelta() * 0.12f);
	GM->GetCameraRig()->ZoomBy(Factor, Toward);
	return FReply::Handled();
}

FCursorReply SBoardInputLayer::OnCursorQuery(const FGeometry& MyGeometry, const FPointerEvent& CursorEvent) const
{
	switch (Drag)
	{
	case EDrag::Pan:
	case EDrag::Anchor:
	case EDrag::MoveRuler:
	case EDrag::RotateRuler:
		return FCursorReply::Cursor(EMouseCursor::GrabHandClosed);
	default:
		break;
	}
	switch (Hover)
	{
	case EHover::Anchor:
	case EHover::RulerBody:
	case EHover::RulerHandle:
		return FCursorReply::Cursor(EMouseCursor::GrabHand);
	case EHover::Paper:
	{
		const AStampOmokGameMode* GM = GameMode.Get();
		return FCursorReply::Cursor(GM && GM->GetPhase() == EStampPhase::Stamp ? EMouseCursor::Crosshairs : EMouseCursor::Default);
	}
	default:
		return FCursorReply::Cursor(EMouseCursor::Default);
	}
}

void SBoardInputLayer::OnMouseCaptureLost(const FCaptureLostEvent& CaptureLostEvent)
{
	Drag = EDrag::None;
	if (AStampOmokGameMode* GM = GameMode.Get())
	{
		if (GM->GetRuler())
		{
			GM->GetRuler()->SetHandleHighlight(-1);
		}
	}
}

void SBoardInputLayer::OnMouseLeave(const FPointerEvent& MouseEvent)
{
	SCompoundWidget::OnMouseLeave(MouseEvent);
	if (Drag == EDrag::None)
	{
		Hover = EHover::None;
	}
}
