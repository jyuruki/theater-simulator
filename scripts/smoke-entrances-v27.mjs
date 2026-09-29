import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AUDITORIUMS, SERVICE_ROOMS } from "../src/layout-data.js";
import { auditoriumDoorLayout } from "../src/auditorium-door-layout.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createUsherDoors } from "../src/usher-doors.js";
import { createCustomerNavigation } from "../src/show-customer-navigation.js";
import { createShowCustomers } from "../src/show-customers.js";
import { createShowAttendance } from "../src/show-attendance.js";
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
const nav = createCustomerNavigation(world);
scene.updateMatrixWorld(true);
let capsuleWalks = 0;
for (const room of AUDITORIUMS.filter(room => [6, 7, 8].includes(room.number))) {
  const spec = auditoriumDoorLayout(room), door = doors.doors.find(door => door.id === room.id);
  assert.ok(spec.z - room.bounds.zMin >= 1.5, `${room.id}: double door recessed from hallway`);
  assert.equal(door.leaves.length, 2);
  const hall = new THREE.Vector3(...spec.route.hall), inner = new THREE.Vector3(...spec.route.inside);
  for (const [start, target] of [[hall, inner], [inner, hall]]) {
    const p = start.clone(), direction = Math.sign(target.z - start.z), count = Math.ceil(Math.abs(target.z - start.z) / .025);
    for (let i = 0; i < count; i++) {
      collisions.moveCircle(p, 0, direction * .025, .34, 0, 1.78);
      assert.ok(Math.abs(world.groundHeight(p.x, p.z, 0)) < .005, `${room.id}: uninterrupted ground-level approach`);
    }
    assert.ok(p.distanceTo(target) < .08, `${room.id}: player capsule traverses recessed doorway both ways`);
    capsuleWalks++;
  }
  camera.position.copy(hall); camera.position.y = 1.68; door.targetOpen = false;
  for (let i = 0; i < 150; i++) doors.update(1 / 60, { active: true });
  assert.ok(door.angle < .002, `${room.id}: both leaves close without wall interference`);
  assert.ok(collisions.isOverlapping({ x: spec.x, z: spec.z }, .24, 0, 1.74), `${room.id}: closed leaves block passage`);
  doors.requestPassage(room.id);
  for (let i = 0; i < 150; i++) doors.update(1 / 60, { active: true });
  assert.ok(door.angle > 1.56, `${room.id}: patron can open recessed doors`);
  const route = nav.theaterPath(room.id);
  assert.ok(route?.length > 2, `${room.id}: lobby-to-bowl customer route survives recess`);
  for (let i = 1; i < route.length; i++) assert.ok(nav.clearSegment(route[i - 1], route[i]), `${room.id}: customer route segment ${i} clear`);
  const cabinet = room.entry.serviceCabinet, b = cabinet.recessBounds;
  const approach = room.number === 6 ? [cabinet.x, cabinet.z - 1.05] : [cabinet.x - 1.05, cabinet.z];
  assert.ok(nav.clearPoint(planToWorldX(approach[0]), approach[1], 0), `${room.id}: cabinet service approach remains walkable`);
  assert.ok(b.xMax > b.xMin && b.zMax > b.zMin);
}
const room6 = AUDITORIUMS.find(room => room.number === 6), stair = SERVICE_ROOMS.find(room => room.id === "future-upstairs-stair");
const cubby = room6.entry.upstairsCubbyBounds, step = { x: planToWorldX(cubby.xMax - .38), z: stair.doorCenter };
assert.equal(collisions.isOverlapping(step, .3, 0, 1.78), false, "Left mini-cubby fits an employee before the closed upstairs door");
assert.equal(world.groundHeight(step.x, step.z, 0), 0, "Upstairs mini-cubby retains its ground-level landing");
assert.equal(collisions.isOverlapping({ x: planToWorldX(cubby.xMin), z: stair.doorCenter }, .2, 0, 1.78), true,
  "The upstairs closed leaf remains solid inside the recess");
const ray = new THREE.Raycaster(new THREE.Vector3(step.x, 1.68, step.z), new THREE.Vector3(1, 0, 0), .01, 1.2);
assert.ok(ray.intersectObject(world.root, true).length, "The visible upstairs door closes the actual mini-cubby");
nav.dispose();
camera.position.set(130, 1.68, -20);
const customers = createShowCustomers({ scene, world, camera, collisionWorld: collisions, doors });
const bytes = readFileSync(new URL("../public/models/theater-npcs.glb", import.meta.url));
await customers.loadAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
const shows = [6, 7, 8].map(number => {
  const id = `theater-${number}`, plan = customers.navigation.seatPlans.find(plan => plan.id === id);
  let cycle = 0, attendance;
  do { attendance = createShowAttendance(plan, { cycle: ++cycle, version: 26 }); } while ((attendance.count < 3 || attendance.count > 6) && cycle < 40);
  assert.equal(customers.navigation.theaterSeats(id, attendance.seatIds).length, attendance.count,
    `${id}: prepare all fixture seat routes before advancing its physical clock`);
  return { id: `v27-start-${number}`, kind: "start", theaterId: id, time: 720, cycle, audienceCycle: cycle, attendanceVersion: 26, count: attendance.count };
});
async function advance(seconds) {
  for (let frame = 0; frame < seconds * 20; frame++) {
    if (frame % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    world.entranceDoors.update(.05, camera.position); doors.update(.05, { active: true }); customers.update(.05, true);
  }
}
for (const show of shows) doors.doors.find(door => door.id === show.theaterId).targetOpen = false;
await advance(2);
for (const show of shows) {
  assert.ok(doors.doors.find(door => door.id === show.theaterId).angle < .002, "Arrival fixture starts with closed double doors");
  customers.onStart(show);
}
await advance(320);
for (const show of shows) {
  const seated = customers.getSnapshot().actors.filter(actor => actor.room === show.theaterId && actor.state === "seated");
  assert.equal(seated.length, show.count, `${show.theaterId}: arrivals open the recessed door and reach their seats: ${JSON.stringify(customers.getSnapshot())}`);
  doors.doors.find(door => door.id === show.theaterId).targetOpen = false;
}
await advance(2);
for (const show of shows) {
  assert.ok(doors.doors.find(door => door.id === show.theaterId).angle < .002, "Departure fixture starts with closed double doors");
  customers.onBreak({ ...show, id: show.id.replace("start", "break"), kind: "break", time: 840 });
}
await advance(340);
const expected = shows.reduce((sum, show) => sum + show.count, 0);
assert.equal(customers.getSnapshot().stats.exited, expected, `Guests open the recessed doors from inside and fully exit: ${JSON.stringify(customers.getSnapshot())}`);
customers.dispose(); doors.dispose(); world.dispose(); materials.dispose();
console.log(`v27 entrances passed: ${capsuleWalks} recessed doorway walks, 3 patron routes, 3 cabinet approaches, inset upstairs door, ${expected} guests arriving/leaving through closed double doors.`);
