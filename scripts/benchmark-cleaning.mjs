// CPU-only cleaning update benchmark. Canvas drawing/GPU frame time are not
// measured. --all-seats reproduces the v23 workload for before/after comparison.
import * as THREE from "three";
import { performance } from "node:perf_hooks";
import { createUsherGameplay } from "../src/usher-gameplay.js";
import { createCleaningPlans } from "../src/usher-cleaning-layout.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AABBCollisionWorld } from "../src/player.js";

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
const scene = new THREE.Scene();
const world = createTheaterWorld({ scene, materials: createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } }) });
const camera = new THREE.PerspectiveCamera(70, 1.5, .05, 200);
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds });
collisionWorld.addBoxes(world.colliders);
const game = createUsherGameplay({ scene, world, camera, collisionWorld });
for (const plan of createCleaningPlans(world)) game.beginBreak(plan.id, 1234,
  process.argv.includes("--all-seats") ? { seatIds: plan.seats.map(seat => seat.id) } : undefined);
const snapshot = game.getSnapshot(), seat = snapshot.anchors.seats.find(seat => seat.theaterId === "theater-2");
camera.position.set(seat.stand[0], seat.stand[1] + 1.68, seat.stand[2]);
camera.lookAt(...seat.tray); camera.updateMatrixWorld(true);
game.update(1 / 60, { active: true }); game.selectTool("cloth");
const samples = [];
for (let frame = 0; frame < 1500; frame++) {
  const start = performance.now(); game.update(1 / 60, { active: true, action: true });
  if (frame >= 100) samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ usedSeats: snapshot.anchors.seats.length, colliders: collisionWorld.colliders.length,
  samples: samples.length, meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
  medianMs: samples[Math.floor(samples.length * .5)], p95Ms: samples[Math.floor(samples.length * .95)],
}, null, 2));
game.dispose(); world.dispose();
