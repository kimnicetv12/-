// Procedural Rally2 hatchback model, driven by the physics state.
import * as THREE from 'three';
import { liveryTexture } from './textures.js';

const WIDTH = 1.78;

function bodyShape() {
  const s = new THREE.Shape();
  // side profile, x forward (+) from the centre of gravity, y up from ground
  s.moveTo(2.0, 0.26);
  s.lineTo(2.07, 0.42);
  s.lineTo(2.05, 0.62);
  s.lineTo(1.9, 0.76);
  s.lineTo(0.95, 0.92);
  s.lineTo(0.14, 1.34);
  s.lineTo(-1.12, 1.38);
  s.lineTo(-1.6, 1.25);
  s.lineTo(-1.96, 0.98);
  s.lineTo(-2.05, 0.62);
  s.lineTo(-2.02, 0.28);
  s.lineTo(-1.84, 0.25);
  s.absarc(-1.37, 0.33, 0.44, Math.PI * 0.97, Math.PI * 0.03, true);
  s.lineTo(0.72, 0.23);
  s.absarc(1.18, 0.33, 0.44, Math.PI * 0.97, Math.PI * 0.03, true);
  s.lineTo(2.0, 0.26);
  return s;
}

function glassShape() {
  const s = new THREE.Shape();
  s.moveTo(0.86, 0.97);
  s.lineTo(0.17, 1.3);
  s.lineTo(-1.08, 1.33);
  s.lineTo(-1.52, 1.21);
  s.lineTo(-1.62, 1.0);
  s.lineTo(0.86, 0.97);
  return s;
}

/** Narrow the greenhouse (tumblehome) and round the ends in plan view. */
function shapeBody(geo) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let f = 1;
    if (y > 0.9) f -= ((y - 0.9) / 0.48) * 0.17;
    const ax = Math.abs(x);
    if (ax > 1.45) f *= 1 - (ax - 1.45) * 0.16;
    pos.setZ(i, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
}

function quad(a, b, width, lift) {
  // a plane spanning the car width along the profile segment a -> b
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const g = new THREE.PlaneGeometry(width, len);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g);
  m.rotation.order = 'YXZ';
  // plane normal points up (+y) after rotateX; tilt it to the segment
  m.rotation.x = Math.atan2(dy, -dx) * -1;
  // push it out along the outline's outward normal (clear of the bevel)
  const nx = dy / len, ny = -dx / len;
  m.position.set(0, (a[1] + b[1]) / 2 + ny * lift, -((a[0] + b[0]) / 2 + nx * lift));
  return m;
}

export class CarModel {
  constructor(vehicle, scheme = { base: '#f5f5f2', a: '#d0102a', b: '#0b2a5b', number: '7' }, opts = {}) {
    this.vehicle = vehicle;
    this.root = new THREE.Group();
    const cg = vehicle.setup.cgHeight;
    const body = new THREE.Group();
    body.position.y = -cg;
    this.root.add(body);

    const livery = liveryTexture(scheme);
    const paint = new THREE.MeshStandardMaterial({ map: livery, roughness: 0.32, metalness: 0.25 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.08, metalness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
    this.materials = [paint, glass, black];
    this.textures = [livery];

    const geo = new THREE.ExtrudeGeometry(bodyShape(), { depth: WIDTH - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
    // UVs in livery space; mirror the left side so text reads correctly
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    geo.computeVertexNormals();
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + 2.1) / 4.2;
      uv.setXY(i, nrm.getZ(i) < 0 ? 1 - u : u, pos.getY(i) / 1.45);
    }
    geo.translate(0, 0, -(WIDTH - 0.12) / 2);
    shapeBody(geo);
    geo.rotateY(Math.PI / 2);
    const shell = new THREE.Mesh(geo, paint);
    shell.castShadow = true;
    body.add(shell);

    const gl = new THREE.ExtrudeGeometry(glassShape(), { depth: WIDTH + 0.012, bevelEnabled: false });
    gl.translate(0, 0, -(WIDTH + 0.012) / 2);
    shapeBody(gl);
    gl.rotateY(Math.PI / 2);
    body.add(new THREE.Mesh(gl, glass));
    const ws = quad([0.95, 0.92], [0.14, 1.34], WIDTH * 0.8, 0.065);
    ws.material = glass;
    body.add(ws);
    const rg = quad([-1.6, 1.25], [-1.96, 0.98], WIDTH * 0.74, 0.065);
    rg.material = glass;
    body.add(rg);

    // rear wing, roof scoop, mud flaps, arches, lights
    const wing = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 0.86, 0.035, 0.34), paint);
    wing.position.set(0, 1.42, 1.72);
    wing.rotation.x = -0.12;
    body.add(wing);
    for (const sx of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.4), black);
      plate.position.set(sx * (WIDTH * 0.43), 1.37, 1.72);
      body.add(plate);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.08), black);
      strut.position.set(sx * 0.45, 1.3, 1.68);
      body.add(strut);
    }
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.42), black);
    scoop.position.set(0, 1.42, -0.15);
    body.add(scoop);
    const a = vehicle.car.cgToFront, b = vehicle.car.wheelbase - a;
    for (const [z, front] of [[-a, true], [b, false]]) {
      for (const sx of [-1, 1]) {
        const flare = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.0), black);
        flare.position.set(sx * (WIDTH / 2 + 0.02), 0.77, z);
        body.add(flare);
        if (!front || true) {
          const flap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.015), black);
          flap.position.set(sx * 0.72, 0.17, z + 0.5);
          body.add(flap);
        }
      }
    }
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.6 });
    this.tailMat = tailMat;
    this.materials.push(headMat, tailMat);
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.05), headMat);
      hl.position.set(sx * 0.58, 0.64, -2.12);
      hl.rotation.y = sx * 0.25;
      body.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.05), tailMat);
      tl.position.set(sx * 0.6, 0.84, 2.1);
      tl.rotation.y = -sx * 0.2;
      body.add(tl);
      const fog = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12).rotateX(Math.PI / 2), headMat);
      fog.position.set(sx * 0.66, 0.36, -2.13);
      body.add(fog);
    }
    // rear: bumper, plate, exhaust, diffuser
    const rb = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 0.92, 0.2, 0.08), black);
    rb.position.set(0, 0.34, 2.09);
    body.add(rb);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    this.materials.push(plateMat);
    const lp = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.02), plateMat);
    lp.position.set(0, 0.56, 2.115);
    body.add(lp);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
    ex.position.set(0.48, 0.24, 2.1);
    body.add(ex);
    const fb = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 0.9, 0.18, 0.08), black);
    fb.position.set(0, 0.3, -2.1);
    body.add(fb);
    // grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.03), black);
    grille.position.set(0, 0.45, -2.13);
    body.add(grille);

    if (opts.headlights) {
      for (const sx of [-1, 1]) {
        const spot = new THREE.SpotLight(0xfff2dd, 60, 140, 0.42, 0.5, 1.6);
        spot.position.set(sx * 0.6, 0.66, -2.1);
        const target = new THREE.Object3D();
        target.position.set(sx * 1.5, -1.5, -30);
        body.add(target);
        spot.target = target;
        body.add(spot);
      }
    }

    // wheels
    const tyre = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: scheme.rim || 0xe8e8e8, roughness: 0.35, metalness: 0.6 });
    this.materials.push(tyre, rim);
    const r = vehicle.car.wheelRadius;
    const tyreGeo = new THREE.CylinderGeometry(r, r, 0.22, 22).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.225, 16).rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.23, r * 1.15, 0.05);
    this.wheels = vehicle.wheels.map((w) => {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const t = new THREE.Mesh(tyreGeo, tyre);
      t.castShadow = true;
      spin.add(t);
      spin.add(new THREE.Mesh(rimGeo, rim));
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Mesh(spokeGeo, rim);
        sp.rotation.x = (k / 5) * Math.PI;
        spin.add(sp);
      }
      steer.add(spin);
      this.root.add(steer);
      return { steer, spin, w };
    });
  }

  update() {
    const v = this.vehicle;
    this.root.position.copy(v.position);
    this.root.quaternion.copy(v.quaternion);
    for (const wh of this.wheels) {
      const w = wh.w;
      wh.steer.position.set(w.mount.x, w.mount.y - w.L, w.mount.z);
      wh.steer.rotation.y = -w.steer;
      wh.spin.rotation.x = -w.spin;
    }
    this.tailMat.emissiveIntensity = v.controls.brake > 0.05 ? 2.5 : 0.6;
  }

  dispose() {
    this.root.traverse((o) => o.geometry?.dispose?.());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
  }
}
