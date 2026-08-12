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

const PLAYER_RADIUS = 0.34;
const PLAYER_HEIGHT = 1.78;
const GRID_STEP = 0.2;
const GEOMETRY_EPSILON = 1e-4;

const THREE = await import("three");
const structuralFloors = [];
const structuralCeilings = [];
const structuralWalls = [];
const originalAdd = THREE.Object3D.prototype.add;

const isStructuralFloor = (name) => (
  /-floor$|-tier-\d+$|-riser-\d+$|-stair-\d+-\d+$|cross-aisle$|route-ramp$/.test(name)
);
const isStructuralCeiling = (name) => /-ceiling$/.test(name);

THREE.Object3D.prototype.add = function captureStructuralMeshes(...objects) {
  for (const object of objects) {
    if (!object?.isMesh || object.geometry?.type !== "BoxGeometry") continue;

    if (isStructuralFloor(object.name)) {
      structuralFloors.push({
        id: object.name,
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
        width: object.scale.x,
        height: object.scale.y,
        depth: object.scale.z,
        rotationX: object.rotation.x,
      });
    }

    if (isStructuralCeiling(object.name)) {
      structuralCeilings.push({
        id: object.name,
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
        width: object.scale.x,
        height: object.scale.y,
        depth: object.scale.z,
        rotationX: object.rotation.x,
      });
    }

    const thinDimension = Math.min(object.scale.x, object.scale.z);
    const longDimension = Math.max(object.scale.x, object.scale.z);
    if (object.scale.y >= 2 && thinDimension <= 0.31 && longDimension > 0.31) {
      const longAxisIsX = object.scale.x >= object.scale.z;
      structuralWalls.push({
        id: object.name,
        x: object.position.x,
        z: object.position.z,
        minY: object.position.y - object.scale.y / 2,
        maxY: object.position.y + object.scale.y / 2,
        length: longDimension,
        angle: object.rotation.y + (longAxisIsX ? 0 : Math.PI / 2),
      });
    }
  }
  return originalAdd.apply(this, objects);
};

const { createMaterialLibrary } = await import("../src/materials.js");
const { createTheaterWorld } = await import("../src/world.js");
const { worldToPlanX } = await import("../src/coordinates.js");
const {
  AUDITORIUMS,
  COURTYARD_PLAN,
  EQUIPMENT_ANCHORS,
  LOBBY_PLAN,
  MAP_BOUNDS,
  PLAYER_SPAWN_PLAN,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  TICKET_APPROACH_PLAN,
} = await import("../src/layout-data.js");

const rendererStub = { capabilities: { getMaxAnisotropy: () => 4 } };
const materials = createMaterialLibrary(rendererStub);
let world;
try {
  world = createTheaterWorld({ scene: new THREE.Scene(), materials });
} finally {
  THREE.Object3D.prototype.add = originalAdd;
}

function exactDuplicateColliders(colliders) {
  const coordinateKeys = ["minX", "maxX", "minY", "maxY", "minZ", "maxZ"];
  const duplicates = [];
  for (let firstIndex = 0; firstIndex < colliders.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < colliders.length; secondIndex += 1) {
      const first = colliders[firstIndex];
      const second = colliders[secondIndex];
      if (coordinateKeys.every((key) => Math.abs(first[key] - second[key]) <= GEOMETRY_EPSILON)) {
        duplicates.push(`${first.id} <-> ${second.id}`);
      }
    }
  }
  return duplicates;
}

function coplanarFloorOverlaps(floors) {
  const overlaps = [];
  for (let firstIndex = 0; firstIndex < floors.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < floors.length; secondIndex += 1) {
      const first = floors[firstIndex];
      const second = floors[secondIndex];
      if (Math.abs(first.rotationX - second.rotationX) > GEOMETRY_EPSILON) continue;

      const normalY = Math.cos(first.rotationX);
      const normalZ = Math.sin(first.rotationX);
      const surfaceDirectionY = -normalZ;
      const surfaceDirectionZ = normalY;
      const firstTopY = first.y + normalY * first.height / 2;
      const firstTopZ = first.z + normalZ * first.height / 2;
      const secondTopY = second.y + normalY * second.height / 2;
      const secondTopZ = second.z + normalZ * second.height / 2;
      const firstPlane = firstTopY * normalY + firstTopZ * normalZ;
      const secondPlane = secondTopY * normalY + secondTopZ * normalZ;
      if (Math.abs(firstPlane - secondPlane) > GEOMETRY_EPSILON) continue;

      const overlapX = Math.min(first.x + first.width / 2, second.x + second.width / 2)
        - Math.max(first.x - first.width / 2, second.x - second.width / 2);
      const firstSurfaceCenter = firstTopY * surfaceDirectionY + firstTopZ * surfaceDirectionZ;
      const secondSurfaceCenter = secondTopY * surfaceDirectionY + secondTopZ * surfaceDirectionZ;
      const overlapAlongSurface = Math.min(
        firstSurfaceCenter + first.depth / 2,
        secondSurfaceCenter + second.depth / 2,
      ) - Math.max(
        firstSurfaceCenter - first.depth / 2,
        secondSurfaceCenter - second.depth / 2,
      );
      if (overlapX > GEOMETRY_EPSILON && overlapAlongSurface > GEOMETRY_EPSILON) {
        overlaps.push(`${first.id} <-> ${second.id} (${overlapX.toFixed(4)} x ${overlapAlongSurface.toFixed(4)} m)`);
      }
    }
  }
  return overlaps;
}

function normalizeHalfTurn(angle) {
  let normalized = angle % Math.PI;
  if (normalized < 0) normalized += Math.PI;
  return normalized;
}

function coplanarWallOverlaps(walls) {
  const overlaps = [];
  for (let firstIndex = 0; firstIndex < walls.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < walls.length; secondIndex += 1) {
      const first = walls[firstIndex];
      const second = walls[secondIndex];
      const firstAngle = normalizeHalfTurn(first.angle);
      const secondAngle = normalizeHalfTurn(second.angle);
      let angleDifference = Math.abs(firstAngle - secondAngle);
      angleDifference = Math.min(angleDifference, Math.PI - angleDifference);
      if (angleDifference > GEOMETRY_EPSILON) continue;

      const directionX = Math.cos(firstAngle);
      const directionZ = -Math.sin(firstAngle);
      const normalX = -directionZ;
      const normalZ = directionX;
      const planeOffset = Math.abs(
        (second.x - first.x) * normalX + (second.z - first.z) * normalZ,
      );
      if (planeOffset > GEOMETRY_EPSILON) continue;

      const firstCenter = first.x * directionX + first.z * directionZ;
      const secondCenter = second.x * directionX + second.z * directionZ;
      const horizontalOverlap = Math.min(
        firstCenter + first.length / 2,
        secondCenter + second.length / 2,
      ) - Math.max(
        firstCenter - first.length / 2,
        secondCenter - second.length / 2,
      );
      const verticalOverlap = Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY);
      if (horizontalOverlap > GEOMETRY_EPSILON && verticalOverlap > GEOMETRY_EPSILON) {
        overlaps.push(`${first.id} <-> ${second.id} (${horizontalOverlap.toFixed(4)} m)`);
      }
    }
  }
  return overlaps;
}

const duplicateColliders = exactDuplicateColliders(world.colliders);
assert.deepEqual(duplicateColliders, [], `Exact duplicate colliders:\n${duplicateColliders.join("\n")}`);

const floorOverlaps = coplanarFloorOverlaps(structuralFloors);
assert.deepEqual(floorOverlaps, [], `Coplanar structural floor overlaps:\n${floorOverlaps.join("\n")}`);

const ceilingOverlaps = coplanarFloorOverlaps(structuralCeilings);
assert.deepEqual(ceilingOverlaps, [], `Coplanar structural ceiling overlaps:\n${ceilingOverlaps.join("\n")}`);

const wallOverlaps = coplanarWallOverlaps(structuralWalls);
assert.deepEqual(wallOverlaps, [], `Coplanar structural wall overlaps:\n${wallOverlaps.join("\n")}`);

const gridWidth = Math.round((MAP_BOUNDS.xMax - MAP_BOUNDS.xMin) / GRID_STEP) + 1;
const gridDepth = Math.round((MAP_BOUNDS.zMax - MAP_BOUNDS.zMin) / GRID_STEP) + 1;
const gridSize = gridWidth * gridDepth;
const blocked = new Uint8Array(gridSize);
const floorSupported = new Uint8Array(gridSize);
const visited = new Uint8Array(gridSize);
const floorVisited = new Uint8Array(gridSize);
const queueX = new Int32Array(gridSize);
const queueZ = new Int32Array(gridSize);

const gridIndex = (gridX, gridZ) => gridZ * gridWidth + gridX;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const planXAt = (gridX) => MAP_BOUNDS.xMin + gridX * GRID_STEP;
const planZAt = (gridZ) => MAP_BOUNDS.zMin + gridZ * GRID_STEP;

// Rasterize every authored walking surface separately from collision. The
// main reachability flood intentionally ignores floors so it still catches a
// missing containment wall even though groundHeight has a fallback plane.
// A second flood below requires these rendered surfaces and catches holes in
// actual routes rather than allowing that fallback to mask them.
for (const floor of structuralFloors) {
  const centerPlanX = worldToPlanX(floor.x);
  const halfWidth = floor.width / 2;
  const halfDepth = (
    Math.abs(Math.cos(floor.rotationX)) * floor.depth
    + Math.abs(Math.sin(floor.rotationX)) * floor.height
  ) / 2;
  const gridXMin = Math.max(0, Math.floor((centerPlanX - halfWidth - MAP_BOUNDS.xMin) / GRID_STEP));
  const gridXMax = Math.min(gridWidth - 1, Math.ceil((centerPlanX + halfWidth - MAP_BOUNDS.xMin) / GRID_STEP));
  const gridZMin = Math.max(0, Math.floor((floor.z - halfDepth - MAP_BOUNDS.zMin) / GRID_STEP));
  const gridZMax = Math.min(gridDepth - 1, Math.ceil((floor.z + halfDepth - MAP_BOUNDS.zMin) / GRID_STEP));
  for (let gridZ = gridZMin; gridZ <= gridZMax; gridZ += 1) {
    if (Math.abs(planZAt(gridZ) - floor.z) > halfDepth + GEOMETRY_EPSILON) continue;
    for (let gridX = gridXMin; gridX <= gridXMax; gridX += 1) {
      if (Math.abs(planXAt(gridX) - centerPlanX) > halfWidth + GEOMETRY_EPSILON) continue;
      floorSupported[gridIndex(gridX, gridZ)] = 1;
    }
  }
}

for (const collider of world.colliders) {
  const overlapsPlayerHeight = PLAYER_HEIGHT > collider.minY + GEOMETRY_EPSILON
    && 0 < collider.maxY - GEOMETRY_EPSILON;
  if (!overlapsPlayerHeight) continue;

  // Mirroring reverses the X interval; Z is unchanged.
  const planBounds = {
    xMin: worldToPlanX(collider.maxX),
    xMax: worldToPlanX(collider.minX),
    zMin: collider.minZ,
    zMax: collider.maxZ,
  };
  const gridXMin = Math.max(0, Math.floor((planBounds.xMin - PLAYER_RADIUS - MAP_BOUNDS.xMin) / GRID_STEP));
  const gridXMax = Math.min(gridWidth - 1, Math.ceil((planBounds.xMax + PLAYER_RADIUS - MAP_BOUNDS.xMin) / GRID_STEP));
  const gridZMin = Math.max(0, Math.floor((planBounds.zMin - PLAYER_RADIUS - MAP_BOUNDS.zMin) / GRID_STEP));
  const gridZMax = Math.min(gridDepth - 1, Math.ceil((planBounds.zMax + PLAYER_RADIUS - MAP_BOUNDS.zMin) / GRID_STEP));

  for (let gridZ = gridZMin; gridZ <= gridZMax; gridZ += 1) {
    const planZ = planZAt(gridZ);
    for (let gridX = gridXMin; gridX <= gridXMax; gridX += 1) {
      const planX = planXAt(gridX);
      const deltaX = planX - clamp(planX, planBounds.xMin, planBounds.xMax);
      const deltaZ = planZ - clamp(planZ, planBounds.zMin, planBounds.zMax);
      if (deltaX * deltaX + deltaZ * deltaZ < PLAYER_RADIUS * PLAYER_RADIUS - GEOMETRY_EPSILON) {
        blocked[gridIndex(gridX, gridZ)] = 1;
      }
    }
  }
}

for (let gridZ = 0; gridZ < gridDepth; gridZ += 1) {
  const planZ = planZAt(gridZ);
  for (let gridX = 0; gridX < gridWidth; gridX += 1) {
    const planX = planXAt(gridX);
    if (
      planX < MAP_BOUNDS.xMin + PLAYER_RADIUS
      || planX > MAP_BOUNDS.xMax - PLAYER_RADIUS
      || planZ < MAP_BOUNDS.zMin + PLAYER_RADIUS
      || planZ > MAP_BOUNDS.zMax - PLAYER_RADIUS
    ) {
      blocked[gridIndex(gridX, gridZ)] = 1;
    }
  }
}

const spawnGridX = Math.round((PLAYER_SPAWN_PLAN.x - MAP_BOUNDS.xMin) / GRID_STEP);
const spawnGridZ = Math.round((PLAYER_SPAWN_PLAN.z - MAP_BOUNDS.zMin) / GRID_STEP);
const spawnIndex = gridIndex(spawnGridX, spawnGridZ);
assert.equal(blocked[spawnIndex], 0, "Player spawn must not overlap a collider.");

let queueHead = 0;
let queueTail = 0;
queueX[queueTail] = spawnGridX;
queueZ[queueTail] = spawnGridZ;
queueTail += 1;
visited[spawnIndex] = 1;

const neighborOffsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
while (queueHead < queueTail) {
  const gridX = queueX[queueHead];
  const gridZ = queueZ[queueHead];
  queueHead += 1;
  for (const [offsetX, offsetZ] of neighborOffsets) {
    const nextX = gridX + offsetX;
    const nextZ = gridZ + offsetZ;
    if (nextX < 0 || nextX >= gridWidth || nextZ < 0 || nextZ >= gridDepth) continue;
    const nextIndex = gridIndex(nextX, nextZ);
    if (blocked[nextIndex] || visited[nextIndex]) continue;
    visited[nextIndex] = 1;
    queueX[queueTail] = nextX;
    queueZ[queueTail] = nextZ;
    queueTail += 1;
  }
}

let uncoveredReachableCount = 0;
const uncoveredReachableSamples = [];
for (let gridZ = 0; gridZ < gridDepth; gridZ += 1) {
  for (let gridX = 0; gridX < gridWidth; gridX += 1) {
    const index = gridIndex(gridX, gridZ);
    if (!visited[index] || blocked[index] || floorSupported[index]) continue;
    uncoveredReachableCount += 1;
    if (uncoveredReachableSamples.length < 20) {
      uncoveredReachableSamples.push(`(${planXAt(gridX).toFixed(1)}, ${planZAt(gridZ).toFixed(1)})`);
    }
  }
}
assert.equal(
  uncoveredReachableCount,
  0,
  `Reachable collision-free cells without rendered floor: ${uncoveredReachableSamples.join(", ")}`,
);

assert.equal(floorSupported[spawnIndex], 1, "Player spawn must stand on rendered floor geometry.");
queueHead = 0;
queueTail = 0;
queueX[queueTail] = spawnGridX;
queueZ[queueTail] = spawnGridZ;
queueTail += 1;
floorVisited[spawnIndex] = 1;
while (queueHead < queueTail) {
  const gridX = queueX[queueHead];
  const gridZ = queueZ[queueHead];
  queueHead += 1;
  for (const [offsetX, offsetZ] of neighborOffsets) {
    const nextX = gridX + offsetX;
    const nextZ = gridZ + offsetZ;
    if (nextX < 0 || nextX >= gridWidth || nextZ < 0 || nextZ >= gridDepth) continue;
    const nextIndex = gridIndex(nextX, nextZ);
    if (blocked[nextIndex] || !floorSupported[nextIndex] || floorVisited[nextIndex]) continue;
    floorVisited[nextIndex] = 1;
    queueX[queueTail] = nextX;
    queueZ[queueTail] = nextZ;
    queueTail += 1;
  }
}

function isReachable(planX, planZ, tolerance = 0.31, reachability = visited) {
  const centerX = Math.round((planX - MAP_BOUNDS.xMin) / GRID_STEP);
  const centerZ = Math.round((planZ - MAP_BOUNDS.zMin) / GRID_STEP);
  const gridRadius = Math.ceil(tolerance / GRID_STEP);
  for (let offsetZ = -gridRadius; offsetZ <= gridRadius; offsetZ += 1) {
    for (let offsetX = -gridRadius; offsetX <= gridRadius; offsetX += 1) {
      const gridX = centerX + offsetX;
      const gridZ = centerZ + offsetZ;
      if (gridX < 0 || gridX >= gridWidth || gridZ < 0 || gridZ >= gridDepth) continue;
      if (!reachability[gridIndex(gridX, gridZ)]) continue;
      if (Math.hypot(planXAt(gridX) - planX, planZAt(gridZ) - planZ) <= tolerance) return true;
    }
  }
  return false;
}

function isBlocked(planX, planZ) {
  const gridX = Math.round((planX - MAP_BOUNDS.xMin) / GRID_STEP);
  const gridZ = Math.round((planZ - MAP_BOUNDS.zMin) / GRID_STEP);
  if (gridX < 0 || gridX >= gridWidth || gridZ < 0 || gridZ >= gridDepth) return true;
  return blocked[gridIndex(gridX, gridZ)] === 1;
}

function assertOpenPlanPoint(id, x, z) {
  assert.equal(isBlocked(x, z), false, `${id} must remain an open player-width seam at (${x}, ${z}).`);
}

function assertBlockedPlanSegment(id, { xMin, xMax, zMin, zMax }, inset = 0.4) {
  const horizontal = Math.abs(zMax - zMin) <= GEOMETRY_EPSILON;
  const length = horizontal ? xMax - xMin : zMax - zMin;
  assert.ok(length > inset * 2, `${id} must have enough length for an interior collision audit.`);
  const sampleCount = Math.max(1, Math.ceil((length - inset * 2) / GRID_STEP));
  const misses = [];
  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const progress = sample / sampleCount;
    const coordinate = inset + (length - inset * 2) * progress;
    const x = horizontal ? xMin + coordinate : xMin;
    const z = horizontal ? zMin : zMin + coordinate;
    if (!isBlocked(x, z)) misses.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
  assert.deepEqual(misses, [], `${id} has collision gaps at ${misses.join(", ")}.`);
}

const navigationTargets = [];
assert.equal(AUDITORIUMS.length, 14, "Navigation smoke expects exactly 14 auditoriums.");
for (const auditorium of AUDITORIUMS) {
  const layout = world.auditoriumLayouts.get(auditorium.id);
  const topEntry = auditorium.screenSide === "south";
  const aisle = layout.sideAisles[auditorium.entry.routeSide];
  const bowlX = topEntry
    ? auditorium.entry.center + (auditorium.entry.turnSide === "west" ? -2 : 2)
    : aisle.centerX;
  const bowlZ = topEntry
    ? auditorium.bounds.zMax - 1.15
    : (layout.frontCross.bounds.zMin + layout.frontCross.bounds.zMax) / 2;
  navigationTargets.push({
    id: `${auditorium.id}-bowl`,
    x: bowlX,
    z: bowlZ,
  });
  if (auditorium.stadium.access === "top") {
    const rearZ = (layout.rearCross.bounds.zMin + layout.rearCross.bounds.zMax) / 2;
    for (const side of ["west", "east"]) {
      navigationTargets.push({
        id: `${auditorium.id}-${side}-rear-aisle`,
        x: layout.sideAisles[side].centerX,
        z: rearZ,
      });
    }
  }
}

const serviceById = new Map(SERVICE_ROOMS.map((room) => [room.id, room]));
const publicById = new Map(PUBLIC_SPACES.map((room) => [room.id, room]));
const auditoriumByNumber = new Map(AUDITORIUMS.map((auditorium) => [auditorium.number, auditorium]));
const boundsCenter = (bounds) => ({
  x: (bounds.xMin + bounds.xMax) / 2,
  z: (bounds.zMin + bounds.zMax) / 2,
});
const cubbyBoundsFor = (auditorium) => {
  if (auditorium.entry.cubbyBounds) return auditorium.entry.cubbyBounds;
  const halfWidth = auditorium.entry.cubbyHalfWidth ?? 1.6;
  const depth = auditorium.entry.cubbyDepth ?? 2.2;
  return {
    xMin: auditorium.entry.center - halfWidth,
    xMax: auditorium.entry.center + halfWidth,
    zMin: auditorium.bounds.zMax - depth,
    zMax: auditorium.bounds.zMax,
  };
};
const addBoundsTarget = (id, bounds) => navigationTargets.push({ id, ...boundsCenter(bounds) });

for (const door of COURTYARD_PLAN.doors) {
  navigationTargets.push({
    id: `courtyard-${door.targetId}`,
    x: door.center,
    z: COURTYARD_PLAN.backWallZ + 0.8,
  });
}

const theater3 = auditoriumByNumber.get(3);
const storage3 = serviceById.get("under-storage-3");
const theater3Route = theater3.entry.routeBounds;
const theater3RouteCenterX = (theater3Route.xMin + theater3Route.xMax) / 2;
const theater3Door = COURTYARD_PLAN.doors.find(({ targetId }) => targetId === "theater-3");
assert.deepEqual(theater3.bounds, { xMin: -24.2, xMax: -6.7, zMin: 72, zMax: 99 });
assert.deepEqual(theater3Route, { xMin: -6.7, xMax: -4.3, zMin: 68.2, zMax: 95.3 });
assert.deepEqual(theater3.entry.usherNookBounds, { xMin: -9.9, xMax: -6.7, zMin: 68.2, zMax: 72 });
assert.deepEqual(theater3.entry.ramp.bounds, { xMin: -6.7, xMax: -4.3, zMin: 82.5, zMax: 94.5 });
assert.deepEqual(storage3.bounds, { xMin: -21.5, xMax: -9.9, zMin: 72, zMax: 82.5 });
assert.deepEqual(storage3.accessHall, { xMin: -21.5, xMax: -9.9, zMin: 68.2, zMax: 72 });
assert.deepEqual(storage3.doorCenters, [-18.6, -12.3]);
assert.deepEqual(theater3Door, { targetId: "theater-3", center: -5.5, width: 2.4 });
assert.equal(theater3.bounds.xMax, theater3Route.xMin, "T3 bowl must butt directly against its V8 route.");
assert.equal(theater3.entry.usherNookBounds.xMax, theater3Route.xMin, "T3 nook must open directly to its route.");
assert.equal(theater3.entry.usherNookBounds.xMin, storage3.accessHall.xMax, "T3 nook must meet the storage door wall.");
assert.equal(storage3.accessHall.zMax, storage3.bounds.zMin, "T3 access hall must meet its two-door storage room.");
assert.equal(theater3Door.center - theater3Door.width / 2, theater3Route.xMin, "T3 left jamb must equal the route edge.");
assert.equal(theater3Door.center + theater3Door.width / 2, theater3Route.xMax, "T3 right jamb must equal the route edge.");
assertOpenPlanPoint("T3 courtyard door", theater3Door.center, COURTYARD_PLAN.backWallZ);
assertOpenPlanPoint(
  "T3 route/nook seam",
  theater3Route.xMin,
  (theater3.entry.usherNookBounds.zMin + theater3.entry.usherNookBounds.zMax) / 2,
);
assertOpenPlanPoint("T3 nook/storage door", storage3.accessHall.xMax, storage3.outerDoorCenter);
for (const center of storage3.doorCenters) assertOpenPlanPoint(`T3 storage door ${center}`, center, storage3.bounds.zMin);
navigationTargets.push(
  {
    id: "theater-3-door-courtyard-side",
    x: theater3Door.center,
    z: theater3Route.zMin - 0.7,
  },
  {
    id: "theater-3-direct-route-entry",
    x: theater3RouteCenterX,
    z: theater3Route.zMin + 0.7,
  },
  {
    id: "theater-3-route-ramp",
    ...boundsCenter(theater3.entry.ramp.bounds),
  },
  {
    id: "theater-3-bowl-seam-route-side",
    x: theater3Route.xMin + 0.7,
    z: theater3.entry.arrivalZ,
  },
  {
    id: "theater-3-bowl-seam-bowl-side",
    x: theater3Route.xMin - 0.7,
    z: theater3.entry.arrivalZ,
  },
  {
    id: "theater-3-route-nook-seam-route-side",
    x: theater3Route.xMin + 0.7,
    z: (theater3.entry.usherNookBounds.zMin + theater3.entry.usherNookBounds.zMax) / 2,
  },
  {
    id: "theater-3-route-nook-seam-nook-side",
    x: theater3Route.xMin - 0.7,
    z: (theater3.entry.usherNookBounds.zMin + theater3.entry.usherNookBounds.zMax) / 2,
  },
);
addBoundsTarget("theater-3-usher-nook", theater3.entry.usherNookBounds);
addBoundsTarget("theater-3-storage-anteroom", storage3.accessHall);
addBoundsTarget("theater-3-storage-room", storage3.bounds);
for (const side of [-1, 1]) {
  navigationTargets.push({
    id: `theater-3-anteroom-outer-door-side-${side}`,
    x: storage3.accessHall.xMax + side * 0.7,
    z: storage3.outerDoorCenter,
  });
}
for (const center of storage3.doorCenters) {
  navigationTargets.push(
    { id: `theater-3-storage-south-${center}-anteroom`, x: center, z: storage3.bounds.zMin - 0.7 },
    { id: `theater-3-storage-south-${center}-room`, x: center, z: storage3.bounds.zMin + 0.7 },
  );
}

for (const number of [4, 5]) {
  const entry = auditoriumByNumber.get(number).entry;
  addBoundsTarget(`theater-${number}-stem`, entry.stemBounds);
  addBoundsTarget(`theater-${number}-lateral`, entry.lateralBounds);
  addBoundsTarget(`theater-${number}-long-route`, entry.longRouteBounds);
}

const theater6 = auditoriumByNumber.get(6);
addBoundsTarget("theater-6-vestibule", theater6.entry.vestibuleBounds);
addBoundsTarget("theater-6-transverse", theater6.entry.transverseBounds);
addBoundsTarget("theater-6-long-route", theater6.entry.longRouteBounds);
navigationTargets.push(
  {
    id: "theater-6-vestibule-transverse-seam",
    x: (theater6.entry.vestibuleBounds.xMin + theater6.entry.vestibuleBounds.xMax) / 2,
    z: theater6.entry.vestibuleBounds.zMax,
  },
  {
    id: "theater-6-transverse-long-turn",
    x: (theater6.entry.longRouteBounds.xMin + theater6.entry.longRouteBounds.xMax) / 2,
    z: theater6.entry.longRouteBounds.zMin + 0.7,
  },
  {
    id: "theater-6-bowl-seam-route-side",
    x: theater6.entry.longRouteBounds.xMin + 0.7,
    z: theater6.entry.arrivalZ,
  },
  {
    id: "theater-6-bowl-seam-bowl-side",
    x: theater6.entry.longRouteBounds.xMin - 0.7,
    z: theater6.entry.arrivalZ,
  },
);
const storage6 = serviceById.get("under-storage-6");
for (const center of storage6.doorCenters) {
  navigationTargets.push(
    { id: `theater-6-storage-south-${center}-passage`, x: center, z: storage6.bounds.zMin - 0.7 },
    { id: `theater-6-storage-south-${center}-room`, x: center, z: storage6.bounds.zMin + 0.7 },
  );
}

for (const number of [7, 8]) {
  addBoundsTarget(`theater-${number}-usher-nook`, auditoriumByNumber.get(number).entry.usherNookBounds);
}

const trash = serviceById.get("trash-room");
navigationTargets.push({ id: "trash-room", x: trash.doorCenter - 1.7, z: trash.bounds.zMin + 1.25 });
const boys = serviceById.get("boys-restroom");
const boysMain = boys.footprintRects[0];
const boysLobe = boys.footprintRects[1];
const boysFountainWall = publicById.get("boys-fountain-alcove");
const boysEntryCubby = publicById.get("boys-men-entry-cubby");
assert.deepEqual(trash.bounds, { xMin: -21.5, xMax: -13.5, zMin: 62.2, zMax: 64.7 });
assert.deepEqual(boys.bounds, { xMin: -21.5, xMax: -6.7, zMin: 62.2, zMax: 68.2 });
assert.deepEqual(boysMain, { xMin: -21.5, xMax: -6.7, zMin: 64.7, zMax: 68.2 });
assert.deepEqual(boysLobe, { xMin: -9.35, xMax: -6.7, zMin: 62.2, zMax: 64.7 });
assert.deepEqual(boysFountainWall.bounds, { xMin: -13.5, xMax: -10.85, zMin: 62.2, zMax: 64.7 });
assert.deepEqual(boysEntryCubby.bounds, { xMin: -10.85, xMax: -9.35, zMin: 62.2, zMax: 64.7 });
assert.deepEqual(boys.entry, { side: "west", coordinate: -9.35, center: 63.45, width: 1.9 });
assert.equal(trash.bounds.xMax, boysFountainWall.bounds.xMin, "Trash must share the solid fountain wall at x=-13.5.");
assert.equal(boysFountainWall.bounds.xMax, boysEntryCubby.bounds.xMin, "H2O must meet the MEN cubby.");
assert.equal(boysEntryCubby.bounds.xMax, boysLobe.xMin, "MEN cubby must terminate at the restroom entry door.");
assert.equal(boysLobe.zMax, boysMain.zMin, "MEN lobe must open into the BB main room.");
assert.equal(boysMain.zMax, storage3.accessHall.zMin, "BB and T3 storage must share the z=68.2 containment wall.");
assert.equal(boysMain.xMin, storage3.accessHall.xMin, "BB and T3 storage must align at x=-21.5.");
assert.equal(storage3.accessHall.xMax, -9.9, "The BB/storage shared wall must end at the storage/nook seam.");
assert.deepEqual(
  EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").map(({ id, position, rotation }) => ({ id, position, rotation })),
  [
    { id: "boys-water-fountain-1", position: [-13.24, 0, 63.03], rotation: -Math.PI / 2 },
    { id: "boys-water-fountain-2", position: [-13.24, 0, 63.83], rotation: -Math.PI / 2 },
  ],
  "V8 fountains must mount vertically on the x=-13.5 H2O wall.",
);
assertOpenPlanPoint("H2O hall opening", (boysFountainWall.bounds.xMin + boysFountainWall.bounds.xMax) / 2, boysFountainWall.bounds.zMin);
assertOpenPlanPoint("MEN hall opening", (boysEntryCubby.bounds.xMin + boysEntryCubby.bounds.xMax) / 2, boysEntryCubby.bounds.zMin);
assertOpenPlanPoint("MEN cubby/lobe door", boys.entry.coordinate, boys.entry.center);
assertOpenPlanPoint("MEN lobe/main turn", (boysLobe.xMin + boysLobe.xMax) / 2, boysLobe.zMax);
assertBlockedPlanSegment("solid Trash/H2O fountain wall", {
  xMin: boysFountainWall.bounds.xMin,
  xMax: boysFountainWall.bounds.xMin,
  zMin: boysFountainWall.bounds.zMin,
  zMax: boysFountainWall.bounds.zMax,
});
assertBlockedPlanSegment("solid H2O/MEN return wall", {
  xMin: boysFountainWall.bounds.xMax,
  xMax: boysFountainWall.bounds.xMax,
  zMin: boysFountainWall.bounds.zMin,
  zMax: boysFountainWall.bounds.zMax,
});
assertBlockedPlanSegment("solid BB/T3-storage shared wall", {
  xMin: storage3.accessHall.xMin,
  xMax: storage3.accessHall.xMax,
  zMin: storage3.accessHall.zMin,
  zMax: storage3.accessHall.zMin,
});
const fountainApproachX = boysFountainWall.bounds.xMin + 1.0;
const boysStallBank = boys.fixtures.stalls.find(({ side }) => side === "south");
const boysAisleZ = Math.min(boysMain.zMax - 1.2, boysMain.zMin + boysStallBank.depth + 0.6);
navigationTargets.push(
  {
    id: "boys-h2o-hall-side",
    x: (boysFountainWall.bounds.xMin + boysFountainWall.bounds.xMax) / 2,
    z: boysFountainWall.bounds.zMin - 0.7,
  },
  {
    id: "boys-h2o-room-side",
    x: (boysFountainWall.bounds.xMin + boysFountainWall.bounds.xMax) / 2,
    z: boysFountainWall.bounds.zMin + 0.7,
  },
  ...EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").map(({ id, position }) => ({
    id: `${id}-approach`,
    x: fountainApproachX,
    z: position[2],
  })),
  {
    id: "boys-men-hall-side",
    x: (boysEntryCubby.bounds.xMin + boysEntryCubby.bounds.xMax) / 2,
    z: boysEntryCubby.bounds.zMin - 0.7,
  },
  { id: "boys-men-cubby", ...boundsCenter(boysEntryCubby.bounds) },
  {
    id: "boys-men-door-cubby-side",
    x: boys.entry.coordinate - 0.7,
    z: boys.entry.center,
  },
  {
    id: "boys-men-door-lobe-side",
    x: boys.entry.coordinate + 0.7,
    z: boys.entry.center,
  },
  {
    id: "boys-men-lobe-main-turn-lobe-side",
    x: (boysLobe.xMin + boysLobe.xMax) / 2,
    z: boysLobe.zMax - 0.7,
  },
  {
    id: "boys-men-lobe-main-turn-main-side",
    x: (boysLobe.xMin + boysLobe.xMax) / 2,
    z: boysLobe.zMax + 0.7,
  },
  { id: "boys-restroom-main-aisle", x: (boysMain.xMin + boysMain.xMax) / 2, z: boysAisleZ },
  {
    id: "boys-storage-shared-wall-boys-side",
    x: (storage3.accessHall.xMin + storage3.accessHall.xMax) / 2,
    z: boysMain.zMax - 1.2,
  },
  {
    id: "boys-storage-shared-wall-storage-side",
    x: (storage3.accessHall.xMin + storage3.accessHall.xMax) / 2,
    z: storage3.accessHall.zMin + 0.7,
  },
);

const theater9 = auditoriumByNumber.get(9);
const theater9Cubby = cubbyBoundsFor(theater9);
assert.deepEqual(theater9.bounds, { xMin: 125, xMax: 135.5, zMin: 44.5, zMax: 58 });
assert.equal(theater9.entry.center, 128.1);
assert.equal(theater9.entry.turnSide, "east");
assert.equal(theater9.entry.innerDoorCenter, 55.75);
assert.deepEqual(theater9Cubby, { xMin: 126.5, xMax: 129.7, zMin: 54.6, zMax: 58 });
assertOpenPlanPoint("T9 hall door", theater9.entry.center, theater9.bounds.zMax);
assertOpenPlanPoint("T9 inner door", theater9Cubby.xMax, theater9.entry.innerDoorCenter);
assertBlockedPlanSegment("T9 solid cubby west wall", {
  xMin: theater9Cubby.xMin,
  xMax: theater9Cubby.xMin,
  zMin: theater9Cubby.zMin,
  zMax: theater9Cubby.zMax,
});
navigationTargets.push(
  { id: "theater-9-outer-door-hall-side", x: theater9.entry.center, z: theater9.bounds.zMax + 0.7 },
  { id: "theater-9-outer-door-cubby-side", x: theater9.entry.center, z: theater9.bounds.zMax - 0.7 },
  { id: "theater-9-inner-door-cubby-side", x: theater9Cubby.xMax - 0.7, z: theater9.entry.innerDoorCenter },
  { id: "theater-9-inner-door-left-bowl-side", x: theater9Cubby.xMax + 0.7, z: theater9.entry.innerDoorCenter },
);
const girls = serviceById.get("girls-restroom");
addBoundsTarget("girls-restroom-connector", girls.footprintRects[2]);
addBoundsTarget("girls-restroom-entry-lobe", girls.footprintRects[3]);
navigationTargets.push({ id: "girls-restroom-main", x: 66.5, z: 69.5 });
const girlsMain = girls.footprintRects[0];
const girlsNorthStalls = girls.fixtures.stalls.find(({ side }) => side === "north");
const girlsSouthStalls = girls.fixtures.stalls.find(({ side }) => side === "south");
assert.deepEqual(
  {
    start: girlsNorthStalls.start,
    end: girlsNorthStalls.end,
    count: girlsNorthStalls.count,
  },
  {
    start: girlsSouthStalls.start,
    end: girlsSouthStalls.end,
    count: girlsSouthStalls.count,
  },
  "Girls north/south stall banks must remain aligned.",
);
const girlsBayWidth = (girlsNorthStalls.end - girlsNorthStalls.start) / girlsNorthStalls.count;
const girlsNorthDoorZ = girlsMain.zMax - (girlsNorthStalls.depth - 0.025);
const girlsSouthDoorZ = girlsMain.zMin + (girlsSouthStalls.depth - 0.025);
const girlsAisleZ = (girlsNorthDoorZ + girlsSouthDoorZ) / 2;
for (let index = 0; index < girlsNorthStalls.count; index += 1) {
  navigationTargets.push({
    id: `girls-restroom-aligned-aisle-${index + 1}`,
    x: girlsNorthStalls.start + girlsBayWidth * (index + 0.5),
    z: girlsAisleZ,
  });
}
const candy = serviceById.get("candy-storage");
navigationTargets.push({ id: "candy-storage", x: candy.doorCenter, z: candy.bounds.zMin + 1.2 });

navigationTargets.push({ id: "fountain-working-aisle", x: 5.8, z: 65.7 });
navigationTargets.push(
  { id: "t3-task-partition-west", x: COURTYARD_PLAN.waistPartition.x - 0.7, z: 65.5 },
  { id: "t3-task-partition-east", x: COURTYARD_PLAN.waistPartition.x + 0.7, z: 65.5 },
);
addBoundsTarget("ticket-poster-alcove", TICKET_APPROACH_PLAN.posterAlcove);
addBoundsTarget("ticket-empty-alcove", TICKET_APPROACH_PLAN.emptyAlcove);

const kitchenDoor = LOBBY_PLAN.kitchenStorageDoor;
const kitchenSegmentStart = LOBBY_PLAN.kitchenPartition[kitchenDoor.partitionSegment];
const kitchenSegmentEnd = LOBBY_PLAN.kitchenPartition[kitchenDoor.partitionSegment + 1];
const kitchenSegmentLength = Math.hypot(
  kitchenSegmentEnd.x - kitchenSegmentStart.x,
  kitchenSegmentEnd.z - kitchenSegmentStart.z,
);
const kitchenNormalX = -(kitchenSegmentEnd.z - kitchenSegmentStart.z) / kitchenSegmentLength;
const kitchenNormalZ = (kitchenSegmentEnd.x - kitchenSegmentStart.x) / kitchenSegmentLength;
for (const side of [-1, 1]) {
  navigationTargets.push({
    id: `kitchen-storage-diagonal-side-${side}`,
    x: kitchenDoor.x + side * kitchenNormalX * 0.7,
    z: kitchenDoor.z + side * kitchenNormalZ * 0.7,
  });
}

const unreachableTargets = navigationTargets.filter(({ x, z }) => !isReachable(x, z));
assert.deepEqual(
  unreachableTargets.map(({ id }) => id),
  [],
  `Navigation targets are unreachable: ${unreachableTargets.map(({ id }) => id).join(", ")}`,
);

const floorRouteFailures = navigationTargets.filter(({ x, z }) => !isReachable(x, z, 0.31, floorVisited));
assert.deepEqual(
  floorRouteFailures.map(({ id }) => id),
  [],
  `Targets require missing/invisible floor geometry: ${floorRouteFailures.map(({ id }) => id).join(", ")}`,
);

const farVoidProbes = [
  { id: "rear-center", x: 0, z: 95 },
  { id: "rear-of-theater-3-route", x: theater3RouteCenterX, z: 97 },
  { id: "rear-of-theaters-4-5", x: 15, z: 94 },
  {
    id: "rear-between-5-and-6",
    x: (auditoriumByNumber.get(5).bounds.xMax + theater6.bounds.xMin) / 2,
    z: 95,
  },
  { id: "rear-of-theater-6", x: (theater6.bounds.xMin + theater6.bounds.xMax) / 2, z: 95 },
  { id: "rear-east", x: 100, z: 95 },
  { id: "rear-of-theater-8", x: 132, z: 94 },
  {
    id: "behind-t3-task-seam",
    x: (theater3Route.xMax + serviceById.get("future-task-room").bounds.xMin) / 2,
    z: 70.5,
  },
  { id: "behind-court-east-seam", x: 7.4, z: 72 },
  { id: "old-theater-6-transverse-ghost", x: 54, z: 67 },
  { id: "old-theater-6-storage-ghost", x: 52, z: 70 },
  { id: "old-theater-6-long-route-ghost", x: 59, z: 78 },
  { id: "old-boys-main-ghost", x: -30, z: 67 },
  { id: "old-boys-men-cubby-ghost", x: -25.4, z: 63.45 },
  { id: "theater-9-east-exterior-void", x: theater9.bounds.xMax + 0.7, z: theater9.entry.innerDoorCenter },
  { id: "far-east", x: 140, z: 90 },
  { id: "far-west", x: -40, z: 90 },
];
const escapedVoidProbes = farVoidProbes.filter(({ x, z }) => isReachable(x, z));
assert.deepEqual(
  escapedVoidProbes.map(({ id }) => id),
  [],
  `Player can escape to rear/far void probes: ${escapedVoidProbes.map(({ id }) => id).join(", ")}`,
);

world.dispose();
materials.dispose();

console.log(
  `Navigation smoke valid: 14 bowls + ${navigationTargets.length - 14} V8 route targets reachable on rendered floors · T3/BB/MEN/T9 seams contained · legacy ghosts and rear void contained · geometry overlap-free.`,
);
