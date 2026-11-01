// UI 색·글꼴·브러시
#include "UI/StampStyle.h"

#include "Brushes/SlateColorBrush.h"
#include "Brushes/SlateImageBrush.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Core/StampOmokTypes.h"
#include "HAL/FileManager.h"
#include "Misc/Paths.h"
#include "Styling/CoreStyle.h"

const FStampStyle& FStampStyle::Get()
{
	static FStampStyle Instance;
	return Instance;
}

FString FStampStyle::FontPath(const TCHAR* File) const
{
	const FString Path = FPaths::ProjectContentDir() / TEXT("Slate/Fonts") / File;
	return IFileManager::Get().FileExists(*Path) ? Path : FString();
}

FStampStyle::FStampStyle()
{
	using StampOmok::Srgb;
	Paper = Srgb(235, 230, 216);
	PaperDeep = Srgb(207, 199, 178);
	PaperInk = Srgb(43, 38, 32);
	PaperInkSoft = Srgb(106, 96, 82);
	Glaze = Srgb(46, 90, 80);
	GlazeDeep = Srgb(30, 61, 54);
	GlazeSoft = Srgb(68, 119, 106);
	Ivory = Srgb(244, 240, 230);
	IvoryDim = Srgb(191, 210, 200);
	Brass = Srgb(210, 173, 91);
	Shu = Srgb(200, 52, 31);
	ShuDark = Srgb(110, 38, 24);
	Ai = Srgb(43, 75, 140);
	AiDark = Srgb(27, 42, 77);
	AlertText = Srgb(255, 191, 174);
	Scrim = Srgb(16, 32, 28, 0.74f);
	Clear = FLinearColor(0.f, 0.f, 0.f, 0.f);

	DisplayFontFile = FontPath(TEXT("GowunBatang-Bold.ttf"));
	DisplayRegularFontFile = FontPath(TEXT("GowunBatang-Regular.ttf"));
	BodyFontFile = FontPath(TEXT("GowunDodum-Regular.ttf"));

	const FLinearColor White = FLinearColor::White;
	SolidBrush = MakeShared<FSlateColorBrush>(White);
	Round6 = MakeShared<FSlateRoundedBoxBrush>(White, 6.f);
	Round10 = MakeShared<FSlateRoundedBoxBrush>(White, 10.f);
	Round14 = MakeShared<FSlateRoundedBoxBrush>(White, 14.f);
	Round20 = MakeShared<FSlateRoundedBoxBrush>(White, 20.f);
	Pill = MakeShared<FSlateRoundedBoxBrush>(White, 999.f);
	CircleBrush = MakeShared<FSlateRoundedBoxBrush>(White, 999.f);

	const FString UiDir = FPaths::ProjectContentDir() / TEXT("Slate/StampOmok");
	PaperBrush = MakeShared<FSlateImageBrush>(UiDir / TEXT("UI_Paper.png"), FVector2D(512.0, 512.0), White, ESlateBrushTileType::Both);
	SealShuBrush = MakeShared<FSlateImageBrush>(UiDir / TEXT("UI_Seal_Shu.png"), FVector2D(512.0, 512.0));
	SealAiBrush = MakeShared<FSlateImageBrush>(UiDir / TEXT("UI_Seal_Ai.png"), FVector2D(512.0, 512.0));

	// 버튼: 흰 둥근 사각을 버튼 색으로 곱해 쓴다. 올리면 밝게, 누르면 어둡게
	ButtonNormal = MakeShared<FSlateRoundedBoxBrush>(FLinearColor(0.9f, 0.9f, 0.9f, 1.f), 12.f);
	ButtonHover = MakeShared<FSlateRoundedBoxBrush>(White, 12.f);
	ButtonPressed = MakeShared<FSlateRoundedBoxBrush>(FLinearColor(0.75f, 0.75f, 0.75f, 1.f), 12.f);
	ButtonDisabled = MakeShared<FSlateRoundedBoxBrush>(FLinearColor(0.6f, 0.6f, 0.6f, 0.45f), 12.f);
	ButtonStyle = FButtonStyle()
		.SetNormal(*ButtonNormal)
		.SetHovered(*ButtonHover)
		.SetPressed(*ButtonPressed)
		.SetDisabled(*ButtonDisabled)
		.SetNormalPadding(FMargin(0.f, 0.f, 0.f, 2.f))
		.SetPressedPadding(FMargin(0.f, 2.f, 0.f, 0.f));

	SliderBar = MakeShared<FSlateRoundedBoxBrush>(GlazeDeep, 3.f);
	SliderThumb = MakeShared<FSlateRoundedBoxBrush>(Ivory, 999.f, Brass, 3.f);
	SliderThumbHover = MakeShared<FSlateRoundedBoxBrush>(White, 999.f, Brass, 3.f);
	SliderThumb->ImageSize = FVector2D(24.0, 24.0);
	SliderThumbHover->ImageSize = FVector2D(26.0, 26.0);
	SliderStyle = FSliderStyle()
		.SetNormalBarImage(*SliderBar)
		.SetHoveredBarImage(*SliderBar)
		.SetDisabledBarImage(*SliderBar)
		.SetNormalThumbImage(*SliderThumb)
		.SetHoveredThumbImage(*SliderThumbHover)
		.SetDisabledThumbImage(*SliderThumb)
		.SetBarThickness(6.f);
}

const FSlateBrush* FStampStyle::Round(int32 Radius) const
{
	if (Radius >= 999)
	{
		return Pill.Get();
	}
	if (Radius >= 20)
	{
		return Round20.Get();
	}
	if (Radius >= 14)
	{
		return Round14.Get();
	}
	if (Radius >= 10)
	{
		return Round10.Get();
	}
	return Round6.Get();
}

FSlateFontInfo FStampStyle::Display(float Size) const
{
	return DisplayFontFile.IsEmpty() ? FCoreStyle::GetDefaultFontStyle("Bold", Size) : FSlateFontInfo(DisplayFontFile, Size);
}

FSlateFontInfo FStampStyle::DisplayRegular(float Size) const
{
	return DisplayRegularFontFile.IsEmpty() ? FCoreStyle::GetDefaultFontStyle("Regular", Size) : FSlateFontInfo(DisplayRegularFontFile, Size);
}

FSlateFontInfo FStampStyle::Body(float Size) const
{
	return BodyFontFile.IsEmpty() ? FCoreStyle::GetDefaultFontStyle("Regular", Size) : FSlateFontInfo(BodyFontFile, Size);
}
