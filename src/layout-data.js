export const EXPECTED_SEAT_TOTAL = 1093;

const rect = (xMin, xMax, zMin, zMax) => ({ xMin, xMax, zMin, zMax });

export const AUDITORIUM_PRESETS = Object.freeze({
  compact38: { label: "Compact 38", width: 9.5, depth: 13, rowPitch: 1.55, rise: 0.27 },
  medium58: { label: "Medium 58", width: 11.5, depth: 15.5, rowPitch: 1.62, rise: 0.28 },
  large150: { label: "Large 150", width: 17.5, depth: 23, rowPitch: 1.78, rise: 0.31 },
  standard50: { label: "Standard 50", width: 10.5, depth: 13.5, rowPitch: 1.58, rise: 0.27 },
});

// Layout data stays in hand-drawn plan space: X increases toward the sketch's
// right, and Z runs from the entrance into the theater. The renderer reflects
// plan X into world X so sketch-left is physically left for an entering guest.
export const AUDITORIUMS = Object.freeze([
  {
    number: 1, id: "theater-1", preset: "compact38", bounds: rect(-20, -10.5, 45, 58),
    screenSide: "south", seats: 38, rows: [8, 10, 10, 10],
    entry: { type: "trash-cubby", center: -17.4, turnSide: "west" },
  },
  {
    number: 2, id: "theater-2", preset: "compact38", bounds: rect(-35, -25.5, 45, 58),
    screenSide: "south", seats: 38, rows: [8, 10, 10, 10],
    entry: { type: "trash-cubby", center: -27.6, turnSide: "west" },
  },
  {
    number: 3, id: "theater-3", preset: "large150", bounds: rect(-33, -15.5, 72, 95),
    screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20],
    underStorage: true,
    entry: { type: "storage-left-then-left", center: -17.2, routeSide: "east", storageId: "under-storage-3" },
  },
  {
    number: 4, id: "theater-4", preset: "medium58", bounds: rect(-14.5, -3, 72, 87.5),
    screenSide: "north", seats: 58, rows: [10, 12, 12, 12, 12],
    entry: { type: "dogleg", center: -1.8, firstTurn: "west", routeSide: "east" },
  },
  {
    number: 5, id: "theater-5", preset: "medium58", bounds: rect(2, 13.5, 72, 87.5),
    screenSide: "north", seats: 58, rows: [10, 12, 12, 12, 12],
    entry: { type: "dogleg", center: 0.8, firstTurn: "east", routeSide: "west" },
  },
  {
    number: 6, id: "theater-6", preset: "large150", bounds: rect(20, 37.5, 62.2, 85.2),
    screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20],
    underStorage: true,
    entry: { type: "right-then-left", center: 21.5, routeSide: "east", storageId: "under-storage-6" },
  },
  {
    number: 7, id: "theater-7", preset: "large150", bounds: rect(65, 82.5, 62.2, 85.2),
    screenSide: "north", seats: 153, rows: [15, 18, 20, 20, 20, 20, 20, 20],
    entry: { type: "straight-side", center: 66.3, routeSide: "west" },
  },
  {
    number: 8, id: "theater-8", preset: "large150", bounds: rect(98, 115.5, 62.2, 85.2),
    screenSide: "north", seats: 152, rows: [14, 18, 20, 20, 20, 20, 20, 20],
    entry: { type: "straight-side", center: 99.3, routeSide: "west" },
  },
  {
    number: 9, id: "theater-9", preset: "standard50", bounds: rect(152, 162.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10],
    entry: { type: "trash-cubby", center: 160.4, turnSide: "west" },
  },
  {
    number: 10, id: "theater-10", preset: "standard50", bounds: rect(127, 137.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10],
    entry: { type: "trash-cubby", center: 129.1, turnSide: "east" },
  },
  {
    number: 11, id: "theater-11", preset: "standard50", bounds: rect(96, 106.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10],
    entry: { type: "trash-cubby", center: 98.1, turnSide: "east" },
  },
  {
    number: 12, id: "theater-12", preset: "standard50", bounds: rect(69, 79.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10],
    entry: { type: "trash-cubby", center: 71.1, turnSide: "east" },
  },
  {
    number: 13, id: "theater-13", preset: "standard50", bounds: rect(43, 53.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10],
    entry: { type: "trash-cubby", center: 45.1, turnSide: "east" },
  },
  {
    number: 14, id: "theater-14", preset: "standard50", bounds: rect(18, 28.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10],
    entry: { type: "trash-cubby", center: 20.1, turnSide: "east" },
  },
]);

export const PUBLIC_SPACES = Object.freeze([
  { id: "front-walk", name: "Front Walk", detail: "Public entrance", bounds: rect(-26, 29, -10, 0), kind: "exterior" },
  { id: "lobby", name: "Main Lobby", detail: "Concessions, bar, box office, and guest gathering", bounds: rect(-20, 23, 0, 24), kind: "lobby" },
  { id: "lobby-approach", name: "Carpeted Lobby Hall", detail: "Long guest route to ticket check", bounds: rect(-7, 10, 24, 58), kind: "corridor" },
  { id: "ticket-check", name: "Ticket Check", detail: "Guest entry checkpoint", bounds: rect(-5, 7, 53, 58), kind: "ticket" },
  { id: "main-corridor", name: "Main Theater Hall", detail: "Long, narrow auditorium corridor", bounds: rect(-40, 164, 58, 62.2), kind: "corridor" },
  { id: "soda-service", name: "Self-Serve Fountain Court", detail: "Soda, ICEE, lids, straws, and cup service", bounds: rect(-13, 17, 62.2, 72), kind: "soda-service" },
]);

export const SERVICE_ROOMS = Object.freeze([
  { id: "office", name: "Manager Office", short: "OFF", detail: "Back-office operations", bounds: rect(-37, -29, 0, 12), kind: "office", entrySide: "east", doorCenter: 5.5, extraDoors: [{ side: "south", center: -33 }] },
  { id: "kitchen-storage", name: "Kitchen Storage", short: "KS", detail: "Dry and refrigerated stock", bounds: rect(-37, -29, 13, 24), kind: "storage", entrySide: "east", doorCenter: 17.5 },
  { id: "concession-boh", name: "Concession Backline", short: "C", detail: "Popcorn and concession preparation", bounds: rect(-29, -20, 2, 19), kind: "concession", entrySide: "east", doorCenter: 8.5 },
  { id: "kitchen", name: "Kitchen", short: "K", detail: "Equipment-ready hot line", bounds: rect(-29, -24, 19, 24), kind: "kitchen", entrySide: "south", doorCenter: -26.5, extraDoors: [{ side: "east", center: 21.5 }] },
  { id: "bar", name: "Lobby Bar", short: "B", detail: "Beverage service", bounds: rect(-24, -10, 19, 24), kind: "bar", entrySide: "south", doorCenter: -20.5 },
  { id: "box-office", name: "Box Office", short: "BOX", detail: "Ticket sales", bounds: rect(13, 19, 6, 14), kind: "office", entrySide: "west", doorCenter: 10 },
  { id: "approach-room", name: "Additional Restroom", short: "RR", detail: "Provisional empty room behind the lobby-hall door", bounds: rect(10, 17, 34, 43), kind: "restroom-empty", entrySide: "west", doorCenter: 39 },
  { id: "unconfirmed-restroom", name: "Additional Restroom", short: "RR", detail: "Provisional room behind the unlabeled hall door", bounds: rect(-40, -33, 62.2, 69), kind: "restroom-empty", entrySide: "south", doorCenter: -36.5 },
  { id: "trash-room", name: "Trash Room", short: "TRASH", detail: "Waste and cleaning support", bounds: rect(-32, -24, 62.2, 65.5), kind: "trash", entrySide: "south", doorCenter: -28 },
  { id: "boys-restroom", name: "Men's Restroom", short: "BB", detail: "Privacy return, stalls, urinals, and sinks", bounds: rect(-33, -21, 65.5, 72), kind: "restroom", entrySide: "south", doorCenter: -22.7, privacyTurn: "west" },
  { id: "girls-restroom", name: "Women's Restroom", short: "GB", detail: "Privacy return, stalls, and sinks", bounds: rect(40, 52, 65, 73.8), kind: "restroom", entrySide: "south", doorCenter: 44.5, privacyTurn: "west" },
  { id: "soda-support", name: "Soda Support Room", short: "STOCK", detail: "Room to the left of the fountain island", bounds: rect(-12.5, -7, 62.2, 69), kind: "storage", entrySide: "south", doorCenter: -9.7 },
  { id: "candy-storage", name: "Candy Storage", short: "CANDY", detail: "Bulk concession inventory", bounds: rect(132, 158, 62.2, 76), kind: "storage", entrySide: "south", doorCenter: 136, extraDoors: [{ side: "east", center: 72.1 }] },
  { id: "under-storage-3", name: "Under-Seat Storage 3", short: "U/S 3", detail: "Dotted storage reached from Theater 3's left-hand passage", bounds: rect(-32.5, -20.9, 72.1, 75.5), kind: "storage-lower" },
  { id: "under-storage-6", name: "Under-Seat Storage 6", short: "U/S 6", detail: "Dotted storage below Theater 6 stadium tiers", bounds: rect(21, 34, 63, 70), kind: "storage-lower" },
  { id: "usher-stock", name: "Below-Tier Usher / Soda Stock", short: "USHER STOCK", detail: "Dotted lower storage behind Theaters 4 and 5", bounds: rect(-14, 13.5, 78.5, 82), kind: "storage-lower" },
]);

export const EQUIPMENT_ANCHORS = Object.freeze([
  { id: "concession-popper", type: "popper", roomId: "concession-boh", position: [-25.8, 0, 5], rotation: Math.PI / 2, footprint: [1.5, 1.1] },
  { id: "kitchen-grill", type: "grill", roomId: "kitchen", position: [-27.9, 0, 22.2], rotation: 0, footprint: [1.2, 0.9] },
  { id: "kitchen-fryer", type: "fryer", roomId: "kitchen", position: [-26.4, 0, 22.2], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-turbo-oven", type: "turbo-oven", roomId: "kitchen", position: [-25.1, 0, 22.2], rotation: 0, footprint: [1.1, 1] },
  { id: "bar-well", type: "bar-well", roomId: "bar", position: [-19.5, 0, 22.1], rotation: Math.PI, footprint: [1.5, 0.8] },
  { id: "soda-icee-left", type: "icee-fountain", roomId: "soda-service", position: [-3.7, 0, 63.6], rotation: 0, footprint: [1.5, 0.95] },
  { id: "soda-fountain-1", type: "soda-fountain", roomId: "soda-service", position: [-1.5, 0, 63.6], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-fountain-2", type: "soda-fountain", roomId: "soda-service", position: [3.0, 0, 63.6], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-icee-right", type: "icee-fountain", roomId: "soda-service", position: [5.7, 0, 63.6], rotation: 0, footprint: [1.5, 0.95] },
]);

export const POS_STATIONS = Object.freeze([
  3.2, 5.5, 10.8, 13.1, 15.4, 17.7,
].map((z, index) => ({ id: `concession-pos-${index + 1}`, position: [-19.35, 0, z] })));

export const ALL_ZONES = Object.freeze([
  ...PUBLIC_SPACES,
  ...SERVICE_ROOMS.filter((room) => room.kind !== "storage-lower"),
  ...AUDITORIUMS.map((auditorium) => ({
    id: auditorium.id,
    name: `Theater ${auditorium.number}`,
    detail: `${auditorium.seats} seats${auditorium.number === 3 ? " · large-format scale" : ""}`,
    bounds: auditorium.bounds,
    kind: "auditorium",
  })),
]);

export const MAP_BOUNDS = Object.freeze(rect(-41, 165, -10, 95));
export const PLAYER_SPAWN_PLAN = Object.freeze({ x: 1.5, y: 0, z: -6.8 });

// These soundlocks and side corridors extend beyond their auditorium shells.
// Keeping them explicit makes HUD/location feedback follow the real walking
// route instead of falling back to the exterior zone.
export const AUDITORIUM_ENTRY_ZONES = Object.freeze([
  { id: "theater-3-entry", name: "Theater 3 Entrance", detail: "Storage door left · auditorium turn left", bounds: rect(-18.4, -15.5, 62.2, 78.5) },
  { id: "theater-4-entry", name: "Theater 4 Vestibule", detail: "Left turn · right turn · side aisle", bounds: rect(-5.75, -0.45, 68.2, 72) },
  { id: "theater-5-entry", name: "Theater 5 Vestibule", detail: "Right turn · left turn · side aisle", bounds: rect(-0.55, 4.75, 68.2, 72) },
]);

export function pointInBounds(x, z, bounds, padding = 0) {
  return x >= bounds.xMin - padding && x <= bounds.xMax + padding && z >= bounds.zMin - padding && z <= bounds.zMax + padding;
}

export function zoneAt(x, z) {
  for (let index = AUDITORIUM_ENTRY_ZONES.length - 1; index >= 0; index -= 1) {
    if (pointInBounds(x, z, AUDITORIUM_ENTRY_ZONES[index].bounds)) return AUDITORIUM_ENTRY_ZONES[index];
  }
  for (let index = ALL_ZONES.length - 1; index >= 0; index -= 1) {
    if (pointInBounds(x, z, ALL_ZONES[index].bounds)) return ALL_ZONES[index];
  }
  return PUBLIC_SPACES[0];
}

export function validateLayoutData() {
  const errors = [];
  const theaterNumbers = new Set(AUDITORIUMS.map((room) => room.number));
  const zoneIds = new Set(ALL_ZONES.map((zone) => zone.id));
  const roomIds = new Set([...SERVICE_ROOMS.map((room) => room.id), ...zoneIds]);
  const seatTotal = AUDITORIUMS.reduce((sum, room) => sum + room.seats, 0);

  if (AUDITORIUMS.length !== 14 || theaterNumbers.size !== 14) errors.push("Expected 14 unique auditoriums.");
  if (seatTotal !== EXPECTED_SEAT_TOTAL) errors.push(`Seat total ${seatTotal} does not equal ${EXPECTED_SEAT_TOTAL}.`);
  if (zoneIds.size !== ALL_ZONES.length) errors.push("Zone IDs must be unique.");

  for (const room of AUDITORIUMS) {
    const rowTotal = room.rows.reduce((sum, count) => sum + count, 0);
    if (rowTotal !== room.seats) errors.push(`${room.id} rows total ${rowTotal}, expected ${room.seats}.`);
    if (!AUDITORIUM_PRESETS[room.preset]) errors.push(`${room.id} references missing preset ${room.preset}.`);
    if (!room.entry?.type || !Number.isFinite(room.entry.center)) errors.push(`${room.id} is missing detailed entry metadata.`);
  }

  for (const anchor of EQUIPMENT_ANCHORS) {
    const room = [...SERVICE_ROOMS, ...PUBLIC_SPACES].find((candidate) => candidate.id === anchor.roomId);
    if (!roomIds.has(anchor.roomId) || !room) {
      errors.push(`${anchor.id} references missing room ${anchor.roomId}.`);
    } else if (!pointInBounds(anchor.position[0], anchor.position[2], room.bounds)) {
      errors.push(`${anchor.id} lies outside ${anchor.roomId}.`);
    }
  }

  for (const zone of ALL_ZONES) {
    if (zone.bounds.xMax <= zone.bounds.xMin || zone.bounds.zMax <= zone.bounds.zMin) {
      errors.push(`${zone.id} has invalid bounds.`);
    }
  }

  return { valid: errors.length === 0, errors, auditoriumCount: AUDITORIUMS.length, seatTotal };
}
