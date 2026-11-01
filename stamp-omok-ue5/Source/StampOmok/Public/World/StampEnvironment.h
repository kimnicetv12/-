// 마루 위 오후 햇빛: 해, 하늘빛, 대기, 옅은 안개, 문살 그림자
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StampEnvironment.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;
class USkyAtmosphereComponent;
class UExponentialHeightFogComponent;
class UInstancedStaticMeshComponent;

UCLASS()
class STAMPOMOK_API AStampEnvironment : public AActor
{
	GENERATED_BODY()

public:
	AStampEnvironment();

	virtual void BeginPlay() override;

	/** 문살 그림자 켜고 끄기 */
	void SetLatticeShadow(bool bEnabled);

private:
	void BuildLattice();

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UDirectionalLightComponent> Sun;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USkyLightComponent> SkyLight;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USkyAtmosphereComponent> Atmosphere;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UExponentialHeightFogComponent> Fog;

	/** 화면에는 안 보이고 그림자만 드리우는 띠살문 */
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UInstancedStaticMeshComponent> Lattice;
};
