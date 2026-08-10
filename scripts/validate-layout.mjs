import assert from "node:assert/strict";

import {
  ALL_ZONES,
  AUDITORIUM_ENTRY_ZONES,
  AUDITORIUMS,
  AUDITORIUM_PRESETS,
  EQUIPMENT_ANCHORS,
  EXPECTED_SEAT_TOTAL,
  MAP_BOUNDS,
  PLAYER_SPAWN_PLAN,
  POS_STATIONS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  pointInBounds,
  validateLayoutData,
} from "../src/layout-data.js";
import {
  planToWorldBounds,
  planToWorldDirection,
  planToWorldX,
  worldToPlanDirection,
  worldToPlanX,
} from "../src/coordinates.js";

const EXPECTED_CAPACITIES = Object.freeze({
  1: 38,
  2: 38,
  3: 148,
  4: 58,
  5: 58,
  6: 148,
  7: 153,
  8: 152,
  9: 50,
  10: 50,
  11: 50,
  12: 50,
  13: 50,
  14: 50,
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
  for (const key of ["xMin", "xMax", "zMin", "zMax"]) {
    assert.ok(Number.isFinite(bounds[key]), `${label}.${key} must be finite.`);
  }
  assert.ok(bounds.xMin < bounds.xMax, `${label} must have positive width.`);
  assert.ok(bounds.zMin < bounds.zMax, `${label} must have positive depth.`);
  assert.ok(bounds.xMin >= MAP_BOUNDS.xMin, `${label} extends west of MAP_BOUNDS.`);
  assert.ok(bounds.xMax <= MAP_BOUNDS.xMax, `${label} extends east of MAP_BOUNDS.`);
  assert.ok(bounds.zMin >= MAP_BOUNDS.zMin, `${label} extends south of MAP_BOUNDS.`);
  assert.ok(bounds.zMax <= MAP_BOUNDS.zMax, `${label} extends north of MAP_BOUNDS.`);
}

function boundsOverlap(a, b) {
  return a.xMin < b.xMax && a.xMax > b.xMin && a.zMin < b.zMax && a.zMax > b.zMin;
}

const validation = validateLayoutData();
assert.equal(
  validation.valid,
  true,
  `validateLayoutData failed:\n- ${validation.errors.join("\n- ")}`,
);

assert.equal(AUDITORIUMS.length, 14, "Exactly 14 auditoriums are required.");
assert.deepEqual(
  AUDITORIUMS.map(({ number }) => number).sort((a, b) => a - b),
  Array.from({ length: 14 }, (_, index) => index + 1),
  "Auditorium numbers must be exactly 1–14.",
);

for (const auditorium of AUDITORIUMS) {
  assert.equal(
    auditorium.seats,
    EXPECTED_CAPACITIES[auditorium.number],
    `Theater ${auditorium.number} has the wrong capacity.`,
  );

  const preset = AUDITORIUM_PRESETS[auditorium.preset];
  assert.ok(preset, `Theater ${auditorium.number} has an unknown preset.`);
  assert.equal(
    auditorium.bounds.xMax - auditorium.bounds.xMin,
    preset.width,
    `Theater ${auditorium.number} width differs from ${auditorium.preset}.`,
  );
  assert.equal(
    auditorium.bounds.zMax - auditorium.bounds.zMin,
    preset.depth,
    `Theater ${auditorium.number} depth differs from ${auditorium.preset}.`,
  );
  assert.ok(auditorium.entry?.type, `Theater ${auditorium.number} needs an entry route type.`);
  assert.ok(Number.isFinite(auditorium.entry.center), `Theater ${auditorium.number} needs a finite entry center.`);
}

for (const [preset, expectedNumbers] of Object.entries(EXPECTED_PRESET_GROUPS)) {
  const actualNumbers = AUDITORIUMS
    .filter((auditorium) => auditorium.preset === preset)
    .map((auditorium) => auditorium.number)
    .sort((a, b) => a - b);
  assert.deepEqual(actualNumbers, expectedNumbers, `${preset} theater grouping is incorrect.`);
}

const seatTotal = AUDITORIUMS.reduce((total, auditorium) => total + auditorium.seats, 0);
assert.equal(EXPECTED_SEAT_TOTAL, 1093, "The declared expected seat total must remain 1,093.");
assert.equal(seatTotal, 1093, "Auditorium capacities must total 1,093 seats.");
assert.equal(validation.seatTotal, 1093, "Validator seat total must be 1,093.");

const baseRooms = [...PUBLIC_SPACES, ...SERVICE_ROOMS, ...AUDITORIUMS];
assertUnique(baseRooms.map(({ id }) => id), "Base room IDs");
assertUnique(ALL_ZONES.map(({ id }) => id), "ALL_ZONES IDs");
assertUnique([...ALL_ZONES, ...AUDITORIUM_ENTRY_ZONES].map(({ id }) => id), "Navigable zone IDs");
assertUnique(EQUIPMENT_ANCHORS.map(({ id }) => id), "Equipment anchor IDs");
assertUnique(POS_STATIONS.map(({ id }) => id), "POS station IDs");
assertUnique(
  EQUIPMENT_ANCHORS.map(({ roomId, position }) => `${roomId}:${position.join(",")}`),
  "Equipment anchor positions",
);

assertValidBounds({ bounds: MAP_BOUNDS }, "MAP_BOUNDS");
for (const room of baseRooms) assertValidBounds(room, room.id);
for (const zone of AUDITORIUM_ENTRY_ZONES) assertValidBounds(zone, zone.id);

const roomsById = new Map(
  [...PUBLIC_SPACES, ...SERVICE_ROOMS].map((room) => [room.id, room]),
);

for (const anchor of EQUIPMENT_ANCHORS) {
  const room = roomsById.get(anchor.roomId);
  assert.ok(room, `${anchor.id} references missing room ${anchor.roomId}.`);
  assert.equal(anchor.position.length, 3, `${anchor.id} must have an XYZ position.`);
  assert.ok(anchor.position.every(Number.isFinite), `${anchor.id} position must be finite.`);
  assert.equal(anchor.footprint.length, 2, `${anchor.id} must have a 2D footprint.`);
  assert.ok(anchor.footprint.every((size) => Number.isFinite(size) && size > 0), `${anchor.id} footprint is invalid.`);
  assert.ok(
    pointInBounds(anchor.position[0], anchor.position[2], room.bounds),
    `${anchor.id} center lies outside ${anchor.roomId}.`,
  );

  const cosine = Math.abs(Math.cos(anchor.rotation));
  const sine = Math.abs(Math.sin(anchor.rotation));
  const halfWidth = (anchor.footprint[0] * cosine + anchor.footprint[1] * sine) / 2;
  const halfDepth = (anchor.footprint[0] * sine + anchor.footprint[1] * cosine) / 2;
  const [x, , z] = anchor.position;
  assert.ok(
    x - halfWidth >= room.bounds.xMin && x + halfWidth <= room.bounds.xMax
      && z - halfDepth >= room.bounds.zMin && z + halfDepth <= room.bounds.zMax,
    `${anchor.id} footprint extends outside ${anchor.roomId}.`,
  );
}

assert.deepEqual(
  AUDITORIUMS.filter(({ entry }) => entry.type === "trash-cubby").map(({ number }) => number).sort((a, b) => a - b),
  [1, 2, 9, 10, 11, 12, 13, 14],
  "The small auditoriums must all use trash-can doorway cubbies.",
);
assert.equal(AUDITORIUMS.find(({ number }) => number === 3).entry.type, "storage-left-then-left");
assert.equal(AUDITORIUMS.find(({ number }) => number === 6).entry.type, "right-then-left");
assert.equal(AUDITORIUMS.find(({ number }) => number === 7).entry.type, "straight-side");
assert.equal(AUDITORIUMS.find(({ number }) => number === 8).entry.type, "straight-side");
assert.equal(AUDITORIUMS.find(({ number }) => number === 4).entry.type, "dogleg");
assert.equal(AUDITORIUMS.find(({ number }) => number === 5).entry.type, "dogleg");
assert.deepEqual(
  AUDITORIUMS
    .filter(({ entry }) => entry.type === "trash-cubby")
    .map(({ number, entry }) => [number, entry.turnSide]),
  [[1, "west"], [2, "west"], [9, "west"], [10, "east"], [11, "east"], [12, "east"], [13, "east"], [14, "east"]],
  "Each small-theater cubby must keep the door side transcribed from the red sketch mark.",
);
assert.deepEqual(
  AUDITORIUM_ENTRY_ZONES.map(({ id }) => id).sort(),
  ["theater-3-entry", "theater-4-entry", "theater-5-entry"],
  "The three vestibules that extend beyond their auditorium shells need explicit location zones.",
);

const lobby = PUBLIC_SPACES.find(({ id }) => id === "lobby");
const approach = PUBLIC_SPACES.find(({ id }) => id === "lobby-approach");
const hall = PUBLIC_SPACES.find(({ id }) => id === "main-corridor");
const sodaService = PUBLIC_SPACES.find(({ id }) => id === "soda-service");
assert.ok(lobby.bounds.zMax - lobby.bounds.zMin >= 24, "The V2 lobby must be substantially deeper than V1.");
assert.ok(approach.bounds.zMax - approach.bounds.zMin >= 30, "The lobby-to-ticket hall must remain long.");
assert.ok(hall.bounds.xMax - hall.bounds.xMin >= 200, "The main theater hall must remain long.");
assert.ok(hall.bounds.zMax - hall.bounds.zMin <= 4.3, "The main theater hall must remain narrow.");
assert.ok(sodaService.bounds.zMin >= hall.bounds.zMax, "The soda court must sit beyond ticket check and the main hall.");
assert.ok(AUDITORIUMS.find(({ number }) => number === 4).bounds.zMin >= 72, "Theater 4 must be inset beyond the soda court.");
assert.ok(AUDITORIUMS.find(({ number }) => number === 5).bounds.zMin >= 72, "Theater 5 must be inset beyond the soda court.");
assert.ok(SERVICE_ROOMS.some(({ id }) => id === "trash-room"), "The labeled trash room must exist.");
assert.ok(SERVICE_ROOMS.some(({ id }) => id === "approach-room"), "The secondary lobby-hall room must exist.");

const roomById = (id) => SERVICE_ROOMS.find((room) => room.id === id);
assert.equal(
  boundsOverlap(roomById("under-storage-3").bounds, roomById("trash-room").bounds),
  false,
  "Theater 3 lower storage must not overlap the trash room.",
);
assert.equal(
  boundsOverlap(roomById("under-storage-3").bounds, roomById("boys-restroom").bounds),
  false,
  "Theater 3 lower storage must not overlap the men's restroom.",
);

assert.equal(POS_STATIONS.length, 6, "The long concession desk needs six POS stations.");
for (const station of POS_STATIONS) {
  assert.ok(pointInBounds(station.position[0], station.position[2], lobby.bounds), `${station.id} must face the public lobby.`);
}
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "soda-fountain").length, 2, "The drink island needs two soda fountains.");
assert.equal(EQUIPMENT_ANCHORS.filter(({ type }) => type === "icee-fountain").length, 2, "The drink island needs two ICEE bookends.");
for (const anchor of EQUIPMENT_ANCHORS.filter(({ roomId }) => roomId === "soda-service")) {
  assert.equal(anchor.rotation, 0, `${anchor.id} must face guests approaching from the ticket hall.`);
}

for (const sample of [-40, -20, 1.5, 42, 164]) {
  assert.equal(worldToPlanX(planToWorldX(sample)), sample, "Plan/world X transforms must be involutions.");
}
assert.equal(planToWorldX(PLAYER_SPAWN_PLAN.x), PLAYER_SPAWN_PLAN.x, "The entrance axis must remain fixed by the reflection.");
assert.ok(planToWorldX(-19.35) > PLAYER_SPAWN_PLAN.x, "Plan-left concession must become physical player-left at the entrance.");
assert.equal(worldToPlanDirection({ x: -1, z: 0 }).x, 1, "A physical right turn must point right in plan/minimap space.");
assert.equal(planToWorldDirection({ x: 1, z: 0 }).x, -1, "Plan direction reflection must match position reflection.");
const worldBounds = planToWorldBounds(MAP_BOUNDS);
assert.ok(worldBounds.xMin < worldBounds.xMax, "Reflected world bounds must remain ordered.");
assert.equal(worldBounds.xMax - worldBounds.xMin, MAP_BOUNDS.xMax - MAP_BOUNDS.xMin, "Reflection must preserve map width.");

console.log(
  `Layout valid: 14 theaters · 1,093 seats · 4 presets · ${EQUIPMENT_ANCHORS.length} equipment anchors · ${POS_STATIONS.length} POS stations.`,
);
