// Integration: every real stage decodes, builds a sound world and can be
// driven from start to finish by the robot driver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeStage } from '../src/world/stageData.js';
import { prepareStage } from '../src/game/prepare.js';
import { Vehicle } from '../src/physics/vehicle.js';
import { Autopilot } from '../src/game/autopilot.js';
import { STAGES } from '../src/game/stages.js';

for (const meta of STAGES) {
  test(`stage ${meta.id}`, async () => {
    const json = JSON.parse(await readFile(new URL(`../stages/${meta.id}.json`, import.meta.url), 'utf8'));
    const stage = await decodeStage(json);
    const w = prepareStage(stage);
    const { road, terrain, scenery, env } = w;

    // world sanity
    assert.ok(Math.abs(road.length - stage.length) < 10);
    const P = terrain.positions, I = terrain.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ny = (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]);
      assert.ok(ny >= 0, 'terrain triangle faces down');
    }
    const g = {};
    for (let i = 0; i < road.n; i += 5) {
      terrain.ground.query(road.x[i], road.z[i], g);
      assert.ok(Math.abs(g.y - w.surface.profile(road.y[i], 0)) < 0.15, `road surface off at s=${i * road.step}`);
    }
    let maxGrade = 0;
    for (let i = 0; i < road.n; i++) maxGrade = Math.max(maxGrade, Math.abs(road.grade[i]));
    assert.ok(maxGrade < (stage.landmarks.length ? 0.32 : 0.14), `max grade ${maxGrade}`);
    const p = {};
    for (const c of scenery.obstacles.circles) {
      if (road.project(c.x, c.z, p, 10)) assert.ok(p.d > road.halfWidth + 0.5, `tree on road at s=${p.s}`);
    }

    // drive it
    const car = new Vehicle(stage.surface, { finalDrive: stage.finalDrive });
    car.reset(road.x[2], road.z[2], Math.atan2(road.tx[2], -road.tz[2]), env.ground);
    const ap = new Autopilot(road, stage.surface, 0.6);
    const DT = 1 / 360;
    let t = 0, resets = 0, stuck = 0, done = false;
    while (t < 1800) {
      const pr = env.locate(car.position.x, car.position.z);
      if (pr.s >= road.length - 5) { done = true; break; }
      const c = ap.drive(car, pr);
      for (let k = 0; k < 6; k++) car.step(DT, c, env);
      t += DT * 6;
      assert.ok(Number.isFinite(car.position.x) && Number.isFinite(car.velocity.y));
      stuck = Math.abs(car.speed) < 1 ? stuck + DT * 6 : 0;
      if (pr.d > 25 || stuck > 4) {
        resets++;
        stuck = 0;
        const i = Math.max(2, pr.i - 10);
        car.reset(road.x[i], road.z[i], Math.atan2(road.tx[i], -road.tz[i]), env.ground);
        env.setHint(i);
      }
    }
    assert.ok(done, 'robot driver did not reach the finish');
    assert.ok(resets < 30, `too many resets: ${resets}`);
  });
}
