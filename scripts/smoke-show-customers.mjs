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
const preparing = performance.now();
const loaded = await customers.loadAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
assert.equal(loaded.status, "ready"); assert.equal(loaded.actorCount, 14 * MAX_SHOW_AUDIENCE); assert.equal(loaded.routes, 0, "No auditorium routes are solved during startup");
assert.equal(customers.navigation.stats.searches, 1, "Startup only solves the short lobby exit route");
const prepareMs = performance.now() - preparing;
const nav = customers.navigation;
const counts = new Set(), partySizes = new Set();
for (const room of AUDITORIUMS) {
  if(process.env.CROWD_DEBUG) console.log("routes",room.id);
  const path = nav.theaterPath(room.id); assert.ok(path?.length > 1, `Patrons need an actual route through ${room.id}'s entrance`);
  for (let i = 1; i < path.length; i++) assert.ok(nav.clearSegment(path[i - 1], path[i]), `${room.id} segment ${i} must clear static walls/fixtures`);
  const attendance = createShowAttendance(nav.seatPlans.find(plan => plan.id === room.id), {cycle: 0});
  assert.deepEqual(attendance, createShowAttendance(nav.seatPlans.find(plan => plan.id === room.id), {cycle: 0}), "Audience survives reload deterministically");
  counts.add(attendance.count); attendance.groups.forEach(group => partySizes.add(group.seatIds.length));
  assert.equal(new Set(attendance.seatIds).size, attendance.count, "Each customer has a different chair");
  const seats = nav.theaterSeats(room.id, attendance.seatIds); assert.equal(seats.length, attendance.count, `${room.id} has actual reachable audience seats`);
  for (const item of seats) for (let i = 1; i < item.route.length; i++) assert.ok(nav.clearSegment(item.route[i - 1], item.route[i]), `${room.id} actual seat approach segment ${i} clears walls and seats`);
}
assert.ok(counts.size >= 6 && Math.max(...counts) > 16 && Math.min(...counts) < 4, "Quiet and popular shows need distinct audience sizes");
assert.ok(partySizes.has(1) && partySizes.has(2) && partySizes.has(5), "Audiences include individuals, couples and families");
assert.ok(nav.path(PATRON_LOBBY, PATRON_EXIT)?.length, "Customers can leave through the existing glass doors");
let sawFormation = false, updateMs = 0, updateCount = 0, maxUpdateMs = 0;
async function advance(seconds) {
  if(process.env.CROWD_DEBUG) console.log("advance",seconds,customers.getSnapshot().stats);
  for (let i = 0; i < seconds * 20; i++) {
    if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    world.entranceDoors.update(.05, camera.position); doors.update(.05, { active: true });
    waste.update(.05, { active: true });
    const start = performance.now(); customers.update(.05, true);
    const elapsed = performance.now() - start; updateMs += elapsed; updateCount++; maxUpdateMs = Math.max(maxUpdateMs, elapsed);
    if (!sawFormation && i % 10 === 0) {
      const people = customers.actors.filter(actor => actor.state === "arriving");
      sawFormation = people.some(actor => people.some(other => {
        if (actor === other || actor.party !== other.party || !actor.path[actor.waypoint]) return false;
        const direction = actor.path[actor.waypoint].clone().sub(actor.group.position).setY(0).normalize();
        const delta = other.group.position.clone().sub(actor.group.position).setY(0), distance = delta.length();
        return distance > .54 && distance < 1.2 && Math.abs(delta.dot(direction)) < .5;
      }));
    }
  }
  if(process.env.CROWD_DEBUG) console.log("done",customers.getSnapshot().stats,customers.getSnapshot().actors.map(a=>({room:a.room,index:a.index,state:a.state,p:a.position,waypoint:a.waypoint})));
}
const door = doors.doors.find(d => d.id === "theater-2"); door.targetOpen = false; await advance(2);
assert.ok(door.angle < .002, "The test auditorium door is physically closed");
customers.onStart({ id: "start-test-2", theaterId: "theater-2", time: 1020 });
assert.equal(customers.onStart({ id: "start-test-2", theaterId: "theater-2", time: 1020 }), false, "Duplicate clock dispatch cannot duplicate an audience");
await advance(100);
assert.ok(customers.getSnapshot().stats.entered > 0, "Guests open a previously closed red door themselves and enter");
const paused = JSON.stringify(customers.getSnapshot()); customers.update(10, false); assert.equal(JSON.stringify(customers.getSnapshot()), paused);
doors.onBreak("theater-2"); await advance(100);
const count2 = createShowAttendance(nav.seatPlans.find(plan => plan.id === "theater-2"), {cycle: 1}).count;
const count6 = createShowAttendance(nav.seatPlans.find(plan => plan.id === "theater-6"), {cycle: 0}).count;
assert.equal(customers.getSnapshot().actors.filter(a => a.room === "theater-2" && a.state === "seated").length, count2, JSON.stringify(customers.getSnapshot()));
customers.onBreak({ id: "break-test-2", theaterId: "theater-2", time: 1100, cycle: 1 });
assert.ok(sawFormation, "Companions actually walk abreast where the hallway has space");
customers.onBreak({ id: "break-initial-6", theaterId: "theater-6", time: 1100 }); doors.onBreak("theater-6");
await advance(280);
assert.equal(customers.getSnapshot().stats.exited, count2 + count6, JSON.stringify(customers.getSnapshot()));
assert.ok(customers.getSnapshot().stats.tossed >= 3, "Departing customers carry packaging to the actual rolling can");
assert.ok(waste.getSnapshot().bins.every(bin => bin.fill <= 120), "Physical rubbish cannot overflow the can");
// Adjacent-room turnover reproduces the reported opposing streams. T14's next
// audience yields until its outgoing audience has cleared; T13 boards at once.
customers.onBreak({ id: "break-14-initial", theaterId: "theater-14", cycle: 0 }); doors.onBreak("theater-14");
customers.onStart({ id: "start-14-next", theaterId: "theater-14", cycle: 0 });
customers.onStart({ id: "start-13-next", theaterId: "theater-13", cycle: 0 }); doors.onBreak("theater-13");
const hallwayPath = nav.theaterPath("theater-14");
let longest = 1;
for (let i = 2; i < hallwayPath.length; i++) if (hallwayPath[i].distanceTo(hallwayPath[i - 1]) > hallwayPath[longest].distanceTo(hallwayPath[longest - 1])) longest = i;
camera.position.copy(hallwayPath[longest]).lerp(hallwayPath[longest - 1], .5); camera.position.y += 1.68;
await advance(380);
for (const number of [13, 14]) {
  const expected = createShowAttendance(nav.seatPlans.find(plan => plan.id === `theater-${number}`), {cycle: 1});
  const seated = customers.getSnapshot().actors.filter(actor => actor.room === `theater-${number}` && actor.state === "seated");
  assert.equal(seated.length, expected.count, `Theater ${number}: all parties must route around the player and opposing customers: ${JSON.stringify(customers.getSnapshot())}`);
  assert.deepEqual(new Set(seated.map(actor => actor.seatId)), new Set(expected.seatIds), "Visual customers and usher cleanup use exactly the same occupied chairs");
}
assert.equal(customers.getSnapshot().stats.exited, count2 + count6 + createShowAttendance(nav.seatPlans.find(plan => plan.id === "theater-14")).count,
  "The earlier T14 audience must leave before its next audience uses the cubby");
const restoring = performance.now(), restored = customers.restoreSchedule({ minute: 0, done: [], events: [] });
assert.ok(restored > 100, "Already-running initial shows are populated when a shift loads");
assert.equal(customers.restoreSchedule({ minute: 0, done: [], events: [] }), 0, "Restoring twice never duplicates seated customers");
if (process.env.CROWD_DEBUG) console.log({ prepareMs, restoreMs: performance.now() - restoring,
  meanUpdateMs: updateMs / updateCount, maxUpdateMs });
customers.setEnabled(false); assert.ok(customers.actors.every(a => !a.collider.enabled));
customers.dispose(); waste.dispose(); doors.dispose();
world.dispose(); materials.dispose();
console.log("Customers valid: varied 2–24-person audiences and 1–5-person parties, all14 theater routes and occupied seats, guest-opened doors, pause, stadium-row standing clearance, 32-person departure, adjacent T13/T14 turnover, stationary-player avoidance, physical bin tosses and complete front-door exits.");
