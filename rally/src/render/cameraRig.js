// Chase / far chase / cockpit / bonnet / bumper cameras with smoothing,
// terrain clearance, G-force head movement and road-surface shake.
import * as THREE from 'three';

export const CAMERA_MODES = ['chase', 'far', 'cockpit', 'bonnet', 'bumper'];
const LABEL = { chase: '추격', far: '원거리', cockpit: '콕핏', bonnet: '보닛', bumper: '범퍼' };

// Attached cameras: eye position (x right, y up from the ground, -z forward)
// and vertical field of view.
const MOUNTS = {
  cockpit: { eye: [-0.38, 1.15, 0.12], fov: 62, near: 0.08, pitch: -0.08 },
  bonnet: { eye: [0, 1.04, -1.08], fov: 66, near: 0.12, pitch: -0.06 },
  bumper: { eye: [0, 0.42, -2.25], fov: 72, near: 0.15, pitch: -0.02 },
};

export class CameraRig {
  constructor(camera, ground) {
    this.camera = camera;
    this.ground = ground;
    this.mode = 'chase';
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.shake = 0;
    this.initialized = false;
    this.g = {};
    this.tmp = new THREE.Vector3();
    this.head = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.lookYaw = 0;
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._acc = new THREE.Vector3();
  }

  get label() {
    return LABEL[this.mode];
  }

  get attached() {
    return this.mode in MOUNTS;
  }

  setMode(mode) {
    if (CAMERA_MODES.includes(mode)) this.mode = mode;
    this.initialized = false;
  }

  cycle() {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
    this.initialized = false;
    return this.mode;
  }

  update(car, dt, roughness = 0) {
    const cam = this.camera;
    const q = car.quaternion;
    const p = car.position;
    const fwd = this.tmp.set(0, 0, -1).applyQuaternion(q);
    const heading = Math.atan2(fwd.x, -fwd.z);
    const speed = car.velocity.length();

    if (this.attached) {
      const m = MOUNTS[this.mode];
      const cg = car.setup.cgHeight;
      // body-frame acceleration -> head lean (opposite to the acceleration)
      const acc = this._acc.copy(car.velocity).sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
      this.prevVel.copy(car.velocity);
      if (!this.initialized) { acc.set(0, 0, 0); this.head.set(0, 0, 0); this.lookYaw = 0; }
      acc.applyQuaternion(this._q.copy(q).invert());
      const lean = this.mode === 'cockpit' ? 0.012 : 0.004;
      const target = this._v.set(
        THREE.MathUtils.clamp(-acc.x * lean, -0.06, 0.06),
        THREE.MathUtils.clamp(-acc.y * lean * 0.5, -0.04, 0.04),
        THREE.MathUtils.clamp(-acc.z * lean, -0.06, 0.06),
      );
      this.head.lerp(target, 1 - Math.exp(-dt * 6));
      const eye = this._v.set(m.eye[0], m.eye[1] - cg, m.eye[2]).add(this.head);
      cam.position.copy(eye.applyQuaternion(q).add(p));
      // look a little into the corner (steering + yaw rate), pitch slightly down
      const yawRate = car.angularVelocity.dot(this.tmp.set(0, 1, 0).applyQuaternion(q));
      const wantYaw = this.mode === 'cockpit' ? THREE.MathUtils.clamp(-car.rack * 0.12 + yawRate * 0.1, -0.3, 0.3) : 0;
      this.lookYaw += (wantYaw - this.lookYaw) * (1 - Math.exp(-dt * 3));
      // orientation: car orientation, but damp roll/pitch a bit towards level
      this._e.set(m.pitch, this.lookYaw, 0, 'YXZ');
      cam.quaternion.copy(q).multiply(this._q2.setFromEuler(this._e));
      const upCar = this._v.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const level = this.mode === 'cockpit' ? 0.12 : 0.35;
      this._q2.setFromUnitVectors(upCar, upCar.clone().lerp(new THREE.Vector3(0, 1, 0), level).normalize());
      cam.quaternion.premultiply(this._q2);
      this.shake = this.shake * 0.85 + roughness * Math.min(1, speed / 25) * 0.6;
      cam.position.y += (Math.random() - 0.5) * this.shake * (this.mode === 'bumper' ? 0.006 : 0.01);
      if (cam.fov !== m.fov || cam.near !== m.near) {
        cam.fov = m.fov;
        cam.near = m.near;
        cam.updateProjectionMatrix();
      }
      this.initialized = true;
      return;
    }

    cam.up.set(0, 1, 0);
    const far = this.mode === 'far';
    const dist = (far ? 8.4 : 6.1) + Math.min(speed, 40) * 0.025;
    const height = far ? 2.7 : 1.62;
    // camera yaw follows the car with lag; when sliding it lags behind the
    // velocity so you can see the drift angle
    const velHeading = speed > 3 ? Math.atan2(car.velocity.x, -car.velocity.z) : heading;
    const target = heading + wrap(velHeading - heading) * 0.35;
    if (!this.initialized) this.yaw = target;
    this.yaw += wrap(target - this.yaw) * Math.min(1, dt * 4.5);
    const want = new THREE.Vector3(p.x - Math.sin(this.yaw) * dist, p.y + height, p.z + Math.cos(this.yaw) * dist);
    // keep above ground
    this.ground.query(want.x, want.z, this.g);
    want.y = Math.max(want.y, this.g.y + 0.9);
    if (!this.initialized) {
      this.pos.copy(want);
      this.look.copy(p);
      this.initialized = true;
    }
    const k = 1 - Math.exp(-dt * 9);
    this.pos.lerp(want, k);
    this.pos.y += (want.y - this.pos.y) * (1 - Math.exp(-dt * 6));
    const lookAt = new THREE.Vector3(p.x + Math.sin(heading) * 4, p.y + 0.75, p.z - Math.cos(heading) * 4);
    this.look.lerp(lookAt, 1 - Math.exp(-dt * 14));
    this.shake = this.shake * 0.85 + roughness * Math.min(1, speed / 25);
    cam.position.copy(this.pos);
    cam.position.y += (Math.random() - 0.5) * this.shake * 0.02;
    cam.fov = 64 + Math.min(speed, 50) * 0.18;
    cam.near = 0.3;
    cam.updateProjectionMatrix();
    cam.lookAt(this.look);
  }
}

function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
