import assert from "node:assert/strict";
import * as THREE from "three";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { LOBBY_PLAN, SERVICE_ROOMS } from "../src/layout-data.js";
import { planToWorldX } from "../src/coordinates.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({ canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      measureText: (text) => ({ width: String(text).length * 12 }),
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
  }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene();
const materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
scene.updateMatrixWorld(true);

const ray = new THREE.Raycaster();
function cast(x, y, z, dx, dy, dz, far) {
  ray.set(new THREE.Vector3(planToWorldX(x), y, z), new THREE.Vector3(-dx, dy, dz));
  ray.near = 0.001;
  ray.far = far;
  return ray.intersectObject(world.root, true);
}
function hitMaterial(hit) {
  return Array.isArray(hit.object.material)
    ? hit.object.material[hit.face.materialIndex] : hit.object.material;
}
const solidAt = (x, y, z) => world.colliders.some((box) => (
  planToWorldX(x) >= box.minX && planToWorldX(x) <= box.maxX
  && y >= box.minY && y <= box.maxY && z >= box.minZ && z <= box.maxZ
));
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-5,
  `${label}: ${actual} != ${expected}`);

// Probe the established service-floor rectangle, independently of the new
// roof's vertices. One low surface must cover every point, with no doubled
// coplanar slabs where the storage, kitchen, nook and new roof meet.
let roofSamples = 0;
for (let x = -20.65; x < -16.24; x += 0.31) {
  for (let z = 4.55; z < 17.05; z += 0.29) {
    const hits = cast(x, 4.2, z, 0, 1, 0, 0.5);
    assert.ok(hits.length, `Service floor is open to the high lobby at ${x},${z}`);
    close(hits[0].point.y, 4.55, `Low service roof at ${x},${z}`);
    const owners = new Set(hits.filter((hit) => Math.abs(hit.point.y - 4.55) < 1e-5)
      .map((hit) => `${hit.object.uuid}:${hit.instanceId ?? "mesh"}`));
    assert.equal(owners.size, 1, `Overlapping rendered service roofs at ${x},${z}`);
    close(world.ceilingHeight(planToWorldX(x), z, 0), 4.55, `Service roof headroom at ${x},${z}`);
    roofSamples++;
  }
}
assert.ok(roofSamples > 600, "Cover the full service-floor area, not a single repaired spot");

// Sightlines across the photographed upper storefront must encounter tinted
// glass, then open air: an opaque header hidden directly behind it still fails.
const facadeZ = LOBBY_PLAN.frontEntrance.facadeZ;
let glazingSamples = 0;
for (const x of [-13, -7, -3.6, 0, 5, 12, 14.8]) {
  for (const y of [5.2, 7.6, 9, 10.3]) {
    for (const side of [-1, 1]) {
      const hits = cast(x, y, facadeZ + side * 0.35, 0, 0, -side, 0.7);
      assert.ok(hits.length, `Upper facade has a hole at ${x},${y}`);
      for (const hit of hits) {
        const material = hitMaterial(hit);
        assert.ok(material.transparent && material.opacity < 0.6 && material.transmission > 0,
          `Upper facade is blocked by ${hit.object.name} at ${x},${y}`);
      }
      assert.ok(solidAt(x, y, facadeZ), `Upper glazing needs physical closure at ${x},${y}`);
      glazingSamples++;
    }
  }
}

// The narrow office/window jamb return must close from floor to the high
// roof on both faces; rendering a roof above an otherwise open slit is insufficient.
const overflow = SERVICE_ROOMS.find(({ id }) => id === "office-overflow");
let jambSamples = 0;
for (const z of [-2.43, -2.3, -2.17]) {
  for (const y of [0.25, 1.65, 3, 4.3, 5.5, 8.8, 10.6]) {
    for (const side of [-1, 1]) {
      const hits = cast(overflow.bounds.xMax + side * 0.5, y, z, -side, 0, 0, 0.6);
      assert.ok(hits.length, `Office jamb slit remains visible at ${y},${z} from side ${side}`);
      assert.ok(!hitMaterial(hits[0]).transparent, "Office jamb must be an opaque finished wall");
      assert.ok(solidAt(overflow.bounds.xMax, y, z), "Office jamb visual and collision must agree");
      jambSamples++;
    }
  }
}

// Repairing fixed gaps must leave the existing public and office apertures open.
for (const door of LOBBY_PLAN.frontEntrance.doors) {
  for (const offset of [-0.65, 0, 0.65]) {
    assert.equal(solidAt(door.center + offset, 1.65, facadeZ), false,
      `${door.id}: new fixed geometry blocks the entrance opening`);
  }
}
for (const offset of [-0.6, 0, 0.6]) {
  const z = overflow.doorCenter + offset;
  assert.equal(solidAt(overflow.bounds.xMax, 1.65, z), false, "Office door must remain physically open");
  assert.equal(cast(overflow.bounds.xMax + 0.3, 1.65, z, -1, 0, 0, 0.6).length, 0,
    "Office door must remain visually open");
}

world.dispose();
console.log(`Lobby repair valid: ${roofSamples} roof coverage/non-overlap probes, ${glazingSamples} clear glazing sightlines, ${jambSamples} closed office-jamb views; all door apertures retained.`);
