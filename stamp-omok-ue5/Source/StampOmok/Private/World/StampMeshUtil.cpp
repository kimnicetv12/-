// 메시 배치 도우미
#include "World/StampMeshUtil.h"

#include "Components/StaticMeshComponent.h"
#include "ProceduralMeshComponent.h"

namespace StampMeshUtil
{
	void BuildLathe(UProceduralMeshComponent* Comp, int32 Section, const std::vector<StampLathe::FProfilePoint>& Profile, int32 Segments)
	{
		if (!Comp)
		{
			return;
		}
		const StampLathe::FMeshData Data = StampLathe::Build(Profile, Segments, true);
		const int32 Num = static_cast<int32>(Data.Positions.size() / 3);
		TArray<FVector> Vertices;
		TArray<FVector> Normals;
		TArray<FVector2D> UVs;
		TArray<FProcMeshTangent> Tangents;
		TArray<int32> Triangles;
		Vertices.Reserve(Num);
		Normals.Reserve(Num);
		UVs.Reserve(Num);
		Tangents.Reserve(Num);
		for (int32 I = 0; I < Num; ++I)
		{
			const size_t K = static_cast<size_t>(I) * 3;
			Vertices.Add(FVector(Data.Positions[K], Data.Positions[K + 1], Data.Positions[K + 2]));
			Normals.Add(FVector(Data.Normals[K], Data.Normals[K + 1], Data.Normals[K + 2]));
			Tangents.Add(FProcMeshTangent(FVector(Data.Tangents[K], Data.Tangents[K + 1], Data.Tangents[K + 2]), false));
			UVs.Add(FVector2D(Data.UVs[static_cast<size_t>(I) * 2], Data.UVs[static_cast<size_t>(I) * 2 + 1]));
		}
		Triangles.Reserve(static_cast<int32>(Data.Triangles.size()));
		for (int T : Data.Triangles)
		{
			Triangles.Add(T);
		}
		Comp->CreateMeshSection_LinearColor(Section, Vertices, Triangles, Normals, UVs, TArray<FLinearColor>(), Tangents, false);
	}

	void PlaceRod(UStaticMeshComponent* Rod, const FVector& A, const FVector& B, double Radius)
	{
		if (!Rod)
		{
			return;
		}
		const FVector Delta = B - A;
		const double Length = Delta.Size();
		if (Length < 0.01)
		{
			Rod->SetVisibility(false);
			return;
		}
		Rod->SetVisibility(true);
		const FRotator Rot = FRotationMatrix::MakeFromZ(Delta / Length).Rotator();
		Rod->SetRelativeLocationAndRotation((A + B) * 0.5, Rot);
		Rod->SetRelativeScale3D(FVector(Radius * 2.0 / 100.0, Radius * 2.0 / 100.0, Length / 100.0));
	}

	void PlacePlane(UStaticMeshComponent* Plane, const FVector& Center, double SizeX, double SizeY, double YawDeg)
	{
		if (!Plane)
		{
			return;
		}
		Plane->SetRelativeLocationAndRotation(Center, FRotator(0.0, YawDeg, 0.0));
		Plane->SetRelativeScale3D(FVector(SizeX / 100.0, SizeY / 100.0, 1.0));
	}
}
