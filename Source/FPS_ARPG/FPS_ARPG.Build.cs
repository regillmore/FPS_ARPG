// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class FPS_ARPG : ModuleRules
{
	public FPS_ARPG(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"AIModule",
			"StateTreeModule",
			"GameplayStateTreeModule",
			"UMG",
			"Slate",
			"GameplayAbilities",
			"GameplayTags",
			"GameplayTasks"
        });

		PrivateDependencyModuleNames.AddRange(new string[] { });

		PublicIncludePaths.AddRange(new string[] {
			"FPS_ARPG",
			"FPS_ARPG/Variant_Horror",
			"FPS_ARPG/Variant_Horror/UI",
			"FPS_ARPG/Variant_Shooter",
			"FPS_ARPG/Variant_Shooter/AI",
			"FPS_ARPG/Variant_Shooter/UI",
			"FPS_ARPG/Variant_Shooter/Weapons"
		});

		// Uncomment if you are using Slate UI
		// PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// Uncomment if you are using online features
		// PrivateDependencyModuleNames.Add("OnlineSubsystem");

		// To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
	}
}
