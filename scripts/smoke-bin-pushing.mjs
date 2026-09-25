import assert from "node:assert/strict";
import * as THREE from "three";
import { AABBCollisionWorld, FirstPersonController } from "../src/player.js";
import { createUsherWaste, WASTE_BIN_RADIUS } from "../src/usher-waste.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { return new Proxy({ canvas: this, measureText: text => ({ width: String(text).length * 12 }) }, { get: (object, key) => object[key] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
function domStub() {
  const win = { addEventListener() {}, removeEventListener() {} };
  return { ownerDocument: { defaultView: win, addEventListener() {}, removeEventListener() {}, getElementById() { return null; } }, addEventListener() {}, removeEventListener() {} };
}
function fixture() {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(150, .1, 150)); floor.position.y = -.05; root.add(floor);
  const world = { root, groundHeight: () => 0 }, camera = new THREE.PerspectiveCamera(70, 1.5, .05, 200);
  const collisions = new AABBCollisionWorld({ bounds: { xMin: -75, xMax: 75, zMin: -75, zMax: 75 } });
  const controller = new FirstPersonController({ camera, domElement: domStub(), collisionWorld: collisions,
    spawn: [0, 0, 1.03], initialYaw: 0, touchMode: false, groundSampler: world.groundHeight });
  controller.active = true;
  const saved = { version: 1, nextBag: 1, depositedBags: 0, bags: [], bins: [0, 20, 40].map((x, i) => ({
    room: `theater-${i + 1}`, x, z: 0, yaw: Math.PI, fill: 20, lined: true, spares: 12,
  })) };
  const game = createUsherWaste({ scene, world, camera, collisionWorld: collisions, controller,
    storage: { getItem: () => JSON.stringify(saved), setItem() {} } });
  controller.setLook(0, Math.atan2(1.14 - 1.68, .60)); game.update(1 / 60, { active: true });
  assert.equal(game.getSnapshot().focus, "handle"); assert.equal(game.interact(), true);
  assert.equal(game.heldTool, "rolling bin"); controller.setLook(0, 0);
  const bin = () => game.getSnapshot().bins[0];
  function frame(key = "KeyW", yaw = controller.yaw) {
    controller._keys.clear(); if (key) controller._keys.add(key);
    controller.setLook(yaw, 0); controller.update(1 / 60); game.update(1 / 60, { active: true });
    const b = bin(), own = collisions.colliders.find(c => c.id === b.id); own.enabled = false;
    assert.equal(collisions.isOverlapping({ x: b.x, y: 0, z: b.z }, WASTE_BIN_RADIUS - .001, .025, 1.12), false, "The pushed bin remains outside world solids"); own.enabled = true;
    assert.equal(collisions.isOverlapping(controller.position, controller.radius - .001, 0, controller.bodyHeight), false, "The actual controller remains outside bin and wall solids");
    assert.equal(game.heldTool, "rolling bin", "Ordinary walking never loses the grip");
    return b;
  }
  function gripError() {
    const b = bin(), direction = camera.getWorldDirection(new THREE.Vector3()); direction.y = 0; direction.normalize();
    return Math.hypot(b.x - camera.position.x - direction.x * 1.03, b.z - camera.position.z - direction.z * 1.03);
  }
  return { game, controller, collisions, bin, frame, gripError,
    dispose() { game.dispose(); controller.dispose(); floor.geometry.dispose(); floor.material.dispose(); } };
}

const walking = fixture(), origin = walking.bin();
for (let frame = 0; frame < 120; frame++) {
  walking.frame(); assert.ok(walking.gripError() < .016, "Bin follows the real 5.46 m/s controller without spring lag");
}
assert.ok(origin.z - walking.bin().z > 9.5, "Pushing retains ordinary walking pace");
const forwardZ = walking.bin().z;
for (let frame = 0; frame < 70; frame++) {
  walking.frame("KeyS"); assert.ok(walking.gripError() < .016, "Reversing preserves the handle coupling");
}
assert.ok(walking.bin().z - forwardZ > 3, "The bin reverses with the operator after ordinary player deceleration");
const beforeTurn = walking.bin();
for (let frame = 0; frame < 90; frame++) {
  walking.frame("KeyW", -Math.PI / 2 * (frame + 1) / 90);
  assert.ok(walking.gripError() < .02, "Turning preserves the handle coupling");
}
assert.ok(walking.bin().x > beforeTurn.x + 3, "The bin follows a walking ninety-degree turn");
walking.dispose();

const blocked = fixture();
const wall = blocked.collisions.addBox({ id: "bin-stop-wall", minX: -8, maxX: 8, minY: 0, maxY: 3, minZ: -8.3, maxZ: -8 });
for (let frame = 0; frame < 180; frame++) {
  blocked.frame();
  assert.ok(blocked.gripError() < .02, "A stopped bin also holds the operator at its handle");
}
assert.ok(Math.abs(blocked.bin().z - (wall.maxZ + WASTE_BIN_RADIUS)) < .03, "The bin reaches the wall and stops on contact");
for (let frame = 0; frame < 40; frame++) {
  blocked.frame("KeyD");
  assert.ok(blocked.gripError() < .02, "Side-stepping along a wall keeps both ends of the handle attached");
}
assert.ok(blocked.bin().x > 2, "The coupled pair can slide sideways along the wall");
const wallStop = blocked.bin().z;
for (let frame = 0; frame < 60; frame++) blocked.frame("KeyS");
assert.ok(blocked.bin().z > wallStop + 3, "The coupled operator can back away from the wall");
blocked.dispose();
console.log("Bin pushing smoke passed: production controller at normal speed, reversal, ninety-degree turn, solid wall stop, held separation and backing away.");
