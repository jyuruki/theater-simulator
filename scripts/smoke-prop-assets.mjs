import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createPropAssets, PROP_MODEL_NAMES } from "../src/prop-assets.js";

const bytes = await readFile(new URL("../public/models/theater-props.glb", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("../public/models/theater-props.manifest.json", import.meta.url), "utf8"));
const parse = () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.0001, `${label}: ${actual} ≈ ${expected}`);
const source = await parse();
source.scene.updateMatrixWorld(true);
assert.equal(manifest.glbBytes, bytes.length);
assert.ok(bytes.length < 2_000_000, "Library stays small enough for the browser download.");
assert.deepEqual(new Set(manifest.models.map(({ name }) => name)), new Set(PROP_MODEL_NAMES));
assert.equal(PROP_MODEL_NAMES.length, 33);
let triangles = 0;
let components = 0;
for (const record of manifest.models) {
  const model = source.scene.getObjectByName(record.name);
  assert.ok(model, `Exported named root ${record.name}`);
  const bounds = new THREE.Box3().setFromObject(model);
  for (let axis = 0; axis < 3; axis++) {
    close(bounds.min.getComponent(axis), record.bounds.min[axis], `${record.name} min ${axis}`);
    close(bounds.max.getComponent(axis), record.bounds.max[axis], `${record.name} max ${axis}`);
  }
  let modelTriangles = 0;
  let modelComponents = 0;
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    modelComponents++;
    assert.ok(mesh.geometry.attributes.normal, `${mesh.name} exports normals`);
    assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    modelTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  });
  assert.equal(modelTriangles, record.triangles);
  assert.equal(modelComponents, record.meshCount);
  triangles += modelTriangles;
  components += modelComponents;
}
assert.equal(triangles, manifest.triangles);
assert.ok(triangles < 40_000);
assert.ok(components < 150);
assert.ok(manifest.models.find(({ name }) => name === "recliner").triangles < 500);

const root = new THREE.Group();
const auditoriumA = new THREE.Group();
const auditoriumB = new THREE.Group();
root.add(auditoriumA, auditoriumB);
auditoriumB.position.set(40, 0, 0);
const fallback = new THREE.Group();
const initiallyHidden = new THREE.Group();
initiallyHidden.visible = false;
root.add(fallback, initiallyHidden);
const placements = [];
for (const [index, parent] of [auditoriumA, auditoriumB].entries()) {
  for (let seat = 0; seat < 64; seat++) {
    placements.push({ id: `seat-${index}-${seat}`, model: "recliner", parent,
      position: [seat % 16 * .56, Math.floor(seat / 16) * .24, Math.floor(seat / 16) * 1.3],
      scale: [.44 / .54, 1, 1], fallback });
  }
}
placements.push({ id: "candy", model: "candy_display", position: [2, .24, 3], rotationY: Math.PI / 2,
  size: [1, .8, .22], fallback: [fallback, initiallyHidden] });
let completeLoad;
let refreshed = 0;
const props = createPropAssets({ root, placements,
  loadModel: () => new Promise((resolve) => { completeLoad = resolve; }), onLoaded() { refreshed++; },
});
assert.equal(fallback.visible, true, "Fallback remains until the full library loads.");
const resources = new Set();
source.scene.traverse((mesh) => {
  if (!mesh.isMesh) return;
  resources.add(mesh.geometry);
  (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => resources.add(material));
});
const disposalCounts = new Map();
for (const resource of resources) resource.addEventListener("dispose", () => disposalCounts.set(resource, (disposalCounts.get(resource) ?? 0) + 1));
completeLoad(source);
assert.equal(await props.ready, true);
assert.equal(refreshed, 1);
assert.equal(fallback.visible, false);
assert.equal(props.instances.filter(({ userData }) => userData.propModel === "recliner").length, 8,
  "128 recliners use only four shared-material draw calls per auditorium.");
assert.ok(props.instances.filter(({ userData }) => userData.propModel === "recliner").every(({ count }) => count === 64));
const chairA = props.instances.find(({ parent }) => parent === auditoriumA);
const chairB = props.instances.find(({ parent }) => parent === auditoriumB);
assert.equal(chairA.geometry, chairB.geometry);
assert.equal(chairA.material, chairB.material);
auditoriumB.visible = false;
assert.equal(chairB.parent.visible, false, "Existing auditorium visibility controls imported props.");
root.updateMatrixWorld(true);
const candyBounds = new THREE.Box3();
for (const batch of props.instances.filter(({ userData }) => userData.propModel === "candy_display")) candyBounds.union(new THREE.Box3().setFromObject(batch));
const candySize = candyBounds.getSize(new THREE.Vector3());
close(candySize.x, .22, "Rotated fitted candy depth");
close(candySize.y, .8, "Fitted candy height");
close(candySize.z, 1, "Rotated fitted candy width");
close(candyBounds.min.y, .24, "Fitted bottom center has the exact mounting elevation");
close(candyBounds.getCenter(new THREE.Vector3()).x, 2, "Fitted center x");
close(candyBounds.getCenter(new THREE.Vector3()).z, 3, "Fitted center z");
props.dispose();
props.dispose();
assert.equal(fallback.visible, true);
assert.equal(initiallyHidden.visible, false, "Disposal restores original visibility, including hidden objects.");
assert.equal(props.instances.length, 0);
assert.equal(disposalCounts.size, resources.size);
assert.ok([...disposalCounts.values()].every((count) => count === 1), "Every shared resource disposes exactly once.");

let lateFinish;
const late = createPropAssets({ root, placements: [], loadModel: () => new Promise((resolve) => { lateFinish = resolve; }) });
late.dispose();
lateFinish(await parse());
assert.equal(await late.ready, false);
assert.equal(late.instances.length, 0);

let errors = 0;
const invalid = createPropAssets({ root, placements: [placements[0], { id: "missing", model: "absent" }],
  loadModel: parse, onError() { errors++; },
});
assert.equal(await invalid.ready, false);
assert.equal(errors, 1);
assert.equal(fallback.visible, true, "Missing models never hide a working fixture.");
const corrupt = createPropAssets({ root, placements: [{ id: "bad-size", model: "trash_can", size: [-1, 1, 1], fallback }],
  loadModel: parse, onError() {},
});
assert.equal(await corrupt.ready, false);
assert.equal(fallback.visible, true);
const offline = createPropAssets({ root, placements, loadModel: async () => { throw new Error("Offline"); }, onError() {} });
assert.equal(await offline.ready, false);
assert.equal(fallback.visible, true);
console.log(`Prop library valid: ${PROP_MODEL_NAMES.length} Blender models, ${triangles} triangles, ${bytes.length} bytes; meter bounds, fitting, instancing, visibility, fallback and async disposal passed.`);
