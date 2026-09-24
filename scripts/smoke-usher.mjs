import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherState, stepUsherState, usherSummary, beginUsherPour, restoreUsherState, serializeUsherState } from "../src/usher-state.js";
import { createUsherGameplay, USHER_SPAWN, USHER_TRASH } from "../src/usher-gameplay.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AABBCollisionWorld } from "../src/player.js";

// Verify contact semantics separately from the rendered world.
const state = createUsherState(); state.started = true; state.heldTool = "broom";
const original = serializeUsherState(state);
for (let i = 0; i < 240; i++) stepUsherState(state, 1 / 120, { brush: { from: { x: 24.95, z: 52.18 }, to: { x: 24.95, z: 52.18 }, right: { x: 1, z: 0 } } });
assert.equal(serializeUsherState(state), original, "A stationary broom cannot click-clean popcorn");
function sweepPatch(s, x, seconds = 4, canMove) {
  let previous = null;
  for (let i = 0; i < seconds * 120; i++) {
    const phase = (i / 120) % 1.1;
    const head = { x, z: 52.18 - .24 + phase / .72 * .61 };
    stepUsherState(s, 1 / 120, { canMove,
      pan: { x, z: 52.62, forward: { x: 0, z: 1 }, right: { x: 1, z: 0 } },
      brush: phase < .72 && previous ? { from: previous, to: head, right: { x: 1, z: 0 } } : null });
    previous = phase < .72 ? head : null;
  }
}
const blocked = createUsherState(); blocked.started = true; blocked.heldTool = "broom";
sweepPatch(blocked, 24.95, 4, () => false);
assert.equal(usherSummary(blocked).floor, 30, "Bristles cannot reach kernels through an obstruction");
sweepPatch(state, 24.95); sweepPatch(state, 27.1);
assert.equal(usherSummary(state).pan, 30, "Moving bristles push all kernels into a facing pan");
assert.equal(usherSummary(state).trash, 0, "Collected kernels remain in the pan until emptied");
assert.equal(beginUsherPour(state), true);
stepUsherState(state, 1 / 120);
assert.equal(usherSummary(state).pan, 30, "Pouring is animated rather than an instant deletion");
for (let i = 0; i < 120; i++) stepUsherState(state, 1 / 120);
assert.equal(usherSummary(state).trash, 30);
state.heldTool = "cloth";
const spillBefore = JSON.stringify(state.spills);
for (let i = 0; i < 120; i++) stepUsherState(state, 1 / 120, { cloth: { from: { x: 23.75, z: 52.04 }, to: { x: 23.75, z: 52.04 } } });
assert.equal(JSON.stringify(state.spills), spillBefore, "Holding still cannot wipe a spill");
for (const spill of state.spills) for (let pass = 0; pass < 6; pass++) for (let row = -3; row <= 3; row++) {
  let last = { x: spill.x - .4, z: spill.z + row * .1 };
  for (let i = 1; i <= 80; i++) {
    const next = { x: spill.x - .4 + i * .01, z: last.z };
    stepUsherState(state, 1 / 120, { cloth: { from: last, to: next } }); last = next;
  }
}
assert.equal(usherSummary(state).complete, true, "Both physical cleanups and disposal are required for completion");
assert.equal(restoreUsherState(serializeUsherState(state)).completed, true, "Completed shift survives a reload");
assert.equal(restoreUsherState('{"version":1,"particles":[]}').started, false, "Malformed storage resets safely");

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: text => ({ width: String(text).length * 12 }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  }, { get: (o, k) => o[k] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene();
const world = createTheaterWorld({ scene, materials: createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } }) });
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds }); collisionWorld.addBoxes(world.colliders);
const camera = new THREE.PerspectiveCamera(70, 1.5, .05, 200);
const toasts = [];
const storage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
const game = createUsherGameplay({ scene, world, camera, collisionWorld, storage, showToast: t => toasts.push(t) });
scene.updateMatrixWorld(true);
function aim(position, target, action = false, delta = 1 / 60) {
  camera.position.set(...position); camera.lookAt(...target); camera.updateMatrixWorld(true); game.update(delta, { active: true, action });
}
const spawn = [...USHER_SPAWN.position]; spawn[1] += 1.68;
aim(spawn, game.getSnapshot().anchors.cart);
assert.equal(game.getSnapshot().focus, "paper", "Schedule is in reach from the initial spawn");
assert.equal(game.interact(), true);
assert.equal(game.getSnapshot().state.started, true);
aim([23.6, 1.68, 53.25], game.getSnapshot().anchors.broom);
assert.equal(game.getSnapshot().focus, "broom", "Broom is physically reachable beside the clipboard");
game.interact(); assert.equal(game.heldTool, "broom");
// A center ray missed the offset tray at these two real standing poses.
// Full tool bounds must retract it before either corner penetrates a wall.
for (const [position, target] of [
  [[20.6, 1.68, 52.0], [20.6, 1.68, 53.0]],
  [[20.6, 1.68, 51.6], [19.893, 1.68, 50.893]],
]) {
  aim(position, target);
  assert.equal(game.root.getObjectByName("usher-pan-held").visible, false, "Offset carried pan must retract at a wall corner");
}
aim([23.0, 1.68, 51.4], [23.0, 0, 52.2]);
assert.ok(game.getSnapshot().floorAim, "Floor-use test has an unobstructed center ray");
assert.equal(game.root.getObjectByName("usher-pan-held").visible, false, "Working tray width cannot penetrate the cubby corner even when its center is clear");
for (const id of ["usher-broom-held", "usher-pan-held", "usher-cloth-held", "usher-broom-stored", "usher-pan-stored", "usher-cloth-stored", "usher-popcorn-0"]) {
  game.root.getObjectByName(id).traverse(o => {
    if (o.isMesh) assert.equal(o.castShadow, false, "Movable supplies cannot leave ghosts in the static shadow map");
  });
}
const beforeWallSweep = JSON.stringify(game.getSnapshot().state.particles);
for (let i = 0; i < 120; i++) aim([22.22, 1.68, 53.04], [23.75, 0, 52.04], true);
assert.equal(game.getSnapshot().floorAim, null, "Cubby wall blocks the floor tool ray");
assert.equal(JSON.stringify(game.getSnapshot().state.particles), beforeWallSweep, "Cannot sweep through the actual T2 cubby wall");

// Debris lies on rendered, level, seat-free rear-aisle floor. A downward ray
// must meet the actual world surface, not merely agree with layout metadata.
const ray = new THREE.Raycaster();
for (const p of game.getSnapshot().state.particles) {
  ray.set(new THREE.Vector3(p.x, .2, p.z), new THREE.Vector3(0, -1, 0)); ray.far = .4;
  const hits = ray.intersectObject(world.root, true);
  assert.ok(hits.length && Math.abs(hits[0].point.y) < .025, `Popcorn ${p.x},${p.z} rests on rendered aisle floor`);
  assert.ok(!collisionWorld.colliders.some(c => c.enabled && c.minY < 1.68 && c.maxY > .1
    && p.x > c.minX - .28 && p.x < c.maxX + .28 && p.z > c.minZ - .28 && p.z < c.maxZ + .28), "Each popcorn target has room for a standing player");
}
for (const x of [24.95, 27.1]) {
  for (let i = 0; i < 300; i++) aim([x, 1.68, 51.40], [x, 0, 52.18], true);
}
// Moving the broom between clusters can nudge the outside kernels sideways;
// follow the physical remainder instead of granting an abstract area cleanup.
for (let pass = 0; pass < 4 && game.getSnapshot().summary.floor; pass++) {
  const p = game.getSnapshot().state.particles.find(p => p.mode === "floor");
  aim([p.x, 1.68, p.z - .85], [p.x, 0, p.z], false);
  for (let i = 0; i < 240; i++) aim([p.x, 1.68, p.z - .85], [p.x, 0, p.z], true);
}
assert.equal(game.getSnapshot().summary.pan, 30, `Real camera poses sweep both rear-aisle clusters into the rendered pan: ${JSON.stringify(game.getSnapshot().state.particles.filter(p => p.mode === "floor"))}`);
aim([20.6, 1.68, 52.0], [20.6, 1.68, 53.0]);
assert.equal(game.root.getObjectByName("usher-pan-held").visible, false);
for (const [index] of game.getSnapshot().state.particles.entries()) assert.equal(game.root.getObjectByName(`usher-popcorn-${index}`).visible, false, "Retracted pan cannot leave floating kernels");
const paused = JSON.stringify(game.getSnapshot().state);
game.update(15, { active: false, action: true });
assert.equal(JSON.stringify(game.getSnapshot().state), paused, "Pause neither advances physics nor performs work");
assert.equal(game.returnTool(), false, "Tools cannot teleport to a distant cart");

// Trace a player capsule through the real inner doorway to the existing bin.
const feet = { x: 27.1, y: 0, z: 51.4 };
for (const target of [[26.5, 53.95], [23.4, 54.135], [22, 54.135], [20.9, 54.135]]) {
  for (let i = 0; i < 600 && Math.hypot(feet.x - target[0], feet.z - target[1]) > .03; i++) {
    const dx = target[0] - feet.x, dz = target[1] - feet.z, length = Math.hypot(dx, dz);
    collisionWorld.moveCircle(feet, dx / length * .025, dz / length * .025, .28, 0, 1.8);
  }
  assert.ok(Math.hypot(feet.x - target[0], feet.z - target[1]) < .04, `Bin route is passable at ${target}`);
}
aim([20.9, 1.68, 54.135], [USHER_TRASH.x, USHER_TRASH.y, USHER_TRASH.z]);
assert.equal(game.getSnapshot().focus, "bin", "The existing cubby trash can is reachable");
game.interact(); assert.ok(game.getSnapshot().pouring > 0);
for (let i = 0; i < 70; i++) game.update(1 / 60, { active: true, action: false });
assert.equal(game.getSnapshot().summary.trash, 30);
assert.equal(game.getSnapshot().summary.complete, false, "Sweeping and disposal do not bypass the spills");

aim([24.8, 1.68, 53.25], game.getSnapshot().anchors.cloth);
assert.equal(game.getSnapshot().focus, "cloth"); game.interact(); assert.equal(game.heldTool, "cloth");
const beforeWallWipe = JSON.stringify(game.getSnapshot().state.spills);
for (let i = 0; i < 120; i++) aim([22.22, 1.68, 53.04], [23.75 + Math.sin(i * .1) * .05, 0, 52.04], true);
assert.equal(JSON.stringify(game.getSnapshot().state.spills), beforeWallWipe, "Cannot wipe through the actual T2 cubby wall");
for (const [x, , z] of game.getSnapshot().anchors.spills) for (let pass = 0; pass < 7; pass++) for (let row = -3; row <= 3; row++) {
  for (let step = 0; step <= 80; step++) aim([x, 1.68, z - .82], [x - .4 + step * .01, 0, z + row * .10], true);
}
assert.equal(game.getSnapshot().summary.spills, 2, "Dragging the actual cloth over both patches removes the visible spill cells");
assert.equal(game.getSnapshot().summary.complete, true);
assert.equal(toasts.filter(t => t.includes("Your schedule is checked off")).length, 1, "Completion announces once");
aim([24.3, 1.68, 53.1], game.getSnapshot().anchors.cart);
assert.equal(game.returnTool(), true); assert.equal(game.heldTool, null);
game.interact(); assert.equal(game.getSnapshot().state.shift, 2); assert.equal(game.getSnapshot().summary.floor, 30);
const ownedGeometry = new Set(), ownedMaterial = new Set(); game.root.traverse(o => {
  if (o.geometry) ownedGeometry.add(o.geometry);
  if (o.material) ownedMaterial.add(o.material);
});
let geometryDisposals = 0, materialDisposals = 0;
for (const g of ownedGeometry) g.addEventListener("dispose", () => geometryDisposals++);
for (const m of ownedMaterial) m.addEventListener("dispose", () => materialDisposals++);
game.dispose(); game.dispose();
assert.equal(geometryDisposals, ownedGeometry.size); assert.equal(materialDisposals, ownedMaterial.size);
assert.ok(!collisionWorld.colliders.some(c => c.id === "usher-cart"));
world.dispose();

// Fixed-step contact produces the same result across common frame rates.
function frameRateRun(fps) {
  const testCamera = new THREE.PerspectiveCamera();
  const testWorld = { groundHeight: () => 0 };
  const testGame = createUsherGameplay({ scene: new THREE.Scene(), world: testWorld, camera: testCamera,
    collisionWorld: new AABBCollisionWorld() });
  testCamera.position.set(...spawn); testCamera.lookAt(24.3, 1.48, 54.415);
  testGame.update(1 / 60, { active: true }); testGame.interact();
  testCamera.position.set(23.6, 1.68, 53.25); testCamera.lookAt(23.87, 1.16, 54.56);
  testGame.update(1 / 60, { active: true }); testGame.interact();
  testCamera.position.set(24.95, 1.68, 51.4); testCamera.lookAt(24.95, 0, 52.18);
  for (let i = 0; i < 4 * fps; i++) testGame.update(1 / fps, { active: true, action: true });
  const result = testGame.getSnapshot().state.particles;
  testGame.dispose(); return result;
}
assert.deepEqual(frameRateRun(30), frameRateRun(120), "Physics is invariant at 30 and 120 rendered frames per second");
console.log("Usher smoke passed: contact-only sweep/wipe, 30 collected/disposed kernels, two spills, real floor and bin route, pause/save/repeat/resource lifecycle.");
