import assert from "node:assert/strict";
import * as THREE from "three";
import { AUDITORIUMS } from "../src/layout-data.js";
import { auditoriumBlindAlcove, auditoriumDoorLayout } from "../src/auditorium-door-layout.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createUsherDoors } from "../src/usher-doors.js";
import { AABBCollisionWorld } from "../src/player.js";
import { planToWorldX } from "../src/coordinates.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: text => ({ width: String(text).length * 12 }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, { get: (object, key) => object[key] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene(), materials = createMaterialLibrary();
const world = createTheaterWorld({ scene, materials });
const collisions = new AABBCollisionWorld({ bounds: world.worldBounds }); collisions.addBoxes(world.colliders);
const camera = new THREE.PerspectiveCamera(), doors = createUsherDoors({ scene, camera, collisionWorld: collisions });
scene.updateMatrixWorld(true);
let thresholdWalks = 0, wallRays = 0;
for (const door of doors.doors) {
  const spec = auditoriumDoorLayout(AUDITORIUMS.find(a => a.id === door.id));
  camera.position.set(...spec.route.outside); camera.position.y = 1.68;
  camera.lookAt(...doors.getSnapshot().find(d => d.id === door.id).handles[0]); camera.updateMatrixWorld(true);
  doors.update(0, { active: true }); assert.equal(doors.interact(), true, `${door.id}: reach the open handle`);
  for (let i = 0; i < 150; i++) doors.update(1 / 60, { active: true });
  assert.ok(door.angle < .002, `${door.id}: closes through a clear structural sweep`);
  assert.ok(collisions.isOverlapping({ x: door.x, z: door.z }, .3, 0, 1.78), `${door.id}: closed door blocks entry`);
  camera.lookAt(...doors.getSnapshot().find(d => d.id === door.id).handles[0]); camera.updateMatrixWorld(true);
  doors.update(0, { active: true }); assert.equal(doors.interact(), true);
  for (let i = 0; i < 150; i++) doors.update(1 / 60, { active: true });
  assert.ok(door.angle > 1.56, `${door.id}: opens without clipping walls or trim`);
  assert.equal(collisions.isOverlapping({ x: door.x, z: door.z }, .3, 0, 1.78), false);
  if (door.small) {
    assert.equal(door.leaves.length, 1);
    const leaf = door.leaves[0];
    assert.ok(leaf.hinge.position.z < door.z - .5, `${door.id}: hinge is on the opposite jamb from v23`);
    const center = leaf.hinge.localToWorld(new THREE.Vector3(leaf.direction * leaf.leafWidth / 2, 1, 0));
    assert.ok((center.x - door.x) * door.normal[0] < -.3, `${door.id}: red door still swings outward`);
    for (const direction of [1, -1]) {
      const from = direction > 0 ? door.route.outside : door.route.inside;
      const to = direction > 0 ? door.route.inside : door.route.outside;
      const walker = new THREE.Vector3(...from);
      for (let i = 0; i < 100; i++) collisions.moveCircle(walker, direction * door.normal[0] * .03, direction * door.normal[2] * .03, .34, 0, 1.78);
      assert.ok(Math.hypot(walker.x - to[0], walker.z - to[2]) < .5, `${door.id}: capsule traverses both sides`);
      thresholdWalks++;
    }
  }
}
const ray = new THREE.Raycaster(), sealed = [];
for (const room of AUDITORIUMS) {
  const pocket = auditoriumBlindAlcove(room); if (!pocket) continue;
  sealed.push(room.number);
  const ceiling = world.auditoriumLayouts.get(room.id).presentation.ceilingY;
  // Static wall boxes are instanced in the rendered world, so inspect their
  // actual surfaces below instead of relying on a mesh name surviving batching.
  assert.ok(world.colliders.some(c => c.id === `${room.id}-sealed-blind-alcove`), `${room.id}: pocket has a structural fill collider`);
  for (const fraction of [.15, .5, .85]) for (const y of [.2, 1.68, ceiling - .2]) {
    const x = planToWorldX(pocket.xMin + (pocket.xMax - pocket.xMin) * fraction);
    ray.set(new THREE.Vector3(x, y, pocket.zMin - .45), new THREE.Vector3(0, 0, 1)); ray.far = .8;
    const hit = ray.intersectObject(world.root, true)[0];
    assert.ok(hit && Math.abs(hit.point.z - (pocket.zMin - .09)) < .002,
      `${room.id}: new wall is flush across pocket width and full ceiling height`);
    wallRays++;
  }
  const midpoint = { x: planToWorldX((pocket.xMin + pocket.xMax) / 2), z: (pocket.zMin + pocket.zMax) / 2 };
  assert.ok(collisions.isOverlapping(midpoint, .12, 0, 1.78), `${room.id}: the removed blind pocket cannot still be entered`);
}
assert.deepEqual(sealed, [9, 10, 11, 12], "Only blind non-route alcoves close; real entrance/storage nooks remain intact");
doors.dispose(); world.dispose(); materials.dispose();
console.log(`v24 geometry passed: 14 closing/opening sweeps, ${thresholdWalks} single-door capsule routes, ${wallRays} full-height flush-wall rays, 4 sealed blind alcoves.`);
