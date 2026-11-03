// Rally2 cockpit interior for the in-car camera: dashboard with a live
// digital display, steering wheel that turns with the rack (with gloved
// hands and forearms), roll cage, door cards, hydraulic handbrake and
// sequential shifter that move with the controls.
// Coordinates: x right, y up from the ground, -z forward (same as the body).
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function tube(a, b, r, mat, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return m;
}

export class Cockpit {
  constructor(body, vehicle) {
    this.vehicle = vehicle;
    const g = (this.group = new THREE.Group());
    g.visible = false;
    body.add(g);
    this.body = body;
    const M = (o) => new THREE.MeshStandardMaterial(o);
    const dash = M({ color: 0x1b1c1f, roughness: 1 });
    const trim = M({ color: 0x26272b, roughness: 0.9 });
    const cage = M({ color: 0xb7bcc3, roughness: 0.32, metalness: 0.85 });
    const alcantara = M({ color: 0x121212, roughness: 1 });
    const suit = M({ color: 0x1d3d8f, roughness: 0.75 });
    const glove = M({ color: 0x151515, roughness: 0.6 });
    const carbon = M({ color: 0x0f1012, roughness: 0.62, metalness: 0.1 });
    const yellow = M({ color: 0xf5c02a, roughness: 0.5 });
    const mirror = M({ color: 0x8090a0, roughness: 0.02, metalness: 1 });
    this.materials = [dash, trim, cage, alcantara, suit, glove, carbon, yellow, mirror];
    for (const m of [dash, trim, alcantara, suit, glove, carbon]) m.userData.envScale = 0.2;

    // dashboard (side profile extruded across the car)
    const prof = new THREE.Shape();
    // the front edge meets the base of the windscreen so the eye can't see
    // under the bonnet into the closed body shell
    prof.moveTo(1.0, 0.58);
    prof.lineTo(1.0, 0.93);
    prof.lineTo(0.63, 0.885);
    prof.quadraticCurveTo(0.52, 0.86, 0.52, 0.78);
    prof.lineTo(0.56, 0.58);
    const dg = new THREE.ExtrudeGeometry(prof, { depth: 1.62, bevelEnabled: false, curveSegments: 6 });
    dg.translate(0, 0, -0.81);
    dg.rotateY(Math.PI / 2);
    g.add(new THREE.Mesh(dg, dash));

    // binnacle + digital display
    const bin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.16), carbon);
    bin.position.set(-0.38, 0.9, -0.6);
    bin.rotation.x = -0.25;
    g.add(bin);
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 256;
    this.dashCanvas.height = 96;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.1), new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false }));
    disp.position.set(-0.38, 0.905, -0.515);
    disp.rotation.x = -0.32;
    g.add(disp);
    this.materials.push(disp.material);

    // steering column + wheel
    g.add(tube([-0.38, 0.8, -0.66], [-0.38, 0.93, -0.42], 0.03, carbon));
    const pivot = new THREE.Group();
    pivot.position.set(-0.38, 0.97, -0.37);
    pivot.rotation.x = 0.36;
    g.add(pivot);
    const wheel = (this.wheel = new THREE.Group());
    pivot.add(wheel);
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.019, 10, 40), alcantara));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.05, 20).rotateX(Math.PI / 2), carbon);
    wheel.add(hub);
    for (const [x, y, w, h] of [[-0.09, -0.005, 0.15, 0.035], [0.09, -0.005, 0.15, 0.035], [0, -0.09, 0.035, 0.14]]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.018), carbon);
      sp.position.set(x, y, -0.005);
      wheel.add(sp);
    }
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.044), yellow);
    mark.position.set(0, 0.165, 0);
    wheel.add(mark);
    // gloves at nine and three
    this.hands = [];
    for (const sx of [-1, 1]) {
      const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 8).scale(0.9, 1.25, 0.95), glove);
      hnd.position.set(sx * 0.163, 0.01, 0.012);
      wheel.add(hnd);
      this.hands.push(hnd);
    }
    // forearms (oriented every frame from fixed elbows to the hands)
    this.arms = [];
    this.elbows = [new THREE.Vector3(-0.66, 0.82, -0.02), new THREE.Vector3(-0.1, 0.8, -0.02)];
    for (let k = 0; k < 2; k++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1, 10), suit);
      g.add(arm);
      this.arms.push(arm);
    }

    // roll cage
    const r = 0.022;
    for (const sx of [-1, 1]) {
      g.add(tube([sx * 0.71, 0.5, -0.9], [sx * 0.645, 1.285, -0.17], r, cage));
      g.add(tube([sx * 0.645, 1.285, -0.17], [sx * 0.645, 1.285, 0.92], r, cage));
      g.add(tube([sx * 0.73, 0.3, 0.92], [sx * 0.645, 1.285, 0.92], r, cage));
      g.add(tube([sx * 0.78, 0.42, -0.78], [sx * 0.765, 0.84, 0.82], r, cage));
      g.add(tube([sx * 0.78, 0.84, -0.78], [sx * 0.765, 0.42, 0.82], r, cage));
      // A-pillar trim covering the gap between windscreen and side glass
      g.add(tube([sx * 0.735, 0.9, -0.97], [sx * 0.665, 1.335, -0.13], 0.05, trim, 6));
      // door cards
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.72), trim);
      door.position.set(sx * 0.835, 0.6, 0);
      door.rotation.y = -sx * Math.PI / 2;
      g.add(door);
    }
    g.add(tube([-0.645, 1.285, -0.17], [0.645, 1.285, -0.17], r, cage));
    g.add(tube([-0.645, 1.285, 0.92], [0.645, 1.285, 0.92], r, cage));
    g.add(tube([-0.645, 1.285, -0.17], [0.645, 1.285, 0.92], r, cage));
    g.add(tube([-0.7, 0.74, -0.8], [0.7, 0.74, -0.8], r, cage));
    // headliner and floor
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 1.35).rotateX(Math.PI / 2), trim);
    roof.position.set(0, 1.338, 0.5);
    g.add(roof);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9).rotateX(-Math.PI / 2), alcantara);
    floor.position.set(0, 0.27, 0);
    g.add(floor);
    // centre console, levers, mirror, wiper
    const cons = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.75), carbon);
    cons.position.set(0, 0.42, -0.35);
    g.add(cons);
    this.hbPivot = new THREE.Group();
    this.hbPivot.position.set(-0.13, 0.56, -0.12);
    this.hbPivot.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.42, 8).translate(0, 0.21, 0), cage)));
    const hbKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 10).translate(0, 0.43, 0), alcantara);
    this.hbPivot.add(hbKnob);
    g.add(this.hbPivot);
    this.shPivot = new THREE.Group();
    this.shPivot.position.set(-0.14, 0.6, -0.42);
    this.shPivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.32, 8).translate(0, 0.16, 0), cage));
    const shKnob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8).translate(0, 0.33, 0), carbon);
    this.shPivot.add(shKnob);
    g.add(this.shPivot);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), mirror);
    mir.position.set(0, 1.25, -0.26);
    mir.rotation.x = 0.15;
    g.add(mir);

    this.dashTimer = 0;
    this.shiftKick = 0;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  set visible(v) {
    this.group.visible = v;
  }

  get visible() {
    return this.group.visible;
  }

  onShift(dir) {
    this.shiftKick = dir;
  }

  update(dt) {
    if (!this.group.visible) return;
    const v = this.vehicle;
    this.wheel.rotation.z = -v.rack * 2.4;
    // hydraulic handbrake swings back, shifter kicks on each change
    this.hbPivot.rotation.x = -0.35 + v.controls.handbrake * 0.75;
    this.shiftKick *= Math.exp(-dt * 12);
    this.shPivot.rotation.x = -0.2 + this.shiftKick * 0.35;
    // forearms from elbows to the hands on the (turning) wheel
    this.group.updateMatrixWorld(true);
    for (let k = 0; k < 2; k++) {
      const hand = this.hands[k].getWorldPosition(this._a);
      this.group.worldToLocal(hand);
      const elbow = this.elbows[k];
      const arm = this.arms[k];
      const len = elbow.distanceTo(hand);
      arm.position.copy(elbow).add(hand).multiplyScalar(0.5);
      arm.scale.set(1, len, 1);
      arm.quaternion.setFromUnitVectors(UP, this._b.copy(hand).sub(elbow).normalize());
    }
    this.dashTimer -= dt;
    if (this.dashTimer <= 0) {
      this.dashTimer = 1 / 15;
      this.#drawDash(v);
    }
  }

  #drawDash(v) {
    const c = this.dashCanvas, g = c.getContext('2d');
    g.fillStyle = '#05080a';
    g.fillRect(0, 0, c.width, c.height);
    const rpm = v.engine.rpm;
    const n = 16;
    const lit = Math.round(Math.max(0, Math.min(1, (rpm - 2500) / 4800)) * n);
    const flash = rpm > 7050 && (performance.now() % 140) < 70;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i >= lit ? '#1a2228' : flash ? '#4aa3ff' : i < 9 ? '#36d46a' : i < 13 ? '#ffcf3a' : '#ff3b30';
      g.fillRect(8 + i * 15, 6, 12, 14);
    }
    g.fillStyle = '#f5c02a';
    g.font = 'bold 62px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const gear = v.gear === -1 ? 'R' : v.gear === 0 ? 'N' : String(v.gear);
    g.fillText(gear, 128, 60);
    g.fillStyle = '#e8edf2';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText(String(Math.round(Math.abs(v.speed) * 3.6)), 246, 58);
    g.font = '13px system-ui, sans-serif';
    g.fillText('km/h', 246, 82);
    g.textAlign = 'left';
    g.font = 'bold 24px system-ui, sans-serif';
    g.fillText(String(Math.round(rpm / 100) * 100), 10, 58);
    g.font = '13px system-ui, sans-serif';
    g.fillText('rpm', 10, 82);
    this.dashTex.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => o.geometry?.dispose?.());
    this.materials.forEach((m) => m.dispose());
    this.dashTex.dispose();
  }
}
