import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherShift } from "../src/usher-shift.js";
import { USHER_SPAWN } from "../src/usher-gameplay.js";
import { LEGACY_SHIFT_START_MINUTE as SHIFT_START_MINUTE, SHIFT_TIME_SCALE,
  createBreakEvents, createV25BreakEvents, SCHEDULE_STORAGE_KEY } from "../src/usher-schedule.js";
import { AUDITORIUMS } from "../src/layout-data.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";
import { AABBCollisionWorld } from "../src/player.js";
import { createCleaningPlans } from "../src/usher-cleaning-layout.js";
import { createShowAttendance } from "../src/show-attendance.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({ canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      measureText: text => ({ width: String(text).length * 12 }),
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    }, { get: (object, key) => object[key] ?? (() => {}) });
  }
}
globalThis.OffscreenCanvas = CanvasStub;

// Keep the actual world, collision system, schedule and all four physical
// subsystems. Only canvas drawing and browser persistence need test adapters.
const scene = new THREE.Scene();
const world = createTheaterWorld({ scene, materials: createMaterialLibrary() });
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds });
collisionWorld.addBoxes(world.colliders);
const baselineColliders = [...collisionWorld.colliders], baselineChildren = [...scene.children];
const camera = new THREE.PerspectiveCamera(70, 1.5, .05, 200);
camera.position.fromArray(USHER_SPAWN.position); camera.position.y += 1.68;
camera.lookAt(24.3, 1.38, 54.4); camera.updateMatrixWorld(true);
const saved = new Map([["mililani-schedule-v22", JSON.stringify({ version: 1, minute: SHIFT_START_MINUTE,
  seed: 123456, started: false, done: [], clean: [] })]]);
const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
const toasts = [];
const options = { scene, world, camera, collisionWorld, storage, showToast: message => toasts.push(message) };
const shift = createUsherShift(options);
scene.updateMatrixWorld(true);

function frames(seconds, input = { active: true }) {
  for (let left = seconds; left > 1e-9; left -= .1) shift.update(Math.min(left, .1), input);
}
function aim(position, target) {
  camera.position.fromArray(position); camera.lookAt(...target); camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true); shift.update(0, { active: true });
}
function supplyAim(id) {
  const anchor = shift.supplies.getSnapshot().anchors.find(a => a.id === id);
  assert.ok(anchor, `Physical supply target ${id} exists`);
  aim([anchor.stand[0], anchor.stand[1] + 1.68, anchor.stand[2]], anchor.position);
  assert.equal(shift.supplies.getSnapshot().focus, id, `The shared world can reach ${id}`);
}
function physicsSnapshot() {
  const snapshot = shift.getSnapshot();
  const { focus: _focus, ...waste } = snapshot.waste;
  return { minute: snapshot.schedule.minute, started: snapshot.schedule.started,
    done: snapshot.schedule.done, cleaning: snapshot.cleaning.state,
    waste, supplies: snapshot.supplies.state, doors: snapshot.doors };
}
const jobSignature = job => ({ id: job.id, seed: job.seed,
  seats: job.seats.map(s => s.id), particles: job.particles.map(p => p.id) });

const intro = physicsSnapshot();
frames(2, { active: false, action: true });
assert.deepEqual(physicsSnapshot(), intro, "The intro freezes the clock, consumption, dirt, doors and waste physics");
assert.equal(shift.interact(), false); assert.equal(shift.selectTool("broom"), false);
assert.equal(shift.toggleSheet(), false); assert.equal(shift.returnTool(), false);
assert.equal(shift.cleaning.getSnapshot().state.jobs.length, 0, "The first job starts on entering the shift, not during the intro");

shift.update(0, { active: true });
assert.equal(shift.schedule.started, true);
assert.deepEqual(shift.schedule.getSnapshot().done, ["theater-2-0-break"]);
assert.deepEqual(shift.cleaning.getSnapshot().state.jobs.map(j => j.id), ["theater-2"]);
const initialT2 = jobSignature(shift.cleaning.getSnapshot().state.jobs[0]);
frames(1);
assert.deepEqual(jobSignature(shift.cleaning.getSnapshot().state.jobs[0]), initialT2,
  "Updating the shift does not duplicate or rerandomize the first Theater 2 break");
assert.equal(toasts.filter(t => t.startsWith("Theater 2 is breaking.")).length, 1);
assert.equal(shift.waste.getSnapshot().bins.length, 3);
assert.deepEqual(shift.waste.getSnapshot().bins.map(b => b.room), ["theater-2", "theater-1", "theater-3"]);
assert.equal(shift.cleaning.getSnapshot().anchors.bins.length, 3, "Cleaning sees the three live movable waste targets");

// Interactions go through the orchestrator, without assigning hands directly.
aim([24.3, 1.68, 52.8], [24.3, 1.38, 54.4]);
assert.equal(shift.selectTool("broom"), true, "The usher starts with a portable kit");
assert.equal(shift.hands.owner, "cleaning"); assert.equal(shift.heldTool, "broom");
supplyAim("stock:salt");
assert.equal(shift.interact(), false, "A focused stock box cannot steal occupied cleaning hands");
assert.equal(shift.supplies.heldTool, null); assert.equal(shift.hands.owner, "cleaning");
assert.equal(shift.returnTool(), true); assert.equal(shift.hands.owner, null);
supplyAim("stock:salt");
assert.equal(shift.interact(), true); assert.equal(shift.heldTool, "refill:salt");
assert.equal(shift.hands.owner, "supplies");
assert.equal(shift.selectTool("cloth"), false, "Selecting a cleaning tool cannot overwrite a carried supply");
assert.equal(shift.cleaning.heldTool, null); assert.equal(shift.heldTool, "refill:salt");
shift.update(0, { active: true });
for (const place of ["held", "holstered"]) for (const tool of ["broom", "pan", "cloth"]) {
  assert.equal(shift.cleaning.root.getObjectByName(`usher-${tool}-${place}`).visible, false,
    `A carried carton cannot render simultaneously with a ${place} ${tool}`);
}
assert.equal(shift.supplies.getSnapshot().heldVisible, true, "The actual supply carton remains rendered");

supplyAim("dispenser:salt");
frames(.4, { active: true, action: true });
const beforeSheet = shift.supplies.getSnapshot().state;
assert.ok(beforeSheet.stock.find(s => s.id === "salt").delivered > 0, "The orchestrator forwards held refill contact");
const minuteBeforeSheet = shift.schedule.minute;
assert.equal(shift.toggleSheet(), true);
assert.equal(shift.sheet.root.visible, true); assert.equal(shift.heldTool, null);
assert.equal(shift.hands.owner, "supplies", "Reading paper preserves the carried item's ownership");
frames(2, { active: true, action: true });
const reading = shift.supplies.getSnapshot().state;
assert.equal(reading.held.amount, beforeSheet.held.amount, "The sheet blocks an ongoing held refill action");
assert.equal(reading.stock.find(s => s.id === "salt").delivered, beforeSheet.stock.find(s => s.id === "salt").delivered);
assert.ok(Math.abs(shift.schedule.minute - minuteBeforeSheet - 2 * SHIFT_TIME_SCALE / 60) < 1e-8,
  "Reading the break sheet leaves the real 2x shift clock running");
assert.ok(Math.abs(reading.elapsed - beforeSheet.elapsed - 4) < 1e-8,
  "Supplies and the schedule use the same active game-time scale");
assert.equal(shift.interact(), true, "E folds the physical sheet before routing any underlying interaction");
assert.equal(shift.sheet.visible, false); assert.equal(shift.heldTool, "refill:salt");
assert.equal(shift.time, shift.schedule.time, "Prominent HUD clock shares schedule time");
frames(.3, { active: true, action: true });
assert.ok(shift.supplies.getSnapshot().state.held.amount < reading.held.amount);
camera.lookAt(camera.position.x, 0, camera.position.z - 1.1); camera.updateMatrixWorld(true);
assert.equal(shift.returnTool(), true); shift.update(0, { active: true });
assert.equal(shift.placementActive, true); assert.equal(shift.hands.owner, "supplies", "Preview preserves the held box");
assert.equal(shift.confirmPlacement(), true); assert.equal(shift.hands.owner, null);
assert.equal(shift.supplies.getSnapshot().state.loose.length, 1, "Confirm places the actual partial box safely");

// The Theater 2 can is still receiving exiting guests; use the next parked can.
const movingBinIndex = 1;
let bin = shift.waste.getSnapshot().bins[movingBinIndex];
shift.waste.root.updateMatrixWorld(true);
const handle = shift.waste.root.getObjectByName(`${bin.id}-push-handle`).getWorldPosition(new THREE.Vector3()).toArray();
aim([bin.x, 1.68, bin.z + 1.25], handle);
assert.match(shift.focusedPrompt, /Push Theater 1 can/);
assert.equal(shift.interact(), true); assert.equal(shift.hands.owner, "waste");
assert.equal(shift.heldTool, "rolling bin");
shift.update(0, { active: true });
assert.equal(shift.cleaning.root.getObjectByName("usher-broom-holstered").visible, false,
  "Belt broom stays stowed while the usher's hands push a can");
assert.equal(shift.selectTool("broom"), false, "The rolling can owns the same hands as the cleaning kit");
const binStart = { ...bin };
for (let frame = 0; frame < 70; frame++) {
  camera.position.z += .006; bin = shift.waste.getSnapshot().bins[movingBinIndex];
  camera.lookAt(bin.x, 1.14, bin.z); camera.updateMatrixWorld(true);
  shift.update(1 / 120, { active: true });
}
bin = shift.waste.getSnapshot().bins[movingBinIndex];
assert.ok(bin.z > binStart.z + .1, "Waste physics run through the shared update");
assert.ok(Math.hypot(bin.vx, bin.vz) > .02, "Pause is checked while a bin has real momentum");
const paused = physicsSnapshot();
frames(2, { active: false, action: true });
assert.deepEqual(physicsSnapshot(), paused, "Pausing freezes the clock and all subsystem physics, including a moving can");
assert.equal(shift.returnTool(), false, "Paused controls cannot change hand ownership");
shift.update(0, { active: true });
assert.equal(shift.returnTool(), true); assert.equal(shift.hands.owner, null);
assert.equal(shift.selectTool("cloth"), true, "The portable kit is usable again after releasing the can");
assert.equal(shift.hands.owner, "cleaning"); assert.equal(shift.returnTool(), true);

// Advance the real composed runtime through every first break. No clock or
// subsystem is mocked, and the tests check both sides of each due boundary.
aim([24.3, 1.68, 52.8], [24.3, 2.8, 49]);
const firstBreaks = shift.schedule.events.filter(e => e.kind === "break" && e.cycle === 0);
assert.deepEqual(firstBreaks.map(e => e.number), [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
for (let i = 1; i < firstBreaks.length; i++) assert.equal(firstBreaks[i].time - firstBreaks[i - 1].time, 8);
for (const [index, event] of firstBreaks.entries()) {
  if (index) {
    const beforeBoundary = event.time - .002;
    while (shift.schedule.minute < beforeBoundary - 1e-9) {
      const dt = Math.min(.1, (beforeBoundary - shift.schedule.minute) * 60 / SHIFT_TIME_SCALE);
      shift.update(dt, { active: true });
    }
    assert.equal(shift.cleaning.getTheaterSummary(event.theaterId).active, false, `${event.theaterId} does not break early`);
    assert.equal(shift.schedule.getSnapshot().done.includes(event.id), false);
    shift.update(.08, { active: true });
  }
  const jobs = shift.cleaning.getSnapshot().state.jobs;
  assert.equal(jobs.length, index + 1, `${event.theaterId} creates exactly one cleaning job at its break`);
  assert.equal(jobs.filter(j => j.id === event.theaterId).length, 1);
  const job = jobs.find(j => j.id === event.theaterId);
  const plan = createCleaningPlans(world).find(p => p.id === event.theaterId);
  const attended = createShowAttendance(plan, { cycle: event.cycle, version: event.attendanceVersion }).seatIds;
  assert.deepEqual(job.seats.map(s => s.id).sort(), [...attended].sort());
  assert.ok(job.seats.length < AUDITORIUMS.find(r => r.id === event.theaterId).seats);
  assert.ok(job.seats.every(s => s.trayOpen), `${event.theaterId}'s break opens occupied trays`);
  assert.equal(shift.schedule.getSnapshot().done.filter(id => id === event.id).length, 1);
  assert.equal(toasts.filter(t => t.startsWith(`Theater ${event.number} is breaking.`)).length, 1);
  assert.equal(shift.doors.getSnapshot().find(d => d.id === event.theaterId).targetOpen, true,
    `${event.theaterId}'s break is passed to the door subsystem`);
}
assert.deepEqual(jobSignature(shift.cleaning.getSnapshot().state.jobs.find(j => j.id === "theater-2")), initialT2);
assert.equal(shift.waste.getSnapshot().bins.length, 3, "Later theater breaks reuse the same three cans");
assert.ok(shift.doors.due.includes(2), "A later scheduled start reaches the manual door reminder");
const signatures = shift.cleaning.getSnapshot().state.jobs.map(jobSignature);
const minuteAtEnd = shift.schedule.minute;
shift.dispose(); shift.dispose();
assert.equal(shift.hands.owner, null);
assert.deepEqual(collisionWorld.colliders, baselineColliders, "Disposal removes every shift collider while preserving the theater");
assert.deepEqual(scene.children, baselineChildren, "Disposal removes sheet, doors, cleaning, waste and supplies scene roots");
assert.ok(["mililani-schedule-v22", "mililani-doors-v22", "v22-cleaning", "v22-waste", "mililani-v22-supplies"]
  .every(key => saved.has(key)), "Independent subsystem saves coexist under their own keys");

const toastCount = toasts.length, resumed = createUsherShift(options);
assert.equal(resumed.schedule.minute, minuteAtEnd);
assert.deepEqual(resumed.cleaning.getSnapshot().state.jobs.map(jobSignature), signatures,
  "Reloading the composed shift preserves all first-break jobs and seeds");
resumed.update(0, { active: true });
assert.equal(toasts.length, toastCount, "Reloading does not replay already processed theater break events");
assert.equal(resumed.waste.getSnapshot().bins.length, 3);
resumed.dispose();
assert.deepEqual(collisionWorld.colliders, baselineColliders);
assert.deepEqual(scene.children, baselineChildren);

// Cross the real composed break boundary on both program generations. A v25
// saved show must keep its occupants, while a new day uses the quieter audience.
for (const programVersion of [25, 26]) {
  const events = programVersion === 25 ? createV25BreakEvents() : createBreakEvents();
  const event = events.find(event => event.kind === "break");
  const beforeBreak = event.time - .05;
  const progress = new Map([[SCHEDULE_STORAGE_KEY, JSON.stringify({
    version: programVersion === 25 ? 2 : 3, programVersion, mode: "day", seed: 82,
    minute: beforeBreak, started: true, timeScale: 50,
    done: events.filter(event => event.time <= beforeBreak).map(event => event.id), clean: [],
  })]]);
  const runtimeStorage = { getItem: key => progress.get(key), setItem: (key, value) => progress.set(key, value) };
  let boundaryShift = createUsherShift({ ...options, storage: runtimeStorage });
  assert.equal(boundaryShift.schedule.programVersion, programVersion);
  assert.equal(boundaryShift.cleaning.getSnapshot().state.jobs.length, 0);
  const supplyTime = boundaryShift.supplies.getSnapshot().state.elapsed;
  boundaryShift.update(.1, { active: true });
  assert.ok(Math.abs(boundaryShift.schedule.minute - beforeBreak - 5 / 60) < 1e-8);
  assert.ok(Math.abs(boundaryShift.supplies.getSnapshot().state.elapsed - supplyTime - 5) < 1e-8,
    "Consumption and schedule both advance five game seconds at 50x, with no stale 20x cap");
  const job = boundaryShift.cleaning.getSnapshot().state.jobs.find(job => job.id === event.theaterId);
  assert.ok(job, "The schedule callback creates the due cleaning job in the composed runtime");
  const plan = createCleaningPlans(world).find(plan => plan.id === event.theaterId);
  const expectedSeats = createShowAttendance(plan, { cycle: event.audienceCycle, version: event.attendanceVersion }).seatIds;
  assert.deepEqual(job.seats.map(seat => seat.id).sort(), expectedSeats.sort(),
    `${programVersion}: used trays match the show's versioned visible audience`);
  const signature = jobSignature(job);
  boundaryShift.dispose();
  boundaryShift = createUsherShift({ ...options, storage: runtimeStorage });
  assert.equal(boundaryShift.schedule.programVersion, programVersion);
  assert.deepEqual(jobSignature(boundaryShift.cleaning.getSnapshot().state.jobs.find(job => job.id === event.theaterId)), signature,
    "Saving and reloading the new cleaning schema preserves versioned occupied seats and mess IDs");
  boundaryShift.dispose();
  assert.deepEqual(collisionWorld.colliders, baselineColliders);
  assert.deepEqual(scene.children, baselineChildren);
}
console.log("Usher shift passed: shared physical hands, sheet/pause gating, 14 legacy breaks, versioned v25/v26 audience-to-tray matching, synchronized 50x consumption, save/reload and complete collider disposal.");
