import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherSupplies } from "../src/usher-supplies.js";
import { createSuppliesState, restoreSuppliesState, serializeSuppliesState, stepSuppliesState, SUPPLY_SAVE_KEY } from "../src/usher-supplies-state.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AABBCollisionWorld } from "../src/player.js";
import { planToWorldX } from "../src/coordinates.js";

const state = createSuppliesState();
const before = JSON.stringify(state);
stepSuppliesState(state, 60, { active: false });
assert.equal(JSON.stringify(state), before, "Paused supplies neither consume nor complete work");
for (let i = 0; i < 600; i++) stepSuppliesState(state, .1, { active: true, timeScale: 5 });
assert.ok(Math.abs(state.elapsed - 300) < 1e-6, "Five-minute shift time requires one active real minute");
assert.ok(state.bibs[1].level < .16 && state.stock[1].level < .17, "Customers gradually consume connected syrup and dispenser stock");
assert.equal(state.bibs[0].level, 0, "Consumption cannot make a depleted gauge negative");
assert.equal(restoreSuppliesState(serializeSuppliesState(state)).elapsed, state.elapsed);
for (const raw of ["{bad", "null", "{}", JSON.stringify({ ...state, nextId: Infinity }),
  JSON.stringify({ ...state, stock: [{ level: 8 }] }), JSON.stringify({ ...state, bibs: null }),
  JSON.stringify({ ...state, dirtyTrays: 99 })]) assert.equal(restoreSuppliesState(raw).elapsed, 0, "Malformed saves safely start fresh");

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: text => ({ width: String(text).length * 12 }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  }, { get: (o, k) => o[k] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene(), materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds }); collisionWorld.addBoxes(world.colliders);
const camera = new THREE.PerspectiveCamera(70, 1.5, .05, 200), hands = { owner: null }, toasts = [];
const stored = new Map(), storage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
const game = createUsherSupplies({ scene, world, camera, collisionWorld, storage, hands, showToast: text => toasts.push(text) });
scene.updateMatrixWorld(true);
const anchors = Object.fromEntries(game.getSnapshot().anchors.map(a => [a.id, a]));
function aim(id, { action = false, dt = 1 / 60, position } = {}) {
  const a = anchors[id]; assert.ok(a, `Missing physical anchor ${id}`);
  camera.position.fromArray(position ?? a.stand); if (!position) camera.position.y += 1.68;
  camera.lookAt(...a.position); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  game.update(dt, { active: true, action }); return game.getSnapshot();
}
function contact(id) {
  const snapshot = aim(id); assert.equal(snapshot.focus, id, `${id} is aimable and reachable from its clear work stance`);
  assert.equal(game.interact(), true); return game.getSnapshot();
}
function hold(id, seconds) { for (let frame = 0; frame < seconds * 60; frame++) aim(id, { action: true }); }
for (const a of Object.values(anchors)) {
  assert.equal(collisionWorld.isOverlapping({ x: a.stand[0], z: a.stand[2], y: 0 }, .28, 0, 1.8), false, `${a.id} has capsule-sized work space`);
  const ray = new THREE.Raycaster(new THREE.Vector3(a.stand[0], .15, a.stand[2]), new THREE.Vector3(0, -1, 0), .001, .25);
  assert.ok(ray.intersectObject(world.root, true).length, `${a.id} stance rests on rendered floor`);
  aim(a.id); assert.equal(game.getSnapshot().focus, a.id, `${a.id} physical target reachable`);
}

// Walk from the unchanged courtyard doorway to every interior work stance.
// Returning along the center aisle avoids assuming walking through a rack.
function walkWaypoints(points) {
  const feet = { x: planToWorldX(-1.7), y: 0, z: 67.65 };
  for (const [x, z] of points) {
    for (let step = 0; step < 2000 && Math.hypot(feet.x - x, feet.z - z) > .04; step++) {
      const dx = x - feet.x, dz = z - feet.z, length = Math.hypot(dx, dz);
      collisionWorld.moveCircle(feet, dx / length * .025, dz / length * .025, .28, 0, 1.8);
    }
    assert.ok(Math.hypot(feet.x - x, feet.z - z) < .05, `Supplies route blocked at ${x},${z}`);
  }
}
for (const a of Object.values(anchors).filter(a => !a.id.startsWith("dispenser"))) {
  walkWaypoints([[planToWorldX(-1.7), 70], [planToWorldX(.0), 70], [planToWorldX(.0), 72.35], [a.stand[0], a.stand[2]]]);
}
walkWaypoints([[planToWorldX(-1.7), 66.36], ...Object.values(anchors).filter(a => a.id.startsWith("dispenser")).map(a => [a.stand[0], a.stand[2]])]);

hands.owner = "cleaning";
contact("stock:straws"); assert.equal(game.heldTool, null, "A supply cannot displace a different tool owner");
hands.owner = null;
contact("bib:cola:box"); assert.equal(game.heldTool, null, "A connected syrup carton cannot be lifted");
contact("bib:cola:hose"); assert.equal(game.getSnapshot().state.bibs[0].connected, false);
contact("bib:cola:box"); assert.equal(game.heldTool, "bib:cola"); assert.equal(hands.owner, "supplies");
assert.equal(game.getSnapshot().state.bibs[0].installed, false);
contact("recycle"); assert.equal(game.heldTool, null); assert.equal(hands.owner, null);
contact("bib:diet:spare");
contact("bib:cola:box"); assert.equal(game.getSnapshot().state.bibs[0].installed, false, "Wrong flavor cannot bypass the keyed syrup connection");
const cameraBeforeDrop = camera.position.clone();
camera.lookAt(camera.position.x, .05, camera.position.z - 1); camera.updateMatrixWorld(true);
assert.equal(game.returnTool(), true, "Q previews where the wrong-flavor carton will be placed");
assert.equal(game.heldTool, "bib:diet", "Preview retains physical ownership until confirmation");
assert.equal(game.getSnapshot().state.loose.length, 0);
assert.equal(game.getSnapshot().placement.valid, true, JSON.stringify(game.getSnapshot().placement));
assert.equal(game.cancelPlacement(), true); assert.equal(game.heldTool, "bib:diet", "Cancel never loses the held item");
assert.equal(game.beginPlacement(), true); assert.equal(game.confirmPlacement(), true);
const dropped = game.getSnapshot().state.loose[0];
assert.ok(Math.hypot(dropped.position[0] - cameraBeforeDrop.x, dropped.position[2] - cameraBeforeDrop.z) < 1.3, "Q never teleports a carton to its source");
contact("bib:cola:spare"); contact("bib:cola:box");
assert.equal(game.getSnapshot().state.bibs[0].connected, false, "Inserting a box does not silently connect its hose");
contact("bib:cola:hose");
assert.equal(game.getSnapshot().state.bibs[0].connected, true);
assert.ok(game.getSnapshot().state.bibs[0].level > .99);
assert.equal(game.getSnapshot().state.bibs[0].exchanges, 1);
contact("bib:cola:hose"); contact("bib:cola:hose");
assert.equal(game.getSnapshot().state.bibs[0].exchanges, 1, "Repeated disconnect/reconnect does not duplicate an exchange");

contact("stock:salt");
const amount = game.getSnapshot().state.held.amount;
hold("dispenser:lids", .4);
assert.equal(game.getSnapshot().state.held.amount, amount, "Pouring the wrong stock has no effect");
aim("dispenser:salt");
assert.equal(game.getSnapshot().state.held.amount, amount, "Aiming without holding action does not refill");
hold("dispenser:salt", .5);
let filling = game.getSnapshot();
assert.ok(filling.state.stock[3].level > .05 && filling.state.stock[3].level < .12, "Held action progressively fills the dispenser");
assert.ok(filling.state.held.amount > .88 && filling.state.held.amount < .95, "The carton loses exactly the transferred stock");
assert.equal(filling.heldVisible, true, "The pouring carton remains physically visible and clear of the counter");
assert.ok(game.root.getObjectByName("supplies-dispenser-salt-packet-0").visible, "Actual packets appear as the dispenser fills");
const pause = JSON.stringify(filling.state);
game.update(45, { active: false, action: true });
assert.equal(JSON.stringify(game.getSnapshot().state), pause, "Paused carry/refill work and customer consumption freeze");
hold("dispenser:salt", 6);
assert.ok(game.getSnapshot().state.stock[3].level > .99);
assert.ok(game.getSnapshot().state.held.amount <= .001);
contact("recycle"); assert.equal(game.heldTool, null);

contact("tray:dirty");
contact("tray:clean"); assert.equal(game.getSnapshot().state.cleanTrays, 0, "Dirty tray cannot go on the clean stack");
hold("tray:sink", 1);
assert.ok(game.getSnapshot().state.held.dirt > .70 && game.getSnapshot().state.held.dirt < .8, "Washing removes visible soil progressively");
assert.equal(game.getSnapshot().heldVisible, true, "The tray is visible under the faucet rather than hidden inside the bench collider");
assert.equal(game.root.getObjectByName("supplies-wash-water-stream").visible, true);
hold("tray:sink", 3.2); contact("tray:clean");
assert.equal(game.getSnapshot().state.cleanTrays, 1); assert.equal(game.getSnapshot().state.washed, 1);

// Nearby does not mean accessible: the physical back wall blocks interaction.
aim("bib:lemon:spare", { position: [anchors["bib:lemon:spare"].position[0], 1.68, 75.15] });
assert.equal(game.getSnapshot().focus, null, "Stock cannot be grabbed through the room's back wall");
assert.equal(game.interact(), false);

// Saving a carried partial carton places one recoverable copy at its last
// safe local floor position on reload, never resets the shelf and duplicates it.
contact("stock:straws"); hold("dispenser:straws", .7);
const carried = game.getSnapshot().state.held;
game.update(1, { active: true }); game.dispose();
assert.equal(hands.owner, null);
const restored = restoreSuppliesState(stored.get(SUPPLY_SAVE_KEY));
assert.equal(restored.held, null);
assert.equal(restored.loose.filter(item => item.uid === carried.uid).length, 1);
assert.ok(Math.abs(restored.loose.find(item => item.uid === carried.uid).amount - carried.amount) < .0001);
assert.equal(restored.stock[0].reserves.length, 2);
const originalColliderCount = world.colliders.length;
assert.equal(collisionWorld.colliders.length, originalColliderCount, "Disposal removes every supplied fixture and loose-carton collider");
const resumed = createUsherSupplies({ scene, world, camera, collisionWorld, storage, hands });
scene.updateMatrixWorld(true);
const loose = resumed.getSnapshot().state.loose.find(item => item.uid === carried.uid);
assert.ok(loose, "A saved partial carton remains physically recoverable");
camera.position.set(loose.position[0], loose.position[1] + 1.68, loose.position[2] - .8);
camera.lookAt(loose.position[0], loose.position[1] + .27, loose.position[2]); camera.updateMatrixWorld(true);
resumed.update(1 / 60, { active: true });
assert.equal(resumed.getSnapshot().focus, `loose:${carried.uid}`);
assert.equal(resumed.interact(), true); assert.equal(resumed.heldTool, "refill:straws");
assert.equal(resumed.getSnapshot().state.loose.some(item => item.uid === carried.uid), false);
const block = collisionWorld.addBox({ id: "temporary-drop-block", minX: camera.position.x - 2, maxX: camera.position.x + 2,
  minY: 0, maxY: .5, minZ: camera.position.z - 2, maxZ: camera.position.z + 2 });
assert.equal(resumed.returnTool(), true, "Q begins a preview even when the target is invalid");
// A full-height obstruction cannot become a low tabletop support.
block.maxY = 3; resumed.update(1 / 60, { active: true });
assert.equal(resumed.getSnapshot().placement.valid, false);
assert.equal(resumed.confirmPlacement(), false, "Confirmation rejects obstructed placement without losing the supply");
assert.equal(resumed.getSnapshot().heldVisible, true, "A held item remains visible under wall contact");
resumed.cancelPlacement();
assert.equal(resumed.heldTool, "refill:straws"); collisionWorld.remove(block);
resumed.dispose();
const unavailableStorage = createUsherSupplies({ scene, world, camera, collisionWorld,
  storage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } });
unavailableStorage.update(.1, { active: true }); unavailableStorage.dispose();
world.dispose(); materials.dispose();
console.log("Supplies valid: reachable BIB disconnect/lift/exchange/connect, flavor safety, four physical refill stocks, held progressive transfer, local Q placement/recovery, shared hands, tray washing, 5x active consumption, pause/save validation, fixture routes and disposal.");
