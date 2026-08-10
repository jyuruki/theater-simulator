import assert from "node:assert/strict";

import {
  ALL_ZONES,
  AUDITORIUMS,
  AUDITORIUM_PRESETS,
  EQUIPMENT_ANCHORS,
  EXPECTED_SEAT_TOTAL,
  MAP_BOUNDS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  pointInBounds,
  validateLayoutData,
} from "../src/layout-data.js";

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
assertUnique(EQUIPMENT_ANCHORS.map(({ id }) => id), "Equipment anchor IDs");
assertUnique(
  EQUIPMENT_ANCHORS.map(({ roomId, position }) => `${roomId}:${position.join(",")}`),
  "Equipment anchor positions",
);

assertValidBounds({ bounds: MAP_BOUNDS }, "MAP_BOUNDS");
for (const room of baseRooms) assertValidBounds(room, room.id);

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

console.log(
  `Layout valid: 14 theaters · 1,093 seats · 4 presets · ${EQUIPMENT_ANCHORS.length} equipment anchors.`,
);
