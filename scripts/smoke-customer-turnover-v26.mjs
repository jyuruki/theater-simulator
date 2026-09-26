import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createShowAttendance, MAX_SHOW_AUDIENCE } from "../src/show-attendance.js";
import { PATRON_LOBBY, PATRON_EXIT } from "../src/show-customer-navigation.js";
import { createShowCustomers } from "../src/show-customers.js";
import { createUsherDoors } from "../src/usher-doors.js";
import { createUsherWaste, WASTE_CAPACITY } from "../src/usher-waste.js";
import { AABBCollisionWorld } from "../src/player.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AUDITORIUMS } from "../src/layout-data.js";
class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this, createLinearGradient: () => gradient,
    createRadialGradient: () => gradient, measureText: text => ({ width: String(text).length * 12 }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }) }, { get: (o, k) => o[k] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene(), materials = createMaterialLibrary(), world = createTheaterWorld({ scene, materials });
const camera = new THREE.PerspectiveCamera(); camera.position.set(130, 1.68, -20);
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds }); collisionWorld.addBoxes(world.colliders);
const doors = createUsherDoors({ scene, world, camera, collisionWorld });
let waste = createUsherWaste({ scene, world, camera, collisionWorld, getNextBreaks: () => ["theater-5", "theater-2", "theater-1"] });
const customers = createShowCustomers({ scene, world, camera, collisionWorld, doors, waste });

const bytes = readFileSync(new URL("../public/models/theater-npcs.glb", import.meta.url));
await customers.loadAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
const start = { id: "v26-crowd-five", theaterId: "theater-5", kind: "start", time: 700, cycle: 1, audienceCycle: 1, attendanceVersion: 24 };
const count = customers.restoreSchedule({ mode: "day", minute: 703, events: [start], done: [start.id] });
assert.ok(count >= 10, "Stress fixture has a busy auditorium");
const cast = customers.actors.filter(actor => actor.room === "theater-5");
assert.ok(cast.every(actor => Math.abs(actor.speed / (1.10 + actor.index % 4 * .035) - 1.4) < 1e-10));
let tossWhileWalking = 0, maxStanding = 0, movingAtToss = [], previousToss = 0;
async function advance(seconds) {
  for (let i = 0; i < seconds * 20; i++) {
    if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    doors.update(.05, {active: true}); world.entranceDoors.update(.05, camera.position);
    waste.update(.05, {active: true}); customers.update(.05, true);
    maxStanding = Math.max(maxStanding, cast.filter(actor => actor.state === "standing").length);
    const tossed = customers.getSnapshot().stats.tossed;
    if (tossed > previousToss) {
      const actor = cast.find(actor => actor.tossGesture > .4);
      assert.ok(actor && actor.state === "exit", "Throwing keeps the exit route active");
      movingAtToss.push({ actor, position: actor.group.position.clone() }); tossWhileWalking++;
    }
    previousToss = tossed;
  }
}
customers.onBreak({ id: "v26-crowd-five-break", theaterId: "theater-5", kind: "break", time: 800, cycle: 1, audienceCycle: 1, attendanceVersion: 24 });
await advance(1);
assert.ok(cast.filter(actor => actor.state === "seated").length >= count - 1, "Later departures remain seated, not standing in place");
await advance(270);
const result = customers.getSnapshot();
assert.equal(result.stats.exited, count, JSON.stringify(result));
assert.ok(tossWhileWalking >= Math.floor(count * .5), "Most patrons toss while passing the can outside Theater5");
assert.ok(maxStanding < count / 2, "No whole-audience stand-and-wait animation");
assert.ok(movingAtToss.every(({ actor, position }) => actor.group.position.distanceTo(position) > 2), "Toss animation never traps the thrower at the rim");
const firstBin = waste.getSnapshot().bins[0];
assert.equal(WASTE_CAPACITY, 180);
assert.ok(firstBin.fill <= WASTE_CAPACITY, "Toss reservations prevent overflowing a full liner");
waste.depositTrash(firstBin.id, 1000);
const directions = [[1.15,0], [-1.15,0], [0,1.15], [0,-1.15]];
for (const [x,z] of directions) {
  const target = waste.getPassingDisposalTarget(new THREE.Vector3(firstBin.x+x, 1.3, firstBin.z+z));
  assert.notEqual(target?.binId, firstBin.id, "A full can is never a required destination");
}
console.log(JSON.stringify({ count, tossed: tossWhileWalking, maxStanding, exited: result.stats.exited, navigation: result.navigation }));
customers.dispose();
// Rendered QA caught a different row merge: the usher initially stands in a
// busy audience's aisle, then leaves. Yield priority must not become a cycle.
waste.dispose();
waste = createUsherWaste({ scene, world, camera, collisionWorld, getNextBreaks: () => ["theater-14", "theater-8", "theater-9"] });
const crowded = createShowCustomers({ scene, world, camera, collisionWorld, doors, waste });
await crowded.loadAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
const busyStart = { ...start, id: "v26-busy-row-merge", cycle: 2, audienceCycle: 2, attendanceVersion: 26 };
const busyCount = crowded.restoreSchedule({ mode: "day", minute: 703, events: [busyStart], done: [busyStart.id] });
assert.equal(busyCount, 19);
camera.position.set(-8.13, 2.88, 82.63);
crowded.onBreak({ ...busyStart, id: "v26-busy-row-break", kind: "break", time: 800 });
for (let frame = 0; frame < 325 * 20; frame++) {
  if (frame === 95 * 20) camera.position.set(-13.8, 1.68, 67.35);
  if (frame % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  doors.update(.05, {active: true}); world.entranceDoors.update(.05, camera.position);
  waste.update(.05, {active: true}); crowded.update(.05, true);
}
assert.equal(crowded.getSnapshot().stats.exited, busyCount, `A cleared player obstruction must never leave circular row-merge queues: ${JSON.stringify(crowded.getSnapshot())}`);
assert.equal(crowded.getSnapshot().queued.length, 0);
crowded.dispose(); camera.position.set(130, 1.68, -20);
const fast = createShowCustomers({ scene, world, camera, collisionWorld, doors, waste });
await fast.loadAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
const futureStart = { ...start, id: "v26-fast-future", theaterId: "theater-2", time: 720 };
fast.update(.05, true, { minute: 705, events: [futureStart], timeScale: 50 });
assert.ok(Math.abs(fast.getSnapshot().clock - .2) < 1e-9, "50x calendar uses bounded4x customer simulation");
assert.equal(fast.getSnapshot().actors.length, 0);
assert.deepEqual(fast.getUsedSeatIds(futureStart), [], "Known show with nobody seated needs no phantom used trays");
fast.onBreak({ ...futureStart, id: "v26-fast-break", kind: "break", time: 850 });
for (let i = 0; i < 50; i++) fast.update(.05, true, { minute: 850, events: [futureStart], done: [futureStart.id], timeScale: 50 });
assert.equal(fast.getSnapshot().actors.length, 0, "Expired arrival jobs cannot resurrect people after their showing breaks");
assert.equal(fast.getSnapshot().queued.length, 0, "Fast-forward leaves no obsolete show jobs behind");
const partialStart = { ...futureStart, id: "v26-partial-arrival", time: 900 };
const partialCount = fast.restoreSchedule({ mode: "day", minute: 886.1, events: [partialStart], done: [] });
const partialSeats = fast.getUsedSeatIds(partialStart);
assert.equal(partialSeats.length, partialCount);
const fullAttendance = createShowAttendance(fast.navigation.seatPlans.find(plan => plan.id === "theater-2"), {cycle: 1, version: 24});
assert.ok(partialCount > 0 && partialCount < fullAttendance.count);
fast.onBreak({ ...partialStart, id: "v26-partial-break", kind: "break", time: 1000 });
assert.deepEqual(fast.getUsedSeatIds(partialStart), partialSeats, "Cancelled late arrivals do not become dirty seats");
fast.setEnabled(false); assert.equal(fast.getUsedSeatIds(partialStart), undefined, "Disabled NPC system permits seeded fallback");
fast.dispose(); waste.dispose(); doors.dispose(); world.dispose(); materials.dispose();
console.log("Natural turnover valid: seated waits, 40% faster walking, continuous pass-by tosses, busy Theater5 egress without a bin waypoint, full-can bypass, 180-unit capacity.");
