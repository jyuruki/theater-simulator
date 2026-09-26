import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createShowAttendance, MAX_SHOW_AUDIENCE } from "../src/show-attendance.js";
import { PATRON_LOBBY, PATRON_EXIT } from "../src/show-customer-navigation.js";
import { createShowCustomers } from "../src/show-customers.js";
import { createUsherDoors } from "../src/usher-doors.js";
import { createUsherWaste } from "../src/usher-waste.js";
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
const waste = createUsherWaste({ scene, world, camera, collisionWorld });
const customers = createShowCustomers({ scene, world, camera, collisionWorld, doors, waste });
const bytes = readFileSync(new URL("../public/models/theater-npcs.glb", import.meta.url));
const loaded = await customers.loadAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
assert.equal(loaded.routes, 0);
assert.equal(customers.navigation.stats.searches, 1, "Only the short exit route runs at startup");
assert.equal(customers.restoreSchedule({ mode: "day", minute: 705, events: [], done: [] }), 0, "Opening starts with empty theaters");
for (const door of doors.doors) {
  door.targetOpen = false;
  for (let i = 0; i < 30; i++) doors.update(.1, {active: true});
  assert.ok(door.angle < .002);
  doors.requestPassage(door.id);
  for (let i = 0; i < 60; i++) { if (i % 20 === 0) doors.requestPassage(door.id); doors.update(.1, {active: true}); }
  assert.ok(door.angle > 1.56, `${door.id}: repeated nearby traffic holds door open`);
  for (let i = 0; i < 60; i++) doors.update(.1, {active: true});
  assert.ok(door.angle < .002, `${door.id}: closes after flow clears`);
}
let ticked = false;
const pending = customers.navigation.theaterPathAsync("theater-14");
setTimeout(() => { ticked = true; }, 0);
const route = await pending;
assert.ok(route?.length > 1 && ticked, "Long routes yield to input/render event loop");
const event = { id: "day-start-test-2", theaterId: "theater-2", kind: "start", time: 720, cycle: 1, audienceCycle: 1, attendanceVersion: 24 };
let minute = 705, maxTurn = 0, movingSamples = 0, turns = new Map();
async function advance(seconds) {
  for (let i = 0; i < seconds * 20; i++) {
    if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    doors.update(.05, {active: true}); world.entranceDoors.update(.05, camera.position);
    customers.update(.05, true, { mode: "day", minute, events: [event], done: [] });
    for (const actor of customers.actors) {
      if (actor.state !== "arriving") { turns.delete(actor); continue; }
      if (turns.has(actor)) { const delta = actor.group.rotation.y - turns.get(actor); maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)))); movingSamples++; }
      turns.set(actor, actor.group.rotation.y);
    }
  }
}
await advance(2);
assert.equal(customers.getSnapshot().actors.length, 0, "No party spawns before its arrival time");
minute = 706.1; await advance(210);
const early = customers.getSnapshot().actors.length;
const expected = createShowAttendance(customers.navigation.seatPlans.find(plan => plan.id === "theater-2"), { cycle: 1, version: 24 }).count;
assert.ok(early > 0 && early < expected, "Only the early party enters first");
minute = 714; await advance(180);
const middle = customers.getSnapshot().actors.length;
assert.ok(middle > early && middle < expected, "Another party arrives separately before the show");
minute = 721.2; await advance(180);
const final = customers.getSnapshot().actors.filter(actor => actor.state === "seated").length;
assert.equal(final, expected, "Late party enters through automatically reopened doors during the start window");
assert.ok(movingSamples > 100 && maxTurn <= .175001, `Turns are rate-limited to 3.5rad/sec (${maxTurn})`);
assert.ok(doors.doors.find(door => door.id === "theater-2").angle < .002, "Last patron lets the door close behind the entire group");
console.log(JSON.stringify({ startupSearches: 1, early, middle, final, maxTurn, navigation: customers.navigation.stats }));
customers.dispose();
const preShow = createShowCustomers({ scene, world, camera, collisionWorld, doors, waste });
assert.equal(preShow.restoreSchedule({ mode: "day", minute: 714, events: [event], done: [] }), 8, "Pre-show reload restores due parties but not the late party");
preShow.syncSchedule({ minute: 714, events: [event] });
assert.equal(preShow.getSnapshot().queued.length, 1, "Live schedule object without done does not duplicate restored queue");
assert.equal(preShow.onStart(event), false);
preShow.dispose();
const midShow = createShowCustomers({ scene, world, camera, collisionWorld, doors, waste });
assert.equal(midShow.restoreSchedule({ mode: "day", minute: 722, events: [event], done: [event.id] }), expected);
midShow.syncSchedule({ minute: 722, events: [event] });
assert.equal(midShow.onStart(event), false, "Processed start cannot board a second audience after restore");
assert.equal(midShow.getSnapshot().actors.length, expected);
assert.equal(midShow.getSnapshot().queued.length, 0, "A complete restored audience leaves no pending arrival job");
midShow.dispose(); waste.dispose(); doors.dispose(); world.dispose(); materials.dispose();
console.log("Customer flow v25 valid: all14 automatic doors hold for traffic then close, lazy sliced startup paths, empty opening-day restore, early/middle/trailer parties, bounded smooth turning, partial pre-show and mid-show restoration without duplicate arrivals.");
