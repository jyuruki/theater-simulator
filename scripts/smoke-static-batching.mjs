import assert from "node:assert/strict";
import * as THREE from "three";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: t => ({ width: String(t).length * 12 }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, { get: (o, k) => o[k] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene(), materials = createMaterialLibrary(), sources = [];
const originalAdd = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function (...objects) {
  for (const object of objects) if (object.isMesh && !object.isInstancedMesh) sources.push({ object, parent: this });
  return originalAdd.apply(this, objects);
};
let world;
try { world = createTheaterWorld({ scene, materials }); }
finally { THREE.Object3D.prototype.add = originalAdd; }
scene.updateMatrixWorld(true);
const arrays = value => Array.isArray(value) ? value : [value];
const materialEqual = (a, b) => arrays(a).length === arrays(b).length && arrays(a).every((m, i) => m === arrays(b)[i]);
const closeMatrix = (a, b) => a.elements.every((value, i) => Math.abs(value - b.elements[i]) < .00002);
const replacementSources = sources.filter(({ object }) => !object.parent || object.userData.staticBatchSource);
const actual = [];
world.root.traverseVisible(object => {
  if (!object.isInstancedMesh || !object.name.startsWith("batched-")) return;
  for (let index = 0; index < object.count; index++) {
    const matrix = new THREE.Matrix4(); object.getMatrixAt(index, matrix); matrix.premultiply(object.matrixWorld);
    actual.push({ object, matrix, matched: false });
  }
});
assert.ok(replacementSources.length > 1000, "Exercise the actual building, not a small artificial batch");
assert.equal(actual.length, replacementSources.length, "Every authored replacement contributes exactly one visible instance");
const reference = [], actualMeshes = [...new Set(actual.map(entry => entry.object))];
let faceMaterials = 0, cylinderCount = 0;
for (const { object, parent } of replacementSources) {
  object.updateMatrix();
  const transform = new THREE.Matrix4().multiplyMatrices(parent.matrixWorld, object.matrix);
  const candidate = actual.find(entry => !entry.matched && entry.object.geometry === object.geometry
    && materialEqual(entry.object.material, object.material) && closeMatrix(transform, entry.matrix)
    && entry.object.castShadow === object.castShadow && entry.object.receiveShadow === object.receiveShadow);
  assert.ok(candidate, `${object.name} keeps its world transform, ordered face finishes and shadow behavior after batching`);
  candidate.matched = true;
  if (Array.isArray(object.material)) faceMaterials++;
  if (object.geometry.type === "CylinderGeometry") cylinderCount++;
  const clone = new THREE.Mesh(object.geometry, object.material); clone.name = object.name;
  clone.matrixAutoUpdate = false; clone.matrix.copy(transform); clone.updateMatrixWorld(true); reference.push(clone);
}
assert.ok(faceMaterials > 10 && cylinderCount > 10, `Cover newly batched multi-material walls (${faceMaterials}) and cylindrical fixtures (${cylinderCount})`);
// Compare the nearest rendered face from both sides of real structural faces.
// A wrong material-group index, mirrored transform, incomplete instance bound,
// or hidden batch would change these visible intersections.
const ray = new THREE.Raycaster(), direction = new THREE.Vector3(), center = new THREE.Vector3(), origin = new THREE.Vector3();
let probes = 0;
for (const source of reference.filter(mesh => /(?:wall|ceiling|hall|pipe)/.test(mesh.name)).filter((_, i) => i % 9 === 0)) {
  source.geometry.computeBoundingBox(); source.geometry.boundingBox.getCenter(center).applyMatrix4(source.matrixWorld);
  // Avoid rays exactly tangent to another slab's edge: Float32 instance
  // transforms and Float64 source transforms differ there by a few microns.
  center.add(new THREE.Vector3(.0173, .0131, .0197));
  for (const localAxis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
    direction.copy(localAxis).transformDirection(source.matrixWorld);
    origin.copy(center).addScaledVector(direction, 30); ray.set(origin, direction.negate());
    const expected = ray.intersectObjects(reference, false)[0], rendered = ray.intersectObjects(actualMeshes, false)[0];
    assert.equal(Boolean(rendered), Boolean(expected), `${source.name} visibility matches the authored geometry`);
    if (!expected) continue;
    assert.ok(Math.abs(expected.distance - rendered.distance) < .0001, `${source.name} surface distance preserved: ${expected.object.name} ${expected.distance} / ${rendered.object.name} ${rendered.distance}; ray ${origin.toArray()} / ${direction.toArray()}`);
    const expectedMaterial = arrays(expected.object.material)[expected.face.materialIndex ?? 0];
    const actualMaterial = arrays(rendered.object.material)[rendered.face.materialIndex ?? 0];
    assert.equal(actualMaterial, expectedMaterial, `${source.name} viewed surface retains the correct finish`);
    probes++;
  }
}
assert.ok(probes > 30);
// Static child matrices must continue to follow their moving parent hinges.
// Capture a visible gate panel before/after approach, not just its angle field.
for (const gate of [world.serviceGate, world.barServiceGate]) {
  const panel = gate.leaves[0].hinge.children.find(mesh => mesh.isMesh && mesh.name.includes("panel"));
  const before = new THREE.Box3().setFromObject(panel);
  const approach = gate.group.localToWorld(new THREE.Vector3(gate.width / 2, 0, .8));
  for (let frame = 0; frame < 40; frame++) gate.update(1 / 60, approach);
  scene.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(panel);
  assert.ok(before.getCenter(new THREE.Vector3()).distanceTo(after.getCenter(new THREE.Vector3())) > .2,
    "Frozen static gate panels still swing with their live hinges");
}
for (const point of [[0, 0, 0], [-70, 0, 80], [24, 0, 45]]) {
  world.updateVisibility(...point);
  for (const { group } of world.auditoriumGroups.values()) assert.equal(group.visible, true, "All rooms remain architecturally visible from distant views");
}
world.dispose(); materials.dispose();
console.log(`Static batching passed: ${replacementSources.length} authored transforms, ${faceMaterials} multi-material faces, ${cylinderCount} cylinders, ${probes} visible-face rays, live gate hinges and all-room visibility.`);
