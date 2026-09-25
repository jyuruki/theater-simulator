import assert from "node:assert/strict";
import * as THREE from "three";
import { AUDITORIUMS, SERVICE_ROOMS } from "../src/layout-data.js";
import {
  buildAuditoriumLayout,
  sampleBowlFloorCandidate,
  sampleSideStairHeight,
  sampleTierHeight,
  SEAT_BACK_RISER_OFFSET,
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
    if (room.entry.type === "trash-cubby") {
      const cubbyFront = room.entry.cubbyBounds?.zMin ?? room.bounds.zMax - room.entry.cubbyDepth;
      const actualGap = cubbyFront - 0.09 - (layout.backRowZ + 0.39);
      close(actualGap, layout.rearEntryClearance.original * 2, `${room.id} doubled rear entry clearance`);
      close(layout.rowPitch, layout.preset.rowPitch, `${room.id} preserved row pitch`);
      close(layout.frontRowZ, room.bounds.zMin + room.stadium.screenApronDepth, `${room.id} original screen apron retained`);
      close(layout.rearEntryClearance.seatBankShift, 0, `${room.id} seat bank stays fixed`);
      assert.ok(room.entry.innerDoorCenter - 1.025 >= cubbyFront + 0.2 - 1e-6,
        `${room.id} inner door front jamb fits inside the shallower cubby`);
      assert.ok(room.entry.innerDoorCenter + 1.025 <= room.bounds.zMax - 0.2 + 1e-6,
        `${room.id} inner door rear jamb fits inside the shallower cubby`);
      assert.ok(layout.rows[0].floorBounds.zMin >= room.bounds.zMin + 0.1, `${room.id} front tier still fits behind screen wall`);
    } else {
      assert.equal(layout.rearEntryClearance, null, `${room.id}: front-entry rooms retain their existing rows`);
    }
    continue;
  }
  assert.equal(layout.rows.map((row) => row.label).join(""), "ABCDEFGH");
  for (const row of layout.rows.slice(0, 3)) close(row.elevation, (row.index - 2) * 0.44, `${room.id} distinct lowered row ${row.label}`);
  for (const row of layout.rows.slice(3)) close(row.elevation, (row.index - 2) * 0.66, `${room.id} row ${row.label} rise`);
  close(Math.abs(layout.rows[2].z - layout.rows[1].z), layout.rowPitch + 1.3, `${room.id} B/C separation`);
  close(Math.abs(layout.rows[0].z - layout.rows[1].z), layout.rowPitch, `${room.id} A/B separation`);
  close(layout.entryCross.centerZ, (layout.rows[1].z + layout.rows[2].z) / 2, `${room.id} arrival between B/C`);
  close(layout.entryCross.bounds.zMax - layout.entryCross.bounds.zMin, 1.3, `${room.id} clear crosswalk floor`);
  assert.ok(layout.entryCross.bounds.zMin > layout.rows[2].z + 0.39 + 0.34,
    `${room.id}: crosswalk must clear row C and a player's radius`);
  assert.ok(layout.entryCross.bounds.zMax < layout.rows[1].z - 0.39 - 0.34,
    `${room.id}: crosswalk must clear row B and a player's radius`);
  close(layout.rows[1].floorBounds.zMin, layout.entryCross.floorBounds.zMax + 0.08, `${room.id} B riser closes the edge below the crosswalk`);
  close(layout.rows[2].floorBounds.zMax, layout.entryCross.floorBounds.zMin, `${room.id} C floor joins crosswalk`);
  assert.equal(layout.sideStairTreads.length, 38, `${room.id}: two front drops and five upper rises need complete side stairs`);
  for (const tread of layout.sideStairTreads) {
    close(tread.stepRise, 0.22, `${room.id} safe individual step rise`);
    const z = (tread.bounds.zMin + tread.bounds.zMax) / 2;
    close(sampleSideStairHeight(layout, z), tread.elevation, `${tread.id} renderer/sampler agreement`);
  }
  for (let z = layout.rows[2].z; z <= layout.entryCross.bounds.zMax; z += 0.07) {
    close(sampleTierHeight(layout, z), 0, `${room.id} C/crosswalk stays at ground level`);
    close(sampleSideStairHeight(layout, z), 0, `${room.id} C/crosswalk aisle stays level`);
  }
  for (const row of layout.rows.slice(0, 2)) close(sampleTierHeight(layout, row.z), row.elevation, `${room.id} lowered ${row.label} ground sampler`);
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
function walk(x, z, yaw, frames, feetY = 0, stopX = Infinity) {
  const player = new FirstPersonController({ camera: new THREE.PerspectiveCamera(), domElement: dom,
    collisionWorld: collision, spawn: [planToWorldX(x), feetY, z], initialYaw: yaw,
    groundSampler: world.groundHeight, ceilingSampler: world.ceilingHeight, touchMode: false });
  assert.equal(collision.isOverlapping(player.position, 0.34, feetY, 1.78), false, `Clear walk start at ${x},${z}`);
  player.active = true;
  player._keys.add("KeyW");
  let maximumStep = 0;
  let maximumDrop = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const previousY = player.position.y;
    player.update(1 / 60);
    maximumStep = Math.max(maximumStep, player.position.y - previousY);
    maximumDrop = Math.max(maximumDrop, previousY - player.position.y);
    if (worldToPlanX(player.position.x) >= stopX) break;
  }
  const result = { x: worldToPlanX(player.position.x), z: player.position.z, y: player.position.y, maximumStep, maximumDrop };
  player.dispose();
  return result;
}
let stairWalks = 0;
let rowPassageSamples = 0;
const ray = new THREE.Raycaster();
function assertRenderedFloor(x, z, elevation, label) {
  ray.set(new THREE.Vector3(planToWorldX(x), elevation + 0.15, z), new THREE.Vector3(0, -1, 0));
  ray.near = 0.001;
  ray.far = 0.2;
  const hit = ray.intersectObject(world.root, true).find(hit => Math.abs(hit.point.y - elevation) < .001);
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
  const routeOnEast = layout.routeReserve.side === "east";
  const borderX = routeOnEast ? layout.bowlBounds.xMax : layout.bowlBounds.xMin;
  const dropFace = world.colliders.find((box) => box.id === `${layout.id}-front-bank-drop-face`);
  close(dropFace.maxY, layout.entryCross.elevation - 0.11,
    `${layout.id}: side closure meets the route slab underside without a coplanar ground-step overlap`);
  for (const row of layout.rows.slice(0, 2)) {
    ray.set(new THREE.Vector3(planToWorldX(borderX + (routeOnEast ? -0.25 : 0.25)), row.elevation / 2, row.z),
      new THREE.Vector3(routeOnEast ? -1 : 1, 0, 0));
    ray.near = 0.001;
    ray.far = 0.4;
    assert.ok(ray.intersectObject(world.root, true).length,
      `${layout.id} lowered row ${row.label}: raised side-route edge must not expose the outside void`);
  }
  for (const aisle of Object.values(layout.sideAisles)) {
    const descent = walk(aisle.centerX, layout.entryCross.centerZ, Math.PI, 170);
    close(descent.y, layout.frontElevation, `${layout.id} ${aisle.side}: descend C through B to A`, 0.001);
    assert.ok(descent.maximumDrop <= 0.22 + 1e-6, `${layout.id}: lowered front bank must have steps rather than sudden drops`);
    const end = walk(aisle.centerX, layout.rows[0].z + 0.2, 0, 460, layout.frontElevation);
    close(end.y, layout.backElevation, `${layout.id} ${aisle.side}: walk A to H`, 0.001);
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
for (const room of AUDITORIUMS) {
  const layout = world.auditoriumLayouts.get(room.id);
  for (let index = 1; index < layout.rows.length; index++) {
    const row = layout.rows[index], previous = layout.rows[index - 1];
    close((layout.tierRisers[index - 1].z - previous.z) * layout.direction, SEAT_BACK_RISER_OFFSET,
      `${room.id} row ${previous.label}: riser meets the seat back`);
    // Sample the whole useful passage depth, not just its midpoint. A midpoint
    // alone missed the two competing levels in the v22 row aisle.
    const available = Math.abs(row.z - previous.z);
    for (let distance = .8; distance <= available - .8; distance += .07) {
      const z = previous.z + layout.direction * distance;
      for (const x of [layout.centerX, ...Object.values(layout.sideAisles).map(aisle => aisle.centerX)]) {
        close(world.groundHeight(planToWorldX(x), z, row.elevation), row.elevation,
          `${room.id} row ${row.label} aisle has a single walking level`);
        assertRenderedFloor(x, z, row.elevation, `${room.id} row ${row.label} passage`);
        rowPassageSamples++;
      }
    }
    const walkZ = (row.z + previous.z) / 2;
    const passage = walk(layout.sideAisles.west.centerX, walkZ, Math.PI / 2, 420, row.elevation, layout.sideAisles.east.centerX);
    assert.ok(passage.x >= layout.sideAisles.east.centerX - .15, `${room.id} row ${row.label}: cross-row cleaning passage blocked`);
    close(passage.maximumStep, 0, `${room.id} row ${row.label}: no sideways step while crossing`);
    close(passage.maximumDrop, 0, `${room.id} row ${row.label}: no sideways drop while crossing`);
  }
  if (layout.rearEntryClearance) {
    const rearWalkZ = layout.backRowZ + 0.39 + layout.rearEntryClearance.current / 2;
    const crossing = walk(layout.sideAisles.west.centerX, rearWalkZ, Math.PI / 2, 210);
    assert.ok(crossing.x >= layout.sideAisles.east.centerX - 0.15, `${room.id}: widened rear entry must allow a full cross-aisle walk`);
    close(crossing.y, 0, `${room.id}: widened rear entry stays at hall level`);
    const fromHall = walk(room.entry.center, room.bounds.zMax + 0.7, 0, 35);
    assert.ok(fromHall.z < room.bounds.zMax - 0.5, `${room.id}: fixed outer door still admits the player`);
    const halfWidth = room.entry.cubbyHalfWidth ?? 1.6;
    const cubby = room.entry.cubbyBounds ?? { xMin: room.entry.center - halfWidth, xMax: room.entry.center + halfWidth };
    const exitsEast = room.entry.turnSide === "east";
    const doorX = exitsEast ? cubby.xMax : cubby.xMin;
    const throughSide = walk(doorX + (exitsEast ? -0.65 : 0.65), room.entry.innerDoorCenter,
      exitsEast ? Math.PI / 2 : -Math.PI / 2, 45);
    assert.ok(exitsEast ? throughSide.x > doorX + 0.4 : throughSide.x < doorX - 0.4,
      `${room.id}: recentered cubby side door must admit the player`);
  }
  const screen = world.root.getObjectByName(`${room.id}-screen`);
  const bowlWidth = layout.bowlBounds.xMax - layout.bowlBounds.xMin;
  const ceilingY = layout.presentation.ceilingY;
  assert.ok(screen.scale.x > bowlWidth * 0.9, `${room.id} screen should fill the unobstructed bowl width`);
  close(screen.scale.x / screen.scale.y, 1.6, `${room.id} screen keeps the presentation aspect ratio`);
  close(screen.position.x, planToWorldX(layout.presentation.screen.centerX), `${room.id} screen centered in its unobstructed front-wall area`);
  assert.ok(screen.position.y + screen.scale.y / 2 + 0.17 < ceilingY - 0.05, `${room.id} screen frame clears roof`);
  assert.ok(screen.position.y - screen.scale.y / 2 - 0.17 >= layout.frontElevation - 1e-6, `${room.id} screen frame clears front floor`);
  close(screen.position.y - screen.scale.y / 2 - layout.frontElevation, 1.8, `${room.id} screen bottom is person-height above front floor`);
}
world.dispose();
materials.dispose();
console.log(`Seating valid: ${rowPassageSamples} rendered single-level row-passage samples and complete cross-row walks · A/B separately lowered, C at ground · eight rear-entry routes · 14 raised screens · ${stairWalks} complete A–H stair climbs · ${storageSamples} storage-clearance samples · all 1,093 seats retained.`);
