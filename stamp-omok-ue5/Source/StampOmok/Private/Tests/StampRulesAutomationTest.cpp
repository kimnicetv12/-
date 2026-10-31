// 규칙 엔진 자동화 테스트 (에디터: 도구 > 세션 프론트엔드 > Automation > StampOmok)
#include "Core/StampRules.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStampRulesArmTest, "StampOmok.Rules.Arm",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FStampRulesArmTest::RunTest(const FString& Parameters)
{
	const StampRules::FRulesConfig Cfg;
	const double D = StampRules::StampDiameter(Cfg);
	const StampRules::FArm Arm = StampRules::ComputeArm(StampRules::FVec2{0.0, 0.0}, 4.0, StampRules::EBend::Right, Cfg);
	TestEqual(TEXT("도장 지름 = 바둑돌 × 3/4"), D, 1.65, 1e-9);
	TestEqual(TEXT("앞으로 절반"), Arm.Hand.Y, 2.0 * D, 1e-9);
	TestEqual(TEXT("오른쪽으로 절반"), Arm.Hand.X, 2.0 * D, 1e-9);
	TestTrue(TEXT("딱 맞닿음은 겹침 아님"), StampRules::FindOverlap(StampRules::FVec2{D, 0.0}, {StampRules::FStamp{1, StampRules::FVec2{0.0, 0.0}, 1}}, Cfg) < 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStampRulesJudgeTest, "StampOmok.Rules.Judge",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FStampRulesJudgeTest::RunTest(const FString& Parameters)
{
	const StampRules::FRulesConfig Cfg;
	const double D = StampRules::StampDiameter(Cfg);
	std::vector<StampRules::FStamp> Row;
	for (int32 I = 0; I < 5; ++I)
	{
		Row.push_back(StampRules::FStamp{I + 1, StampRules::FVec2{(I - 2) * 1.2 * D, 0.0}, 0});
	}
	TestTrue(TEXT("가로 다섯 줄 승리"), StampRules::JudgeRuler(StampRules::FRuler{StampRules::FVec2{0.0, 0.0}, 0.0}, Row, 0, Cfg).bSuccess);
	TestTrue(TEXT("자가 비켜나면 개수 부족"),
		StampRules::JudgeRuler(StampRules::FRuler{StampRules::FVec2{0.0, 0.5 * D}, 0.0}, Row, 0, Cfg).Code == StampRules::EJudgeCode::NotEnough);
	Row.push_back(StampRules::FStamp{99, StampRules::FVec2{-0.6 * D, 0.0}, 1});
	Row[1].P.X = -2.0 * D;
	Row[0].P.X = -4.0 * D;
	Row[2].P.X = 0.0;
	Row[3].P.X = 2.0 * D;
	Row[4].P.X = 4.0 * D;
	Row.back().P.X = -1.0 * D;
	TestTrue(TEXT("상대 도장이 막으면 무효"),
		StampRules::JudgeRuler(StampRules::FRuler{StampRules::FVec2{0.0, 0.0}, 0.0}, Row, 0, Cfg).Code == StampRules::EJudgeCode::Blocked);
	return true;
}

#endif
