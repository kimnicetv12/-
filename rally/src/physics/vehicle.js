// Rally2-class 4WD car dynamics.
//
//  * Rigid-body chassis (6 DOF), semi-implicit integration at a fixed sub-step.
//  * Ray-cast suspension per corner: progressive bump stops, bump/rebound
//    damping with a high-speed knee, anti-roll bars.
//  * Tyres: normalised combined-slip "magic-formula-like" friction ellipse,
//    load sensitivity, transient (relaxation-length) slip states, surface
//    dependent peak slip, slide-off and rolling resistance.
//  * Driveline: engine with torque curve, turbo + anti-lag, rev limiter,
//    auto clutch, 5-speed sequential box, Rally2 layout (no centre diff:
//    solid front/rear coupling, front & rear plate LSDs). The rotating parts
//    are solved together as an impulse constraint system each step, so
//    stiff couplings stay stable.
//  * Hydraulic handbrake opens the clutch and the rear coupling, as on the
//    real cars, so the rears can be locked for hairpins.

import { Vector3, Quaternion, Matrix4 } from 'three';
import { SURFACES } from './surfaces.js';

const G = 9.81;
const RHO = 1.225;

export const CAR = {
  name: 'Rally2 4WD',
  mass: 1390, // incl. crew
  inertia: { pitch: 2050, yaw: 2350, roll: 620 },
  wheelbase: 2.55,
  cgToFront: 1.18,
  track: 1.57,
  wheelRadius: 0.325,
  wheelInertia: 1.15,
  cdA: 0.8,
  clA: 0.42,
  engine: {
    idle: 1000,
    limiter: 7400,
    inertia: 0.17,
    clutchMax: 760,
    // rpm, Nm (1.6 turbo, 32 mm restrictor)
    torque: [[0, 120], [1000, 160], [2000, 270], [3000, 380], [4000, 425], [5000, 410], [6000, 350], [7000, 290], [7600, 240], [9000, 120]],
  },
  gears: { R: -3.25, ratios: [3.08, 2.15, 1.65, 1.32, 1.08] },
  brakeTorque: 5600,
  handbrakeTorque: 2900,
  maxSteer: 0.54, // rad at the wheel, outer
  steerRate: 5.5, // rack units per second
};

export const SETUPS = {
  gravel: { cgHeight: 0.5, L0: 0.27, droop: 0.13, bump: 0.12, kF: 36000, kR: 31000, cbF: 3300, cbR: 3000, crF: 5400, crR: 4800, arbF: 14000, arbR: 7500, brakeBias: 0.6, lsdF: [70, 0.3], lsdR: [90, 0.38], rcF: 0.12, rcR: 0.16 },
  snow: { cgHeight: 0.5, L0: 0.27, droop: 0.13, bump: 0.12, kF: 33000, kR: 29000, cbF: 3000, cbR: 2800, crF: 5000, crR: 4500, arbF: 12500, arbR: 7000, brakeBias: 0.58, lsdF: [70, 0.3], lsdR: [90, 0.4], rcF: 0.12, rcR: 0.16 },
  tarmac: { cgHeight: 0.44, L0: 0.2, droop: 0.085, bump: 0.075, kF: 64000, kR: 57000, cbF: 4400, cbR: 4000, crF: 7000, crR: 6400, arbF: 26000, arbR: 13500, brakeBias: 0.64, lsdF: [60, 0.28], lsdR: [80, 0.38], rcF: 0.08, rcR: 0.11 },
};

// Hull points (car local; +x right, +y up, -z forward) for body/ground contact.
const HULL = [
  [-0.86, -0.3, -1.95], [0.86, -0.3, -1.95], [-0.86, -0.3, 1.95], [0.86, -0.3, 1.95],
  [0, -0.34, -1.0], [0, -0.34, 1.0], [-0.88, -0.3, 0], [0.88, -0.3, 0],
  [-0.72, 0.95, -0.9], [0.72, 0.95, -0.9], [-0.72, 0.95, 0.9], [0.72, 0.95, 0.9],
  [-0.9, 0.35, -1.6], [0.9, 0.35, -1.6], [-0.9, 0.35, 1.7], [0.9, 0.35, 1.7],
];

function lerpTable(t, x) {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const a = t[i - 1], b = t[i];
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
  }
  return t[t.length - 1][1];
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const RPM = 60 / (2 * Math.PI);

/** Normalised force vs normalised combined slip (peak 1 at s = 1). */
function slipCurve(s, fall) {
  if (s < 1) return Math.sin(s * Math.PI * 0.5);
  return fall + (1 - fall) * Math.exp(-(s - 1) * 1.4);
}

class Wheel {
  constructor(index, x, z, front) {
    this.index = index;
    this.front = front;
    this.left = x < 0;
    this.mount = new Vector3(x, 0, z);
    this.L = 0;
    this.Lprev = 0;
    this.vL = 0;
    this.contact = false;
    this.Fz = 0;
    this.Fx = 0;
    this.Fy = 0;
    this.steer = 0;
    this.omega = 0;
    this.spin = 0;
    this.ux = 0;
    this.uy = 0;
    this.slipRatio = 0;
    this.slipAngle = 0;
    this.slide = 0; // 0..1 how much beyond peak grip
    this.slipSpeed = 0; // m/s of patch sliding (for sound/particles)
    this.surface = SURFACES.gravel;
    this.cp = new Vector3();
    this.n = new Vector3(0, 1, 0);
    this.fwd = new Vector3();
    this.side = new Vector3();
    this.brakeT = 0;
  }
}

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3();
const _up = new Vector3(), _down = new Vector3(), _fwd = new Vector3(), _vp = new Vector3(), _gyro = new Vector3();
const _q = new Quaternion(), _qi = new Quaternion();
const _g = { y: 0, nx: 0, ny: 1, nz: 0, tri: -1 };

export class Vehicle {
  constructor(surfaceType = 'gravel', options = {}) {
    this.car = CAR;
    this.setup = { ...SETUPS[surfaceType], ...(options.setup || {}) };
    this.finalDrive = options.finalDrive ?? 4.4;
    this.assists = { autoGear: true, abs: false, tcs: false, ...(options.assists || {}) };
    this.mass = CAR.mass;
    this.I = new Vector3(CAR.inertia.pitch, CAR.inertia.yaw, CAR.inertia.roll);
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.quaternion = new Quaternion();
    this.angularVelocity = new Vector3();
    this.force = new Vector3();
    this.torque = new Vector3();

    const s = this.setup;
    const r = CAR.wheelRadius;
    const a = CAR.cgToFront;
    const b = CAR.wheelbase - a;
    const tw = CAR.track / 2;
    this.wheels = [
      new Wheel(0, -tw, -a, true),
      new Wheel(1, tw, -a, true),
      new Wheel(2, -tw, b, false),
      new Wheel(3, tw, b, false),
    ];
    const mountY = r - s.cgHeight + s.L0;
    for (const w of this.wheels) {
      w.mount.y = mountY;
      const staticLoad = (this.mass * G * (w.front ? b : a)) / CAR.wheelbase / 2;
      w.k = w.front ? s.kF : s.kR;
      w.Lfree = s.L0 + staticLoad / w.k;
      w.Lmax = s.L0 + s.droop;
      w.Lmin = s.L0 - s.bump;
      w.cb = w.front ? s.cbF : s.cbR;
      w.cr = w.front ? s.crF : s.crR;
      w.rc = w.front ? s.rcF : s.rcR;
      w.L = w.Lprev = w.Lmax;
    }

    // driveline state
    this.engine = { omega: CAR.engine.idle / RPM, rpm: CAR.engine.idle, boost: 0, cut: false, torque: 0, load: 0 };
    this.gear = 1;
    this.pendingGear = 1;
    this.shiftTimer = 0;
    this.shiftCooldown = 0;
    this.shiftDir = 0;
    this.clutch = 0;
    this.clutchTorque = 0;
    this.reverseHold = 0;
    this.rack = 0;
    this.controls = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this.events = [];
    this.airTime = 0;
    this.time = 0;
    this.hullContact = 0;
    this.prevThrottle = 0;
    this.gripScale = 1;
  }

  /** Place the car at rest on the ground at (x,z) facing heading (rad, 0 = -z). */
  reset(x, z, heading, ground) {
    ground.query(x, z, _g);
    // align with the ground under the car
    const n = new Vector3(_g.nx, _g.ny, _g.nz);
    const f = new Vector3(Math.sin(heading), 0, -Math.cos(heading));
    const right = new Vector3().crossVectors(f, n).normalize();
    const fwd = new Vector3().crossVectors(n, right).normalize();
    const m = new Matrix4().makeBasis(right, n, fwd.clone().negate());
    this.quaternion.setFromRotationMatrix(m);
    const s = this.setup;
    this.position.set(x, _g.y, z).addScaledVector(n, s.cgHeight + 0.02);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    for (const w of this.wheels) {
      w.omega = 0;
      w.ux = w.uy = 0;
      w.L = w.Lprev = s.L0;
      w.vL = 0;
    }
    this.engine.omega = CAR.engine.idle / RPM;
    this.engine.boost = 0;
    this.gear = this.pendingGear = 1;
    this.shiftTimer = 0;
    this.rack = 0;
    this.airTime = 0;
  }

  get forward() {
    return _v4.set(0, 0, -1).applyQuaternion(this.quaternion);
  }

  /** Forward speed (m/s). */
  get speed() {
    return this.velocity.dot(this.forward);
  }

  gearRatio(g) {
    if (g === 0) return 0;
    if (g < 0) return CAR.gears.R * this.finalDrive;
    return CAR.gears.ratios[g - 1] * this.finalDrive;
  }

  shift(dir) {
    if (this.shiftTimer > 0) return;
    const target = clamp(this.gear + dir, -1, CAR.gears.ratios.length);
    if (target === this.gear) return;
    if (target < 0 && this.speed > 2) return;
    this.pendingGear = target;
    this.shiftDir = dir;
    this.shiftTimer = dir > 0 ? 0.065 : 0.09;
    this.shiftCooldown = 0.45;
    this.events.push({ type: 'shift', dir });
  }

  #autoGearbox(dt, throttle, brake) {
    const fwdSpeed = this.speed;
    if (this.shiftCooldown > 0) this.shiftCooldown -= dt;
    if (this.shiftTimer > 0 || this.shiftCooldown > 0) return;
    const r = CAR.wheelRadius;
    const rpmAt = (g) => (Math.abs(fwdSpeed) / r) * Math.abs(this.gearRatio(g)) * RPM;
    if (this.gear >= 1) {
      const top = CAR.gears.ratios.length;
      if (this.gear < top && throttle > 0.15 && (rpmAt(this.gear) > 7000 || (this.engine.rpm > 7150 && rpmAt(this.gear) > 5600))) {
        this.shift(1);
      } else if (this.gear > 1) {
        const downAt = throttle > 0.6 ? 4300 : brake > 0.3 ? 4600 : 3000;
        if (rpmAt(this.gear) < downAt && rpmAt(this.gear - 1) < 6700) this.shift(-1);
      }
    }
    if (this.gear === 0 && throttle > 0.05) this.shift(1);
    // hold brake at standstill -> reverse; throttle at standstill -> first
    if (this.gear >= 1 && fwdSpeed < 0.6 && brake > 0.5 && throttle < 0.05) {
      this.reverseHold += dt;
      if (this.reverseHold > 0.45) {
        this.gear = this.pendingGear = -1;
        this.reverseHold = 0;
        this.events.push({ type: 'shift', dir: -1 });
      }
    } else if (this.gear === -1 && fwdSpeed > -0.6 && brake > 0.5 && throttle < 0.05) {
      // in reverse the pedals are swapped by the caller; "brake" here is the
      // driver's throttle pedal
      this.reverseHold += dt;
      if (this.reverseHold > 0.3) {
        this.gear = this.pendingGear = 1;
        this.reverseHold = 0;
        this.events.push({ type: 'shift', dir: 1 });
      }
    } else {
      this.reverseHold = 0;
    }
  }

  /**
   * Advance the simulation by dt (use a small fixed step, ~1/360 s).
   * input: {steer -1..1, throttle 0..1, brake 0..1, handbrake 0..1}
   * env:   {ground: GroundIndex-like, surfaceAt(x, z, wheel) -> surface, collide?(vehicle, dt)}
   */
  step(dt, input, env) {
    const car = CAR;
    const set = this.setup;
    const r = car.wheelRadius;
    this.time += dt;

    // ---- controls -------------------------------------------------------
    let throttle = clamp(input.throttle, 0, 1);
    let brake = clamp(input.brake, 0, 1);
    const handbrake = clamp(input.handbrake, 0, 1);
    if (this.assists.autoGear && this.gear === -1) {
      const t = throttle; throttle = brake; brake = t;
    }
    if (this.assists.autoGear) this.#autoGearbox(dt, throttle, brake);
    let target = clamp(input.steer, -1, 1);
    if (this.assists.counterSteer) {
      // stability aid: blend in opposite lock proportional to the slip angle
      // of the car (beta), like an experienced driver's hands would
      const lv = _v3.copy(this.velocity).applyQuaternion(_qi.copy(this.quaternion).invert());
      const sp = Math.hypot(lv.x, lv.z);
      if (sp > 4 && lv.z < 0) {
        const beta = Math.atan2(lv.x, -lv.z);
        const k = this.assists.counterSteer === true ? 1 : this.assists.counterSteer;
        target = clamp(target + clamp(beta * 1.6 * k, -0.8, 0.8) * clamp((sp - 4) / 6, 0, 1), -1, 1);
      }
    }
    const maxD = car.steerRate * dt;
    this.rack += clamp(target - this.rack, -maxD, maxD);

    // shifting: clutch open, ignition cut on upshift, blip on downshift
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      throttle = this.shiftDir > 0 ? 0 : 0.55;
      if (this.shiftTimer <= 0) this.gear = this.pendingGear;
    }

    // ---- kinematics -------------------------------------------------------
    const q = this.quaternion;
    const p = this.position;
    const v = this.velocity;
    const om = this.angularVelocity;
    const up = _up.set(0, 1, 0).applyQuaternion(q);
    const down = _down.copy(up).negate();
    const fwdBody = _fwd.set(0, 0, -1).applyQuaternion(q);
    const F = this.force.set(0, -this.mass * G, 0);
    const T = this.torque.set(0, 0, 0);

    // Ackermann steering
    const delta = this.rack * car.maxSteer;
    if (Math.abs(delta) > 1e-4) {
      const R = car.wheelbase / Math.tan(Math.abs(delta));
      const inner = Math.atan(car.wheelbase / (R - car.track / 2));
      const outer = Math.atan(car.wheelbase / (R + car.track / 2));
      const sgn = Math.sign(delta);
      // turning right (delta>0): right wheel is inner
      const ack = 0.65;
      const wIn = sgn * (outer + (inner - outer) * ack);
      const wOut = sgn * outer;
      this.wheels[0].steer = delta > 0 ? wOut : wIn;
      this.wheels[1].steer = delta > 0 ? wIn : wOut;
    } else {
      this.wheels[0].steer = this.wheels[1].steer = 0;
    }

    // ---- suspension: find contact -----------------------------------------
    const ground = env.ground;
    let contacts = 0;
    for (const w of this.wheels) {
      const m = _v2.copy(w.mount).applyQuaternion(q).add(p);
      w.contact = false;
      let L = w.Lmax;
      if (ground.query(m.x, m.z, _g)) {
        w.n.set(_g.nx, _g.ny, _g.nz);
        let dn = down.dot(w.n);
        if (dn < -0.3) {
          // plane through ground point: (m + down*L - Q).n = r
          L = (r - ((m.x - m.x) * _g.nx + (m.y - _g.y) * _g.ny + (m.z - m.z) * _g.nz)) / dn;
          // refine at the estimated contact point
          const cx = m.x + down.x * L - w.n.x * r;
          const cz = m.z + down.z * L - w.n.z * r;
          if (ground.query(cx, cz, _g)) {
            w.n.set(_g.nx, _g.ny, _g.nz);
            dn = down.dot(w.n);
            if (dn < -0.3) {
              L = (r - ((m.x - cx) * _g.nx + (m.y - _g.y) * _g.ny + (m.z - cz) * _g.nz)) / dn;
            }
          }
          if (L < w.Lmax) {
            w.contact = true;
            contacts++;
          }
        }
      }
      const Lhard = w.Lmin - 0.05;
      if (L < Lhard) L = Lhard;
      if (!w.contact) L = Math.min(w.Lmax, w.L + 2.5 * dt); // wheel drops
      w.L = L;
      const vRaw = (w.L - w.Lprev) / dt;
      w.vL = 0.6 * vRaw + 0.4 * w.vL;
      w.Lprev = w.L;
      w.cp.copy(m).addScaledVector(down, w.L).addScaledVector(w.n, -r);
    }

    // ---- suspension forces + tyres ----------------------------------------
    const arb = [set.arbF, set.arbF, set.arbR, set.arbR];
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.contact) {
        w.Fz = w.Fx = w.Fy = 0;
        w.ux *= 0.9; w.uy *= 0.9;
        w.slide = 0; w.slipSpeed = 0;
        continue;
      }
      const other = this.wheels[i ^ 1];
      const spring = Math.max(0, w.k * (w.Lfree - w.L));
      const vL = w.vL;
      const c = vL < 0 ? w.cb : w.cr;
      const knee = 0.18;
      const damp = Math.abs(vL) < knee ? -c * vL : -Math.sign(vL) * c * (knee + (Math.abs(vL) - knee) * 0.45);
      const antiRoll = arb[i] * (other.L - w.L);
      let bumpStop = 0;
      const e = w.Lmin + 0.03 - w.L;
      if (e > 0) bumpStop = 110000 * e + 7e6 * e * e;
      w.Fz = Math.max(0, spring + damp + antiRoll + bumpStop);

      // contact frame
      const sinD = Math.sin(w.steer), cosD = Math.cos(w.steer);
      const fw = w.fwd.set(sinD, 0, -cosD).applyQuaternion(q);
      fw.addScaledVector(w.n, -fw.dot(w.n)).normalize();
      w.side.crossVectors(fw, w.n).normalize();
      const rel = _v3.copy(w.cp).sub(p);
      const vc = _v2.copy(om).cross(rel).add(v);
      const vx = vc.dot(fw);
      const vy = vc.dot(w.side);

      // tyre
      const surf = env.surfaceAt ? env.surfaceAt(w.cp.x, w.cp.z, i) : SURFACES.gravel;
      w.surface = surf;
      const absVx = Math.abs(vx);
      const sigX = 0.13, sigY = 0.38;
      const slipVel = w.omega * r - vx;
      w.ux = (w.ux + dt * slipVel) / (1 + (dt * absVx) / sigX);
      w.uy = (w.uy + dt * vy) / (1 + (dt * absVx) / sigY);
      w.ux = clamp(w.ux, -sigX * 2.5, sigX * 2.5);
      w.uy = clamp(w.uy, -sigY * 3, sigY * 3);
      const kappa = w.ux / sigX;
      const tanA = w.uy / sigY;
      const sx = kappa / surf.kPeak;
      const sy = tanA / surf.tanAPeak;
      const sl = Math.hypot(sx, sy);
      const loadRatio = w.Fz / 3500;
      const mu = surf.mu * clamp(1 - 0.1 * (loadRatio - 1), 0.75, 1.12) * this.gripScale;
      const Fmax = mu * w.Fz;
      const Fmag = Fmax * slipCurve(sl, surf.fall);
      let Fx = sl > 1e-9 ? (Fmag * sx) / sl : 0;
      let Fy = sl > 1e-9 ? (-Fmag * sy) / sl : 0;
      // low-speed damping so the car settles instead of oscillating on the
      // tyre "springs" when parked
      const lowSpeed = clamp(1 - absVx / 2.5, 0, 1);
      if (lowSpeed > 0) {
        const cd = w.Fz * 1.1 * lowSpeed;
        Fx += cd * slipVel;
        Fy -= cd * vy;
        const m2 = Math.hypot(Fx, Fy);
        if (m2 > Fmax) { Fx *= Fmax / m2; Fy *= Fmax / m2; }
      }
      // ploughing drag in loose material
      if (surf.drag > 0) {
        const dragF = surf.drag * (w.Fz / 1000) * Math.min(Math.hypot(vx, vy), 20) * 10;
        const sp = Math.hypot(vx, vy) + 0.5;
        Fx -= (dragF * vx) / sp;
        Fy -= (dragF * vy) / sp;
      }
      w.Fx = Fx;
      w.Fy = Fy;
      w.slipRatio = kappa;
      w.slipAngle = Math.atan(tanA);
      w.slide = clamp(sl - 0.9, 0, 3);
      w.slipSpeed = Math.hypot(slipVel, vy);

      // apply: normal load along ground normal at the patch, tyre forces at
      // roll-centre height
      _v2.copy(w.n).multiplyScalar(w.Fz);
      F.add(_v2);
      T.add(_v3.copy(w.cp).sub(p).cross(_v2));
      const app = _v4.copy(w.cp).addScaledVector(w.n, w.rc).sub(p);
      _v2.copy(fw).multiplyScalar(Fx).addScaledVector(w.side, Fy);
      F.add(_v2);
      T.add(app.cross(_v2));
    }

    // ---- driveline ----------------------------------------------------------
    this.#driveline(dt, throttle, brake, handbrake);

    // ---- body / ground contact (rollovers, bottoming out) -----------------
    this.hullContact = 0;
    for (const h of HULL) {
      const wpt = _v2.set(h[0], h[1], h[2]).applyQuaternion(q).add(p);
      if (!ground.query(wpt.x, wpt.z, _g)) continue;
      const depth = (_g.y - wpt.y) * _g.ny;
      if (depth <= 0) continue;
      const rel = _v3.copy(wpt).sub(p);
      const n = _v4.set(_g.nx, _g.ny, _g.nz);
      const vp = _vp.copy(om).cross(rel).add(v);
      const vn = vp.dot(n);
      const Fn = Math.max(0, 260000 * Math.min(depth, 0.3) - 13000 * vn);
      vp.addScaledVector(n, -vn);
      const vt = vp.length();
      const Ff = (0.55 * Fn) / (vt + 0.3);
      const f = n.multiplyScalar(Fn).addScaledVector(vp, -Ff);
      F.add(f);
      T.add(rel.cross(f));
      this.hullContact += Fn;
    }

    // ---- aero -----------------------------------------------------------
    const sp = v.length();
    F.addScaledVector(v, -0.5 * RHO * car.cdA * sp);
    const vf = v.dot(fwdBody);
    F.addScaledVector(up, -0.5 * RHO * car.clA * vf * vf);

    // ---- integrate --------------------------------------------------------
    v.addScaledVector(F, dt / this.mass);
    _qi.copy(q).invert();
    const tb = _v2.copy(T).applyQuaternion(_qi);
    const wb = _v3.copy(om).applyQuaternion(_qi);
    const I = this.I;
    const Iw = _v4.set(wb.x * I.x, wb.y * I.y, wb.z * I.z);
    const gyro = _gyro.crossVectors(wb, Iw);
    tb.sub(gyro);
    const ab = tb.set(tb.x / I.x, tb.y / I.y, tb.z / I.z).applyQuaternion(q);
    om.addScaledVector(ab, dt);
    om.multiplyScalar(1 - 0.05 * dt);
    p.addScaledVector(v, dt);
    _q.set(om.x, om.y, om.z, 0).multiply(q);
    q.x += 0.5 * dt * _q.x;
    q.y += 0.5 * dt * _q.y;
    q.z += 0.5 * dt * _q.z;
    q.w += 0.5 * dt * _q.w;
    q.normalize();

    if (env.collide) env.collide(this, dt);

    // ---- bookkeeping ------------------------------------------------------
    for (const w of this.wheels) w.spin += w.omega * dt;
    if (contacts === 0 && this.hullContact === 0) this.airTime += dt;
    else {
      if (this.airTime > 0.35) this.events.push({ type: 'land', air: this.airTime, v: -v.y });
      this.airTime = 0;
    }
    this.controls.steer = this.rack;
    this.controls.throttle = throttle;
    this.controls.brake = brake;
    this.controls.handbrake = handbrake;
  }

  #driveline(dt, throttleIn, brake, handbrake) {
    const car = CAR;
    const eng = this.engine;
    const r = car.wheelRadius;
    const ws = this.wheels;
    const Iw = car.wheelInertia;
    const Ie = car.engine.inertia;

    // traction control (assist): trim throttle when driven wheels overspin
    let throttle = throttleIn;
    if (this.assists.tcs) {
      let maxK = 0;
      for (const w of ws) if (w.contact) maxK = Math.max(maxK, w.slipRatio / w.surface.kPeak);
      if (maxK > 1.3) throttle *= clamp(1 - (maxK - 1.3) * 0.8, 0.15, 1);
    }

    // engine
    const rpm = eng.omega * RPM;
    if (rpm > car.engine.limiter) {
      if (!eng.cut) this.events.push({ type: 'limiter' });
      eng.cut = true;
    } else if (rpm < car.engine.limiter - 220) eng.cut = false;
    let thr = eng.cut ? 0 : throttle;
    const idleNeed = clamp((car.engine.idle + 60 - rpm) / 400, 0, 0.35);
    thr = Math.max(thr, idleNeed);
    const boostTarget = rpm > 2600 ? Math.max(thr, 0.75) : thr * clamp((rpm - 1400) / 1200, 0, 1); // anti-lag keeps boost
    eng.boost += (boostTarget - eng.boost) * clamp(dt / (boostTarget > eng.boost ? 0.18 : 0.7), 0, 1);
    const Twot = lerpTable(car.engine.torque, rpm) * (0.62 + 0.38 * eng.boost);
    const Tdrag = (16 + 0.0058 * rpm) * (1 - thr);
    eng.torque = thr * Twot - Tdrag;
    if (this.prevThrottle - throttle > 0.5 && rpm > 4000) this.events.push({ type: 'pop' });
    this.prevThrottle = throttle;

    // clutch engagement (auto clutch; handbrake opens it)
    const Gr = this.gearRatio(this.gear);
    const engaged = this.gear !== 0 && this.shiftTimer <= 0 && handbrake < 0.15;
    let e = 0;
    if (engaged) {
      const wheelRpm = Math.abs(((ws[0].omega + ws[1].omega) / 2) * Gr) * RPM;
      e = wheelRpm > 2300 ? 1 : clamp((rpm - 1000) / (900 + 4200 * throttle), 0, 1);
      if (rpm < 850) e = 0;
    }
    this.clutch = e;

    // integrate free torques
    eng.omega += (eng.torque / Ie) * dt;
    for (const w of ws) w.omega += (-w.Fx * r * dt) / Iw;

    // brakes (+ABS), handbrake, rolling resistance -> Coulomb limits
    const bias = this.setup.brakeBias;
    for (const w of ws) {
      let tb = brake * car.brakeTorque * (w.front ? bias : 1 - bias) * 0.5;
      if (this.assists.abs && w.contact && tb > 0) {
        const vxApprox = Math.abs(this.speed);
        if (vxApprox > 2 && w.slipRatio < -w.surface.kPeak * 1.15) tb *= 0.25;
      }
      if (!w.front) tb += handbrake * car.handbrakeTorque;
      tb += w.surface.rr * w.Fz * r + 4;
      w.brakeT = tb;
    }

    // constraint rows: [engine, FL, FR, RL, RR]
    const inv = [1 / Ie, 1 / Iw, 1 / Iw, 1 / Iw, 1 / Iw];
    const om = [eng.omega, ws[0].omega, ws[1].omega, ws[2].omega, ws[3].omega];
    const rows = _rows;
    let nr = 0;
    const row = (j0, j1, j2, j3, j4, lim) => {
      const R = rows[nr++];
      R.j[0] = j0; R.j[1] = j1; R.j[2] = j2; R.j[3] = j3; R.j[4] = j4;
      let k = 0;
      for (let a = 0; a < 5; a++) k += R.j[a] * R.j[a] * inv[a];
      R.m = k > 0 ? 1 / k : 0;
      R.lim = lim * dt;
      R.P = 0;
      return R;
    };
    for (let i = 0; i < 4; i++) {
      const j = [0, 0, 0, 0, 0];
      j[i + 1] = 1;
      row(j[0], j[1], j[2], j[3], j[4], ws[i].brakeT);
    }
    const tIn = Math.abs(this.clutchTorque);
    const lf = this.setup.lsdF, lr = this.setup.lsdR;
    row(0, 1, -1, 0, 0, lf[0] + lf[1] * tIn * Math.abs(Gr) * 0.5);
    row(0, 0, 0, 1, -1, lr[0] + lr[1] * tIn * Math.abs(Gr) * 0.5);
    // centre: solid shaft, released by the handbrake
    row(0, 0.5, 0.5, -0.5, -0.5, handbrake > 0.1 ? 40 : 1e6);
    let clutchRow = null;
    if (e > 0) clutchRow = row(-1, Gr / 2, Gr / 2, 0, 0, car.engine.clutchMax * e);

    for (let it = 0; it < 16; it++) {
      for (let k = 0; k < nr; k++) {
        const R = rows[k];
        let jv = 0;
        for (let a = 0; a < 5; a++) jv += R.j[a] * om[a];
        let dP = -jv * R.m;
        const P0 = R.P;
        R.P = clamp(P0 + dP, -R.lim, R.lim);
        dP = R.P - P0;
        if (dP !== 0) for (let a = 0; a < 5; a++) om[a] += R.j[a] * dP * inv[a];
      }
    }
    eng.omega = Math.max(om[0], 300 / RPM);
    for (let i = 0; i < 4; i++) ws[i].omega = om[i + 1];
    this.clutchTorque = clutchRow ? clutchRow.P / dt : 0;
    eng.rpm = eng.omega * RPM;
    eng.load = clamp(thr, 0, 1);
  }

  /** Telemetry snapshot for HUD / audio. */
  telemetry() {
    const fwd = this.forward;
    return {
      speed: this.velocity.dot(fwd),
      rpm: this.engine.rpm,
      gear: this.gear,
      throttle: this.controls.throttle,
      brake: this.controls.brake,
      boost: this.engine.boost,
      clutch: this.clutch,
      airborne: this.airTime > 0.05,
    };
  }
}

const _rows = Array.from({ length: 12 }, () => ({ j: new Float64Array(5), m: 0, lim: 0, P: 0 }));
