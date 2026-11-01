// 도장오목 공용 타입
#include "Core/StampOmokTypes.h"

namespace StampOmok
{
	const FPlayerLook& PlayerLook(int32 Index)
	{
		static const FPlayerLook Looks[PlayerCount] = {
			FPlayerLook{
				FText::FromString(TEXT("주홍")),
				Srgb(176, 38, 22),
				Srgb(150, 32, 22),
				Srgb(200, 52, 31),
				TEXT("Shu")},
			FPlayerLook{
				FText::FromString(TEXT("쪽빛")),
				Srgb(34, 62, 128),
				Srgb(30, 48, 96),
				Srgb(43, 75, 140),
				TEXT("Ai")},
		};
		return Looks[FMath::Clamp(Index, 0, PlayerCount - 1)];
	}
}
