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
  FOUNTAIN_PLAN,
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
assert.equal(world.stats.layoutVersion, "mililani-sketch-v6");
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
const auditoriumByNumber = new Map(AUDITORIUMS.map((auditorium) => [auditorium.number, auditorium]));

const t3Storage = serviceById.get("under-storage-3");
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
  assert.equal(colliderIdsMatching(world, pattern).length, expected, `Runtime ${label} must match the V6 fixture plan.`);
}

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
const expectedT6Underside = t6Storage.ceilingHeight - 0.1;
const stairLeaf = boxById("future-upstairs-stair-closed-leaf");
assertNear(stairLeaf.x, planToWorldX(27.5), "future stair door x");
assertNear(stairLeaf.z, 62.2, "future stair door z");
const t6DoorSegments = world.colliders
  .filter(({ id }) => /^theater-6-vestibule-hall-wall-segment-(?:0|last)$/.test(id))
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
}
for (const id of ["theater-6-route-light-a", "theater-6-route-light-b", "theater-6-route-light-c"]) {
  const light = boxById(id);
  assert.ok(light.y + light.height / 2 < expectedT6Underside, `${id} must mount below the low roof.`);
}
assert.equal(world.ceilingHeight(planToWorldX(57.9), 84, 0), null, "T6 sampler must end at the long-route side wall.");
assert.equal(world.ceilingHeight(planToWorldX(59), theater6.entry.longRouteBounds.zMax + 0.1, 0), null, "T6 sampler must end at the long-route arrival.");
assert.equal(world.ceilingHeight(planToWorldX(65), 60.1, 0), null, "The ordinary main hall must not report a low ceiling.");
assert.equal(world.groundHeight(planToWorldX(50), 69.2, 0), 0);
assert.ok(world.groundHeight(planToWorldX(50), 69.2, 3.1) > 2);

world.updateVisibility(planToWorldX(1.5), -6.8);
for (const { group } of world.auditoriumGroups.values()) assert.equal(group.visible, true, "Auditorium interiors must remain resident and visible.");
const removedHallPosters = [];
scene.traverse(({ name }) => {
  if (/^poster-\d+$/.test(name)) removedHallPosters.push(name);
});
assert.deepEqual(removedHallPosters, [], "V6 must not restore the removed random NOW SHOWING posters.");
const minimap = createMinimap({ canvas: new FakeCanvas(700, 360) });
minimap.updatePlayer({ x: -2, z: 64, directionX: 1, directionZ: 0 });
minimap.draw();
minimap.destroy();
world.dispose();
materials.dispose();

console.log(
  `World smoke valid: ${world.stats.meshCount} runtime meshes · ${world.stats.instancedMeshCount} instanced · ${world.stats.colliderCount} colliders.`,
);
