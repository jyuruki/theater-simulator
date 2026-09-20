import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createTheaterCrowd } from "../src/atmosphere.js";
import { NPC_VARIANTS } from "../src/npc-assets.js";

const bytes = readFileSync(new URL("../public/models/theater-npcs.glb", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../public/models/theater-npcs.manifest.json", import.meta.url), "utf8"));
const parse = () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");

function fixture() {
  const scene = new THREE.Scene(), colliders = new Set();
  const collisionWorld = {
    isOverlapping: () => false,
    addBox(box) { colliders.add(box); return box; },
    remove(box) { colliders.delete(box); },
  };
  const crowd = createTheaterCrowd({ scene, collisionWorld, world: { groundHeight: () => 0 } });
  return { scene, crowd, colliders };
}

function trackDisposal(scene) {
  const counts = new Map();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    for (const resource of [object.geometry, object.material]) {
      if (counts.has(resource)) continue;
      counts.set(resource, 0);
      resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
    }
  });
  return () => assert.ok([...counts.values()].every((count) => count === 1), "Every owned GLB resource is disposed exactly once.");
}

const loaded = await parse();
let meshes = 0, triangles = 0;
const materials = new Set();
loaded.scene.traverse((object) => {
  if (!object.isMesh) return;
  meshes++;
  triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  materials.add(object.material);
  assert.ok(object.geometry.attributes.color, "Every NPC mesh carries the authored vertex colors.");
});
assert.equal(meshes, 30);
assert.equal(materials.size, 1);
assert.equal(triangles, manifest.totalTriangles);
assert.ok(triangles < 25000, "Six people stay within the browser triangle budget.");
assert.ok(bytes.length < 1600000, "People do not require oversized downloads or textures.");
for (const name of NPC_VARIANTS) assert.ok(loaded.scene.getObjectByName(name));

const assertDisposed = trackDisposal(loaded.scene);
const host = fixture();
const roots = host.crowd.actors.map((actor) => actor.group);
const boxes = host.crowd.actors.map((actor) => actor.box);
const positions = roots.map((root) => root.position.clone());
let resolveModel, requests = 0;
const loading = host.crowd.loadAssets({ loadModel: () => {
  requests++;
  return new Promise((resolve) => { resolveModel = resolve; });
} });
assert.equal(host.crowd.loadAssets(), loading, "Repeated calls share a single pending load.");
assert.ok(host.crowd.actors.every(({ fallback }) => fallback.visible), "Fallback people remain present while downloading.");
resolveModel(loaded);
assert.deepEqual(await loading, { status: "ready", actorCount: 6 });
assert.equal(requests, 1);
for (const [i, actor] of host.crowd.actors.entries()) {
  assert.equal(actor.group, roots[i]);
  assert.equal(actor.box, boxes[i]);
  assert.ok(actor.group.position.equals(positions[i]), "Visual loading cannot teleport actors.");
  assert.equal(actor.fallback.visible, false);
  assert.notEqual(actor.limbs, actor.fallbackLimbs);
  for (const { arm, leg } of actor.limbs) {
    assert.ok(Math.abs(arm.position.y - 1.354) < 1e-5, "Arm is authored at the shoulder pivot.");
    assert.ok(Math.abs(leg.position.y - .821) < 1e-5, "Leg is authored at the hip pivot.");
    assert.ok(Math.abs(arm.rotation.x) < 1e-5 && Math.abs(leg.rotation.x) < 1e-5);
  }
}
host.crowd.update(.1, { x: 100, y: 0, z: 100 });
assert.ok(host.crowd.actors[0].distance > 0, "Walking behavior continues with imported bodies.");
assert.notEqual(host.crowd.actors[0].limbs[0].leg.rotation.x, 0, "Imported hip geometry uses the existing gait.");
assert.ok(host.crowd.actors.slice(3).every((actor) => actor.distance === 0), "Staff retain their stations.");
const walker = host.crowd.actors[0];
const pausedPosition = walker.group.position.clone();
host.crowd.update(.1, { ...pausedPosition, y: 0 });
assert.ok(walker.group.position.equals(pausedPosition), "Imported visitors still yield to a nearby player.");
host.crowd.setEnabled(false);
assert.ok(host.crowd.actors.every((actor) => actor.box.enabled === false));
host.crowd.dispose();
host.crowd.dispose();
assert.equal(host.colliders.size, 0);
assert.equal(host.scene.children.length, 0);
assertDisposed();
assert.deepEqual(await host.crowd.loadAssets(), { status: "disposed", actorCount: 0 });

const lateModel = await parse(), assertLateDisposed = trackDisposal(lateModel.scene);
const late = fixture();
let completeLate;
const lateLoading = late.crowd.loadAssets({ loadModel: () => new Promise((resolve) => { completeLate = resolve; }) });
late.crowd.dispose();
completeLate(lateModel);
assert.deepEqual(await lateLoading, { status: "disposed", actorCount: 0 });
assert.equal(late.scene.children.length, 0);
assertLateDisposed();

const failed = fixture();
let errors = 0;
assert.equal((await failed.crowd.loadAssets({ loadModel: async () => { throw new Error("offline"); }, onError: () => errors++ })).status, "fallback");
assert.equal(errors, 1);
assert.ok(failed.crowd.actors.every(({ fallback, limbs, fallbackLimbs }) => fallback.visible && limbs === fallbackLimbs));
failed.crowd.dispose();

const invalidModel = await parse(), assertInvalidDisposed = trackDisposal(invalidModel.scene);
invalidModel.scene.getObjectByName("NPC_Staff_03_Arm_R").name = "Missing required shoulder";
const invalid = fixture();
assert.equal((await invalid.crowd.loadAssets({ loadModel: async () => invalidModel, onError() {} })).status, "fallback");
assert.ok(invalid.crowd.actors.every(({ fallback }) => fallback.visible), "A bad sixth character cannot leave a half-swapped crowd.");
assertInvalidDisposed();
invalid.crowd.dispose();

console.log(`NPC assets valid: 6 Blender people, ${triangles} triangles, 30 draw calls, shared palette; animated pivots, retained avoidance/colliders, atomic fallback and safe async disposal.`);
