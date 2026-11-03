// Glue between a stage and the vehicle physics: ground queries, which
// surface each tyre is on, obstacle collisions and progress along the road.

import { SURFACES, STAGE_SURFACES } from '../physics/surfaces.js';
import { makeProjection } from '../world/road.js';

export class TrackEnv {
  constructor(stage, road, surface, terrain, scenery) {
    this.stage = stage;
    this.road = road;
    this.surfaceModel = surface;
    this.ground = terrain.ground;
    this.scenery = scenery;
    this.obstacles = scenery.obstacles;
    const kinds = STAGE_SURFACES[stage.surface];
    this.sRoad = SURFACES[kinds.road];
    this.sShoulder = SURFACES[kinds.shoulder];
    this.sOff = SURFACES[kinds.off];
    this.ice = scenery.ice;
    this.hint = 0;
    this.carProj = makeProjection();
    this.wheelProj = makeProjection();
    this.collide = (car, dt) => this.obstacles.collide(car, dt);
    this.surfaceAt = (x, z) => this.#surfaceAt(x, z);
  }

  /** Track the car along the road (call once per frame). */
  locate(x, z) {
    const r = this.road;
    const p = r.projectLocal(x, z, this.hint, 25, 40, this.carProj);
    // lost (e.g. after a reset or a long excursion): global search
    if (p.d > 45) {
      if (r.project(x, z, this.carProj, 120)) this.hint = this.carProj.i;
    } else {
      this.hint = p.i;
    }
    return this.carProj;
  }

  setHint(i) {
    this.hint = i;
  }

  #surfaceAt(x, z) {
    const p = this.road.projectLocal(x, z, this.hint, 12, 16, this.wheelProj);
    const hw = this.road.halfWidth;
    const a = Math.abs(p.u);
    if (p.d > 30) return this.sOff;
    if (a <= hw) {
      for (const z0 of this.ice) {
        if (p.s >= z0.s0 && p.s <= z0.s1 && p.u >= z0.u0 && p.u <= z0.u1) return SURFACES.ice;
      }
      return this.sRoad;
    }
    if (a <= hw + this.surfaceModel.sh) return this.sShoulder;
    return this.sOff;
  }
}
