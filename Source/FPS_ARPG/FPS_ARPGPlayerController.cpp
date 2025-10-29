// Copyright Epic Games, Inc. All Rights Reserved.


#include "FPS_ARPGPlayerController.h"

#include "Blueprint/UserWidget.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "FPS_ARPG.h"
#include "FPS_ARPGCameraManager.h"
#include "InputMappingContext.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Slate/SlateEnums.h"
#include "UI/MainMenuWidget.h"
#include "Widgets/Input/SVirtualJoystick.h"

AFPS_ARPGPlayerController::AFPS_ARPGPlayerController()
{
        // set the player camera manager class
        PlayerCameraManagerClass = AFPS_ARPGCameraManager::StaticClass();

        MainMenuWidgetClass = UMainMenuWidget::StaticClass();
}

void AFPS_ARPGPlayerController::BeginPlay()
{
        Super::BeginPlay();


	// only spawn touch controls on local player controllers
	if (SVirtualJoystick::ShouldDisplayTouchInterface() && IsLocalPlayerController())
	{
		// spawn the mobile controls widget
		MobileControlsWidget = CreateWidget<UUserWidget>(this, MobileControlsWidgetClass);

		if (MobileControlsWidget)
		{
			// add the controls to the player screen
			MobileControlsWidget->AddToPlayerScreen(0);

		} else {

			UE_LOG(LogFPS_ARPG, Error, TEXT("Could not spawn mobile controls widget."));

		}

        }

        if (IsLocalController())
        {
                ShowMainMenu();
        }
}

void AFPS_ARPGPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	// only add IMCs for local player controllers
	if (IsLocalPlayerController())
	{
		// Add Input Mapping Context
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
		{
			for (UInputMappingContext* CurrentContext : DefaultMappingContexts)
			{
				Subsystem->AddMappingContext(CurrentContext, 0);
			}

			// only add these IMCs if we're not using mobile touch input
			if (!SVirtualJoystick::ShouldDisplayTouchInterface())
			{
				for (UInputMappingContext* CurrentContext : MobileExcludedMappingContexts)
				{
					Subsystem->AddMappingContext(CurrentContext, 0);
				}
			}
		}
	}
	
}

void AFPS_ARPGPlayerController::ShowMainMenu()
{
        if (MainMenuWidget || !IsLocalController())
        {
                return;
        }

        TSubclassOf<UMainMenuWidget> WidgetClass = MainMenuWidgetClass ? MainMenuWidgetClass : UMainMenuWidget::StaticClass();
        MainMenuWidget = CreateWidget<UMainMenuWidget>(this, WidgetClass);

        if (!MainMenuWidget)
        {
                UE_LOG(LogFPS_ARPG, Error, TEXT("Failed to create main menu widget."));
                return;
        }

        MainMenuWidget->OnStartGame.AddDynamic(this, &AFPS_ARPGPlayerController::HandleStartGameRequested);
        MainMenuWidget->OnQuitGame.AddDynamic(this, &AFPS_ARPGPlayerController::HandleQuitGameRequested);
        MainMenuWidget->AddToViewport(100);

        bShowMouseCursor = true;
        SetIgnoreLookInput(true);
        SetIgnoreMoveInput(true);
        FInputModeUIOnly InputMode;
        InputMode.SetWidgetToFocus(MainMenuWidget->TakeWidget());
        InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
        SetInputMode(InputMode);
        SetPause(true);
}

void AFPS_ARPGPlayerController::HideMainMenu()
{
        if (!MainMenuWidget)
        {
                return;
        }

        MainMenuWidget->OnStartGame.RemoveDynamic(this, &AFPS_ARPGPlayerController::HandleStartGameRequested);
        MainMenuWidget->OnQuitGame.RemoveDynamic(this, &AFPS_ARPGPlayerController::HandleQuitGameRequested);
        MainMenuWidget->RemoveFromParent();
        MainMenuWidget = nullptr;

        SetPause(false);
        SetIgnoreLookInput(false);
        SetIgnoreMoveInput(false);
        bShowMouseCursor = false;
        SetInputMode(FInputModeGameOnly());
}

void AFPS_ARPGPlayerController::HandleStartGameRequested()
{
        HideMainMenu();
}

void AFPS_ARPGPlayerController::HandleQuitGameRequested()
{
        UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false);
}
