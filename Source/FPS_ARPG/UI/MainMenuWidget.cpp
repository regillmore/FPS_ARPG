#include "UI/MainMenuWidget.h"

#include "Components/Button.h"
#include "Components/Image.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "Components/SizeBox.h"
#include "Components/Spacer.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Layout/SlateChildSize.h"
#include "Slate/SlateEnums.h"
#include "SlateFontInfo.h"
#include "WidgetTree.h"
#include "GameFramework/PlayerController.h"

namespace
{
        constexpr float PanelWidth = 600.0f;
        constexpr float PanelPadding = 24.0f;
        constexpr float ButtonHeight = 72.0f;
        constexpr float ButtonSpacing = 12.0f;
}

UMainMenuWidget::UMainMenuWidget(const FObjectInitializer& ObjectInitializer)
        : Super(ObjectInitializer)
{
        bIsFocusable = true;
        GameTitle = NSLOCTEXT("MainMenu", "DefaultTitle", "FPS ARPG");
        DescriptionText = NSLOCTEXT("MainMenu", "DefaultDescription", "Embark on a high-powered journey blending shooter action and RPG depth.");
        StartButtonLabel = NSLOCTEXT("MainMenu", "StartLabel", "Start Game");
        QuitButtonLabel = NSLOCTEXT("MainMenu", "QuitLabel", "Quit to Desktop");
}

void UMainMenuWidget::NativeConstruct()
{
        Super::NativeConstruct();

        if (!WidgetTree || WidgetTree->RootWidget)
        {
                return;
        }

        UOverlay* RootOverlay = WidgetTree->ConstructWidget<UOverlay>(UOverlay::StaticClass(), TEXT("RootOverlay"));
        WidgetTree->RootWidget = RootOverlay;

        if (UImage* Background = WidgetTree->ConstructWidget<UImage>(UImage::StaticClass(), TEXT("Background")))
        {
                Background->SetColorAndOpacity(FLinearColor(0.01f, 0.01f, 0.015f, 0.9f));
                if (UOverlaySlot* BackgroundSlot = RootOverlay->AddChildToOverlay(Background))
                {
                        BackgroundSlot->SetHorizontalAlignment(HAlign_Fill);
                        BackgroundSlot->SetVerticalAlignment(VAlign_Fill);
                }
        }

        USizeBox* Panel = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass(), TEXT("Panel"));
        Panel->SetWidthOverride(PanelWidth);
        Panel->SetMinDesiredHeight(400.0f);

        if (UOverlaySlot* PanelSlot = RootOverlay->AddChildToOverlay(Panel))
        {
                PanelSlot->SetHorizontalAlignment(HAlign_Center);
                PanelSlot->SetVerticalAlignment(VAlign_Center);
                PanelSlot->SetPadding(FMargin(PanelPadding));
        }

        UVerticalBox* Column = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("Column"));
        Panel->AddChild(Column);

        if (UTextBlock* TitleText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("TitleText")))
        {
                FSlateFontInfo TitleFont = TitleText->GetFont();
                TitleFont.Size = 48;
                TitleFont.TypefaceFontName = FName(TEXT("Bold"));
                TitleText->SetFont(TitleFont);
                TitleText->SetText(GameTitle);
                TitleText->SetJustification(ETextJustify::Center);
                TitleText->SetColorAndOpacity(FSlateColor(FLinearColor::White));

                if (UVerticalBoxSlot* TitleSlot = Column->AddChildToVerticalBox(TitleText))
                {
                        TitleSlot->SetHorizontalAlignment(HAlign_Center);
                        TitleSlot->SetPadding(FMargin(0.f, 0.f, 0.f, PanelPadding * 0.5f));
                }
        }

        if (!DescriptionText.IsEmpty())
        {
                if (UTextBlock* Description = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("Description")))
                {
                        FSlateFontInfo DescriptionFont = Description->GetFont();
                        DescriptionFont.Size = 20;
                        Description->SetFont(DescriptionFont);
                        Description->SetText(DescriptionText);
                        Description->SetJustification(ETextJustify::Center);
                        Description->SetWrapTextAt(PanelWidth - (PanelPadding * 2.0f));
                        Description->SetColorAndOpacity(FSlateColor(FLinearColor(0.75f, 0.78f, 0.85f)));

                        if (UVerticalBoxSlot* DescriptionSlot = Column->AddChildToVerticalBox(Description))
                        {
                                DescriptionSlot->SetHorizontalAlignment(HAlign_Center);
                                DescriptionSlot->SetPadding(FMargin(0.f, 0.f, 0.f, PanelPadding));
                        }
                }
        }

        // spacer between text and buttons
        if (USpacer* Spacer = WidgetTree->ConstructWidget<USpacer>(USpacer::StaticClass(), TEXT("TextButtonSpacer")))
        {
                Spacer->SetSize(FVector2D(1.f, ButtonSpacing));
                Column->AddChildToVerticalBox(Spacer);
        }

        StartButton = CreateMenuButton(StartButtonLabel, Column, TEXT("StartButton"));
        QuitButton = CreateMenuButton(QuitButtonLabel, Column, TEXT("QuitButton"));

        if (StartButton)
        {
                StartButton->OnClicked.AddDynamic(this, &UMainMenuWidget::HandleStartClicked);
                StartButton->SetKeyboardFocus();
                if (APlayerController* PC = GetOwningPlayer())
                {
                        StartButton->SetUserFocus(PC);
                }
        }

        if (QuitButton)
        {
                QuitButton->OnClicked.AddDynamic(this, &UMainMenuWidget::HandleQuitClicked);
        }
}

UButton* UMainMenuWidget::CreateMenuButton(const FText& Label, UVerticalBox* ParentBox, const FName& ButtonName)
{
        if (!ParentBox)
        {
                return nullptr;
        }

        USizeBox* ButtonContainer = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass(), *FString::Printf(TEXT("%sContainer"), *ButtonName.ToString()));
        if (!ButtonContainer)
        {
                return nullptr;
        }

        ButtonContainer->SetHeightOverride(ButtonHeight);
        ButtonContainer->SetWidthOverride(PanelWidth - (PanelPadding * 2.0f));

        UButton* Button = WidgetTree->ConstructWidget<UButton>(UButton::StaticClass(), ButtonName);
        if (!Button)
        {
                return nullptr;
        }

        Button->SetIsFocusable(true);
        Button->SetHorizontalAlignment(HAlign_Fill);
        Button->SetVerticalAlignment(VAlign_Fill);
        Button->SetPadding(FMargin(16.f));
        Button->WidgetStyle.Normal.TintColor = FSlateColor(FLinearColor(0.15f, 0.2f, 0.3f, 0.85f));
        Button->WidgetStyle.Hovered.TintColor = FSlateColor(FLinearColor(0.2f, 0.28f, 0.4f, 0.95f));
        Button->WidgetStyle.Pressed.TintColor = FSlateColor(FLinearColor(0.1f, 0.16f, 0.24f, 1.0f));

        if (UTextBlock* ButtonLabel = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), *FString::Printf(TEXT("%sLabel"), *ButtonName.ToString())))
        {
                FSlateFontInfo LabelFont = ButtonLabel->GetFont();
                LabelFont.Size = 28;
                LabelFont.TypefaceFontName = FName(TEXT("Bold"));
                ButtonLabel->SetFont(LabelFont);
                ButtonLabel->SetText(Label);
                ButtonLabel->SetJustification(ETextJustify::Center);
                ButtonLabel->SetColorAndOpacity(FSlateColor(FLinearColor::White));
                Button->AddChild(ButtonLabel);
        }

        ButtonContainer->SetContent(Button);

        if (UVerticalBoxSlot* ButtonSlot = ParentBox->AddChildToVerticalBox(ButtonContainer))
        {
                ButtonSlot->SetHorizontalAlignment(HAlign_Fill);
                ButtonSlot->SetVerticalAlignment(VAlign_Center);
                ButtonSlot->SetPadding(FMargin(0.f, ButtonSpacing, 0.f, ButtonSpacing));
                ButtonSlot->SetSize(FSlateChildSize(ESlateSizeRule::Automatic));
        }

        return Button;
}

void UMainMenuWidget::HandleStartClicked()
{
        OnStartGame.Broadcast();
}

void UMainMenuWidget::HandleQuitClicked()
{
        OnQuitGame.Broadcast();
}
