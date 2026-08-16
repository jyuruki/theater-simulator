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
  FRONT_SHIFT_Z,
  HALL_END_EXITS,
  HALL_PLAN,
  LOBBY_CEILING_PLAN,
  LOBBY_PLAN,
  LOBBY_SHIFT_X,
  MAP_BOUNDS,
  PLAYER_SPAWN_PLAN,
  POS_STATIONS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  T3_MEN_PLAN,
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

function assertRigidZShift(actual, baseline, label) {
  assert.deepEqual(
    actual,
    {
      xMin: baseline.xMin,
      xMax: baseline.xMax,
      zMin: baseline.zMin + FRONT_SHIFT_Z,
      zMax: baseline.zMax + FRONT_SHIFT_Z,
    },
    `${label} must be a rigid ${FRONT_SHIFT_Z}m Z translation with no resize or X drift.`,
  );
}

function assertRigidPlanShift(actual, baseline, xShift, zShift, label) {
  assert.deepEqual(
    actual,
    {
      xMin: baseline.xMin + xShift,
      xMax: baseline.xMax + xShift,
      zMin: baseline.zMin + zShift,
      zMax: baseline.zMax + zShift,
    },
    `${label} must be a rigid (${xShift}m X, ${zShift}m Z) translation with no resize.`,
  );
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
  assertNear(auditorium.bounds.xMax - auditorium.bounds.xMin, preset.width, `Theater ${auditorium.number} width differs from ${auditorium.preset}.`);
  assertNear(auditorium.bounds.zMax - auditorium.bounds.zMin, preset.depth, `Theater ${auditorium.number} depth differs from ${auditorium.preset}.`);
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

assert.equal(FRONT_SHIFT_Z, -2.5, "The front-module translation must remain authoritative.");
assert.deepEqual(HALL_PLAN, {
  transitionX: -13.62,
  southZ: 55.5,
  narrowNorthZ: 59.7,
  wideNorthZ: 62.2,
  narrow: { xMin: -40, xMax: -13.62, zMin: 55.5, zMax: 59.7 },
  wide: { xMin: -13.62, xMax: 113, zMin: 55.5, zMax: 62.2 },
  drinkingFountainWall: { x: -13.62, zMin: 59.7, zMax: 62.2 },
}, "V10 hall must step exactly at the drinking-fountain wall.");
assertNear(boundsDepth(HALL_PLAN.narrow), 4.2, "Narrow hall depth");
assertNear(boundsDepth(HALL_PLAN.wide), 6.7, "Wide hall depth");
assert.equal(HALL_PLAN.narrow.zMin, HALL_PLAN.wide.zMin, "Both hall legs must share one south edge.");
assert.equal(HALL_PLAN.narrow.xMax, HALL_PLAN.transitionX, "Narrow hall must terminate at the fountain wall.");
assert.equal(HALL_PLAN.wide.xMin, HALL_PLAN.transitionX, "Wide hall must begin at the fountain wall.");
assert.equal(HALL_PLAN.drinkingFountainWall.x, HALL_PLAN.transitionX);
assert.equal(HALL_PLAN.drinkingFountainWall.zMin, HALL_PLAN.narrowNorthZ);
assert.equal(HALL_PLAN.drinkingFountainWall.zMax, HALL_PLAN.wideNorthZ);

const v8StationaryTopEntryBounds = new Map([
  [1, { xMin: -25.5, xMax: -16, zMin: 45, zMax: 58 }],
  [2, { xMin: -35, xMax: -25.5, zMin: 45, zMax: 58 }],
  [13, { xMin: 28.5, xMax: 39, zMin: 44.5, zMax: 58 }],
  [14, { xMin: 18, xMax: 28.5, zMin: 44.5, zMax: 58 }],
]);
for (const [number, baseline] of v8StationaryTopEntryBounds) {
  assertRigidZShift(auditoriumByNumber.get(number).bounds, baseline, `Theater ${number}`);
}

const v9MovedTopEntryModules = new Map([
  [9, { xShift: -25.4, bounds: { xMin: 125, xMax: 135.5, zMin: 42, zMax: 55.5 }, center: 128.1 }],
  [10, { xShift: -17.5, bounds: { xMin: 96, xMax: 106.5, zMin: 42, zMax: 55.5 }, center: 98.1 }],
  [11, { xShift: -8, bounds: { xMin: 75, xMax: 85.5, zMin: 42, zMax: 55.5 }, center: 77.1 }],
  [12, { xShift: 1.5, bounds: { xMin: 54, xMax: 64.5, zMin: 42, zMax: 55.5 }, center: 56.1 }],
]);
for (const [number, baseline] of v9MovedTopEntryModules) {
  const auditorium = auditoriumByNumber.get(number);
  assertRigidPlanShift(auditorium.bounds, baseline.bounds, baseline.xShift, 0, `V10 Theater ${number}`);
  assertNear(auditorium.entry.center, baseline.center + baseline.xShift, `V10 Theater ${number} entrance translation`);
  assertNear(auditorium.entry.innerDoorCenter, 53.25, `V10 Theater ${number} inner-door Z preservation`);
}

const v10FrontPublicBounds = new Map([
  ["front-walk", { xMin: -27, xMax: 29, zMin: -10, zMax: 0 }],
  ["lobby", { xMin: -24.5, xMax: 23, zMin: 0, zMax: 27 }],
]);
for (const [id, baseline] of v10FrontPublicBounds) {
  assertRigidPlanShift(roomById(id).bounds, baseline, LOBBY_SHIFT_X, FRONT_SHIFT_Z, `V11 ${id}`);
}

const v8StationaryFrontPublicBounds = new Map([
  ["lobby-approach", { xMin: -0.5, xMax: 12.1, zMin: 24, zMax: 58 }],
  ["ticket-check", { xMin: 0.5, xMax: 11.1, zMin: 52.2, zMax: 58 }],
  ["ticket-poster-alcove", { xMin: -6.5, xMax: -0.5, zMin: 52.2, zMax: 58 }],
  ["ticket-empty-alcove", { xMin: 12.1, xMax: 18.1, zMin: 52.2, zMax: 58 }],
]);
for (const [id, baseline] of v8StationaryFrontPublicBounds) assertRigidZShift(roomById(id).bounds, baseline, id);

const v10LobbyServiceBounds = new Map([
  ["office-overflow", { xMin: -36.5, xMax: -24.5, zMin: 0.4, zMax: 3.8 }],
  ["office", { xMin: -36.5, xMax: -24.5, zMin: 3.8, zMax: 7 }],
  ["kitchen-storage", { xMin: -37, xMax: -29, zMin: 7, zMax: 24 }],
  ["concession-boh", { xMin: -29, xMax: -8.6, zMin: 4.9, zMax: 24 }],
  ["kitchen", { xMin: -29, xMax: -17.8, zMin: 17, zMax: 24 }],
  ["bar", { xMin: -16.1, xMax: -8.6, zMin: 20.4, zMax: 24 }],
  ["box-office", { xMin: 9.2, xMax: 15.5, zMin: 6.9, zMax: 14.4 }],
]);
for (const [id, baseline] of v10LobbyServiceBounds) {
  assertRigidPlanShift(roomById(id).bounds, baseline, LOBBY_SHIFT_X, FRONT_SHIFT_Z, `V11 ${id}`);
}
assertRigidZShift(
  roomById("electrical-room").bounds,
  { xMin: 12.1, xMax: 17.7, zMin: 34, zMax: 43 },
  "electrical-room",
);
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
  [[1, "east"], [2, "west"], [9, "east"], [10, "east"], [11, "east"], [12, "east"], [13, "east"], [14, "west"]],
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
    assert.ok(cubbyDepth >= 3.4 - 1e-6, `Theater ${auditorium.number} needs the deeper trash cubby.`);
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

const v8ExplicitCubbies = new Map([
  [1, { xMin: -25.5, xMax: -22.3, zMin: 54.4, zMax: 58 }],
  [2, { xMin: -28.7, xMax: -25.5, zMin: 54.4, zMax: 58 }],
  [13, { xMin: 28.5, xMax: 31.7, zMin: 54.6, zMax: 58 }],
  [14, { xMin: 25.3, xMax: 28.5, zMin: 54.6, zMax: 58 }],
]);
for (const [number, baseline] of v8ExplicitCubbies) {
  assertRigidZShift(auditoriumByNumber.get(number).entry.cubbyBounds, baseline, `Theater ${number} cubby`);
}
for (const number of [1, 2]) {
  assertNear(auditoriumByNumber.get(number).entry.innerDoorCenter, 55.6 + FRONT_SHIFT_Z, `Theater ${number} inner door shift`);
}
for (const number of [9, 10, 11, 12, 13, 14]) {
  assertNear(auditoriumByNumber.get(number).entry.innerDoorCenter, 55.75 + FRONT_SHIFT_Z, `Theater ${number} inner door shift`);
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
assert.deepEqual(t3.bounds, {
  xMin: -21.8,
  xMax: -4.3,
  zMin: 72,
  zMax: 99,
}, "V9 T3 must move the complete bowl to the direct public route.");
assert.deepEqual(t3.entry.routeBounds, {
  xMin: -6.7,
  xMax: -4.3,
  zMin: COURTYARD_PLAN.backWallZ,
  zMax: 99,
}, "V9 T3 route must continue straight from the public door through the auditorium.");
assert.equal(t3.entry.directAuditoriumEntry, true, "T3 must explicitly use the direct, straight auditorium entry.");
assert.deepEqual(t3.entry.usherNookBounds, {
  xMin: -9.9,
  xMax: -6.7,
  zMin: COURTYARD_PLAN.backWallZ,
  zMax: 72,
});
assert.deepEqual(t3Storage.bounds, {
  xMin: -21.5,
  xMax: -9.9,
  zMin: 72,
  zMax: 82.5,
});
assert.deepEqual(t3Storage.accessHall, {
  xMin: -21.5,
  xMax: -9.9,
  zMin: COURTYARD_PLAN.backWallZ,
  zMax: 72,
});
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
assert.deepEqual(
  t3Storage.doorCenters,
  [-18.6, -12.3],
  "V8 T3 under-tier doors must stay at the specified storage positions.",
);
assert.equal(t3Storage.accessHall.zMax, t3Storage.bounds.zMin, "T3 anteroom must terminate at the under-tier room.");
assert.ok(t3Storage.doorCenters.every((center) => center > t3Storage.bounds.xMin && center < t3Storage.bounds.xMax));
assert.equal("entranceStemBounds" in t3.entry, false, "T3 must not retain a connector stem to its old position.");
assert.equal("entranceLateralBounds" in t3.entry, false, "T3 must not retain a lateral connector to its old position.");
assert.equal("sideOpeningBounds" in t3.entry, false, "T3 must not retain a left-turn side opening.");
assert.equal("northCap" in t3.entry, false, "T3 direct route must not retain a north cap.");
assert.equal(t3.entry.routeBounds.xMax, t3.bounds.xMax, "T3 route must finish flush with the bowl's east wall.");
assert.ok(t3.entry.routeBounds.xMin > t3.bounds.xMin, "T3 route must be contained inside the auditorium footprint.");
assert.equal(t3.entry.routeBounds.zMin, COURTYARD_PLAN.backWallZ, "T3 route must start on the courtyard door plane.");
assert.equal(t3.entry.routeBounds.zMax, t3.bounds.zMax, "T3 route must remain straight through the bowl with no terminal left turn.");
const t3CourtDoor = COURTYARD_PLAN.doors.find(({ targetId }) => targetId === "theater-3");
assert.deepEqual(t3CourtDoor, { targetId: "theater-3", center: -5.5, width: 2.4 });
assert.equal(t3CourtDoor.center - t3CourtDoor.width / 2, t3.entry.routeBounds.xMin);
assert.equal(t3CourtDoor.center + t3CourtDoor.width / 2, t3.entry.routeBounds.xMax);
assert.deepEqual(t3.entry.ramp.bounds, {
  xMin: -6.7,
  xMax: -4.3,
  zMin: 82.5,
  zMax: 94.5,
});

const theater4 = AUDITORIUMS.find(({ number }) => number === 4);
const theater5 = AUDITORIUMS.find(({ number }) => number === 5);
assert.deepEqual(
  COURTYARD_PLAN.doors.map(({ targetId }) => targetId),
  ["theater-3", "future-task-room", "theater-4", "theater-5"],
  "The shared courtyard wall must read T3, task, T4, T5 from plan-left to plan-right.",
);
assert.ok(COURTYARD_PLAN.doors.every(({ center }) => center > COURTYARD_PLAN.bounds.xMin && center < COURTYARD_PLAN.bounds.xMax));
assert.equal(COURTYARD_PLAN.bounds.xMin, -6.82, "V10 courtyard must preserve the small reveal before the T3 door-left jamb.");
assert.equal(t3.entry.outerPlaneZ, COURTYARD_PLAN.backWallZ);
assert.equal(theater4.entry.outerPlaneZ, COURTYARD_PLAN.backWallZ);
assert.equal(theater5.entry.outerPlaneZ, COURTYARD_PLAN.backWallZ);
assert.equal(roomById("future-task-room").bounds.zMin, COURTYARD_PLAN.backWallZ);
assert.equal(SERVICE_ROOMS.some(({ id }) => id === "usher-stock"), false, "T4/T5 must not have invented lower stock.");
assert.ok(theater4.bounds.zMin >= 75 && theater5.bounds.zMin >= 75, "T4/T5 must be recessed behind the fountain court.");

const courtyardDoors = new Map(COURTYARD_PLAN.doors.map((door) => [door.targetId, door]));
const courtyardT3Door = courtyardDoors.get("theater-3");
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
  taskCourtDoor.center - taskCourtDoor.width / 2 - (courtyardT3Door.center + courtyardT3Door.width / 2),
  1.5,
  "T3-to-task clear wall gap",
);
assertNear(FOUNTAIN_PLAN.rearCounter.xMin - (taskCourtDoor.center + taskCourtDoor.width / 2), 0.1, "Task door-to-rear-counter gap");
assert.ok(COURTYARD_PLAN.waistPartition.x > courtyardT3Door.center + courtyardT3Door.width / 2);
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
assert.equal(theater5.entry.firstTurn, "east", "T5 must retain its east turn.");
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

const theater7 = auditoriumByNumber.get(7);
const theater8 = auditoriumByNumber.get(8);
const theater9 = auditoriumByNumber.get(9);
const theater10 = auditoriumByNumber.get(10);
const theater11 = auditoriumByNumber.get(11);
const theater12 = auditoriumByNumber.get(12);
const theater13 = auditoriumByNumber.get(13);
const theater14 = auditoriumByNumber.get(14);
const girls = roomById("girls-restroom");
const theater6 = auditoriumByNumber.get(6);
const candy = roomById("candy-storage");
const passStations = {
  t14: theater14.entry.center,
  t13: theater13.entry.center,
  t6: theater6.entry.center,
  girls: girls.entry.coordinate,
  t12: theater12.entry.center,
  t7: theater7.entry.center,
  t11: theater11.entry.center,
  t10: theater10.entry.center,
  t8: theater8.entry.center,
  t9: theater9.entry.center,
  candy: candy.doorCenter,
};
assert.deepEqual(passStations, {
  t14: 26.9, t13: 30.1, t6: 31.2, girls: 54.8, t12: 57.6,
  t7: 65.8, t11: 69.1, t10: 80.6, t8: 84.3, t9: 102.7, candy: 102.7,
}, "V10 must use the exact, explicitly reviewed hall entrance stations.");
assert.ok(Math.max(passStations.t14, passStations.t13, passStations.t6) - Math.min(passStations.t14, passStations.t13, passStations.t6) <= 4.5,
  "T14/T13/T6 must form the simultaneous opening cluster.");
assert.ok(
  Math.max(passStations.t14, passStations.t13, passStations.t6) < passStations.girls
    && passStations.girls < passStations.t12
    && passStations.t12 < passStations.t7
    && passStations.t7 < passStations.t11
    && passStations.t11 < passStations.t10
    && passStations.t10 < passStations.t8
    && passStations.t8 < passStations.t9,
  "Walking east must pass 14/13/6, GB, T12, T7, T11, T10, T8, then T9/candy.",
);
assert.equal(passStations.t9, passStations.candy, "T9 and candy must be simultaneous across the hall.");
assert.deepEqual(theater9.bounds, { xMin: 99.6, xMax: 110.1, zMin: 42, zMax: 55.5 }, "V10 must rigidly translate the complete T9 module.");
assert.deepEqual(
  {
    center: theater9.entry.center,
    turnSide: theater9.entry.turnSide,
    cubby: {
      xMin: theater9.entry.center - (theater9.entry.cubbyHalfWidth ?? 1.6),
      xMax: theater9.entry.center + (theater9.entry.cubbyHalfWidth ?? 1.6),
      zMin: theater9.bounds.zMax - theater9.entry.cubbyDepth,
      zMax: theater9.bounds.zMax,
    },
  },
  {
    center: 102.7,
    turnSide: "east",
    cubby: { xMin: 102.7 - 1.6, xMax: 102.7 + 1.6, zMin: 52.1, zMax: 55.5 },
  },
  "V10 T9 must retain its entrance topology under a rigid X translation.",
);
for (const [number, baseline, xShift] of [
  [7, {
    bounds: { xMin: 79.5, xMax: 97, zMin: 62.2, zMax: 89.2 },
    nook: { xMin: 82, xMax: 85, zMin: 62.2, zMax: 66.5 },
    ramp: { xMin: 79.5, xMax: 82, zMin: 66.5, zMax: 84.7 },
  }, -15],
  [8, {
    bounds: { xMin: 110, xMax: 127.5, zMin: 62.2, zMax: 89.2 },
    nook: { xMin: 112.5, xMax: 115.5, zMin: 62.2, zMax: 66.5 },
    ramp: { xMin: 110, xMax: 112.5, zMin: 66.5, zMax: 84.7 },
  }, -27],
]) {
  const auditorium = auditoriumByNumber.get(number);
  assertRigidPlanShift(auditorium.bounds, baseline.bounds, xShift, 0, `Theater ${number} bowl`);
  assertRigidPlanShift(auditorium.entry.usherNookBounds, baseline.nook, xShift, 0, `Theater ${number} usher nook`);
  assertRigidPlanShift(auditorium.entry.ramp.bounds, baseline.ramp, xShift, 0, `Theater ${number} ramp`);
}
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
assert.equal(LOBBY_SHIFT_X, 8.3, "V11 must use one authoritative +8.3m lobby translation.");
assert.deepEqual(LOBBY_PLAN.customerCounter[0], { x: -8.8 + LOBBY_SHIFT_X, z: 20.4 + FRONT_SHIFT_Z });
assert.deepEqual(LOBBY_PLAN.customerCounter.at(-1), { x: -20.1 + LOBBY_SHIFT_X, z: 4.9 + FRONT_SHIFT_Z });
assertNear(
  LOBBY_PLAN.customerCounter[0].x,
  TICKET_APPROACH_PLAN.bounds.xMin,
  "The bar end must align with the ticket-approach wall",
);
assert.notEqual(LOBBY_PLAN.customerCounter[2].x, LOBBY_PLAN.customerCounter[3].x, "The POS face must retain its diagonal bend.");
assert.equal(POS_STATIONS.length, 6, "The diagonal concession face needs six POS stations.");
assert.ok(POS_STATIONS.every((station) => station.counterSegment === "diagonal-pos-run"));
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "popper").length, 2, "The lobby sketch specifies two poppers.");
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "fryer").length, 2, "The hot line needs two fryer placeholders.");
assert.equal(LOBBY_PLAN.kiosks.length, 3, "V11 requires three customer ticket kiosks.");
assertUnique(LOBBY_PLAN.kiosks.map(({ id }) => id), "Lobby kiosk IDs");
assert.equal(LOBBY_PLAN.frontDoorCenters.length, 3, "The lobby front needs three double-door banks.");
assert.equal(LOBBY_PLAN.kitchenStorageDoor.wall, "diagonal", "Kitchen storage must connect through the diagonal wall.");
assert.equal(LOBBY_PLAN.kitchenStorageDoor.partitionSegment, 1);
assert.ok(LOBBY_PLAN.kitchenStorageDoor.width >= 1.5);
assert.deepEqual(LOBBY_PLAN.officePath, ["lobby", "office-overflow", "office"]);
assert.equal(roomById("office-overflow").extraDoors[0].side, "north", "Office overflow must connect to the main office through a second door.");
assertNear(roomById("office-overflow").extraDoors[0].center, -34.7 + LOBBY_SHIFT_X, "Office-overflow inner door X translation");
assertNear(roomById("office").doorCenter, -34.7 + LOBBY_SHIFT_X, "Office door X translation");
assert.equal(roomById("electrical-room").closed, true, "The extra approach door is a closed electrical room in v3.");
assert.ok(pointInRect(21.4 + LOBBY_SHIFT_X, 3.3 + FRONT_SHIFT_Z, LOBBY_PLAN.envelope));

assertRigidPlanShift(
  LOBBY_PLAN.envelope,
  { xMin: -37, xMax: 23, zMin: 0, zMax: 24 },
  LOBBY_SHIFT_X,
  FRONT_SHIFT_Z,
  "V11 lobby envelope",
);
for (const [label, actual, baseline] of [
  ["back bar", LOBBY_PLAN.backBar, { xMin: -16.1, xMax: -8.6, zMin: 23.05, zMax: 24 }],
  ["hot line", LOBBY_PLAN.hotLine, { xMin: -28.8, xMax: -17.8, zMin: 23.05, zMax: 24 }],
  ["future stairs", LOBBY_PLAN.futureStairs, { xMin: 15.9, xMax: 22, zMin: 8.2, zMax: 24 }],
  ["box-office vertical", LOBBY_PLAN.boxOfficeVertical, { xMin: 9.2, xMax: 10.3, zMin: 6.9, zMax: 14.4 }],
  ["box-office return", LOBBY_PLAN.boxOfficeReturn, { xMin: 9.2, xMax: 15.5, zMin: 6.9, zMax: 8 }],
]) assertRigidPlanShift(actual, baseline, LOBBY_SHIFT_X, FRONT_SHIFT_Z, `V11 lobby ${label}`);
assertNear(
  LOBBY_PLAN.envelope.xMax - LOBBY_PLAN.boxOfficeReturn.xMax,
  7.5,
  "Box-office/right-wall clearance must remain identical to V10",
);
assert.deepEqual(
  LOBBY_PLAN.customerCounter,
  [
    { x: -8.8, z: 20.4 },
    { x: -16.1, z: 20.4 },
    { x: -16.8, z: 17.8 },
    { x: -20.5, z: 8.2 },
    { x: -20.1, z: 4.9 },
  ].map(({ x, z }) => ({ x: x + LOBBY_SHIFT_X, z: z + FRONT_SHIFT_Z })),
  "Every concession-counter vertex must move by the common V11 lobby shift.",
);
assert.deepEqual(
  LOBBY_PLAN.kitchenPartition,
  [
    { x: -29, z: 23.5 }, { x: -29, z: 19.6 }, { x: -27.3, z: 17.3 },
    { x: -24.4, z: 17.1 }, { x: -24.6, z: 15.5 }, { x: -24.5, z: 11.1 },
    { x: -24.5, z: 9.6 }, { x: -24.5, z: 7 },
  ].map(({ x, z }) => ({ x: x + LOBBY_SHIFT_X, z: z + FRONT_SHIFT_Z })),
  "Every kitchen-partition vertex must move by the common V11 lobby shift.",
);
assert.deepEqual(LOBBY_PLAN.serviceDoor, { x: -24.5 + LOBBY_SHIFT_X, z: 10.35 + FRONT_SHIFT_Z });
assertNear(LOBBY_PLAN.kitchenStorageDoor.x, -28.15 + LOBBY_SHIFT_X, "Kitchen-storage door X translation");
assertNear(LOBBY_PLAN.kitchenStorageDoor.z, 18.45 + FRONT_SHIFT_Z, "Kitchen-storage door shift");
assert.deepEqual(
  LOBBY_PLAN.kiosks.map(({ id, position, rotation }) => ({ id, position, rotation })),
  [
    { id: "ticket-kiosk-1", position: [21.4 + LOBBY_SHIFT_X, 0, 3.3 + FRONT_SHIFT_Z], rotation: Math.PI / 2 },
    { id: "ticket-kiosk-2", position: [21.4 + LOBBY_SHIFT_X, 0, 5.3 + FRONT_SHIFT_Z], rotation: Math.PI / 2 },
    { id: "ticket-kiosk-3", position: [21.4 + LOBBY_SHIFT_X, 0, 7.3 + FRONT_SHIFT_Z], rotation: Math.PI / 2 },
  ],
  "All three lobby kiosks must move rigidly with the front module.",
);
assertNear(roomById("office-overflow").doorCenter, 2.7 + FRONT_SHIFT_Z, "Office-overflow east door shift");
assertNear(roomById("electrical-room").doorCenter, 39 + FRONT_SHIFT_Z, "Electrical-room west door shift");

const shiftedLobbyEquipment = new Map([
  ["concession-popper-1", [-23.5, 14.5]], ["concession-popper-2", [-23.2, 13]],
  ["kitchen-grill", [-27.5, 22.7]], ["kitchen-fryer-1", [-25.7, 22.7]], ["kitchen-fryer-2", [-24.3, 22.7]],
  ["kitchen-turbo-oven", [-22.5, 22.7]], ["bar-well", [-12.3, 22.7]],
]);
for (const [id, [oldX, oldZ]] of shiftedLobbyEquipment) {
  const anchor = EQUIPMENT_ANCHORS.find((candidate) => candidate.id === id);
  assertNear(anchor.position[0], oldX + LOBBY_SHIFT_X, `${id} rigid lobby X shift`);
  assertNear(anchor.position[2], oldZ + FRONT_SHIFT_Z, `${id} rigid lobby Z preservation`);
}
assert.deepEqual(
  POS_STATIONS.map(({ position }) => [position[0], position[2]]),
  [
    [-17.3, 16.8], [-17.9, 15], [-18.5, 13.3],
    [-19.2, 11.5], [-19.8, 9.7], [-20.3, 8],
  ].map(([x, z]) => [x + LOBBY_SHIFT_X, z + FRONT_SHIFT_Z]),
  "Every concession POS must move rigidly with its counter.",
);

assert.deepEqual(LOBBY_CEILING_PLAN, {
  baseHeight: 4.6,
  multiplier: 3,
  highHeight: 13.8,
  highPublicSpaceIds: ["lobby", "soda-service", "recessed-theater-court"],
  lowServiceRoomIds: ["office-overflow", "office", "kitchen-storage", "kitchen"],
}, "V11 needs one 13.8m non-carpet public ceiling plan and preserved 4.6m service roofs.");

const boxOfficePos = LOBBY_PLAN.boxOfficePos;
assert.deepEqual(boxOfficePos, {
  id: "box-office-pos",
  position: [9.75 + LOBBY_SHIFT_X, 0, 11.2 + FRONT_SHIFT_Z],
  rotation: 0,
  footprint: [0.72, 0.5],
  counterSegment: "box-office-vertical",
});
assert.ok(
  boxOfficePos.position[0] - boxOfficePos.footprint[0] / 2 >= LOBBY_PLAN.boxOfficeVertical.xMin
    && boxOfficePos.position[0] + boxOfficePos.footprint[0] / 2 <= LOBBY_PLAN.boxOfficeVertical.xMax
    && boxOfficePos.position[2] - boxOfficePos.footprint[1] / 2 >= LOBBY_PLAN.boxOfficeVertical.zMin
    && boxOfficePos.position[2] + boxOfficePos.footprint[1] / 2 <= LOBBY_PLAN.boxOfficeVertical.zMax,
  "The single box-office POS footprint must fit entirely on the long L run.",
);

const ticketPodium = LOBBY_PLAN.ticketPodium;
assert.deepEqual(ticketPodium, {
  id: "ticket-podium-center",
  position: [(TICKET_APPROACH_PLAN.bounds.xMin + TICKET_APPROACH_PLAN.bounds.xMax) / 2, 0, 56.4 + FRONT_SHIFT_Z],
  footprint: [0.85, 0.65],
  height: 1.25,
  material: "wood",
  style: "lectern",
});
assert.ok(ticketPodium.height > 1.1 && ticketPodium.height < 1.4, "The lectern must terminate above stomach height.");

const muralFacade = LOBBY_PLAN.muralFacade;
assert.deepEqual(muralFacade.start, LOBBY_PLAN.customerCounter[2], "Mural fascia must begin over the diagonal POS face.");
assert.deepEqual(muralFacade.end, LOBBY_PLAN.customerCounter[3], "Mural fascia must end over the diagonal POS face.");
assert.ok(muralFacade.projection >= 0.5, "The mural fascia must visibly project into the lobby.");
assert.equal(muralFacade.bottomY, LOBBY_CEILING_PLAN.baseHeight);
assert.ok(muralFacade.topY > muralFacade.bottomY && muralFacade.topY <= LOBBY_CEILING_PLAN.highHeight);
assert.ok(muralFacade.muralHeight < muralFacade.topY - muralFacade.bottomY, "The mural needs a visible fascia border.");

const boys = roomById("boys-restroom");
assert.deepEqual(boys.bounds, {
  xMin: -21.62,
  xMax: -6.82,
  zMin: 62.2,
  zMax: 68.2,
}, "V10 boys restroom must shift only a few inches while preserving its topology.");
assert.deepEqual(boys.footprintRects, [
  { xMin: -21.62, xMax: -6.82, zMin: 64.7, zMax: 68.2 },
  { xMin: -9.47, xMax: -6.82, zMin: 62.2, zMax: 64.7 },
]);
assert.deepEqual(boys.pathTurns, ["left", "left"], "Boys restroom must retain the two-turn privacy route.");
assert.equal(boys.footprintRects.length, 2, "Boys restroom must retain its entrance lobe.");
assert.equal(boys.entry.side, "west");
assert.equal(boys.entry.coordinate, boys.footprintRects[1].xMin);
assert.deepEqual(boys.entry, { side: "west", coordinate: -9.47, center: 63.45, width: 1.9 });
assert.equal(boys.privacyTurn, "west");
assert.deepEqual(boys.fixtures.stalls.map(({ count }) => count), [9], "Boys restroom requires one bank of nine stalls.");
assert.deepEqual(boys.fixtures.urinals.map(({ count }) => count), [6], "Boys restroom requires six urinals.");
assert.deepEqual(boys.fixtures.sinks.map(({ count, trough }) => [count, trough]), [[1, true]], "Boys restroom requires one long sink.");
assert.equal(fixtureCount(boys.fixtures.stalls), 9);
assert.equal(fixtureCount(boys.fixtures.urinals), 6);
assert.equal(fixtureCount(boys.fixtures.sinks), 1);
const boysMain = boys.footprintRects[0];
for (const [kind, banks] of Object.entries(boys.fixtures)) {
  for (const bank of banks) {
    assert.ok(bank.start >= boysMain.xMin && bank.end <= boysMain.xMax && bank.start < bank.end, `Boys ${kind} bank must fit inside the scaled main room.`);
  }
}
const boysStallDoorZ = boysMain.zMin + boys.fixtures.stalls[0].depth - 0.025;
const boysUrinalFrontZ = boysMain.zMax - 0.32 - 0.42 / 2;
assert.ok(boysUrinalFrontZ - boysStallDoorZ >= 1.55, "Boys restroom needs visibly more space between stalls and urinals.");
const boysFountainWall = publicById("boys-fountain-alcove");
const boysMenCubby = publicById("boys-men-entry-cubby");
assert.deepEqual(boysFountainWall.bounds, { xMin: -13.62, xMax: -11.72, zMin: 59.7, zMax: 62.2 });
assert.deepEqual(boysMenCubby.bounds, { xMin: -11.72, xMax: -9.47, zMin: 62.2, zMax: 64.7 });
assertNear(boundsWidth(boysMenCubby.bounds), 2.25, "V10 MEN cubby width (+50% from 1.5m)");
assert.deepEqual(
  { x: boysFountainWall.bounds.xMin, zMin: boysFountainWall.bounds.zMin, zMax: boysFountainWall.bounds.zMax },
  HALL_PLAN.drinkingFountainWall,
  "The physical water-fountain wall must be the exact narrow/wide hall transition.",
);
assert.equal(boysMenCubby.bounds.zMin, HALL_PLAN.wideNorthZ, "MEN cubby must begin beyond the wide hall's north edge.");
assert.equal(boysFountainWall.bounds.xMax, boysMenCubby.bounds.xMin, "The H2O nook must terminate at the recessed MEN cubby.");
assert.equal(boysMenCubby.bounds.xMax, boys.entry.coordinate, "The MEN cubby must terminate at the restroom privacy door.");
const trash = roomById("trash-room");
assert.deepEqual(trash.bounds, { xMin: -21.62, xMax: -13.62, zMin: 59.7, zMax: 62.2 });
assert.equal(trash.entrySide, "south");
assert.equal(trash.doorPlacement, "right");
assert.equal(trash.opensToward, "west");
assert.deepEqual(T3_MEN_PLAN.sharedBackWall, { xMin: -21.62, xMax: -6.82, z: 68.2 });
assert.equal(T3_MEN_PLAN.sharedBackWall.xMin, boysMain.xMin);
assert.equal(T3_MEN_PLAN.sharedBackWall.xMax, T3_MEN_PLAN.facadeWallEndX);
assert.equal(T3_MEN_PLAN.sharedBackWall.z, boysMain.zMax);
assert.equal(T3_MEN_PLAN.sharedBackWall.z, t3Storage.accessHall.zMin);
assert.deepEqual(T3_MEN_PLAN.doorReveal, { xMin: -6.82, xMax: -6.7, width: 0.12 });
assertNear(T3_MEN_PLAN.t3DoorLeftX - T3_MEN_PLAN.facadeWallEndX, 0.12, "T3 facade reveal");
assertNear(T3_MEN_PLAN.t3DoorLeftX - boysMain.xMax, 0.12, "Actual BB wall-to-T3 jamb reveal");
assert.equal(T3_MEN_PLAN.doorReveal.xMin, T3_MEN_PLAN.facadeWallEndX);
assert.equal(T3_MEN_PLAN.doorReveal.xMax, T3_MEN_PLAN.t3DoorLeftX);
assert.equal(T3_MEN_PLAN.t3DoorLeftX, t3CourtDoor.center - t3CourtDoor.width / 2);
assert.equal(T3_MEN_PLAN.t3DoorRightX, t3CourtDoor.center + t3CourtDoor.width / 2);
assert.deepEqual(
  EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").map(({ id, roomId, position, rotation }) => ({ id, roomId, position, rotation })),
  [
    { id: "boys-water-fountain-1", roomId: "boys-fountain-alcove", position: [-13.36, 0, 60.53], rotation: -Math.PI / 2 },
    { id: "boys-water-fountain-2", roomId: "boys-fountain-alcove", position: [-13.36, 0, 61.33], rotation: -Math.PI / 2 },
  ],
  "Both drinking fountains must move with the V9 H2O wall.",
);

assert.equal(girls.footprintRects.length, 4, "Girls restroom must retain its concave entrance, connector, and southwest lobe.");
assert.equal(girls.entry.side, "west");
assert.equal(girls.entry.coordinate, girls.footprintRects[3].xMin);
assert.deepEqual(girls.bounds, { xMin: 48, xMax: 63.8, zMin: 62.2, zMax: 74 });
assert.deepEqual(girls.entry, { side: "west", coordinate: 54.8, center: 63.85, width: 2.05 });
assert.deepEqual(girls.fixtures.stalls.map(({ side, count }) => [side, count]), [
  ["north", 6], ["south", 6], ["south-lobe", 2],
]);
const [girlsNorthStalls, girlsSouthStalls] = girls.fixtures.stalls;
assert.deepEqual(
  [girlsNorthStalls.start, girlsNorthStalls.end, girlsSouthStalls.start, girlsSouthStalls.end],
  [54.5, 63.5, 54.5, 63.5],
  "The two six-stall banks must share the same translated span.",
);
for (let edge = 0; edge <= 6; edge += 1) {
  const northPartitionX = girlsNorthStalls.start
    + ((girlsNorthStalls.end - girlsNorthStalls.start) * edge) / girlsNorthStalls.count;
  const southPartitionX = girlsSouthStalls.start
    + ((girlsSouthStalls.end - girlsSouthStalls.start) * edge) / girlsSouthStalls.count;
  assertNear(northPartitionX, southPartitionX, `Girls stall partition ${edge} alignment`);
}
assert.deepEqual(girls.fixtures.sinks.map(({ side, count }) => [side, count]), [["north", 3]]);
assert.equal(fixtureCount(girls.fixtures.stalls), 14, "Girls restroom requires exactly fourteen stalls.");
assert.equal(fixtureCount(girls.fixtures.sinks), 3, "Girls restroom requires exactly three sinks.");
assert.equal(fixtureCount(girls.fixtures.urinals), 0);

assertNear(boundsWidth(candy.bounds), 10, "Candy-storage width");
assertNear(boundsDepth(candy.bounds), 5, "Candy-storage shallow depth");
assert.ok(boundsWidth(candy.bounds) >= boundsDepth(candy.bounds) * 2, "Candy storage must be wide and shallow, not square.");
assert.equal(candy.entrySide, "south");
assert.equal(Number.isFinite(candy.doorCenter), true, "Candy storage needs one hall door.");
assertRigidPlanShift(candy.bounds, { xMin: 128.5, xMax: 138.5, zMin: 62.2, zMax: 67.2 }, -27.5, 0, "Candy storage");
assert.equal(candy.doorCenter, 102.7);
assert.equal("extraDoors" in candy, false, "Candy storage must not regain the random exit door.");
assert.ok(candy.doorCenter - candy.bounds.xMin <= 2, "Candy door must remain at the left end of the room.");

assert.equal(HALL_END_EXITS.length, 2, "Both ends of the main hall need closed exterior doors.");

const hall = publicById("main-corridor");
const approach = publicById("lobby-approach");
assert.deepEqual(hall.bounds, {
  xMin: HALL_PLAN.narrow.xMin,
  xMax: HALL_PLAN.wide.xMax,
  zMin: HALL_PLAN.southZ,
  zMax: HALL_PLAN.wideNorthZ,
}, "Main-corridor bounds must enclose the complete stepped hall.");
assert.deepEqual(hall.footprintRects, [HALL_PLAN.narrow, HALL_PLAN.wide], "Main corridor must use exactly the two authoritative hall legs.");
assertNear(hall.bounds.xMax - hall.bounds.xMin, 153, "V10 hall full X length (15% shorter)");
const hallExits = new Map(HALL_END_EXITS.map((exit) => [exit.id, exit]));
assert.deepEqual(hallExits.get("hall-west-exit"), {
  id: "hall-west-exit",
  side: "west",
  segment: "narrow",
  x: HALL_PLAN.narrow.xMin,
  z: (HALL_PLAN.narrow.zMin + HALL_PLAN.narrow.zMax) / 2,
});
assert.deepEqual(hallExits.get("hall-east-exit"), {
  id: "hall-east-exit",
  side: "east",
  segment: "wide",
  x: HALL_PLAN.wide.xMax,
  z: (HALL_PLAN.wide.zMin + HALL_PLAN.wide.zMax) / 2,
});
assert.ok(approach.bounds.zMax - approach.bounds.zMin >= 30, "The lobby-to-ticket approach must remain long.");
assert.deepEqual(approach.bounds, TICKET_APPROACH_PLAN.bounds);
assert.equal(approach.bounds.zMax, HALL_PLAN.southZ, "Translated lobby approach must meet the new hall south edge.");
assertNear(boundsWidth(approach.bounds), boundsWidth(FOUNTAIN_PLAN.island), "Approach must be the fountain-counter width");
assertNear(boundsWidth(approach.bounds), 12.6, "Narrow approach width");
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

assert.deepEqual(FOUNTAIN_PLAN.pillars, [
  {
    id: "fountain-island-west-pillar",
    position: [-2.03, 0, 63.6],
    footprint: [0.7, 0.7],
    height: LOBBY_CEILING_PLAN.highHeight,
    finish: "white",
  },
  {
    id: "fountain-island-east-pillar",
    position: [13.63, 0, 63.6],
    footprint: [0.7, 0.7],
    height: LOBBY_CEILING_PLAN.highHeight,
    finish: "white",
  },
], "V11 needs one white high-ceiling pillar immediately beyond each island end.");
assertUnique(FOUNTAIN_PLAN.pillars.map(({ id }) => id), "Fountain pillar IDs");
const [westPillar, eastPillar] = FOUNTAIN_PLAN.pillars;
const westPillarEast = westPillar.position[0] + westPillar.footprint[0] / 2;
const eastPillarWest = eastPillar.position[0] - eastPillar.footprint[0] / 2;
assert.ok(westPillarEast < FOUNTAIN_PLAN.island.xMin, "West pillar cannot overlap the fountain island.");
assert.ok(eastPillarWest > FOUNTAIN_PLAN.island.xMax, "East pillar cannot overlap the fountain island.");
assertNear(FOUNTAIN_PLAN.island.xMin - westPillarEast, 1.18, "West pillar/island reveal");
assertNear(eastPillarWest - FOUNTAIN_PLAN.island.xMax, 1.18, "East pillar/island reveal");
const partitionEastFace = COURTYARD_PLAN.waistPartition.x + COURTYARD_PLAN.waistPartition.thickness / 2;
const westPillarWestFace = westPillar.position[0] - westPillar.footprint[0] / 2;
const squeezeClearance = westPillarWestFace - partitionEastFace;
assertNear(squeezeClearance, 1.11, "T3 divider-to-pillar squeeze clearance");
assert.ok(squeezeClearance > 2 * 0.34 + 0.1, "The 0.34m-radius player must fit between the divider and west pillar.");

assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "soda-fountain").length, 2);
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "icee-fountain").length, 2);
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").length, 2);
assert.ok(EQUIPMENT_ANCHORS.filter(({ roomId }) => roomId === "soda-service").every(({ rotation }) => rotation === 0));

const futureUpstairs = roomById("future-upstairs-stair");
const t6ModuleTranslationX = -13.3;
assert.equal(futureUpstairs.closed, true);
assert.deepEqual(
  {
    stairBounds: futureUpstairs.bounds,
    stairEntrySide: futureUpstairs.entrySide,
    stairDoor: futureUpstairs.doorCenter,
    auditorium: theater6.bounds,
    theater6Door: theater6.entry.center,
    vestibule: theater6.entry.vestibuleBounds,
    transverse: theater6.entry.transverseBounds,
    longRoute: theater6.entry.longRouteBounds,
    storage: t6Storage.bounds,
    storageDoors: t6Storage.doorCenters,
  },
  {
    stairBounds: { xMin: 25, xMax: 29.7, zMin: 62.2, zMax: 68.5 },
    stairEntrySide: "east",
    stairDoor: 63.25,
    auditorium: { xMin: 29.7, xMax: 47.2, zMin: 62.2, zMax: 89.2 },
    theater6Door: 31.2,
    vestibule: { xMin: 29.7, xMax: 32.55, zMin: 62.2, zMax: 65.5 },
    transverse: { xMin: 29.7, xMax: 47.2, zMin: 65.5, zMax: 68.5 },
    longRoute: { xMin: 44.7, xMax: 47.2, zMin: 68.5, zMax: 85.5 },
    storage: { xMin: 31.7, xMax: 44.7, zMin: 68.5, zMax: 71.8 },
    storageDoors: [35.2, 41.7],
  },
  "The whole T6 module must share one -13.3m translation to its V8 door.",
);
assert.ok(theater6.entry.vestibuleBounds.zMax - theater6.entry.vestibuleBounds.zMin >= 3, "T6 needs a few feet of straight vestibule before its right turn.");
assert.equal(futureUpstairs.bounds.xMax, theater6.entry.vestibuleBounds.xMin, "Upstairs room east wall must be the T6 vestibule west wall.");
assert.ok(futureUpstairs.doorCenter - futureUpstairs.doorWidth / 2 > theater6.entry.vestibuleBounds.zMin
  && futureUpstairs.doorCenter + futureUpstairs.doorWidth / 2 < theater6.entry.vestibuleBounds.zMax,
"Upstairs door must sit inside the short T6 vestibule's left wall.");
assert.equal(theater6.entry.vestibuleBounds.zMax, theater6.entry.transverseBounds.zMin);
assert.equal(theater6.entry.transverseBounds.zMax, theater6.entry.longRouteBounds.zMin);
assert.equal(theater6.entry.transverseBounds.xMin, theater6.bounds.xMin);
assert.equal(theater6.entry.transverseBounds.xMax, theater6.bounds.xMax, "T6 must not retain a transverse connector to its old position.");
assert.equal(boundsWidth(theater6.entry.longRouteBounds), theater6.entry.routeWidth);
assert.equal(theater6.entry.longRouteBounds.xMax, theater6.bounds.xMax, "T6 long route must remain on its east side.");
assert.equal(t6Storage.ceilingHeight, 2.32, "T6 under-tier route needs the authoritative low roof height.");
assert.equal(t6Storage.bounds.zMin, theater6.entry.transverseBounds.zMax);
assert.equal(t6Storage.bounds.xMax, theater6.entry.longRouteBounds.xMin);

for (const sample of [-40, -20, 1.5, 42, 113]) assert.equal(worldToPlanX(planToWorldX(sample)), sample);
assert.deepEqual(MAP_BOUNDS, { xMin: -41, xMax: 114, zMin: -12.5, zMax: 99 }, "Map bounds must tightly enclose the compressed V10 hall.");
assert.deepEqual(PLAYER_SPAWN_PLAN, { x: 1.5 + LOBBY_SHIFT_X, y: 0, z: -9.3 }, "Player spawn must move rigidly with the V11 front entrance module.");
assertNear(planToWorldX(PLAYER_SPAWN_PLAN.x), -6.8, "Translated player-spawn world X");
assert.ok(planToWorldX(-20 + LOBBY_SHIFT_X) > planToWorldX(PLAYER_SPAWN_PLAN.x), "Sketch-left concession must remain physical player-left.");
assert.equal(worldToPlanDirection({ x: -1, z: 0 }).x, 1);
assert.equal(planToWorldDirection({ x: 1, z: 0 }).x, -1);
const worldBounds = planToWorldBounds(MAP_BOUNDS);
assert.ok(worldBounds.xMin < worldBounds.xMax);
assert.equal(worldBounds.xMax - worldBounds.xMin, MAP_BOUNDS.xMax - MAP_BOUNDS.xMin);

console.log(
  `Layout valid: v11 · rigid +8.3m lobby shift · 13.8m public ceiling · three kiosks · central lectern · fountain pillars · 153m hall · 14 theaters · 1,093 seats.`,
);

function publicById(id) {
  return PUBLIC_SPACES.find((space) => space.id === id);
}
