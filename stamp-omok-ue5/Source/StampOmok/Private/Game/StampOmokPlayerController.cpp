// 플레이어 컨트롤러: 커서, UI, 좌표 변환
#include "Game/StampOmokPlayerController.h"

#include "Core/StampOmokTypes.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/StampOmokGameMode.h"
#include "UI/SStampOmokHUD.h"
#include "Widgets/SWindow.h"

AStampOmokPlayerController::AStampOmokPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = false;
	bEnableMouseOverEvents = false;
	// 폰이 없으므로 시점은 게임 모드가 정한 카메라 리그에 고정
	bAutoManageActiveCameraTarget = false;
}

void AStampOmokPlayerController::InitStampUI(AStampOmokGameMode* GameMode)
{
	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (Hud.IsValid() || !IsLocalController() || !Viewport)
	{
		return;
	}
	Hud = SNew(SStampOmokHUD)
		.GameMode(GameMode)
		.PlayerController(this);
	Viewport->AddViewportWidgetContent(Hud.ToSharedRef(), 10);

	FInputModeUIOnly Mode;
	Mode.SetWidgetToFocus(Hud);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	bShowMouseCursor = true;

	if (!GIsEditor)
	{
		if (TSharedPtr<SWindow> Window = Viewport->GetWindow())
		{
			Window->SetTitle(FText::FromString(TEXT("도장오목")));
		}
	}
}

void AStampOmokPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	UGameViewportClient* Viewport = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (Hud.IsValid() && Viewport)
	{
		Viewport->RemoveViewportWidgetContent(Hud.ToSharedRef());
	}
	Hud.Reset();
	Super::EndPlay(EndPlayReason);
}

bool AStampOmokPlayerController::PixelToBoard(const FVector2D& Pixel, StampRules::FVec2& OutBoard) const
{
	FVector Origin, Direction;
	if (!DeprojectScreenPositionToWorld(static_cast<float>(Pixel.X), static_cast<float>(Pixel.Y), Origin, Direction))
	{
		return false;
	}
	if (Direction.Z > -1e-4)
	{
		return false;
	}
	const double T = (StampOmok::PaperZ - Origin.Z) / Direction.Z;
	OutBoard = StampOmok::WorldToBoard(Origin + Direction * T);
	return true;
}

bool AStampOmokPlayerController::BoardToPixel(const StampRules::FVec2& Board, double Z, FVector2D& OutPixel) const
{
	return ProjectWorldLocationToScreen(StampOmok::BoardToWorld(Board, Z), OutPixel, false);
}

FVector2D AStampOmokPlayerController::GetViewportSizePx() const
{
	int32 X = 0, Y = 0;
	GetViewportSize(X, Y);
	return FVector2D(FMath::Max(X, 1), FMath::Max(Y, 1));
}
