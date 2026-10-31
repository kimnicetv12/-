// 도장오목 규칙 엔진 — 언리얼 엔진에 의존하지 않는 순수 C++ (g++로 단위 테스트 가능)
//
// 보드 좌표계: X = 오른쪽, Y = 앞쪽(화면 위). 단위는 cm.
// 월드 좌표로 옮길 때는 월드 X = 보드 Y, 월드 Y = 보드 X (StampOmokTypes.h 참고).
#pragma once

#include <cmath>
#include <vector>

namespace StampRules
{
	constexpr double Pi = 3.14159265358979323846;

	struct FVec2
	{
		double X = 0.0;
		double Y = 0.0;
	};

	/** 규칙 설정. 길이 값은 따로 적지 않으면 '도장 지름(D)'의 배수 */
	struct FRulesConfig
	{
		double StoneDiameterCm = 2.2;   // 기준 바둑돌 지름 (cm)
		double StampRatio = 0.75;       // 도장 지름 = 바둑돌 지름 × 3/4
		int WinCount = 5;               // 한 줄로 입증할 도장 수
		double LineTolerance = 0.35;    // 도장 중심 ↔ 직선 최대 거리 (D)
		double AngleToleranceDeg = 10.0;// 피팅 직선과 자의 각도 차 허용 (도)
		double MaxGap = 2.0;            // 줄 안 이웃 도장 중심 간 최대 간격 (D, 0 = 검사 안 함)
		bool bBlockByOpponent = true;   // 다섯 사이를 상대 도장이 막으면 무효
		double RulerLength = 9.0;       // 자 길이 (D)
		double ArmMinLength = 0.5;      // 팔 최소 길이 (D)
		double ArmMaxLength = 12.0;     // 팔 최대 길이 (D)
		double ArmSplit = 0.5;          // 위팔(앞으로 뻗는 구간) 비율
		double ArmJitter = 0.06;        // 손떨림 표준편차 (D)
	};

	struct FStamp
	{
		int Id = 0;
		FVec2 P;
		int Owner = 0;
	};

	enum class EBend
	{
		Left,
		Right
	};

	struct FArm
	{
		FVec2 Start;
		FVec2 Elbow;
		FVec2 Hand;      // 손떨림 적용 전 착지점
		double Upper = 0.0;
		double Fore = 0.0;
		double Length = 0.0;
	};

	struct FProjection
	{
		double T = 0.0;  // 직선 방향 성분
		double D = 0.0;  // 부호 있는 수직 거리
	};

	struct FLineFit
	{
		FVec2 Center;
		double Angle = 0.0;
		FVec2 Dir;
		std::vector<double> Residuals;
		double MaxResidual = 0.0;
		int Worst = 0;
		double Rms = 0.0;
	};

	/** 자: 중심과 방향(보드 +X 기준 반시계 라디안) */
	struct FRuler
	{
		FVec2 Center;
		double Angle = 0.0;
	};

	struct FCandidate
	{
		int Index = 0;   // Stamps 배열 인덱스
		double T = 0.0;
		double D = 0.0;
	};

	enum class EJudgeCode
	{
		NotEnough,
		NotStraight,
		Misaligned,
		Gap,
		Blocked,
		Win
	};

	struct FJudgeResult
	{
		bool bSuccess = false;
		EJudgeCode Code = EJudgeCode::NotEnough;
		int Stage = 0;
		double Score = 0.0;
		std::vector<int> CandidateIds;   // 자의 허용 띠 안에 든 내 도장 Id
		std::vector<int> ChosenIds;      // 평가한 다섯 도장 Id (줄 순서)
		bool bHasFit = false;
		FLineFit Fit;
		double AngleDiff = 0.0;
		double Offset = 0.0;
		double MaxGap = 0.0;
		int GapAt = -1;                  // ChosenIds[GapAt - 1] ~ ChosenIds[GapAt] 사이가 가장 넓음
		int BlockerId = -1;
		int WorstId = -1;
	};

	/** 도장 지름(cm) = 바둑돌 지름 × 3/4 */
	double StampDiameter(const FRulesConfig& Cfg);

	/**
	 * 가상의 L자 팔
	 *   Start ─(위팔: L×Split, 앞으로)→ Elbow ─(아래팔: L×(1−Split), 직각으로 좌/우)→ Hand
	 */
	FArm ComputeArm(const FVec2& Start, double LengthD, EBend Bend, const FRulesConfig& Cfg, const FVec2& Forward = FVec2{0.0, 1.0});

	/** 손떨림: 균등분포 난수 두 개(U1, U2 ∈ [0,1))로 만든 가우시안 오차 (Box–Muller, 3σ에서 자름) */
	FVec2 ApplyJitter(const FVec2& P, const FRulesConfig& Cfg, double U1, double U2);

	/** 충돌 검사: 중심 거리 < D 이면 겹침. 겹친 도장의 인덱스, 없으면 -1 */
	int FindOverlap(const FVec2& P, const std::vector<FStamp>& Stamps, const FRulesConfig& Cfg);

	FProjection ProjectOnLine(const FVec2& P, const FVec2& Origin, double Angle);

	/** 방향이 없는 두 직선의 각도 차 (0 ~ π/2) */
	double LineAngleDiff(double A, double B);

	/** 직교 최소제곱 직선 피팅: 방향 θ = ½·atan2(2Sxy, Sxx − Syy) */
	FLineFit FitLineLeastSquares(const std::vector<FVec2>& Points);

	/** 자의 허용 띠(수직 거리 ≤ 허용 오차, 자 길이 안)에 중심이 든 내 도장 */
	std::vector<FCandidate> RulerCandidates(const FRuler& Ruler, const std::vector<FStamp>& Stamps, int Owner, const FRulesConfig& Cfg);

	/**
	 * 자 판정
	 *  ① 직선성: 최소제곱 직선에서 모든 중심이 허용 오차 이내
	 *  ② 자 정렬: 피팅 직선과 자의 각도 차, 피팅 중심 ↔ 자 직선 거리
	 *  ③ 간격: 이웃한 두 도장 중심 사이 ≤ MaxGap
	 *  ④ 가로막기: 첫 도장과 끝 도장 사이 직선 위에 상대 도장 몸통이 없어야 함
	 */
	FJudgeResult JudgeRuler(const FRuler& Ruler, const std::vector<FStamp>& Stamps, int Owner, const FRulesConfig& Cfg);

	/** N개 중 K개 조합마다 Fn(const int* Indices) 호출. Fn이 true를 돌려주면 중단하고 true 반환 */
	template <typename FnType>
	bool ForEachCombination(int N, int K, FnType&& Fn)
	{
		if (K <= 0 || K > N)
		{
			return false;
		}
		std::vector<int> Idx(static_cast<size_t>(K));
		for (int I = 0; I < K; ++I)
		{
			Idx[static_cast<size_t>(I)] = I;
		}
		for (;;)
		{
			if (Fn(Idx.data()))
			{
				return true;
			}
			int I = K - 1;
			while (I >= 0 && Idx[static_cast<size_t>(I)] == N - K + I)
			{
				--I;
			}
			if (I < 0)
			{
				return false;
			}
			++Idx[static_cast<size_t>(I)];
			for (int J = I + 1; J < K; ++J)
			{
				Idx[static_cast<size_t>(J)] = Idx[static_cast<size_t>(J - 1)] + 1;
			}
		}
	}
}
