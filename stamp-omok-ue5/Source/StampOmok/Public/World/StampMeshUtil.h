// 메시 배치 도우미
#pragma once

#include "CoreMinimal.h"
#include "Core/StampLathe.h"

class UProceduralMeshComponent;
class UStaticMeshComponent;

namespace StampMeshUtil
{
	/** 선반 단면으로 회전체 섹션을 만든다 (단위 cm) */
	void BuildLathe(UProceduralMeshComponent* Comp, int32 Section, const std::vector<StampLathe::FProfilePoint>& Profile, int32 Segments);

	/** 엔진 원기둥(높이 100, 지름 100, 중심 기준)을 부모 공간의 A→B 막대로 놓는다. 길이가 거의 0이면 숨긴다 */
	void PlaceRod(UStaticMeshComponent* Rod, const FVector& A, const FVector& B, double Radius);

	/** 엔진 평면(100×100, +Z를 향함)을 부모 공간의 중심·크기·Yaw로 놓는다 */
	void PlacePlane(UStaticMeshComponent* Plane, const FVector& Center, double SizeX, double SizeY, double YawDeg);
}
