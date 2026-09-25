import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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
assert.equal(loaded.status, "ready"); assert.equal(loaded.actorCount, 56); assert.equal(loaded.routes, 14);
const nav = customers.navigation;
for (const room of AUDITORIUMS) {
  const path = nav.theaterPath(room.id); assert.ok(path?.length > 1, `Patrons need an actual route through ${room.id}'s entrance`);
  for (let i = 1; i < path.length; i++) assert.ok(nav.clearSegment(path[i - 1], path[i]), `${room.id} segment ${i} must clear static walls/fixtures`);
  const seats = nav.theaterSeats(room.id); assert.equal(seats.length, 4, `${room.id} has four real reachable ground-row seats`);
  for (const item of seats) for (let i = 1; i < item.route.length; i++) assert.ok(nav.clearSegment(item.route[i - 1], item.route[i]), `${room.id} actual seat approach segment ${i} clears walls and seats`);
}
assert.ok(nav.path(PATRON_LOBBY, PATRON_EXIT)?.length, "Customers can leave through the existing glass doors");
function advance(seconds) {
  for (let i = 0; i < seconds * 20; i++) {
    world.entranceDoors.update(.05, camera.position); doors.update(.05, { active: true });
    waste.update(.05, { active: true }); customers.update(.05, true);
  }
}
const door = doors.doors.find(d => d.id === "theater-2"); door.targetOpen = false; advance(2);
assert.ok(door.angle < .002, "The test auditorium door is physically closed");
customers.onStart({ id: "start-test-2", theaterId: "theater-2", time: 1020 });
assert.equal(customers.onStart({ id: "start-test-2", theaterId: "theater-2", time: 1020 }), false, "Duplicate clock dispatch cannot duplicate an audience");
advance(100);
assert.equal(customers.getSnapshot().stats.entered, 0, "Customers cannot pass through the closed red door");
assert.ok(customers.getSnapshot().actors.some(a => a.waiting), "Customers visibly wait at blocked doors");
const paused = JSON.stringify(customers.getSnapshot()); customers.update(10, false); assert.equal(JSON.stringify(customers.getSnapshot()), paused);
doors.onBreak("theater-2"); advance(50);
assert.equal(customers.getSnapshot().actors.filter(a => a.room === "theater-2" && a.state === "seated").length, 4, JSON.stringify(customers.getSnapshot()));
customers.onBreak({ id: "break-test-2", theaterId: "theater-2", time: 1100 });
customers.onBreak({ id: "break-initial-6", theaterId: "theater-6", time: 1100 }); doors.onBreak("theater-6");
advance(190);
assert.equal(customers.getSnapshot().stats.exited, 8, JSON.stringify(customers.getSnapshot()));
assert.ok(customers.getSnapshot().stats.tossed >= 3, "Departing customers carry packaging to the actual rolling can");
assert.equal(waste.getSnapshot().bins[0].fill, 120, "Physical rubbish fills and caps the can; it cannot overflow");
customers.setEnabled(false); assert.ok(customers.actors.every(a => !a.collider.enabled));
customers.dispose(); waste.dispose(); doors.dispose();
world.dispose(); materials.dispose();
console.log("Customers valid: 56 reachable seats across all14 theaters, shared Blender models, closed-door waiting, pause, visible seating, initial-show departures, physical bin tosses and complete front-door exits.");
