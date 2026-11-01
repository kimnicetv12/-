// 도장오목 규칙 엔진 구현 (언리얼 의존성 없음)
#include "Core/StampRules.h"

#include <algorithm>

namespace StampRules
{
	namespace RulesDetail
	{
		constexpr double Epsilon = 1e-9;

		double Clamp(double V, double Lo, double Hi)
		{
			return std::min(Hi, std::max(Lo, V));
		}

		/** 다섯 점 한 묶음 평가 결과 (단계가 높을수록 승리에 가까움) */
		struct FLineEval
		{
			int Stage = 0;
			double Score = 0.0;
			EJudgeCode Code = EJudgeCode::NotStraight;
			FLineFit Fit;
			std::vector<int> Ordered;    // Stamps 인덱스, 줄 순서
			double AngleDiff = 0.0;
			double Offset = 0.0;
			double MaxGap = 0.0;
			int GapAt = -1;
			int Blocker = -1;
			int Worst = -1;
		};

		FLineEval EvaluateLine(const std::vector<int>& Picked, const FRuler& Ruler, const std::vector<FStamp>& Stamps, int Owner, const FRulesConfig& Cfg)
		{
			const double D = StampDiameter(Cfg);
			const double Tol = Cfg.LineTolerance * D;

			std::vector<FVec2> Points;
			Points.reserve(Picked.size());
			for (int Index : Picked)
			{
				Points.push_back(Stamps[static_cast<size_t>(Index)].P);
			}

			FLineEval Eval;
			Eval.Fit = FitLineLeastSquares(Points);
			Eval.Worst = Picked[static_cast<size_t>(Eval.Fit.Worst)];

			// 줄 순서(피팅 방향 투영값)로 정렬
			std::vector<std::pair<double, int>> Order;
			for (int Index : Picked)
			{
				Order.emplace_back(ProjectOnLine(Stamps[static_cast<size_t>(Index)].P, Eval.Fit.Center, Eval.Fit.Angle).T, Index);
			}
			std::sort(Order.begin(), Order.end());
			for (const auto& Item : Order)
			{
				Eval.Ordered.push_back(Item.second);
			}

			// ① 직선성
			if (Eval.Fit.MaxResidual > Tol + Epsilon)
			{
				Eval.Stage = 1;
				Eval.Score = Eval.Fit.MaxResidual;
				Eval.Code = EJudgeCode::NotStraight;
				return Eval;
			}

			// ② 자 정렬 (각도 + 위치)
			Eval.AngleDiff = LineAngleDiff(Eval.Fit.Angle, Ruler.Angle);
			Eval.Offset = std::fabs(ProjectOnLine(Eval.Fit.Center, Ruler.Center, Ruler.Angle).D);
			if (Eval.AngleDiff * 180.0 / Pi > Cfg.AngleToleranceDeg + Epsilon || Eval.Offset > Tol + Epsilon)
			{
				Eval.Stage = 2;
				Eval.Score = Eval.AngleDiff;
				Eval.Code = EJudgeCode::Misaligned;
				return Eval;
			}

			// ③ 이웃 간격
			for (size_t I = 1; I < Eval.Ordered.size(); ++I)
			{
				const FVec2& A = Stamps[static_cast<size_t>(Eval.Ordered[I - 1])].P;
				const FVec2& B = Stamps[static_cast<size_t>(Eval.Ordered[I])].P;
				const double Gap = std::hypot(B.X - A.X, B.Y - A.Y);
				if (Gap > Eval.MaxGap)
				{
					Eval.MaxGap = Gap;
					Eval.GapAt = static_cast<int>(I);
				}
			}
			if (Cfg.MaxGap > 0.0 && Eval.MaxGap > Cfg.MaxGap * D + Epsilon)
			{
				Eval.Stage = 3;
				Eval.Score = Eval.MaxGap;
				Eval.Code = EJudgeCode::Gap;
				return Eval;
			}

			// ④ 상대 도장이 줄 사이를 가로막는지
			if (Cfg.bBlockByOpponent)
			{
				const double TMin = Order.front().first;
				const double TMax = Order.back().first;
				for (size_t I = 0; I < Stamps.size(); ++I)
				{
					if (Stamps[I].Owner == Owner)
					{
						continue;
					}
					const FProjection R = ProjectOnLine(Stamps[I].P, Eval.Fit.Center, Eval.Fit.Angle);
					if (R.T > TMin && R.T < TMax && std::fabs(R.D) < D / 2.0)
					{
						Eval.Stage = 4;
						Eval.Score = -std::fabs(R.D);
						Eval.Code = EJudgeCode::Blocked;
						Eval.Blocker = static_cast<int>(I);
						return Eval;
					}
				}
			}

			Eval.Stage = 5;
			Eval.Score = 0.0;
			Eval.Code = EJudgeCode::Win;
			return Eval;
		}
	}

	double StampDiameter(const FRulesConfig& Cfg)
	{
		return Cfg.StoneDiameterCm * Cfg.StampRatio;
	}

	FArm ComputeArm(const FVec2& Start, double LengthD, EBend Bend, const FRulesConfig& Cfg, const FVec2& Forward)
	{
		const double D = StampDiameter(Cfg);
		const double L = RulesDetail::Clamp(LengthD, Cfg.ArmMinLength, Cfg.ArmMaxLength) * D;
		FArm Arm;
		Arm.Length = L;
		Arm.Upper = L * Cfg.ArmSplit;
		Arm.Fore = L - Arm.Upper;
		// y가 위쪽인 좌표계에서 앞 방향을 시계방향 90° 돌리면 오른쪽: (x, y) → (y, −x)
		const double S = Bend == EBend::Right ? 1.0 : -1.0;
		const FVec2 Side{Forward.Y * S, -Forward.X * S};
		Arm.Start = Start;
		Arm.Elbow = FVec2{Start.X + Forward.X * Arm.Upper, Start.Y + Forward.Y * Arm.Upper};
		Arm.Hand = FVec2{Arm.Elbow.X + Side.X * Arm.Fore, Arm.Elbow.Y + Side.Y * Arm.Fore};
		return Arm;
	}

	FVec2 ApplyJitter(const FVec2& P, const FRulesConfig& Cfg, double U1, double U2)
	{
		const double Sigma = Cfg.ArmJitter * StampDiameter(Cfg);
		if (!(Sigma > 0.0))
		{
			return P;
		}
		const double R = std::min(std::sqrt(-2.0 * std::log(std::max(U1, 1e-12))), 3.0) * Sigma;
		return FVec2{P.X + R * std::cos(2.0 * Pi * U2), P.Y + R * std::sin(2.0 * Pi * U2)};
	}

	int FindOverlap(const FVec2& P, const std::vector<FStamp>& Stamps, const FRulesConfig& Cfg)
	{
		const double D = StampDiameter(Cfg);
		for (size_t I = 0; I < Stamps.size(); ++I)
		{
			if (std::hypot(Stamps[I].P.X - P.X, Stamps[I].P.Y - P.Y) < D - RulesDetail::Epsilon)
			{
				return static_cast<int>(I);
			}
		}
		return -1;
	}

	FProjection ProjectOnLine(const FVec2& P, const FVec2& Origin, double Angle)
	{
		const double Ux = std::cos(Angle);
		const double Uy = std::sin(Angle);
		const double Dx = P.X - Origin.X;
		const double Dy = P.Y - Origin.Y;
		return FProjection{Dx * Ux + Dy * Uy, -Dx * Uy + Dy * Ux};
	}

	double LineAngleDiff(double A, double B)
	{
		const double Diff = std::fmod(std::fabs(A - B), Pi);
		return std::min(Diff, Pi - Diff);
	}

	FLineFit FitLineLeastSquares(const std::vector<FVec2>& Points)
	{
		FLineFit Fit;
		const double N = static_cast<double>(Points.size());
		if (Points.empty())
		{
			return Fit;
		}
		double Mx = 0.0;
		double My = 0.0;
		for (const FVec2& P : Points)
		{
			Mx += P.X;
			My += P.Y;
		}
		Mx /= N;
		My /= N;
		double Sxx = 0.0;
		double Syy = 0.0;
		double Sxy = 0.0;
		for (const FVec2& P : Points)
		{
			const double Dx = P.X - Mx;
			const double Dy = P.Y - My;
			Sxx += Dx * Dx;
			Syy += Dy * Dy;
			Sxy += Dx * Dy;
		}
		Fit.Center = FVec2{Mx, My};
		Fit.Angle = 0.5 * std::atan2(2.0 * Sxy, Sxx - Syy);
		Fit.Dir = FVec2{std::cos(Fit.Angle), std::sin(Fit.Angle)};
		double SumSq = 0.0;
		for (size_t I = 0; I < Points.size(); ++I)
		{
			const double R = std::fabs(ProjectOnLine(Points[I], Fit.Center, Fit.Angle).D);
			Fit.Residuals.push_back(R);
			SumSq += R * R;
			if (R > Fit.MaxResidual)
			{
				Fit.MaxResidual = R;
				Fit.Worst = static_cast<int>(I);
			}
		}
		Fit.Rms = std::sqrt(SumSq / N);
		return Fit;
	}

	std::vector<FCandidate> RulerCandidates(const FRuler& Ruler, const std::vector<FStamp>& Stamps, int Owner, const FRulesConfig& Cfg)
	{
		const double D = StampDiameter(Cfg);
		const double Tol = Cfg.LineTolerance * D;
		const double Half = Cfg.RulerLength * D / 2.0;
		std::vector<FCandidate> Out;
		for (size_t I = 0; I < Stamps.size(); ++I)
		{
			if (Stamps[I].Owner != Owner)
			{
				continue;
			}
			const FProjection R = ProjectOnLine(Stamps[I].P, Ruler.Center, Ruler.Angle);
			if (std::fabs(R.D) <= Tol && std::fabs(R.T) <= Half)
			{
				Out.push_back(FCandidate{static_cast<int>(I), R.T, R.D});
			}
		}
		return Out;
	}

	FJudgeResult JudgeRuler(const FRuler& Ruler, const std::vector<FStamp>& Stamps, int Owner, const FRulesConfig& Cfg)
	{
		FJudgeResult Result;
		const int Need = Cfg.WinCount;
		std::vector<FCandidate> Cands = RulerCandidates(Ruler, Stamps, Owner, Cfg);
		for (const FCandidate& C : Cands)
		{
			Result.CandidateIds.push_back(Stamps[static_cast<size_t>(C.Index)].Id);
		}
		if (static_cast<int>(Cands.size()) < Need)
		{
			Result.Code = EJudgeCode::NotEnough;
			Result.Stage = 0;
			return Result;
		}

		// 자에 가까운 순으로 최대 12개만 조합 탐색 (12C5 = 792가지)
		std::sort(Cands.begin(), Cands.end(), [](const FCandidate& A, const FCandidate& B) { return std::fabs(A.D) < std::fabs(B.D); });
		if (Cands.size() > 12)
		{
			Cands.resize(12);
		}
		std::sort(Cands.begin(), Cands.end(), [](const FCandidate& A, const FCandidate& B) { return A.T < B.T; });

		bool bHasBest = false;
		RulesDetail::FLineEval Best;
		std::vector<int> Picked(static_cast<size_t>(Need));
		ForEachCombination(static_cast<int>(Cands.size()), Need, [&](const int* Idx)
		{
			for (int I = 0; I < Need; ++I)
			{
				Picked[static_cast<size_t>(I)] = Cands[static_cast<size_t>(Idx[I])].Index;
			}
			RulesDetail::FLineEval Eval = RulesDetail::EvaluateLine(Picked, Ruler, Stamps, Owner, Cfg);
			if (!bHasBest || Eval.Stage > Best.Stage || (Eval.Stage == Best.Stage && Eval.Score < Best.Score))
			{
				Best = Eval;
				bHasBest = true;
			}
			return Eval.Stage == 5;
		});

		Result.bSuccess = Best.Stage == 5;
		Result.Code = Best.Code;
		Result.Stage = Best.Stage;
		Result.Score = Best.Score;
		Result.bHasFit = true;
		Result.Fit = Best.Fit;
		Result.AngleDiff = Best.AngleDiff;
		Result.Offset = Best.Offset;
		Result.MaxGap = Best.MaxGap;
		Result.GapAt = Best.GapAt;
		for (int Index : Best.Ordered)
		{
			Result.ChosenIds.push_back(Stamps[static_cast<size_t>(Index)].Id);
		}
		Result.BlockerId = Best.Blocker >= 0 ? Stamps[static_cast<size_t>(Best.Blocker)].Id : -1;
		Result.WorstId = Best.Worst >= 0 ? Stamps[static_cast<size_t>(Best.Worst)].Id : -1;
		return Result;
	}
}
