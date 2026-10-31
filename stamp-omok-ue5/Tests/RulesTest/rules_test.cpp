// 규칙 엔진 단위 테스트 — 언리얼 없이 표준 C++ 컴파일러로 실행
//   g++ -std=c++17 -I Source/StampOmok/Public Tests/RulesTest/rules_test.cpp Source/StampOmok/Private/Core/StampRules.cpp -o rules_test && ./rules_test
#include "Core/StampRules.h"

#include <cstdio>
#include <functional>
#include <string>

using namespace StampRules;

static int GFailed = 0;
static int GTotal = 0;
static std::string GCurrent;

#define EXPECT(cond)                                                                 \
	do                                                                               \
	{                                                                                \
		if (!(cond))                                                                 \
		{                                                                            \
			std::printf("  FAIL %s\n       %s:%d  %s\n", GCurrent.c_str(), __FILE__, __LINE__, #cond); \
			throw 1;                                                                 \
		}                                                                            \
	} while (0)

static bool Near(double A, double B, double Eps = 1e-6) { return std::fabs(A - B) <= Eps; }
static double Deg(double V) { return V * Pi / 180.0; }

static void Test(const char* Name, const std::function<void()>& Fn)
{
	++GTotal;
	GCurrent = Name;
	try
	{
		Fn();
		std::printf("  ok   %s\n", Name);
	}
	catch (...)
	{
		++GFailed;
	}
}

/** 중심 C에서 Angle 방향으로 Spacing 간격의 N개 도장 */
static std::vector<FStamp> RowOf(int N, FVec2 C, double Angle, double Spacing, int Owner = 0, int FirstId = 1)
{
	std::vector<FStamp> Out;
	const double Mid = (N - 1) / 2.0;
	for (int I = 0; I < N; ++I)
	{
		Out.push_back(FStamp{FirstId + I, FVec2{C.X + std::cos(Angle) * (I - Mid) * Spacing, C.Y + std::sin(Angle) * (I - Mid) * Spacing}, Owner});
	}
	return Out;
}

static std::vector<FStamp> Concat(std::vector<FStamp> A, const std::vector<FStamp>& B)
{
	A.insert(A.end(), B.begin(), B.end());
	return A;
}

int main()
{
	const FRulesConfig Def;
	const double D = StampDiameter(Def);

	Test("도장 지름은 바둑돌의 3/4", [&] {
		EXPECT(Near(D, 1.65));
		FRulesConfig C;
		C.StoneDiameterCm = 4.0;
		EXPECT(Near(StampDiameter(C), 3.0));
	});

	Test("L자 팔: 앞(위)으로 절반, 직각으로 꺾여 절반", [&] {
		const FArm R = ComputeArm(FVec2{10, 10}, 4, EBend::Right, Def);
		EXPECT(Near(R.Elbow.X, 10) && Near(R.Elbow.Y, 10 + 2 * D));
		EXPECT(Near(R.Hand.X, 10 + 2 * D) && Near(R.Hand.Y, 10 + 2 * D));
		const FArm L = ComputeArm(FVec2{10, 10}, 4, EBend::Left, Def);
		EXPECT(Near(L.Hand.X, 10 - 2 * D) && Near(L.Hand.Y, 10 + 2 * D));
	});

	Test("팔 길이는 최소·최대로 잘림", [&] {
		EXPECT(Near(ComputeArm(FVec2{}, 99, EBend::Right, Def).Length, 12 * D));
		EXPECT(Near(ComputeArm(FVec2{}, 0, EBend::Right, Def).Length, 0.5 * D));
	});

	Test("위팔 비율과 다른 앞 방향", [&] {
		FRulesConfig C;
		C.ArmSplit = 0.25;
		const FArm R = ComputeArm(FVec2{}, 4, EBend::Right, C);
		EXPECT(Near(R.Hand.Y, D) && Near(R.Hand.X, 3 * D));
		// 앞이 오른쪽(+X)이면 오른쪽으로 꺾음 = 아래(−Y)
		const FArm F = ComputeArm(FVec2{}, 2, EBend::Right, Def, FVec2{1, 0});
		EXPECT(Near(F.Hand.X, D) && Near(F.Hand.Y, -D));
	});

	Test("손떨림 0이면 그대로, 있으면 3σ 안", [&] {
		FRulesConfig C;
		C.ArmJitter = 0;
		const FVec2 P{1, 2};
		const FVec2 Q = ApplyJitter(P, C, 0.3, 0.7);
		EXPECT(Q.X == P.X && Q.Y == P.Y);
		C.ArmJitter = 0.1;
		unsigned Seed = 1;
		auto Rng = [&] { Seed = Seed * 1103515245u + 12345u; return ((Seed >> 8) & 0xFFFFFF) / double(0x1000000); };
		for (int I = 0; I < 2000; ++I)
		{
			const FVec2 J = ApplyJitter(P, C, Rng(), Rng());
			EXPECT(std::hypot(J.X - P.X, J.Y - P.Y) <= 3 * 0.1 * D + 1e-9);
		}
	});

	Test("겹침: 중심 거리 < 지름이면 겹침, 딱 맞닿음은 허용", [&] {
		const std::vector<FStamp> S{FStamp{1, FVec2{0, 0}, 1}};
		EXPECT(FindOverlap(FVec2{D - 0.01, 0}, S, Def) == 0);
		EXPECT(FindOverlap(FVec2{D, 0}, S, Def) == -1);
		EXPECT(FindOverlap(FVec2{0, 1.5 * D}, S, Def) == -1);
	});

	Test("최소제곱 피팅: 가로·세로·대각선", [&] {
		auto Pts = [](const std::vector<FStamp>& S) { std::vector<FVec2> P; for (auto& X : S) P.push_back(X.P); return P; };
		const FLineFit H = FitLineLeastSquares(Pts(RowOf(5, FVec2{}, 0, 2)));
		EXPECT(Near(LineAngleDiff(H.Angle, 0), 0) && Near(H.MaxResidual, 0));
		const FLineFit V = FitLineLeastSquares(Pts(RowOf(5, FVec2{3, 7}, Pi / 2, 2)));
		EXPECT(Near(LineAngleDiff(V.Angle, Pi / 2), 0) && Near(V.Center.X, 3) && Near(V.Center.Y, 7));
		const FLineFit G = FitLineLeastSquares(Pts(RowOf(5, FVec2{}, Deg(-35), 2)));
		EXPECT(Near(LineAngleDiff(G.Angle, Deg(-35)), 0, 1e-9));
	});

	Test("최소제곱 피팅: 잔차와 가장 먼 점", [&] {
		std::vector<FVec2> P;
		for (int I = 0; I < 5; ++I) P.push_back(FVec2{I * 2.0, I == 2 ? 1.0 : 0.0});
		const FLineFit F = FitLineLeastSquares(P);
		EXPECT(F.Worst == 2);
		EXPECT(Near(F.MaxResidual, 0.8, 1e-6));
	});

	Test("직선 각도 차는 방향과 무관", [&] {
		EXPECT(Near(LineAngleDiff(Deg(10), Deg(190)), 0, 1e-9));
		EXPECT(Near(LineAngleDiff(Deg(-80), Deg(80)), Deg(20), 1e-9));
	});

	Test("조합 개수: 7C5 = 21", [&] {
		int N = 0;
		ForEachCombination(7, 5, [&](const int*) { ++N; return false; });
		EXPECT(N == 21);
		EXPECT(!ForEachCombination(3, 5, [](const int*) { return true; }));
	});

	Test("자 판정: 30° 다섯 줄 성공", [&] {
		const FVec2 C{5, -2};
		const FJudgeResult R = JudgeRuler(FRuler{C, Deg(30)}, RowOf(5, C, Deg(30), 1.2 * D), 0, Def);
		EXPECT(R.bSuccess && R.Code == EJudgeCode::Win && R.ChosenIds.size() == 5);
	});

	Test("자가 줄에서 0.5D 비켜나면 띠 밖 → 개수 부족", [&] {
		const FJudgeResult R = JudgeRuler(FRuler{FVec2{0, 0.5 * D}, 0}, RowOf(5, FVec2{}, 0, 1.2 * D), 0, Def);
		EXPECT(!R.bSuccess && R.Code == EJudgeCode::NotEnough);
	});

	Test("8°는 통과, 12°는 끝 도장이 띠 밖, 각도 허용 5°면 어긋남", [&] {
		const auto Row = RowOf(5, FVec2{}, 0, 1.2 * D);
		EXPECT(JudgeRuler(FRuler{FVec2{}, Deg(8)}, Row, 0, Def).bSuccess);
		EXPECT(JudgeRuler(FRuler{FVec2{}, Deg(12)}, Row, 0, Def).Code == EJudgeCode::NotEnough);
		FRulesConfig C;
		C.AngleToleranceDeg = 5;
		EXPECT(JudgeRuler(FRuler{FVec2{}, Deg(8)}, Row, 0, C).Code == EJudgeCode::Misaligned);
	});

	Test("띠 안이지만 지그재그면 직선성 실패", [&] {
		const double Ys[5] = {0.3, 0.3, -0.3, 0.3, 0.3};
		std::vector<FStamp> S;
		for (int I = 0; I < 5; ++I) S.push_back(FStamp{I + 1, FVec2{I * 1.2 * D, Ys[I] * D}, 0});
		const FJudgeResult R = JudgeRuler(FRuler{FVec2{2.4 * D, 0}, 0}, S, 0, Def);
		EXPECT(R.Code == EJudgeCode::NotStraight && R.WorstId == 3);
	});

	Test("이웃 간격이 너무 넓음", [&] {
		const double Xs[5] = {0, 1.2, 2.4, 3.6, 6.1};
		std::vector<FStamp> S;
		for (int I = 0; I < 5; ++I) S.push_back(FStamp{I + 1, FVec2{Xs[I] * D, 0}, 0});
		const FJudgeResult R = JudgeRuler(FRuler{FVec2{3.05 * D, 0}, 0}, S, 0, Def);
		EXPECT(R.Code == EJudgeCode::Gap && R.GapAt == 4);
		FRulesConfig C;
		C.MaxGap = 0;
		EXPECT(JudgeRuler(FRuler{FVec2{3.05 * D, 0}, 0}, S, 0, C).bSuccess);
	});

	Test("상대 도장이 사이를 막음", [&] {
		const auto Mine = RowOf(5, FVec2{}, 0, 2 * D);
		const std::vector<FStamp> Opp{FStamp{99, FVec2{-D, 0}, 1}};
		EXPECT(FindOverlap(Opp[0].P, Mine, Def) == -1);
		const FJudgeResult R = JudgeRuler(FRuler{FVec2{}, 0}, Concat(Mine, Opp), 0, Def);
		EXPECT(R.Code == EJudgeCode::Blocked && R.BlockerId == 99);
		FRulesConfig C;
		C.bBlockByOpponent = false;
		EXPECT(JudgeRuler(FRuler{FVec2{}, 0}, Concat(Mine, Opp), 0, C).bSuccess);
	});

	Test("줄 바깥쪽 상대 도장은 막지 않음", [&] {
		const std::vector<FStamp> Opp{FStamp{99, FVec2{3.6 * D, 0}, 1}};
		EXPECT(JudgeRuler(FRuler{FVec2{}, 0}, Concat(RowOf(5, FVec2{}, 0, 1.2 * D), Opp), 0, Def).bSuccess);
	});

	Test("여섯 개 줄도 승리, 상대 도장은 개수에 안 들어감", [&] {
		EXPECT(JudgeRuler(FRuler{FVec2{}, 0}, RowOf(6, FVec2{}, 0, 1.2 * D), 0, Def).bSuccess);
		auto Mixed = RowOf(5, FVec2{}, 0, 1.2 * D);
		for (int I = 3; I < 5; ++I) Mixed[static_cast<size_t>(I)].Owner = 1;
		const FJudgeResult R = JudgeRuler(FRuler{FVec2{}, 0}, Mixed, 0, Def);
		EXPECT(R.Code == EJudgeCode::NotEnough && R.CandidateIds.size() == 3);
	});

	Test("줄 위 바깥값 하나가 끼어도 나머지 다섯으로 승리", [&] {
		const double Xs[5] = {0, 1.2, 2.4, 3.6, 4.8};
		std::vector<FStamp> S;
		for (int I = 0; I < 5; ++I) S.push_back(FStamp{I + 1, FVec2{Xs[I] * D, 0}, 0});
		S.push_back(FStamp{6, FVec2{1.8 * D, 0.33 * D}, 0});
		EXPECT(JudgeRuler(FRuler{FVec2{2.4 * D, 0}, 0}, S, 0, Def).bSuccess);
	});

	Test("자 길이 밖 도장은 후보가 아님", [&] {
		FRulesConfig C;
		C.RulerLength = 6;
		EXPECT(RulerCandidates(FRuler{FVec2{}, 0}, RowOf(5, FVec2{}, 0, 2 * D), 0, C).size() == 3);
	});

	std::printf("\n%d/%d 통과\n", GTotal - GFailed, GTotal);
	return GFailed ? 1 : 0;
}
