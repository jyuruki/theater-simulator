import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherState, beginCleaningBreak, restoreUsherState, serializeUsherState, theaterSummary } from "../src/usher-state.js";
import { createCleaningPlans } from "../src/usher-cleaning-layout.js";
import { createCleaningVisuals } from "../src/usher-cleaning-visuals.js";
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
const world = createTheaterWorld({ scene, materials }), plans = createCleaningPlans(world);
const collisions = new AABBCollisionWorld({ bounds: world.worldBounds }); collisions.addBoxes(world.colliders);
let occupied = 0, spillCount = 0, floorKernels = 0, emptyFloorShows = 0;
const clusterSizes = [], spillSizes = new Set(), failures = [];
for (const plan of plans) {
  const empty = beginCleaningBreak(createUsherState(), plan, "empty", { seatIds: [] });
  assert.equal(empty.seats.length + empty.particles.length + empty.surfaces.length, 0, "An empty show leaves no cleaning work");
  assert.equal(theaterSummary(empty).complete, true);
  for (let cycle = 0; cycle < 64; cycle++) {
    // Include every row and side of every room without relying on attendance
    // randomly exercising awkward floor boundaries during this test run.
    const seatIds = plan.seats.filter((_, i) => (i + cycle) % 5 === 0).slice(0, 24).map(s => s.id);
    const state = createUsherState(), job = beginCleaningBreak(state, plan, cycle, { seatIds });
    occupied += job.seats.length;
    const clusters = new Map();
    const floor = job.particles.filter(p => p.mode === "floor");
    if (!floor.length) emptyFloorShows++;
    for (const particle of floor) {
      floorKernels++;
      clusters.set(particle.clusterId, (clusters.get(particle.clusterId) ?? 0) + 1);
      const source = job.seats.find(s => `${s.id}-aisle` === particle.clusterId);
      assert.ok(source, "Every initial floor kernel belongs to an actual occupied row aisle");
      assert.ok((particle.z - source.z) * source.forward >= .52, "No new kernel begins against or inside a chair");
      if (collisions.isOverlapping(particle, .031, particle.floorY + .005, .065)
        || Math.abs(world.groundHeight(particle.x, particle.z, particle.floorY) - particle.floorY) > .025)
        failures.push({ id: particle.id, x: particle.x, z: particle.z, floorY: particle.floorY });
    }
    clusterSizes.push(...clusters.values());
    for (const surface of job.surfaces.filter(s => s.kind === "floor")) {
      spillCount++; spillSizes.add(`${surface.width.toFixed(2)}/${surface.depth.toFixed(2)}`);
      assert.ok(surface.id.endsWith("-aisle-spill"), "Spills occur in occupied aisles, never fixed screen-front patches");
      const source = job.seats.find(s => `${s.id}-aisle-spill` === surface.id);
      assert.ok((surface.z - source.z) * source.forward - surface.depth / 2 >= .489, "The entire spill clears the chair front");
      assert.ok(Math.abs(world.groundHeight(surface.x, surface.z, surface.y) - (surface.y - .008)) < .025);
    }
    // Partially cleaned state reproduces the same recipe, rather than creating
    // a different pile or resetting a wiped cell on reload.
    if (cycle === 0 && job.surfaces.length) {
      job.surfaces[0].cells[0].dirt = .37;
      if (job.particles.length) job.particles[0].mode = "pan";
      const raw = serializeUsherState(state);
      assert.equal(serializeUsherState(restoreUsherState(raw, plans)), raw);
    }
  }
}
assert.equal(failures.length, 0, `Generated aisle debris must be supported and free of solids: ${JSON.stringify(failures.slice(0, 8))}`);
assert.ok(emptyFloorShows > 30, "Some occupied shows need no floor sweeping at all");
assert.ok(clusterSizes.filter(n => n <= 3).length / clusterSizes.length > .77, "One to three kernels are the usual mess");
assert.ok(clusterSizes.filter(n => n >= 18).length / clusterSizes.length < .035, "A dropped bag is rare");
assert.ok(clusterSizes.some(n => n >= 18), "Rare larger accidents can still happen");
assert.ok(spillCount / occupied < .035 && spillCount / occupied > .01, "Floor drinks are occasional accidents, not mandatory tasks");
assert.ok(spillSizes.size > 30, "Floor spills vary in footprint");

// A v24 save used the fixed front patches. Preserve their IDs, exact amounts,
// wiped cells and contents already swept into the pan through repeated reloads.
const legacy = createUsherState();
const oldJob = beginCleaningBreak(legacy, plans[1], 1234, { messVersion: 24, attendanceVersion: 24 });
oldJob.surfaces[0].cells[0].dirt = .23; oldJob.particles[0].mode = "pan";
const data = JSON.parse(serializeUsherState(legacy)); data.version = 24;
for (const job of data.jobs) delete job.messVersion;
const migrated = restoreUsherState(JSON.stringify(data), plans);
assert.deepEqual(migrated.jobs[0].surfaces, oldJob.surfaces);
assert.deepEqual(migrated.jobs[0].particles, oldJob.particles);
const migratedRaw = serializeUsherState(migrated);
assert.equal(serializeUsherState(restoreUsherState(migratedRaw, plans)), migratedRaw);

const visuals = createCleaningVisuals({ scene, world, hands: { owner: "cleaning" } });
for (const group of [visuals.tools.broom, visuals.tools.pan, visuals.stored.broom, visuals.stored.pan]) {
  group.traverse(o => { if (o.isMesh) assert.equal(o.material.color.getHex(), /bristles/.test(o.name) ? 0xf2cb36 : 0x161719); });
}
assert.equal(visuals.tools.cloth.children[0].material.color.getHex(), 0x73bfd0, "Cloth stays blue");
const emptyState = createUsherState(); beginCleaningBreak(emptyState, plans[0], "empty-visual", { seatIds: [] });
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.68, 0);
assert.doesNotThrow(() => visuals.update(emptyState, camera), "A zero-customer room has safe empty render batches");
visuals.dispose(); world.dispose(); materials.dispose();
console.log(`Messes v26 smoke passed: ${occupied} occupied seats across 896 shows; ${floorKernels} supported aisle kernels; ${spillCount} occasional varied spills; common tiny messes, rare large drops, empty shows, old/new partial saves, and black tools.`);
