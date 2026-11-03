// Shared helpers for headless physics tests.
import { SURFACES } from '../src/physics/surfaces.js';

/** Infinite plane with optional slope (grade along -z, i.e. "uphill north"). */
export function planeGround(grade = 0) {
  const l = Math.hypot(grade, 1);
  return {
    query(x, z, out) {
      out.y = -z * grade;
      out.nx = 0;
      out.ny = 1 / l;
      out.nz = grade / l;
      out.tri = 0;
      return true;
    },
  };
}

export function flatEnv(surface = 'tarmac', grade = 0) {
  return { ground: planeGround(grade), surfaceAt: () => SURFACES[surface] };
}

export const DT = 1 / 360;

export function run(car, env, seconds, inputFn) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    car.step(DT, inputFn(t, car), env);
  }
}
