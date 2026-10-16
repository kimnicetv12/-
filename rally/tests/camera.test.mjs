// Regression: every camera mode must look along the road, wherever the car
// is in the world (the bonnet/bumper cameras once aimed into the sky because
// world coordinates leaked into the look-at target).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { Vehicle } from '../src/physics/vehicle.js';
import { CameraRig, CAMERA_MODES } from '../src/render/cameraRig.js';
import { planeGround } from './helpers.mjs';

function groundAt(height) {
  const g = planeGround(0.04);
  return { query: (x, z, out) => { g.query(x, z, out); out.y += height; return true; } };
}

for (const mode of CAMERA_MODES) {
  test(`${mode} camera looks forward from high above the origin`, () => {
    const ground = groundAt(1500); // like the Col de Turini, 1.5 km up
    const car = new Vehicle('tarmac');
    car.reset(2500, -1800, 2.1, ground);
    car.velocity.copy(car.forward).multiplyScalar(20);
    const cam = new PerspectiveCamera(60, 4 / 3, 0.3, 5000);
    const rig = new CameraRig(cam, ground);
    rig.setMode(mode);
    for (let i = 0; i < 90; i++) rig.update(car, 1 / 60, 0.2);
    cam.updateMatrixWorld();
    const look = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const fwd = car.forward.clone();
    assert.ok(look.dot(fwd) > 0.9, `${mode}: look·forward = ${look.dot(fwd).toFixed(3)}`);
    assert.ok(Math.abs(look.y) < 0.35, `${mode}: pitched ${look.y.toFixed(3)}`);
    const dist = cam.position.distanceTo(car.position);
    assert.ok(dist < (rig.attached ? 3 : 12), `${mode}: ${dist.toFixed(1)} m from the car`);
    if (!rig.attached) {
      const toCar = car.position.clone().sub(cam.position).normalize();
      assert.ok(toCar.dot(fwd) > 0.7, `${mode}: not behind the car`);
    }
  });
}
