// Turn a decoded stage into everything the game needs (road model, terrain
// triangles + ground index, scenery, physics environment).

import { Road } from '../world/road.js';
import { SurfaceModel, buildTerrain } from '../world/terrain.js';
import { buildScenery } from '../world/scenery.js';
import { TrackEnv } from './trackEnv.js';

export function prepareStage(stage, onProgress = () => {}) {
  const t0 = performance.now();
  const road = new Road(stage.roadPoints, stage.road.step, stage.width / 2);
  onProgress('road');
  const surface = new SurfaceModel(stage, road);
  const terrain = buildTerrain(stage, road, surface);
  onProgress('terrain');
  const scenery = buildScenery(stage, road, surface, terrain.ground);
  onProgress('scenery');
  const env = new TrackEnv(stage, road, surface, terrain, scenery);
  const ms = performance.now() - t0;
  return { stage, road, surface, terrain, scenery, env, buildMs: ms };
}

const frame = () => new Promise((r) => setTimeout(r, 0));

/** Same as prepareStage, yielding to the browser between the heavy steps. */
export async function prepareStageAsync(stage, onProgress = () => {}) {
  onProgress(0.05, '도로 모델 계산');
  await frame();
  const road = new Road(stage.roadPoints, stage.road.step, stage.width / 2);
  const surface = new SurfaceModel(stage, road);
  onProgress(0.2, '지형 삼각망 생성');
  await frame();
  const terrain = buildTerrain(stage, road, surface);
  onProgress(0.65, '나무와 도로변 배치');
  await frame();
  const scenery = buildScenery(stage, road, surface, terrain.ground);
  const env = new TrackEnv(stage, road, surface, terrain, scenery);
  onProgress(0.8, '3D 장면 구성');
  await frame();
  return { stage, road, surface, terrain, scenery, env };
}
