// Chase / bonnet / bumper cameras with smoothing, terrain clearance and shake.
import * as THREE from 'three';

export const CAMERA_MODES = ['chase', 'far', 'bonnet', 'bumper'];
const LABEL = { chase: '추격', far: '원거리', bonnet: '보닛', bumper: '범퍼' };

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
  }

  get label() {
    return LABEL[this.mode];
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
    if (this.mode === 'bonnet' || this.mode === 'bumper') {
      const local = this.mode === 'bonnet' ? new THREE.Vector3(0, 0.62, -0.35) : new THREE.Vector3(0, 0.12, -2.15);
      const wp = local.applyQuaternion(q).add(p);
      cam.position.copy(wp);
      const target = new THREE.Vector3(0, local.y - 0.25, local.z - 20).applyQuaternion(q).add(p);
      cam.up.set(0, 1, 0).applyQuaternion(q).lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize();
      this.shake = this.shake * 0.85 + roughness * Math.min(1, speed / 25) * 0.6;
      const sh = this.shake * 0.012;
      cam.position.y += (Math.random() - 0.5) * sh;
      cam.lookAt(target);
      cam.fov = this.mode === 'bonnet' ? 72 : 78;
      cam.updateProjectionMatrix();
      this.initialized = false;
      return;
    }
    cam.up.set(0, 1, 0);
    const far = this.mode === 'far';
    const dist = (far ? 8.4 : 6.1) + Math.min(speed, 40) * 0.025;
    const height = far ? 2.7 : 1.62;
    // camera yaw follows the car with lag; when sliding it lags behind the
    // velocity so you can see the drift angle
    const velHeading = speed > 3 ? Math.atan2(car.velocity.x, -car.velocity.z) : heading;
    let target = heading + wrap(velHeading - heading) * 0.35;
    if (!this.initialized) {
      this.yaw = target;
    }
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
    cam.updateProjectionMatrix();
    cam.lookAt(this.look);
  }
}

function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
