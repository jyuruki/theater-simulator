import assert from "node:assert/strict";
import * as THREE from "three";
import { AUDITORIUMS, SERVICE_ROOMS } from "../src/layout-data.js";
import {
  buildAuditoriumLayout,
  sampleBowlFloorCandidate,
  sampleSideStairHeight,
  sampleTierHeight,
} from "../src/layout-geometry.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AABBCollisionWorld, FirstPersonController } from "../src/player.js";
import { planToWorldX, worldToPlanX } from "../src/coordinates.js";

const close = (actual, expected, message, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
const revisedNumbers = [3, 6, 7, 8];
assert.deepEqual(AUDITORIUMS.filter((room) => room.stadium.seatingProfile).map((room) => room.number), revisedNumbers,
  "Only the four requested large theaters use the seating reference");

let storageSamples = 0;
for (const room of AUDITORIUMS) {
  const layout = buildAuditoriumLayout(room);
  assert.equal(layout.rows.reduce((sum, row) => sum + row.seatCount, 0), room.seats,
    `${room.id}: unavailable seats in the screenshot must not silently remove capacity`);
  if (!revisedNumbers.includes(room.number)) {
    assert.equal(layout.entryCross, null, `${room.id}: preserve the existing seating shape`);
    continue;
  }
  assert.equal(layout.rows.map((row) => row.label).join(""), "ABCDEFGH");
  for (const row of layout.rows.slice(0, 3)) close(row.elevation, 0, `${room.id} row ${row.label} at hall ground`);
  for (const row of layout.rows.slice(3)) close(row.elevation, (row.index - 2) * 0.66, `${room.id} row ${row.label} rise`);
  close(Math.abs(layout.rows[2].z - layout.rows[1].z), layout.rowPitch + 1.3, `${room.id} B/C separation`);
  close(Math.abs(layout.rows[0].z - layout.rows[1].z), layout.rowPitch, `${room.id} A/B separation`);
  close(layout.entryCross.centerZ, (layout.rows[1].z + layout.rows[2].z) / 2, `${room.id} arrival between B/C`);
  close(layout.entryCross.bounds.zMax - layout.entryCross.bounds.zMin, 1.3, `${room.id} clear crosswalk floor`);
  assert.ok(layout.entryCross.bounds.zMin > layout.rows[2].z + 0.39 + 0.34,
    `${room.id}: crosswalk must clear row C and a player's radius`);
  assert.ok(layout.entryCross.bounds.zMax < layout.rows[1].z - 0.39 - 0.34,
    `${room.id}: crosswalk must clear row B and a player's radius`);
  close(layout.rows[1].floorBounds.zMin, layout.entryCross.floorBounds.zMax, `${room.id} B floor joins crosswalk`);
  close(layout.rows[2].floorBounds.zMax, layout.entryCross.floorBounds.zMin, `${room.id} C floor joins crosswalk`);
  assert.equal(layout.sideStairTreads.length, 30, `${room.id}: only C→D through G→H have stairs`);
  for (const tread of layout.sideStairTreads) {
    assert.ok(tread.transition >= 2, `${room.id}: no stairs in front of C`);
    close(tread.stepRise, 0.22, `${room.id} safe individual step rise`);
    const z = (tread.bounds.zMin + tread.bounds.zMax) / 2;
    close(sampleSideStairHeight(layout, z), tread.elevation, `${tread.id} renderer/sampler agreement`);
  }
  for (let z = layout.rows[2].z; z <= layout.rows[0].z; z += 0.07) {
    close(sampleTierHeight(layout, z), 0, `${room.id} front tier level`);
    close(sampleSideStairHeight(layout, z), 0, `${room.id} front aisle level`);
  }
  close(Math.abs(layout.rearWallZ - layout.backRowZ), 0.72, `${room.id} wall directly behind H`);
  assert.equal(layout.rearCross.walkableCrossing, false, `${room.id}: do not invent a rear circulation passage`);
  assert.equal(sampleBowlFloorCandidate(layout, layout.centerX, layout.rearWallZ - 0.2), null,
    `${room.id}: the removed rear landing must not remain an invisible walkable floor`);
  const ramp = layout.routeSurfaces.find((surface) => surface.kind === "corridor-ramp");
  if (ramp) {
    close(ramp.endHeight, 0, `${room.id}: entrance meets level C`);
    assert.ok(ramp.bounds.zMax <= layout.entryCross.bounds.zMin + 1e-6, `${room.id}: approach finishes before crosswalk`);
  }
  const dx = 17.3, dz = -11.2;
  const translate = (value, key = "") => {
    if (Array.isArray(value)) return value.map((item) => translate(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, translate(item, field)]));
    if (Number.isFinite(value) && ["xMin", "xMax", "x", "center"].includes(key)) return value + dx;
    if (Number.isFinite(value) && ["zMin", "zMax", "z", "arrivalZ", "outerPlaneZ"].includes(key)) return value + dz;
    return value;
  };
  const translated = buildAuditoriumLayout(translate(room));
  close(translated.centerX - layout.centerX, dx, `${room.id} horizontal room-local translation`);
  close(translated.rearWallZ - layout.rearWallZ, dz, `${room.id} rear wall room-local translation`);
  close(translated.entryCross.centerZ - layout.entryCross.centerZ, dz, `${room.id} entry room-local translation`);
  for (const row of layout.rows) {
    close(translated.rows[row.index].z - row.z, dz, `${room.id} row ${row.label} room-local translation`);
    close(translated.rows[row.index].elevation, row.elevation, `${room.id} translated row height`);
  }
  const storage = SERVICE_ROOMS.find((candidate) => candidate.id === `under-storage-${room.number}`);
  if (storage) {
    // The new lower front rows cannot cut through the existing storage roof.
    for (let x = Math.max(storage.bounds.xMin, layout.bowlBounds.xMin); x <= Math.min(storage.bounds.xMax, layout.bowlBounds.xMax); x += 0.19) {
      for (let z = Math.max(storage.bounds.zMin, layout.bowlBounds.zMin); z <= Math.min(storage.bounds.zMax, layout.bowlBounds.zMax); z += 0.07) {
        const floor = sampleBowlFloorCandidate(layout, x, z);
        const slabDepth = floor.kind === "stadium-stair" ? layout.halfStepRise + 0.09 : 0.11;
        assert.ok(floor.height - slabDepth >= storage.ceilingHeight - 1e-6,
          `${room.id}: seating slab intersects the storage roof at ${x},${z}`);
        storageSamples += 1;
      }
    }
  }
}

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
const collision = new AABBCollisionWorld({ bounds: world.worldBounds });
collision.addBoxes(world.colliders);
const dom = { ownerDocument: { defaultView: { addEventListener() {}, removeEventListener() {} },
  addEventListener() {}, removeEventListener() {}, getElementById() { return null; } },
  addEventListener() {}, removeEventListener() {} };
function walk(x, z, yaw, frames) {
  const player = new FirstPersonController({ camera: new THREE.PerspectiveCamera(), domElement: dom,
    collisionWorld: collision, spawn: [planToWorldX(x), 0, z], initialYaw: yaw,
    groundSampler: world.groundHeight, ceilingSampler: world.ceilingHeight, touchMode: false });
  assert.equal(collision.isOverlapping(player.position, 0.34, 0, 1.78), false, `Clear walk start at ${x},${z}`);
  player.active = true;
  player._keys.add("KeyW");
  let maximumStep = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const previousY = player.position.y;
    player.update(1 / 60);
    maximumStep = Math.max(maximumStep, player.position.y - previousY);
  }
  const result = { x: worldToPlanX(player.position.x), z: player.position.z, y: player.position.y, maximumStep };
  player.dispose();
  return result;
}
let stairWalks = 0;
const ray = new THREE.Raycaster();
function assertRenderedFloor(x, z, elevation, label) {
  ray.set(new THREE.Vector3(planToWorldX(x), elevation + 0.15, z), new THREE.Vector3(0, -1, 0));
  ray.near = 0.001;
  ray.far = 0.2;
  const hit = ray.intersectObject(world.root, true)[0];
  assert.ok(hit, `${label}: rendered floor missing below walkable surface`);
  close(hit.point.y, elevation, `${label}: physical floor agrees with sampler`, 0.0001);
}
for (const number of revisedNumbers) {
  const layout = world.auditoriumLayouts.get(`theater-${number}`);
  for (const x of [layout.centerX, ...Object.values(layout.sideAisles).map((aisle) => aisle.centerX)]) {
    assertRenderedFloor(x, layout.entryCross.centerZ, 0, `${layout.id} B/C crosswalk`);
  }
  for (const tread of layout.sideStairTreads) {
    assertRenderedFloor((tread.bounds.xMin + tread.bounds.xMax) / 2,
      (tread.bounds.zMin + tread.bounds.zMax) / 2, tread.elevation, tread.id);
  }
  for (const aisle of Object.values(layout.sideAisles)) {
    const end = walk(aisle.centerX, layout.rows[2].z + 0.4, 0, 400);
    close(end.y, layout.backElevation, `${layout.id} ${aisle.side}: walk C to H`, 0.001);
    assert.ok(end.z > layout.rearWallZ + 0.4 && end.z < layout.backRowZ,
      `${layout.id} ${aisle.side}: the close rear wall stops the player`);
    assert.ok(end.maximumStep <= 0.22 + 1e-6, `${layout.id}: no sudden inaccessible elevation jump`);
    stairWalks += 1;
  }
  const crossing = walk(layout.sideAisles.west.centerX, layout.entryCross.centerZ, Math.PI / 2, 300);
  assert.ok(crossing.x >= layout.sideAisles.east.centerX - 0.15, `${layout.id}: B/C crosswalk is blocked`);
  close(crossing.y, 0, `${layout.id}: crossing remains at ground level`);
  assert.ok(world.colliders.some((box) => box.id === `${layout.id}-close-rear-wall`), `${layout.id}: rear wall must collide`);
}
world.dispose();
materials.dispose();
console.log(`Seating valid: four A–H rooms · A/B/C ground level · four clear B/C crosswalks · ${stairWalks} complete stair climbs · close rear walls · ${storageSamples} storage-clearance samples · all 1,093 seats retained.`);
