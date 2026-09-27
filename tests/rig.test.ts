import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareRig } from '../src/renderer/components/car/rig';

/** A minimal car: body box + four cylinder wheels, front wheels optionally pre-steered. */
function fakeCar(frontYaw: number, frontAtNegZ = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 4.4), new THREE.MeshStandardMaterial({ name: 'Body_Color' }));
  body.name = 'body';
  body.position.y = 0.75;
  g.add(body);
  const zf = frontAtNegZ ? -1.3 : 1.3;
  const wheels: [string, number, number][] = [
    ['wheel_fl', 0.85, zf],
    ['wheel_fr', -0.85, zf],
    ['wheel_rl', 0.85, -zf],
    ['wheel_rr', -0.85, -zf],
  ];
  for (const [name, x, z] of wheels) {
    const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 32);
    geo.rotateZ(Math.PI / 2); // axle along x
    const w = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: 'tire' }));
    w.name = name;
    w.position.set(x, 0.34, z);
    if (name.includes('_f')) w.rotation.y = frontYaw;
    g.add(w);
  }
  return g;
}

/** Sketchfab-style export: generic names, front at -z, only parts hint at the front. */
function genericCar() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 4.4), new THREE.MeshStandardMaterial({ name: 'Material_3' }));
  body.name = 'Object_2';
  body.position.y = 0.8;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), new THREE.MeshStandardMaterial({ name: 'headlight_glass' }));
  head.name = 'Object_7';
  head.position.set(0, 0.8, -2.2);
  g.add(head);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2), new THREE.MeshStandardMaterial({ name: 'exhaust_chrome' }));
  pipe.name = 'Object_9';
  pipe.position.set(0.4, 0.3, 2.2);
  g.add(pipe);
  let n = 20;
  for (const [x, z] of [[0.85, 1.3], [-0.85, 1.3], [0.85, -1.3], [-0.85, -1.3]]) {
    const tyreGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 32);
    tyreGeo.rotateZ(Math.PI / 2);
    const tyre = new THREE.Mesh(tyreGeo, new THREE.MeshStandardMaterial({ name: 'Material_7' }));
    tyre.name = `Object_${n++}`;
    tyre.position.set(x, 0.34, z);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 24);
    rimGeo.rotateZ(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ name: 'Material_8' }));
    rim.name = `Object_${n++}`;
    rim.position.set(x, 0.34, z);
    g.add(tyre, rim);
  }
  return g;
}

describe('prepareRig', () => {
  it('does not mistake a "Trim" part for a rim', () => {
    const car = fakeCar(0);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.3), new THREE.MeshStandardMaterial({ name: 'CarPaint_Trim_Carbon' }));
    spoiler.name = 'mSpoiler_Trim_Carbon';
    spoiler.position.set(-0.1, 1.2, -2.05);
    car.add(spoiler);
    const rig = prepareRig(car, '#f00');
    rig.root.updateMatrixWorld(true);
    for (const w of rig.wheels) {
      let spoilerInside = false;
      w.spin.traverse((o) => (spoilerInside ||= o.name === 'mSpoiler_Trim_Carbon'));
      expect(spoilerInside).toBe(false);
    }
  });

  it('finds wheels by shape and the front by its parts on generic exports', () => {
    const rig = prepareRig(genericCar(), 'original');
    rig.root.updateMatrixWorld(true);
    for (const w of rig.wheels) {
      const meshes: THREE.Object3D[] = [];
      w.spin.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o));
      expect(meshes.length).toBe(2); // tyre + rim spin together
    }
    // headlights were at -z in the file → the car must be turned so they end up at +z
    let headZ = 0;
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && rig.headMaterials.includes(m.material as THREE.MeshStandardMaterial)) headZ = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).z;
    });
    expect(headZ).toBeGreaterThan(1.5);
    expect(rig.headMaterials.length).toBe(1);
    expect(rig.paintMaterials.length).toBe(0); // original paint kept
  });

  it('straightens pre-steered front wheels', () => {
    const rig = prepareRig(fakeCar(0.52), '#f00');
    for (const w of rig.wheels) {
      expect(w.width).toBeLessThan(0.3);
      rig.root.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(w.spin).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(0.3);
    }
  });

  it('turns a car whose front faces -z and keeps wheels in FL FR RL RR order', () => {
    const rig = prepareRig(fakeCar(0, true), '#f00');
    expect(rig.wheelPos[0].z).toBeGreaterThan(0); // front axle now at +z
    expect(rig.wheelPos[0].x).toBeGreaterThan(0); // left is +x
    expect(rig.wheelPos[1].x).toBeLessThan(0);
    expect(rig.wheelPos[2].z).toBeLessThan(0);
  });

  it('recolours the body paint and puts the tyres on the ground', () => {
    const rig = prepareRig(fakeCar(0), '#123456');
    expect(rig.paintMaterials.length).toBe(1);
    expect(rig.paintMaterials[0].color.getHexString()).toBe('123456');
    const box = new THREE.Box3().setFromObject(rig.root);
    expect(box.min.y).toBeCloseTo(0, 2);
  });
});
