// 도장오목 화면 전체 (Slate): 판 입력층, 상태판, 조작판, 알림, 턴 교체 가림막, 메뉴, 일시 정지, 게임 방법, 설정, 확인 대화상자
#pragma once

#include "CoreMinimal.h"
#include "Core/StampOmokTypes.h"
#include "Fonts/SlateFontInfo.h"
#include "Widgets/SCompoundWidget.h"

class AStampOmokGameMode;
class AStampOmokPlayerController;
struct FStampOptions;

class SStampOmokHUD : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SStampOmokHUD) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AStampOmokGameMode>, GameMode)
		SLATE_ARGUMENT(TWeakObjectPtr<AStampOmokPlayerController>, PlayerController)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual ~SStampOmokHUD() override;

	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual FReply OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	enum class EOverlay : uint8
	{
		Menu,
		Pause,
		Howto,
		Settings,
		Dialog
	};

	enum class EButtonKind : uint8
	{
		PlayerPrimary,   // 차례 주인의 인주 색
		Shu,             // 주홍 (메뉴)
		Ghost,           // 청자 바탕 위 테두리 버튼
		PaperGhost       // 한지 바탕 위 버튼
	};

	static FText Txt(const TCHAR* S);
	static FText Str(const FString& S);

	// ── 상태 ──
	AStampOmokGameMode* Game() const;
	EStampPhase Phase() const;
	int32 CurrentPlayer() const;
	bool IsOpen(EOverlay Overlay) const { return Overlays.Contains(Overlay); }
	bool IsTop(EOverlay Overlay) const { return Overlays.Num() > 0 && Overlays.Last() == Overlay; }
	void Open(EOverlay Overlay);
	void Close(EOverlay Overlay);
	bool IsBoardInteractive() const;
	bool IsHudVisible() const;

	// ── 행동 ──
	void StartNewGame();
	void ResumeFromMenu();
	void GoToMenu();
	void RequestRuler();
	void AskConfirm(const FText& Title, const FText& Body, const FText& Warning, const FText& Ok, TFunction<void()> OnOk);
	void ShowToast(const FText& Message, bool bWarning);
	void ChangeOptions(TFunctionRef<void(FStampOptions&)> Edit);
	void PlayClick() const;

	// ── 화면 조각 ──
	TSharedRef<SWidget> BuildHudLayer();
	TSharedRef<SWidget> BuildTurnPlate();
	TSharedRef<SWidget> BuildTopButtons();
	TSharedRef<SWidget> BuildDock();
	TSharedRef<SWidget> BuildTabs();
	TSharedRef<SWidget> BuildStampPane();
	TSharedRef<SWidget> BuildRulerPane();
	TSharedRef<SWidget> BuildResultPane();
	TSharedRef<SWidget> BuildOverPane();
	TSharedRef<SWidget> BuildScaleBar();
	TSharedRef<SWidget> BuildToast();
	TSharedRef<SWidget> BuildBanner();
	TSharedRef<SWidget> BuildHandoff();
	TSharedRef<SWidget> BuildMenu();
	TSharedRef<SWidget> BuildPause();
	TSharedRef<SWidget> BuildHowto();
	TSharedRef<SWidget> BuildSettings();
	TSharedRef<SWidget> BuildDialog();

	// ── 위젯 도우미 ──
	TSharedRef<SWidget> MakeButton(const TAttribute<FText>& Label, TFunction<void()> OnClick, EButtonKind Kind,
		const TAttribute<bool>& Enabled = TAttribute<bool>(true), float Height = 50.f, float FontSize = 18.f);
	TSharedRef<SWidget> MakeText(const TAttribute<FText>& Text, const FSlateFontInfo& Font, const TAttribute<FSlateColor>& Color, bool bWrap = false);
	TSharedRef<SWidget> MakeStepRow(TFunction<float()> GetNormalized, TFunction<void(float)> SetNormalized, TFunction<void()> Minus, TFunction<void()> Plus,
		const TAttribute<bool>& Enabled, bool bOnPaper);
	TSharedRef<SWidget> MakeSegment(const TArray<FText>& Labels, TFunction<int32()> GetIndex, TFunction<void(int32)> SetIndex, const TAttribute<bool>& Enabled);
	TSharedRef<SWidget> MakeToggleRow(const FText& Label, TFunction<bool()> Get, TFunction<void(bool)> Set);
	TSharedRef<SWidget> MakeSettingSlider(const FText& Label, TFunction<FText()> ValueText, float Min, float Max, float Step,
		TFunction<float()> Get, TFunction<void(float)> Set);
	FLinearColor ButtonFill(EButtonKind Kind) const;
	FLinearColor ButtonInk(EButtonKind Kind) const;

	TWeakObjectPtr<AStampOmokGameMode> GameMode;
	TWeakObjectPtr<AStampOmokPlayerController> PlayerController;
	TArray<EOverlay> Overlays;

	FText DialogTitle;
	FText DialogBody;
	FText DialogWarning;
	FText DialogOk;
	TFunction<void()> DialogOnOk;

	FText ToastText;
	bool bToastWarn = false;
	double ToastUntil = 0.0;
	double Clock = 0.0;
	TSharedPtr<SWidget> ToastWidget;

	float ScaleSegmentWidth = 40.f;
	int32 ScaleSegments = 1;

	FDelegateHandle ToastHandle;
};
