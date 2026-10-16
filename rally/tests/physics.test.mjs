// Headless checks that the car behaves like a Rally2 car should.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vehicle } from '../src/physics/vehicle.js';
import { flatEnv, DT, run } from './helpers.mjs';

const idle = () => ({ steer: 0, throttle: 0, brake: 0, handbrake: 0 });
const setupFor = (s) => (s === 'tarmac' ? 'tarmac' : s === 'snow' ? 'snow' : 'gravel');

test('settles at rest on its springs', () => {
  for (const surf of ['tarmac', 'gravel', 'snow']) {
    const env = flatEnv(surf);
    const car = new Vehicle(setupFor(surf));
    car.reset(0, 0, 0, env.ground);
    run(car, env, 3, idle);
    assert.ok(car.velocity.length() < 0.01, `${surf} still moving`);
    const total = car.wheels.reduce((a, w) => a + w.Fz, 0);
    assert.ok(Math.abs(total - car.mass * 9.81) < 50, `${surf} wheel loads ${total}`);
    for (const w of car.wheels) assert.ok(Math.abs(w.L - car.setup.L0) < 0.01);
  }
});

function zeroTo100(surf) {
  const env = flatEnv(surf);
  const car = new Vehicle(setupFor(surf), { finalDrive: 4.4 });
  car.reset(0, 0, 0, env.ground);
  run(car, env, 1, idle);
  let t = 0;
  while (car.speed * 3.6 < 100 && t < 20) {
    car.step(DT, { steer: 0, throttle: 1, brake: 0, handbrake: 0 }, env);
    t += DT;
  }
  return t;
}

test('0-100 km/h times are in the Rally2 range', () => {
  const tar = zeroTo100('tarmac');
  const gra = zeroTo100('gravel');
  const sno = zeroTo100('snow');
  assert.ok(tar > 3.6 && tar < 5.0, `tarmac ${tar}`);
  assert.ok(gra > tar && gra < 5.6, `gravel ${gra}`);
  assert.ok(sno > gra && sno < 7.5, `snow ${sno}`);
});

function brakingDistance(surf) {
  const env = flatEnv(surf);
  const car = new Vehicle(setupFor(surf), { assists: { autoGear: false } });
  car.reset(0, 0, 0, env.ground);
  run(car, env, 1, idle);
  car.velocity.set(0, 0, -100 / 3.6);
  for (const w of car.wheels) w.omega = 100 / 3.6 / 0.325;
  car.gear = 4;
  const z0 = car.position.z;
  let t = 0;
  while (car.speed > 0.3 && t < 10) {
    car.step(DT, { steer: 0, throttle: 0, brake: 1, handbrake: 0 }, env);
    t += DT;
  }
  return z0 - car.position.z;
}

test('100-0 km/h braking distances depend on the surface', () => {
  const tar = brakingDistance('tarmac');
  const gra = brakingDistance('gravel');
  const sno = brakingDistance('snow');
  assert.ok(tar > 33 && tar < 48, `tarmac ${tar}`);
  assert.ok(gra > tar && gra < 62, `gravel ${gra}`);
  assert.ok(sno > gra && sno < 90, `snow ${sno}`);
});

test('peak lateral grip ranks tarmac > gravel > snow', () => {
  const peak = {};
  for (const surf of ['tarmac', 'gravel', 'snow']) {
    const env = flatEnv(surf);
    const car = new Vehicle(setupFor(surf), { finalDrive: 4.4 });
    car.reset(0, 0, 0, env.ground);
    car.velocity.set(0, 0, -25);
    for (const w of car.wheels) w.omega = 25 / 0.325;
    car.gear = 2;
    let maxLat = 0;
    run(car, env, 8, (t, c) => {
      const lat = Math.abs(c.velocity.length() * c.angularVelocity.y) / 9.81;
      if (t > 1) maxLat = Math.max(maxLat, lat);
      return { steer: Math.min(1, (t / 8) * 0.5), throttle: Math.max(0, Math.min(1, 0.3 + (25 - c.speed) * 0.5)), brake: 0, handbrake: 0 };
    });
    peak[surf] = maxLat;
  }
  assert.ok(peak.tarmac > 0.95 && peak.tarmac < 1.35, JSON.stringify(peak));
  assert.ok(peak.gravel > 0.7 && peak.gravel < peak.tarmac, JSON.stringify(peak));
  assert.ok(peak.snow > 0.5 && peak.snow < peak.gravel, JSON.stringify(peak));
});

test('holds on a 20% slope with the handbrake or footbrake', () => {
  for (const surf of ['tarmac', 'gravel', 'snow']) {
    for (const mode of ['handbrake', 'brake']) {
      const env = flatEnv(surf, 0.2);
      const car = new Vehicle(setupFor(surf), { assists: { autoGear: false } });
      car.reset(0, 0, 0.7, env.ground);
      const inp = { steer: 0, throttle: 0, brake: mode === 'brake' ? 1 : 0, handbrake: mode === 'handbrake' ? 1 : 0 };
      run(car, env, 2, () => inp);
      const p0 = car.position.clone();
      run(car, env, 5, () => inp);
      assert.ok(car.position.distanceTo(p0) < 0.02, `${surf} ${mode} crept ${car.position.distanceTo(p0)}`);
    }
  }
});

test('handbrake rotates the car for a hairpin', () => {
  const env = flatEnv('gravel');
  const car = new Vehicle('gravel');
  car.reset(0, 0, 0, env.ground);
  run(car, env, 0.5, idle);
  car.velocity.set(0, 0, -16);
  for (const w of car.wheels) w.omega = 16 / 0.325;
  car.gear = 2;
  run(car, env, 2.5, (t) => ({ steer: t < 2 ? 0.8 : 0, throttle: t > 0.6 ? 0.6 : 0.2, brake: 0, handbrake: t > 0.1 && t < 0.6 ? 1 : 0 }));
  const f = car.forward;
  const heading = (Math.atan2(f.x, -f.z) * 180) / Math.PI;
  assert.ok(heading > 90, `turned ${heading}`);
});

test('stays finite and upright-recoverable under 2 minutes of random inputs', () => {
  const env = flatEnv('gravel');
  const car = new Vehicle('gravel');
  car.reset(0, 0, 0, env.ground);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let inp = idle();
  run(car, env, 120, (t) => {
    if (Math.round(t / DT) % 180 === 0) inp = { steer: rnd() * 2 - 1, throttle: rnd(), brake: rnd() < 0.2 ? rnd() : 0, handbrake: rnd() < 0.1 ? 1 : 0 };
    return inp;
  });
  for (const v of [car.position.x, car.position.y, car.position.z, car.velocity.x, car.engine.rpm]) assert.ok(Number.isFinite(v));
  assert.ok(car.position.y > 0 && car.position.y < 3);
});

test('auto gearbox does not hunt during a wheelspin launch on snow', () => {
  const env = flatEnv('snow');
  const car = new Vehicle('snow');
  car.reset(0, 0, 0, env.ground);
  let shifts = 0;
  run(car, env, 4, (t, c) => {
    for (const e of c.events) if (e.type === 'shift') shifts++;
    c.events.length = 0;
    return { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  });
  assert.ok(shifts <= 3, `shifts ${shifts}`);
});
