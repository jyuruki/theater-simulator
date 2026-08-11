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
const structuralWalls = [];
const originalAdd = THREE.Object3D.prototype.add;

const isStructuralFloor = (name) => (
  /-floor$|-tier-\d+$|-stair-\d+-\d+$|cross-aisle$|route-ramp$/.test(name)
);

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
  LOBBY_PLAN,
  MAP_BOUNDS,
  PLAYER_SPAWN_PLAN,
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

const wallOverlaps = coplanarWallOverlaps(structuralWalls);
assert.deepEqual(wallOverlaps, [], `Coplanar structural wall overlaps:\n${wallOverlaps.join("\n")}`);

const gridWidth = Math.round((MAP_BOUNDS.xMax - MAP_BOUNDS.xMin) / GRID_STEP) + 1;
const gridDepth = Math.round((MAP_BOUNDS.zMax - MAP_BOUNDS.zMin) / GRID_STEP) + 1;
const gridSize = gridWidth * gridDepth;
const blocked = new Uint8Array(gridSize);
const visited = new Uint8Array(gridSize);
const queueX = new Int32Array(gridSize);
const queueZ = new Int32Array(gridSize);

const gridIndex = (gridX, gridZ) => gridZ * gridWidth + gridX;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const planXAt = (gridX) => MAP_BOUNDS.xMin + gridX * GRID_STEP;
const planZAt = (gridZ) => MAP_BOUNDS.zMin + gridZ * GRID_STEP;

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

function isReachable(planX, planZ, tolerance = 0.31) {
  const centerX = Math.round((planX - MAP_BOUNDS.xMin) / GRID_STEP);
  const centerZ = Math.round((planZ - MAP_BOUNDS.zMin) / GRID_STEP);
  const gridRadius = Math.ceil(tolerance / GRID_STEP);
  for (let offsetZ = -gridRadius; offsetZ <= gridRadius; offsetZ += 1) {
    for (let offsetX = -gridRadius; offsetX <= gridRadius; offsetX += 1) {
      const gridX = centerX + offsetX;
      const gridZ = centerZ + offsetZ;
      if (gridX < 0 || gridX >= gridWidth || gridZ < 0 || gridZ >= gridDepth) continue;
      if (!visited[gridIndex(gridX, gridZ)]) continue;
      if (Math.hypot(planXAt(gridX) - planX, planZAt(gridZ) - planZ) <= tolerance) return true;
    }
  }
  return false;
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
}

navigationTargets.push(
  { id: "courtyard-theater-3", x: -17, z: 69 },
  { id: "courtyard-future-task", x: -5.4, z: 69 },
  { id: "courtyard-theater-4", x: 20.2, z: 69 },
  { id: "courtyard-theater-5", x: 23.3, z: 69 },
  { id: "trash-room", x: -37, z: 64 },
  { id: "boys-restroom", x: -31, z: 69 },
  { id: "theater-3-storage-door-a", x: -22.1, z: 75.8 },
  { id: "theater-3-storage-door-b", x: -22.1, z: 80.5 },
  { id: "theater-6-storage-door-a", x: 48.5, z: 69.2 },
  { id: "theater-6-storage-door-b", x: 55, z: 69.2 },
);

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

const farVoidProbes = [
  { id: "rear-center", x: 0, z: 95 },
  { id: "rear-between-5-and-6", x: 40, z: 95 },
  { id: "rear-east", x: 100, z: 95 },
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
  `Navigation smoke valid: 14 bowls + ${navigationTargets.length - 14} service targets reachable · rear void contained · geometry overlap-free.`,
);
