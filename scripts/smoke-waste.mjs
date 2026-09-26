import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherWaste, WASTE_CAPACITY, WASTE_GONDOLA, WASTE_STORAGE_KEY, wasteParkingCandidates } from "../src/usher-waste.js";
import { createUsherDoors } from "../src/usher-doors.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";
import { AABBCollisionWorld } from "../src/player.js";
class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: t => ({ width: String(t).length * 12 }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, { get: (o, k) => o[k] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene(), materials = createMaterialLibrary();
const world = createTheaterWorld({ scene, materials });
const collisions = new AABBCollisionWorld({ bounds: world.worldBounds }); collisions.addBoxes(world.colliders);
const camera = new THREE.PerspectiveCamera(67, 1.5, .05, 200), hands = { owner: null };
const storage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
const next = [2, 1, 3, 4, 5].map(n => ({ theaterId: `theater-${n}`, number: n }));
const ready = new Set(), toasts = [];
const doors = createUsherDoors({ scene, camera, collisionWorld: collisions });
const game = createUsherWaste({ scene, world, camera, collisionWorld: collisions, hands, storage,
  showToast: t => toasts.push(t), getNextBreaks: () => next.filter(n => !ready.has(n.theaterId)), getRoomReady: id => ready.has(id) });
function update(seconds, action = false) { for (let i = 0; i < Math.ceil(seconds * 120); i++) game.update(1 / 120, { active: true, action }); }
function aim(position, target) { camera.position.set(...position); camera.lookAt(...target); camera.updateMatrixWorld(true); game.update(1 / 120, { active: true }); }
function bin(index = 0) { return game.getSnapshot().bins[index]; }
function named(name) { return game.root.getObjectByName(name); }
function part(name) { game.root.updateMatrixWorld(true); return named(name).getWorldPosition(new THREE.Vector3()).toArray(); }
assert.equal(game.getSnapshot().bins.length, 3);
assert.deepEqual(game.getSnapshot().bins.map(b => b.room), ["theater-2", "theater-1", "theater-3"]);
assert.equal(game.getBinTargets().length, 3);
for (const b of game.getSnapshot().bins) {
  const c = collisions.colliders.find(c => c.id === b.id); c.enabled = false;
  assert.equal(collisions.isOverlapping({ x: b.x, y: 0, z: b.z }, .46, 0, 1.12), false, `${b.id} parks clear of walls, doors and other bins`); c.enabled = true;
  assert.ok(wasteParkingCandidates(b.room).some(p => Math.hypot(p.x - b.x, p.z - b.z) < .01));
}

// Real capsule can pass each T1/T2 doorway with the cans parked beside it.
for (const x of [21.186, 17.986]) {
  const p = { x, y: 0, z: 56.9 };
  for (let i = 0; i < 95; i++) collisions.moveCircle(p, 0, -.025, .28, 0, 1.8);
  assert.ok(p.z < 54.7, `Parked bins must leave auditorium entrance open at x=${x}`);
}

// Mutual hand ownership, continuous pushing, momentum, caster motion, pause.
let b = bin(); const handle = part(`${b.id}-push-handle`);
aim([b.x, 1.68, b.z + 1.25], handle);
assert.equal(game.getSnapshot().focus, "handle");
hands.owner = "cleaning"; assert.equal(game.interact(), false); hands.owner = null;
game.interact(); assert.equal(hands.owner, "waste"); assert.equal(game.heldTool, "rolling bin");
const beforePush = bin(), wheelStart = named(`${b.id}-caster-tire`).rotation.x;
for (let i = 0; i < 150; i++) {
  camera.position.z += .006;
  camera.lookAt(bin().x, 1.14, bin().z); camera.updateMatrixWorld(true); game.update(1 / 120, { active: true });
}
assert.ok(bin().z > beforePush.z + .45, "A gripped can follows a physical walking/pulling force");
assert.notEqual(named(`${b.id}-caster-tire`).rotation.x, wheelStart, "Casters rotate with actual displacement");
const paused = JSON.stringify(game.getSnapshot()); game.update(5, { active: false, action: true });
const afterPaused = game.getSnapshot();
assert.equal(afterPaused.bins[0].x, JSON.parse(paused).bins[0].x); assert.equal(afterPaused.bins[0].z, JSON.parse(paused).bins[0].z);
game.update(1 / 120, { active: true }); assert.equal(game.returnTool(), true);
const releaseZ = bin().z; update(.1); assert.ok(bin().z >= releaseZ, "Released can retains short rolling momentum"); update(1);
assert.ok(Math.hypot(bin().vx, bin().vz) < .02, "Caster resistance brings released can to rest");
const moved = bin();
const passBy = game.getPassingDisposalTarget(new THREE.Vector3(moved.x, 1.3, moved.z + 1.2));
assert.equal(passBy?.binId, moved.id, "Passing guests use the can's new physical location after pushing");
assert.deepEqual(passBy.position, [moved.x, 1.12, moved.z], "The disposal target follows the actual rolling can");

// Overflow is rejected; full liner is removed as a real object, never erased.
b = bin(); assert.equal(game.depositTrash(b.id, 1000), WASTE_CAPACITY - b.fill);
assert.equal(game.depositTrash(b.id, 1), 0);
assert.equal(game.depositTrash("missing", 4), 0);
aim([b.x, 1.68, b.z + 1.4], [b.x, 1.02, b.z]);
assert.equal(game.getSnapshot().focus, "mouth"); game.interact();
assert.equal(game.heldTool, "untied trash bag"); assert.equal(bin().lined, false);
assert.equal(game.depositTrash(b.id, 5), 0, "An unlined can refuses new waste");
assert.equal(game.getSnapshot().bags[0].units, WASTE_CAPACITY);
update(1.7); update(.03, false); update(1.2, true);
assert.equal(game.heldTool, "tied trash bag", `Physical tie completes: ${JSON.stringify(game.getSnapshot().bags)} ${toasts}`);
assert.equal(game.getSnapshot().depositedBags, 0);

// A thin wall can have a clear endpoint beyond it. Carrying must retract on
// the player's side, stay held during contact, and follow full walking speed.
const carryOrigin = camera.position.clone();
const contactWall = collisions.addBox({ id: "test-carried-bag-wall", minX: carryOrigin.x - 1, maxX: carryOrigin.x + 1,
  minZ: carryOrigin.z - .43, maxZ: carryOrigin.z - .39, minY: 0, maxY: 3 });
camera.lookAt(carryOrigin.x, carryOrigin.y, carryOrigin.z - 1); camera.updateMatrixWorld(true);
update(1);
assert.equal(game.heldTool, "tied trash bag", "Wall contact never drops a held bag");
let heldBounds = new THREE.Box3().setFromObject(named(game.getSnapshot().bags[0].id));
assert.ok(heldBounds.min.z >= contactWall.maxZ, "The held bag retracts to the player's side of a thin wall");
for (let i = 1; i <= 100; i++) {
  camera.position.copy(carryOrigin).add(new THREE.Vector3(i * .05, 0, 0));
  camera.lookAt(camera.position.x + 1, camera.position.y, camera.position.z); camera.updateMatrixWorld(true);
  game.update(1 / 120, { active: true });
  const bag = game.getSnapshot().bags[0];
  assert.equal(game.heldTool, "tied trash bag", "Walking faster than the old bag spring cannot release the grip");
  assert.ok(Math.hypot(camera.position.x - bag.x, camera.position.z - bag.z) < 1,
    "Carried bag follows the player's hand instead of lagging meters behind");
}
camera.position.copy(carryOrigin); camera.lookAt(carryOrigin.x, carryOrigin.y, carryOrigin.z - 1); camera.updateMatrixWorld(true);
collisions.remove(contactWall); update(.2);

// Carry through the existing trash-room door using actual capsule collision.
let feet = { x: camera.position.x, y: 0, z: camera.position.z };
const carryTo = (x, z) => {
  for (let i = 0; i < 1000 && Math.hypot(feet.x - x, feet.z - z) > .025; i++) {
    const dx = x - feet.x, dz = z - feet.z, distance = Math.hypot(dx, dz);
    const travel = Math.min(distance, 5.46 / 120);
    collisions.moveCircle(feet, dx / distance * travel, dz / distance * travel, .28, 0, 1.8);
    camera.position.set(feet.x, 1.68, feet.z); camera.lookAt(feet.x + dx / distance, 1.68, feet.z + dz / distance); camera.updateMatrixWorld(true);
    game.update(1 / 120, { active: true });
  }
  assert.ok(Math.hypot(feet.x - x, feet.z - z) < .05, `Trash-room carrying route blocked at ${x},${z}`);
  assert.equal(game.heldTool, "tied trash bag", `Bag must pass the same doorway: ${toasts.at(-1)}`);
};
carryTo(17.77, 58.8); carryTo(17.77, 60.4); carryTo(20.45, 60.4);
camera.lookAt(WASTE_GONDOLA.x, 1.85, WASTE_GONDOLA.z); camera.updateMatrixWorld(true);
update(.3, false); update(.43, true);
game.update(1 / 120, { active: true, action: false, cancelAction: true }); update(.03, false);
assert.equal(game.heldTool, "tied trash bag", "Opening the sheet or switching input must cancel a charged throw");
assert.equal(game.getSnapshot().bags[0].phase, "held");
update(.7, false); update(.43, true); update(.02, false);
assert.equal(hands.owner, null, "Throw releases the player's hands");
assert.equal(game.getSnapshot().bags[0].phase, "falling");
const yBefore = game.getSnapshot().bags[0].y;
update(.08); assert.ok(game.getSnapshot().bags[0].y > yBefore, "Thrown bag begins a gravity-driven arc");
update(2.3);
assert.equal(game.getSnapshot().depositedBags, 1, `Tied bag must physically land in gondola: ${JSON.stringify(game.getSnapshot().bags)}`);

// Spare is taken from the can, shaken open, then fitted only at its empty rim.
b = bin();
aim([b.x, 1.68, b.z + 1.3], part(`${b.id}-stored-spare-liners`));
assert.equal(game.getSnapshot().focus, "spare"); game.interact(); assert.equal(game.heldTool, "fresh liner");
const sparesAfterTake = bin().spares;
camera.lookAt(b.x + 1.0, 0, b.z + 1.2); camera.updateMatrixWorld(true);
assert.equal(game.beginPlacement(), true); assert.equal(game.heldTool, "fresh liner");
assert.equal(game.cancelPlacement(), true); assert.equal(bin().spares, sparesAfterTake, "Cancelling a placement never consumes another liner");
game.beginPlacement();
assert.equal(game.getSnapshot().placement.valid, true, JSON.stringify(game.getSnapshot().placement));
assert.equal(game.confirmPlacement(), true); assert.equal(game.heldTool, null);
const placedLiner = game.getSnapshot().looseLiners[0]; assert.ok(placedLiner);
aim([b.x, 1.68, b.z + 1.3], [placedLiner.position[0], placedLiner.position[1] + .04, placedLiner.position[2]]);
assert.equal(game.getSnapshot().focus, "loose-liner"); game.interact();
assert.equal(game.heldTool, "fresh liner"); assert.equal(game.getSnapshot().looseLiners.length, 0);
assert.equal(bin().spares, sparesAfterTake, "Picking up a placed liner does not take stock again");
aim([b.x, 1.68, b.z + 1.3], [b.x, 1.02, b.z]); game.interact(); assert.equal(bin().lined, false, "A folded bag cannot instantly line a bin");
update(.02, false); update(.9, true); update(.02, false); game.interact(); update(.85);
assert.equal(bin().lined, true); assert.equal(bin().fill, 0); assert.equal(bin().spares, sparesAfterTake); assert.equal(game.heldTool, null);

// Customers use modeled, time-based tosses; reserved space prevents overflow.
game.onTheaterBreak("theater-1"); update(.05);
assert.ok(game.getSnapshot().customer); const target = game.getSnapshot().customer.binId;
const loadBeforeLanding = game.getSnapshot().bins.find(b => b.id === target).fill;
assert.equal(named("guest-waste-disposal").visible, true); assert.equal(named("guest-tossed-litter").visible, true);
update(.6); assert.equal(game.getSnapshot().bins.find(b => b.id === target).fill, loadBeforeLanding, "No fullness increase before visible litter arrives");
const customerPause = game.getSnapshot().customer.progress; game.update(3, { active: false }); assert.equal(game.getSnapshot().customer.progress, customerPause);
update(1.2); assert.ok(game.getSnapshot().bins.find(b => b.id === target).fill > loadBeforeLanding);
game.enableScheduledCustomers();
assert.equal(game.getSnapshot().customer, null); assert.equal(named("guest-waste-disposal").visible, false);
const disposal = game.getCustomerDisposalTarget([bin(1).x, 0, bin(1).z], "theater-1"); assert.ok(disposal);
const patronHand = new THREE.Vector3(...disposal.stand).setY(1.3);
const guestFill = game.getSnapshot().bins.find(item => item.id === disposal.binId).fill;
assert.equal(game.throwCustomerTrash({ binId: disposal.binId, from: patronHand, units: 7 }), true);
assert.equal(named("guest-waste-disposal").visible, false, "Scheduled patrons supply their own character rather than spawning a dummy");
update(.4); assert.equal(game.getSnapshot().bins.find(item => item.id === disposal.binId).fill, guestFill);
update(.6); assert.equal(game.getSnapshot().bins.find(item => item.id === disposal.binId).fill, guestFill + 7);
ready.add("theater-2"); assert.equal(bin().recommendation, "theater-4", "Leapfrog recommendation excludes rooms assigned to the other two cans");

// Push the actual can across the main hall and through the existing trash-room
// doorway. The operator also uses the same capsule solver as ordinary walking.
let operator = { x: bin().x + 1.25, y: 0, z: bin().z };
const walkOperator = (x, z, direction = null) => {
  for (let i = 0; i < 1800 && Math.hypot(operator.x - x, operator.z - z) > .018; i++) {
    const dx = x - operator.x, dz = z - operator.z, length = Math.hypot(dx, dz);
    collisions.moveCircle(operator, dx / length * .008, dz / length * .008, .28, 0, 1.8);
    camera.position.set(operator.x, 1.68, operator.z);
    camera.lookAt(operator.x + (direction?.[0] ?? dx / length), 1.68, operator.z + (direction?.[1] ?? dz / length));
    camera.updateMatrixWorld(true); game.update(1 / 120, { active: true });
  }
  assert.ok(Math.hypot(operator.x - x, operator.z - z) < .035, `Pushing operator cannot reach ${x},${z}`);
};
aim([operator.x, 1.68, operator.z], part(`${bin().id}-push-handle`));
game.interact(); assert.equal(game.heldTool, "rolling bin");
walkOperator(18.8, operator.z, [-1, 0]); update(.8); game.returnTool(); update(.5);
assert.ok(Math.abs(bin().x - 17.77) < .15, "Can is physically steered across the hallway");
walkOperator(operator.x, bin().z - 1.18); walkOperator(bin().x, operator.z);
aim([operator.x, 1.68, operator.z], part(`${bin().id}-push-handle`)); game.interact();
assert.equal(game.heldTool, "rolling bin");
walkOperator(operator.x, 59.64, [0, 1]); update(.8); game.returnTool(); update(.5);
assert.ok(bin().z > 60.3 && bin().z < 60.98, "Rolling can passes the trash-room doorway and stops before the stock shelf");
assert.ok(Math.hypot(bin().x - WASTE_GONDOLA.x, bin().z - WASTE_GONDOLA.z) > 3, "Can leaves access to the gondola open");

// Restore keeps physical positions and contents but never restores stale hands.
const final = game.getSnapshot(); game.dispose(); assert.equal(hands.owner, null);
assert.ok(storage.value); const persisted = JSON.parse(storage.value); assert.equal(persisted.bins.length, 3);
assert.equal(collisions.colliders.some(c => c.id.startsWith("rolling-bin") || c.id === "waste-gondola"), false);
const restored = createUsherWaste({ scene, world, camera, collisionWorld: collisions, hands, storage, getNextBreaks: () => next });
assert.equal(restored.getSnapshot().depositedBags, 1); assert.equal(restored.heldTool, null);
assert.equal(restored.getSnapshot().bins[0].x, final.bins[0].x); assert.equal(restored.getSnapshot().bins[0].z, final.bins[0].z);
restored.dispose(); doors.dispose(); world.dispose(); materials.dispose();
console.log("Waste smoke passed: three parked cans, doorway clearance, shared hands, continuous caster physics, momentum/pause, fullness/overflow, lift/tie/carry/ballistic gondola disposal, spare-liner cycle, visible guest toss, leapfrog recommendation and persistence.");
