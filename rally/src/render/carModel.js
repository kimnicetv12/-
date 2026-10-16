// Procedural Rally2 hatchback model, driven by the physics state.
import * as THREE from 'three';
import { liveryTexture } from './textures.js';
import { Cockpit } from './cockpit.js';

const WIDTH = 1.78;

function bodyShape() {
  const s = new THREE.Shape();
  // side profile, x forward (+) from the centre of gravity, y up from ground
  s.moveTo(2.0, 0.26);
  s.lineTo(2.07, 0.42);
  s.lineTo(2.06, 0.64);
  s.lineTo(1.93, 0.8);
  s.lineTo(0.98, 0.9);
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
    // clear-coated paint and glass pick up the sky reflections (scene.environment)
    const paint = new THREE.MeshPhysicalMaterial({ map: livery, roughness: 0.45, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    paint.userData.envScale = 0.8;
    const glass = new THREE.MeshStandardMaterial({ color: 0x0a0f14, roughness: 0.04, metalness: 0 });
    glass.userData.envScale = 0.75;
    const black = new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.62 });
    this.materials = [paint, glass, black];
    this.textures = [livery];

    const geo = new THREE.ExtrudeGeometry(bodyShape(), { depth: WIDTH - 0.12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 5, curveSegments: 18 });
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
    const ws = quad([0.98, 0.9], [0.14, 1.34], WIDTH * 0.8, 0.065);
    ws.material = glass;
    body.add(ws);
    const rg = quad([-1.6, 1.25], [-1.96, 0.98], WIDTH * 0.74, 0.065);
    rg.material = glass;
    body.add(rg);
    // matte anti-glare panel on the bonnet in front of the windscreen
    const matte = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.95 });
    matte.userData.envScale = 0.2;
    this.materials.push(matte);
    const ag = quad([1.62, 0.835], [0.98, 0.9], WIDTH * 0.84, 0.072);
    ag.material = matte;
    body.add(ag);

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
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: opts.headlights ? 4 : 1.6 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.8 });
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
    const exMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 });
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 16).rotateX(Math.PI / 2), exMat);
    ex.position.set(0.48, 0.24, 2.1);
    body.add(ex);
    // anti-lag flame, flashed on pops
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, toneMapped: false });
    flameMat.color.multiplyScalar(4);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 10).rotateX(Math.PI / 2).translate(0, 0, 0.22), flameMat);
    this.flame.position.set(0.48, 0.24, 2.16);
    this.flame.visible = false;
    body.add(this.flame);
    this.flameTimer = 0;
    this.materials.push(exMat, flameMat);
    // wiper resting on the scuttle
    const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.015, 0.02), black);
    wiper.position.set(-0.18, 0.955, -0.88);
    wiper.rotation.y = 0.12;
    body.add(wiper);
    const fb = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 0.9, 0.18, 0.08), black);
    fb.position.set(0, 0.3, -2.1);
    body.add(fb);
    // grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.03), black);
    grille.position.set(0, 0.45, -2.13);
    body.add(grille);

    if (opts.headlights) {
      for (const sx of [-1, 1]) {
        const spot = new THREE.SpotLight(0xfff2dd, 9, 160, 0.36, 0.65, 1.15);
        spot.position.set(sx * 0.6, 0.66, -2.2);
        const target = new THREE.Object3D();
        target.position.set(sx * 1.2, -0.6, -40);
        body.add(target);
        spot.target = target;
        body.add(spot);
      }
    }

    // wheels
    const tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.93 });
    const rim = new THREE.MeshStandardMaterial({ color: scheme.rim || 0xd9dadc, roughness: 0.28, metalness: 0.85 });
    const disc = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.45, metalness: 0.9 });
    const caliper = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4, metalness: 0.2 });
    this.materials.push(tyre, rim, disc, caliper);
    const r = vehicle.car.wheelRadius;
    // tyre with rounded shoulders (lathe profile)
    const prof = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI;
      prof.push(new THREE.Vector2(r * 0.7 + (r * 0.3) * Math.sin(a) ** 0.35, -0.11 * Math.cos(a)));
    }
    const tyreGeo = new THREE.LatheGeometry(prof, 36).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.2, 28, 1, true).rotateZ(Math.PI / 2);
    const faceGeo = new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.21, 16).rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.05, r * 1.3, 0.05);
    const discGeo = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.03, 24).rotateZ(Math.PI / 2);
    const calGeo = new THREE.BoxGeometry(0.06, 0.12, 0.16);
    this.wheels = vehicle.wheels.map((w) => {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const t = new THREE.Mesh(tyreGeo, tyre);
      t.castShadow = true;
      spin.add(t);
      spin.add(new THREE.Mesh(rimGeo, rim));
      spin.add(new THREE.Mesh(faceGeo, rim));
      const outer = w.mount.x < 0 ? -0.075 : 0.075;
      for (let k = 0; k < 6; k++) {
        const sp = new THREE.Mesh(spokeGeo, rim);
        sp.position.x = outer;
        sp.rotation.x = (k / 6) * Math.PI;
        spin.add(sp);
      }
      const dsk = new THREE.Mesh(discGeo, disc);
      dsk.position.x = -outer * 0.4;
      steer.add(dsk);
      const cal = new THREE.Mesh(calGeo, caliper);
      cal.position.set(-outer * 0.4, r * 0.38, 0.12);
      steer.add(cal);
      steer.add(spin);
      this.root.add(steer);
      return { steer, spin, w };
    });
    this.cockpit = new Cockpit(body, vehicle);
  }

  /** Show the interior only for the in-car camera. */
  setView(mode) {
    this.cockpit.visible = mode === 'cockpit';
  }

  pop() {
    this.flameTimer = 0.07 + Math.random() * 0.05;
  }

  update(dt = 1 / 60) {
    const v = this.vehicle;
    this.root.position.copy(v.position);
    this.root.quaternion.copy(v.quaternion);
    for (const wh of this.wheels) {
      const w = wh.w;
      wh.steer.position.set(w.mount.x, w.mount.y - w.L, w.mount.z);
      wh.steer.rotation.y = -w.steer;
      wh.spin.rotation.x = -w.spin;
    }
    this.tailMat.emissiveIntensity = v.controls.brake > 0.05 ? 4 : 0.8;
    if (this.flameTimer > 0) {
      this.flameTimer -= dt;
      this.flame.visible = true;
      this.flame.scale.setScalar(0.7 + Math.random() * 0.6);
    } else this.flame.visible = false;
    for (const e of v.events) if (e.type === 'shift') this.cockpit.onShift(e.dir);
    this.cockpit.update(dt);
  }

  dispose() {
    this.cockpit.dispose();
    this.root.traverse((o) => o.geometry?.dispose?.());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
  }
}
