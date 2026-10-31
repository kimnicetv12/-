// UI 색·글꼴·브러시: 한지, 청자 유약, 인주, 놋쇠
#pragma once

#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"
#include "Styling/SlateBrush.h"
#include "Styling/SlateTypes.h"

class FStampStyle
{
public:
	static const FStampStyle& Get();

	// ── 색 (Slate는 선형 색을 받는다: sRGB 값은 Srgb()로 바꿔 둔다) ──
	FLinearColor Paper;
	FLinearColor PaperDeep;
	FLinearColor PaperInk;
	FLinearColor PaperInkSoft;
	FLinearColor Glaze;
	FLinearColor GlazeDeep;
	FLinearColor GlazeSoft;
	FLinearColor Ivory;
	FLinearColor IvoryDim;
	FLinearColor Brass;
	FLinearColor Shu;
	FLinearColor ShuDark;
	FLinearColor Ai;
	FLinearColor AiDark;
	FLinearColor AlertText;
	FLinearColor Scrim;
	FLinearColor Clear;

	// ── 글꼴: 고운바탕(제목) · 고운돋움(본문), 파일이 없으면 엔진 기본 글꼴 ──
	FSlateFontInfo Display(float Size) const;
	FSlateFontInfo DisplayRegular(float Size) const;
	FSlateFontInfo Body(float Size) const;

	// ── 브러시 (모두 흰색: 쓰는 곳에서 색을 곱한다) ──
	const FSlateBrush* Solid() const { return SolidBrush.Get(); }
	const FSlateBrush* Round(int32 Radius) const;   // 6, 10, 14, 20 → 둥근 사각, 999 → 알약
	const FSlateBrush* Circle() const { return CircleBrush.Get(); }
	const FSlateBrush* PaperTile() const { return PaperBrush.Get(); }
	const FSlateBrush* Seal(int32 Player) const { return Player == 1 ? SealAiBrush.Get() : SealShuBrush.Get(); }

	const FButtonStyle& Button() const { return ButtonStyle; }
	const FSliderStyle& Slider() const { return SliderStyle; }

	/** 플레이어 색 (UI용) */
	FLinearColor PlayerInk(int32 Player) const { return Player == 1 ? Ai : Shu; }
	FLinearColor PlayerInkDark(int32 Player) const { return Player == 1 ? AiDark : ShuDark; }

private:
	FStampStyle();

	FString FontPath(const TCHAR* File) const;

	TSharedPtr<FSlateBrush> SolidBrush;
	TSharedPtr<FSlateBrush> Round6;
	TSharedPtr<FSlateBrush> Round10;
	TSharedPtr<FSlateBrush> Round14;
	TSharedPtr<FSlateBrush> Round20;
	TSharedPtr<FSlateBrush> Pill;
	TSharedPtr<FSlateBrush> CircleBrush;
	TSharedPtr<FSlateBrush> PaperBrush;
	TSharedPtr<FSlateBrush> SealShuBrush;
	TSharedPtr<FSlateBrush> SealAiBrush;
	TSharedPtr<FSlateBrush> ButtonNormal;
	TSharedPtr<FSlateBrush> ButtonHover;
	TSharedPtr<FSlateBrush> ButtonPressed;
	TSharedPtr<FSlateBrush> ButtonDisabled;
	TSharedPtr<FSlateBrush> SliderBar;
	TSharedPtr<FSlateBrush> SliderThumb;
	TSharedPtr<FSlateBrush> SliderThumbHover;
	FButtonStyle ButtonStyle;
	FSliderStyle SliderStyle;
	FString DisplayFontFile;
	FString DisplayRegularFontFile;
	FString BodyFontFile;
};
