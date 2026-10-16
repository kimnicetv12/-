// A simple robot driver (pure pursuit + braking-distance speed planner).
// Used by the headless tests to drive whole stages, and by the menu's
// attract/demo mode.

import { SURFACES, STAGE_SURFACES } from '../physics/surfaces.js';

export class Autopilot {
  constructor(road, stageSurface, aggression = 0.82) {
    this.road = road;
    const mu = SURFACES[STAGE_SURFACES[stageSurface].road].mu;
    this.mu = mu;
    const n = road.n;
    const vmax = new Float64Array(n);
    const g = 9.81;
    for (let i = 0; i < n; i++) {
      const k = Math.max(Math.abs(road.curvature[i]), 1e-4);
      let v = Math.sqrt((mu * aggression * g) / k);
      // don't take sharp crests flat out
      if (road.vcurv[i] < -1e-3) v = Math.min(v, Math.sqrt(g / -road.vcurv[i]) * 1.25);
      vmax[i] = Math.min(v, 54);
    }
    const aBrake = mu * aggression * g * 0.75;
    for (let i = n - 2; i >= 0; i--) {
      vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[i + 1] ** 2 + 2 * aBrake * road.step));
    }
    this.vmax = vmax;
    this.tmp = {};
  }

  /** Returns controls for the car given its road projection. */
  drive(car, proj) {
    const road = this.road;
    const v = car.speed;
    const look = Math.max(7, Math.min(32, 5 + 0.55 * Math.abs(v)));
    const t = road.sample(proj.s + look, this.tmp);
    const p = car.position;
    // target into car frame
    const dx = t.x - p.x, dz = t.z - p.z;
    const f = car.forward;
    const fx = f.x, fz = f.z;
    const lx = dx * -fz + dz * fx; // right
    const lz = dx * fx + dz * fz; // forward
    const alpha = Math.atan2(lx, lz);
    const delta = Math.atan((2 * 2.55 * Math.sin(alpha)) / look);
    // Stanley-style cross-track correction keeps it off the verges
    const cte = Math.atan((1.4 * -proj.u) / (Math.abs(v) + 3));
    let steer = (delta + cte * 0.6) / 0.54;
    // catch slides: opposite lock proportional to the car's slip angle
    const inv = car.quaternion.clone().invert();
    const lv = car.velocity.clone().applyQuaternion(inv);
    const beta = Math.abs(v) > 3 ? Math.atan2(lv.x, -lv.z) : 0;
    steer += beta * 1.5;
    const iAhead = Math.min(road.n - 1, Math.floor((proj.s + Math.max(4, v * 0.35)) / road.step));
    const vt = this.vmax[iAhead];
    let throttle = 0, brake = 0;
    // leave grip for cornering: the friction circle is shared with traction
    const kHere = Math.abs(road.curvature[proj.i]);
    const latUse = Math.min(1, (v * v * kHere) / (this.mu * 9.81));
    const maxThrottle = Math.max(0.3, 1 - latUse * latUse * 1.1);
    if (v < vt) throttle = Math.min(maxThrottle, 0.35 + (vt - v) * 0.4);
    else if (v > vt + 0.8) brake = Math.min(1, (v - vt) * 0.25);
    else throttle = 0.25;
    if (Math.abs(beta) > 0.18) throttle *= 0.5;
    return { steer: Math.max(-1, Math.min(1, steer)), throttle, brake, handbrake: 0 };
  }
}
