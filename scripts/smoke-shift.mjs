import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createUsherSchedule, formatShiftTime } from "../src/usher-schedule.js";
import { createUsherBreaksheet } from "../src/usher-breaksheet.js";
import { createUsherDoors } from "../src/usher-doors.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";
import { AABBCollisionWorld } from "../src/player.js";

const saved = new Map(), storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
const breaks = [], starts = [];
const schedule = createUsherSchedule({ storage, seed: 42, onBreak: (event, seed) => breaks.push({ ...event, seed }), onStart: e => starts.push(e) });
assert.deepEqual(schedule.getNextBreaks().slice(0, 3).map(e => e.number), [2, 1, 3]);
schedule.update(.1, true); assert.equal(breaks.length, 0, "No clock before beginning shift");
schedule.begin(); schedule.update(0, true); assert.equal(breaks[0].number, 2);
for (let i = 0; i < 600; i++) schedule.update(.1, true);
assert.ok(Math.abs(schedule.minute - 1025) < 1e-7, "One real minute advances five game minutes");
const paused = schedule.minute; schedule.update(.1, false); assert.equal(schedule.minute, paused);
schedule.markReady("theater-2");
assert.deepEqual(schedule.getNextBreaks().slice(0, 3).map(e => e.number), [1, 3, 4], "Completed cans leapfrog to the next unserved breaks");
for (let i = 0; i < 12_000; i++) schedule.update(.1, true);
assert.equal(new Set(breaks.map(e => e.theaterId)).size, 14, "Every room breaks");
assert.ok(starts.length > 0);
for (const row of schedule.sheetRows()) assert.equal(row.bold, row.kind === "start", "Whole start row is bold; breaks regular");
assert.equal(formatShiftTime(24 * 60 + 5), "00:05");
schedule.dispose(); const restored = createUsherSchedule({ storage });
assert.equal(restored.minute, schedule.minute); assert.equal(restored.seed, 42);
assert.deepEqual(restored.getSnapshot().done, schedule.getSnapshot().done);

globalThis.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; this.text = []; }
  getContext() {
    const gradient = { addColorStop() {} }, owner = this;
    return new Proxy({ canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      measureText: t => ({ width: String(t).length * 12 }),
      fillText(text, ...args) { owner.text.push({ text, font: this.font, args }); },
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }, { get: (t, k) => t[k] ?? (() => {}) });
  }
};
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(67, 1, .06, 260);
const materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
const collisions = new AABBCollisionWorld({ bounds: world.worldBounds }); collisions.addBoxes(world.colliders);
const sheet = createUsherBreaksheet({ scene, camera, schedule });
sheet.toggle(); sheet.update(); assert.equal(sheet.root.visible, true);
const texts = sheet.root.material.map.image.text;
for (const row of schedule.sheetRows()) {
  const entry = texts.find(t => t.text === row.title && t.font.startsWith(row.bold ? "bold " : "27px"));
  assert.ok(entry, `${row.id}: physical sheet contains the correctly styled movie line`);
}
sheet.hide(); assert.equal(sheet.root.visible, false);
const doors = createUsherDoors({ scene, camera, collisionWorld: collisions });
for (const door of doors.doors) {
  camera.position.set(door.x, 1.68, door.z - door.inward * .85);
  const handle = doors.getSnapshot().find(d => d.id === door.id).handles[0];
  camera.lookAt(...handle); camera.updateMatrixWorld(); doors.update(0, { active: true });
  assert.ok(doors.focusedPrompt.includes("Close"), `${door.id}: open door reachable from hall`);
  assert.equal(doors.interact(), true);
  for (let frame = 0; frame < 140; frame++) doors.update(1 / 60, { active: true });
  assert.ok(door.angle < .002, `${door.id}: closes without structural interference (angle ${door.angle})`);
  assert.ok(collisions.isOverlapping({ x: door.x, z: door.z }, .3, 0, 1.7), `${door.id}: closed leaves stop passage`);
  camera.lookAt(...doors.getSnapshot().find(d => d.id === door.id).handles[0]); camera.updateMatrixWorld();
  doors.update(0, { active: true }); assert.equal(doors.interact(), true);
  for (let frame = 0; frame < 140; frame++) doors.update(1 / 60, { active: true });
  assert.ok(door.angle > 1.56, `${door.id}: opens without structural interference`);
  assert.equal(collisions.isOverlapping({ x: door.x, z: door.z }, .3, 0, 1.7), false, `${door.id}: open center is passable`);
}
const door = doors.doors[0];
camera.position.set(door.x, 1.68, door.z); door.targetOpen = false;
for (let f = 0; f < 180; f++) doors.update(1 / 60, { active: true });
assert.ok(door.angle > .1, "A door cannot close through a standing player");
assert.equal(collisions.isOverlapping({ x: door.x, z: door.z }, .3, 0, 1.7), false);
doors.onStart(door.id); assert.ok(doors.due.includes(door.number));
const beforeAngle = door.angle; doors.update(.1, { active: false }); assert.equal(door.angle, beforeAngle);

// Articulated trays hide just their original tray, also when GLB loading is late.
const id = world.propPlacements.find(p => p.model === "recliner").id;
world.setCleaningSeatTrays([id]);
const bytes = await readFile(new URL("../public/models/theater-props.glb", import.meta.url));
await world.loadPropAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
let trayCount = 0, bodyCount = 0; const matrix = new THREE.Matrix4();
world.root.traverse(mesh => {
  const i = mesh.userData.placementIds?.indexOf(id); if (!mesh.isInstancedMesh || i === undefined || i < 0) return;
  mesh.getMatrixAt(i, matrix);
  if (/espresso/.test(mesh.name)) { assert.equal(matrix.determinant(), 0); trayCount++; }
  else { assert.ok(Math.abs(matrix.determinant()) > .00001); bodyCount++; }
});
assert.ok(trayCount > 0 && bodyCount > 0);
world.setCleaningSeatTrays([]);
world.root.traverse(mesh => { const i = mesh.userData.placementIds?.indexOf(id); if (mesh.isInstancedMesh && i >= 0 && /espresso/.test(mesh.name)) { mesh.getMatrixAt(i, matrix); assert.ok(matrix.determinant() > 0); } });
doors.dispose(); sheet.dispose(); world.dispose(); materials.dispose();
console.log("Shift valid: 5x persistent schedule, 14 breaks, bold start rows, physical sheet, all auditorium door passages, safe closing and asynchronous tray masking.");
