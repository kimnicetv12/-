// 도장오목 설정값
#include "Core/StampOmokSettings.h"

UStampOmokSettings::UStampOmokSettings()
{
	CategoryName = TEXT("Game");
	SectionName = TEXT("Stamp Omok");
}

const UStampOmokSettings& UStampOmokSettings::Get()
{
	return *GetDefault<UStampOmokSettings>();
}

StampRules::FRulesConfig UStampOmokSettings::ToRulesConfig() const
{
	StampRules::FRulesConfig Cfg;
	Cfg.StoneDiameterCm = StoneDiameterCm;
	Cfg.StampRatio = StampRatio;
	Cfg.WinCount = WinCount;
	Cfg.LineTolerance = LineTolerance;
	Cfg.AngleToleranceDeg = AngleToleranceDeg;
	Cfg.MaxGap = MaxGap;
	Cfg.bBlockByOpponent = bBlockByOpponent;
	Cfg.RulerLength = RulerLength;
	Cfg.ArmMinLength = ArmMinLength;
	Cfg.ArmMaxLength = ArmMaxLength;
	Cfg.ArmSplit = ArmSplit;
	Cfg.ArmJitter = ArmJitter;
	return Cfg;
}
