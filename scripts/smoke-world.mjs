import assert from "node:assert/strict";

class FakeCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    const gradient = { addColorStop() {} };
    const context = {
      canvas: this,
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      measureText: (text) => ({ width: String(text).length * 12 }),
    };
    return new Proxy(context, {
      get(target, property) {
        if (property in target) return target[property];
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    });
  }
}

globalThis.OffscreenCanvas = FakeCanvas;

const THREE = await import("three");
const { planToWorldBounds, planToWorldX } = await import("../src/coordinates.js");
const {
  AUDITORIUMS,
  COURTYARD_PLAN,
  EQUIPMENT_ANCHORS,
  FOUNTAIN_PLAN,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  TICKET_APPROACH_PLAN,
} = await import("../src/layout-data.js");
const { createMaterialLibrary } = await import("../src/materials.js");
const { createMinimap } = await import("../src/minimap.js");
const { createTheaterWorld } = await import("../src/world.js");

const authoredBoxes = [];
const originalAdd = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function captureAuthoredBoxes(...objects) {
  for (const object of objects) {
    if (!object?.isMesh || object.geometry?.type !== "BoxGeometry") continue;
    authoredBoxes.push({
      id: object.name,
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      width: object.scale.x,
      height: object.scale.y,
      depth: object.scale.z,
      materialNames: (Array.isArray(object.material) ? object.material : [object.material]).map(({ name }) => name),
    });
  }
  return originalAdd.apply(this, objects);
};

function assertNear(actual, expected, message, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

function boxById(id) {
  const matches = authoredBoxes.filter((box) => box.id === id);
  assert.equal(matches.length, 1, `${id} must be authored exactly once.`);
  return matches[0];
}

function assertBoxMatchesBounds(id, bounds, message = id) {
  const box = boxById(id);
  assertNear(box.x, planToWorldX((bounds.xMin + bounds.xMax) / 2), `${message} center X`);
  assertNear(box.z, (bounds.zMin + bounds.zMax) / 2, `${message} center Z`);
  assertNear(box.width, bounds.xMax - bounds.xMin, `${message} width`);
  assertNear(box.depth, bounds.zMax - bounds.zMin, `${message} depth`);
  return box;
}

function colliderIdsMatching(world, pattern) {
  return world.colliders.map(({ id }) => id).filter((id) => pattern.test(id));
}

const rendererStub = { capabilities: { getMaxAnisotropy: () => 4 } };
const materials = createMaterialLibrary(rendererStub);
const scene = new THREE.Scene();
let world;
try {
  world = createTheaterWorld({ scene, materials });
} finally {
  THREE.Object3D.prototype.add = originalAdd;
}

assert.equal(world.stats.auditoriumCount, 14);
assert.equal(world.stats.seatCount, 1093);
assert.equal(world.stats.equipmentAnchors, 13);
assert.equal(world.stats.layoutVersion, "mililani-sketch-v8");
assert.ok(world.stats.meshCount > 0);
assert.ok(world.stats.colliderCount > 0);
assert.equal(world.auditoriumGroups.size, 14);
assert.equal(world.auditoriumLayouts.size, 14);

const t1 = world.auditoriumLayouts.get("theater-1");
const t1FrontHeight = world.groundHeight(planToWorldX(t1.sideAisles.west.centerX), t1.frontRowZ, 0);
const t1RearHeight = world.groundHeight(planToWorldX(t1.sideAisles.west.centerX), t1.backRowZ, 0);
assert.equal(t1FrontHeight, t1.frontElevation);
assert.equal(t1RearHeight, 0);

const t3 = world.auditoriumLayouts.get("theater-3");
const t3Ramp = t3.auditorium.entry.ramp.bounds;
const t3RampHeight = world.groundHeight(
  planToWorldX((t3Ramp.xMin + t3Ramp.xMax) / 2),
  (t3Ramp.zMin + t3Ramp.zMax) / 2,
  0,
);
assert.ok(Math.abs(t3RampHeight - 0.12) < 0.001);

const serviceById = new Map(SERVICE_ROOMS.map((room) => [room.id, room]));
const publicById = new Map(PUBLIC_SPACES.map((room) => [room.id, room]));
const auditoriumByNumber = new Map(AUDITORIUMS.map((auditorium) => [auditorium.number, auditorium]));

const t3Storage = serviceById.get("under-storage-3");
const theater3 = auditoriumByNumber.get(3);
assert.deepEqual(theater3.bounds, { xMin: -24.2, xMax: -6.7, zMin: 72, zMax: 99 });
assert.deepEqual(theater3.entry.routeBounds, { xMin: -6.7, xMax: -4.3, zMin: 68.2, zMax: 95.3 });
assert.deepEqual(theater3.entry.ramp.bounds, { xMin: -6.7, xMax: -4.3, zMin: 82.5, zMax: 94.5 });
assert.deepEqual(theater3.entry.usherNookBounds, { xMin: -9.9, xMax: -6.7, zMin: 68.2, zMax: 72 });
assert.deepEqual(t3Storage.bounds, { xMin: -21.5, xMax: -9.9, zMin: 72, zMax: 82.5 });
assert.deepEqual(t3Storage.accessHall, { xMin: -21.5, xMax: -9.9, zMin: 68.2, zMax: 72 });
assert.deepEqual(t3Storage.doorCenters, [-18.6, -12.3]);
assert.equal("entranceStemBounds" in theater3.entry, false);
assert.equal("entranceLateralBounds" in theater3.entry, false);
assert.deepEqual(
  authoredBoxes.filter(({ id }) => /^theater-3-entrance-(?:stem|lateral)/.test(id)).map(({ id }) => id),
  [],
  "T3 must not render a connector back to its former position.",
);
assert.deepEqual(
  colliderIdsMatching(world, /^theater-3-entrance-(?:stem|lateral)/),
  [],
  "T3 must not collide against a connector back to its former position.",
);
assertBoxMatchesBounds("theater-3-ceiling", theater3.bounds, "translated T3 auditorium ceiling");
assertBoxMatchesBounds("theater-3-route-ceiling", theater3.entry.routeBounds, "direct T3 route ceiling");
assertBoxMatchesBounds(
  "theater-3-route-flat-floor",
  { ...theater3.entry.routeBounds, zMax: theater3.entry.ramp.bounds.zMin },
  "direct T3 flat route",
);
assertBoxMatchesBounds(
  "theater-3-route-arrival-floor",
  { ...theater3.entry.routeBounds, zMin: theater3.entry.ramp.bounds.zMax },
  "translated T3 route arrival",
);
assertBoxMatchesBounds("theater-3-usher-nook-floor", theater3.entry.usherNookBounds, "translated T3 usher nook floor");
assertBoxMatchesBounds("theater-3-usher-nook-ceiling", theater3.entry.usherNookBounds, "translated T3 usher nook ceiling");
assertBoxMatchesBounds("under-storage-3-floor", t3Storage.bounds, "translated T3 storage floor");
assertBoxMatchesBounds("under-storage-3-roof-ceiling", t3Storage.bounds, "translated T3 storage roof");
assertBoxMatchesBounds("under-storage-3-anteroom-floor", t3Storage.accessHall, "translated T3 anteroom floor");
assertBoxMatchesBounds("under-storage-3-anteroom-ceiling", t3Storage.accessHall, "translated T3 anteroom ceiling");
assertNear(boxById("theater-3-east-wall-north-cap").x, planToWorldX(theater3.bounds.xMax), "translated T3 east wall X");
assert.equal(colliderIdsMatching(world, /^under-storage-3-anteroom-east-header-\d+$/).length, 1, "T3 anteroom needs one nook-side door.");
assert.equal(colliderIdsMatching(world, /^under-storage-3-south-header-\d+$/).length, 2, "T3 under-tier room needs two south doors.");
assertNear(
  world.ceilingHeight(
    planToWorldX((t3Storage.accessHall.xMin + t3Storage.accessHall.xMax) / 2),
    (t3Storage.accessHall.zMin + t3Storage.accessHall.zMax) / 2,
    0,
  ),
  t3Storage.ceilingHeight - 0.1,
  "T3 anteroom ceiling sampler",
);

const fixtureExpectations = [
  [/^boys-restroom-stall-bank-\d+-door-\d+$/, 9, "boys stalls"],
  [/^boys-restroom-urinal-\d+-\d+$/, 6, "boys urinals"],
  [/^boys-restroom-sink-\d+-\d+$/, 1, "boys sinks"],
  [/^girls-restroom-stall-bank-\d+-door-\d+$/, 14, "girls stalls"],
  [/^girls-restroom-sink-\d+-\d+$/, 3, "girls sinks"],
  [/^girls-restroom-urinal-\d+-\d+$/, 0, "girls urinals"],
];
for (const [pattern, expected, label] of fixtureExpectations) {
  assert.equal(colliderIdsMatching(world, pattern).length, expected, `Runtime ${label} must match the V8 fixture plan.`);
}

const boys = serviceById.get("boys-restroom");
const boysFountainNook = publicById.get("boys-fountain-alcove");
const boysMenCubby = publicById.get("boys-men-entry-cubby");
assert.deepEqual(boys.bounds, { xMin: -21.5, xMax: -6.7, zMin: 62.2, zMax: 68.2 });
assert.deepEqual(boys.footprintRects, [
  { xMin: -21.5, xMax: -6.7, zMin: 64.7, zMax: 68.2 },
  { xMin: -9.35, xMax: -6.7, zMin: 62.2, zMax: 64.7 },
]);
assert.deepEqual(boys.entry, { side: "west", coordinate: -9.35, center: 63.45, width: 1.9 });
assert.deepEqual(boysFountainNook.bounds, { xMin: -13.5, xMax: -10.85, zMin: 62.2, zMax: 64.7 });
assert.deepEqual(boysMenCubby.bounds, { xMin: -10.85, xMax: -9.35, zMin: 62.2, zMax: 64.7 });
assertBoxMatchesBounds("boys-restroom-section-0-floor", boys.footprintRects[0], "boys main-room floor");
assertBoxMatchesBounds("boys-restroom-section-0-ceiling", boys.footprintRects[0], "boys main-room ceiling");
assertBoxMatchesBounds("boys-restroom-section-1-floor", boys.footprintRects[1], "boys entry-lobe floor");
assertBoxMatchesBounds("boys-restroom-section-1-ceiling", boys.footprintRects[1], "boys entry-lobe ceiling");
assertBoxMatchesBounds("boys-fountain-alcove-floor", boysFountainNook.bounds, "H2O nook floor");
assertBoxMatchesBounds("boys-fountain-alcove-ceiling", boysFountainNook.bounds, "H2O nook ceiling");
assertBoxMatchesBounds("boys-men-entry-cubby-floor", boysMenCubby.bounds, "recessed MEN cubby floor");
assertBoxMatchesBounds("boys-men-entry-cubby-ceiling", boysMenCubby.bounds, "recessed MEN cubby ceiling");
const sharedWall = boxById("boys-t3-shared-back-wall");
assertNear(sharedWall.x, planToWorldX((-21.5 + -6.7) / 2), "boys/T3 shared wall center X");
assertNear(sharedWall.z, 68.2, "boys/T3 shared wall Z");
assertNear(sharedWall.width, 14.8, "boys/T3 shared wall width");
assertNear(sharedWall.depth, 0.18, "boys/T3 shared wall thickness");
assert.equal(colliderIdsMatching(world, /^boys-t3-shared-back-wall$/).length, 1, "The boys/T3 boundary must have exactly one collider.");
assert.equal(sharedWall.materialNames.length, 6, "The shared wall needs per-face finishes.");
assert.equal(sharedWall.materialNames[4], materials.darkWall.name, "The shared wall's +Z storage face must use the dark finish.");
assert.equal(sharedWall.materialNames[5], materials.wall.name, "The shared wall's -Z bathroom face must use the warm finish.");
const menCubbyHeader = boxById("boys-men-cubby-mouth-header-0");
assertNear(menCubbyHeader.x, planToWorldX((boysMenCubby.bounds.xMin + boysMenCubby.bounds.xMax) / 2), "MEN cubby header center X");
assertNear(menCubbyHeader.width, boysMenCubby.bounds.xMax - boysMenCubby.bounds.xMin, "MEN cubby opening width");
const menCubbyWestWall = boxById("boys-entry-cubby-west");
assertNear(menCubbyWestWall.x, planToWorldX(boysMenCubby.bounds.xMin), "MEN cubby recessed wall X");
assertNear(menCubbyWestWall.z, (boysMenCubby.bounds.zMin + boysMenCubby.bounds.zMax) / 2, "MEN cubby recessed wall center Z");
assertNear(menCubbyWestWall.depth, boysMenCubby.bounds.zMax - boysMenCubby.bounds.zMin, "MEN cubby recessed wall depth");
const menSign = scene.getObjectByName("boys-men-sign");
assert.ok(menSign, "The recessed cubby needs a dedicated MEN sign.");
assertNear(menSign.position.x, planToWorldX((boysMenCubby.bounds.xMin + boysMenCubby.bounds.xMax) / 2), "MEN sign center X");
assertNear(menSign.position.y, 2.95, "MEN sign height");
assertNear(menSign.position.z, boysMenCubby.bounds.zMin - 0.13, "MEN sign setback");
assert.equal(scene.getObjectByName("boys-restroom-sign"), undefined, "The old generic restroom sign must not replace the dedicated MEN sign.");
assert.deepEqual(
  EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").map(({ id, position, rotation }) => ({ id, position, rotation })),
  [
    { id: "boys-water-fountain-1", position: [-13.24, 0, 63.03], rotation: -Math.PI / 2 },
    { id: "boys-water-fountain-2", position: [-13.24, 0, 63.83], rotation: -Math.PI / 2 },
  ],
  "Runtime fountain anchors must remain in the H2O nook and face its mounting wall.",
);
for (const id of ["boys-water-fountain-1", "boys-water-fountain-2"]) {
  const equipment = world.equipment.get(id);
  const anchor = EQUIPMENT_ANCHORS.find((candidate) => candidate.id === id);
  assert.ok(equipment, `${id} must be authored at runtime.`);
  assertNear(equipment.worldPosition.x, planToWorldX(anchor.position[0]), `${id} world X`);
  assertNear(equipment.worldPosition.z, anchor.position[2], `${id} world Z`);
}

const girls = serviceById.get("girls-restroom");
const [girlsNorthStalls, girlsSouthStalls] = girls.fixtures.stalls;
assert.deepEqual(
  [girlsNorthStalls.start, girlsNorthStalls.end, girlsSouthStalls.start, girlsSouthStalls.end],
  [68, 77, 68, 77],
);
for (let edge = 0; edge <= 6; edge += 1) {
  const expectedPlanX = 68 + edge * 1.5;
  const northPartition = boxById(`girls-restroom-stall-bank-0-partition-${edge}`);
  const southPartition = boxById(`girls-restroom-stall-bank-1-partition-${edge}`);
  assertNear(northPartition.x, planToWorldX(expectedPlanX), `girls north partition ${edge} X`);
  assertNear(southPartition.x, planToWorldX(expectedPlanX), `girls south partition ${edge} X`);
  assertNear(northPartition.x, southPartition.x, `girls partition pair ${edge} alignment`);
}

const theater9 = auditoriumByNumber.get(9);
const theater9Layout = world.auditoriumLayouts.get("theater-9");
const theater9Cubby = {
  xMin: theater9.entry.center - (theater9.entry.cubbyHalfWidth ?? 1.6),
  xMax: theater9.entry.center + (theater9.entry.cubbyHalfWidth ?? 1.6),
  zMin: theater9.bounds.zMax - theater9.entry.cubbyDepth,
  zMax: theater9.bounds.zMax,
};
assert.deepEqual(theater9.bounds, { xMin: 125, xMax: 135.5, zMin: 44.5, zMax: 58 });
assert.deepEqual(
  { center: theater9.entry.center, turnSide: theater9.entry.turnSide, cubby: theater9Cubby },
  { center: 128.1, turnSide: "east", cubby: { xMin: 126.5, xMax: 129.7, zMin: 54.6, zMax: 58 } },
);
const t9InnerHeader = boxById("theater-9-cubby-east-header-0");
assertNear(t9InnerHeader.x, planToWorldX(theater9Cubby.xMax), "T9 inner door physical-left X");
assertNear(t9InnerHeader.z, theater9.entry.innerDoorCenter, "T9 inner door Z");
assert.equal(colliderIdsMatching(world, /^theater-9-cubby-east-header-0$/).length, 1, "T9 needs one inner door in the cubby's plan-east/physical-left wall.");
assert.deepEqual(colliderIdsMatching(world, /^theater-9-cubby-west-header-/), [], "T9 must not put its inner door on the physical-right side.");
const t9OuterThreshold = boxById("theater-9-outer-threshold");
const t9InnerThreshold = boxById("theater-9-inner-threshold");
assertNear(t9OuterThreshold.x, planToWorldX(128.1), "T9 outer-door center X");
assertNear(t9OuterThreshold.z, theater9.bounds.zMax, "T9 outer-door plane");
assertNear(t9InnerThreshold.x, planToWorldX(129.7), "T9 inner-door center X");
assertNear(t9InnerThreshold.z, theater9.entry.innerDoorCenter, "T9 inner-door center Z");
assert.ok(t9InnerThreshold.x < t9OuterThreshold.x, "After plan reflection, T9's inner entrance must appear left of the cubby in first person.");
assert.ok(planToWorldX(theater9.bounds.xMax) < t9InnerThreshold.x, "The T9 bowl must continue physically left beyond its inner entrance.");
assertBoxMatchesBounds("theater-9-ceiling", theater9.bounds, "fixed T9 auditorium ceiling");
assert.equal(
  world.groundHeight(planToWorldX(theater9Cubby.xMax - 0.25), theater9.entry.innerDoorCenter, 0),
  theater9Layout.backElevation,
  "T9 cubby and rear landing must share one continuous level.",
);
assert.deepEqual(
  authoredBoxes.filter(({ id }) => id === "theater-9-cubby-floor"),
  [],
  "T9 must not regain a coplanar cubby floor that flickers against the rear landing.",
);

assert.deepEqual(
  colliderIdsMatching(world, /^(?:poster|empty)-alcove-(?:north|south|east|west)$/).sort(),
  ["poster-alcove-south", "poster-alcove-west", "empty-alcove-south", "empty-alcove-east"].sort(),
  "Each ticket nook must be an open two-wall L that connects into the main hall.",
);

assert.deepEqual(
  colliderIdsMatching(world, /^girls-restroom-(?:connector-(?:south|north)|entry-lobe-(?:south|north|east))$/).sort(),
  ["girls-restroom-connector-south", "girls-restroom-entry-lobe-east", "girls-restroom-entry-lobe-north"].sort(),
  "Girls restroom must force the drawn south-then-left privacy route.",
);
assert.equal(
  colliderIdsMatching(world, /^girls-restroom-entry-lobe-west-header-\d+$/).length,
  1,
  "Girls entry needs exactly one west privacy door.",
);
assert.equal(
  authoredBoxes.some(({ id }) => id.startsWith("girls-restroom-forecourt")),
  false,
  "Girls restroom must not regain the fake west forecourt.",
);

const candyHeaders = colliderIdsMatching(world, /^candy-storage-(?:south|north|west|east)-header-\d+$/);
assert.deepEqual(candyHeaders, ["candy-storage-south-header-0"], "Candy storage must have one south hall door and no exit door.");

const rearCounter = world.colliders.find(({ id }) => id === "soda-rear-counter");
assert.ok(rearCounter, "Rear fountain counter needs a physical collider.");
const rearWorldBounds = planToWorldBounds(FOUNTAIN_PLAN.rearCounter);
assertNear(rearCounter.minX, rearWorldBounds.xMin, "Rear fountain counter world xMin");
assertNear(rearCounter.maxX, rearWorldBounds.xMax, "Rear fountain counter world xMax");
assertNear(rearCounter.minZ, FOUNTAIN_PLAN.rearCounter.zMin, "Rear fountain counter zMin");
assertNear(rearCounter.maxZ, COURTYARD_PLAN.backWallZ, "Rear fountain counter must finish flush with the courtyard wall");

const partition = COURTYARD_PLAN.waistPartition;
const partitionMesh = boxById("theater-3-task-waist-partition");
assertNear(partitionMesh.x, planToWorldX(partition.x), "T3/task partition x");
assertNear(partitionMesh.y, partition.height / 2, "T3/task partition y");
assertNear(partitionMesh.z, (partition.zMin + partition.zMax) / 2, "T3/task partition z");
assertNear(partitionMesh.width, partition.thickness, "T3/task partition thickness");
assertNear(partitionMesh.height, partition.height, "T3/task partition height");
assertNear(partitionMesh.depth, partition.zMax - partition.zMin, "T3/task partition depth");
assert.equal(colliderIdsMatching(world, /^theater-3-task-waist-partition$/).length, 1);

const approachFloor = boxById("lobby-approach-floor");
assertNear(approachFloor.width, TICKET_APPROACH_PLAN.bounds.xMax - TICKET_APPROACH_PLAN.bounds.xMin, "Narrow approach rendered width");
assertNear(approachFloor.depth, TICKET_APPROACH_PLAN.bounds.zMax - TICKET_APPROACH_PLAN.bounds.zMin, "Narrow approach rendered depth");
for (const [id, bounds] of [
  ["ticket-poster-alcove-floor", TICKET_APPROACH_PLAN.posterAlcove],
  ["ticket-empty-alcove-floor", TICKET_APPROACH_PLAN.emptyAlcove],
]) {
  const floor = boxById(id);
  assertNear(floor.width, bounds.xMax - bounds.xMin, `${id} width`);
  assertNear(floor.depth, bounds.zMax - bounds.zMin, `${id} depth`);
}

for (const number of [7, 8]) {
  const nookBounds = auditoriumByNumber.get(number).entry.usherNookBounds;
  const floor = boxById(`theater-${number}-usher-nook-floor`);
  assertNear(floor.width, nookBounds.xMax - nookBounds.xMin, `T${number} usher-nook width`);
  assertNear(floor.depth, nookBounds.zMax - nookBounds.zMin, `T${number} usher-nook depth`);
  boxById(`theater-${number}-usher-nook-ceiling`);
}

const theater6 = auditoriumByNumber.get(6);
const theater6Layout = world.auditoriumLayouts.get("theater-6");
const t6Storage = serviceById.get("under-storage-6");
assert.deepEqual(theater6.bounds, { xMin: 29.7, xMax: 47.2, zMin: 62.2, zMax: 89.2 });
assert.deepEqual(theater6.entry.vestibuleBounds, { xMin: 29.7, xMax: 32.55, zMin: 62.2, zMax: 65.5 });
assert.deepEqual(theater6.entry.transverseBounds, { xMin: 29.7, xMax: 47.2, zMin: 65.5, zMax: 68.5 });
assert.deepEqual(theater6.entry.longRouteBounds, { xMin: 44.7, xMax: 47.2, zMin: 68.5, zMax: 85.5 });
assert.deepEqual(t6Storage.bounds, { xMin: 31.7, xMax: 44.7, zMin: 68.5, zMax: 71.8 });
assert.deepEqual(t6Storage.doorCenters, [35.2, 41.7]);
assertBoxMatchesBounds("theater-6-ceiling", theater6.bounds, "translated T6 auditorium ceiling");
assertBoxMatchesBounds("under-storage-6-floor", t6Storage.bounds, "translated T6 storage floor");
assertBoxMatchesBounds("under-storage-6-roof-ceiling", t6Storage.bounds, "translated T6 storage roof");
const expectedT6Underside = t6Storage.ceilingHeight - 0.1;
const stairLeaf = boxById("future-upstairs-stair-closed-leaf");
assertNear(stairLeaf.x, planToWorldX(27.5), "future stair door x");
assertNear(stairLeaf.z, 62.2, "future stair door z");
const t6DoorSegments = world.colliders
  .filter(({ id }) => /^theater-6-south-wall-segment-(?:0|last)$/.test(id))
  .sort((first, second) => first.minX - second.minX);
assert.equal(t6DoorSegments.length, 2, "T6 hall door needs two wall jamb segments.");
assertNear((t6DoorSegments[0].maxX + t6DoorSegments[1].minX) / 2, planToWorldX(31.2), "T6 door x");
assertNear((t6DoorSegments[0].minZ + t6DoorSegments[0].maxZ) / 2, 62.2, "T6 door z");
assert.equal(theater6Layout.routeReserve.bounds.xMin, theater6.entry.longRouteBounds.xMin, "T6 route reserve must meet the low long hall without a seam.");
assert.equal(theater6Layout.routeReserve.bounds.xMax, theater6.entry.longRouteBounds.xMax, "T6 route reserve must match the low long-hall width.");
const t6LowRoofRegions = [
  ["theater-6-vestibule-ceiling", theater6.entry.vestibuleBounds],
  ["theater-6-transverse-ceiling", theater6.entry.transverseBounds],
  ["theater-6-long-ceiling", theater6.entry.longRouteBounds],
];
for (const [id, bounds] of t6LowRoofRegions) {
  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerZ = (bounds.zMin + bounds.zMax) / 2;
  assertNear(world.ceilingHeight(planToWorldX(centerX), centerZ, 0), expectedT6Underside, `${id} sampler underside`);
  const roof = boxById(id);
  assertNear(roof.x, planToWorldX(centerX), `${id} center X`);
  assertNear(roof.z, centerZ, `${id} center Z`);
  assertNear(roof.width, bounds.xMax - bounds.xMin, `${id} width`);
  assertNear(roof.depth, bounds.zMax - bounds.zMin, `${id} depth`);
  assertNear(roof.y - roof.height / 2, expectedT6Underside, `${id} rendered underside`);
  assertBoxMatchesBounds(id.replace(/-ceiling$/, "-floor"), bounds, `${id} matching floor`);
}
const transverseCenterX = (theater6.entry.transverseBounds.xMin + theater6.entry.transverseBounds.xMax) / 2;
const longCenterX = (theater6.entry.longRouteBounds.xMin + theater6.entry.longRouteBounds.xMax) / 2;
for (const [id, expectedPlanX] of [
  ["theater-6-route-light-a", transverseCenterX],
  ["theater-6-route-light-b", longCenterX],
  ["theater-6-route-light-c", longCenterX],
]) {
  const light = boxById(id);
  assertNear(light.x, planToWorldX(expectedPlanX), `${id} translated X`);
  assert.ok(light.y + light.height / 2 < expectedT6Underside, `${id} must mount below the low roof.`);
}
assert.equal(world.ceilingHeight(planToWorldX(theater6.entry.longRouteBounds.xMin - 0.1), 84, 0), null, "T6 sampler must end at the translated long-route side wall.");
assert.equal(world.ceilingHeight(planToWorldX(longCenterX), theater6.entry.longRouteBounds.zMax + 0.1, 0), null, "T6 sampler must end at the translated long-route arrival.");
assert.equal(world.ceilingHeight(planToWorldX(65), 60.1, 0), null, "The ordinary main hall must not report a low ceiling.");
const t6StorageCenterX = (t6Storage.bounds.xMin + t6Storage.bounds.xMax) / 2;
assert.equal(world.groundHeight(planToWorldX(t6StorageCenterX), 69.2, 0), 0);
assert.ok(world.groundHeight(planToWorldX(t6StorageCenterX), 69.2, 3.1) > 2);

world.updateVisibility(planToWorldX(1.5), -6.8);
for (const { group } of world.auditoriumGroups.values()) assert.equal(group.visible, true, "Auditorium interiors must remain resident and visible.");
const removedHallPosters = [];
scene.traverse(({ name }) => {
  if (/^poster-\d+$/.test(name)) removedHallPosters.push(name);
});
assert.deepEqual(removedHallPosters, [], "V8 must not restore the removed random NOW SHOWING posters.");
const minimap = createMinimap({ canvas: new FakeCanvas(700, 360) });
minimap.updatePlayer({ x: -2, z: 64, directionX: 1, directionZ: 0 });
minimap.draw();
minimap.destroy();
world.dispose();
materials.dispose();

console.log(
  `World smoke valid: ${world.stats.meshCount} runtime meshes · ${world.stats.instancedMeshCount} instanced · ${world.stats.colliderCount} colliders.`,
);
