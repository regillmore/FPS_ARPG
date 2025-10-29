#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "MainMenuWidget.generated.h"

class UButton;
class UOverlay;
class UTextBlock;
class UVerticalBox;

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnMainMenuAction);

/**
 * Programmatic main menu widget with buttons for starting and quitting the game.
 */
UCLASS()
class FPS_ARPG_API UMainMenuWidget : public UUserWidget
{
        GENERATED_BODY()

public:
        UMainMenuWidget(const FObjectInitializer& ObjectInitializer);

        /** Delegate fired when the player wants to start a game session. */
        UPROPERTY(BlueprintAssignable, Category="Main Menu")
        FOnMainMenuAction OnStartGame;

        /** Delegate fired when the player wants to quit the game. */
        UPROPERTY(BlueprintAssignable, Category="Main Menu")
        FOnMainMenuAction OnQuitGame;

        /** Sets up the widget tree at runtime. */
        virtual void NativeConstruct() override;

protected:
        /** Title text displayed at the top of the menu. */
        UPROPERTY(EditAnywhere, Category="Main Menu")
        FText GameTitle;

        /** Optional descriptive text shown under the title. */
        UPROPERTY(EditAnywhere, Category="Main Menu")
        FText DescriptionText;

        /** Label used for the start game button. */
        UPROPERTY(EditAnywhere, Category="Main Menu")
        FText StartButtonLabel;

        /** Label used for the quit button. */
        UPROPERTY(EditAnywhere, Category="Main Menu")
        FText QuitButtonLabel;

private:
        UFUNCTION()
        void HandleStartClicked();

        UFUNCTION()
        void HandleQuitClicked();

        /** Helper that adds a styled button to the menu column. */
        UButton* CreateMenuButton(const FText& Label, UVerticalBox* ParentBox, const FName& ButtonName);

        /** Cached pointer to the start game button so we can focus it. */
        UPROPERTY()
        TObjectPtr<UButton> StartButton;

        /** Cached pointer to the quit button to keep it alive. */
        UPROPERTY()
        TObjectPtr<UButton> QuitButton;
};
