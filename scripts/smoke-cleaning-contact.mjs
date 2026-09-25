import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherGameplay } from "../src/usher-gameplay.js";
import { createCleaningPlans } from "../src/usher-cleaning-layout.js";
import { beginCleaningBreak, createUsherState, serializeUsherState } from "../src/usher-state.js";
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
const camera = new THREE.PerspectiveCamera(67, 1.5, .05, 200);
const plans = createCleaningPlans(world), failures = [];
let cases = 0;
// The user is often walking along a row, not perfectly square to the chair.
// Exercise each floor elevation and both approach directions using actual
// world solids, held tool dimensions, and a handful of chair-fallen kernels.
for (const plan of plans) {
  for (const row of new Set(plan.seats.map(s => s.row))) {
    const rowSeats = plan.seats.filter(s => s.row === row);
    const seat = rowSeats[Math.floor(rowSeats.length / 2)];
    for (const lateral of [-.22, .22]) {
      const state = createUsherState();
      let job, source;
      for (let seed = 0; !source && seed < 50; seed++) {
        state.jobs = []; job = beginCleaningBreak(state, plan, seed, { seatIds: [seat.id] });
        source = job.particles.find(p => p.seatId === seat.id);
      }
      assert.ok(source, "Seed fixture contains actual chair popcorn");
      for (const p of job.particles) p.mode = "trash";
      for (const s of job.surfaces) for (const c of s.cells) c.dirt = 0;
      const dropped = job.particles.filter(p => p.seatId === seat.id);
      dropped.forEach((p, i) => Object.assign(p, { mode: "floor", x: seat.x + (i % 3 - 1) * .10,
        z: seat.z + seat.forward * (.46 + Math.floor(i / 3) * .05), y: seat.floorY + .035, vx: 0, vz: 0 }));
      const raw = serializeUsherState(state);
      const game = createUsherGameplay({ scene, world, camera, collisionWorld: collisions, hands: { owner: null },
        storage: { getItem: () => raw, setItem() {} } });
      camera.position.set(seat.x + lateral, seat.floorY + 1.68, seat.z + seat.forward * .80);
      camera.lookAt(seat.x, seat.floorY, seat.z + seat.forward * .51); camera.updateMatrixWorld(true);
      game.update(1 / 60, { active: true }); game.selectTool("broom");
      for (let frame = 0; frame < 330; frame++) game.update(1 / 60, { active: true, action: true });
      const result = game.getSnapshot();
      if (result.summary.pan !== dropped.length) failures.push({ id: seat.id, lateral, pan: result.summary.pan, expected: dropped.length,
        particles: result.state.jobs[0].particles.filter(p => p.mode === "floor"), pose: result.contactPose, tools: result.tools });
      game.dispose(); cases++;
    }
  }
}
world.dispose(); materials.dispose();
assert.equal(failures.length, 0, `${failures.length}/${cases} row sweeps failed: ${JSON.stringify(failures.slice(0, 3))}`);
console.log(`Cleaning contact smoke passed: ${cases} oblique tight-row sweeps across all fourteen theaters and row elevations.`);
