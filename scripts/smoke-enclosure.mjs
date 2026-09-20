import assert from "node:assert/strict";
import * as THREE from "three";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AABBCollisionWorld, FirstPersonController } from "../src/player.js";
import { AUDITORIUMS, SERVICE_ROOMS, zoneAt } from "../src/layout-data.js";
import { planToWorldX, worldToPlanX } from "../src/coordinates.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({
      canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      measureText: text => ({ width: String(text).length * 12 }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
  }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene();
const materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
scene.updateMatrixWorld(true);
const collision = new AABBCollisionWorld({ bounds: world.worldBounds });
collision.addBoxes(world.colliders);
const dom = {
  ownerDocument: { defaultView: { addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {}, getElementById() { return null; } },
  addEventListener() {}, removeEventListener() {},
};
function walk(x, z, feetY, yaw, frames = 110) {
  const player = new FirstPersonController({ camera: new THREE.PerspectiveCamera(), domElement: dom,
    collisionWorld: collision, spawn: [planToWorldX(x), feetY, z], initialYaw: yaw,
    groundSampler: world.groundHeight, ceilingSampler: world.ceilingHeight, touchMode: false });
  assert.ok(!collision.isOverlapping(player.position, 0.34, feetY, 1.78), "Walk must start clear of geometry");
  player.active = true;
  player._keys.add("KeyW");
  for (let n = 0; n < frames; n++) player.update(1 / 60);
  const result = { x: worldToPlanX(player.position.x), z: player.position.z, y: player.position.y };
  player.dispose();
  return result;
}

// The new rear wall is immediately behind the seats: test its two remaining
// side landings instead of spawning inside the removed empty rear passage.
let enclosureApproaches = 0;
for (const room of AUDITORIUMS.filter((room) => room.stadium.seatingProfile)) {
  const layout = world.auditoriumLayouts.get(room.id);
  for (const aisle of Object.values(layout.sideAisles)) {
    const end = walk(aisle.centerX, layout.backRowZ, layout.backElevation, 0);
    assert.ok(end.z > layout.rearWallZ + 0.4 && Math.abs(end.y - layout.backElevation) < 0.01,
      `${room.id} rear fall: ${JSON.stringify(end)}`);
    enclosureApproaches += 1;
  }
}
const t6Layout = world.auditoriumLayouts.get("theater-6");
const t6EastX = t6Layout.sideAisles.east.centerX;
for (const z of [...t6Layout.rows.slice(2).map((row) => row.z), t6Layout.entryCross.bounds.zMin - 0.4]) {
  const y = world.groundHeight(planToWorldX(t6EastX), z, t6Layout.backElevation);
  const end = walk(t6EastX, z, y, Math.PI / 2);
  assert.ok(end.x < t6Layout.routeReserve.bounds.xMin - 0.3 && Math.abs(end.y - y) < 0.01,
    `T6 side fall at z=${z}: ${JSON.stringify(end)}`);
  enclosureApproaches += 1;
}

const ray = new THREE.Raycaster();
function cast(x, y, z, dx, dy, dz, far = 100) {
  ray.set(new THREE.Vector3(planToWorldX(x), y, z), new THREE.Vector3(-dx, dy, dz).normalize());
  ray.near = 0.001; ray.far = far;
  return ray.intersectObject(world.root, true);
}
for (const z of [73, 78, 87, 97]) {
  const hits = cast(-6, 5, z, 1, 0, 0, 2);
  assert.ok(hits.length && hits[0].distance < 1.8, `T3 east upper wall missing at z=${z}`);
}
for (const x of [-20, -15, -10.4, -8.4, -5.5]) {
  assert.ok(cast(x, 5, 73, 0, 0, -1, 1.2).length, `T3 rear upper enclosure missing at x=${x}`);
}

// Check rendered instance bounds, not just the spacing formula.
const matrix = new THREE.Matrix4();
function boxes(mesh, start, count) {
  mesh.geometry.computeBoundingBox();
  return Array.from({ length: count }, (_, i) => {
    mesh.getMatrixAt(start + i, matrix);
    matrix.premultiply(mesh.matrixWorld);
    return mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
  });
}
function separated(items, label) {
  items.sort((a, b) => a.min.x - b.min.x);
  for (let i = 1; i < items.length; i++) {
    assert.ok(items[i].min.x >= items[i - 1].max.x - 0.0001, `${label}: adjacent meshes intersect`);
  }
}
let seats = 0;
for (const room of AUDITORIUMS) {
  const backs = world.root.getObjectByName(`${room.id}-seat-backs`);
  const cushions = world.root.getObjectByName(`${room.id}-seat-cushions`);
  const arms = world.root.getObjectByName(`${room.id}-seat-arms`);
  assert.equal(backs.count, room.seats);
  let seatIndex = 0, armIndex = 0;
  for (const count of room.rows) {
    const armBoxes = boxes(arms, armIndex, count + 1);
    separated([...boxes(backs, seatIndex, count), ...armBoxes], `${room.id} backrests/arms`);
    separated([...boxes(cushions, seatIndex, count), ...armBoxes], `${room.id} cushions/arms`);
    seatIndex += count; armIndex += count + 1;
  }
  assert.equal(armIndex, arms.count, "Each row has one shared armrest at each seat boundary");
  seats += backs.count;
  const l = world.auditoriumLayouts.get(room.id);
  for (const [cross, y] of [[l.rearCross, l.backElevation], [l.frontCross, l.frontElevation]]) {
    assert.equal(zoneAt(l.sideAisles.west.centerX, (cross.bounds.zMin + cross.bounds.zMax) / 2, y).id,
      room.id, `${room.id} bowl must select its screen/location`);
  }
}
assert.equal(seats, 1093);
assert.equal(zoneAt(-5.5, 80, 0).id, "theater-3-entry");
for (const storage of SERVICE_ROOMS.filter(r => r.kind === "storage-lower")) {
  const x = (storage.bounds.xMin + storage.bounds.xMax) / 2;
  const z = (storage.bounds.zMin + storage.bounds.zMax) / 2;
  assert.equal(zoneAt(x, z, 0).id, storage.id, "Lower room must retain its own location");
  const upperLayout = world.auditoriumLayouts.get(storage.id.replace("under-storage", "theater"));
  const upperZ = Math.min(storage.bounds.zMax - 0.15, Math.max(storage.bounds.zMin + 0.15, upperLayout.backRowZ + 0.1));
  const y = world.groundHeight(planToWorldX(x), upperZ, upperLayout.backElevation);
  assert.equal(zoneAt(x, upperZ, y).id, storage.id.replace("under-storage", "theater"));
  const sign = world.root.getObjectByName(`${storage.id}-label`);
  const center = sign.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(sign.matrixWorld);
  ray.set(center.clone().addScaledVector(normal, 0.6), normal.clone().negate()); ray.far = 0.61;
  assert.equal(ray.intersectObject(world.root, true)[0]?.object, sign, `${storage.id} label is buried`);
}
const boxOfficeSign = world.root.getObjectByName("box-office-sign");
const t6Arrow = world.root.getObjectByName("theater-6-first-arrow");
const arrowCenter = t6Arrow.getWorldPosition(new THREE.Vector3());
const arrowNormal = new THREE.Vector3(0, 0, 1).transformDirection(t6Arrow.matrixWorld);
ray.set(arrowCenter.clone().addScaledVector(arrowNormal, 0.6), arrowNormal.clone().negate()); ray.far = 0.61;
assert.equal(ray.intersectObject(world.root, true)[0]?.object, t6Arrow,
  "The restored storage label must not cover the Theater 6 direction sign");
const center = boxOfficeSign.getWorldPosition(new THREE.Vector3());
const normal = new THREE.Vector3(0, 0, 1).transformDirection(boxOfficeSign.matrixWorld);
ray.set(center.clone().addScaledVector(normal, -0.6), normal); ray.far = 0.61;
assert.equal(ray.intersectObject(boxOfficeSign, true)[0]?.object.name, "box-office-sign-backing",
  "The back of a sign must hit an opaque body rather than reversed lettering");
// The sun must be occluded by the first solid room surface, including after
// material batching. Otherwise overhead trusses cast through the enclosure.
for (const [x, z] of [[-22.2, 2.9], [-24.7, 13], [-22.3, 18.1]]) {
  const firstSurface = cast(x, 0.1, z, 18, 28, -16)[0];
  assert.ok(firstSurface?.object.castShadow, `Light leaks through the room shell at ${x}, ${z}`);
}
world.dispose(); materials.dispose();
console.log(`Enclosure regression valid: ${enclosureApproaches} elevated-edge walks blocked · T3 upper shell closed · 1,093 seats without adjacent mesh overlap · stacked zones, visible signs and interior shadow occlusion correct.`);
