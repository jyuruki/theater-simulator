import assert from "node:assert/strict";

class FakeCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    const gradient = { addColorStop() {} };
    const finiteGeometryCall = (method) => (...values) => {
      for (const value of values) {
        assert.ok(Number.isFinite(value), `Canvas ${method} received a non-finite geometry argument: ${value}`);
      }
    };
    const context = {
      canvas: this,
      arc: finiteGeometryCall("arc"),
      bezierCurveTo: finiteGeometryCall("bezierCurveTo"),
      clearRect: finiteGeometryCall("clearRect"),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      ellipse: finiteGeometryCall("ellipse"),
      fillRect: finiteGeometryCall("fillRect"),
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      lineTo: finiteGeometryCall("lineTo"),
      measureText: (text) => ({ width: String(text).length * 12 }),
      moveTo: finiteGeometryCall("moveTo"),
      quadraticCurveTo: finiteGeometryCall("quadraticCurveTo"),
      rect: finiteGeometryCall("rect"),
      rotate: finiteGeometryCall("rotate"),
      strokeRect: finiteGeometryCall("strokeRect"),
      translate: finiteGeometryCall("translate"),
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
  CONCESSION_CANDY_DISPLAYS,
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
  POS_STATIONS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  T12_TICKET_SHIFT_X,
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
      rotationY: object.rotation.y,
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

function objectsByName(id) {
  const matches = [];
  scene.traverse((object) => {
    if (object.name === id) matches.push(object);
  });
  return matches;
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

function assertPlanSegment(id, start, end, {
  height,
  y,
  depth,
  materialName,
} = {}) {
  const segment = boxById(id);
  assertNear(segment.x, planToWorldX((start.x + end.x) / 2), `${id} center X`);
  assertNear(segment.z, (start.z + end.z) / 2, `${id} center Z`);
  assertNear(segment.width, Math.hypot(end.x - start.x, end.z - start.z), `${id} length`);
  assertNear(segment.rotationY, Math.atan2(end.z - start.z, end.x - start.x), `${id} rotation`);
  if (height !== undefined) assertNear(segment.height, height, `${id} height`);
  if (y !== undefined) assertNear(segment.y, y, `${id} center Y`);
  if (depth !== undefined) assertNear(segment.depth, depth, `${id} depth`);
  if (materialName !== undefined) assert.deepEqual(segment.materialNames, [materialName], `${id} material`);
  return segment;
}

function assertPolygonSlab(id, plan, label = id) {
  const slab = scene.getObjectByName(id);
  assert.ok(slab?.isMesh, `${label} must be a rendered mesh.`);
  assert.equal(objectsByName(id).length, 1, `${label} must be authored exactly once.`);
  assert.equal(slab.geometry.type, "ExtrudeGeometry", `${label} must follow its plan polygon.`);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(slab);
  const worldXs = plan.vertices.map(({ x }) => planToWorldX(x));
  const planZs = plan.vertices.map(({ z }) => z);
  assertNear(bounds.min.x, Math.min(...worldXs), `${label} minimum X`, 1e-5);
  assertNear(bounds.max.x, Math.max(...worldXs), `${label} maximum X`, 1e-5);
  assertNear(bounds.min.z, Math.min(...planZs), `${label} minimum Z`, 1e-5);
  assertNear(bounds.max.z, Math.max(...planZs), `${label} maximum Z`, 1e-5);
  assertNear(bounds.min.y, plan.elevation - plan.thickness / 2, `${label} underside`, 1e-5);
  assertNear(bounds.max.y, plan.elevation + plan.thickness / 2, `${label} top`, 1e-5);
  const positions = slab.geometry.getAttribute("position");
  const vertices = Array.from({ length: positions.count }, (_, index) => slab.localToWorld(new THREE.Vector3(
    positions.getX(index), positions.getY(index), positions.getZ(index),
  )));
  for (const [index, vertex] of plan.vertices.entries()) {
    for (const capY of [bounds.min.y, bounds.max.y]) {
      assert.ok(vertices.some((candidate) => (
        Math.abs(candidate.x - planToWorldX(vertex.x)) <= 1e-5
        && Math.abs(candidate.y - capY) <= 1e-5
        && Math.abs(candidate.z - vertex.z) <= 1e-5
      )), `${label} vertex ${index + 1} must exist on both solid caps.`);
    }
  }
  return { slab, bounds };
}

function assertPlanPipeSegment(plan, materialName, label = plan.id) {
  const matches = objectsByName(plan.id);
  assert.equal(matches.length, 1, `${label} must be authored exactly once.`);
  const pipe = matches[0];
  assert.ok(pipe.isMesh, `${label} must be a mesh.`);
  assert.equal(pipe.geometry.type, "CylinderGeometry", `${label} must use round pipe geometry.`);
  assert.equal(pipe.material.name, materialName, `${label} material`);

  const worldStart = new THREE.Vector3(planToWorldX(plan.start.x), plan.start.y, plan.start.z);
  const worldEnd = new THREE.Vector3(planToWorldX(plan.end.x), plan.end.y, plan.end.z);
  const expectedCenter = worldStart.clone().add(worldEnd).multiplyScalar(0.5);
  const expectedDirection = worldEnd.clone().sub(worldStart);
  const expectedLength = expectedDirection.length();
  expectedDirection.normalize();
  scene.updateMatrixWorld(true);
  const actualCenter = pipe.getWorldPosition(new THREE.Vector3());
  const actualAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(pipe.getWorldQuaternion(new THREE.Quaternion()));
  assertNear(actualCenter.x, expectedCenter.x, `${label} center X`, 1e-5);
  assertNear(actualCenter.y, expectedCenter.y, `${label} center Y`, 1e-5);
  assertNear(actualCenter.z, expectedCenter.z, `${label} center Z`, 1e-5);
  assertNear(pipe.scale.x, plan.radius * 2, `${label} diameter X`);
  assertNear(pipe.scale.y, expectedLength, `${label} true 3D length`, 1e-5);
  assertNear(pipe.scale.z, plan.radius * 2, `${label} diameter Z`);
  assertNear(actualAxis.dot(expectedDirection), 1, `${label} 3D endpoint orientation`, 1e-5);
  assert.equal(colliderIdsMatching(world, new RegExp(`^${plan.id}(?:$|-collider-)`)).length, 0, `${label} must remain overhead decoration, not collision.`);
  return pipe;
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

const serviceById = new Map(SERVICE_ROOMS.map((room) => [room.id, room]));
const publicById = new Map(PUBLIC_SPACES.map((room) => [room.id, room]));
const auditoriumByNumber = new Map(AUDITORIUMS.map((auditorium) => [auditorium.number, auditorium]));

assert.equal(world.stats.auditoriumCount, 14);
assert.equal(world.stats.seatCount, 1093);
assert.equal(world.stats.equipmentAnchors, 13);
assert.equal(world.stats.layoutVersion, "mililani-sketch-v16");
assert.ok(world.stats.meshCount > 0);
assert.ok(world.stats.colliderCount > 0);
assert.equal(world.auditoriumGroups.size, 14);
assert.equal(world.auditoriumLayouts.size, 14);

assertBoxMatchesBounds("main-corridor-narrow-floor", HALL_PLAN.narrow, "narrow hall floor");
assertBoxMatchesBounds("main-corridor-wide-floor", HALL_PLAN.wide, "wide hall floor");
assertBoxMatchesBounds("main-corridor-narrow-ceiling", HALL_PLAN.narrow, "narrow hall ceiling");
assertBoxMatchesBounds("main-corridor-wide-ceiling", HALL_PLAN.wide, "wide hall ceiling");
assert.deepEqual(
  authoredBoxes.filter(({ id }) => id === "main-corridor-floor" || id === "main-corridor-ceiling").map(({ id }) => id),
  [],
  "V10 must not retain the old single-rectangle hall surfaces.",
);
const hallExitById = new Map(HALL_END_EXITS.map((exit) => [exit.id, exit]));
for (const [id, footprint] of [["hall-west-exit", HALL_PLAN.narrow], ["hall-east-exit", HALL_PLAN.wide]]) {
  const exit = hallExitById.get(id);
  const wallSegments = authoredBoxes.filter(({ id: boxId }) => boxId.startsWith(`${id}-wall-segment-`));
  assert.ok(wallSegments.length >= 2, `${id} requires a player-width door in its own hall leg.`);
  assertNear(exit.z, (footprint.zMin + footprint.zMax) / 2, `${id} center in its hall leg`);
  assertNear(exit.x, id === "hall-west-exit" ? footprint.xMin : footprint.xMax, `${id} end plane`);
  for (const segment of wallSegments) {
    assertNear(segment.x, planToWorldX(exit.x), `${segment.id} exit plane X`);
  }
}

const shiftedRuntimeBoxes = [
  ["lobby-floor", { ...publicById.get("lobby").bounds, zMax: LOBBY_PLAN.envelope.zMax }],
  ["lobby-approach-floor", TICKET_APPROACH_PLAN.bounds],
  ["ticket-poster-alcove-floor", TICKET_APPROACH_PLAN.posterAlcove],
  ["ticket-empty-alcove-floor", TICKET_APPROACH_PLAN.emptyAlcove],
];
for (const [id, bounds] of shiftedRuntimeBoxes) assertBoxMatchesBounds(id, bounds, `${id} rigid shift`);
assert.equal(LOBBY_SHIFT_X, 8.3, "V14 retains the authoritative concession/office X translation.");
assert.equal(LOBBY_PLAN.kiosks.length, 3, "V14 must preserve exactly three ticket kiosks.");
for (const kiosk of LOBBY_PLAN.kiosks) {
  const body = boxById(`${kiosk.id}-body`);
  assertNear(body.x, planToWorldX(kiosk.position[0]), `${kiosk.id} runtime X`);
  assertNear(body.z, kiosk.position[2], `${kiosk.id} runtime Z`);
  assert.equal(colliderIdsMatching(world, new RegExp(`^${kiosk.id}-body$`)).length, 1, `${kiosk.id} needs one body collider.`);
}
const lastKioskBody = boxById(`${LOBBY_PLAN.kiosks.at(-1).id}-body`);
assert.ok(
  lastKioskBody.z + lastKioskBody.depth / 2 < LOBBY_PLAN.futureStairs.zMin,
  "The third kiosk must not collide with the compact stair south cap.",
);
assertNear(boxById("lobby-east").x, planToWorldX(15.11), "V16 narrowed east lobby wall");
const entrance = LOBBY_PLAN.frontEntrance;
for (const bank of entrance.banks) {
  for (const plane of entrance.planes) {
    const prefix = `lobby-front-${bank.id}-${plane}`;
    const expectedZ = plane === "outer" ? entrance.outerZ - 0.03 : entrance.innerZ + 0.03;
    for (const side of ["left", "right"]) {
      const leaf = boxById(`${prefix}-leaf-${side}`);
      assertNear(leaf.z, expectedZ, `${prefix} ${side} leaf plane`);
      assertNear(leaf.y + leaf.height / 2, entrance.doorHeight - 0.06, `${prefix} ${side} leaf height`);
    }
    const transom = boxById(`${prefix}-fixed-transom`);
    assertNear(transom.y - transom.height / 2, entrance.doorHeight, `${prefix} transom bottom`);
    assertNear(transom.y + transom.height / 2, entrance.transomTopY, `${prefix} transom top`);
  }
}
assert.equal(authoredBoxes.filter(({ id }) => /^lobby-front-entrance-bank-\d-(?:outer|inner)-leaf-(?:left|right)$/.test(id)).length, 12,
  "Three banks × two planes × two leaves must render.");
assert.equal(authoredBoxes.filter(({ id }) => /^lobby-front-entrance-bank-\d-(?:outer|inner)-fixed-transom$/.test(id)).length, 6,
  "Each outer and inner double-door plane needs fixed glass above its leaves.");
const divider = boxById(entrance.boundaryPillar.id);
assertNear(divider.x, planToWorldX((entrance.boundaryPillar.xMin + entrance.boundaryPillar.xMax) / 2), "Entrance/window divider pillar X");
assertNear(divider.depth, entrance.depth + 0.18, "Entrance/window divider spans vestibule depth");
assertNear(divider.width, 0.9, "Photographed entrance/window divider width");
assertBoxMatchesBounds("lobby-front-vestibule-ceiling", {
  xMin: entrance.bankSpan.xMin,
  xMax: entrance.bankSpan.xMax,
  zMin: entrance.outerZ,
  zMax: entrance.innerZ,
}, "enclosed paired-door vestibule");
for (const windowPlan of entrance.windows) {
  const glass = boxById(`${windowPlan.id}-glass`);
  assertNear(glass.x, planToWorldX((windowPlan.xMin + windowPlan.xMax) / 2), `${windowPlan.id} X`);
  assertNear(glass.width, windowPlan.xMax - windowPlan.xMin, `${windowPlan.id} width`);
  assert.equal(colliderIdsMatching(world, new RegExp(`^${windowPlan.id}-glass$`)).length, 1, `${windowPlan.id} must block traversal.`);
}
for (const station of LOBBY_PLAN.customerCounter) {
  assert.ok(station.z <= LOBBY_PLAN.envelope.zMax, "Translated counter must remain inside the shifted lobby.");
}
for (const station of POS_STATIONS) {
  const group = scene.getObjectByName(station.id);
  assert.ok(group, `${station.id} group must remain authored.`);
  assertNear(group.position.x, planToWorldX(station.position[0]), `${station.id} translated X`);
  assertNear(group.position.z, station.position[2], `${station.id} translated Z`);
}
const boxOfficePos = scene.getObjectByName(LOBBY_PLAN.boxOfficePos.id);
assert.ok(boxOfficePos, "The box-office long counter leg needs its dedicated POS.");
assert.equal(objectsByName(LOBBY_PLAN.boxOfficePos.id).length, 1, "The box-office POS must be authored exactly once.");
assertNear(boxOfficePos.position.x, planToWorldX(LOBBY_PLAN.boxOfficePos.position[0]), "box-office POS X");
assertNear(boxOfficePos.position.z, LOBBY_PLAN.boxOfficePos.position[2], "box-office POS Z");
for (const anchor of EQUIPMENT_ANCHORS.filter(({ roomId }) => ["concession-boh", "kitchen", "bar"].includes(roomId))) {
  const equipment = world.equipment.get(anchor.id);
  assert.ok(equipment, `${anchor.id} must remain authored after the rigid shift.`);
  assertNear(equipment.worldPosition.x, planToWorldX(anchor.position[0]), `${anchor.id} translated X`);
  assertNear(equipment.worldPosition.z, anchor.position[2], `${anchor.id} translated Z`);
}
for (const popper of EQUIPMENT_ANCHORS.filter(({ type }) => type === "popper")) {
  const popperGroup = scene.getObjectByName(popper.id);
  assertNear(
    popperGroup.rotation.y,
    -LOBBY_PLAN.concessionRun.fixtureRotation,
    `${popper.id} runtime counter alignment`,
  );
  const glass = boxById(`${popper.id}-glass`);
  const canopy = boxById(`${popper.id}-canopy`);
  assertNear(glass.y - glass.height / 2, popper.glassBottom, `${popper.id} glass bottom`);
  assertNear(glass.y + glass.height / 2, popper.glassTop, `${popper.id} glass top`);
  assertNear(canopy.y - canopy.height / 2, popper.canopyBottom, `${popper.id} canopy bottom`);
  assertNear(canopy.y + canopy.height / 2, popper.canopyTop, `${popper.id} canopy top`);
  assertNear(popper.height, 2.8, `${popper.id} authored height`);
  assert.ok(canopy.y + canopy.height / 2 > 2.7, `${popper.id} must read as a tall backline popper.`);
  assert.deepEqual(canopy.materialNames, ["Accent / theater crimson"], `${popper.id} canopy finish`);
}

const highLobbyCeiling = boxById("lobby-ceiling");
assertBoxMatchesBounds("lobby-ceiling", LOBBY_PLAN.envelope, "lowered V16 lobby ceiling");
assertNear(highLobbyCeiling.y, LOBBY_CEILING_PLAN.highHeight, "lowered lobby ceiling elevation");
assertNear(highLobbyCeiling.y - highLobbyCeiling.height / 2, 10.75, "lowered lobby ceiling underside");
assertNear(LOBBY_CEILING_PLAN.highHeight, 10.8, "V16 public ceiling height");
const lowCourtCeiling = assertBoxMatchesBounds(
  `${COURTYARD_PLAN.id}-ceiling`,
  COURTYARD_PLAN.bounds,
  "ticket-height fountain / T3-5 courtyard ceiling",
);
assertNear(lowCourtCeiling.y, LOBBY_CEILING_PLAN.baseHeight, "courtyard ceiling elevation");
assertNear(lowCourtCeiling.y - lowCourtCeiling.height / 2, 4.55, "courtyard ceiling underside");
assert.deepEqual(
  authoredBoxes
    .filter(({ id }) => ["fountain-courtyard-south-upper", "fountain-courtyard-west-upper"].includes(id))
    .map(({ id }) => id),
  [],
  "A single low court roof must replace both obsolete triple-height seam walls.",
);
const courtLight = boxById("north-light-fountain-court");
assertNear(courtLight.y, LOBBY_CEILING_PLAN.baseHeight - 0.18, "court light elevation below low ceiling");
assert.ok(courtLight.y + courtLight.height / 2 < lowCourtCeiling.y - lowCourtCeiling.height / 2, "Court light must sit below its roof.");
for (const roomId of LOBBY_CEILING_PLAN.lowServiceRoomIds) {
  const room = serviceById.get(roomId);
  if (roomId === LOBBY_PLAN.kitchenCeiling.replacementForRoomId) {
    assert.deepEqual(objectsByName(`${roomId}-ceiling`), [], `${roomId} must use its traced V14 polygon roof rather than the obsolete room rectangle.`);
    continue;
  }
  const ceiling = assertBoxMatchesBounds(`${roomId}-ceiling`, room.bounds, `${roomId} retained service ceiling`);
  assertNear(ceiling.y, LOBBY_CEILING_PLAN.baseHeight, `${roomId} service ceiling elevation`);
  assertNear(ceiling.y - ceiling.height / 2, 4.55, `${roomId} service ceiling underside`);
}
const officeOverflow = SERVICE_ROOMS.find(({ id }) => id === "office-overflow");
const managerOffice = SERVICE_ROOMS.find(({ id }) => id === "office");
for (const [id, bounds] of [
  ["office-perimeter-west", {
    xMin: LOBBY_PLAN.envelope.xMin,
    xMax: officeOverflow.bounds.xMin,
    zMin: LOBBY_PLAN.envelope.zMin,
    zMax: managerOffice.bounds.zMax,
  }],
  ["office-perimeter-front", {
    xMin: officeOverflow.bounds.xMin,
    xMax: officeOverflow.bounds.xMax,
    zMin: LOBBY_PLAN.envelope.zMin,
    zMax: officeOverflow.bounds.zMin,
  }],
]) {
  assertBoxMatchesBounds(`${id}-floor`, bounds, `${id} closed floor strip`);
  const ceiling = assertBoxMatchesBounds(`${id}-ceiling`, bounds, `${id} closed low-roof strip`);
  assertNear(ceiling.y - ceiling.height / 2, 4.55, `${id} ceiling underside`);
}
assert.deepEqual(
  authoredBoxes
    .filter(({ id }) => ["concession-boh-ceiling", "bar-ceiling", "box-office-ceiling"].includes(id))
    .map(({ id }) => id),
  [],
  "The open public lobby must not regain low concession, bar, or box-office roof slabs.",
);

const counterMaterialNames = {
  wood: "Laminate / warm walnut",
  counterWhite: "Counter / satin white service and expo",
  concessionBlue: "Counter / deep blue concession",
  counterStone: "Stone / charcoal quartz counter",
};
for (const section of LOBBY_PLAN.customerCounterSections) {
  const start = LOBBY_PLAN.customerCounter[section.segmentIndex];
  const end = LOBBY_PLAN.customerCounter[section.segmentIndex + 1];
  const run = Math.hypot(end.x - start.x, end.z - start.z);
  const base = boxById(section.id);
  const top = boxById(`${section.id}-top`);
  assertNear(base.x, planToWorldX((start.x + end.x) / 2), `${section.id} center X`);
  assertNear(base.z, (start.z + end.z) / 2, `${section.id} center Z`);
  assertNear(base.width, run, `${section.id} run length`);
  assertNear(base.rotationY, Math.atan2(end.z - start.z, end.x - start.x), `${section.id} rotation`);
  assert.deepEqual(base.materialNames, [counterMaterialNames[section.baseMaterialKey]], `${section.id} base finish`);
  assert.deepEqual(top.materialNames, [counterMaterialNames[section.topMaterialKey]], `${section.id} top finish`);
  assert.ok(colliderIdsMatching(world, new RegExp(`^${section.id}-collider-\\d+$`)).length >= 1, `${section.id} needs segmented collision.`);
}
assert.deepEqual(
  LOBBY_PLAN.customerCounterSections.slice(1).map(({ role }) => role),
  ["service-white", "concession", "expo"],
  "The non-bar counter must read white, blue concession, white expo in order.",
);
const barCounter = boxById("customer-counter-bar");
assertNear(
  barCounter.x - barCounter.width / 2,
  planToWorldX(TICKET_APPROACH_PLAN.bounds.xMin),
  "guest-bar physical-left end aligned to the ticket approach",
);

assert.deepEqual(
  CONCESSION_SERVICE_SEQUENCE.map(({ type }) => type),
  ["pos", "pos", "candy", "pos", "pos", "candy", "pos", "pos"],
  "Runtime fixtures must retain the POS/POS/candy pairing pattern.",
);
let runtimeCandyIndex = 0;
for (const serviceItem of CONCESSION_SERVICE_SEQUENCE) {
  if (serviceItem.type === "pos") {
    const posGroup = scene.getObjectByName(serviceItem.id);
    assert.ok(posGroup?.isGroup, `${serviceItem.id} POS group must be authored.`);
    assertNear(posGroup.position.x, planToWorldX(serviceItem.position[0]), `${serviceItem.id} runtime X`);
    assertNear(posGroup.position.z, serviceItem.position[2], `${serviceItem.id} runtime Z`);
    continue;
  }
  runtimeCandyIndex += 1;
  const candyGroupId = `concession-candy-bay-${runtimeCandyIndex}`;
  const candyGroup = scene.getObjectByName(candyGroupId);
  assert.ok(candyGroup?.isGroup, `${candyGroupId} must interrupt the blue counter.`);
  assert.equal(candyGroup.userData.sourceId, serviceItem.id, `${candyGroupId} source binding`);
  assertNear(
    candyGroup.rotation.y,
    -LOBBY_PLAN.concessionRun.fixtureRotation,
    `${candyGroupId} counter-aligned rotation`,
  );
  assertNear(
    candyGroup.position.x,
    planToWorldX(serviceItem.position[0] + LOBBY_PLAN.concessionRun.guestNormal.x * serviceItem.guestOffset),
    `${candyGroupId} projected X`,
  );
  assertNear(
    candyGroup.position.z,
    serviceItem.position[2] + LOBBY_PLAN.concessionRun.guestNormal.z * serviceItem.guestOffset,
    `${candyGroupId} projected Z`,
  );
  for (const suffix of ["back", "glass", "top", "bottom", "side--1", "side-1"]) boxById(`${candyGroupId}-${suffix}`);
  assert.deepEqual(boxById(`${candyGroupId}-top`).materialNames, [counterMaterialNames.concessionBlue], `${candyGroupId} blue frame`);
}
assert.equal(runtimeCandyIndex, CONCESSION_CANDY_DISPLAYS.length, "Both authored candy displays must render once.");

assert.deepEqual(
  authoredBoxes.filter(({ id }) => ["concession-mural-rear-axis-wall", "kitchen-partition-3", "kitchen-partition-4"].includes(id)).map(({ id }) => id),
  [],
  "V14 must remove the overlong V13 rear-axis wall and both overlapping anonymous back-wall pieces.",
);
const concessionRearWall = LOBBY_PLAN.concessionBackWall;
assertPlanSegment(concessionRearWall.id, concessionRearWall.start, concessionRearWall.end, {
  height: concessionRearWall.height,
  materialName: "Wall / warm neutral",
});
assert.ok(colliderIdsMatching(world, /^concession-back-wall-parallel-collider-\d+$/).length >= 1, "The two-thirds concession back wall needs segmented collision.");
assertNear(
  Math.hypot(concessionRearWall.end.x - concessionRearWall.start.x, concessionRearWall.end.z - concessionRearWall.start.z),
  LOBBY_PLAN.concessionRun.length * 2 / 3,
  "The rendered kitchen wall must stop at exactly two-thirds of the concession counter.",
);

const deadSpace = LOBBY_PLAN.kitchenDeadSpace;
assertPlanSegment(deadSpace.separatingWall.id, deadSpace.separatingWall.start, deadSpace.separatingWall.end, {
  height: deadSpace.separatingWall.height,
  materialName: "Wall / warm neutral",
});
assert.ok(colliderIdsMatching(world, /^kitchen-dead-wedge-separating-wall-collider-\d+$/).length >= 1, "The tiny floor-mismatch wedge must be physically sealed.");
const { slab: deadSpaceCeiling } = assertPolygonSlab(deadSpace.ceiling.id, deadSpace.ceiling, "tiny kitchen dead-wedge ceiling");
assert.equal(deadSpaceCeiling.material.name, "Ceiling / acoustic tile");
assert.deepEqual(objectsByName("kitchen-ceiling"), [], "The obsolete rectangular kitchen ceiling must not overlap the traced V14 roof.");
assert.deepEqual(objectsByName("kitchen-dead-space-ceiling"), [], "The oversized V13 dead-space roof must be absent.");
const completeKitchenSurface = LOBBY_PLAN.kitchenCeiling.surfaces[0];
const connectorNookSurface = LOBBY_PLAN.kitchenCeiling.surfaces[1];
const { slab: completeKitchenCeiling } = assertPolygonSlab(
  completeKitchenSurface.id,
  completeKitchenSurface,
  "complete traced kitchen ceiling",
);
const { slab: connectorNookCeiling } = assertPolygonSlab(
  connectorNookSurface.id,
  connectorNookSurface,
  "preserved kitchen-storage connector-nook ceiling",
);
assert.equal(completeKitchenCeiling.material.name, "Ceiling / acoustic tile");
assert.equal(connectorNookCeiling.material.name, "Ceiling / acoustic tile");
assert.deepEqual(connectorNookSurface, LOBBY_PLAN.kitchenConnectorNook.ceiling, "The traversable connector nook needs its exact independent roof owner.");
assert.deepEqual(LOBBY_PLAN.kitchenCeiling.closureSurfaceIds, [
  completeKitchenSurface.id,
  connectorNookSurface.id,
  deadSpace.ceiling.id,
  LOBBY_PLAN.muralFacade.soffit.id,
]);

const atticHeight = LOBBY_PLAN.muralFacade.topY - LOBBY_CEILING_PLAN.baseHeight;
const atticY = LOBBY_CEILING_PLAN.baseHeight + atticHeight / 2;
for (const [id, start, end] of [
  ["kitchen-connector-attic-upper", LOBBY_PLAN.kitchenPartition[2], LOBBY_PLAN.kitchenPartition[3]],
  ["kitchen-parallel-attic-upper", concessionRearWall.start, concessionRearWall.end],
  ["kitchen-service-attic-upper", LOBBY_PLAN.kitchenPartition[5], LOBBY_PLAN.kitchenPartition.at(-1)],
  [LOBBY_PLAN.officeAttic.doorWall.id, LOBBY_PLAN.officeAttic.doorWall.start, LOBBY_PLAN.officeAttic.doorWall.end],
]) {
  assertPlanSegment(id, start, end, {
    height: atticHeight,
    y: atticY,
    materialName: "Wall / warm neutral",
  });
}
assert.deepEqual(objectsByName("kitchen-attic-wall-upper"), [], "The oversized V13 attic separator must not cap the restored connector nook.");
const officeAtticContinuation = boxById("office-door-attic-continuation");
const officeAtticContinuationEnd = { x: -16.2, z: 4.5 };
assertNear(officeAtticContinuation.x, planToWorldX(-16.2), "office attic continuation X");
assertNear(officeAtticContinuation.z, (1.3 + 4.5) / 2, "office attic continuation center Z");
assertNear(officeAtticContinuation.width, 0.18, "office attic continuation thickness");
assertNear(officeAtticContinuation.depth, officeAtticContinuationEnd.z - 1.3, "office attic continuation span");
assertNear(officeAtticContinuation.y, atticY, "office attic continuation center Y");
assertNear(officeAtticContinuation.height, atticHeight, "office attic continuation height to mural top");
assert.deepEqual(officeAtticContinuation.materialNames, ["Wall / warm neutral"]);

const backBar = assertBoxMatchesBounds("back-bar-cabinet", LOBBY_PLAN.backBar, "rigidly translated back bar");
assertNear(backBar.depth, LOBBY_PLAN.backBar.zMax - LOBBY_PLAN.backBar.zMin, "back-bar depth preservation");

const barScreen = LOBBY_PLAN.barScreen;
const barScreenBacking = boxById(`${barScreen.id}-backing`);
assertNear(barScreenBacking.x, planToWorldX((barScreen.xMin + barScreen.xMax) / 2), "bar-screen support center X");
assertNear(barScreenBacking.y, (barScreen.bottomY + barScreen.topY) / 2, "bar-screen support center Y");
assert.ok(Math.abs(barScreenBacking.z - barScreen.wallZ) <= 0.25, "Bar screen must mount flush to its north support wall.");
assertNear(barScreenBacking.width, barScreen.width, "bar-screen outer width");
assertNear(barScreenBacking.height, barScreen.height, "bar-screen outer height");
const barScreenFace = scene.getObjectByName(`${barScreen.id}-face`);
assert.ok(barScreenFace?.isMesh, "The bar wall needs one visible digital display face.");
assert.equal(objectsByName(`${barScreen.id}-face`).length, 1, "The rotating bar display face must be authored exactly once.");
assert.equal(barScreenFace.material.name, "lanai-bar-digital-screen-material");
assert.ok(barScreenFace.scale.x <= barScreen.width && barScreenFace.scale.x >= barScreen.width - 0.25, "Bar-screen image must fill the 7.3m-wide frame.");
assert.ok(barScreenFace.scale.y <= barScreen.height && barScreenFace.scale.y >= barScreen.height - 0.25, "Bar-screen image must fill the mural-height frame.");
assert.ok(authoredBoxes.filter(({ id }) => id.startsWith(`${barScreen.id}-frame-`)).length >= 4, "The bar screen needs a complete four-sided frame.");

const encounteredBarScreenTextures = new Set();
const observeBarScreen = (expectedSlideId, label) => {
  const texture = barScreenFace.material.map;
  assert.ok(texture?.isTexture, `${label} needs a live screen texture.`);
  assert.equal(texture.userData.slideId, expectedSlideId, `${label} slide ID`);
  assertNear(texture.userData.holdSeconds, barScreen.intervalSeconds, `${label} authored hold interval`);
  encounteredBarScreenTextures.add(texture);
};
observeBarScreen(barScreen.slideIds[0], "initial bar screen");
world.update(barScreen.intervalSeconds - 0.001);
observeBarScreen(barScreen.slideIds[0], "bar screen just before first boundary");
world.update(0.001);
observeBarScreen(barScreen.slideIds[1], "bar screen at first 10-second boundary");
for (const slideId of barScreen.slideIds.slice(2)) {
  world.update(barScreen.intervalSeconds);
  observeBarScreen(slideId, `bar-screen ${slideId}`);
}
world.update(barScreen.intervalSeconds);
observeBarScreen(barScreen.slideIds[0], "bar screen after one complete loop");
assert.equal(encounteredBarScreenTextures.size, barScreen.slideIds.length, "The 10-second rotation must expose four distinct display textures.");
const disposedBarScreenTextures = new Set();
for (const texture of encounteredBarScreenTextures) {
  texture.addEventListener("dispose", () => disposedBarScreenTextures.add(texture));
}

const oppositeMuralPlan = LOBBY_PLAN.oppositeLobbyMural;
const oppositeMuralFace = scene.getObjectByName("stair-kiosk-mural-face");
assert.ok(oppositeMuralFace?.isMesh, "The stair/kiosk side needs its own mural face.");
assert.equal(objectsByName("stair-kiosk-mural-face").length, 1, "The opposite-lobby mural must be authored exactly once.");
assert.equal(oppositeMuralFace.material.name, "stair-kiosk-botanical-mural-material");
assert.equal(oppositeMuralFace.material.map?.name, "original-opposite-lobby-botanical-mural-v15");
assert.equal(oppositeMuralFace.material.map?.userData.distinctArtwork, true, "The stair/kiosk mural texture must declare itself distinct.");
assert.equal(oppositeMuralFace.userData.artworkId, oppositeMuralPlan.id, "The opposite mural must bind to its own layout ID.");
assert.equal(oppositeMuralFace.userData.distinctFrom, oppositeMuralPlan.distinctFrom, "The opposite mural must not alias the concession artwork.");
assertNear(oppositeMuralFace.position.x, planToWorldX(oppositeMuralPlan.wallX), "opposite mural wall X", 0.2);
assertNear(oppositeMuralFace.position.y, (oppositeMuralPlan.bottomY + oppositeMuralPlan.topY) / 2, "opposite mural center Y");
assertNear(oppositeMuralFace.position.z, (oppositeMuralPlan.artwork.zMin + oppositeMuralPlan.artwork.zMax) / 2, "opposite mural center Z");
assertNear(oppositeMuralFace.scale.x, oppositeMuralPlan.artwork.width, "opposite mural artwork width");
assertNear(oppositeMuralFace.scale.y, oppositeMuralPlan.artwork.height, "opposite mural artwork height");
const oppositeSurround = boxById(oppositeMuralPlan.surround.id);
assertNear(oppositeSurround.depth, oppositeMuralPlan.surround.width, "full opposite mural surround");
for (const grayFill of oppositeMuralPlan.grayFills) {
  const runtimeFill = boxById(grayFill.id);
  assertNear(runtimeFill.z, (grayFill.zMin + grayFill.zMax) / 2, `${grayFill.id} center`);
  assertNear(runtimeFill.depth, grayFill.width, `${grayFill.id} width`);
  assert.deepEqual(runtimeFill.materialNames, ["Exterior / honed concrete"], `${grayFill.id} finish`);
}
assert.equal(oppositeMuralPlan.grayFills.length, 2, "The second mural needs two distinct gray side fills.");
const concessionMuralFace = scene.getObjectByName("concession-mural-face");
assert.notEqual(oppositeMuralFace.material, concessionMuralFace.material, "Opposite lobby and concession murals need independent materials.");
assert.notEqual(oppositeMuralFace.material.map, concessionMuralFace.material.map, "Opposite lobby and concession murals need independent textures.");
let oppositeMuralTextureDisposed = false;
oppositeMuralFace.material.map.addEventListener("dispose", () => { oppositeMuralTextureDisposed = true; });

assertBoxMatchesBounds("box-office-vertical", LOBBY_PLAN.boxOfficeVertical, "narrow V13 box-office long leg");
const boxOfficeReturn = assertBoxMatchesBounds("box-office-return", LOBBY_PLAN.boxOfficeReturn, "half-length V13 box-office return");
assertNear(boxOfficeReturn.width, 3.15, "box-office return half-length");
assertNear(boxOfficeReturn.depth, 0.7, "box-office return narrow depth");
assertNear(LOBBY_PLAN.boxOfficeReturn.xMax, LOBBY_PLAN.futureStairs.xMin, "box-office return flush to stair wall");
assertNear(LOBBY_PLAN.futureStairs.xMin - TICKET_APPROACH_PLAN.bounds.xMax, 1.01, "ticket-approach/stair reveal");
assert.deepEqual(boxById("lobby-back-east-short-return").materialNames, ["Wall / warm neutral"], "The two-foot ticket-hall return must stay white.");
assertNear(boxById("lobby-back-east-short-return").width, 1.01, "compact ticket cubby short return");
for (const obsoleteId of [
  "future-stair-construction-wall",
  "future-stair-north-wall",
  "future-stair-closed-door-closed-leaf",
  "future-stair-closed-door-closed-bar",
]) {
  assert.deepEqual(objectsByName(obsoleteId), [], `${obsoleteId} must not survive the V15 open-stair rebuild.`);
}
assert.deepEqual(
  authoredBoxes.filter(({ id }) => id.startsWith("future-stair-south-cap-")).map(({ id }) => id),
  [],
  "The old full-width stair south cap must be removed.",
);

const lobbyStair = LOBBY_PLAN.lobbyStair;
const stairTreads = authoredBoxes
  .filter(({ id }) => /^lobby-stair-tread-\d+$/.test(id))
  .sort((first, second) => first.z - second.z);
assert.equal(stairTreads.length, lobbyStair.treadCount, "The rendered stair must include every planned tread.");
for (const [index, tread] of stairTreads.entries()) {
  assertNear(tread.x, planToWorldX((lobbyStair.bounds.xMin + lobbyStair.bounds.xMax) / 2), `${tread.id} center X`);
  assertNear(tread.width, lobbyStair.clearWidth, `${tread.id} clear width`);
  assertNear(tread.height, lobbyStair.treadThickness, `${tread.id} thin open slab`);
  assert.equal(colliderIdsMatching(world, new RegExp(`^${tread.id}$`)).length, 1, `${tread.id} needs one thin-slab collider without a floor-filled support block.`);
  assert.equal(world.colliders.find(({ id }) => id === tread.id)?.walkableTop, true, `${tread.id} must be step-through from a reachable feet height.`);
  assert.ok(tread.depth >= lobbyStair.treadDepth && tread.depth <= lobbyStair.treadDepth + 0.05, `${tread.id} depth must close tread seams without stretching the run.`);
  assertNear(tread.y + tread.height / 2, (index + 1) * lobbyStair.stepRise, `${tread.id} walking surface`);
  const sampleHeight = world.groundHeight(planToWorldX((lobbyStair.bounds.xMin + lobbyStair.bounds.xMax) / 2), tread.z, tread.y);
  assertNear(sampleHeight, (index + 1) * lobbyStair.stepRise, `${tread.id} ground sampler`);
}
assert.equal(world.groundHeight(
  planToWorldX((lobbyStair.bottomLanding.xMin + lobbyStair.bottomLanding.xMax) / 2),
  (lobbyStair.bottomLanding.zMin + lobbyStair.bottomLanding.zMax) / 2,
  0,
), lobbyStair.bottomY, "Stair bottom landing must meet the lobby floor.");
const topLanding = assertBoxMatchesBounds("lobby-stair-top-landing-floor", lobbyStair.topLanding, "raised stair top landing");
assertNear(topLanding.y + topLanding.height / 2, lobbyStair.topY, "raised stair top-landing surface");
assertNear(world.groundHeight(
  planToWorldX((lobbyStair.topLanding.xMin + lobbyStair.topLanding.xMax) / 2),
  (lobbyStair.topLanding.zMin + lobbyStair.topLanding.zMax) / 2,
  lobbyStair.topY,
), lobbyStair.topY, "raised stair top-landing sampler");
const westRailObjects = [];
const eastRailObjects = [];
scene.traverse((object) => {
  if (object.name.startsWith("lobby-stair-west-rail-")) westRailObjects.push(object);
  if (object.name.startsWith("lobby-stair-east-rail-")) eastRailObjects.push(object);
});
assert.ok(westRailObjects.length >= 3, "The exposed lobby side of the stair needs a continuous post-and-rail system.");
assert.equal(eastRailObjects.length, 0, "The east perimeter wall replaces the obsolete east guard rail.");
assert.ok(scene.getObjectByName("lobby-stair-east-wall-handrail"), "The east wall still needs its slim handrail.");
assert.ok(colliderIdsMatching(world, /^lobby-stair-west-rail-guard-/).length >= 2, "The west open side needs physical guards.");
assert.equal(colliderIdsMatching(world, /^lobby-stair-east-rail-/).length, 0, "No duplicate east guard collider may fight the wall.");
const lowLongWall = boxById("lobby-stair-low-wall-long");
const lowReturnWall = boxById("lobby-stair-low-wall-return");
assertNear(lowLongWall.height, 4.2, "low L-wall long leg");
assertNear(lowReturnWall.height, 4.2, "low L-wall return");
assertNear(lowLongWall.z + lowLongWall.depth / 2, lobbyStair.topLanding.zMin, "long leg reaches landing return");
assertNear(lowReturnWall.z, lobbyStair.topLanding.zMin, "return sits below landing south edge");
assert.equal(scene.getObjectByName("lobby-stair-landing-south-rail-top"), undefined, "No top rail may cross the flight/landing seam.");
assert.equal(scene.getObjectByName("lobby-stair-landing-south-rail-mid"), undefined, "No mid rail may cross the flight/landing seam.");
assert.equal(colliderIdsMatching(world, /^lobby-stair-landing-south-rail-guard$/).length, 0, "No guard collider may block the last stair tread.");
const stairDoorLeaf = boxById("lobby-stair-upper-door-closed-leaf");
assertNear(stairDoorLeaf.x, planToWorldX(lobbyStair.upperDoor.center), "raised stair door center X");
assertNear(stairDoorLeaf.y - stairDoorLeaf.height / 2, lobbyStair.upperDoor.baseY, "raised stair door sill");
assertNear(stairDoorLeaf.z, lobbyStair.upperDoor.z, "raised stair door wall plane", 0.2);
boxById("lobby-stair-upper-door-closed-bar");
const sightline = LOBBY_PLAN.boxOfficeSightline;
for (let z = sightline.bounds.zMin + 0.5; z < sightline.bounds.zMax - 0.5; z += 1) {
  const worldX = planToWorldX(sightline.axisX);
  const blockers = world.colliders.filter((collider) => (
    collider.maxY > 0.05 && collider.minY < 1.78
    && worldX > collider.minX && worldX < collider.maxX
    && z > collider.minZ && z < collider.maxZ
  ));
  assert.deepEqual(blockers.map(({ id }) => id), [], `Box-office sightline is blocked at z=${z.toFixed(2)}.`);
}

const podium = LOBBY_PLAN.ticketPodium;
const podiumBoxes = authoredBoxes.filter(({ id }) => id.startsWith(`${podium.id}-`));
assert.deepEqual(
  podiumBoxes.map(({ id }) => id).sort(),
  [`${podium.id}-base`, `${podium.id}-body`, `${podium.id}-top`].sort(),
  "Ticket check must contain one three-piece central lectern.",
);
for (const piece of podiumBoxes) {
  assertNear(piece.x, planToWorldX(podium.position[0]), `${piece.id} center X`);
  assert.ok(piece.materialNames.every((name) => name === "Laminate / warm walnut"), `${piece.id} must use the wooden lectern finish.`);
}
assertNear(boxById(`${podium.id}-body`).z, podium.position[2] + podium.footprint[1] * 0.04, "lectern body Z");
assertNear(boxById(`${podium.id}-top`).y, podium.height, "lectern above-stomach top height");
assert.equal(colliderIdsMatching(world, new RegExp(`^${podium.id}-body$`)).length, 1, "The lectern needs exactly one body collider.");
assert.deepEqual(
  authoredBoxes.filter(({ id }) => /^ticket-(?:podium|scanner)-(?:2\.2|9\.4)$/.test(id)).map(({ id }) => id),
  [],
  "The two old black ticket podiums and scanners must be absent.",
);

assert.equal(FOUNTAIN_PLAN.pillars.length, 2, "Exactly two fountain-counter pillars are required.");
assertNear(FOUNTAIN_PLAN.shiftZ, 0.59, "fountain island rearward shift");
assertNear(FOUNTAIN_PLAN.centerZ, 64.19, "fountain island center Z");
const sodaIsland = assertBoxMatchesBounds("soda-island", FOUNTAIN_PLAN.island, "rear-shifted fountain island");
const sodaIslandTop = assertBoxMatchesBounds("soda-island-top", FOUNTAIN_PLAN.island, "rear-shifted fountain island top");
assertNear(sodaIsland.z, FOUNTAIN_PLAN.centerZ, "rear-shifted fountain island center");
assertNear(sodaIslandTop.z, FOUNTAIN_PLAN.centerZ, "rear-shifted fountain top center");
assertNear(FOUNTAIN_PLAN.rearCounter.zMin - FOUNTAIN_PLAN.island.zMax, 2.4, "fountain working aisle after shift");
for (const pillar of FOUNTAIN_PLAN.pillars) {
  const box = boxById(pillar.id);
  assertNear(box.x, planToWorldX(pillar.position[0]), `${pillar.id} X`);
  assertNear(box.y, pillar.height / 2, `${pillar.id} vertical center`);
  assertNear(box.z, pillar.position[2], `${pillar.id} Z`);
  assertNear(box.width, pillar.footprint[0], `${pillar.id} width`);
  assertNear(box.height, LOBBY_CEILING_PLAN.baseHeight, `${pillar.id} full low-court height`);
  assertNear(box.depth, pillar.footprint[1], `${pillar.id} depth`);
  assert.ok(box.materialNames.every((name) => name === "Wall / warm neutral"), `${pillar.id} must be white.`);
  assert.equal(colliderIdsMatching(world, new RegExp(`^${pillar.id}$`)).length, 1, `${pillar.id} needs one collider.`);
}
for (const anchor of EQUIPMENT_ANCHORS.filter(({ roomId }) => roomId === "soda-service")) {
  assertNear(anchor.position[2], FOUNTAIN_PLAN.centerZ, `${anchor.id} plan shift with island`);
  assertNear(world.equipment.get(anchor.id).worldPosition.z, FOUNTAIN_PLAN.centerZ, `${anchor.id} runtime shift with island`);
}
const westPillar = FOUNTAIN_PLAN.pillars[0];
const partitionEastFace = COURTYARD_PLAN.waistPartition.x + COURTYARD_PLAN.waistPartition.thickness / 2;
const westPillarWestFace = westPillar.position[0] - westPillar.footprint[0] / 2;
assertNear(westPillarWestFace - partitionEastFace, 1.11, "divider-to-west-pillar squeeze width");
assert.ok(westPillarWestFace - partitionEastFace > 0.68, "The player capsule must fit through the divider/pillar squeeze.");

const muralFacade = LOBBY_PLAN.muralFacade;
const muralGuestNormal = muralFacade.axis.guestNormal;
const muralSurround = assertPlanSegment(
  muralFacade.surround.id,
  muralFacade.surround.start,
  muralFacade.surround.end,
  {
    height: muralFacade.surround.height,
    y: (muralFacade.bottomY + muralFacade.topY) / 2,
    depth: muralFacade.surround.depth,
    materialName: "Exterior / honed concrete",
  },
);
assert.deepEqual(muralFacade.axis.start, LOBBY_PLAN.kitchenPartition.at(-1), "The runtime facade must begin at the kitchen-door left jamb.");
assert.deepEqual(muralFacade.axis.end, { x: LOBBY_PLAN.backBar.xMin, z: LOBBY_PLAN.backBar.zMin }, "The runtime facade must end at the isolated bar start.");
assertNear(muralSurround.width, 18.115256001503266, "literal kitchen-door-to-bar surround width");
assertNear(muralSurround.height, muralFacade.artwork.height, "surround/art equal height with no top or bottom gray");
assertNear(muralSurround.y, (muralFacade.bottomY + muralFacade.topY) / 2, "surround vertical center");
assert.ok(muralSurround.width > muralFacade.artwork.width * 1.85, "The gray architectural surround must leave nearly half-art-width fields on both sides.");
assert.deepEqual(
  authoredBoxes.filter(({ id }) => ["concession-mural-fascia", "concession-mural-rear-axis-wall"].includes(id)).map(({ id }) => id),
  [],
  "Neither the short V12 fascia nor the overlong V13 rear-axis wall may remain behind the V14 surround.",
);
assert.deepEqual(
  authoredBoxes.filter(({ id }) => id === "concession-mural-shadow-lip").map(({ id }) => id),
  [],
  "The old floating shadow lip must be replaced by the complete soffit slab.",
);
for (const [id, anchor, target] of [
  ["concession-mural-return-start", muralFacade.returnAnchors.start, muralFacade.returnTargets.start],
  ["concession-mural-return-end", muralFacade.returnAnchors.end, muralFacade.returnTargets.end],
]) {
  const muralReturn = assertPlanSegment(id, anchor, target, {
    height: muralFacade.topY - muralFacade.bottomY,
    y: (muralFacade.bottomY + muralFacade.topY) / 2,
    depth: 0.18,
    materialName: "Exterior / honed concrete",
  });
  assert.equal(colliderIdsMatching(world, new RegExp(`^${id}(?:$|-collider-)`)).length, 0, `${id} must remain a non-colliding facade closure.`);
  assertNear(muralReturn.width, Math.hypot(target.x - anchor.x, target.z - anchor.z), `${id} closure length`);
}
const muralSoffitId = `${muralFacade.soffit.id}-ceiling`;
const { slab: muralSoffit } = assertPolygonSlab(muralSoffitId, muralFacade.soffit, "full attached mural soffit");
assert.equal(muralSoffit.material.name, "Ceiling / acoustic tile", "The soffit underside must read as ceiling, not a floating wall.");
assert.deepEqual(muralFacade.soffit.vertices, [
  { x: -16.2, z: 5.2548023333959675 },
  { x: -8.573901425559662, z: 19.826097823844478 },
  LOBBY_PLAN.kitchenPartition[3],
  LOBBY_PLAN.kitchenPartition[4],
  LOBBY_PLAN.kitchenPartition[5],
  LOBBY_PLAN.kitchenPartition[6],
], "The runtime soffit must be the simple clipped gap between facade and rear wall, without a self-crossing or protruding cap.");

const muralFaceOffset = muralFacade.fasciaDepth / 2 + 0.018;
for (const fill of muralFacade.grayFills) {
  const faceStart = {
    x: fill.start.x + muralGuestNormal.x * muralFaceOffset,
    z: fill.start.z + muralGuestNormal.z * muralFaceOffset,
  };
  const faceEnd = {
    x: fill.end.x + muralGuestNormal.x * muralFaceOffset,
    z: fill.end.z + muralGuestNormal.z * muralFaceOffset,
  };
  assertPlanSegment(fill.id, faceStart, faceEnd, {
    height: muralFacade.artwork.height,
    y: (muralFacade.bottomY + muralFacade.topY) / 2,
    depth: 0.025,
    materialName: "Exterior / honed concrete",
  });
  assertNear(boxById(fill.id).width, fill.width, `${fill.id} exact gray-fill width`);
  assert.ok(fill.width >= muralFacade.artwork.width * 0.4 && fill.width < muralFacade.artwork.width * 0.5, `${fill.id} must be almost half the artwork width.`);
}
assertNear(
  muralFacade.grayFills[0].width + muralFacade.artwork.width + muralFacade.grayFills[1].width,
  muralFacade.surround.width,
  "side fills plus unchanged art span the entire surround",
);
assert.deepEqual(
  authoredBoxes.filter(({ id }) => /concession-mural-gray-fill-(?:top|bottom)/.test(id)).map(({ id }) => id),
  [],
  "V14 permits gray only beside the artwork, never above or below it.",
);
const muralFace = scene.getObjectByName("concession-mural-face");
assert.ok(muralFace?.isMesh, "The projecting concession fascia needs its botanical mural face.");
assert.equal(objectsByName("concession-mural-face").length, 1, "The mural face must be authored exactly once.");
assert.equal(muralFace.userData.facadeId, muralFacade.id, "Mural face must remain bound to the authoritative facade plan.");
assert.equal(muralFace.userData.artworkId, muralFacade.artwork.id, "Mural face must remain bound to the unchanged V12 artwork plan.");
assert.equal(muralFace.material.name, "concession-botanical-mural-material");
assertNear(muralFace.scale.x, 9.588342918079668, "unchanged V12 mural-art width");
assertNear(muralFace.scale.y, 4.3, "unchanged V12 mural-art height");
assertNear(
  muralFace.position.x,
  planToWorldX((muralFacade.artwork.start.x + muralFacade.artwork.end.x) / 2 + muralGuestNormal.x * (muralFaceOffset + 0.015)),
  "mural artwork centered between gray fills X",
);
assertNear(
  muralFace.position.z,
  (muralFacade.artwork.start.z + muralFacade.artwork.end.z) / 2 + muralGuestNormal.z * (muralFaceOffset + 0.015),
  "mural artwork centered between gray fills Z",
);

const overhead = LOBBY_PLAN.overheadMechanicals;
let expectedHangerCount = 0;
for (const duct of overhead.ducts) {
  assertPlanSegment(duct.id, duct.start, duct.end, {
    height: duct.height,
    y: duct.y,
    depth: duct.width,
    materialName: materials[duct.materialKey].name,
  });
  assert.equal(colliderIdsMatching(world, new RegExp(`^${duct.id}(?:$|-collider-)`)).length, 0, `${duct.id} must remain above the player collision volume.`);
  assert.ok(duct.y - duct.height / 2 > muralFacade.topY, `${duct.id} must clear the mural face.`);
  assert.ok(duct.y + duct.height / 2 < LOBBY_CEILING_PLAN.highHeight, `${duct.id} must remain below the high lobby roof.`);

  const dx = duct.end.x - duct.start.x;
  const dz = duct.end.z - duct.start.z;
  const length = Math.hypot(dx, dz);
  const unitX = dx / length;
  const unitZ = dz / length;
  const normalX = -unitZ;
  const normalZ = unitX;
  const hangerCount = Math.max(1, Math.floor(length / overhead.hangerSpacing));
  expectedHangerCount += hangerCount * 2;
  for (let index = 0; index < hangerCount; index += 1) {
    const t = (index + 1) / (hangerCount + 1);
    const centerX = duct.start.x + dx * t;
    const centerZ = duct.start.z + dz * t;
    for (const side of [-1, 1]) {
      const offset = side * duct.width * 0.38;
      assertPlanPipeSegment({
        id: `${duct.id}-hanger-${index + 1}-${side < 0 ? "left" : "right"}`,
        start: {
          x: centerX + normalX * offset,
          y: duct.y + duct.height / 2,
          z: centerZ + normalZ * offset,
        },
        end: {
          x: centerX + normalX * offset,
          y: LOBBY_CEILING_PLAN.highHeight - 0.05,
          z: centerZ + normalZ * offset,
        },
        radius: 0.025,
      }, materials.black.name, `${duct.id} paired hanger`);
    }
  }
}
for (const pipe of overhead.pipes) {
  assertPlanPipeSegment(pipe, materials[pipe.materialKey].name);
  const lowestEnd = Math.min(pipe.start.y, pipe.end.y) - pipe.radius;
  const highestEnd = Math.max(pipe.start.y, pipe.end.y) + pipe.radius;
  assert.ok(lowestEnd >= overhead.minClearanceY - pipe.radius, `${pipe.id} must remain in the exposed overhead field.`);
  assert.ok(highestEnd < LOBBY_CEILING_PLAN.highHeight, `${pipe.id} must remain below the high lobby roof.`);
}
assert.equal(overhead.ducts.length, 10, "All ten broad overhead ducts must render across the full ceiling.");
assert.equal(overhead.pipes.length, 26, "All twenty-six distributed pipes must render across the full ceiling.");
assert.equal(overhead.ducts.filter(({ preservedRoute }) => preservedRoute).length, 6, "The original six duct routes must remain rendered.");
assert.equal(overhead.pipes.filter(({ preservedRoute }) => preservedRoute).length, 18, "The original eighteen pipe routes must remain rendered.");
const runtimeMechanicalLow = Math.min(
  ...overhead.ducts.map(({ y, height }) => y - height / 2),
  ...overhead.pipes.map(({ start, end, radius }) => Math.min(start.y, end.y) - radius),
);
const runtimeMechanicalHigh = Math.max(
  ...overhead.ducts.map(({ y, height }) => y + height / 2),
  ...overhead.pipes.map(({ start, end, radius }) => Math.max(start.y, end.y) + radius),
);
assert.ok(runtimeMechanicalLow > Math.max(LOBBY_PLAN.barScreen.topY, LOBBY_PLAN.oppositeLobbyMural.topY), "Physical mechanical bottoms must clear both 8.9m features.");
assert.ok(runtimeMechanicalHigh < highLobbyCeiling.y - highLobbyCeiling.height / 2, "Physical mechanical tops must clear the 10.75m roof underside.");
const runtimeHangerIds = [];
scene.traverse(({ name }) => {
  if (/^lobby-overhead-duct-.+-hanger-\d+-(?:left|right)$/.test(name)) runtimeHangerIds.push(name);
});
assert.equal(runtimeHangerIds.length, expectedHangerCount, "Every large duct must retain its full paired hanger cadence.");
assert.equal(new Set(runtimeHangerIds).size, runtimeHangerIds.length, "Overhead hanger IDs must be unique.");

const t1 = world.auditoriumLayouts.get("theater-1");
const theater1 = auditoriumByNumber.get(1);
const theater2 = auditoriumByNumber.get(2);
assert.equal(T12_TICKET_SHIFT_X, 1, "V15 ticket-ward shift constant");
assert.deepEqual(theater1.bounds, { xMin: -24.5, xMax: -15, zMin: 42.5, zMax: 55.5 }, "T1 must translate rigidly one metre toward the podium.");
assert.deepEqual(theater2.bounds, { xMin: -34, xMax: -24.5, zMin: 42.5, zMax: 55.5 }, "T2 must translate rigidly with T1.");
assert.deepEqual(theater1.entry.cubbyBounds, { xMin: -24.5, xMax: -21.3, zMin: 51.9, zMax: 55.5 }, "T1 cubby must translate with its bowl.");
assert.deepEqual(theater2.entry.cubbyBounds, { xMin: -27.7, xMax: -24.5, zMin: 51.9, zMax: 55.5 }, "T2 cubby must translate with its bowl.");
assertNear(theater1.entry.center, -22.9, "T1 outer door translation");
assertNear(theater2.entry.center, -26.1, "T2 outer door translation");
assert.equal(theater1.bounds.xMin, theater2.bounds.xMax, "T1/T2 shared wall must remain exact after translation.");
assert.equal(theater1.entry.cubbyBounds.xMin, theater2.entry.cubbyBounds.xMax, "T1/T2 cubbies must remain back-to-back.");
assertBoxMatchesBounds("theater-1-ceiling", theater1.bounds, "rigidly translated T1 ceiling");
assertBoxMatchesBounds("theater-2-ceiling", theater2.bounds, "rigidly translated T2 ceiling");
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

const t3Storage = serviceById.get("under-storage-3");
const theater3 = auditoriumByNumber.get(3);
assert.deepEqual(theater3.bounds, { xMin: -21.8, xMax: -4.3, zMin: 72, zMax: 99 });
assert.deepEqual(theater3.entry.routeBounds, { xMin: -6.7, xMax: -4.3, zMin: 68.2, zMax: 99 });
assert.deepEqual(theater3.entry.ramp.bounds, { xMin: -6.7, xMax: -4.3, zMin: 82.5, zMax: 94.5 });
assert.deepEqual(theater3.entry.usherNookBounds, { xMin: -9.9, xMax: -6.7, zMin: 68.2, zMax: 72 });
assert.deepEqual(t3Storage.bounds, { xMin: -21.5, xMax: -9.9, zMin: 72, zMax: 82.5 });
assert.deepEqual(t3Storage.accessHall, { xMin: -21.5, xMax: -9.9, zMin: 68.2, zMax: 72 });
assert.deepEqual(t3Storage.doorCenters, [-18.6, -12.3]);
assert.equal("entranceStemBounds" in theater3.entry, false);
assert.equal("entranceLateralBounds" in theater3.entry, false);
assert.equal(theater3.entry.directAuditoriumEntry, true);
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
assert.deepEqual(
  authoredBoxes.filter(({ id }) => /^theater-3-(?:east-wall-north-cap|turn-arrow)$/.test(id)).map(({ id }) => id),
  [],
  "Direct T3 must not retain the V8 north cap or left-turn arrow.",
);
assert.deepEqual(
  colliderIdsMatching(world, /^theater-3-east-wall-north-cap$/),
  [],
  "Direct T3 must not retain a blocking north-cap collider.",
);
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
assert.deepEqual(boys.bounds, { xMin: -21.62, xMax: -6.82, zMin: 62.2, zMax: 68.2 });
assert.deepEqual(boys.footprintRects, [
  { xMin: -21.62, xMax: -6.82, zMin: 64.7, zMax: 68.2 },
  { xMin: -9.47, xMax: -6.82, zMin: 62.2, zMax: 64.7 },
]);
assert.deepEqual(boys.entry, { side: "west", coordinate: -9.47, center: 63.45, width: 1.9 });
assert.deepEqual(boysFountainNook.bounds, { xMin: -13.62, xMax: -11.72, zMin: 59.7, zMax: 62.2 });
assert.deepEqual(boysMenCubby.bounds, { xMin: -11.72, xMax: -9.47, zMin: 62.2, zMax: 64.7 });
assertNear(boysMenCubby.bounds.xMax - boysMenCubby.bounds.xMin, 2.25, "V10 MEN cubby width");
assertBoxMatchesBounds("boys-restroom-section-0-floor", boys.footprintRects[0], "boys main-room floor");
assertBoxMatchesBounds("boys-restroom-section-0-ceiling", boys.footprintRects[0], "boys main-room ceiling");
assertBoxMatchesBounds("boys-restroom-section-1-floor", boys.footprintRects[1], "boys entry-lobe floor");
assertBoxMatchesBounds("boys-restroom-section-1-ceiling", boys.footprintRects[1], "boys entry-lobe ceiling");
const boysStallBank = boys.fixtures.stalls[0];
const boysStallRecess = boysStallBank.recessBounds;
assert.equal(boysStallBank.recessedIntoWall, true, "The men's stall bank must use its V15 wall recess.");
assert.deepEqual(boysStallRecess, { xMin: -21.17, xMax: -11.87, zMin: 63.55, zMax: 64.7 });
assertBoxMatchesBounds("boys-restroom-stall-recess-floor", boysStallRecess, "men's stall recess floor");
assertBoxMatchesBounds("boys-restroom-stall-recess-ceiling", boysStallRecess, "men's stall recess ceiling");
const boysStallRecessBackWall = boxById("boys-restroom-stall-recess-back-wall");
assertNear(boysStallRecessBackWall.x, planToWorldX((boysStallRecess.xMin + boysStallRecess.xMax) / 2), "men's stall recess back-wall center X");
assertNear(boysStallRecessBackWall.z, boysStallRecess.zMin, "men's stall recess back-wall Z");
assertNear(boysStallRecessBackWall.width, boysStallRecess.xMax - boysStallRecess.xMin, "men's stall recess back-wall width");
assert.equal(colliderIdsMatching(world, /^boys-restroom-stall-recess-back-wall$/).length, 1, "The recessed stall bank needs one solid back wall.");
assert.deepEqual(objectsByName("boys-restroom-south"), [], "The former uninterrupted south wall must yield to the recessed stall bank.");
for (const id of ["boys-restroom-south-segment-0", "boys-restroom-south-segment-last", "boys-restroom-south-header-0"]) {
  const recessMouthPiece = boxById(id);
  assert.equal(recessMouthPiece.materialNames.length, 6, `${id} needs per-face hall/restroom finishes.`);
  assert.equal(recessMouthPiece.materialNames[5], materials.darkWall.name, `${id} public south face must match the hall.`);
  assert.equal(recessMouthPiece.materialNames[4], materials.wall.name, `${id} bathroom north face must remain light.`);
}
for (const edge of [0, boysStallBank.count]) {
  const partition = boxById(`boys-restroom-stall-bank-0-partition-${edge}`);
  assertNear(partition.z, (boysStallRecess.zMin + boysStallRecess.zMax) / 2, `boys recessed partition ${edge} center Z`);
}
for (const index of [0, boysStallBank.count - 1]) {
  const door = boxById(`boys-restroom-stall-bank-0-door-${index}`);
  assertNear(door.z, boysStallRecess.zMax - 0.025, `boys recessed stall door ${index} mouth plane`);
}
assert.deepEqual(
  authoredBoxes.filter(({ id }) => /^boys-fountain-alcove-(?:floor|ceiling)$/.test(id)).map(({ id }) => id),
  [],
  "The H2O apron is part of the wide hall and must not regain overlapping white-room geometry.",
);
assertBoxMatchesBounds("boys-men-entry-cubby-floor", boysMenCubby.bounds, "recessed MEN cubby floor");
assertBoxMatchesBounds("boys-men-entry-cubby-ceiling", boysMenCubby.bounds, "recessed MEN cubby ceiling");
const sharedWall = boxById("boys-t3-shared-back-wall");
assertNear(sharedWall.x, planToWorldX((-21.62 + -6.82) / 2), "boys/T3 shared wall center X");
assertNear(sharedWall.z, 68.2, "boys/T3 shared wall Z");
assertNear(sharedWall.width, 14.8, "boys/T3 shared wall width");
assertNear(sharedWall.depth, 0.18, "boys/T3 shared wall thickness");
assert.equal(colliderIdsMatching(world, /^boys-t3-shared-back-wall$/).length, 1, "The boys/T3 boundary must have exactly one collider.");
assert.equal(sharedWall.materialNames.length, 6, "The shared wall needs per-face finishes.");
assert.equal(sharedWall.materialNames[4], materials.darkWall.name, "The shared wall's +Z storage face must use the dark finish.");
assert.equal(sharedWall.materialNames[5], materials.wall.name, "The shared wall's -Z bathroom face must use the warm finish.");
for (const [id, publicFaceIndex, interiorFaceIndex] of [
  ["boys-restroom-entry-south", 5, 4],
  ["boys-restroom-east", 1, 0],
]) {
  const wall = boxById(id);
  assert.equal(wall.materialNames.length, 6, `${id} requires per-face finishes.`);
  assert.equal(wall.materialNames[publicFaceIndex], materials.darkWall.name, `${id} public face must match the hall.`);
  assert.equal(wall.materialNames[interiorFaceIndex], materials.wall.name, `${id} restroom face must remain warm.`);
}
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
    { id: "boys-water-fountain-1", position: [-13.36, 0, 60.53], rotation: -Math.PI / 2 },
    { id: "boys-water-fountain-2", position: [-13.36, 0, 61.33], rotation: -Math.PI / 2 },
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
  [54.5, 63.5, 54.5, 63.5],
);
for (let edge = 0; edge <= 6; edge += 1) {
  const expectedPlanX = 54.5 + edge * 1.5;
  const northPartition = boxById(`girls-restroom-stall-bank-0-partition-${edge}`);
  const southPartition = boxById(`girls-restroom-stall-bank-1-partition-${edge}`);
  assertNear(northPartition.x, planToWorldX(expectedPlanX), `girls north partition ${edge} X`);
  assertNear(southPartition.x, planToWorldX(expectedPlanX), `girls south partition ${edge} X`);
  assertNear(northPartition.x, southPartition.x, `girls partition pair ${edge} alignment`);
}

const WARM_WALL = "Wall / warm neutral";
const DARK_WALL = "Wall / charcoal";
const girlsExteriorFaceExpectations = [
  ["girls-restroom-north", 4, DARK_WALL, 5, WARM_WALL],
  ["girls-restroom-west", 0, DARK_WALL, 1, WARM_WALL],
  ["girls-restroom-east", 1, DARK_WALL, 0, WARM_WALL],
  ["girls-restroom-south-east", 5, DARK_WALL, 4, WARM_WALL],
  ["girls-restroom-southwest-lobe-south", 5, DARK_WALL, 4, WARM_WALL],
  ["girls-restroom-connector-south", 5, DARK_WALL, 4, WARM_WALL],
  ["girls-restroom-entry-lobe-east", 1, DARK_WALL, 0, WARM_WALL],
];
for (const [id, exteriorIndex, exteriorMaterial, interiorIndex, interiorMaterial] of girlsExteriorFaceExpectations) {
  const wall = boxById(id);
  assert.equal(wall.materialNames[exteriorIndex], exteriorMaterial, `${id} public face must match the dark hallway.`);
  assert.equal(wall.materialNames[interiorIndex], interiorMaterial, `${id} restroom face must remain light.`);
}
const girlsEntryWestPieces = authoredBoxes.filter(({ id }) => id.startsWith("girls-restroom-entry-lobe-west-"));
assert.ok(girlsEntryWestPieces.length >= 3, "Girls entry west wall must retain jambs and a privacy-door header.");
for (const wall of girlsEntryWestPieces) {
  assert.equal(wall.materialNames[0], DARK_WALL, `${wall.id} public west face must match the hallway.`);
  assert.equal(wall.materialNames[1], WARM_WALL, `${wall.id} interior east face must remain light.`);
}
for (const id of ["girls-restroom-southwest-lobe-east", "girls-restroom-entry-lobe-north"]) {
  assert.ok(boxById(id).materialNames.every((name) => name === WARM_WALL), `${id} is an internal privacy wall and must remain light.`);
}

const theater9 = auditoriumByNumber.get(9);
const theater9Layout = world.auditoriumLayouts.get("theater-9");
const theater9Cubby = {
  xMin: theater9.entry.center - (theater9.entry.cubbyHalfWidth ?? 1.6),
  xMax: theater9.entry.center + (theater9.entry.cubbyHalfWidth ?? 1.6),
  zMin: theater9.bounds.zMax - theater9.entry.cubbyDepth,
  zMax: theater9.bounds.zMax,
};
assert.deepEqual(theater9.bounds, { xMin: 99.6, xMax: 110.1, zMin: 42, zMax: 55.5 });
assert.equal(theater9.entry.center, 102.7);
assert.equal(theater9.entry.turnSide, "east");
assertNear(theater9Cubby.xMin, 101.1, "T9 cubby xMin");
assertNear(theater9Cubby.xMax, 104.3, "T9 cubby xMax");
assertNear(theater9Cubby.zMin, 52.1, "T9 cubby zMin");
assertNear(theater9Cubby.zMax, 55.5, "T9 cubby zMax");
const t9InnerHeader = boxById("theater-9-cubby-east-header-0");
assertNear(t9InnerHeader.x, planToWorldX(theater9Cubby.xMax), "T9 inner door physical-left X");
assertNear(t9InnerHeader.z, theater9.entry.innerDoorCenter, "T9 inner door Z");
assert.equal(colliderIdsMatching(world, /^theater-9-cubby-east-header-0$/).length, 1, "T9 needs one inner door in the cubby's plan-east/physical-left wall.");
assert.deepEqual(colliderIdsMatching(world, /^theater-9-cubby-west-header-/), [], "T9 must not put its inner door on the physical-right side.");
const t9OuterThreshold = boxById("theater-9-outer-threshold");
const t9InnerThreshold = boxById("theater-9-inner-threshold");
assertNear(t9OuterThreshold.x, planToWorldX(102.7), "T9 outer-door center X");
assertNear(t9OuterThreshold.z, theater9.bounds.zMax, "T9 outer-door plane");
assertNear(t9InnerThreshold.x, planToWorldX(104.3), "T9 inner-door center X");
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
  const auditorium = auditoriumByNumber.get(number);
  const nookBounds = auditorium.entry.usherNookBounds;
  const floor = boxById(`theater-${number}-usher-nook-floor`);
  assertNear(floor.width, nookBounds.xMax - nookBounds.xMin, `T${number} usher-nook width`);
  assertNear(floor.depth, nookBounds.zMax - nookBounds.zMin, `T${number} usher-nook depth`);
  boxById(`theater-${number}-usher-nook-ceiling`);
  assertBoxMatchesBounds(`theater-${number}-ceiling`, auditorium.bounds, `T${number} rigidly moved auditorium ceiling`);
  assertBoxMatchesBounds(
    `theater-${number}-route-ceiling`,
    { ...auditorium.entry.ramp.bounds, zMin: auditorium.bounds.zMin, zMax: auditorium.entry.arrivalZ + 0.55 },
    `T${number} rigidly moved route ceiling`,
  );
}

for (const number of [9, 10, 11, 12]) {
  const auditorium = auditoriumByNumber.get(number);
  assertBoxMatchesBounds(`theater-${number}-ceiling`, auditorium.bounds, `T${number} rigidly moved ceiling`);
}
for (let index = 0; index < girls.footprintRects.length; index += 1) {
  assertBoxMatchesBounds(`girls-restroom-section-${index}-floor`, girls.footprintRects[index], `girls section ${index} floor`);
  assertBoxMatchesBounds(`girls-restroom-section-${index}-ceiling`, girls.footprintRects[index], `girls section ${index} ceiling`);
}
const candy = serviceById.get("candy-storage");
assertBoxMatchesBounds("candy-storage-floor", candy.bounds, "rigidly moved candy floor");
assertBoxMatchesBounds("candy-storage-ceiling", candy.bounds, "rigidly moved candy ceiling");

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
const futureUpstairs = serviceById.get("future-upstairs-stair");
const stairLeaf = boxById("future-upstairs-stair-closed-leaf");
assert.equal(futureUpstairs.entrySide, "east");
assertNear(stairLeaf.x, planToWorldX(theater6.bounds.xMin), "future stair door shared-wall x");
assertNear(stairLeaf.z, futureUpstairs.doorCenter, "future stair door z in T6 vestibule");
boxById("theater-6-west-wall-header-0");
boxById("future-upstairs-stair-closed-bar");
assert.deepEqual(
  authoredBoxes.filter(({ id }) => /^future-upstairs-stair-east-/.test(id)).map(({ id }) => id),
  [],
  "The stair shell must not duplicate T6's shared west wall.",
);
assert.deepEqual(
  colliderIdsMatching(world, /^future-upstairs-stair-east-/),
  [],
  "No duplicate stair-east collider may overlap the T6 west wall.",
);
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

world.updateVisibility(planToWorldX(1.5), -6.8 + FRONT_SHIFT_Z);
for (const { group } of world.auditoriumGroups.values()) assert.equal(group.visible, true, "Auditorium interiors must remain resident and visible.");
const removedHallPosters = [];
scene.traverse(({ name }) => {
  if (/^poster-\d+$/.test(name)) removedHallPosters.push(name);
});
assert.deepEqual(removedHallPosters, [], "V10 must not restore the removed random NOW SHOWING posters.");
const minimap = createMinimap({ canvas: new FakeCanvas(700, 360) });
minimap.updatePlayer({ x: -2, z: HALL_PLAN.wide.zMin + 1, directionX: 1, directionZ: 0 });
minimap.draw();
minimap.destroy();
world.dispose();
assert.equal(disposedBarScreenTextures.size, encounteredBarScreenTextures.size, "World disposal must release every rotating bar-screen texture.");
assert.equal(oppositeMuralTextureDisposed, true, "World disposal must release the distinct opposite-lobby mural texture.");
materials.dispose();

console.log(
  `World smoke valid: V16 · ${world.stats.meshCount} runtime meshes · ${world.stats.instancedMeshCount} instanced · ${world.stats.colliderCount} colliders · paired front vestibule + lowered full mechanical ceiling + steep open stair/landing nook + distinct trimmed mural.`,
);
