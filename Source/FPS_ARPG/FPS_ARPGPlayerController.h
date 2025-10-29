// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "FPS_ARPGPlayerController.generated.h"

class UInputMappingContext;
class UMainMenuWidget;
class UUserWidget;

/**
 *  Simple first person Player Controller
 *  Manages the input mapping context.
 *  Overrides the Player Camera Manager class.
 */
UCLASS(abstract)
class FPS_ARPG_API AFPS_ARPGPlayerController : public APlayerController
{
	GENERATED_BODY()
	
public:

	/** Constructor */
	AFPS_ARPGPlayerController();

protected:

	/** Input Mapping Contexts */
	UPROPERTY(EditAnywhere, Category="Input|Input Mappings")
	TArray<UInputMappingContext*> DefaultMappingContexts;

	/** Input Mapping Contexts */
	UPROPERTY(EditAnywhere, Category="Input|Input Mappings")
	TArray<UInputMappingContext*> MobileExcludedMappingContexts;

        /** Mobile controls widget to spawn */
        UPROPERTY(EditAnywhere, Category="Input|Touch Controls")
        TSubclassOf<UUserWidget> MobileControlsWidgetClass;

        /** Pointer to the mobile controls widget */
        TObjectPtr<UUserWidget> MobileControlsWidget;

        /** Main menu widget type. Defaults to the native implementation but can be swapped in Blueprints. */
        UPROPERTY(EditAnywhere, Category="UI|Main Menu")
        TSubclassOf<UMainMenuWidget> MainMenuWidgetClass;

        /** Instance of the main menu widget currently displayed. */
        UPROPERTY()
        TObjectPtr<UMainMenuWidget> MainMenuWidget;

        /** Create and display the main menu UI for the local player. */
        void ShowMainMenu();

        /** Clean up the main menu widget and return to normal gameplay input. */
        void HideMainMenu();

        /** Callback fired when the player activates the start button. */
        UFUNCTION()
        void HandleStartGameRequested();

        /** Callback fired when the player activates the quit button. */
        UFUNCTION()
        void HandleQuitGameRequested();

        /** Gameplay initialization */
        virtual void BeginPlay() override;

        /** Input mapping context setup */
	virtual void SetupInputComponent() override;

};
