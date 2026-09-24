import assert from "node:assert/strict";
import * as THREE from "three";
import { LOBBY_PLAN } from "../src/layout-data.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { createInteractionTargets } from "../src/visit-ui.js";
import { AABBCollisionWorld } from "../src/player.js";
import { pointInPolygon } from "../src/layout-geometry.js";
import { planToWorldX, worldToPlanX } from "../src/coordinates.js";

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
const materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
scene.updateMatrixWorld(true);
const named = name => world.root.getObjectByName(name);
const ray = new THREE.Raycaster();
const verticalHits = (x, z, meshes) => {
  ray.set(new THREE.Vector3(planToWorldX(x), 2, z), new THREE.Vector3(0, -1, 0));
  ray.near = 0; ray.far = 2;
  return ray.intersectObjects(meshes, false);
};
const uniqueHits = hits => new Set(hits.map(hit => hit.object));
const customerTop = named("customer-counter-top");
const officeTop = named("box-office-top");
assert.ok(customerTop?.isMesh && officeTop?.isMesh);
assert.ok(!world.propPlacements.some(({ id }) => id.includes("-cabinet-")), "Architectural counters must not regain tiled prefab cabinets");
assert.ok(!named("box-office-vertical-top") && !named("box-office-return-top"), "L corner uses one continuous top");
const bases = [];
world.root.traverse(mesh => { if (mesh.userData.counterSurface === "base") bases.push(mesh); });
const customerBases = bases.filter(mesh => mesh.name.startsWith("customer-counter"));
assert.equal(customerBases.length, 6, "Four finish runs, with the blue run split only for its two product bays");
let jointSamples = 0;
for (const vertex of LOBBY_PLAN.customerCounter.slice(1, -1)) {
  for (const radius of [.025, .18, .43]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
    const x = vertex.x + Math.cos(angle) * radius, z = vertex.z + Math.sin(angle) * radius;
    if (!pointInPolygon(x, z, customerTop.userData.planPolygon)) continue;
    const hits = verticalHits(x, z, [customerTop]);
    assert.ok(hits.length > 0, `Countertop has a hole at miter ${x},${z}`);
    assert.ok(hits.every(hit => Math.abs(hit.point.y - 1.21) < .0001), "One level stone finish across every joint");
    const body = uniqueHits(verticalHits(x, z, customerBases));
    assert.equal(body.size, 1, `Counter miter must have exactly one base solid at ${x},${z}`);
    jointSamples++;
  }
}
const officeBases = [named("box-office-vertical"), named("box-office-return")];
const v = LOBBY_PLAN.boxOfficeVertical, h = LOBBY_PLAN.boxOfficeReturn;
let officeSamples = 0;
const cornerFinishes = new Set();
for (let x = v.xMin + .047; x < v.xMax; x += .061) for (let z = h.zMin + .043; z < h.zMax; z += .057) {
  const hits = uniqueHits(verticalHits(x, z, officeBases));
  assert.equal(hits.size, 1, `Box office white/wood bases overlap or leave a gap at ${x},${z}`);
  for (const mesh of hits) cornerFinishes.add(mesh.material.name);
  assert.equal(uniqueHits(verticalHits(x, z, [officeTop])).size, 1, "The overlapping legacy L must have one stone surface");
  officeSamples++;
}
assert.equal(cornerFinishes.size, 2, "The miter preserves both white and wood finishes without coplanar overlap");

const expoSection = LOBBY_PLAN.customerCounterSections.find(section => section.role === "expo");
assert.equal(expoSection.segmentIndex, 1);
assert.equal(expoSection.id, LOBBY_PLAN.expo.sectionId);
const expoTarget = createInteractionTargets().find(target => target.id === "expo");
assert.equal(expoTarget.position.x, planToWorldX(LOBBY_PLAN.expo.position.x));
assert.equal(expoTarget.position.z, LOBBY_PLAN.expo.position.z);
const expoSign = named("expo-counter-label");
assert.ok(expoSign && Math.abs(expoSign.position.z - expoTarget.position.z) < .65, "Expo sign and interaction share the kitchen-side anchor");

const gate = world.serviceGate, gatePlan = LOBBY_PLAN.counterServiceGate;
assert.equal(gate.leaves.length, 2);
assert.ok(Math.abs(gate.width - 1.7) < 1e-8, "Wall-to-stone service opening is 1.70m");
const stoneCorner = customerTop.userData.planPolygon.find(p => Math.abs(p.x - gatePlan.counter.x) < 1e-6 && Math.abs(p.z - gatePlan.counter.z) < 1e-6);
assert.ok(stoneCorner, "The gate must attach to the real counter edge, not a guessed centerline");
assert.ok(gatePlan.wall.z > 1.3 && gatePlan.wall.z < 4.5, "Wall hinge is on the solid wall, clear of office and kitchen doorways");
const collision = new AABBCollisionWorld({ bounds: world.worldBounds });
collision.addBoxes(world.colliders);
const dynamic = collision.addBoxes(world.dynamicColliders);
const sync = (delta, player) => { world.update(delta, player); dynamic.forEach(box => Object.assign(box, box.source)); };
const center = new THREE.Vector3(planToWorldX((gatePlan.wall.x + gatePlan.counter.x) / 2), 0, gatePlan.wall.z);
sync(0, null);
assert.ok(collision.isOverlapping(center, .34, 0, 1.78), "Closed physical gate blocks passage");
let gateWalks = 0;
for (const travel of [1, -1]) for (const across of [-.32, .32]) {
  sync(0, null);
  const player = center.clone().add(new THREE.Vector3(across, 0, -travel * 2.1));
  assert.ok(!collision.isOverlapping(player, .34, 0, 1.78), "Service approach begins clear");
  let peakAngle = 0;
  for (let frame = 0; frame < 280 && (player.z - center.z) * travel < 2.1; frame++) {
    sync(1 / 60, player);
    peakAngle = Math.max(peakAngle, Math.abs(gate.leaves[0].angle));
    collision.moveCircle(player, 0, travel * .03, .34, 0, 1.78);
    assert.ok(!collision.isOverlapping(player, .335, 0, 1.78), `Gate pushes through player on ${travel} approach`);
  }
  assert.ok((player.z - center.z) * travel >= 2.05, `Service gate passage failed on side ${travel}, lane ${across}`);
  assert.ok(peakAngle > 1.5, "Both leaves swing fully clear for staff passage");
  for (let frame = 0; frame < 100; frame++) sync(1 / 60, player);
  assert.ok(gate.leaves.every(leaf => Math.abs(leaf.angle) < .001), "Gate returns closed after passage");
  gateWalks++;
}
// Sweep both opening directions and inspect actual rendered vertices. Handles
// and leaf edges must stay outside the wall and the continuous counter solid.
let swingSamples = 0;
for (const direction of [-1, 1]) for (let step = 0; step <= 18; step++) {
  for (const leaf of gate.leaves) leaf.hinge.rotation.y = leaf.sign * direction * step / 18 * Math.PI / 2;
  scene.updateMatrixWorld(true);
  for (const leaf of gate.leaves) leaf.hinge.traverse(mesh => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      const planX = worldToPlanX(p.x);
      assert.ok(planX >= gatePlan.wall.x - .001, "Gate leaf or pushplate clips the wall during swing");
      if (p.y < 1.21 && p.y > 0) assert.ok(!pointInPolygon(planX, p.z, customerTop.userData.planPolygon), "Gate leaf clips the countertop during swing");
      swingSamples++;
    }
  });
}
const resources = [customerTop, officeTop, ...bases].map(mesh => mesh.geometry);
const disposed = new Set();
resources.forEach(geometry => geometry.addEventListener("dispose", () => disposed.add(geometry)));
world.dispose();
assert.equal(disposed.size, new Set(resources).size, "Architectural counter meshes belong to world disposal");
console.log(`Counter geometry valid: ${jointSamples} customer miter rays, ${officeSamples} box-office corner rays, kitchen-side Expo, ${gateWalks} dynamic gate passages and ${swingSamples} collision-free swing vertices.`);
