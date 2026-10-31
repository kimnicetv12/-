using UnrealBuildTool;
using System.Collections.Generic;

public class StampOmokEditorTarget : TargetRules
{
	public StampOmokEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("StampOmok");
	}
}
