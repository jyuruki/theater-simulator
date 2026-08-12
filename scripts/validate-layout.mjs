import assert from "node:assert/strict";

import {
  ALL_ZONES,
  AUDITORIUM_ENTRY_ZONES,
  AUDITORIUMS,
  AUDITORIUM_PRESETS,
  COURTYARD_PLAN,
  EQUIPMENT_ANCHORS,
  EXPECTED_SEAT_TOTAL,
  FOUNTAIN_PLAN,
  HALL_END_EXITS,
  LOBBY_PLAN,
  MAP_BOUNDS,
  PLAYER_SPAWN_PLAN,
  POS_STATIONS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  TICKET_APPROACH_PLAN,
  pointInBounds,
  validateLayoutData,
} from "../src/layout-data.js";
import {
  buildAuditoriumLayouts,
  pointInRect,
  sampleAuditoriumGround,
  selectGroundCandidate,
} from "../src/layout-geometry.js";
import {
  planToWorldBounds,
  planToWorldDirection,
  planToWorldX,
  worldToPlanDirection,
  worldToPlanX,
} from "../src/coordinates.js";

const EXPECTED_CAPACITIES = Object.freeze({
  1: 38, 2: 38, 3: 148, 4: 58, 5: 58, 6: 148, 7: 153, 8: 152,
  9: 50, 10: 50, 11: 50, 12: 50, 13: 50, 14: 50,
});

const EXPECTED_PRESET_GROUPS = Object.freeze({
  compact38: [1, 2],
  medium58: [4, 5],
  large150: [3, 6, 7, 8],
  standard50: [9, 10, 11, 12, 13, 14],
});

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique.`);
}

function assertValidBounds(entity, label) {
  const { bounds } = entity;
  assert.ok(bounds, `${label} is missing bounds.`);
  for (const key of ["xMin", "xMax", "zMin", "zMax"]) assert.ok(Number.isFinite(bounds[key]), `${label}.${key} must be finite.`);
  assert.ok(bounds.xMin < bounds.xMax, `${label} must have positive width.`);
  assert.ok(bounds.zMin < bounds.zMax, `${label} must have positive depth.`);
  assert.ok(bounds.xMin >= MAP_BOUNDS.xMin && bounds.xMax <= MAP_BOUNDS.xMax, `${label} extends beyond MAP_BOUNDS X.`);
  assert.ok(bounds.zMin >= MAP_BOUNDS.zMin && bounds.zMax <= MAP_BOUNDS.zMax, `${label} extends beyond MAP_BOUNDS Z.`);
}

function boundsOverlap(first, second) {
  return first.xMin < second.xMax && first.xMax > second.xMin
    && first.zMin < second.zMax && first.zMax > second.zMin;
}

function boundsWidth(bounds) {
  return bounds.xMax - bounds.xMin;
}

function boundsDepth(bounds) {
  return bounds.zMax - bounds.zMin;
}

function fixtureCount(banks = []) {
  return banks.reduce((total, bank) => total + bank.count, 0);
}

function assertNear(actual, expected, message, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
}

const validation = validateLayoutData();
assert.equal(validation.valid, true, `validateLayoutData failed:\n- ${validation.errors.join("\n- ")}`);

assert.equal(AUDITORIUMS.length, 14, "Exactly 14 auditoriums are required.");
assert.deepEqual(
  AUDITORIUMS.map(({ number }) => number).sort((a, b) => a - b),
  Array.from({ length: 14 }, (_, index) => index + 1),
  "Auditorium numbers must be exactly 1–14.",
);

for (const auditorium of AUDITORIUMS) {
  assert.equal(auditorium.seats, EXPECTED_CAPACITIES[auditorium.number], `Theater ${auditorium.number} has the wrong capacity.`);
  assert.equal(auditorium.rows.reduce((sum, count) => sum + count, 0), auditorium.seats, `Theater ${auditorium.number} row total is wrong.`);
  const preset = AUDITORIUM_PRESETS[auditorium.preset];
  assert.ok(preset, `Theater ${auditorium.number} has an unknown preset.`);
  assert.equal(auditorium.bounds.xMax - auditorium.bounds.xMin, preset.width, `Theater ${auditorium.number} width differs from ${auditorium.preset}.`);
  assert.equal(auditorium.bounds.zMax - auditorium.bounds.zMin, preset.depth, `Theater ${auditorium.number} depth differs from ${auditorium.preset}.`);
  assert.equal(auditorium.stadium.aisles, "dual-side", `Theater ${auditorium.number} must use dual side aisles.`);
}

for (const [preset, expectedNumbers] of Object.entries(EXPECTED_PRESET_GROUPS)) {
  const actual = AUDITORIUMS.filter((room) => room.preset === preset).map((room) => room.number).sort((a, b) => a - b);
  assert.deepEqual(actual, expectedNumbers, `${preset} theater grouping is incorrect.`);
}

assert.equal(EXPECTED_SEAT_TOTAL, 1093);
assert.equal(AUDITORIUMS.reduce((sum, room) => sum + room.seats, 0), 1093);
assert.equal(validation.seatTotal, 1093);

const baseRooms = [...PUBLIC_SPACES, ...SERVICE_ROOMS, ...AUDITORIUMS];
assertUnique(baseRooms.map(({ id }) => id), "Base room IDs");
assertUnique(ALL_ZONES.map(({ id }) => id), "ALL_ZONES IDs");
assertUnique([...ALL_ZONES, ...AUDITORIUM_ENTRY_ZONES].map(({ id }) => id), "Navigable zone IDs");
assertUnique(EQUIPMENT_ANCHORS.map(({ id }) => id), "Equipment anchor IDs");
assertUnique(POS_STATIONS.map(({ id }) => id), "POS station IDs");
assertValidBounds({ bounds: MAP_BOUNDS }, "MAP_BOUNDS");
for (const room of baseRooms) assertValidBounds(room, room.id);
for (const zone of AUDITORIUM_ENTRY_ZONES) assertValidBounds(zone, zone.id);

const roomsById = new Map([...PUBLIC_SPACES, ...SERVICE_ROOMS].map((room) => [room.id, room]));
const roomById = (id) => roomsById.get(id);
const auditoriumByNumber = new Map(AUDITORIUMS.map((auditorium) => [auditorium.number, auditorium]));
for (const anchor of EQUIPMENT_ANCHORS) {
  const room = roomById(anchor.roomId);
  assert.ok(room, `${anchor.id} references missing room ${anchor.roomId}.`);
  assert.equal(anchor.position.length, 3);
  assert.equal(anchor.footprint.length, 2);
  assert.ok(anchor.position.every(Number.isFinite));
  assert.ok(anchor.footprint.every((value) => Number.isFinite(value) && value > 0));
  assert.ok(pointInBounds(anchor.position[0], anchor.position[2], room.bounds), `${anchor.id} center lies outside ${anchor.roomId}.`);
  const cosine = Math.abs(Math.cos(anchor.rotation));
  const sine = Math.abs(Math.sin(anchor.rotation));
  const halfWidth = (anchor.footprint[0] * cosine + anchor.footprint[1] * sine) / 2;
  const halfDepth = (anchor.footprint[0] * sine + anchor.footprint[1] * cosine) / 2;
  const [x, , z] = anchor.position;
  assert.ok(x - halfWidth >= room.bounds.xMin && x + halfWidth <= room.bounds.xMax
    && z - halfDepth >= room.bounds.zMin && z + halfDepth <= room.bounds.zMax, `${anchor.id} footprint extends outside ${anchor.roomId}.`);
}

const topEntryNumbers = AUDITORIUMS.filter((room) => room.stadium.access === "top").map((room) => room.number);
const bottomEntryNumbers = AUDITORIUMS.filter((room) => room.stadium.access === "bottom").map((room) => room.number);
assert.deepEqual(topEntryNumbers, [1, 2, 9, 10, 11, 12, 13, 14], "Small auditoriums must be top-entry.");
assert.deepEqual(bottomEntryNumbers, [3, 4, 5, 6, 7, 8], "Theaters 3–8 must be bottom-entry.");
assert.deepEqual(
  AUDITORIUMS.filter(({ entry }) => entry.type === "trash-cubby").map(({ number, entry }) => [number, entry.turnSide]),
  [[1, "east"], [2, "west"], [9, "west"], [10, "east"], [11, "east"], [12, "east"], [13, "east"], [14, "west"]],
  "Small-theater cubby doors must retain the drawing-specific handedness.",
);

for (const [firstNumber, secondNumber, sharedBoundary] of [[1, 2, -25.5], [13, 14, 28.5]]) {
  const first = auditoriumByNumber.get(firstNumber);
  const second = auditoriumByNumber.get(secondNumber);
  assert.equal(first.bounds.xMin, sharedBoundary, `T${firstNumber} must meet its paired room at the shared wall.`);
  assert.equal(second.bounds.xMax, sharedBoundary, `T${secondNumber} must meet its paired room at the shared wall.`);
  assert.equal(first.entry.cubbyBounds.xMin, sharedBoundary, `T${firstNumber} cubby must start at the pair wall.`);
  assert.equal(second.entry.cubbyBounds.xMax, sharedBoundary, `T${secondNumber} cubby must end at the pair wall.`);
  assert.equal(first.entry.sharedPair, second.entry.sharedPair, `T${firstNumber}/T${secondNumber} must identify the same pair.`);
  assert.equal(
    [first, second].filter(({ entry }) => entry.sharedWallOwner === true).length,
    1,
    `T${firstNumber}/T${secondNumber} must author their shared wall exactly once.`,
  );
  assert.equal(first.entry.cubbyBounds.zMin, second.entry.cubbyBounds.zMin);
  assert.equal(first.entry.cubbyBounds.zMax, second.entry.cubbyBounds.zMax);
}

for (const auditorium of AUDITORIUMS.filter(({ entry }) => entry.type === "trash-cubby")) {
  const cubbyDepth = auditorium.entry.cubbyBounds
    ? boundsDepth(auditorium.entry.cubbyBounds)
    : auditorium.entry.cubbyDepth;
  assert.ok(cubbyDepth >= 3.4 - 1e-6, `Theater ${auditorium.number} needs the deeper V6 trash cubby.`);
  const halfWidth = auditorium.entry.cubbyHalfWidth ?? 1.6;
  const cubby = auditorium.entry.cubbyBounds ?? {
    xMin: auditorium.entry.center - halfWidth,
    xMax: auditorium.entry.center + halfWidth,
  };
  const sideClearance = auditorium.entry.turnSide === "east"
    ? auditorium.bounds.xMax - cubby.xMax
    : cubby.xMin - auditorium.bounds.xMin;
  assert.ok(sideClearance >= 1.4, `Theater ${auditorium.number} cubby turn is too cramped for the player.`);
}

const layouts = buildAuditoriumLayouts(AUDITORIUMS);
for (const auditorium of AUDITORIUMS) {
  const layout = layouts.get(auditorium.id);
  assert.equal(layout.rows.length, auditorium.rows.length);
  assert.equal(layout.sideStairTreads.length, (auditorium.rows.length - 1) * 2 * 2, `${auditorium.id} needs two half-steps per transition on both sides.`);
  assert.ok(layout.halfStepRise <= 0.22, `${auditorium.id} half-step is too high for reliable walking.`);
  assert.ok(layout.sideAisles.west.bounds.xMax <= layout.seatBounds.xMin + 1e-6);
  assert.ok(layout.sideAisles.east.bounds.xMin >= layout.seatBounds.xMax - 1e-6);
  if (layout.access === "top") {
    assert.equal(layout.backElevation, 0, `${auditorium.id} must meet the hall at y=0.`);
    assert.ok(layout.frontElevation < 0, `${auditorium.id} rows must descend toward its screen.`);
    assert.ok(layout.routeSurfaces.some((surface) => surface.kind === "top-entry-landing"));
    assert.ok(!layout.routeSurfaces.some((surface) => surface.kind === "corridor-ramp"), `${auditorium.id} cannot have an entry ramp.`);
    const halfWidth = auditorium.entry.cubbyHalfWidth ?? 1.6;
    const cubby = auditorium.entry.cubbyBounds ?? {
      xMin: auditorium.entry.center - halfWidth,
      xMax: auditorium.entry.center + halfWidth,
      zMin: auditorium.bounds.zMax - auditorium.entry.cubbyDepth,
      zMax: auditorium.bounds.zMax,
    };
    const rearSeatClearance = (cubby.zMin - 0.09) - (layout.backRowZ + 0.39);
    assert.ok(rearSeatClearance >= 0.8, `${auditorium.id} needs a clear rear landing to reach both side stairs; got ${rearSeatClearance.toFixed(3)}m.`);
  } else {
    assert.ok(layout.frontElevation >= 0, `${auditorium.id} bottom entry cannot descend below the hall.`);
    assert.ok(layout.backElevation > layout.frontElevation, `${auditorium.id} rows must rise away from its screen.`);
  }
}

const t1Layout = layouts.get("theater-1");
const t1FrontGround = sampleAuditoriumGround(t1Layout, t1Layout.sideAisles.west.centerX, t1Layout.frontRowZ);
const t1RearGround = sampleAuditoriumGround(t1Layout, t1Layout.sideAisles.west.centerX, t1Layout.backRowZ);
assert.equal(selectGroundCandidate(t1FrontGround, 0).height, t1Layout.frontElevation, "T1 side stairs must descend below the hall.");
assert.equal(selectGroundCandidate(t1RearGround, 0).height, 0, "T1 rear landing must remain level with the hall.");

const t3 = AUDITORIUMS.find(({ number }) => number === 3);
const t3Layout = layouts.get(t3.id);
const t3RampMid = t3.entry.ramp.bounds;
const midX = (t3RampMid.xMin + t3RampMid.xMax) / 2;
const midZ = (t3RampMid.zMin + t3RampMid.zMax) / 2;
const t3RampCandidate = selectGroundCandidate(sampleAuditoriumGround(t3Layout, midX, midZ), 0);
assert.ok(Math.abs(t3RampCandidate.height - 0.12) < 0.001, "T3 route must use a subtle continuous incline.");
assert.ok(
  t3Layout.bowlBounds.xMax >= t3.entry.routeBounds.xMin,
  "T3 route and front seating cross-aisle must meet without a ground seam.",
);

const t6Storage = roomById("under-storage-6");
const t6Layout = layouts.get("theater-6");
const upperAtStorageBack = sampleAuditoriumGround(t6Layout, t6Layout.sideAisles.west.centerX, t6Storage.bounds.zMax)
  .filter((candidate) => candidate.level === "seating-bowl");
assert.ok(upperAtStorageBack.some((candidate) => candidate.height > t6Storage.ceilingHeight), "T6 storage roof must clear the seating deck above it.");
assert.equal(t6Storage.doorCenters.length, 2, "T6 storage must have two doors to one room.");
assert.equal(roomById("under-storage-3").doorCenters.length, 2, "T3 storage must have two doors to one room.");
assert.ok(Number.isFinite(roomById("under-storage-3").ceilingHeight));
assert.equal(boundsOverlap(roomById("under-storage-3").bounds, roomById("trash-room").bounds), false);
assert.equal(boundsOverlap(roomById("under-storage-3").bounds, roomById("boys-restroom").bounds), false);

const t3Storage = roomById("under-storage-3");
assert.equal(t3.entry.usherNookBounds.zMin, t3Storage.accessHall.zMin, "T3 usher nook must begin beside the horizontal storage anteroom.");
assert.equal(t3.entry.usherNookBounds.xMax, t3.entry.routeBounds.xMin, "T3 usher nook must open directly to the public route.");
assert.equal(t3.entry.usherNookBounds.xMin, t3Storage.accessHall.xMax, "T3 nook must meet the anteroom's single east door.");
assert.equal(t3.entry.usherNookBounds.zMax, t3Storage.accessHall.zMax, "T3 nook and anteroom must share their full depth.");
assert.equal(t3Storage.outerDoorSide, "east", "T3 anteroom must have one east-side door from the usher nook.");
assert.equal(Number.isFinite(t3Storage.outerDoorCenter), true, "T3 anteroom needs one scalar outer-door center.");
assert.equal("outerDoorCenters" in t3Storage, false, "T3 anteroom must not invent a second outer door.");
assert.ok(
  t3Storage.outerDoorCenter > t3Storage.accessHall.zMin
    && t3Storage.outerDoorCenter < t3Storage.accessHall.zMax,
  "T3 anteroom outer door must lie on the nook boundary.",
);
assert.equal(t3Storage.orientation, "horizontal");
assert.equal(t3Storage.doorSide, "south", "T3 under-tier room must have its two doors on the south wall.");
assert.deepEqual(t3Storage.doorCenters, [-30.6, -24.3], "T3 under-tier room must retain the two drawn south doors.");
assert.equal(t3Storage.accessHall.zMax, t3Storage.bounds.zMin, "T3 anteroom must terminate at the under-tier room.");
assert.ok(t3Storage.doorCenters.every((center) => center > t3Storage.bounds.xMin && center < t3Storage.bounds.xMax));
assert.ok(t3.entry.center > t3.entry.entranceStemBounds.xMin && t3.entry.center < t3.entry.entranceStemBounds.xMax);
assert.equal(t3.entry.entranceStemBounds.zMin, COURTYARD_PLAN.backWallZ);
assert.equal(t3.entry.entranceStemBounds.zMax, t3.entry.entranceLateralBounds.zMin);
assert.equal(t3.entry.entranceLateralBounds.xMin, t3.entry.routeBounds.xMin, "T3's courtyard dogleg must overlap the existing straight route without a floor seam.");
assert.equal(t3.entry.entranceLateralBounds.zMax, t3.entry.routeBounds.zMin);

const theater4 = AUDITORIUMS.find(({ number }) => number === 4);
const theater5 = AUDITORIUMS.find(({ number }) => number === 5);
assert.deepEqual(
  COURTYARD_PLAN.doors.map(({ targetId }) => targetId),
  ["theater-3", "future-task-room", "theater-4", "theater-5"],
  "The shared courtyard wall must read T3, task, T4, T5 from plan-left to plan-right.",
);
assert.ok(COURTYARD_PLAN.doors.every(({ center }) => center > COURTYARD_PLAN.bounds.xMin && center < COURTYARD_PLAN.bounds.xMax));
assert.equal(t3.entry.outerPlaneZ, COURTYARD_PLAN.backWallZ);
assert.equal(theater4.entry.outerPlaneZ, COURTYARD_PLAN.backWallZ);
assert.equal(theater5.entry.outerPlaneZ, COURTYARD_PLAN.backWallZ);
assert.equal(roomById("future-task-room").bounds.zMin, COURTYARD_PLAN.backWallZ);
assert.equal(SERVICE_ROOMS.some(({ id }) => id === "usher-stock"), false, "T4/T5 must not have invented lower stock.");
assert.ok(theater4.bounds.zMin >= 75 && theater5.bounds.zMin >= 75, "T4/T5 must be recessed behind the fountain court.");

const courtyardDoors = new Map(COURTYARD_PLAN.doors.map((door) => [door.targetId, door]));
const t3CourtDoor = courtyardDoors.get("theater-3");
const taskCourtDoor = courtyardDoors.get("future-task-room");
const t4CourtDoor = courtyardDoors.get("theater-4");
const t5CourtDoor = courtyardDoors.get("theater-5");
const courtGaps = [
  t4CourtDoor.center - t4CourtDoor.width / 2 - FOUNTAIN_PLAN.rearCounter.xMax,
  t5CourtDoor.center - t5CourtDoor.width / 2 - (t4CourtDoor.center + t4CourtDoor.width / 2),
  COURTYARD_PLAN.bounds.xMax - (t5CourtDoor.center + t5CourtDoor.width / 2),
];
assertNear(courtGaps[0], 0.4, "Compact court counter-to-T4 gap");
assertNear(courtGaps[1], 0.7, "Compact court T4-to-T5 gap");
assertNear(courtGaps[2], 0.3, "Compact court T5-to-east-wall gap");
assert.ok(courtGaps.every((gap) => gap >= 0 && gap <= 0.75), "The compact court cannot regain an empty east bay.");
assertNear(
  taskCourtDoor.center - taskCourtDoor.width / 2 - (t3CourtDoor.center + t3CourtDoor.width / 2),
  1.5,
  "T3-to-task clear wall gap",
);
assertNear(FOUNTAIN_PLAN.rearCounter.xMin - (taskCourtDoor.center + taskCourtDoor.width / 2), 0.1, "Task door-to-rear-counter gap");
assert.ok(COURTYARD_PLAN.waistPartition.x > t3CourtDoor.center + t3CourtDoor.width / 2);
assert.ok(COURTYARD_PLAN.waistPartition.x < taskCourtDoor.center - taskCourtDoor.width / 2);
assertNear(COURTYARD_PLAN.waistPartition.x, -3.55, "T3/task waist-partition center");
assert.equal(COURTYARD_PLAN.waistPartition.zMin, FOUNTAIN_PLAN.island.zMin);
assert.equal(COURTYARD_PLAN.waistPartition.zMax, COURTYARD_PLAN.backWallZ);
assert.ok(COURTYARD_PLAN.waistPartition.height >= 1 && COURTYARD_PLAN.waistPartition.height <= 1.15);
assertNear(
  courtGaps.reduce((sum, gap) => sum + gap, 0) + t4CourtDoor.width + t5CourtDoor.width,
  COURTYARD_PLAN.bounds.xMax - FOUNTAIN_PLAN.rearCounter.xMax,
  "Counter, T4, T5, and wall must consume the compact court width",
);

assert.equal(theater4.bounds.xMax, theater5.bounds.xMin, "T4 and T5 must remain directly paired.");
assert.equal(theater4.entry.firstTurn, "west");
assert.equal(theater5.entry.firstTurn, "east", "T5 must take the east turn retained in V6.");
assert.equal(theater5.entry.routeSide, "east", "T5 must arrive on the east side of its screen.");
assert.equal(theater5.entry.stemBounds.zMin, COURTYARD_PLAN.backWallZ);
assert.equal(theater5.entry.stemBounds.zMax, theater5.entry.lateralBounds.zMin);
assert.equal(theater5.entry.lateralBounds.zMax, theater5.entry.longRouteBounds.zMin);
assert.equal(theater5.entry.stemBounds.xMax, COURTYARD_PLAN.bounds.xMax, "T5 stem must use the wall-side edge of the court.");
assert.equal(theater5.entry.lateralBounds.xMax, theater5.bounds.xMax);
assert.equal(theater5.entry.longRouteBounds.xMax, theater5.bounds.xMax);
assert.equal(boundsWidth(theater5.entry.longRouteBounds), theater5.entry.routeWidth);
assert.ok(theater5.entry.arrivalZ > theater5.entry.longRouteBounds.zMin
  && theater5.entry.arrivalZ < theater5.entry.longRouteBounds.zMax);

const theater8 = AUDITORIUMS.find(({ number }) => number === 8);
const theater9 = AUDITORIUMS.find(({ number }) => number === 9);
const theater10 = AUDITORIUMS.find(({ number }) => number === 10);
assert.ok(theater8.entry.center > theater10.entry.center && theater8.entry.center < theater9.entry.center, "T8 entrance must fall after T10 and before T9.");
for (const number of [7, 8]) {
  const auditorium = auditoriumByNumber.get(number);
  const nook = auditorium.entry.usherNookBounds;
  assert.ok(nook, `Theater ${number} needs the drawn usher waiting nook.`);
  assert.equal(auditorium.entry.routeSide, "west");
  assert.equal(nook.zMin, auditorium.bounds.zMin, `Theater ${number} nook must begin at its hall door.`);
  assert.equal(nook.zMax, auditorium.entry.ramp.bounds.zMin, `Theater ${number} nook must meet the start of the incline.`);
  assert.equal(nook.xMin, auditorium.entry.ramp.bounds.xMax, `Theater ${number} nook must open directly beside its route.`);
  assert.ok(auditorium.entry.center < nook.xMin, `Theater ${number} nook must sit to the right of the entering usher.`);
  assertNear(boundsWidth(nook), 3, `Theater ${number} usher-nook width`);
  assertNear(boundsDepth(nook), 4.3, `Theater ${number} usher-nook depth`);
}

assert.equal(LOBBY_PLAN.customerCounter.length, 5, "Bent concession/bar counter must preserve every sketched vertex.");
assert.deepEqual(LOBBY_PLAN.customerCounter[0], { x: -8.8, z: 20.4 });
assert.deepEqual(LOBBY_PLAN.customerCounter.at(-1), { x: -20.1, z: 4.9 });
assert.notEqual(LOBBY_PLAN.customerCounter[2].x, LOBBY_PLAN.customerCounter[3].x, "The POS face must retain its diagonal bend.");
assert.equal(POS_STATIONS.length, 6, "The diagonal concession face needs six POS stations.");
assert.ok(POS_STATIONS.every((station) => station.counterSegment === "diagonal-pos-run"));
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "popper").length, 2, "The lobby sketch specifies two poppers.");
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "fryer").length, 2, "The hot line needs two fryer placeholders.");
assert.equal(LOBBY_PLAN.kiosks.length, 2, "The lobby needs two customer ticket kiosks.");
assert.equal(LOBBY_PLAN.frontDoorCenters.length, 3, "The lobby front needs three double-door banks.");
assert.equal(LOBBY_PLAN.kitchenStorageDoor.wall, "diagonal", "Kitchen storage must connect through the diagonal wall.");
assert.equal(LOBBY_PLAN.kitchenStorageDoor.partitionSegment, 1);
assert.ok(LOBBY_PLAN.kitchenStorageDoor.width >= 1.5);
assert.deepEqual(LOBBY_PLAN.officePath, ["lobby", "office-overflow", "office"]);
assert.equal(roomById("office-overflow").extraDoors[0].side, "north", "Office overflow must connect to the main office through a second door.");
assert.equal(roomById("electrical-room").closed, true, "The extra approach door is a closed electrical room in v3.");
assert.ok(pointInRect(21.4, 3.3, LOBBY_PLAN.envelope));

const boys = roomById("boys-restroom");
const girls = roomById("girls-restroom");
assert.deepEqual(boys.pathTurns, ["left", "left"], "Boys restroom must retain the two-turn privacy route.");
assert.equal(boys.footprintRects.length, 2, "Boys restroom must retain its entrance lobe.");
assert.equal(boys.entry.side, "west");
assert.equal(boys.entry.coordinate, boys.footprintRects[1].xMin);
assert.deepEqual(boys.entry, { side: "west", coordinate: -24.05, center: 63.45, width: 1.9 });
assert.equal(boys.privacyTurn, "west");
assert.deepEqual(boys.fixtures.stalls.map(({ count }) => count), [9], "Boys restroom requires one bank of nine stalls.");
assert.deepEqual(boys.fixtures.urinals.map(({ count }) => count), [6], "Boys restroom requires six urinals.");
assert.deepEqual(boys.fixtures.sinks.map(({ count, trough }) => [count, trough]), [[1, true]], "Boys restroom requires one long sink.");
assert.equal(fixtureCount(boys.fixtures.stalls), 9);
assert.equal(fixtureCount(boys.fixtures.urinals), 6);
assert.equal(fixtureCount(boys.fixtures.sinks), 1);
const boysMain = boys.footprintRects[0];
const boysStallDoorZ = boysMain.zMin + boys.fixtures.stalls[0].depth - 0.025;
const boysUrinalFrontZ = boysMain.zMax - 0.32 - 0.42 / 2;
assert.ok(boysUrinalFrontZ - boysStallDoorZ >= 1.55, "Boys restroom needs visibly more space between stalls and urinals.");
const boysFountainNook = publicById("boys-fountain-alcove");
assert.ok(boundsWidth(boysFountainNook.bounds) <= 3.2, "The water-fountain/restroom nook must stay compact.");
assert.equal(boysFountainNook.bounds.xMax, boys.entry.coordinate, "The compact nook must terminate at the restroom cubby door.");
assert.equal(roomById("trash-room").bounds.xMax, boysFountainNook.bounds.xMin, "The fountain nook must sit directly beside Trash.");

assert.equal(girls.footprintRects.length, 4, "Girls restroom must retain its concave entrance, connector, and southwest lobe.");
assert.equal(girls.entry.side, "west");
assert.equal(girls.entry.coordinate, girls.footprintRects[3].xMin);
assert.deepEqual(girls.entry, { side: "west", coordinate: 68.3, center: 63.85, width: 2.05 });
assert.deepEqual(girls.fixtures.stalls.map(({ side, count }) => [side, count]), [
  ["north", 6], ["south", 6], ["south-lobe", 2],
]);
assert.deepEqual(girls.fixtures.sinks.map(({ side, count }) => [side, count]), [["north", 3]]);
assert.equal(fixtureCount(girls.fixtures.stalls), 14, "Girls restroom requires exactly fourteen stalls.");
assert.equal(fixtureCount(girls.fixtures.sinks), 3, "Girls restroom requires exactly three sinks.");
assert.equal(fixtureCount(girls.fixtures.urinals), 0);

const candy = roomById("candy-storage");
assertNear(boundsWidth(candy.bounds), 10, "Candy-storage width");
assertNear(boundsDepth(candy.bounds), 5, "Candy-storage shallow depth");
assert.ok(boundsWidth(candy.bounds) >= boundsDepth(candy.bounds) * 2, "Candy storage must be wide and shallow, not square.");
assert.equal(candy.entrySide, "south");
assert.equal(Number.isFinite(candy.doorCenter), true, "Candy storage needs one hall door.");
assert.equal(candy.doorCenter, 130.2);
assert.equal("extraDoors" in candy, false, "Candy storage must not regain the random exit door.");
assert.ok(candy.doorCenter - candy.bounds.xMin <= 2, "Candy door must remain at the left end of the room.");

assert.equal(HALL_END_EXITS.length, 2, "Both ends of the main hall need closed exterior doors.");

const hall = publicById("main-corridor");
const approach = publicById("lobby-approach");
assert.ok(hall.bounds.xMax - hall.bounds.xMin >= 175, "The theater hall must remain long after spacing compression.");
assert.ok(hall.bounds.zMax - hall.bounds.zMin <= 4.3, "The theater hall must remain narrow.");
assert.ok(approach.bounds.zMax - approach.bounds.zMin >= 30, "The lobby-to-ticket approach must remain long.");
assert.deepEqual(approach.bounds, TICKET_APPROACH_PLAN.bounds);
assertNear(boundsWidth(approach.bounds), boundsWidth(FOUNTAIN_PLAN.island), "Approach must be the fountain-counter width");
assertNear(boundsWidth(approach.bounds), 12.6, "V6 narrow approach width");
const posterAlcove = publicById("ticket-poster-alcove");
const emptyAlcove = publicById("ticket-empty-alcove");
assert.deepEqual(posterAlcove.bounds, TICKET_APPROACH_PLAN.posterAlcove);
assert.deepEqual(emptyAlcove.bounds, TICKET_APPROACH_PLAN.emptyAlcove);
assert.equal(posterAlcove.bounds.xMax, approach.bounds.xMin, "Poster alcove must form the west 90-degree pocket.");
assert.equal(emptyAlcove.bounds.xMin, approach.bounds.xMax, "Empty alcove must form the east 90-degree pocket.");
assert.equal(posterAlcove.bounds.zMin, emptyAlcove.bounds.zMin);
assert.equal(posterAlcove.bounds.zMax, emptyAlcove.bounds.zMax);
assertNear(boundsWidth(posterAlcove.bounds), 6, "Poster alcove width");
assertNear(boundsDepth(posterAlcove.bounds), 5.8, "Poster alcove depth");
assertNear(boundsWidth(emptyAlcove.bounds), 6, "Empty alcove width");
assertNear(boundsDepth(emptyAlcove.bounds), 5.8, "Empty alcove depth");
assert.equal(boundsOverlap(posterAlcove.bounds, approach.bounds), false);
assert.equal(boundsOverlap(emptyAlcove.bounds, approach.bounds), false);
const ticketCheck = publicById("ticket-check");
assert.equal(ticketCheck.bounds.xMin - approach.bounds.xMin, 1);
assert.equal(approach.bounds.xMax - ticketCheck.bounds.xMax, 1);
assert.equal(ticketCheck.bounds.zMin, posterAlcove.bounds.zMin);
assert.equal(roomById("future-task-room").bounds.zMin > 67, true, "Future task room must sit behind both fountain counters.");

assert.deepEqual(
  [FOUNTAIN_PLAN.rearCounter.xMin, FOUNTAIN_PLAN.rearCounter.xMax],
  [FOUNTAIN_PLAN.island.xMin, FOUNTAIN_PLAN.island.xMax],
  "Rear and island fountain counters must remain the same length.",
);
assert.equal(FOUNTAIN_PLAN.rearCounter.zMax, COURTYARD_PLAN.backWallZ, "Rear fountain counter must be flush with the shared back wall.");
assert.ok(FOUNTAIN_PLAN.rearCounter.zMin > FOUNTAIN_PLAN.island.zMax, "The two fountain counters need a working aisle between them.");

assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "soda-fountain").length, 2);
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "icee-fountain").length, 2);
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").length, 2);
assert.ok(EQUIPMENT_ANCHORS.filter(({ roomId }) => roomId === "soda-service").every(({ rotation }) => rotation === 0));

const theater6 = AUDITORIUMS.find(({ number }) => number === 6);
const futureUpstairs = roomById("future-upstairs-stair");
assert.equal(futureUpstairs.closed, true);
assert.deepEqual(
  {
    stairBounds: futureUpstairs.bounds,
    stairDoor: futureUpstairs.doorCenter,
    theater6Door: theater6.entry.center,
    vestibule: theater6.entry.vestibuleBounds,
    transverse: theater6.entry.transverseBounds,
  },
  {
    stairBounds: { xMin: 25, xMax: 29.8, zMin: 62.2, zMax: 68.5 },
    stairDoor: 27.5,
    theater6Door: 31.2,
    vestibule: { xMin: 29.8, xMax: 32.6, zMin: 62.2, zMax: 65.5 },
    transverse: { xMin: 29.8, xMax: 60.5, zMin: 65.5, zMax: 68.5 },
  },
  "The future stair and earlier Theater 6 entrance must stay locked to the V6 drawing.",
);
assert.ok(theater6.entry.vestibuleBounds.zMax - theater6.entry.vestibuleBounds.zMin >= 3, "T6 needs a few feet of straight vestibule before its right turn.");
assert.equal(theater6.entry.vestibuleBounds.zMax, theater6.entry.transverseBounds.zMin);
assert.equal(theater6.entry.transverseBounds.zMax, theater6.entry.longRouteBounds.zMin);
assert.equal(boundsWidth(theater6.entry.longRouteBounds), theater6.entry.routeWidth);
assert.equal(theater6.entry.longRouteBounds.xMax, theater6.bounds.xMax, "T6 long route must remain on its east side.");
assert.equal(t6Storage.ceilingHeight, 2.32, "T6 under-tier route needs the authoritative low roof height.");
assert.equal(t6Storage.bounds.zMin, theater6.entry.transverseBounds.zMax);
assert.equal(t6Storage.bounds.xMax, theater6.entry.longRouteBounds.xMin);

for (const sample of [-40, -20, 1.5, 42, 140]) assert.equal(worldToPlanX(planToWorldX(sample)), sample);
assert.equal(planToWorldX(PLAYER_SPAWN_PLAN.x), PLAYER_SPAWN_PLAN.x);
assert.ok(planToWorldX(-20) > PLAYER_SPAWN_PLAN.x, "Sketch-left concession must be physical player-left.");
assert.equal(worldToPlanDirection({ x: -1, z: 0 }).x, 1);
assert.equal(planToWorldDirection({ x: 1, z: 0 }).x, -1);
const worldBounds = planToWorldBounds(MAP_BOUNDS);
assert.ok(worldBounds.xMin < worldBounds.xMax);
assert.equal(worldBounds.xMax - worldBounds.xMin, MAP_BOUNDS.xMax - MAP_BOUNDS.xMin);

console.log(
  `Layout valid: v6 · 14 theaters · 1,093 brown-leather tray seats · ${EQUIPMENT_ANCHORS.length} equipment anchors · ${POS_STATIONS.length} diagonal POS stations.`,
);

function publicById(id) {
  return PUBLIC_SPACES.find((space) => space.id === id);
}
