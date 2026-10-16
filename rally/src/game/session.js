// One run of a stage: car, timing, splits, penalties, resets, co-driver.
import { Vehicle, SETUPS } from '../physics/vehicle.js';
import { generatePaceNotes, CoDriver } from './pacenotes.js';

export const STEP = 1 / 360;
const RESET_PENALTY = 5;
const CUT_PENALTY = 10;

export class StageRun {
  constructor(prepared, settings, meta) {
    this.p = prepared;
    this.meta = meta;
    const { stage, road } = prepared;
    const base = SETUPS[stage.surface];
    const setup = {
      brakeBias: settings.brakeBias,
      kF: base.kF * settings.springScale,
      kR: base.kR * settings.springScale,
      lsdR: [base.lsdR[0], settings.rearLsd],
    };
    this.car = new Vehicle(stage.surface, {
      finalDrive: stage.finalDrive * (1 - settings.finalOffset * 0.25),
      setup,
      assists: {
        autoGear: settings.autoGear,
        abs: settings.abs,
        tcs: settings.tcs,
        counterSteer: settings.counterSteer ? 0.8 : false,
      },
    });
    this.notes = generatePaceNotes(road, stage.landmarks);
    this.codriver = new CoDriver(this.notes, { voice: settings.voice });
    this.finishS = road.length - 25;
    this.splitS = [road.length / 3, (2 * road.length) / 3];
    this.messages = [];
    this.restart();
  }

  restart() {
    this.state = 'countdown';
    this.countdown = 5.2;
    this.time = 0;
    this.penalty = 0;
    this.resets = 0;
    this.splits = [];
    this.finishTime = null;
    this.acc = 0;
    this.s = 2;
    this.maxS = 2;
    this.offTimer = 0;
    this.flipTimer = 0;
    this.stuckTimer = 0;
    this.topSpeed = 0;
    this.distance = 0;
    this.afterFinish = 0;
    this.placeAt(2);
    this.codriver.reset(0);
  }

  placeAt(s) {
    const { road, env } = this.p;
    const i = Math.max(1, Math.min(road.n - 3, Math.floor(s / road.step)));
    const heading = Math.atan2(road.tx[i], -road.tz[i]);
    this.car.reset(road.x[i], road.z[i], heading, env.ground);
    env.setHint(i);
    this.s = this.maxS = i * road.step;
  }

  /** Put the car back on the road a little behind where it left it. */
  resetToRoad(reason = '복귀', penalty = RESET_PENALTY) {
    if (this.state === 'finished') return;
    const back = Math.max(2, this.maxS - 12);
    this.placeAt(back);
    this.codriver.reset(back);
    if (this.state === 'running') {
      this.penalty += penalty;
      this.resets++;
      this.messages.push(`${reason} +${penalty}초`);
    }
    this.offTimer = this.flipTimer = this.stuckTimer = 0;
  }

  /** Advance by a frame. input is mutated for countdown / finish overrides. */
  update(dt, input) {
    const car = this.car;
    const { env, road } = this.p;
    const inp = { ...input };

    if (this.state === 'countdown') {
      this.countdown -= dt;
      inp.handbrake = 1; // held on the line; you may build revs
      inp.brake = Math.max(inp.brake, 0.4);
      if (this.countdown <= 0) {
        this.state = 'running';
        this.messages.push('GO');
      }
    } else if (this.state === 'finished') {
      this.afterFinish += dt;
      inp.throttle = 0;
      inp.brake = Math.min(0.7, this.afterFinish * 0.5);
      inp.handbrake = 0;
    }

    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 40) {
      car.step(STEP, inp, env);
      this.acc -= STEP;
      n++;
    }
    if (this.state === 'running') this.time += dt;

    // progress along the stage
    const prevS = this.s;
    const pr = env.locate(car.position.x, car.position.z);
    const travelled = car.velocity.length() * dt;
    this.distance += travelled;
    this.topSpeed = Math.max(this.topSpeed, car.speed);
    if (this.state === 'running' && pr.s - prevS > travelled + 30) {
      // jumped to another part of the road (cutting a hairpin across the hillside)
      this.messages.push('코스 컷');
      this.resetToRoad('코스 컷', CUT_PENALTY);
      return;
    }
    this.s = pr.s;
    if (pr.d < road.halfWidth + 12) this.maxS = Math.max(this.maxS, pr.s);
    this.proj = pr;

    // splits / finish
    if (this.state === 'running') {
      for (let k = 0; k < this.splitS.length; k++) {
        if (this.splits.length === k && this.maxS >= this.splitS[k]) {
          this.splits.push(this.time + this.penalty);
          this.messages.push(`split:${k}`);
        }
      }
      if (this.maxS >= this.finishS) {
        this.state = 'finished';
        this.finishTime = this.time + this.penalty;
        this.messages.push('finish');
      }
    }

    // automatic recovery
    if (this.state === 'running') {
      const carUpY = 1 - 2 * (car.quaternion.x ** 2 + car.quaternion.z ** 2);
      this.offTimer = pr.d > road.halfWidth + 28 ? this.offTimer + dt : 0;
      this.flipTimer = carUpY < 0.25 && car.velocity.length() < 2 ? this.flipTimer + dt : 0;
      this.stuckTimer = Math.abs(car.speed) < 0.6 && inp.throttle > 0.5 ? this.stuckTimer + dt : 0;
      if (this.offTimer > 2.5) this.resetToRoad('코스 이탈');
      else if (this.flipTimer > 2.5) this.resetToRoad('전복');
      else if (this.stuckTimer > 7) this.messages.push('hint:stuck');
      this.codriver.update(this.maxS, Math.max(0, car.speed));
    }
  }

  get total() {
    return this.time + this.penalty;
  }
}
