// 선반 메시 생성기 검사 — 노멀 방향과 언리얼 앞면 규칙(감김 방향)
//   g++ -std=c++17 -I Source/StampOmok/Public Tests/RulesTest/lathe_test.cpp -o lathe_test && ./lathe_test
#include "Core/StampLathe.h"

#include <cstdio>

using namespace StampLathe;

static int GFail = 0;
#define CHECK(cond, msg)                         \
	do                                           \
	{                                            \
		if (!(cond))                             \
		{                                        \
			std::printf("  FAIL %s\n", msg);     \
			++GFail;                             \
		}                                        \
		else                                     \
		{                                        \
			std::printf("  ok   %s\n", msg);     \
		}                                        \
	} while (0)

/** 닫힌 메시의 부호 있는 부피 (오른손 규칙 기준). 언리얼 앞면 규칙이면 음수가 나와야 한다 */
static double SignedVolume(const FMeshData& M)
{
	double V = 0.0;
	for (size_t I = 0; I < M.Triangles.size(); I += 3)
	{
		const double* A = &M.Positions[static_cast<size_t>(M.Triangles[I]) * 3];
		const double* B = &M.Positions[static_cast<size_t>(M.Triangles[I + 1]) * 3];
		const double* C = &M.Positions[static_cast<size_t>(M.Triangles[I + 2]) * 3];
		V += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6.0;
	}
	return V;
}

int main()
{
	// 반지름 1, 높이 2 원기둥 (아래 뚜껑 → 옆면 → 위 뚜껑)
	const std::vector<FProfilePoint> Cyl = {{0, 0, false}, {1, 0, false}, {1, 2, false}, {0, 2, false}};
	const FMeshData M = Build(Cyl, 64);

	bool bAllFront = true, bOutward = true, bUnit = true;
	for (size_t I = 0; I < M.Triangles.size(); I += 3)
	{
		const double* A = &M.Positions[static_cast<size_t>(M.Triangles[I]) * 3];
		const double* B = &M.Positions[static_cast<size_t>(M.Triangles[I + 1]) * 3];
		const double* C = &M.Positions[static_cast<size_t>(M.Triangles[I + 2]) * 3];
		const double E1[3] = {B[0] - A[0], B[1] - A[1], B[2] - A[2]};
		const double E2[3] = {C[0] - A[0], C[1] - A[1], C[2] - A[2]};
		const double Cr[3] = {E1[1] * E2[2] - E1[2] * E2[1], E1[2] * E2[0] - E1[0] * E2[2], E1[0] * E2[1] - E1[1] * E2[0]};
		const double* N = &M.Normals[static_cast<size_t>(M.Triangles[I]) * 3];
		if (Cr[0] * N[0] + Cr[1] * N[1] + Cr[2] * N[2] >= 0) bAllFront = false;
		// 삼각형 무게중심에서 바깥 방향과 노멀이 같은 쪽인지
		const double Cx = (A[0] + B[0] + C[0]) / 3, Cy = (A[1] + B[1] + C[1]) / 3, Cz = (A[2] + B[2] + C[2]) / 3;
		const double Out[3] = {Cx, Cy, Cz - 1.0};
		if (Out[0] * N[0] + Out[1] * N[1] + Out[2] * N[2] <= 0) bOutward = false;
	}
	for (size_t I = 0; I < M.Normals.size(); I += 3)
	{
		const double L = M.Normals[I] * M.Normals[I] + M.Normals[I + 1] * M.Normals[I + 1] + M.Normals[I + 2] * M.Normals[I + 2];
		if (std::fabs(L - 1.0) > 1e-9) bUnit = false;
	}
	CHECK(!M.Triangles.empty(), "삼각형이 만들어짐");
	CHECK(bAllFront, "모든 삼각형이 언리얼 앞면 규칙((b-a)x(c-a)가 노멀 반대)");
	CHECK(bOutward, "노멀이 바깥을 향함");
	CHECK(bUnit, "노멀 길이 1");
	const double Vol = SignedVolume(M);
	const double Expect = -3.141592653589793 * 1 * 1 * 2;
	CHECK(std::fabs(Vol - Expect) < 0.02 * std::fabs(Expect), "닫힌 원기둥의 부호 있는 부피가 -πr²h (일관된 감김)");

	// 매끈한 단면 (도장 손잡이 모양)에서도 같은 규칙
	const std::vector<FProfilePoint> Knob = {{0, 0, false}, {0.8, 0, false}, {0.8, 0.3, false}, {0.62, 2.6, true}, {0.45, 2.9, true}, {0.6, 3.25, true}, {0.4, 3.55, true}, {0, 3.62, false}};
	const FMeshData K = Build(Knob, 48);
	CHECK(SignedVolume(K) < 0, "손잡이 모양도 일관된 감김(부피 음수)");

	std::printf("\n%s\n", GFail ? "실패 있음" : "모두 통과");
	return GFail ? 1 : 0;
}
