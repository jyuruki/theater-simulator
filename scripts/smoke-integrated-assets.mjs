import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AUDITORIUMS, CONCESSION_SERVICE_SEQUENCE, EQUIPMENT_ANCHORS, LOBBY_PLAN } from "../src/layout-data.js";
import { PROP_MODEL_NAMES } from "../src/prop-assets.js";
import { planToWorldBounds, planToWorldX } from "../src/coordinates.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({ canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      measureText: (text) => ({ width: String(text).length * 12 }),
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    }, { get: (object, key) => object[key] ?? (() => {}) });
  }
}
globalThis.OffscreenCanvas = CanvasStub;
const bytes = await readFile(new URL("../public/models/theater-props.glb", import.meta.url));
const parse = () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
const scene = new THREE.Scene();
const materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
const placements = world.propPlacements;
const ids = new Set();
const problems = [];
function check(condition, message) { if (!condition) problems.push(message); }
const near = (a, b, tolerance = .0002) => Math.abs(a - b) <= tolerance;
for (const placement of placements) {
  check(!ids.has(placement.id), `Duplicate placement ID ${placement.id}`);
  ids.add(placement.id);
  check(placement.position.every(Number.isFinite) && placement.size.every((value) => Number.isFinite(value) && value > 0), `Invalid transform ${placement.id}`);
}
const counts = Object.fromEntries(PROP_MODEL_NAMES.map((name) => [name, placements.filter(({ model }) => model === name).length]));
for (const name of PROP_MODEL_NAMES.filter((name) => name !== "stanchion")) check(counts[name] > 0, `Missing model family: ${name}`);
check(counts.recliner === 1093, `Expected 1093 recliners, got ${counts.recliner}`);
const expectedArms = [...world.auditoriumLayouts.values()].reduce((sum, layout) => sum + layout.rows.reduce((n, row) => n + row.seatCount + 1, 0), 0);
check(counts.shared_armrest === expectedArms, `Expected ${expectedArms} shared armrests, got ${counts.shared_armrest}`);
check(counts.candy_display === 1 && counts.water_display === 1, "Both concession selection bays must be modeled");
const originalVisibility = new Map();
for (const placement of placements) for (const fallback of placement.fallback) {
  if (!originalVisibility.has(fallback)) originalVisibility.set(fallback, fallback.visible);
  check(fallback.userData.propFallback, `${fallback.name} can be lost to world box batching`);
  check(fallback.parent, `${fallback.name} fallback detached before loading`);
}

const library = await parse();
const owned = new Set();
const disposed = new Map();
library.scene.traverse((mesh) => {
  if (!mesh.isMesh) return;
  owned.add(mesh.geometry);
  (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => owned.add(material));
});
owned.forEach((resource) => resource.addEventListener("dispose", () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1)));
const colliders = world.colliders.map((collider) => ({ ...collider }));
check(await world.loadPropAssets({ loadModel: async () => library, onError(error) { problems.push(error.stack); } }), "World asset loading failed");
assert.deepEqual(world.colliders, colliders, "Loading visual assets must preserve the gameplay collision registry");
scene.updateMatrixWorld(true);
for (const fallback of originalVisibility.keys()) check(!fallback.visible, `Fallback still visible after successful load: ${fallback.name}`);
const batches = [];
world.root.traverse((object) => { if (object.isInstancedMesh && object.userData.propModel) batches.push(object); });
check(batches.length > 0 && batches.length < 240, `Unexpected imported prop draw-call count ${batches.length}`);
const actual = new Map();
const matrix = new THREE.Matrix4();
for (const batch of batches) {
  check(batch.visible, `Imported batch ${batch.name} is hidden`);
  check(owned.has(batch.geometry), `Library resource ownership broken for ${batch.name}`);
  batch.geometry.computeBoundingBox();
  for (let index = 0; index < batch.count; index++) {
    const id = batch.userData.placementIds[index];
    batch.getMatrixAt(index, matrix);
    matrix.premultiply(batch.matrixWorld);
    const box = batch.geometry.boundingBox.clone().applyMatrix4(matrix);
    if (!actual.has(id)) actual.set(id, new THREE.Box3());
    actual.get(id).union(box);
  }
}
check(actual.size === placements.length, `Model placement coverage ${actual.size}/${placements.length}`);
const bounds = world.worldBounds;
for (const placement of placements) {
  const box = actual.get(placement.id);
  if (!box) { problems.push(`Missing rendered model ${placement.id}`); continue; }
  const measured = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const cos = Math.abs(Math.cos(placement.rotationY));
  const sin = Math.abs(Math.sin(placement.rotationY));
  const expected = [placement.size[0] * cos + placement.size[2] * sin, placement.size[1], placement.size[0] * sin + placement.size[2] * cos];
  const localPoint = new THREE.Vector3(...placement.position);
  (placement.parent ?? world.root).localToWorld(localPoint);
  check(near(center.x, localPoint.x, .004) && near(center.z, localPoint.z, .004) && near(box.min.y, localPoint.y), `Incorrect asset origin for ${placement.id}: center ${center.toArray()}, expected bottomcenter ${localPoint.toArray()}`);
  check(measured.toArray().every((value, axis) => near(value, expected[axis], .008)), `Incorrect asset fitted bounds ${placement.id}: ${measured.toArray()} vs ${expected}`);
  check(box.min.x >= bounds.xMin - .01 && box.max.x <= bounds.xMax + .01 && box.min.z >= bounds.zMin - .01 && box.max.z <= bounds.zMax + .01,
    `Asset outside world bounds: ${placement.id}`);
}

let testedRows = 0;
for (const auditorium of AUDITORIUMS) {
  const room = planToWorldBounds(auditorium.bounds);
  const layout = world.auditoriumLayouts.get(auditorium.id);
  const roomBatches = batches.filter((batch) => batch.userData.propModel === "recliner" && batch.parent.name === `${auditorium.id}-interior`);
  check(roomBatches.length === 4, `${auditorium.id} recliners should use exactly four material batches`);
  for (const row of layout.rows) {
    const collider = world.colliders.find(({ id }) => id === `${auditorium.id}-seat-row-${row.index}`);
    check(collider, `Missing collider ${auditorium.id} row ${row.index}`);
    const inRow = placements.filter((placement) => placement.id.startsWith(`${auditorium.id}-recliner-${row.index}-`) || placement.id.startsWith(`${auditorium.id}-shared-arm-${row.index}-`));
    for (const placement of inRow) {
      const box = actual.get(placement.id);
      if (!box || !collider) continue;
      check(box.min.x >= collider.minX - .002 && box.max.x <= collider.maxX + .002 && box.min.z >= collider.minZ - .002 && box.max.z <= collider.maxZ + .002 && box.max.y <= collider.maxY + .002,
        `Rendered chair exceeds row collider: ${placement.id}`);
      check(box.min.x >= room.xMin && box.max.x <= room.xMax && box.min.z >= room.zMin && box.max.z <= room.zMax, `Chair outside room: ${placement.id}`);
    }
    const byX = inRow.map(({ id }) => ({ id, box: actual.get(id) })).sort((a, b) => a.box.min.x - b.box.min.x);
    for (let index = 1; index < byX.length; index++) check(byX[index - 1].box.max.x <= byX[index].box.min.x + .001,
      `Neighboring seat bodies/arms overlap: ${byX[index - 1].id} / ${byX[index].id}`);
    testedRows++;
  }
}

const guestNormal = new THREE.Vector3(-LOBBY_PLAN.concessionRun.guestNormal.x, 0, LOBBY_PLAN.concessionRun.guestNormal.z).normalize();
const visibleMeshes = [];
world.root.traverse((object) => {
  if (!object.isMesh) return;
  for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
  visibleMeshes.push(object);
});
const displayRay = new THREE.Raycaster();
const contentProbes = [];
for (const display of CONCESSION_SERVICE_SEQUENCE.filter(({ type }) => type === "candy")) {
  const placement = placements.find(({ id }) => id === display.id);
  const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationY);
  check(front.dot(guestNormal) > .999, `Concession selection front points away from guests: ${display.id}`);
  const sourceModel = library.scene.getObjectByName(placement.model);
  const sourceBounds = new THREE.Box3().setFromObject(sourceModel);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const sourceToWorld = new THREE.Matrix4().compose(new THREE.Vector3(...placement.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationY),
    new THREE.Vector3(...placement.size.map((value, axis) => value / sourceSize.getComponent(axis))))
    .multiply(new THREE.Matrix4().makeTranslation(-sourceCenter.x, -sourceBounds.min.y, -sourceCenter.z));
  sourceToWorld.premultiply((placement.parent ?? world.root).matrixWorld);
  // Aim at product bodies across all three shelves, not at the frame: a frame
  // can remain visible while a continuous cabinet buries everything for sale.
  const sampleX = placement.model === "candy_display" ? [-.458, 0, .458] : [-.375, -.075, .375];
  for (const sourceY of [.30, .59, .88]) for (const sourceX of sampleX) {
    const target = new THREE.Vector3(sourceX, sourceY, placement.model === "candy_display" ? .058 : .115).applyMatrix4(sourceToWorld);
    const origin = target.clone().addScaledVector(guestNormal, 1.1);
    displayRay.set(origin, guestNormal.clone().negate());
    displayRay.near = .001;
    displayRay.far = 1.5;
    const first = displayRay.intersectObjects(visibleMeshes, false)[0];
    const firstId = first?.object.userData.placementIds?.[first.instanceId];
    const material = first?.object.material;
    check(firstId === placement.id && first.object.userData.propModel === placement.model,
      `${display.id} product at (${sourceX},${sourceY}) hidden behind ${firstId ?? first?.object.name ?? "no visible surface"}`);
    check(material && (placement.model !== "water_display" || material.name === "Prop_water"),
      `${display.id} probe should reach a bottle body, not a shelf/frame (${material?.name})`);
    const hitLocal = first?.point.clone().applyMatrix4(sourceToWorld.clone().invert());
    check(hitLocal && (placement.model === "candy_display" ? hitLocal.z > .045 && hitLocal.z < .08 : hitLocal.z > .08 && hitLocal.z < .125),
      `${display.id} first surface must be the product body rather than its surrounding display frame`);
    contentProbes.push({ origin, direction: guestNormal.clone().negate(), displayId: placement.id });
  }
}
// Negative control recreates the previous replacement's full-width cabinet,
// which inherited the countertop overhang depth and buried the products.
const continuousCabinets = LOBBY_PLAN.customerCounterSections.filter(({ baseMaterialKey }) => baseMaterialKey === "concessionBlue")
  .map(({ id }) => {
    const top = world.root.getObjectByName(`${id}-top`);
    const height = top.position.y + top.scale.y / 2;
    const control = new THREE.Mesh(new THREE.BoxGeometry(top.scale.x, height, top.scale.z), top.material);
    control.name = `${id}-continuous-cabinet-negative-control`;
    control.position.set(top.position.x, height / 2, top.position.z);
    control.rotation.copy(top.rotation);
    control.updateMatrix();
    control.matrixWorld.multiplyMatrices(world.root.matrixWorld, control.matrix);
    return control;
  });
const blockedByDisplay = new Map();
const blockedControls = contentProbes.filter((probe) => {
  displayRay.set(probe.origin, probe.direction);
  const first = displayRay.intersectObjects([...visibleMeshes, ...continuousCabinets], false)[0];
  const blocked = continuousCabinets.includes(first?.object);
  if (blocked) blockedByDisplay.set(probe.displayId, (blockedByDisplay.get(probe.displayId) ?? 0) + 1);
  return blocked;
}).length;
check(contentProbes.length === 18 && blockedControls >= 12 && blockedByDisplay.size === 2 && [...blockedByDisplay.values()].every((count) => count >= 6),
  `Concession visibility regression must reject continuous cabinet faces (${blockedControls}/${contentProbes.length} blocked controls)`);
continuousCabinets.forEach((control) => control.geometry.dispose());
for (const anchor of EQUIPMENT_ANCHORS) {
  const box = actual.get(anchor.id);
  const placement = placements.find(({ id }) => id === anchor.id);
  check(box && placement, `Missing equipment replacement ${anchor.id}`);
  check(near(box.getCenter(new THREE.Vector3()).x, planToWorldX(anchor.position[0])) && near(box.getCenter(new THREE.Vector3()).z, anchor.position[2]), `Equipment footprint shifted: ${anchor.id}`);
}

const furnitureGeometries = placements.flatMap(({ fallback }) => fallback).filter((object) => object.name.endsWith("-fallback")).map(({ geometry }) => geometry);
let furnitureDisposals = 0;
for (const geometry of furnitureGeometries) geometry.addEventListener("dispose", () => furnitureDisposals++);
world.dispose();
world.dispose();
check(disposed.size === owned.size && [...disposed.values()].every((count) => count === 1), "Every imported shared geometry/material must dispose exactly once");
for (const batch of batches) check(!batch.parent, `Imported batch survived world disposal: ${batch.name}`);
for (const [fallback, visible] of originalVisibility) check(fallback.visible === visible, `Original visibility not restored: ${fallback.name}`);
check(furnitureDisposals === new Set(furnitureGeometries).size, `Furniture fallback geometry leak: disposed ${furnitureDisposals}/${new Set(furnitureGeometries).size}`);
check(await world.loadPropAssets({ loadModel: parse }) === false, "Disposed world cannot load assets again");
console.log(`Integrated models: ${placements.length} placements, ${batches.length} shared-material batches, ${testedRows} audited seating rows, ${contentProbes.length} visible concession product probes.`);
console.log(`Coverage: ${JSON.stringify(counts)}`);
assert.equal(problems.length, 0, problems.slice(0, 35).join("\n") + (problems.length > 35 ? `\n... ${problems.length} problems total` : ""));
console.log("Integrated Blender props valid: full family coverage, exact footprints, seat/arm clearances, guest-facing displays, preserved collision, fallback replacement and resource disposal.");
