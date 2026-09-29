import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherCabinets } from "../src/usher-cabinets.js";
import { createUsherDoors } from "../src/usher-doors.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";
import { AABBCollisionWorld } from "../src/player.js";

globalThis.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({ canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      measureText: t => ({ width: String(t).length * 12 }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }, { get: (t, k) => t[k] ?? (() => {}) });
  }
};
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 1.5, .05, 250);
camera.position.set(0, 1.68, 0);
const world = createTheaterWorld({ scene, materials: createMaterialLibrary() });
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds }); collisionWorld.addBoxes(world.colliders);
const baseline = collisionWorld.colliders.length;
const doors = createUsherDoors({ scene, camera, collisionWorld });
const data = new Map(), storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
const cabinets = createUsherCabinets({ scene, camera, collisionWorld, storage });
scene.updateMatrixWorld(true);
assert.deepEqual(cabinets.getSnapshot().map(c => c.number), [6, 7, 8]);
const frames = () => { for (let i = 0; i < 120; i++) cabinets.update(1 / 60, { active: true }); };
function aim(cabinet, door) {
  const snapshot = cabinets.getSnapshot().find(c => c.id === cabinet.id);
  camera.position.fromArray(snapshot.stand); camera.position.y += 1.68;
  camera.lookAt(...snapshot.doors.find(d => d.id === door.id).handle); camera.updateMatrixWorld(true);
  cabinets.update(0, { active: true });
}
for (const cabinet of cabinets.cabinets) {
  const snapshot = cabinets.getSnapshot().find(c => c.id === cabinet.id);
  assert.equal(collisionWorld.isOverlapping({ x: snapshot.stand[0], z: snapshot.stand[2] }, .34, 0, 1.78), false, `${cabinet.id}: approach is walkable`);
  for (const door of cabinet.doors) {
    aim(cabinet, door);
    assert.match(cabinets.focusedPrompt, /Open/, `${cabinet.id}: ${door.id} reachable from the recess`);
    assert.equal(cabinets.interact(), true); frames();
    assert.ok(door.angle > 1.56, `${cabinet.id}: ${door.id} opens fully with actual architecture and auditorium leaves (angle ${door.angle})`);
    aim(cabinet, door); assert.match(cabinets.focusedPrompt, /Close/);
    assert.equal(cabinets.interact(), true); frames();
    assert.ok(door.angle < .002, `${cabinet.id}: ${door.id} closes without clipping`);
  }
  // The downward ray passes through the actual hole to the bin bottom, whereas
  // a nearby ray hits the worktop. This catches a decorative painted-on hole.
  cabinet.group.updateWorldMatrix(true, true);
  const point = cabinet.group.localToWorld(new THREE.Vector3(.306, 1.45, .005));
  const ray = new THREE.Raycaster(point, new THREE.Vector3(0, -1, 0));
  const centralHit = ray.intersectObject(cabinet.group, true)[0];
  assert.ok(centralHit && centralHit.point.y < .2, `${cabinet.id}: real open aperture into can`);
  const side = cabinet.group.localToWorld(new THREE.Vector3(.54, 1.45, .005));
  ray.set(side, new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(cabinet.group, true)[0].point.y > 1.1, `${cabinet.id}: solid surrounding counter`);
}
for (const door of doors.doors) for (const leaf of door.leaves) {
  assert.equal(leaf.hinge.children.length, 3, `${door.id}: detail remains only three draw calls per leaf`);
  assert.equal(leaf.hinge.userData.doorArt.style, door.small ? "single-pushplate" : "double-pull");
  assert.ok(leaf.hinge.userData.doorArt.windowSize > .2);
}
const cabinet = cabinets.cabinets[0], door = cabinet.doors[0];
aim(cabinet, door); cabinets.interact(); frames();
cabinets.dispose();
const restored = createUsherCabinets({ scene, camera, collisionWorld, storage });
assert.equal(restored.getSnapshot()[0].doors[0].targetOpen, true, "Cabinet hinges persist independently");
restored.dispose(); doors.dispose();
assert.equal(collisionWorld.colliders.length, baseline, "Dynamic cabinet and auditorium collision is disposed cleanly");
console.log("v0.27 cabinets: all three recesses accessible; six doors clear actual walls, vision-window auditorium art batched; real trash apertures and persistence verified.");
