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

describe('prepareRig', () => {
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
