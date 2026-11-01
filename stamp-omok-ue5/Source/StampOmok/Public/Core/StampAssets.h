// 에셋 경로와 대체물
//
// 머티리얼·텍스처·소리는 에디터 스크립트(Content/Python/stamp_omok_setup.py)가
// /Game/StampOmok 아래에 만든다. 아직 없으면 엔진 기본 에셋으로 대신해 게임은 계속 돌아간다.
#pragma once

#include "CoreMinimal.h"

class UMaterialInterface;
class UMaterialInstanceDynamic;
class UStaticMesh;
class UTexture;
class USoundBase;
class UObject;

namespace StampAssets
{
	/** /Game/StampOmok/Materials/<Name>. 없으면 nullptr */
	UMaterialInterface* FindMaterial(const TCHAR* Name);

	/** /Game/StampOmok/Textures/<Name>. 없으면 nullptr */
	UTexture* FindTexture(const TCHAR* Name);

	/** /Game/StampOmok/Audio/<Name>. 없으면 nullptr */
	USoundBase* FindSound(const TCHAR* Name);

	/** /Engine/BasicShapes/<Name> (Cube, Cylinder, Sphere, Plane, Cone) */
	UStaticMesh* EngineShape(const TCHAR* Name);

	/** 엔진 기본 도형 머티리얼 (Color 파라미터 하나) */
	UMaterialInterface* EngineBasicMaterial();

	/**
	 * 프로젝트 머티리얼로 MID를 만들고, 없으면 엔진 기본 머티리얼에 FallbackColor를 입힌 MID를 돌려준다.
	 * 둘 중 어느 쪽이든 "Color"/"Tint" 파라미터에 FallbackColor를 넣어 둔다.
	 */
	UMaterialInstanceDynamic* MakeMaterial(UObject* Outer, const TCHAR* Name, const FLinearColor& FallbackColor);

	/** 셋업 스크립트가 만든 에셋이 있는지 (없으면 화면에 안내) */
	bool HasProjectAssets();

	/** 2D 효과음 (볼륨은 설정의 효과음 음량을 곱함) */
	void PlaySfx(const UObject* WorldContext, const TCHAR* Name, float Volume = 1.f, float PitchJitter = 0.04f);
}
