// 선반(회전체) 메시 생성기 — 언리얼 의존성 없음 (g++로 감김 방향을 검사)
//
// 단면(반지름 R, 높이 Z)을 Z축으로 돌려 도장 손잡이·팔 받침 같은 회전체를 만든다.
// 단면은 아래 중심(R=0)에서 바깥으로, 위로, 다시 위 중심으로 가는 순서로 준다.
//
// 언리얼의 앞면 규칙: 삼각형 (a, b, c)에서 (b−a)×(c−a)가 바깥 노멀과 반대를 향해야 앞면이다
// (KismetProceduralMeshLibrary::GenerateBoxMesh 와 같은 규칙). 아래 bUnrealFrontFace 로 바꿀 수 있다.
#pragma once

#include <cmath>
#include <vector>

namespace StampLathe
{
	struct FProfilePoint
	{
		double R = 0.0;
		double Z = 0.0;
		bool bSmooth = false;   // true면 앞뒤 구간의 노멀을 평균해 매끈하게 잇는다
	};

	struct FMeshData
	{
		std::vector<double> Positions;  // x, y, z 반복
		std::vector<double> Normals;    // x, y, z 반복
		std::vector<double> Tangents;   // x, y, z 반복 (U 증가 방향)
		std::vector<double> UVs;        // u, v 반복
		std::vector<int> Triangles;
	};

	inline FMeshData Build(const std::vector<FProfilePoint>& Profile, int Segments, bool bUnrealFrontFace = true)
	{
		constexpr double TwoPi = 6.283185307179586;
		FMeshData Mesh;
		const int Count = static_cast<int>(Profile.size());
		if (Count < 2 || Segments < 3)
		{
			return Mesh;
		}

		// 구간별 단면 노멀 (dz, −dr) — 단면이 아래→위로 갈 때 바깥을 향함
		std::vector<double> SegNr(static_cast<size_t>(Count - 1)), SegNz(static_cast<size_t>(Count - 1)), SegLen(static_cast<size_t>(Count - 1));
		double TotalLen = 0.0;
		for (int I = 0; I < Count - 1; ++I)
		{
			const double Dr = Profile[static_cast<size_t>(I + 1)].R - Profile[static_cast<size_t>(I)].R;
			const double Dz = Profile[static_cast<size_t>(I + 1)].Z - Profile[static_cast<size_t>(I)].Z;
			const double Len = std::sqrt(Dr * Dr + Dz * Dz);
			SegLen[static_cast<size_t>(I)] = Len;
			SegNr[static_cast<size_t>(I)] = Len > 0.0 ? Dz / Len : 0.0;
			SegNz[static_cast<size_t>(I)] = Len > 0.0 ? -Dr / Len : 1.0;
			TotalLen += Len;
		}

		auto PointNormal = [&](int PointIndex, int SegIndex, double& OutNr, double& OutNz)
		{
			const FProfilePoint& P = Profile[static_cast<size_t>(PointIndex)];
			double Nr = SegNr[static_cast<size_t>(SegIndex)];
			double Nz = SegNz[static_cast<size_t>(SegIndex)];
			if (P.bSmooth)
			{
				const int Other = PointIndex == SegIndex ? SegIndex - 1 : SegIndex + 1;
				if (Other >= 0 && Other < Count - 1)
				{
					Nr += SegNr[static_cast<size_t>(Other)];
					Nz += SegNz[static_cast<size_t>(Other)];
				}
			}
			const double L = std::sqrt(Nr * Nr + Nz * Nz);
			OutNr = L > 0.0 ? Nr / L : 0.0;
			OutNz = L > 0.0 ? Nz / L : 1.0;
		};

		double LenSoFar = 0.0;
		for (int Seg = 0; Seg < Count - 1; ++Seg)
		{
			if (SegLen[static_cast<size_t>(Seg)] <= 0.0)
			{
				continue;
			}
			const int Base = static_cast<int>(Mesh.Positions.size() / 3);
			for (int End = 0; End < 2; ++End)
			{
				const int PIdx = Seg + End;
				const FProfilePoint& P = Profile[static_cast<size_t>(PIdx)];
				double Nr = 0.0, Nz = 0.0;
				PointNormal(PIdx, Seg, Nr, Nz);
				const double V = (LenSoFar + (End ? SegLen[static_cast<size_t>(Seg)] : 0.0)) / (TotalLen > 0.0 ? TotalLen : 1.0);
				for (int S = 0; S <= Segments; ++S)
				{
					const double Theta = TwoPi * S / Segments;
					const double C = std::cos(Theta), Sn = std::sin(Theta);
					Mesh.Positions.insert(Mesh.Positions.end(), {P.R * C, P.R * Sn, P.Z});
					Mesh.Normals.insert(Mesh.Normals.end(), {Nr * C, Nr * Sn, Nz});
					Mesh.Tangents.insert(Mesh.Tangents.end(), {-Sn, C, 0.0});
					Mesh.UVs.insert(Mesh.UVs.end(), {static_cast<double>(S) / Segments, V});
				}
			}
			LenSoFar += SegLen[static_cast<size_t>(Seg)];

			const int Ring = Segments + 1;
			for (int S = 0; S < Segments; ++S)
			{
				const int A0 = Base + S, A1 = Base + S + 1;           // 아래 고리
				const int B0 = Base + Ring + S, B1 = Base + Ring + S + 1; // 위 고리
				const int Quad[2][3] = {{A0, B0, A1}, {A1, B0, B1}};
				for (const auto& T : Quad)
				{
					// 삼각형 면 노멀과 꼭짓점 노멀 평균을 비교해 감김 방향을 맞춘다
					const double* Pa = &Mesh.Positions[static_cast<size_t>(T[0]) * 3];
					const double* Pb = &Mesh.Positions[static_cast<size_t>(T[1]) * 3];
					const double* Pc = &Mesh.Positions[static_cast<size_t>(T[2]) * 3];
					const double E1[3] = {Pb[0] - Pa[0], Pb[1] - Pa[1], Pb[2] - Pa[2]};
					const double E2[3] = {Pc[0] - Pa[0], Pc[1] - Pa[1], Pc[2] - Pa[2]};
					const double Cr[3] = {E1[1] * E2[2] - E1[2] * E2[1], E1[2] * E2[0] - E1[0] * E2[2], E1[0] * E2[1] - E1[1] * E2[0]};
					const double CrLen = std::sqrt(Cr[0] * Cr[0] + Cr[1] * Cr[1] + Cr[2] * Cr[2]);
					if (CrLen < 1e-12)
					{
						continue;   // 극점에서 생기는 넓이 0 삼각형은 버림
					}
					double N[3] = {0, 0, 0};
					for (int K = 0; K < 3; ++K)
					{
						const double* Nk = &Mesh.Normals[static_cast<size_t>(T[K]) * 3];
						N[0] += Nk[0];
						N[1] += Nk[1];
						N[2] += Nk[2];
					}
					const double Dot = Cr[0] * N[0] + Cr[1] * N[1] + Cr[2] * N[2];
					const bool bFlip = bUnrealFrontFace ? Dot > 0.0 : Dot < 0.0;
					if (bFlip)
					{
						Mesh.Triangles.insert(Mesh.Triangles.end(), {T[0], T[2], T[1]});
					}
					else
					{
						Mesh.Triangles.insert(Mesh.Triangles.end(), {T[0], T[1], T[2]});
					}
				}
			}
		}
		return Mesh;
	}
}
