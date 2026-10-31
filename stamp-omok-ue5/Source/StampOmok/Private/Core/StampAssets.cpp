// 에셋 경로와 대체물
#include "Core/StampAssets.h"

#include "Core/StampOmokSettings.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/PackageName.h"
#include "Sound/SoundBase.h"
#include "StampOmok.h"

namespace StampAssets
{
	namespace AssetsDetail
	{
		template <typename T>
		T* LoadByName(const TCHAR* Folder, const TCHAR* Name)
		{
			const FString Path = FString::Printf(TEXT("/Game/StampOmok/%s/%s.%s"), Folder, Name, Name);
			// 경로가 없을 때 경고를 남기지 않도록 먼저 패키지 존재를 확인
			if (!FPackageName::DoesPackageExist(FString::Printf(TEXT("/Game/StampOmok/%s/%s"), Folder, Name)))
			{
				return nullptr;
			}
			return LoadObject<T>(nullptr, *Path);
		}
	}

	UMaterialInterface* FindMaterial(const TCHAR* Name)
	{
		return AssetsDetail::LoadByName<UMaterialInterface>(TEXT("Materials"), Name);
	}

	UTexture* FindTexture(const TCHAR* Name)
	{
		return AssetsDetail::LoadByName<UTexture>(TEXT("Textures"), Name);
	}

	USoundBase* FindSound(const TCHAR* Name)
	{
		return AssetsDetail::LoadByName<USoundBase>(TEXT("Audio"), Name);
	}

	UStaticMesh* EngineShape(const TCHAR* Name)
	{
		const FString Path = FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Name, Name);
		return LoadObject<UStaticMesh>(nullptr, *Path);
	}

	UMaterialInterface* EngineBasicMaterial()
	{
		return LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	}

	UMaterialInstanceDynamic* MakeMaterial(UObject* Outer, const TCHAR* Name, const FLinearColor& FallbackColor)
	{
		UMaterialInterface* Parent = FindMaterial(Name);
		if (!Parent)
		{
			Parent = EngineBasicMaterial();
		}
		if (!Parent)
		{
			return nullptr;
		}
		UMaterialInstanceDynamic* Mid = UMaterialInstanceDynamic::Create(Parent, Outer);
		Mid->SetVectorParameterValue(TEXT("Color"), FallbackColor);
		Mid->SetVectorParameterValue(TEXT("Tint"), FallbackColor);
		return Mid;
	}

	bool HasProjectAssets()
	{
		return FindMaterial(TEXT("M_Hanji")) != nullptr && FindMaterial(TEXT("MD_Ink")) != nullptr;
	}

	void PlaySfx(const UObject* WorldContext, const TCHAR* Name, float Volume, float PitchJitter)
	{
		USoundBase* Sound = FindSound(Name);
		if (!Sound || !WorldContext)
		{
			return;
		}
		const float Master = UStampOmokSettings::Get().SfxVolume;
		const float Pitch = 1.f + FMath::FRandRange(-PitchJitter, PitchJitter);
		UGameplayStatics::PlaySound2D(WorldContext, Sound, Volume * Master, Pitch);
	}
}
