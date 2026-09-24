import assert from "node:assert/strict";
import {
  AUDITORIUMS, AUDITORIUM_SHIFT_X, HALL_COMPACTION, HALL_PLAN,
  HALL_END_EXITS, MAP_BOUNDS, PUBLIC_SPACES, SERVICE_ROOMS, TICKET_APPROACH_PLAN,
} from "../src/layout-data.js";

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${label}: expected ${expected}, got ${actual}`);
const rect = (xMin, xMax, zMin, zMax) => ({ xMin, xMax, zMin, zMax });
const moved = (actual, original, shift, label) => {
  for (const key of ["xMin", "xMax", "zMin", "zMax"])
    near(actual[key], original[key] + (key.startsWith("x") ? shift : 0), `${label}.${key}`);
  near(actual.xMax - actual.xMin, original.xMax - original.xMin, `${label} retains width`);
  near(actual.zMax - actual.zMin, original.zMax - original.zMin, `${label} retains depth`);
};
const auditoriums = new Map(AUDITORIUMS.map((room) => [room.number, room]));
const services = new Map(SERVICE_ROOMS.map((room) => [room.id, room]));

// Approved pre-update footprints/stations are embedded, so this regression does
// not depend on Git or calculate its own expected answer from production data.
const originalRooms = [
  [1, -24.5, -15, 42.5, 55.5, -22.9, "south", 7.914],
  [2, -34, -24.5, 42.5, 55.5, -26.1, "south", 7.914],
  [3, -21.8, -4.3, 72, 99, -5.5, "north", 0],
  [4, -1.5, 10, 75, 90.5, 13.7, "north", 0],
  [5, 10, 21.5, 75, 90.5, 16.8, "north", 0],
  [6, 29.7, 47.2, 62.2, 89.2, 31.2, "north", -6.5],
  [7, 64.5, 82, 62.2, 89.2, 65.8, "north", -7.4],
  [8, 83, 100.5, 62.2, 89.2, 84.3, "north", -8.1],
  [9, 99.6, 110.1, 42, 55.5, 102.7, "south", -8.3],
  [10, 78.5, 89, 42, 55.5, 80.6, "south", -7.4],
  [11, 67, 77.5, 42, 55.5, 69.1, "south", -7.4],
  [12, 55.5, 66, 42, 55.5, 57.6, "south", -7],
  [13, 28.5, 39, 42, 55.5, 30.1, "south", -2.5],
  [14, 18, 28.5, 42, 55.5, 26.9, "south", -2.5],
];
for (const [number, xMin, xMax, zMin, zMax, door, screen, shift] of originalRooms) {
  const room = auditoriums.get(number);
  moved(room.bounds, rect(xMin, xMax, zMin, zMax), shift, `T${number}`);
  near(room.entry.center, door + shift, `T${number} door moves with its room`);
  near(AUDITORIUM_SHIFT_X[number] ?? 0, shift, `T${number} approved rigid shift`);
  assert.equal(room.screenSide, screen, `T${number} keeps its orientation`);
}

for (const [number, bounds] of [
  [1, rect(-24.5, -21.3, 52.77, 55.5)], [2, rect(-27.7, -24.5, 52.77, 55.5)],
  [13, rect(28.5, 31.7, 52.99, 55.5)], [14, rect(25.3, 28.5, 52.99, 55.5)],
]) moved(auditoriums.get(number).entry.cubbyBounds, bounds, AUDITORIUM_SHIFT_X[number], `T${number} trash cubby`);
for (const [number, turn] of [[1, "east"], [2, "west"], [9, "east"], [10, "east"], [11, "east"], [12, "east"], [13, "east"], [14, "west"]])
  assert.equal(auditoriums.get(number).entry.turnSide, turn, `T${number} retains entrance handedness`);

const t6 = auditoriums.get(6);
for (const [key, baseline] of Object.entries({
  vestibuleBounds: rect(29.7, 32.55, 62.2, 65.5),
  transverseBounds: rect(29.7, 47.2, 65.5, 68.5),
  longRouteBounds: rect(44.7, 47.2, 68.5, 85.5),
})) moved(t6.entry[key], baseline, -6.5, `T6 ${key}`);
assert.equal(t6.entry.type, "right-then-left");
assert.equal(t6.entry.routeSide, "east");
for (const [number, nook, ramp, shift] of [
  [7, rect(67, 70, 62.2, 66.5), rect(64.5, 67, 66.5, 84.7), -7.4],
  [8, rect(85.5, 88.5, 62.2, 66.5), rect(83, 85.5, 66.5, 84.7), -8.1],
]) {
  moved(auditoriums.get(number).entry.usherNookBounds, nook, shift, `T${number} usher nook`);
  moved(auditoriums.get(number).entry.ramp.bounds, ramp, shift, `T${number} entry corridor`);
  assert.equal(auditoriums.get(number).entry.routeSide, "west");
}

for (const [id, bounds, shift] of [
  ["future-upstairs-stair", rect(25, 29.7, 62.2, 68.5), -6.5],
  ["under-storage-6", rect(31.7, 44.7, 68.5, 71.8), -6.5],
  ["girls-restroom", rect(48, 63.8, 62.2, 74), -7],
  ["candy-storage", rect(101, 111, 62.2, 67.2), -8.3],
  ["trash-room", rect(-21.62, -13.62, 59.7, 62.2), 0],
]) moved(services.get(id).bounds, bounds, shift, id);
const stairs = services.get("future-upstairs-stair"), storage = services.get("under-storage-6");
assert.equal(stairs.bounds.xMax, t6.bounds.xMin, "Closed stair and T6 retain their shared wall");
assert.equal(stairs.doorCenter, 63.25);
assert.equal(stairs.entrySide, "east");
assert.equal(stairs.closed, true);
assert.equal(storage.bounds.xMax, t6.entry.longRouteBounds.xMin);
assert.equal(storage.ceilingHeight, 2.32);
storage.doorCenters.forEach((x, i) => near(x, [28.7, 35.2][i], `Under-storage-6 door ${i}`));
const girls = services.get("girls-restroom");
[
  rect(48, 63.8, 65.5, 74), rect(48, 52.3, 62.2, 65.5),
  rect(52.3, 54.8, 62.2, 65.5), rect(54.8, 57.3, 62.2, 65.5),
].forEach((baseline, i) => moved(girls.footprintRects[i], baseline, -7, `Women's room privacy segment ${i}`));
near(girls.entry.coordinate, 47.8, "Women's door moves with privacy entrance");
assert.equal(girls.entry.center, 63.85);
assert.deepEqual(girls.fixtures.stalls.map(({ side, count }) => [side, count]), [["north", 6], ["south", 6], ["south-lobe", 2]]);
girls.fixtures.stalls.forEach((bank, i) => {
  near(bank.start, [47.5, 47.5, 41.15][i], `Women's stall bank ${i} start`);
  near(bank.end, [56.5, 56.5, 45.15][i], `Women's stall bank ${i} end`);
});
assert.equal(girls.fixtures.sinks[0].count, 3);
near(girls.fixtures.sinks[0].start, 41.5, "Women's sink bank start");
near(girls.fixtures.sinks[0].end, 45.8, "Women's sink bank end");
near(services.get("candy-storage").doorCenter, 94.4, "Bulk candy door retains T9 alignment");

near((HALL_PLAN.narrow.xMax - HALL_PLAN.narrow.xMin) / 26.38, .7, "West hall is exactly 30% shorter");
assert.equal(HALL_PLAN.wide.xMax, 103.3, "East hall is 9.7m shorter");
near(HALL_PLAN.narrow.zMax - HALL_PLAN.narrow.zMin, 4.2, "West hall width is preserved");
near(HALL_PLAN.wide.zMax - HALL_PLAN.wide.zMin, 6.7, "East hall width is preserved");
assert.equal(HALL_PLAN.transitionX, -13.62, "Water-fountain corner stays fixed");
assert.equal(HALL_PLAN.southZ, 55.5);
const northChain = [t6, girls, auditoriums.get(7), auditoriums.get(8), services.get("candy-storage")];
for (let i = 1; i < northChain.length; i++) near(northChain[i].bounds.xMin - northChain[i-1].bounds.xMax, .3,
  `${northChain[i-1].id} / ${northChain[i].id} preserve the minimum wall gap`);
const southOrder = [14, 13, 12, 11, 10, 9].map((number) => auditoriums.get(number));
for (let i = 1; i < southOrder.length; i++) assert.ok(southOrder[i].bounds.xMin >= southOrder[i-1].bounds.xMax - 1e-7,
  "South-side rooms retain their order without overlapping");

for (const pocket of [TICKET_APPROACH_PLAN.posterAlcove, TICKET_APPROACH_PLAN.emptyAlcove]) {
  near((pocket.xMax-pocket.xMin) * (pocket.zMax-pocket.zMin) / (6*5.8), .25, "Ticket nook area is reduced by 75%");
  near(pocket.xMax-pocket.xMin, 3, "Ticket nook width");
  near(pocket.zMax-pocket.zMin, 2.9, "Ticket nook length");
  assert.equal(pocket.zMax, HALL_PLAN.southZ, "Both pockets retain the original hall connection");
}
assert.equal(TICKET_APPROACH_PLAN.posterAlcove.xMax, TICKET_APPROACH_PLAN.bounds.xMin);
assert.equal(TICKET_APPROACH_PLAN.emptyAlcove.xMin, TICKET_APPROACH_PLAN.bounds.xMax);
assert.deepEqual(TICKET_APPROACH_PLAN.bounds, rect(-.5, 12.1, 21.5, 55.5), "Main lobby approach is unchanged");
assert.deepEqual(PUBLIC_SPACES.find(({ id }) => id === "lobby").bounds, rect(-16.2, 15.11, -2.5, 24.5), "Lobby retains its footprint");
for (const exit of HALL_END_EXITS) {
  near(exit.x, exit.side === "west" ? -32.086 : 103.3, `${exit.id} follows its new hall end`);
  near(exit.z, exit.side === "west" ? 57.6 : 58.85, `${exit.id} remains centered across the unchanged hall width`);
}
near(MAP_BOUNDS.xMin, HALL_COMPACTION.westEndX - 1, "West map edge follows compact hall");
near(MAP_BOUNDS.xMax, 104.3, "East map edge follows compact hall");

console.log("Hall compaction valid: 14 unchanged room footprints/orientations, translated entry routes and fixtures, 30% shorter west hall, 9.7m shorter east hall, 75% smaller ticket nooks, retained doorway order and wall clearances.");
