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

function assertNear(actual, expected, message, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

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
        rotationY: object.rotation.y,
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
        rotationY: object.rotation.y,
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
const { planToWorldX, worldToPlanX } = await import("../src/coordinates.js");
const {
  AUDITORIUMS,
  CONCESSION_SERVICE_SEQUENCE,
  COURTYARD_PLAN,
  EQUIPMENT_ANCHORS,
  FOUNTAIN_PLAN,
  FRONT_SHIFT_Z,
  HALL_END_EXITS,
  HALL_PLAN,
  LOBBY_CEILING_PLAN,
  LOBBY_PLAN,
  LOBBY_SHIFT_X,
  MAP_BOUNDS,
  PLAYER_SPAWN_PLAN,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  T12_TICKET_SHIFT_X,
  TICKET_APPROACH_PLAN,
} = await import("../src/layout-data.js");

const structuralCeilingPolygons = [
  ...LOBBY_PLAN.kitchenCeiling.surfaces,
  LOBBY_PLAN.kitchenDeadSpace.ceiling,
  { ...LOBBY_PLAN.muralFacade.soffit, id: `${LOBBY_PLAN.muralFacade.soffit.id}-ceiling` },
];

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
function surfaceContainsPlanPoint(surface, planX, planZ, tolerance = GEOMETRY_EPSILON) {
  const worldX = planToWorldX(planX);
  const deltaX = worldX - surface.x;
  const deltaZ = planZ - surface.z;
  const cosine = Math.cos(surface.rotationY);
  const sine = Math.sin(surface.rotationY);
  const localX = cosine * deltaX - sine * deltaZ;
  const localZ = sine * deltaX + cosine * deltaZ;
  const halfWidth = surface.width / 2;
  const halfDepth = (
    Math.abs(Math.cos(surface.rotationX)) * surface.depth
    + Math.abs(Math.sin(surface.rotationX)) * surface.height
  ) / 2;
  return Math.abs(localX) <= halfWidth + tolerance && Math.abs(localZ) <= halfDepth + tolerance;
}

function pointOnPlanSegment(point, start, end, tolerance = GEOMETRY_EPSILON) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= tolerance * tolerance) return Math.hypot(point.x - start.x, point.z - start.z) <= tolerance;
  const t = ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared;
  if (t < -tolerance || t > 1 + tolerance) return false;
  const projectedX = start.x + dx * t;
  const projectedZ = start.z + dz * t;
  return Math.hypot(point.x - projectedX, point.z - projectedZ) <= tolerance;
}

function polygonContainsPlanPoint(vertices, point, { includeBoundary = true } = {}) {
  for (let index = 0; index < vertices.length; index += 1) {
    if (pointOnPlanSegment(point, vertices[index], vertices[(index + 1) % vertices.length])) return includeBoundary;
  }
  let inside = false;
  for (let first = 0, second = vertices.length - 1; first < vertices.length; second = first, first += 1) {
    const a = vertices[first];
    const b = vertices[second];
    if ((a.z > point.z) === (b.z > point.z)) continue;
    const crossingX = (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x;
    if (point.x < crossingX) inside = !inside;
  }
  return inside;
}

function segmentsProperlyIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const orientation = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const firstA = orientation(firstStart, firstEnd, secondStart);
  const firstB = orientation(firstStart, firstEnd, secondEnd);
  const secondA = orientation(secondStart, secondEnd, firstStart);
  const secondB = orientation(secondStart, secondEnd, firstEnd);
  return firstA * firstB < -GEOMETRY_EPSILON && secondA * secondB < -GEOMETRY_EPSILON;
}

function polygonsHaveInteriorOverlap(firstVertices, secondVertices) {
  if (firstVertices.some((point) => polygonContainsPlanPoint(secondVertices, point, { includeBoundary: false }))) return true;
  if (secondVertices.some((point) => polygonContainsPlanPoint(firstVertices, point, { includeBoundary: false }))) return true;
  for (let firstIndex = 0; firstIndex < firstVertices.length; firstIndex += 1) {
    const firstStart = firstVertices[firstIndex];
    const firstEnd = firstVertices[(firstIndex + 1) % firstVertices.length];
    for (let secondIndex = 0; secondIndex < secondVertices.length; secondIndex += 1) {
      if (segmentsProperlyIntersect(
        firstStart,
        firstEnd,
        secondVertices[secondIndex],
        secondVertices[(secondIndex + 1) % secondVertices.length],
      )) return true;
    }
  }
  return false;
}

function polygonProperSelfIntersections(vertices) {
  const intersections = [];
  for (let firstIndex = 0; firstIndex < vertices.length; firstIndex += 1) {
    const firstNext = (firstIndex + 1) % vertices.length;
    for (let secondIndex = firstIndex + 1; secondIndex < vertices.length; secondIndex += 1) {
      const secondNext = (secondIndex + 1) % vertices.length;
      if (firstIndex === secondIndex || firstNext === secondIndex || secondNext === firstIndex) continue;
      if (segmentsProperlyIntersect(
        vertices[firstIndex],
        vertices[firstNext],
        vertices[secondIndex],
        vertices[secondNext],
      )) intersections.push(`${firstIndex}-${firstNext} x ${secondIndex}-${secondNext}`);
    }
  }
  return intersections;
}

for (const floor of structuralFloors) {
  const centerPlanX = worldToPlanX(floor.x);
  const halfWidth = floor.width / 2;
  const halfDepth = (
    Math.abs(Math.cos(floor.rotationX)) * floor.depth
    + Math.abs(Math.sin(floor.rotationX)) * floor.height
  ) / 2;
  const cosine = Math.abs(Math.cos(floor.rotationY));
  const sine = Math.abs(Math.sin(floor.rotationY));
  const planHalfWidth = cosine * halfWidth + sine * halfDepth;
  const planHalfDepth = sine * halfWidth + cosine * halfDepth;
  const gridXMin = Math.max(0, Math.floor((centerPlanX - planHalfWidth - MAP_BOUNDS.xMin) / GRID_STEP));
  const gridXMax = Math.min(gridWidth - 1, Math.ceil((centerPlanX + planHalfWidth - MAP_BOUNDS.xMin) / GRID_STEP));
  const gridZMin = Math.max(0, Math.floor((floor.z - planHalfDepth - MAP_BOUNDS.zMin) / GRID_STEP));
  const gridZMax = Math.min(gridDepth - 1, Math.ceil((floor.z + planHalfDepth - MAP_BOUNDS.zMin) / GRID_STEP));
  for (let gridZ = gridZMin; gridZ <= gridZMax; gridZ += 1) {
    for (let gridX = gridXMin; gridX <= gridXMax; gridX += 1) {
      if (!surfaceContainsPlanPoint(floor, planXAt(gridX), planZAt(gridZ))) continue;
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

function assertBlockedPlanLine(id, start, end, inset = 0.4) {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const length = Math.hypot(deltaX, deltaZ);
  assert.ok(length > inset * 2, `${id} must have enough length for an interior collision audit.`);
  const sampleCount = Math.max(1, Math.ceil((length - inset * 2) / GRID_STEP));
  const misses = [];
  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const distance = inset + (length - inset * 2) * sample / sampleCount;
    const x = start.x + deltaX * distance / length;
    const z = start.z + deltaZ * distance / length;
    if (!isBlocked(x, z)) misses.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
  assert.deepEqual(misses, [], `${id} has collision gaps at ${misses.join(", ")}.`);
}

function assertBlockedPlanSegment(id, { xMin, xMax, zMin, zMax }, inset = 0.4) {
  assertBlockedPlanLine(id, { x: xMin, z: zMin }, { x: xMax, z: zMax }, inset);
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

const theater1 = auditoriumByNumber.get(1);
const theater2 = auditoriumByNumber.get(2);
assert.equal(T12_TICKET_SHIFT_X, 1, "V15 T1/T2 ticket-ward translation");
assert.deepEqual(theater1.bounds, { xMin: -24.5, xMax: -15, zMin: 42.5, zMax: 55.5 });
assert.deepEqual(theater2.bounds, { xMin: -34, xMax: -24.5, zMin: 42.5, zMax: 55.5 });
assert.deepEqual(theater1.entry.cubbyBounds, { xMin: -24.5, xMax: -21.3, zMin: 51.9, zMax: 55.5 });
assert.deepEqual(theater2.entry.cubbyBounds, { xMin: -27.7, xMax: -24.5, zMin: 51.9, zMax: 55.5 });
assert.equal(theater1.bounds.xMin, theater2.bounds.xMax, "Translated T1/T2 bowls must retain one shared wall.");
assert.equal(theater1.entry.cubbyBounds.xMin, theater2.entry.cubbyBounds.xMax, "Translated T1/T2 cubbies must remain back-to-back.");

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
assert.deepEqual(theater3.bounds, { xMin: -21.8, xMax: -4.3, zMin: 72, zMax: 99 });
assert.deepEqual(theater3Route, { xMin: -6.7, xMax: -4.3, zMin: 68.2, zMax: 99 });
assert.deepEqual(theater3.entry.usherNookBounds, { xMin: -9.9, xMax: -6.7, zMin: 68.2, zMax: 72 });
assert.deepEqual(theater3.entry.ramp.bounds, { xMin: -6.7, xMax: -4.3, zMin: 82.5, zMax: 94.5 });
assert.deepEqual(storage3.bounds, { xMin: -21.5, xMax: -9.9, zMin: 72, zMax: 82.5 });
assert.deepEqual(storage3.accessHall, { xMin: -21.5, xMax: -9.9, zMin: 68.2, zMax: 72 });
assert.deepEqual(storage3.doorCenters, [-18.6, -12.3]);
assert.deepEqual(theater3Door, { targetId: "theater-3", center: -5.5, width: 2.4 });
assert.equal(theater3.bounds.xMax, theater3Route.xMax, "T3 direct route must finish flush with the bowl east edge.");
assert.equal(theater3.entry.directAuditoriumEntry, true, "T3 must use the direct auditorium route.");
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
    id: "theater-3-straight-arrival",
    x: theater3RouteCenterX,
    z: theater3.entry.arrivalZ + 0.7,
  },
  {
    id: "theater-3-straight-rear-route",
    x: theater3RouteCenterX,
    z: theater3Route.zMax - 1,
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
const futureUpstairs = serviceById.get("future-upstairs-stair");
assert.equal(futureUpstairs.entrySide, "east");
assert.equal(futureUpstairs.bounds.xMax, theater6.entry.vestibuleBounds.xMin, "T6 vestibule west wall must own the shared stair boundary.");
assert.ok(futureUpstairs.doorCenter - futureUpstairs.doorWidth / 2 > theater6.entry.vestibuleBounds.zMin
  && futureUpstairs.doorCenter + futureUpstairs.doorWidth / 2 < theater6.entry.vestibuleBounds.zMax,
"Future stair door must fit inside the short T6 vestibule.");
assert.equal(
  isBlocked(theater6.bounds.xMin, (theater6.entry.vestibuleBounds.zMin + futureUpstairs.doorCenter - futureUpstairs.doorWidth / 2) / 2),
  true,
  "The short T6 west-wall jamb south of the future stair leaf must remain solid.",
);
assertBlockedPlanSegment("T6 west wall north of future stair leaf", {
  xMin: theater6.bounds.xMin,
  xMax: theater6.bounds.xMin,
  zMin: futureUpstairs.doorCenter + futureUpstairs.doorWidth / 2,
  zMax: theater6.entry.vestibuleBounds.zMax,
}, 0.15);
assert.equal(isBlocked(theater6.bounds.xMin, futureUpstairs.doorCenter), true, "Closed future stair leaf must block its portal.");
navigationTargets.push({
  id: "theater-6-future-stair-leaf-vestibule-side",
  x: theater6.bounds.xMin + 0.7,
  z: futureUpstairs.doorCenter,
});
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
assert.deepEqual(trash.bounds, { xMin: -21.62, xMax: -13.62, zMin: 59.7, zMax: 62.2 });
assert.deepEqual(boys.bounds, { xMin: -21.62, xMax: -6.82, zMin: 62.2, zMax: 68.2 });
assert.deepEqual(boysMain, { xMin: -21.62, xMax: -6.82, zMin: 64.7, zMax: 68.2 });
assert.deepEqual(boysLobe, { xMin: -9.47, xMax: -6.82, zMin: 62.2, zMax: 64.7 });
assert.deepEqual(boysFountainWall.bounds, { xMin: -13.62, xMax: -11.72, zMin: 59.7, zMax: 62.2 });
assert.deepEqual(boysEntryCubby.bounds, { xMin: -11.72, xMax: -9.47, zMin: 62.2, zMax: 64.7 });
assertNear(boysEntryCubby.bounds.xMax - boysEntryCubby.bounds.xMin, 2.25, "V10 MEN cubby width");
assert.deepEqual(boys.entry, { side: "west", coordinate: -9.47, center: 63.45, width: 1.9 });
assert.equal(trash.bounds.xMax, boysFountainWall.bounds.xMin, "Trash must share the solid fountain wall at x=-13.62.");
assert.equal(boysFountainWall.bounds.xMax, boysEntryCubby.bounds.xMin, "H2O must meet the MEN cubby.");
assert.equal(boysEntryCubby.bounds.xMax, boysLobe.xMin, "MEN cubby must terminate at the restroom entry door.");
assert.equal(boysLobe.zMax, boysMain.zMin, "MEN lobe must open into the BB main room.");
assert.equal(boysMain.zMax, storage3.accessHall.zMin, "BB and T3 storage must share the z=68.2 containment wall.");
assertNear(theater3Door.center - theater3Door.width / 2 - boysMain.xMax, 0.12, "Actual BB wall-to-T3 jamb reveal");
assert.equal(storage3.accessHall.xMax, -9.9, "The BB/storage shared wall must end at the storage/nook seam.");
assert.deepEqual(
  EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").map(({ id, position, rotation }) => ({ id, position, rotation })),
  [
    { id: "boys-water-fountain-1", position: [-13.36, 0, 60.53], rotation: -Math.PI / 2 },
    { id: "boys-water-fountain-2", position: [-13.36, 0, 61.33], rotation: -Math.PI / 2 },
  ],
  "V10 fountains must move only a few inches with the x=-13.62 transition wall.",
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
assertOpenPlanPoint(
  "open wide-hall apron between H2O and MEN",
  boysFountainWall.bounds.xMax,
  (boysFountainWall.bounds.zMin + boysFountainWall.bounds.zMax) / 2,
);
assertBlockedPlanSegment("solid BB/T3-storage shared wall", {
  xMin: storage3.accessHall.xMin,
  xMax: storage3.accessHall.xMax,
  zMin: storage3.accessHall.zMin,
  zMax: storage3.accessHall.zMin,
});
const fountainApproachX = boysFountainWall.bounds.xMin + 1.0;
const boysStallBank = boys.fixtures.stalls.find(({ side }) => side === "south");
assert.equal(boysStallBank.recessedIntoWall, true, "Men's stalls must be recessed without changing the restroom route.");
assert.deepEqual(boysStallBank.recessBounds, { xMin: -21.17, xMax: -11.87, zMin: 63.55, zMax: 64.7 });
assert.equal(boysStallBank.recessBounds.zMax, boysMain.zMin, "Stall recess must meet the existing main room at one exact seam.");
assertNear(boysStallBank.recessBounds.zMax - boysStallBank.recessBounds.zMin, boysStallBank.depth, "Stall recess must preserve the bank depth.");
const boysAisleZ = boysMain.zMin + 0.6;
assertOpenPlanPoint("expanded men's aisle after stall recess", (boysMain.xMin + boysMain.xMax) / 2, boysAisleZ);
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
assert.deepEqual(theater9.bounds, { xMin: 99.6, xMax: 110.1, zMin: 42, zMax: 55.5 });
assert.equal(theater9.entry.center, 102.7);
assert.equal(theater9.entry.turnSide, "east");
assert.equal(theater9.entry.innerDoorCenter, 53.25);
assertNear(theater9Cubby.xMin, 101.1, "T9 cubby xMin");
assertNear(theater9Cubby.xMax, 104.3, "T9 cubby xMax");
assertNear(theater9Cubby.zMin, 52.1, "T9 cubby zMin");
assertNear(theater9Cubby.zMax, 55.5, "T9 cubby zMax");
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
navigationTargets.push({ id: "girls-restroom-main", ...boundsCenter(girls.footprintRects[0]) });
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

for (const number of [9, 10, 11, 12, 13, 14]) {
  const auditorium = auditoriumByNumber.get(number);
  assertOpenPlanPoint(`T${number} hall portal`, auditorium.entry.center, auditorium.bounds.zMax);
  navigationTargets.push({ id: `theater-${number}-hall-side`, x: auditorium.entry.center, z: auditorium.bounds.zMax + 0.7 });
}
for (const number of [6, 7, 8]) {
  const auditorium = auditoriumByNumber.get(number);
  assertOpenPlanPoint(`T${number} hall portal`, auditorium.entry.center, auditorium.bounds.zMin);
  navigationTargets.push({ id: `theater-${number}-hall-side`, x: auditorium.entry.center, z: auditorium.bounds.zMin - 0.7 });
}
assertOpenPlanPoint("Girls restroom portal", girls.entry.coordinate, girls.entry.center);
assertOpenPlanPoint("Candy storage portal", candy.doorCenter, candy.bounds.zMin);

assertNear(FOUNTAIN_PLAN.shiftZ, 0.59, "V13 fountain-island rearward shift");
assertNear(FOUNTAIN_PLAN.centerZ, 64.19, "V13 fountain-island center Z");
assert.deepEqual(
  FOUNTAIN_PLAN.island,
  { xMin: -0.5, xMax: 12.1, zMin: 63.48, zMax: 64.9 },
  "The fountain-island footprint must move rearward without changing its size.",
);
assertNear(FOUNTAIN_PLAN.rearPassage, 2.4, "fountain rear working passage");
assertNear(COURTYARD_PLAN.waistPartition.zMin, FOUNTAIN_PLAN.island.zMin, "partition/fountain shifted front edge");
assert.equal(
  EQUIPMENT_ANCHORS.filter(({ roomId }) => roomId === "soda-service")
    .every(({ position }) => position[2] === FOUNTAIN_PLAN.centerZ),
  true,
  "Every ICEE/soda fixture must move with the V13 fountain island.",
);
const fountainCenterX = (FOUNTAIN_PLAN.island.xMin + FOUNTAIN_PLAN.island.xMax) / 2;
const fountainRearAisleZ = (FOUNTAIN_PLAN.island.zMax + FOUNTAIN_PLAN.rearCounter.zMin) / 2;
assert.equal(isBlocked(fountainCenterX, FOUNTAIN_PLAN.centerZ), true, "The shifted fountain island must retain solid collision.");
navigationTargets.push(
  { id: "fountain-south-approach", x: fountainCenterX, z: FOUNTAIN_PLAN.island.zMin - 0.7 },
  { id: "fountain-working-aisle", x: fountainCenterX, z: fountainRearAisleZ },
);
navigationTargets.push(
  { id: "low-court-west-side", x: -5.8, z: FOUNTAIN_PLAN.centerZ },
  { id: "low-court-rear-aisle", x: fountainCenterX, z: fountainRearAisleZ },
  { id: "low-court-east-side", x: 16.2, z: FOUNTAIN_PLAN.centerZ },
);
navigationTargets.push(
  { id: "t3-task-partition-west", x: COURTYARD_PLAN.waistPartition.x - 0.7, z: 65.5 },
  { id: "t3-task-partition-east", x: COURTYARD_PLAN.waistPartition.x + 0.7, z: 65.5 },
);
const [westFountainPillar, eastFountainPillar] = FOUNTAIN_PLAN.pillars;
const partitionEastFace = COURTYARD_PLAN.waistPartition.x + COURTYARD_PLAN.waistPartition.thickness / 2;
const westPillarWestFace = westFountainPillar.position[0] - westFountainPillar.footprint[0] / 2;
const westSqueezeCenterX = (partitionEastFace + westPillarWestFace) / 2;
const westSqueezeWidth = westPillarWestFace - partitionEastFace;
assertNear(westSqueezeWidth, 1.11, "west fountain divider/pillar squeeze width");
assert.ok(westSqueezeWidth > PLAYER_RADIUS * 2 + 0.1, "West fountain squeeze must clear the player capsule.");
const eastPillarWestFace = eastFountainPillar.position[0] - eastFountainPillar.footprint[0] / 2;
const eastSqueezeCenterX = (FOUNTAIN_PLAN.island.xMax + eastPillarWestFace) / 2;
const eastSqueezeWidth = eastPillarWestFace - FOUNTAIN_PLAN.island.xMax;
assertNear(eastSqueezeWidth, 1.18, "east fountain counter/pillar squeeze width");
assert.ok(eastSqueezeWidth > PLAYER_RADIUS * 2 + 0.1, "East fountain squeeze must clear the player capsule.");
for (const [id, x] of [["west", westSqueezeCenterX], ["east", eastSqueezeCenterX]]) {
  assertOpenPlanPoint(`${id} fountain pillar squeeze`, x, westFountainPillar.position[2]);
  navigationTargets.push(
    { id: `fountain-${id}-pillar-south-mouth`, x, z: FOUNTAIN_PLAN.island.zMin - 0.35 },
    { id: `fountain-${id}-pillar-squeeze`, x, z: westFountainPillar.position[2] },
    { id: `fountain-${id}-pillar-north-mouth`, x, z: FOUNTAIN_PLAN.island.zMax + 0.55 },
  );
}

assert.equal(LOBBY_SHIFT_X, 8.3, "V13 retains the authoritative lobby X translation.");
assertNear(LOBBY_CEILING_PLAN.highHeight, LOBBY_CEILING_PLAN.baseHeight * 3, "triple-height stone-floor lobby ceiling");
assert.deepEqual(LOBBY_CEILING_PLAN.highPublicSpaceIds, ["lobby"], "Only the stone-floor lobby may retain the triple-height roof.");
assert.equal(FOUNTAIN_PLAN.pillars.every(({ height }) => height === LOBBY_CEILING_PLAN.baseHeight), true, "Fountain pillars must terminate at the low court roof.");
assert.equal(LOBBY_PLAN.kiosks.length, 3, "V13 circulation smoke expects exactly three kiosks.");
assert.deepEqual(
  LOBBY_PLAN.kiosks.map(({ position }) => position[2]),
  [0.5, 2.5, 4.5],
  "The three kiosks must retain their two-metre cadence while clearing the stair foot.",
);
assertNear(
  LOBBY_PLAN.futureStairs.zMin - (LOBBY_PLAN.kiosks.at(-1).position[2] + 0.9 / 2),
  0.15,
  "third-kiosk/stair-foot clearance",
);
for (const kiosk of LOBBY_PLAN.kiosks) {
  navigationTargets.push({
    id: `${kiosk.id}-customer-approach`,
    x: kiosk.position[0] - 1.2,
    z: kiosk.position[2],
  });
}
navigationTargets.push({
  id: "box-office-pos-customer-approach",
  x: LOBBY_PLAN.boxOfficePos.position[0] - 1.45,
  z: LOBBY_PLAN.boxOfficePos.position[2],
});
assert.deepEqual(
  LOBBY_PLAN.boxOfficeVertical,
  { xMin: 9.559999999999999, xMax: 10.659999999999998, zMin: 4.4, zMax: 11.9 },
  "V13 must keep the narrow box-office long leg.",
);
assert.deepEqual(
  LOBBY_PLAN.boxOfficeReturn,
  { xMin: 9.559999999999999, xMax: 12.709999999999999, zMin: 4.4, zMax: 5.1000000000000005 },
  "V13 must keep the compact half-length box-office return.",
);
assertNear(LOBBY_PLAN.boxOfficeReturn.xMax, LOBBY_PLAN.futureStairs.xMin, "box-office return flush to stair wall");
assertNear(LOBBY_PLAN.boxOfficeReturn.xMax - LOBBY_PLAN.boxOfficeReturn.xMin, 3.15, "half-length box-office return");
assertNear(LOBBY_PLAN.boxOfficeReturn.zMax - LOBBY_PLAN.boxOfficeReturn.zMin, 0.7, "narrow box-office return depth");
assertNear(
  LOBBY_PLAN.futureStairs.xMin - TICKET_APPROACH_PLAN.bounds.xMax,
  LOBBY_PLAN.futureStairWall.approachReveal,
  "ticket-approach/stair short reveal",
);
assertNear(LOBBY_PLAN.futureStairWall.approachReveal, 0.61, "two-foot ticket-approach/stair reveal");
assert.equal(LOBBY_PLAN.futureStairWall.finish, "white", "The exposed future-stair wall must use the white hallway finish.");
assert.equal(LOBBY_PLAN.futureStairWall.materialKey, "wall", "The white stair wall must use the standard hallway wall material.");
for (const [key, expected] of Object.entries({ xMin: 12.71, xMax: 15.11, zMin: 5.1, zMax: 21.5 })) {
  assertNear(LOBBY_PLAN.futureStairs[key], expected, `V15 narrow stair ${key}`);
}
const lobbyStair = LOBBY_PLAN.lobbyStair;
assert.deepEqual(lobbyStair.bounds, LOBBY_PLAN.futureStairs);
assertNear(lobbyStair.clearWidth, 2.4, "lobby stair clear width");
assert.equal(lobbyStair.treadCount, 26);
assert.ok(lobbyStair.stepRise <= 0.22, "Lobby stair risers must remain walkable.");
assert.equal(lobbyStair.bottomLanding.zMax, lobbyStair.flightBounds.zMin, "Stair bottom landing/flight seam");
assert.equal(lobbyStair.flightBounds.zMax, lobbyStair.topLanding.zMin, "Stair flight/top landing seam");
assert.equal(lobbyStair.solidLobbyWall.zMax, lobbyStair.exposedRailing.zMin, "The short privacy wall must hand off directly to the open railing.");
assert.equal(lobbyStair.exposedRailing.zMax, lobbyStair.bounds.zMax, "The open railing must continue to the upstairs doorway.");
const lobbyStairCenterX = (lobbyStair.bounds.xMin + lobbyStair.bounds.xMax) / 2;
assertNear(
  world.groundHeight(planToWorldX(lobbyStairCenterX), (lobbyStair.bottomLanding.zMin + lobbyStair.bottomLanding.zMax) / 2, 0),
  lobbyStair.bottomY,
  "lobby stair bottom landing sampler",
);
let previousStairHeight = lobbyStair.bottomY;
for (let index = 0; index < lobbyStair.treadCount; index += 1) {
  const z = lobbyStair.flightBounds.zMin + (index + 0.5) * lobbyStair.treadDepth;
  const expectedHeight = (index + 1) * lobbyStair.stepRise;
  const actualHeight = world.groundHeight(planToWorldX(lobbyStairCenterX), z, expectedHeight);
  assertNear(actualHeight, expectedHeight, `lobby stair tread ${index + 1} sampler`);
  assert.ok(actualHeight > previousStairHeight, `lobby stair tread ${index + 1} must rise monotonically.`);
  previousStairHeight = actualHeight;
}
assertNear(
  world.groundHeight(planToWorldX(lobbyStairCenterX), (lobbyStair.topLanding.zMin + lobbyStair.topLanding.zMax) / 2, lobbyStair.topY),
  lobbyStair.topY,
  "lobby stair top landing sampler",
);
assert.deepEqual(
  world.colliders.filter(({ id }) => id === "future-stair-construction-wall" || id.startsWith("future-stair-south-cap-")).map(({ id }) => id),
  [],
  "The former construction wall and full-width south cap must not block the real stair.",
);
assert.ok(
  world.colliders.filter(({ id }) => /^lobby-stair-(?:west|east)-rail-/.test(id)).length >= 2,
  "Both open stair edges need physical guard rails.",
);
const raisedDoorCollider = world.colliders.find(({ id }) => id === "lobby-stair-upper-door-closed-leaf");
assert.ok(raisedDoorCollider, "The upstairs landing needs its closed door.");
assertNear(raisedDoorCollider.minY, lobbyStair.upperDoor.baseY, "upstairs door collider sill");

assertNear(LOBBY_PLAN.barScreen.width, 7.3, "bar wall screen width");
assertNear(LOBBY_PLAN.barScreen.height, 4.3, "bar wall screen height");
assertNear(LOBBY_PLAN.barScreen.intervalSeconds, 10, "bar wall screen interval");
assert.deepEqual(LOBBY_PLAN.barScreen.slideIds, ["island-grill", "garlic-fries-feature", "fries-and-rings", "previews-and-morning"]);
assertNear(LOBBY_PLAN.oppositeLobbyMural.width, 16.4, "opposite lobby mural width");
assertNear(LOBBY_PLAN.oppositeLobbyMural.height, 4.3, "opposite lobby mural height");
assert.equal(LOBBY_PLAN.oppositeLobbyMural.distinctFrom, "concession-botanical-mural", "The stair/kiosk mural must remain distinct from the concession mural.");
assert.deepEqual(
  LOBBY_PLAN.boxOfficeSightline.bounds,
  { xMin: 9.559999999999999, xMax: 10.659999999999998, zMin: 11.9, zMax: 55.5 },
  "The compact cubby must preserve a straight sightline to the ticket hall.",
);
assertNear(LOBBY_PLAN.boxOfficeSightline.axisX, 10.11, "box-office/ticket-hall sightline axis");
for (const z of [12.6, 20.6, 22.3, 38.5, 54.6]) {
  assertOpenPlanPoint(`box-office sightline z=${z}`, LOBBY_PLAN.boxOfficeSightline.axisX, z);
  navigationTargets.push({ id: `box-office-sightline-${z}`, x: LOBBY_PLAN.boxOfficeSightline.axisX, z });
}
const concessionStaffNormal = LOBBY_PLAN.concessionRun.guestNormal;
for (const serviceItem of CONCESSION_SERVICE_SEQUENCE) {
  navigationTargets.push({
    id: `${serviceItem.id}-staff-aisle`,
    x: serviceItem.position[0] - concessionStaffNormal.x * 1.35,
    z: serviceItem.position[2] - concessionStaffNormal.z * 1.35,
  });
}
const expoSection = LOBBY_PLAN.customerCounterSections.find(({ role }) => role === "expo");
const expoStart = LOBBY_PLAN.customerCounter[expoSection.segmentIndex];
const expoEnd = LOBBY_PLAN.customerCounter[expoSection.segmentIndex + 1];
navigationTargets.push({
  id: "concession-expo-staff-aisle",
  x: (expoStart.x + expoEnd.x) / 2 - concessionStaffNormal.x * 1.35,
  z: (expoStart.z + expoEnd.z) / 2 - concessionStaffNormal.z * 1.35,
});
const podium = LOBBY_PLAN.ticketPodium;
navigationTargets.push(
  { id: "central-lectern-approach-side", x: podium.position[0], z: podium.position[2] - 1 },
  { id: "central-lectern-hall-side", x: podium.position[0], z: podium.position[2] + 1 },
  { id: "translated-lobby-to-approach-seam-lobby", x: podium.position[0], z: LOBBY_PLAN.envelope.zMax - 0.8 },
  { id: "translated-lobby-to-approach-seam-hall", x: podium.position[0], z: LOBBY_PLAN.envelope.zMax + 0.8 },
);
addBoundsTarget("ticket-poster-alcove", TICKET_APPROACH_PLAN.posterAlcove);
addBoundsTarget("ticket-empty-alcove", TICKET_APPROACH_PLAN.emptyAlcove);

assert.equal(FRONT_SHIFT_Z, -2.5);
assert.deepEqual(HALL_PLAN.narrow, { xMin: -40, xMax: -13.62, zMin: 55.5, zMax: 59.7 });
assert.deepEqual(HALL_PLAN.wide, { xMin: -13.62, xMax: 113, zMin: 55.5, zMax: 62.2 });
assertNear(HALL_PLAN.wide.xMax - HALL_PLAN.narrow.xMin, 153, "V10 full hall X length");
for (const [id, bounds] of [["hall-narrow", HALL_PLAN.narrow], ["hall-wide", HALL_PLAN.wide]]) {
  const inset = 0.8;
  navigationTargets.push(
    { id: `${id}-southwest`, x: bounds.xMin + inset, z: bounds.zMin + inset },
    { id: `${id}-northeast`, x: bounds.xMax - inset, z: bounds.zMax - inset },
    { id: `${id}-center`, ...boundsCenter(bounds) },
  );
}
navigationTargets.push({
  id: "hall-step-wide-side",
  x: HALL_PLAN.transitionX + 0.8,
  z: (HALL_PLAN.narrowNorthZ + HALL_PLAN.wideNorthZ) / 2,
});
assert.equal(
  isBlocked(HALL_PLAN.transitionX - 0.2, (HALL_PLAN.narrowNorthZ + HALL_PLAN.wideNorthZ) / 2),
  true,
  "The added wide-hall band must not leak west past the drinking-fountain wall.",
);
assert.equal(
  isBlocked(HALL_PLAN.transitionX, (HALL_PLAN.narrowNorthZ + HALL_PLAN.wideNorthZ) / 2),
  true,
  "The drinking-fountain transition wall must be solid.",
);
const exitFootprintBySegment = { narrow: HALL_PLAN.narrow, wide: HALL_PLAN.wide };
for (const exit of HALL_END_EXITS) {
  const footprint = exitFootprintBySegment[exit.segment];
  assert.ok(footprint, `${exit.id} must identify its hall leg.`);
  assertNear(exit.z, (footprint.zMin + footprint.zMax) / 2, `${exit.id} leg center`);
  const insideX = exit.x + (exit.side === "west" ? 0.8 : -0.8);
  const outsideX = exit.x + (exit.side === "west" ? -0.8 : 0.8);
  navigationTargets.push({ id: `${exit.id}-inside`, x: insideX, z: exit.z });
  assert.equal(isReachable(outsideX, exit.z), false, `${exit.id} closed leaf must contain the exterior side.`);
}

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

const deadSpace = LOBBY_PLAN.kitchenDeadSpace;
assert.deepEqual(
  deadSpace.vertices,
  [
    { x: -19, z: 14.8 },
    { x: -13.73333333333333, z: 15 },
    { x: -13.810416666666663, z: 14.8 },
  ],
  "V14 must seal only the tiny triangular floor-mismatch wedge.",
);
assert.equal(deadSpace.separatingWall.id, "kitchen-dead-wedge-separating-wall");
assert.deepEqual(deadSpace.separatingWall.start, LOBBY_PLAN.kitchenPartition[2]);
assert.deepEqual(deadSpace.separatingWall.end, deadSpace.vertices[2]);
assertNear(deadSpace.area, 0.5189583333333319, "tiny dead-wedge area");
assertNear(deadSpace.maxDepth, 0.2, "tiny dead-wedge depth");
assertBlockedPlanLine(
  "kitchen dead-wedge separating wall",
  deadSpace.separatingWall.start,
  deadSpace.separatingWall.end,
);
assertBlockedPlanLine(
  "kitchen dead-wedge partition edge",
  LOBBY_PLAN.kitchenPartition[2],
  LOBBY_PLAN.kitchenPartition[3],
);
assert.equal(
  isBlocked(
    (LOBBY_PLAN.kitchenPartition[3].x + deadSpace.vertices[2].x) / 2,
    (LOBBY_PLAN.kitchenPartition[3].z + deadSpace.vertices[2].z) / 2,
  ),
  true,
  "The short third edge of the tiny wedge must meet the two-thirds concession wall without a leak.",
);
const deadSpaceCentroid = deadSpace.vertices.reduce(
  (center, vertex) => ({
    x: center.x + vertex.x / deadSpace.vertices.length,
    z: center.z + vertex.z / deadSpace.vertices.length,
  }),
  { x: 0, z: 0 },
);
assert.equal(
  isReachable(deadSpaceCentroid.x, deadSpaceCentroid.z),
  false,
  "The sealed tiny kitchen wedge must not be reachable from the lobby or kitchen.",
);

const connectorNook = LOBBY_PLAN.kitchenConnectorNook;
assert.equal(connectorNook.id, "kitchen-storage-connector-nook");
assert.deepEqual(connectorNook.vertices, [
  LOBBY_PLAN.kitchenPartition[2],
  deadSpace.vertices[2],
  LOBBY_PLAN.kitchenPartition[5],
]);
assert.equal(connectorNook.preservedDoorSegment, LOBBY_PLAN.kitchenStorageDoor.partitionSegment);
assert.deepEqual(connectorNook.preservedBackWallSegments, [3, 4]);
const connectorNookCentroid = connectorNook.vertices.reduce(
  (center, vertex) => ({
    x: center.x + vertex.x / connectorNook.vertices.length,
    z: center.z + vertex.z / connectorNook.vertices.length,
  }),
  { x: 0, z: 0 },
);
assert.equal(
  isReachable(connectorNookCentroid.x, connectorNookCentroid.z),
  true,
  "Restoring the V12 floorplan means the kitchen-storage connector nook must remain traversable.",
);
navigationTargets.push({ id: "kitchen-storage-connector-nook", ...connectorNookCentroid });

assert.deepEqual(
  LOBBY_PLAN.kitchenCeiling.legacyBounds,
  { xMin: -20.7, xMax: -9.5, zMin: 14.5, zMax: 21.5 },
  "The original kitchen envelope remains a trace reference only.",
);
assert.equal(Object.hasOwn(LOBBY_PLAN.kitchenCeiling, "bounds"), false, "The obsolete rectangular kitchen roof must not remain active.");
assert.deepEqual(
  LOBBY_PLAN.kitchenCeiling.surfaces.map(({ id }) => id),
  ["kitchen-complete-ceiling", "kitchen-connector-nook-ceiling"],
  "The kitchen and connector nook need separate traced roof owners.",
);
assert.deepEqual(LOBBY_PLAN.kitchenCeiling.surfaces[1], connectorNook.ceiling);
assert.deepEqual(
  LOBBY_PLAN.kitchenCeiling.closureSurfaceIds,
  [
    "kitchen-complete-ceiling",
    "kitchen-connector-nook-ceiling",
    "kitchen-dead-wedge-ceiling",
    LOBBY_PLAN.muralFacade.soffit.id,
  ],
  "Four edge-sharing, non-overlapping surfaces must close the kitchen, connector nook, tiny wedge, and mural underside.",
);
for (const surface of structuralCeilingPolygons) {
  const selfIntersections = polygonProperSelfIntersections(surface.vertices);
  assert.deepEqual(selfIntersections, [], `${surface.id} self-intersects at ${selfIntersections.join(", ")}.`);
}
for (let firstIndex = 0; firstIndex < structuralCeilingPolygons.length; firstIndex += 1) {
  for (let secondIndex = firstIndex + 1; secondIndex < structuralCeilingPolygons.length; secondIndex += 1) {
    const first = structuralCeilingPolygons[firstIndex];
    const second = structuralCeilingPolygons[secondIndex];
    assert.equal(
      polygonsHaveInteriorOverlap(first.vertices, second.vertices),
      false,
      `${first.id} and ${second.id} may share a closure edge but must not overlap and flash.`,
    );
  }
}
navigationTargets.push(
  { id: "kitchen-west-service-aisle", x: -19.2, z: 18.3 },
  { id: "kitchen-center-service-aisle", x: -17, z: 18.3 },
  { id: "kitchen-east-service-aisle", x: -14.6, z: 18.3 },
);

const officeAttic = LOBBY_PLAN.officeAttic;
assertNear(officeAttic.baseY, LOBBY_CEILING_PLAN.baseHeight, "office attic starts at the low service roof");
assertNear(officeAttic.topY, LOBBY_PLAN.muralFacade.topY, "office attic wall reaches the mural top");
assert.deepEqual(officeAttic.doorWall.start, { x: -16.2, z: -2.1 });
assert.deepEqual(officeAttic.doorWall.end, { x: -16.2, z: 1.2999999999999998 });

const muralFacade = LOBBY_PLAN.muralFacade;
assert.deepEqual(muralFacade.axis.start, LOBBY_PLAN.kitchenPartition.at(-1), "The mural must begin at the left side of the kitchen door.");
assert.deepEqual(muralFacade.axis.end, { x: LOBBY_PLAN.backBar.xMin, z: LOBBY_PLAN.backBar.zMin }, "The mural must end at the isolated bar start.");
assertNear(muralFacade.surround.width, 18.115256001503266, "literal kitchen-door-to-bar mural span");
assertNear(muralFacade.artwork.width, 9.588342918079668, "preserved V12 mural artwork width");
assertNear(muralFacade.artwork.height, 4.3, "preserved V12 mural artwork height");
assert.equal(muralFacade.grayFills.length, 2, "Both exposed gray mural side fills must remain authored.");
assert.deepEqual(muralFacade.surround.verticalGrayFill, { top: 0, bottom: 0 }, "There must be no gray field above or below the artwork.");
assert.ok(muralFacade.grayFills.every(({ width, height }) => (
  width >= muralFacade.artwork.width * 0.4
  && width < muralFacade.artwork.width * 0.5
  && Math.abs(height - muralFacade.artwork.height) <= GEOMETRY_EPSILON
)), "Both gray side fields must be nearly half the artwork width and exactly its height.");
assertNear(
  muralFacade.grayFills[0].width + muralFacade.artwork.width + muralFacade.grayFills[1].width,
  muralFacade.surround.width,
  "gray fills plus unchanged artwork span the full mural surround",
);
assert.deepEqual(muralFacade.soffit.vertices, [
  { x: -16.2, z: 5.2548023333959675 },
  { x: -8.573901425559662, z: 19.826097823844478 },
  LOBBY_PLAN.kitchenPartition[3],
  LOBBY_PLAN.kitchenPartition[4],
  LOBBY_PLAN.kitchenPartition[5],
  LOBBY_PLAN.kitchenPartition[6],
], "The soffit must be the simple clipped gap between the long facade and rear kitchen wall.");

const overhead = LOBBY_PLAN.overheadMechanicals;
assert.equal(overhead.ducts.length, 6, "Six large ducts must span the exposed mural volume.");
assert.equal(overhead.pipes.length, 18, "Eighteen substantial pipe runs must span the exposed mural volume.");
assert.ok(overhead.minClearanceY > muralFacade.topY, "All exposed mechanicals must remain above the mural.");
const overheadPoints = [...overhead.ducts, ...overhead.pipes].flatMap(({ start, end }) => [start, end]);
assertNear(Math.min(...overheadPoints.map(({ x }) => x)), overhead.coverageBounds.xMin, "overhead west extent");
assertNear(Math.max(...overheadPoints.map(({ x }) => x)), overhead.coverageBounds.xMax, "overhead east extent");
assertNear(Math.min(...overheadPoints.map(({ z }) => z)), overhead.coverageBounds.zMin, "overhead south extent");
assertNear(Math.max(...overheadPoints.map(({ z }) => z)), overhead.coverageBounds.zMax, "overhead north extent");

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

function structuralSurfaceAt(surfaces, planX, planZ, tolerance = 0.05) {
  if (surfaces.some((surface) => surfaceContainsPlanPoint(surface, planX, planZ, tolerance))) return true;
  if (surfaces !== structuralCeilings) return false;
  return structuralCeilingPolygons.some(({ vertices }) => (
    polygonContainsPlanPoint(vertices, { x: planX, z: planZ })
  ));
}

const ceilingRouteFailures = navigationTargets.filter(({ x, z }) => !structuralSurfaceAt(structuralCeilings, x, z));
assert.deepEqual(
  ceilingRouteFailures.map(({ id }) => id),
  [],
  `Targets require missing/invisible ceiling geometry: ${ceilingRouteFailures.map(({ id }) => id).join(", ")}`,
);

const farVoidProbes = [
  { id: "rear-center", x: 0, z: 95 },
  { id: "rear-east-of-theater-3-route", x: theater3Route.xMax + 0.8, z: 97 },
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
  { id: "old-theater-6-long-route-ghost", x: 59, z: 78 },
  { id: "v9-theater-7-vacated-gap", x: 82.5, z: 80 },
  { id: "v9-theater-8-vacated-slab", x: 112, z: 80 },
  { id: "v9-theater-10-vacated-slab", x: 97, z: 48 },
  { id: "v9-theater-12-vacated-slab", x: 54.5, z: 48 },
  { id: "v11-old-kitchen-west-ghost", x: -34, z: 10 },
  { id: "v11-old-front-walk-west-ghost", x: -24, z: -7.5 },
  { id: "v11-old-service-west-ghost", x: -33, z: 15 },
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
const ghostStructureProbes = farVoidProbes.filter(({ id }) => id.startsWith("v9-") || id.startsWith("v11-"));
const retainedGhostStructures = ghostStructureProbes.filter(({ x, z }) => (
  structuralSurfaceAt(structuralFloors, x, z, 0.01)
  || structuralSurfaceAt(structuralCeilings, x, z, 0.01)
));
assert.deepEqual(
  retainedGhostStructures.map(({ id }) => id),
  [],
  `Vacated V9/V11 slabs retain floor/ceiling geometry: ${retainedGhostStructures.map(({ id }) => id).join(", ")}`,
);

world.dispose();
materials.dispose();

console.log(
  `Navigation smoke valid: 14 bowls + ${navigationTargets.length - 14} V15 route targets reachable under rendered floors/ceilings · narrow stair samples rise continuously · recessed men's aisle open · T1/T2 rigid shift preserved · V14 kitchen/mural regressions retained · geometry overlap-free.`,
);
