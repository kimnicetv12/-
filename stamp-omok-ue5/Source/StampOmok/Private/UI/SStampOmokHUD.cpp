// 도장오목 화면 전체
#include "UI/SStampOmokHUD.h"

#include "Core/StampAssets.h"
#include "Core/StampOmokSettings.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/StampCameraRig.h"
#include "Game/StampOmokGameMode.h"
#include "Game/StampOmokPlayerController.h"
#include "Kismet/KismetSystemLibrary.h"
#include "UI/SBoardInputLayer.h"
#include "UI/StampStyle.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Layout/SBackgroundBlur.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Text/STextBlock.h"

namespace HudDetail
{
	/** 선수 이름 (주홍·쪽빛 모두 받침이 있어 뒤 조사는 은/이/을로 고정) */
	FString Name(int32 Player)
	{
		return StampOmok::PlayerLook(Player).Name.ToString();
	}
}

FText SStampOmokHUD::Txt(const TCHAR* S)
{
	return FText::FromString(FString(S));
}

FText SStampOmokHUD::Str(const FString& S)
{
	return FText::FromString(S);
}

// ───────────────────────────── 생성 ─────────────────────────────

void SStampOmokHUD::Construct(const FArguments& InArgs)
{
	GameMode = InArgs._GameMode;
	PlayerController = InArgs._PlayerController;
	Overlays.Add(EOverlay::Menu);

	if (AStampOmokGameMode* GM = Game())
	{
		ToastHandle = GM->OnToast.AddSP(this, &SStampOmokHUD::ShowToast);
	}

	TSharedRef<SBoardInputLayer> InputLayer = SNew(SBoardInputLayer)
		.GameMode(GameMode)
		.PlayerController(PlayerController)
		.FocusTarget(SharedThis(this));

	ChildSlot
	[
		SNew(SOverlay)
		.Visibility(EVisibility::SelfHitTestInvisible)

		+ SOverlay::Slot()
		[
			SNew(SBox)
			.Visibility_Lambda([this]() { return IsBoardInteractive() ? EVisibility::Visible : EVisibility::HitTestInvisible; })
			[
				InputLayer
			]
		]

		+ SOverlay::Slot()
		[
			BuildHudLayer()
		]

		+ SOverlay::Slot()
		[
			BuildHandoff()
		]

		+ SOverlay::Slot()
		[
			BuildPause()
		]

		+ SOverlay::Slot()
		[
			BuildMenu()
		]

		+ SOverlay::Slot()
		[
			BuildHowto()
		]

		+ SOverlay::Slot()
		[
			BuildSettings()
		]

		+ SOverlay::Slot()
		[
			BuildDialog()
		]
	];
}

SStampOmokHUD::~SStampOmokHUD()
{
	if (AStampOmokGameMode* GM = Game())
	{
		GM->OnToast.Remove(ToastHandle);
	}
}

// ───────────────────────────── 상태 ─────────────────────────────

AStampOmokGameMode* SStampOmokHUD::Game() const
{
	return GameMode.Get();
}

EStampPhase SStampOmokHUD::Phase() const
{
	const AStampOmokGameMode* GM = Game();
	return GM ? GM->GetPhase() : EStampPhase::Menu;
}

int32 SStampOmokHUD::CurrentPlayer() const
{
	const AStampOmokGameMode* GM = Game();
	return GM ? GM->GetCurrent() : 0;
}

void SStampOmokHUD::Open(EOverlay Overlay)
{
	Overlays.Remove(Overlay);
	Overlays.Add(Overlay);
}

void SStampOmokHUD::Close(EOverlay Overlay)
{
	Overlays.Remove(Overlay);
}

bool SStampOmokHUD::IsBoardInteractive() const
{
	if (Overlays.Num() > 0)
	{
		return false;
	}
	const EStampPhase P = Phase();
	return P != EStampPhase::Menu && P != EStampPhase::Handoff;
}

bool SStampOmokHUD::IsHudVisible() const
{
	const EStampPhase P = Phase();
	return P != EStampPhase::Menu && P != EStampPhase::Handoff && !IsOpen(EOverlay::Menu);
}

void SStampOmokHUD::PlayClick() const
{
	StampAssets::PlaySfx(Game(), TEXT("SFX_Tick"), 0.45f, 0.02f);
}

// ───────────────────────────── 행동 ─────────────────────────────

void SStampOmokHUD::StartNewGame()
{
	Overlays.Reset();
	if (AStampOmokGameMode* GM = Game())
	{
		GM->NewGame();
	}
}

void SStampOmokHUD::ResumeFromMenu()
{
	Close(EOverlay::Menu);
	Close(EOverlay::Pause);
}

void SStampOmokHUD::GoToMenu()
{
	Overlays.Reset();
	Overlays.Add(EOverlay::Menu);
	AStampOmokGameMode* GM = Game();
	if (GM && !GM->HasGameInProgress())
	{
		GM->ShowMainMenuBoard();
	}
}

void SStampOmokHUD::RequestRuler()
{
	AStampOmokGameMode* GM = Game();
	if (!GM || !GM->CanRequestRuler())
	{
		return;
	}
	const int32 Mine = GM->CountStamps(GM->GetCurrent());
	const int32 Need = GM->GetRulesConfig().WinCount;
	const FText Body = Str(FString::Printf(TEXT("이번 차례는 자 확인으로 끝나요. 판 위의 모든 도장이 두 사람 모두에게 보입니다.\n%s."),
		*GM->DescribePenalty().ToString()));
	const FText Warning = Mine < Need
		? Str(FString::Printf(TEXT("아직 내 도장이 %d개라 이번엔 이길 수 없어요. 판만 보고 차례를 넘기게 됩니다."), Mine))
		: FText::GetEmpty();
	TWeakObjectPtr<AStampOmokGameMode> Weak = GameMode;
	AskConfirm(Txt(TEXT("자를 대면 판이 공개됩니다")), Body, Warning, Txt(TEXT("자 대기")), [Weak]()
	{
		if (AStampOmokGameMode* G = Weak.Get())
		{
			G->BeginRuler();
		}
	});
}

void SStampOmokHUD::AskConfirm(const FText& Title, const FText& Body, const FText& Warning, const FText& Ok, TFunction<void()> OnOk)
{
	DialogTitle = Title;
	DialogBody = Body;
	DialogWarning = Warning;
	DialogOk = Ok;
	DialogOnOk = MoveTemp(OnOk);
	Open(EOverlay::Dialog);
}

void SStampOmokHUD::ShowToast(const FText& Message, bool bWarning)
{
	ToastText = Message;
	bToastWarn = bWarning;
	ToastUntil = Clock + 2.4;
}

void SStampOmokHUD::ChangeOptions(TFunctionRef<void(FStampOptions&)> Edit)
{
	if (AStampOmokGameMode* GM = Game())
	{
		FStampOptions Copy = GM->GetOptions();
		Edit(Copy);
		GM->ApplyOptions(Copy);
	}
}

// ───────────────────────────── 위젯 도우미 ─────────────────────────────

FLinearColor SStampOmokHUD::ButtonFill(EButtonKind Kind) const
{
	const FStampStyle& St = FStampStyle::Get();
	switch (Kind)
	{
	case EButtonKind::PlayerPrimary:
		return St.PlayerInk(CurrentPlayer());
	case EButtonKind::Shu:
		return St.Shu;
	case EButtonKind::Ghost:
		return St.GlazeSoft;
	case EButtonKind::PaperGhost:
	default:
		return St.PaperDeep;
	}
}

FLinearColor SStampOmokHUD::ButtonInk(EButtonKind Kind) const
{
	const FStampStyle& St = FStampStyle::Get();
	return Kind == EButtonKind::PaperGhost ? St.PaperInk : St.Ivory;
}

TSharedRef<SWidget> SStampOmokHUD::MakeButton(const TAttribute<FText>& Label, TFunction<void()> OnClick, EButtonKind Kind,
	const TAttribute<bool>& Enabled, float Height, float FontSize)
{
	const FStampStyle& St = FStampStyle::Get();
	const bool bStrong = Kind == EButtonKind::PlayerPrimary || Kind == EButtonKind::Shu;
	return SNew(SBox)
		.HeightOverride(Height)
		[
			SNew(SButton)
			.ButtonStyle(&St.Button())
			.IsFocusable(false)
			.IsEnabled(Enabled)
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			.ContentPadding(FMargin(16.f, 0.f))
			.ButtonColorAndOpacity_Lambda([this, Kind]() { return FSlateColor(ButtonFill(Kind)); })
			.OnClicked_Lambda([this, OnClick]()
			{
				PlayClick();
				if (OnClick)
				{
					OnClick();
				}
				return FReply::Handled();
			})
			[
				SNew(STextBlock)
				.Text(Label)
				.Font(bStrong ? St.Display(FontSize) : St.Body(FontSize))
				.ColorAndOpacity_Lambda([this, Kind]() { return FSlateColor(ButtonInk(Kind)); })
				.Justification(ETextJustify::Center)
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::MakeText(const TAttribute<FText>& Text, const FSlateFontInfo& Font, const TAttribute<FSlateColor>& Color, bool bWrap)
{
	return SNew(STextBlock)
		.Text(Text)
		.Font(Font)
		.ColorAndOpacity(Color)
		.AutoWrapText(bWrap);
}

TSharedRef<SWidget> SStampOmokHUD::MakeStepRow(TFunction<float()> GetNormalized, TFunction<void(float)> SetNormalized, TFunction<void()> Minus, TFunction<void()> Plus,
	const TAttribute<bool>& Enabled, bool bOnPaper)
{
	const FStampStyle& St = FStampStyle::Get();
	const EButtonKind Kind = bOnPaper ? EButtonKind::PaperGhost : EButtonKind::Ghost;
	return SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
		[
			SNew(SBox).WidthOverride(46.f)
			[
				MakeButton(Txt(TEXT("−")), Minus, Kind, Enabled, 40.f, 20.f)
			]
		]
		+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center).Padding(FMargin(10.f, 0.f))
		[
			SNew(SSlider)
			.Style(&St.Slider())
			.IsFocusable(false)
			.IsEnabled(Enabled)
			.Value_Lambda([GetNormalized]() { return GetNormalized ? GetNormalized() : 0.f; })
			.OnValueChanged_Lambda([SetNormalized](float V)
			{
				if (SetNormalized)
				{
					SetNormalized(V);
				}
			})
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
		[
			SNew(SBox).WidthOverride(46.f)
			[
				MakeButton(Txt(TEXT("+")), Plus, Kind, Enabled, 40.f, 20.f)
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::MakeSegment(const TArray<FText>& Labels, TFunction<int32()> GetIndex, TFunction<void(int32)> SetIndex, const TAttribute<bool>& Enabled)
{
	const FStampStyle& St = FStampStyle::Get();
	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
	for (int32 I = 0; I < Labels.Num(); ++I)
	{
		Row->AddSlot().FillWidth(1.f).Padding(FMargin(I == 0 ? 0.f : 3.f, 0.f, 0.f, 0.f))
		[
			SNew(SBox).HeightOverride(48.f)
			[
				SNew(SButton)
				.ButtonStyle(&St.Button())
				.IsFocusable(false)
				.IsEnabled(Enabled)
				.HAlign(HAlign_Center)
				.VAlign(VAlign_Center)
				.ButtonColorAndOpacity_Lambda([GetIndex, I]()
				{
					const FStampStyle& S = FStampStyle::Get();
					return FSlateColor(GetIndex && GetIndex() == I ? S.Ivory : S.GlazeDeep);
				})
				.OnClicked_Lambda([this, SetIndex, I]()
				{
					PlayClick();
					if (SetIndex)
					{
						SetIndex(I);
					}
					return FReply::Handled();
				})
				[
					SNew(STextBlock)
					.Text(Labels[I])
					.Font(St.Body(16.f))
					.Justification(ETextJustify::Center)
					.ColorAndOpacity_Lambda([GetIndex, I]()
					{
						const FStampStyle& S = FStampStyle::Get();
						return FSlateColor(GetIndex && GetIndex() == I ? S.GlazeDeep : S.IvoryDim);
					})
				]
			]
		];
	}
	return Row;
}

TSharedRef<SWidget> SStampOmokHUD::MakeToggleRow(const FText& Label, TFunction<bool()> Get, TFunction<void(bool)> Set)
{
	const FStampStyle& St = FStampStyle::Get();
	return SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
		[
			MakeText(Label, St.Body(17.f), St.Ivory)
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
		[
			SNew(SBox).WidthOverride(92.f).HeightOverride(38.f)
			[
				SNew(SButton)
				.ButtonStyle(&St.Button())
				.IsFocusable(false)
				.HAlign(HAlign_Center)
				.VAlign(VAlign_Center)
				.ButtonColorAndOpacity_Lambda([Get]()
				{
					const FStampStyle& S = FStampStyle::Get();
					return FSlateColor(Get && Get() ? S.Brass : S.GlazeDeep);
				})
				.OnClicked_Lambda([this, Get, Set]()
				{
					PlayClick();
					if (Get && Set)
					{
						Set(!Get());
					}
					return FReply::Handled();
				})
				[
					SNew(STextBlock)
					.Font(St.Body(15.f))
					.Text_Lambda([Get]() { return Get && Get() ? Txt(TEXT("켜짐")) : Txt(TEXT("꺼짐")); })
					.ColorAndOpacity_Lambda([Get]()
					{
						const FStampStyle& S = FStampStyle::Get();
						return FSlateColor(Get && Get() ? S.GlazeDeep : S.IvoryDim);
					})
				]
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::MakeSettingSlider(const FText& Label, TFunction<FText()> ValueText, float Min, float Max, float Step,
	TFunction<float()> Get, TFunction<void(float)> Set)
{
	const FStampStyle& St = FStampStyle::Get();
	auto Norm = [Min, Max, Get]() { return Get ? (Get() - Min) / FMath::Max(Max - Min, 0.0001f) : 0.f; };
	auto FromNorm = [Min, Max, Step, Set](float V)
	{
		const float Raw = Min + V * (Max - Min);
		const float Snapped = Step > 0.f ? FMath::RoundToFloat(Raw / Step) * Step : Raw;
		if (Set)
		{
			Set(FMath::Clamp(Snapped, Min, Max));
		}
	};
	return SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)
			[
				MakeText(Label, St.Body(17.f), St.Ivory)
			]
			+ SHorizontalBox::Slot().AutoWidth()
			[
				MakeText(TAttribute<FText>::CreateLambda([ValueText]() { return ValueText ? ValueText() : FText::GetEmpty(); }), St.Body(16.f), St.Brass)
			]
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 6.f, 0.f, 0.f))
		[
			MakeStepRow(Norm, FromNorm,
				[Get, Set, Step, Min, Max]() { if (Get && Set) { Set(FMath::Clamp(Get() - Step, Min, Max)); } },
				[Get, Set, Step, Min, Max]() { if (Get && Set) { Set(FMath::Clamp(Get() + Step, Min, Max)); } },
				TAttribute<bool>(true), false)
		];
}

// ───────────────────────────── 게임 화면 ─────────────────────────────

TSharedRef<SWidget> SStampOmokHUD::BuildHudLayer()
{
	return SNew(SOverlay)
		.Visibility_Lambda([this]() { return IsHudVisible() ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed; })

		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(FMargin(28.f, 24.f, 0.f, 0.f))
		[
			BuildTurnPlate()
		]

		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(FMargin(0.f, 24.f, 28.f, 0.f))
		[
			BuildTopButtons()
		]

		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(FMargin(0.f, 26.f, 0.f, 0.f))
		[
			SNew(SVerticalBox)
			.Visibility(EVisibility::SelfHitTestInvisible)
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
			[
				BuildBanner()
			]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(FMargin(0.f, 12.f, 0.f, 0.f))
			[
				BuildToast()
			]
		]

		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 28.f, 28.f))
		[
			BuildDock()
		]

		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(FMargin(28.f, 0.f, 0.f, 28.f))
		[
			BuildScaleBar()
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildTurnPlate()
{
	const FStampStyle& St = FStampStyle::Get();
	return SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SBorder)
			.BorderImage(St.Round(20))
			.BorderBackgroundColor(St.Glaze.CopyWithNewOpacity(0.94f))
			.Padding(FMargin(14.f, 12.f, 24.f, 12.f))
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					SNew(SBox).WidthOverride(58.f).HeightOverride(58.f)
					[
						SNew(SBorder)
						.BorderImage(St.Circle())
						.BorderBackgroundColor(St.Paper)
						.Padding(5.f)
						[
							SNew(SImage)
							.Image_Lambda([this]() { return FStampStyle::Get().Seal(CurrentPlayer()); })
						]
					]
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(FMargin(14.f, 0.f, 0.f, 0.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom)
						[
							MakeText(TAttribute<FText>::CreateLambda([this]() { return StampOmok::PlayerLook(CurrentPlayer()).Name; }), St.Display(30.f), St.Ivory)
						]
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom).Padding(FMargin(8.f, 0.f, 0.f, 4.f))
						[
							MakeText(Txt(TEXT("차례")), St.Body(16.f), St.IvoryDim)
						]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 2.f, 0.f, 0.f))
					[
						MakeText(TAttribute<FText>::CreateLambda([this]()
						{
							const AStampOmokGameMode* GM = Game();
							return GM ? Str(FString::Printf(TEXT("%d수 · 내 도장 %d개"), GM->GetMoveNo(), GM->CountStamps(GM->GetCurrent()))) : FText::GetEmpty();
						}), St.Body(15.f), St.IvoryDim)
					]
				]
			]
		]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Left).Padding(FMargin(4.f, 10.f, 0.f, 0.f))
		[
			SNew(SBorder)
			.BorderImage(St.Round(999))
			.BorderBackgroundColor_Lambda([this]()
			{
				const AStampOmokGameMode* GM = Game();
				const FStampStyle& S = FStampStyle::Get();
				return FSlateColor(GM && GM->IsRevealed() ? S.Brass : S.GlazeDeep.CopyWithNewOpacity(0.9f));
			})
			.Padding(FMargin(14.f, 6.f))
			[
				SNew(STextBlock)
				.Font(St.Body(14.f))
				.Text_Lambda([this]()
				{
					const AStampOmokGameMode* GM = Game();
					return GM && GM->IsRevealed() ? Txt(TEXT("판 공개 · 두 사람 모두 보세요")) : Txt(TEXT("판 가림 · 내 팔 기준점만 보여요"));
				})
				.ColorAndOpacity_Lambda([this]()
				{
					const AStampOmokGameMode* GM = Game();
					const FStampStyle& S = FStampStyle::Get();
					return FSlateColor(GM && GM->IsRevealed() ? S.GlazeDeep : S.Ivory);
				})
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildTopButtons()
{
	return SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth()
		[
			SNew(SBox).WidthOverride(150.f)
			[
				MakeButton(Txt(TEXT("가운데로  C")), [this]()
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->CenterCamera();
					}
				}, EButtonKind::Ghost, TAttribute<bool>(true), 44.f, 15.f)
			]
		]
		+ SHorizontalBox::Slot().AutoWidth().Padding(FMargin(8.f, 0.f, 0.f, 0.f))
		[
			SNew(SBox).WidthOverride(130.f)
			[
				MakeButton(Txt(TEXT("메뉴  Esc")), [this]() { Open(EOverlay::Pause); }, EButtonKind::Ghost, TAttribute<bool>(true), 44.f, 15.f)
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildDock()
{
	const FStampStyle& St = FStampStyle::Get();
	return SNew(SBox)
		.WidthOverride(430.f)
		[
			SNew(SBorder)
			.BorderImage(St.Round(20))
			.BorderBackgroundColor(St.Glaze.CopyWithNewOpacity(0.95f))
			.Padding(FMargin(18.f))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[
					BuildTabs()
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
				[
					BuildStampPane()
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
				[
					BuildRulerPane()
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
				[
					BuildResultPane()
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 6.f, 0.f, 0.f))
				[
					BuildOverPane()
				]
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildTabs()
{
	const FStampStyle& St = FStampStyle::Get();
	auto Tab = [this, &St](const FText& Label, TFunction<bool()> Selected, TFunction<bool()> Enabled, TFunction<FText()> Sub, TFunction<void()> OnClick) -> TSharedRef<SWidget>
	{
		return SNew(SBox).HeightOverride(52.f)
			[
				SNew(SButton)
				.ButtonStyle(&St.Button())
				.IsFocusable(false)
				.HAlign(HAlign_Center)
				.VAlign(VAlign_Center)
				.IsEnabled_Lambda([Enabled]() { return Enabled(); })
				.ButtonColorAndOpacity_Lambda([Selected]()
				{
					const FStampStyle& S = FStampStyle::Get();
					return FSlateColor(Selected() ? S.GlazeSoft : S.Clear);
				})
				.OnClicked_Lambda([this, OnClick]()
				{
					PlayClick();
					OnClick();
					return FReply::Handled();
				})
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						SNew(STextBlock)
						.Text(Label)
						.Font(St.Display(18.f))
						.ColorAndOpacity_Lambda([Selected]()
						{
							const FStampStyle& S = FStampStyle::Get();
							return FSlateColor(Selected() ? S.Ivory : S.IvoryDim);
						})
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						SNew(STextBlock)
						.Font(St.Body(12.f))
						.ColorAndOpacity(St.IvoryDim)
						.Text_Lambda([Sub]() { return Sub(); })
						.Visibility_Lambda([Sub]() { return Sub().IsEmpty() ? EVisibility::Collapsed : EVisibility::HitTestInvisible; })
					]
				]
			];
	};

	auto IsStampSide = [this]()
	{
		const EStampPhase P = Phase();
		return P == EStampPhase::Stamp || P == EStampPhase::Animating;
	};
	auto IsRulerSide = [this]()
	{
		const EStampPhase P = Phase();
		return P == EStampPhase::Ruler || P == EStampPhase::Judging || P == EStampPhase::Result;
	};

	return SNew(SBorder)
		.BorderImage(St.Round(14))
		.BorderBackgroundColor(St.GlazeDeep)
		.Padding(FMargin(4.f))
		.Visibility_Lambda([this]() { return Phase() == EStampPhase::Over ? EVisibility::Collapsed : EVisibility::Visible; })
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)
			[
				Tab(Txt(TEXT("도장 찍기")), IsStampSide, [this]() { return Phase() == EStampPhase::Stamp; }, []() { return FText::GetEmpty(); }, []() {})
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(4.f, 0.f, 0.f, 0.f))
			[
				Tab(Txt(TEXT("자 확인  R")), IsRulerSide,
					[this]()
					{
						const AStampOmokGameMode* GM = Game();
						return GM && GM->CanRequestRuler();
					},
					[this]()
					{
						const AStampOmokGameMode* GM = Game();
						const int32 Left = GM && Phase() == EStampPhase::Stamp ? GM->RulerBlockedLeft(GM->GetCurrent()) : 0;
						return Left > 0 ? Str(FString::Printf(TEXT("금지 · %d차례 남음"), Left)) : FText::GetEmpty();
					},
					[this]() { RequestRuler(); })
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildStampPane()
{
	const FStampStyle& St = FStampStyle::Get();
	auto CanEdit = TAttribute<bool>::CreateLambda([this]() { return Phase() == EStampPhase::Stamp; });
	auto ArmRange = [this](float& OutMin, float& OutMax)
	{
		OutMin = UStampOmokSettings::Get().ArmMinLength;
		OutMax = Game() ? Game()->GetOptions().ArmMaxLength : 12.f;
	};
	auto ArmLength = [this]() { return Game() ? Game()->GetSlot(CurrentPlayer()).ArmLength : 3.f; };
	auto Step = []() { return UStampOmokSettings::Get().ArmStep; };

	return SNew(SVerticalBox)
		.Visibility_Lambda([this]()
		{
			const EStampPhase P = Phase();
			return P == EStampPhase::Stamp || P == EStampPhase::Animating ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed;
		})

		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom)
			[
				MakeText(Txt(TEXT("팔 길이")), St.Display(18.f), St.Ivory)
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
			[
				MakeText(TAttribute<FText>::CreateLambda([ArmLength]() { return Str(FString::Printf(TEXT("%.1f"), ArmLength())); }), St.Display(30.f), St.Ivory)
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom).Padding(FMargin(6.f, 0.f, 0.f, 4.f))
			[
				MakeText(Txt(TEXT("도장 지름")), St.Body(13.f), St.IvoryDim)
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 0.f, 4.f))
			[
				MakeText(TAttribute<FText>::CreateLambda([this, ArmLength]()
				{
					const AStampOmokGameMode* GM = Game();
					if (!GM)
					{
						return FText::GetEmpty();
					}
					const float Split = UStampOmokSettings::Get().ArmSplit;
					const float L = ArmLength();
					const bool bLeft = GM->GetSlot(CurrentPlayer()).Bend == StampRules::EBend::Left;
					return Str(FString::Printf(TEXT("↑ %.2f  뒤  %s %.2f"), L * Split, bLeft ? TEXT("←") : TEXT("→"), L * (1.f - Split)));
				}), St.Body(15.f), St.IvoryDim)
			]
		]

		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 8.f, 0.f, 0.f))
		[
			MakeStepRow(
				[ArmRange, ArmLength]()
				{
					float Lo = 0.f, Hi = 1.f;
					ArmRange(Lo, Hi);
					return (ArmLength() - Lo) / FMath::Max(Hi - Lo, 0.01f);
				},
				[this, ArmRange](float V)
				{
					float Lo = 0.f, Hi = 1.f;
					ArmRange(Lo, Hi);
					if (AStampOmokGameMode* GM = Game())
					{
						GM->SetArmLength(Lo + V * (Hi - Lo));
					}
				},
				[this, Step]()
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->NudgeArm(-Step());
					}
				},
				[this, Step]()
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->NudgeArm(Step());
					}
				},
				CanEdit, false)
		]

		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 12.f, 0.f, 0.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.1f)
			[
				MakeSegment({Txt(TEXT("◀ 왼쪽  A")), Txt(TEXT("오른쪽 ▶  D"))},
					[this]() { return Game() && Game()->GetSlot(CurrentPlayer()).Bend == StampRules::EBend::Left ? 0 : 1; },
					[this](int32 Index)
					{
						if (AStampOmokGameMode* GM = Game())
						{
							GM->SetBend(Index == 0 ? StampRules::EBend::Left : StampRules::EBend::Right);
						}
					},
					CanEdit)
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
			[
				MakeButton(Txt(TEXT("놓기  Space")), [this]()
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->PlaceStamp();
					}
				}, EButtonKind::PlayerPrimary,
				TAttribute<bool>::CreateLambda([this]() { return Phase() == EStampPhase::Stamp && Game() && Game()->HasAnchor(); }), 48.f, 19.f)
			]
		]

		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 12.f, 0.f, 0.f))
		[
			MakeText(TAttribute<FText>::CreateLambda([this]()
			{
				const AStampOmokGameMode* GM = Game();
				if (Phase() == EStampPhase::Animating)
				{
					return Txt(TEXT("팔을 뻗는 중…"));
				}
				if (GM && GM->HasAnchor())
				{
					return Txt(TEXT("기준점을 끌어 옮길 수 있어요. W/S로 팔 길이, 준비되면 Space."));
				}
				return Txt(TEXT("한지를 클릭해 팔 기준점(어깨)을 정하세요. 오른쪽 끌기로 이동, 휠로 확대."));
			}), St.Body(14.f), St.IvoryDim, true)
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildRulerPane()
{
	const FStampStyle& St = FStampStyle::Get();
	auto CanEdit = TAttribute<bool>::CreateLambda([this]() { return Phase() == EStampPhase::Ruler; });
	return SNew(SVerticalBox)
		.Visibility_Lambda([this]()
		{
			const EStampPhase P = Phase();
			return P == EStampPhase::Ruler || P == EStampPhase::Judging ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed;
		})

		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom)
			[
				MakeText(Txt(TEXT("자 기울기")), St.Display(18.f), St.Ivory)
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
			[
				MakeText(TAttribute<FText>::CreateLambda([this]() { return Str(FString::Printf(TEXT("%.1f°"), Game() ? Game()->GetRulerDeg() : 0.0)); }), St.Display(30.f), St.Ivory)
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 0.f, 4.f))
			[
				MakeText(TAttribute<FText>::CreateLambda([this]()
				{
					const AStampOmokGameMode* GM = Game();
					return GM ? Str(FString::Printf(TEXT("허용 띠 안 내 도장 %d / %d"), GM->GetRulerCandidateCount(), GM->GetRulesConfig().WinCount)) : FText::GetEmpty();
				}), St.Body(15.f), St.Brass)
			]
		]

		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 8.f, 0.f, 0.f))
		[
			MakeStepRow(
				[this]() { return Game() ? static_cast<float>(Game()->GetRulerDeg() / 180.0) : 0.f; },
				[this](float V)
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->SetRulerDeg(FMath::RoundToDouble(V * 360.0) * 0.5);
					}
				},
				[this]()
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->SetRulerDeg(GM->GetRulerDeg() - 0.5);
					}
				},
				[this]()
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->SetRulerDeg(GM->GetRulerDeg() + 0.5);
					}
				},
				CanEdit, false)
		]

		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 12.f, 0.f, 0.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)
			[
				MakeButton(Txt(TEXT("판 전체 보기  F")), [this]()
				{
					if (AStampOmokGameMode* GM = Game())
					{
						GM->FitCameraToStamps();
					}
				}, EButtonKind::Ghost, CanEdit, 48.f, 16.f)
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
			[
				MakeButton(TAttribute<FText>::CreateLambda([this]() { return Phase() == EStampPhase::Judging ? Txt(TEXT("판정 중…")) : Txt(TEXT("판정하기  Space")); }),
					[this]()
					{
						if (AStampOmokGameMode* GM = Game())
						{
							GM->Judge();
						}
					}, EButtonKind::PlayerPrimary, CanEdit, 48.f, 19.f)
			]
		]

		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 12.f, 0.f, 0.f))
		[
			MakeText(Txt(TEXT("자 몸통을 끌어 옮기고, 양 끝 놋쇠 손잡이를 끌어 돌리세요. Q/E로 0.5°씩 (Shift는 5°).")), St.Body(14.f), St.IvoryDim, true)
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildResultPane()
{
	const FStampStyle& St = FStampStyle::Get();
	return SNew(SVerticalBox)
		.Visibility_Lambda([this]() { return Phase() == EStampPhase::Result ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed; })
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom)
			[
				MakeText(Txt(TEXT("판정 실패")), St.Display(26.f), St.AlertText)
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 0.f, 4.f))
			[
				MakeText(TAttribute<FText>::CreateLambda([this]() { return Game() ? Game()->GetPenaltyNote() : FText::GetEmpty(); }), St.Body(14.f), St.IvoryDim)
			]
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 10.f, 0.f, 0.f))
		[
			MakeText(TAttribute<FText>::CreateLambda([this]() { return Game() ? Game()->GetJudgeMessage() : FText::GetEmpty(); }), St.Body(17.f), St.Ivory, true)
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
		[
			MakeButton(Txt(TEXT("차례 넘기기  Space")), [this]()
			{
				if (AStampOmokGameMode* GM = Game())
				{
					GM->PassTurn();
				}
			}, EButtonKind::PlayerPrimary, TAttribute<bool>(true), 50.f, 19.f)
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildOverPane()
{
	const FStampStyle& St = FStampStyle::Get();
	return SNew(SVerticalBox)
		.Visibility_Lambda([this]() { return Phase() == EStampPhase::Over ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed; })
		+ SVerticalBox::Slot().AutoHeight()
		[
			MakeText(TAttribute<FText>::CreateLambda([this]() { return Game() ? Game()->GetJudgeMessage() : FText::GetEmpty(); }), St.Body(17.f), St.Ivory, true)
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)
			[
				MakeButton(Txt(TEXT("한 판 더  Enter")), [this]() { StartNewGame(); }, EButtonKind::PlayerPrimary, TAttribute<bool>(true), 50.f, 19.f)
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
			[
				MakeButton(Txt(TEXT("메인 메뉴")), [this]() { GoToMenu(); }, EButtonKind::Ghost, TAttribute<bool>(true), 50.f, 17.f)
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildScaleBar()
{
	const FStampStyle& St = FStampStyle::Get();
	TSharedRef<SHorizontalBox> Bar = SNew(SHorizontalBox);
	for (int32 I = 0; I < 5; ++I)
	{
		Bar->AddSlot().AutoWidth()
		[
			SNew(SBox)
			.HeightOverride(5.f)
			.WidthOverride_Lambda([this]() { return FOptionalSize(ScaleSegmentWidth); })
			.Visibility_Lambda([this, I]() { return I < ScaleSegments ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
			[
				SNew(SImage)
				.Image(St.Solid())
				.ColorAndOpacity(I % 2 == 0 ? St.PaperInk.CopyWithNewOpacity(0.75f) : St.PaperInk.CopyWithNewOpacity(0.3f))
			]
		];
	}
	return SNew(SBorder)
		.BorderImage(St.Round(14))
		.BorderBackgroundColor(St.Paper.CopyWithNewOpacity(0.88f))
		.Padding(FMargin(14.f, 8.f, 14.f, 10.f))
		.Visibility(EVisibility::HitTestInvisible)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()
			[
				MakeText(TAttribute<FText>::CreateLambda([this]() { return Str(FString::Printf(TEXT("도장 %d개"), ScaleSegments)); }), St.Body(13.f), St.PaperInk)
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 5.f, 0.f, 0.f))
			[
				Bar
			]
		];
}

TSharedRef<SWidget> SStampOmokHUD::BuildToast()
{
	const FStampStyle& St = FStampStyle::Get();
	ToastWidget = SNew(SBorder)
		.BorderImage(St.Round(14))
		.BorderBackgroundColor_Lambda([this]()
		{
			const FStampStyle& S = FStampStyle::Get();
			return FSlateColor(bToastWarn ? S.ShuDark : S.GlazeDeep);
		})
		.Padding(FMargin(20.f, 11.f))
		.Visibility_Lambda([this]() { return Clock < ToastUntil ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
		[
			MakeText(TAttribute<FText>::CreateLambda([this]() { return ToastText; }), St.Body(17.f), St.Ivory)
		];
	return ToastWidget.ToSharedRef();
}

TSharedRef<SWidget> SStampOmokHUD::BuildBanner()
{
	const FStampStyle& St = FStampStyle::Get();
	return SNew(SBorder)
		.BorderImage(St.Round(20))
		.BorderBackgroundColor(St.Ivory)
		.Padding(FMargin(16.f, 12.f, 30.f, 12.f))
		.Visibility_Lambda([this]() { return Phase() == EStampPhase::Over ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
			[
				SNew(SBox).WidthOverride(72.f).HeightOverride(72.f)
				[
					SNew(SImage).Image_Lambda([this]() { return FStampStyle::Get().Seal(Game() ? Game()->GetWinner() : 0); })
				]
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(FMargin(16.f, 0.f, 0.f, 0.f))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[
					MakeText(TAttribute<FText>::CreateLambda([this]()
					{
						return Str(FString::Printf(TEXT("%s 승리"), *HudDetail::Name(Game() ? Game()->GetWinner() : 0)));
					}), St.Display(38.f), St.PaperInk)
				]
				+ SVerticalBox::Slot().AutoHeight()
				[
					MakeText(TAttribute<FText>::CreateLambda([this]()
					{
						return Str(FString::Printf(TEXT("%d수 만에 다섯 줄을 자로 입증했어요"), Game() ? Game()->GetMoveNo() : 0));
					}), St.Body(16.f), St.PaperInkSoft)
				]
			]
		];
}

// ───────────────────────────── 턴 교체 가림막 ─────────────────────────────

TSharedRef<SWidget> SStampOmokHUD::BuildHandoff()
{
	const FStampStyle& St = FStampStyle::Get();
	FSlateFontInfo Eyebrow = St.Body(15.f);
	Eyebrow.LetterSpacing = 160;

	return SNew(SBorder)
		.BorderImage(St.Solid())
		.BorderBackgroundColor(St.GlazeDeep)
		.Visibility_Lambda([this]() { return Phase() == EStampPhase::Handoff && !IsOpen(EOverlay::Menu) ? EVisibility::Visible : EVisibility::Collapsed; })
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(560.f)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
				[
					SNew(SBox).WidthOverride(190.f).HeightOverride(190.f)
					[
						SNew(SBorder)
						.BorderImage(St.Circle())
						.BorderBackgroundColor(St.Paper)
						.Padding(20.f)
						[
							SNew(SImage).Image_Lambda([this]() { return FStampStyle::Get().Seal(CurrentPlayer()); })
						]
					]
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(FMargin(0.f, 26.f, 0.f, 0.f))
				[
					MakeText(TAttribute<FText>::CreateLambda([this]()
					{
						const AStampOmokGameMode* GM = Game();
						return GM ? Str(FString::Printf(TEXT("%d수째  ·  %s 도장 %d개"), GM->GetMoveNo(), *HudDetail::Name(GM->GetCurrent()), GM->CountStamps(GM->GetCurrent()))) : FText::GetEmpty();
					}), Eyebrow, St.Brass)
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(FMargin(0.f, 12.f, 0.f, 0.f))
				[
					SNew(STextBlock)
					.Font(St.Display(44.f))
					.ColorAndOpacity(St.Ivory)
					.Justification(ETextJustify::Center)
					.AutoWrapText(true)
					.Text_Lambda([this]()
					{
						const AStampOmokGameMode* GM = Game();
						if (!GM)
						{
							return FText::GetEmpty();
						}
						const FString Me = HudDetail::Name(GM->GetCurrent());
						if (GM->IsSkipTurn())
						{
							return Str(FString::Printf(TEXT("%s은 이번 차례를 쉽니다"), *Me));
						}
						return GM->GetMoveNo() == 1 ? Str(FString::Printf(TEXT("%s부터 시작합니다"), *Me)) : Str(FString::Printf(TEXT("%s에게 자리를 넘기세요"), *Me));
					})
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(FMargin(0.f, 12.f, 0.f, 0.f))
				[
					SNew(STextBlock)
					.Font(St.Body(18.f))
					.ColorAndOpacity(St.IvoryDim)
					.Justification(ETextJustify::Center)
					.AutoWrapText(true)
					.Text_Lambda([this]()
					{
						const AStampOmokGameMode* GM = Game();
						if (!GM)
						{
							return FText::GetEmpty();
						}
						if (GM->IsSkipTurn())
						{
							return Txt(TEXT("자 확인에 실패한 벌칙이에요. 그대로 상대에게 넘기세요."));
						}
						return Str(FString::Printf(TEXT("%s은 화면을 보지 마세요. 판은 가려진 채로 열립니다."), *HudDetail::Name(1 - GM->GetCurrent())));
					})
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(FMargin(0.f, 16.f, 0.f, 0.f))
				[
					SNew(SBorder)
					.BorderImage(St.Round(999))
					.BorderBackgroundColor(St.Glaze)
					.Padding(FMargin(16.f, 6.f))
					.Visibility_Lambda([this]() { return Game() && Game()->GetLastAction().Player >= 0 ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
					[
						MakeText(TAttribute<FText>::CreateLambda([this]()
						{
							const AStampOmokGameMode* GM = Game();
							if (!GM || GM->GetLastAction().Player < 0)
							{
								return FText::GetEmpty();
							}
							return Str(FString::Printf(TEXT("지난 수 · %s %s"), *HudDetail::Name(GM->GetLastAction().Player), *GM->GetLastAction().Label.ToString()));
						}), St.Body(15.f), St.IvoryDim)
					]
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 30.f, 0.f, 0.f))
				[
					MakeButton(TAttribute<FText>::CreateLambda([this]()
					{
						const AStampOmokGameMode* GM = Game();
						if (GM && GM->IsSkipTurn())
						{
							return Txt(TEXT("확인, 넘기기  Space"));
						}
						return Str(FString::Printf(TEXT("%s, 준비됐어요  Space"), *HudDetail::Name(CurrentPlayer())));
					}),
					[this]()
					{
						if (AStampOmokGameMode* GM = Game())
						{
							GM->ReadyForTurn();
						}
					}, EButtonKind::PlayerPrimary, TAttribute<bool>(true), 60.f, 21.f)
				]
			]
		];
}

// ───────────────────────────── 메인 메뉴 ─────────────────────────────

TSharedRef<SWidget> SStampOmokHUD::BuildMenu()
{
	const FStampStyle& St = FStampStyle::Get();
	auto Spec = TAttribute<FText>::CreateLambda([this]()
	{
		const AStampOmokGameMode* GM = Game();
		const float Tol = GM ? GM->GetOptions().LineTolerance : 0.35f;
		const float ArmMax = GM ? GM->GetOptions().ArmMaxLength : 12.f;
		return Str(FString::Printf(TEXT("도장 지름 = 바둑돌의 3/4  ·  허용 오차 ±%d%%  ·  팔 최대 도장 %.0f개"), FMath::RoundToInt(Tol * 100.f), ArmMax));
	});

	return SNew(SOverlay)
		.Visibility_Lambda([this]() { return IsOpen(EOverlay::Menu) ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed; })
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Fill)
		[
			SNew(SBox)
			.WidthOverride(620.f)
			[
				SNew(SBackgroundBlur)
				.BlurStrength(8.f)
				.Padding(0.f)
				[
					SNew(SBorder)
					.BorderImage(St.PaperTile())
					.BorderBackgroundColor(FLinearColor(1.f, 1.f, 1.f, 0.96f))
					.Padding(FMargin(64.f, 48.f, 56.f, 44.f))
					[
						SNew(SVerticalBox)
						// 인장 두 개: 오른쪽 위에 겹쳐 찍힌 듯
						+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Right)
						[
							SNew(SOverlay)
							+ SOverlay::Slot()
							[
								SNew(SBox).WidthOverride(230.f).HeightOverride(230.f)
								[
									SNew(SImage).Image(St.Seal(0))
								]
							]
							+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(FMargin(-40.f, 0.f, 0.f, -18.f))
							[
								SNew(SBox).WidthOverride(118.f).HeightOverride(118.f)
								[
									SNew(SImage).Image(St.Seal(1))
								]
							]
						]
						+ SVerticalBox::Slot().FillHeight(1.f)
						[
							SNew(SSpacer)
						]
						+ SVerticalBox::Slot().AutoHeight()
						[
							SNew(STextBlock)
							.Text(Txt(TEXT("도장\n오목")))
							.Font(St.Display(120.f))
							.ColorAndOpacity(St.PaperInk)
							.LineHeightPercentage(0.9f)
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 18.f, 0.f, 0.f))
						[
							MakeText(Txt(TEXT("칸 없는 한지 위에 몰래 찍고,\n자를 대어 다섯 줄을 입증하세요.")), St.DisplayRegular(24.f), St.PaperInk, true)
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 20.f, 0.f, 0.f))
						[
							SNew(SBox).HeightOverride(1.f)
							[
								SNew(SImage).Image(St.Solid()).ColorAndOpacity(St.PaperDeep)
							]
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 12.f, 0.f, 0.f))
						[
							MakeText(Spec, St.Body(15.f), St.PaperInkSoft, true)
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 24.f, 0.f, 0.f))
						[
							SNew(SBox)
							.Visibility_Lambda([this]() { return Game() && Game()->HasGameInProgress() ? EVisibility::Visible : EVisibility::Collapsed; })
							.Padding(FMargin(0.f, 0.f, 0.f, 10.f))
							[
								MakeButton(Txt(TEXT("이어하기")), [this]() { ResumeFromMenu(); }, EButtonKind::PaperGhost, TAttribute<bool>(true), 54.f, 19.f)
							]
						]
						+ SVerticalBox::Slot().AutoHeight()
						[
							MakeButton(Txt(TEXT("두 사람 대국 시작")), [this]()
							{
								AStampOmokGameMode* GM = Game();
								if (GM && GM->HasGameInProgress())
								{
									AskConfirm(Txt(TEXT("새 대국을 시작할까요?")), Txt(TEXT("지금 판의 도장은 모두 사라집니다.")), FText::GetEmpty(), Txt(TEXT("새로 시작")),
										[this]() { StartNewGame(); });
									return;
								}
								StartNewGame();
							}, EButtonKind::Shu, TAttribute<bool>(true), 60.f, 22.f)
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 10.f, 0.f, 0.f))
						[
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().FillWidth(1.f)
							[
								MakeButton(Txt(TEXT("게임 방법")), [this]() { Open(EOverlay::Howto); }, EButtonKind::PaperGhost, TAttribute<bool>(true), 52.f, 18.f)
							]
							+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
							[
								MakeButton(Txt(TEXT("설정")), [this]() { Open(EOverlay::Settings); }, EButtonKind::PaperGhost, TAttribute<bool>(true), 52.f, 18.f)
							]
							+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
							[
								MakeButton(Txt(TEXT("끝내기")), [this]()
								{
									AStampOmokPlayerController* PC = PlayerController.Get();
									if (PC)
									{
										UKismetSystemLibrary::QuitGame(PC, PC, EQuitPreference::Quit, false);
									}
								}, EButtonKind::PaperGhost, TAttribute<bool>(true), 52.f, 18.f)
							]
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 18.f, 0.f, 0.f))
						[
							MakeText(Txt(TEXT("한 컴퓨터를 번갈아 쓰는 로컬 2인 대전  ·  마우스와 키보드")), St.Body(13.f), St.PaperInkSoft)
						]
					]
				]
			]
		];
}

// ───────────────────────────── 일시 정지 ─────────────────────────────

TSharedRef<SWidget> SStampOmokHUD::BuildPause()
{
	const FStampStyle& St = FStampStyle::Get();
	auto Row = [](TSharedRef<SWidget> W)
	{
		return SNew(SBox).Padding(FMargin(0.f, 5.f))[W];
	};
	return SNew(SBorder)
		.BorderImage(St.Solid())
		.BorderBackgroundColor(St.Scrim)
		.Visibility_Lambda([this]() { return IsOpen(EOverlay::Pause) ? EVisibility::Visible : EVisibility::Collapsed; })
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(420.f)
			[
				SNew(SBorder)
				.BorderImage(St.PaperTile())
				.Padding(FMargin(30.f, 26.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 0.f, 0.f, 14.f))
					[
						MakeText(Txt(TEXT("잠시 멈춤")), St.Display(32.f), St.PaperInk)
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						Row(MakeButton(Txt(TEXT("계속하기  Esc")), [this]() { Close(EOverlay::Pause); }, EButtonKind::Shu, TAttribute<bool>(true), 54.f, 19.f))
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						Row(MakeButton(Txt(TEXT("게임 방법")), [this]() { Open(EOverlay::Howto); }, EButtonKind::PaperGhost))
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						Row(MakeButton(Txt(TEXT("설정")), [this]() { Open(EOverlay::Settings); }, EButtonKind::PaperGhost))
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						Row(MakeButton(Txt(TEXT("새 대국")), [this]()
						{
							AskConfirm(Txt(TEXT("새 대국을 시작할까요?")), Txt(TEXT("지금 판의 도장은 모두 사라집니다.")), FText::GetEmpty(), Txt(TEXT("새로 시작")),
								[this]() { StartNewGame(); });
						}, EButtonKind::PaperGhost))
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						Row(MakeButton(Txt(TEXT("메인 메뉴")), [this]() { GoToMenu(); }, EButtonKind::PaperGhost))
					]
				]
			]
		];
}

// ───────────────────────────── 게임 방법 ─────────────────────────────

TSharedRef<SWidget> SStampOmokHUD::BuildHowto()
{
	const FStampStyle& St = FStampStyle::Get();
	struct FRule
	{
		FText Title;
		TAttribute<FText> Body;
	};
	const TArray<FRule> Rules = {
		FRule{Txt(TEXT("차례마다 한 가지")), Txt(TEXT("[도장 찍기]와 [자 확인] 중 하나를 고릅니다. 어느 쪽이든 차례 하나를 씁니다."))},
		FRule{Txt(TEXT("도장 찍기")), Txt(TEXT("판은 가려져 있어요. 한지를 클릭해 팔 기준점(어깨)을 정합니다. 팔은 화면 위쪽으로 길이의 절반을 뻗고, 팔꿈치에서 직각으로 꺾여 왼쪽이나 오른쪽으로 나머지 절반을 갑니다. 그 끝에 도장이 찍혀요. 손이 살짝 떨려서 계산과 조금 어긋날 수 있어요."))},
		FRule{Txt(TEXT("겹치면 막힘")), TAttribute<FText>::CreateLambda([this]()
		{
			const bool bEnds = !Game() || Game()->GetOptions().bOverlapEndsTurn;
			return Str(FString::Printf(TEXT("이미 도장이 있는 자리나 종이 밖에 닿으면 '쿵' 하고 찍히지 않습니다. %s"), bEnds ? TEXT("차례는 그대로 소모돼요.") : TEXT("다시 시도할 수 있어요.")));
		})},
		FRule{Txt(TEXT("자 확인")), Txt(TEXT("판이 두 사람 모두에게 공개됩니다. 자 몸통을 끌어 놓고, 양 끝 놋쇠 손잡이를 끌어 돌려 맞춘 뒤 [판정하기]."))},
		FRule{Txt(TEXT("승리 조건")), TAttribute<FText>::CreateLambda([this]()
		{
			const StampRules::FRulesConfig Cfg = Game() ? Game()->GetRulesConfig() : StampRules::FRulesConfig();
			return Str(FString::Printf(TEXT("내 도장 %d개의 중심이 자의 허용 띠(도장 지름의 ±%d%%) 안에 들고, 최소제곱으로 맞춘 직선에서도 그만큼 안에 있어야 합니다. 이웃 간격은 도장 %.1f개 이하, 그 사이를 상대 도장이 막으면 무효예요."),
				Cfg.WinCount, FMath::RoundToInt(Cfg.LineTolerance * 100.0), Cfg.MaxGap));
		})},
		FRule{Txt(TEXT("자 확인 실패")), TAttribute<FText>::CreateLambda([this]()
		{
			return Str(FString::Printf(TEXT("%s. 공개된 판을 잘 기억해 두세요."), Game() ? *Game()->DescribePenalty().ToString() : TEXT("실패하면 차례만 넘어갑니다")));
		})},
	};

	TSharedRef<SVerticalBox> List = SNew(SVerticalBox);
	for (int32 I = 0; I < Rules.Num(); ++I)
	{
		List->AddSlot().AutoHeight().Padding(FMargin(0.f, 0.f, 0.f, 16.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top).Padding(FMargin(0.f, 2.f, 14.f, 0.f))
			[
				SNew(SBox).WidthOverride(34.f).HeightOverride(34.f)
				[
					SNew(SBorder)
					.BorderImage(St.Circle())
					.BorderBackgroundColor(St.Shu)
					.HAlign(HAlign_Center)
					.VAlign(VAlign_Center)
					[
						MakeText(Str(FString::FromInt(I + 1)), St.Body(16.f), St.Ivory)
					]
				]
			]
			+ SHorizontalBox::Slot().FillWidth(1.f)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[
					MakeText(Rules[I].Title, St.Display(21.f), St.PaperInk)
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 4.f, 0.f, 0.f))
				[
					MakeText(Rules[I].Body, St.Body(17.f), St.PaperInk, true)
				]
			]
		];
	}

	auto ControlRow = [&St, this](const TCHAR* Key, const TCHAR* What) -> TSharedRef<SWidget>
	{
		return SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().Padding(FMargin(0.f, 3.f))
			[
				SNew(SBox).WidthOverride(190.f)
				[
					MakeText(Txt(Key), St.Body(16.f), St.PaperInkSoft)
				]
			]
			+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(0.f, 3.f))
			[
				MakeText(Txt(What), St.Body(16.f), St.PaperInk, true)
			];
	};

	return SNew(SBorder)
		.BorderImage(St.PaperTile())
		.Visibility_Lambda([this]() { return IsOpen(EOverlay::Howto) ? EVisibility::Visible : EVisibility::Collapsed; })
		.HAlign(HAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(860.f)
			[
				SNew(SScrollBox)
				+ SScrollBox::Slot().Padding(FMargin(0.f, 48.f, 0.f, 48.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
						[
							MakeText(Txt(TEXT("게임 방법")), St.Display(44.f), St.PaperInk)
						]
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
						[
							SNew(SBox).WidthOverride(130.f)
							[
								MakeButton(Txt(TEXT("닫기  Esc")), [this]() { Close(EOverlay::Howto); }, EButtonKind::PaperGhost, TAttribute<bool>(true), 46.f, 16.f)
							]
						]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 16.f, 0.f, 26.f))
					[
						MakeText(Txt(TEXT("칸 없는 한지 위에서 두 사람이 번갈아 도장을 찍습니다. 판은 늘 가려져 있고, 누군가 자를 대는 순간에만 드러납니다.")), St.DisplayRegular(21.f), St.PaperInk, true)
					]
					+ SVerticalBox::Slot().AutoHeight()
					[
						List
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 8.f))
					[
						MakeText(Txt(TEXT("조작")), St.Display(24.f), St.PaperInk)
					]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("왼쪽 클릭"), TEXT("팔 기준점 정하기 · 기준점·자 끌기"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("오른쪽·가운데 끌기"), TEXT("판 이동 (왼쪽 끌기도 빈 곳이면 이동)"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("휠"), TEXT("커서 쪽으로 확대·축소"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("W / S  (Shift)"), TEXT("팔 길이 0.1씩 (1씩)"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("A / D"), TEXT("팔꿈치를 왼쪽 / 오른쪽으로"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("Space · Enter"), TEXT("놓기 · 판정하기 · 차례 넘기기 · 준비"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("R"), TEXT("자 확인 (판 공개)"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("Q / E  (Shift)"), TEXT("자 돌리기 0.5°씩 (5°씩)"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("C · F"), TEXT("판 가운데로 · 도장 전체 보기"))]
					+ SVerticalBox::Slot().AutoHeight()[ControlRow(TEXT("Esc"), TEXT("메뉴"))]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 22.f, 0.f, 0.f))
					[
						SNew(SBorder)
						.BorderImage(St.Round(14))
						.BorderBackgroundColor(St.PaperDeep.CopyWithNewOpacity(0.45f))
						.Padding(FMargin(18.f, 14.f))
						[
							MakeText(Txt(TEXT("팁: 한지의 섬유 결, 문살 그림자, 판 가운데의 옅은 십자가 기억의 이정표가 됩니다. 왼쪽 아래 눈금 막대로 도장 크기를 가늠하세요.")), St.Body(16.f), St.PaperInkSoft, true)
						]
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Left).Padding(FMargin(0.f, 24.f, 0.f, 0.f))
					[
						SNew(SBox).WidthOverride(220.f)
						[
							MakeButton(Txt(TEXT("알겠어요")), [this]() { Close(EOverlay::Howto); }, EButtonKind::Shu, TAttribute<bool>(true), 54.f, 19.f)
						]
					]
				]
			]
		];
}

// ───────────────────────────── 설정 ─────────────────────────────

TSharedRef<SWidget> SStampOmokHUD::BuildSettings()
{
	const FStampStyle& St = FStampStyle::Get();
	auto Opt = [this]() -> FStampOptions
	{
		return Game() ? Game()->GetOptions() : FStampOptions();
	};
	auto Pct = [](float V) { return Str(FString::Printf(TEXT("도장 지름의 %d%%"), FMath::RoundToInt(V * 100.f))); };
	auto Vol = [](float V) { return Str(FString::Printf(TEXT("%d%%"), FMath::RoundToInt(V * 100.f))); };
	auto Section = [&St, this](const TCHAR* Title) -> TSharedRef<SWidget>
	{
		return SNew(SBox).Padding(FMargin(0.f, 22.f, 0.f, 6.f))
			[
				MakeText(Txt(Title), St.Display(22.f), St.Brass)
			];
	};
	auto Gap = []() -> TSharedRef<SWidget> { return SNew(SSpacer).Size(FVector2D(1.0, 14.0)); };

	return SNew(SBorder)
		.BorderImage(St.Solid())
		.BorderBackgroundColor(St.Glaze)
		.Visibility_Lambda([this]() { return IsOpen(EOverlay::Settings) ? EVisibility::Visible : EVisibility::Collapsed; })
		.HAlign(HAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(720.f)
			[
				SNew(SScrollBox)
				+ SScrollBox::Slot().Padding(FMargin(0.f, 44.f, 0.f, 44.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
						[
							MakeText(Txt(TEXT("설정")), St.Display(44.f), St.Ivory)
						]
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
						[
							SNew(SBox).WidthOverride(130.f)
							[
								MakeButton(Txt(TEXT("완료  Esc")), [this]() { Close(EOverlay::Settings); }, EButtonKind::Ghost, TAttribute<bool>(true), 46.f, 16.f)
							]
						]
					]

					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("판정"))]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeSettingSlider(Txt(TEXT("직선 허용 오차")), [Opt, Pct]() { return Pct(Opt().LineTolerance); }, 0.1f, 0.8f, 0.05f,
							[Opt]() { return Opt().LineTolerance; },
							[this](float V) { ChangeOptions([V](FStampOptions& O) { O.LineTolerance = V; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeSettingSlider(Txt(TEXT("자 각도 허용")), [Opt]() { return Str(FString::Printf(TEXT("%.0f°"), Opt().AngleToleranceDeg)); }, 3.f, 20.f, 1.f,
							[Opt]() { return Opt().AngleToleranceDeg; },
							[this](float V) { ChangeOptions([V](FStampOptions& O) { O.AngleToleranceDeg = V; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 0.f, 0.f, 6.f))
						[
							MakeText(Txt(TEXT("자 확인에 실패하면")), St.Body(17.f), St.Ivory)
						]
						+ SVerticalBox::Slot().AutoHeight()
						[
							MakeSegment({Txt(TEXT("차례만 넘어감")), Txt(TEXT("다음 차례 쉼")), Str(FString::Printf(TEXT("%d차례 자 확인 금지"), UStampOmokSettings::Get().CooldownTurns))},
								[Opt]() { return static_cast<int32>(Opt().FailPenalty); },
								[this](int32 Index) { ChangeOptions([Index](FStampOptions& O) { O.FailPenalty = static_cast<EStampFailPenalty>(Index); }); },
								TAttribute<bool>(true))
						]
					]

					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("팔"))]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeSettingSlider(Txt(TEXT("팔 최대 길이")), [Opt]() { return Str(FString::Printf(TEXT("도장 %.0f개"), Opt().ArmMaxLength)); }, 4.f, 20.f, 1.f,
							[Opt]() { return Opt().ArmMaxLength; },
							[this](float V) { ChangeOptions([V](FStampOptions& O) { O.ArmMaxLength = V; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeSettingSlider(Txt(TEXT("손떨림")), [Opt, Pct]() { return Opt().ArmJitter > 0.f ? Pct(Opt().ArmJitter) : Txt(TEXT("없음")); }, 0.f, 0.2f, 0.01f,
							[Opt]() { return Opt().ArmJitter; },
							[this](float V) { ChangeOptions([V](FStampOptions& O) { O.ArmJitter = V; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeToggleRow(Txt(TEXT("도장이 막혀도 차례 소모")), [Opt]() { return Opt().bOverlapEndsTurn; },
							[this](bool B) { ChangeOptions([B](FStampOptions& O) { O.bOverlapEndsTurn = B; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeToggleRow(Txt(TEXT("착지점 미리보기 (쉬운 모드)")), [Opt]() { return Opt().bShowLandingPreview; },
							[this](bool B) { ChangeOptions([B](FStampOptions& O) { O.bShowLandingPreview = B; }); })
					]

					+ SVerticalBox::Slot().AutoHeight()[Section(TEXT("화면과 소리"))]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeToggleRow(Txt(TEXT("문살 그림자")), [Opt]() { return Opt().bLatticeShadow; },
							[this](bool B) { ChangeOptions([B](FStampOptions& O) { O.bLatticeShadow = B; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeToggleRow(Txt(TEXT("피사계 심도 (가장자리 흐림)")), [Opt]() { return Opt().bDepthOfField; },
							[this](bool B) { ChangeOptions([B](FStampOptions& O) { O.bDepthOfField = B; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeSettingSlider(Txt(TEXT("음악")), [Opt, Vol]() { return Vol(Opt().MusicVolume); }, 0.f, 1.f, 0.05f,
							[Opt]() { return Opt().MusicVolume; },
							[this](float V) { ChangeOptions([V](FStampOptions& O) { O.MusicVolume = V; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeSettingSlider(Txt(TEXT("마루 바람 소리")), [Opt, Vol]() { return Vol(Opt().AmbienceVolume); }, 0.f, 1.f, 0.05f,
							[Opt]() { return Opt().AmbienceVolume; },
							[this](float V) { ChangeOptions([V](FStampOptions& O) { O.AmbienceVolume = V; }); })
					]
					+ SVerticalBox::Slot().AutoHeight()[Gap()]
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeSettingSlider(Txt(TEXT("효과음")), [Opt, Vol]() { return Vol(Opt().SfxVolume); }, 0.f, 1.f, 0.05f,
							[Opt]() { return Opt().SfxVolume; },
							[this](float V) { ChangeOptions([V](FStampOptions& O) { O.SfxVolume = V; }); })
					]

					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 28.f, 0.f, 0.f))
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().FillWidth(1.f)
						[
							MakeButton(Txt(TEXT("기본값으로")), [this]()
							{
								const UStampOmokSettings& S = UStampOmokSettings::Get();
								ChangeOptions([&S](FStampOptions& O)
								{
									O.LineTolerance = S.LineTolerance;
									O.AngleToleranceDeg = S.AngleToleranceDeg;
									O.ArmMaxLength = S.ArmMaxLength;
									O.ArmJitter = S.ArmJitter;
									O.FailPenalty = S.FailPenalty;
									O.bOverlapEndsTurn = S.bOverlapEndsTurn;
									O.bShowLandingPreview = S.bShowLandingPreview;
									O.bLatticeShadow = S.bWindowLatticeShadow;
									O.bDepthOfField = S.bDepthOfField;
									O.MusicVolume = S.MusicVolume;
									O.AmbienceVolume = S.AmbienceVolume;
									O.SfxVolume = S.SfxVolume;
								});
							}, EButtonKind::Ghost)
						]
						+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
						[
							MakeButton(Txt(TEXT("완료")), [this]() { Close(EOverlay::Settings); }, EButtonKind::Shu)
						]
					]
				]
			]
		];
}

// ───────────────────────────── 확인 대화상자 ─────────────────────────────

TSharedRef<SWidget> SStampOmokHUD::BuildDialog()
{
	const FStampStyle& St = FStampStyle::Get();
	return SNew(SBorder)
		.BorderImage(St.Solid())
		.BorderBackgroundColor(St.Scrim)
		.Visibility_Lambda([this]() { return IsOpen(EOverlay::Dialog) ? EVisibility::Visible : EVisibility::Collapsed; })
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SBox)
			.WidthOverride(480.f)
			[
				SNew(SBorder)
				.BorderImage(St.PaperTile())
				.Padding(FMargin(30.f, 26.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						MakeText(TAttribute<FText>::CreateLambda([this]() { return DialogTitle; }), St.Display(28.f), St.PaperInk, true)
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 14.f, 0.f, 0.f))
					[
						MakeText(TAttribute<FText>::CreateLambda([this]() { return DialogBody; }), St.Body(17.f), St.PaperInk, true)
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 10.f, 0.f, 0.f))
					[
						SNew(SBox)
						.Visibility_Lambda([this]() { return DialogWarning.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible; })
						[
							MakeText(TAttribute<FText>::CreateLambda([this]() { return DialogWarning; }), St.Body(17.f), St.Shu, true)
						]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(FMargin(0.f, 22.f, 0.f, 0.f))
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().FillWidth(1.f)
						[
							MakeButton(Txt(TEXT("그만두기  Esc")), [this]() { Close(EOverlay::Dialog); }, EButtonKind::PaperGhost, TAttribute<bool>(true), 52.f, 17.f)
						]
						+ SHorizontalBox::Slot().FillWidth(1.f).Padding(FMargin(10.f, 0.f, 0.f, 0.f))
						[
							MakeButton(TAttribute<FText>::CreateLambda([this]() { return Str(DialogOk.ToString() + TEXT("  Enter")); }), [this]()
							{
								Close(EOverlay::Dialog);
								TFunction<void()> Action = MoveTemp(DialogOnOk);
								DialogOnOk = nullptr;
								if (Action)
								{
									Action();
								}
							}, EButtonKind::PlayerPrimary, TAttribute<bool>(true), 52.f, 19.f)
						]
					]
				]
			]
		];
}

// ───────────────────────────── 키보드 · 매 프레임 ─────────────────────────────

FReply SStampOmokHUD::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	AStampOmokGameMode* GM = Game();
	if (!GM)
	{
		return FReply::Unhandled();
	}
	const FKey Key = InKeyEvent.GetKey();
	const bool bShift = InKeyEvent.IsShiftDown();
	const bool bConfirm = Key == EKeys::SpaceBar || Key == EKeys::Enter;

	if (IsTop(EOverlay::Dialog))
	{
		if (Key == EKeys::Escape)
		{
			Close(EOverlay::Dialog);
		}
		else if (bConfirm)
		{
			Close(EOverlay::Dialog);
			TFunction<void()> Action = MoveTemp(DialogOnOk);
			DialogOnOk = nullptr;
			if (Action)
			{
				Action();
			}
		}
		return FReply::Handled();
	}
	if (IsTop(EOverlay::Howto) || IsTop(EOverlay::Settings))
	{
		if (Key == EKeys::Escape)
		{
			Close(Overlays.Last());
		}
		return FReply::Handled();
	}
	if (IsTop(EOverlay::Pause))
	{
		if (Key == EKeys::Escape)
		{
			Close(EOverlay::Pause);
		}
		return FReply::Handled();
	}
	if (IsTop(EOverlay::Menu))
	{
		if (Key == EKeys::Escape && GM->HasGameInProgress())
		{
			ResumeFromMenu();
		}
		return FReply::Handled();
	}

	const EStampPhase P = GM->GetPhase();
	if (Key == EKeys::Escape)
	{
		Open(EOverlay::Pause);
		return FReply::Handled();
	}
	if (P == EStampPhase::Handoff)
	{
		if (bConfirm)
		{
			PlayClick();
			GM->ReadyForTurn();
		}
		return FReply::Handled();
	}
	if (Key == EKeys::C)
	{
		GM->CenterCamera();
		return FReply::Handled();
	}
	if (Key == EKeys::F)
	{
		GM->FitCameraToStamps();
		return FReply::Handled();
	}

	switch (P)
	{
	case EStampPhase::Stamp:
	{
		const float Step = UStampOmokSettings::Get().ArmStep * (bShift ? 10.f : 1.f);
		if (Key == EKeys::A || Key == EKeys::Left)
		{
			GM->SetBend(StampRules::EBend::Left);
			PlayClick();
		}
		else if (Key == EKeys::D || Key == EKeys::Right)
		{
			GM->SetBend(StampRules::EBend::Right);
			PlayClick();
		}
		else if (Key == EKeys::W || Key == EKeys::Up)
		{
			GM->NudgeArm(Step);
		}
		else if (Key == EKeys::S || Key == EKeys::Down)
		{
			GM->NudgeArm(-Step);
		}
		else if (bConfirm)
		{
			GM->PlaceStamp();
		}
		else if (Key == EKeys::R)
		{
			RequestRuler();
		}
		return FReply::Handled();
	}
	case EStampPhase::Ruler:
	{
		const double Step = bShift ? 5.0 : 0.5;
		if (Key == EKeys::Q)
		{
			GM->SetRulerDeg(GM->GetRulerDeg() + Step);
		}
		else if (Key == EKeys::E)
		{
			GM->SetRulerDeg(GM->GetRulerDeg() - Step);
		}
		else if (bConfirm)
		{
			GM->Judge();
		}
		return FReply::Handled();
	}
	case EStampPhase::Result:
		if (bConfirm)
		{
			PlayClick();
			GM->PassTurn();
		}
		return FReply::Handled();
	case EStampPhase::Over:
		if (Key == EKeys::Enter)
		{
			StartNewGame();
		}
		return FReply::Handled();
	default:
		return FReply::Handled();
	}
}

void SStampOmokHUD::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	Clock += InDeltaTime;

	// 알림이 사라질 때 천천히
	if (ToastWidget.IsValid())
	{
		const double Left = ToastUntil - Clock;
		ToastWidget->SetRenderOpacity(static_cast<float>(FMath::Clamp(Left / 0.35, 0.0, 1.0)));
	}

	// 눈금 막대: 화면 가운데에서 도장 지름 하나가 몇 픽셀인지
	AStampOmokGameMode* GM = Game();
	AStampOmokPlayerController* PC = PlayerController.Get();
	if (GM && PC && GM->GetCameraRig())
	{
		const FStampCameraPose Pose = GM->GetCameraRig()->GetPose();
		const StampRules::FVec2 Center = StampOmok::WorldToBoard(FVector(Pose.Focus.X, Pose.Focus.Y, 0.0));
		const double D = GM->GetStampDiameter();
		FVector2D A, B;
		if (PC->BoardToPixel(Center, StampOmok::PaperZ, A) && PC->BoardToPixel(StampRules::FVec2{Center.X + D, Center.Y}, StampOmok::PaperZ, B))
		{
			const double PxPerSlate = PC->GetViewportSizePx().X / FMath::Max(static_cast<double>(AllottedGeometry.GetLocalSize().X), 1.0);
			const float Unit = static_cast<float>(FVector2D::Distance(A, B) / FMath::Max(PxPerSlate, 0.001));
			int32 N = 1;
			while (N < 5 && Unit * (N + 1) <= 170.f)
			{
				++N;
			}
			ScaleSegments = N;
			ScaleSegmentWidth = FMath::Max(Unit, 2.f);
		}
	}

	// 키보드 포커스가 빠지면 되찾기 (게임 창 안에서만)
	if (FSlateApplication::IsInitialized() && !HasAnyUserFocusOrFocusedDescendants())
	{
		const TSharedPtr<SWidget> Focused = FSlateApplication::Get().GetKeyboardFocusedWidget();
		if (!Focused.IsValid() || Focused->GetTypeAsString() == TEXT("SViewport"))
		{
			FSlateApplication::Get().SetKeyboardFocus(SharedThis(this), EFocusCause::SetDirectly);
		}
	}
}
