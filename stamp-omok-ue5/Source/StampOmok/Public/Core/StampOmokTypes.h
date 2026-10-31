// 도장오목 공용 타입과 좌표 변환
#pragma once

#include "CoreMinimal.h"
#include "Core/StampRules.h"

/** 대국 진행 단계 */
enum class EStampPhase : uint8
{
	Menu,       // 대국 전 (메인 메뉴 뒤 장식 판)
	Handoff,    // 턴 교체 가림막
	Stamp,      // 판 가림, 팔 기준점·길이·방향 입력
	Animating,  // 팔이 뻗어 도장을 찍는 중
	Ruler,      // 판 공개, 자 놓기
	Judging,    // 자를 따라 판정 중
	Result,     // 판정 실패 결과 (판 공개 유지)
	Over        // 승리
};

namespace StampOmok
{
	constexpr int32 PlayerCount = 2;

	/** 한지 윗면 높이 (cm). 마루 바닥 윗면이 0 */
	constexpr float PaperZ = 0.08f;

	struct FPlayerLook
	{
		FText Name;
		FLinearColor Ink;        // 인주 색 (선형)
		FLinearColor Lacquer;    // 팔·손잡이 옻칠 색 (선형)
		FLinearColor UiInk;      // UI 버튼·글자용 색 (Slate는 선형 색을 받아 sRGB로 출력)
		const TCHAR* SealKey;    // 텍스처 이름 조각: Shu / Ai
	};

	/** 0 = 주홍(朱), 1 = 쪽빛(藍) */
	const FPlayerLook& PlayerLook(int32 Index);

	/** 보드 좌표(X 오른쪽, Y 앞) → 월드 좌표(X 앞, Y 오른쪽, Z 위) */
	inline FVector BoardToWorld(const StampRules::FVec2& P, double Z = PaperZ)
	{
		return FVector(P.Y, P.X, Z);
	}

	inline StampRules::FVec2 WorldToBoard(const FVector& W)
	{
		return StampRules::FVec2{W.Y, W.X};
	}

	/** 보드 각도(+X 기준 반시계, 라디안) → 월드 Yaw(도) */
	inline float BoardAngleToYaw(double Angle)
	{
		return static_cast<float>(90.0 - FMath::RadiansToDegrees(Angle));
	}

	/** sRGB 8비트 색 → 선형 색 */
	inline FLinearColor Srgb(uint8 R, uint8 G, uint8 B, float A = 1.f)
	{
		return FLinearColor(FColor(R, G, B)).CopyWithNewOpacity(A);
	}

	inline double Dist(const StampRules::FVec2& A, const StampRules::FVec2& B)
	{
		return FMath::Sqrt((A.X - B.X) * (A.X - B.X) + (A.Y - B.Y) * (A.Y - B.Y));
	}
}
