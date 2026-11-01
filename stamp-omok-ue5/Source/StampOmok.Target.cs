using UnrealBuildTool;
using System.Collections.Generic;

public class StampOmokTarget : TargetRules
{
	public StampOmokTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("StampOmok");
	}
}
