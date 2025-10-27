// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "FPS_ARPGGameMode.generated.h"

/**
 *  Simple GameMode for a first person game
 */
UCLASS(abstract)
class AFPS_ARPGGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AFPS_ARPGGameMode();
};



