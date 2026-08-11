export const EXPECTED_SEAT_TOTAL = 1093;

const rect = (xMin, xMax, zMin, zMax) => ({ xMin, xMax, zMin, zMax });

export const AUDITORIUM_PRESETS = Object.freeze({
  compact38: { label: "Compact 38", width: 9.5, depth: 13, rowPitch: 1.85, rise: 0.38 },
  medium58: { label: "Medium 58", width: 11.5, depth: 15.5, rowPitch: 1.85, rise: 0.40 },
  large150: { label: "Large 150", width: 17.5, depth: 27, rowPitch: 2.50, rise: 0.44 },
  standard50: { label: "Standard 50", width: 10.5, depth: 13.5, rowPitch: 1.72, rise: 0.38 },
});

const topEntryStadium = Object.freeze({
  access: "top",
  aisles: "dual-side",
  sideAisleWidth: 1.15,
  corridorRise: 0,
});

const bottomEntryStadium = (corridorRise = 0) => ({
  access: "bottom",
  aisles: "dual-side",
  sideAisleWidth: 1.15,
  corridorRise,
});

const COURTYARD_BACK_WALL_Z = 68.2;

// Authoritative v4 relationship for the recessed, dark-tile court behind the
// fountain island. The public-space records below remain split so zone lookup
// can distinguish the fountain half from the theater-approach half, but these
// two halves must render as one continuous room with one back-wall plane.
export const COURTYARD_PLAN = Object.freeze({
  id: "fountain-theaters-3-5-courtyard",
  name: "Fountain / Theaters 3–5 Courtyard",
  bounds: rect(-18.5, 25, 62.2, COURTYARD_BACK_WALL_Z),
  backWallZ: COURTYARD_BACK_WALL_Z,
  floorFinish: "dark-gray-tile",
  publicSpaceIds: Object.freeze(["soda-service", "recessed-theater-court"]),
  doors: Object.freeze([
    { targetId: "theater-3", center: -17, width: 2.4 },
    { targetId: "future-task-room", center: -5.4, width: 2.2 },
    { targetId: "theater-4", center: 20.2, width: 2.4 },
    { targetId: "theater-5", center: 23.3, width: 2.4 },
  ]),
});

// Layout data remains in hand-drawn plan space. X increases toward the
// sketch's right; Z runs from the front entrance into the complex. Rendering
// reflects X around the entrance axis so sketch-left is physically left for
// an entering guest without mirroring text or mouse input.
export const AUDITORIUMS = Object.freeze([
  {
    number: 1, id: "theater-1", preset: "compact38", bounds: rect(-20, -10.5, 45, 58),
    screenSide: "south", seats: 38, rows: [8, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: -17.4, turnSide: "west" },
  },
  {
    number: 2, id: "theater-2", preset: "compact38", bounds: rect(-35, -25.5, 45, 58),
    screenSide: "south", seats: 38, rows: [8, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: -27.6, turnSide: "west" },
  },
  {
    number: 3, id: "theater-3", preset: "large150", bounds: rect(-36, -18.5, 72, 99),
    screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20],
    underStorage: true, stadium: { ...bottomEntryStadium(0.24), outerMargin: 0 },
    entry: {
      type: "storage-left-then-left", center: -17, routeSide: "east", storageId: "under-storage-3",
      courtyardId: COURTYARD_PLAN.id, outerPlaneZ: COURTYARD_BACK_WALL_Z,
      routeBounds: rect(-18.5, -15.5, COURTYARD_BACK_WALL_Z, 95.3), arrivalZ: 94.5,
      ramp: { bounds: rect(-18.5, -15.5, 82.5, 94.5), startHeight: 0, endHeight: 0.24 },
    },
  },
  {
    number: 4, id: "theater-4", preset: "medium58", bounds: rect(5, 16.5, 75, 90.5),
    screenSide: "north", seats: 58, rows: [8, 10, 10, 10, 10, 10], stadium: bottomEntryStadium(0),
    entry: {
      type: "dogleg", center: 20.2, firstTurn: "west", routeSide: "east",
      courtyardId: COURTYARD_PLAN.id, outerPlaneZ: COURTYARD_BACK_WALL_Z,
      vestibuleBounds: rect(14.9, 21.55, COURTYARD_BACK_WALL_Z, 73.1), arrivalZ: 86.4,
    },
  },
  {
    number: 5, id: "theater-5", preset: "medium58", bounds: rect(27, 38.5, 75, 90.5),
    screenSide: "north", seats: 58, rows: [8, 10, 10, 10, 10, 10], stadium: bottomEntryStadium(0),
    entry: {
      type: "dogleg", center: 23.3, firstTurn: "east", routeSide: "west",
      courtyardId: COURTYARD_PLAN.id, outerPlaneZ: COURTYARD_BACK_WALL_Z,
      vestibuleBounds: rect(21.95, 28.6, COURTYARD_BACK_WALL_Z, 73.1), arrivalZ: 86.4,
    },
  },
  {
    number: 6, id: "theater-6", preset: "large150", bounds: rect(43, 60.5, 62.2, 89.2),
    screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20],
    underStorage: true, stadium: bottomEntryStadium(0),
    entry: {
      type: "right-then-left", center: 44.5, routeSide: "east", storageId: "under-storage-6",
      vestibuleBounds: rect(43, 45.85, 62.2, 65.5),
      transverseBounds: rect(43, 60.5, 65.5, 68.5),
      longRouteBounds: rect(58, 60.5, 68.5, 85.5), arrivalZ: 84.7,
    },
  },
  {
    number: 7, id: "theater-7", preset: "large150", bounds: rect(79.5, 97, 62.2, 89.2),
    screenSide: "north", seats: 153, rows: [15, 18, 20, 20, 20, 20, 20, 20],
    stadium: bottomEntryStadium(0.24),
    entry: {
      type: "straight-side", center: 80.8, routeSide: "west", arrivalZ: 84.7,
      ramp: { bounds: rect(79.5, 82, 63.1, 84.7), startHeight: 0, endHeight: 0.24 },
    },
  },
  {
    number: 8, id: "theater-8", preset: "large150", bounds: rect(110, 127.5, 62.2, 89.2),
    screenSide: "north", seats: 152, rows: [14, 18, 20, 20, 20, 20, 20, 20],
    stadium: bottomEntryStadium(0.24),
    entry: {
      type: "straight-side", center: 111.3, routeSide: "west", arrivalZ: 84.7,
      ramp: { bounds: rect(110, 112.5, 63.1, 84.7), startHeight: 0, endHeight: 0.24 },
    },
  },
  {
    number: 9, id: "theater-9", preset: "standard50", bounds: rect(125, 135.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: 132.4, turnSide: "east" },
  },
  {
    number: 10, id: "theater-10", preset: "standard50", bounds: rect(96, 106.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: 98.1, turnSide: "east" },
  },
  {
    number: 11, id: "theater-11", preset: "standard50", bounds: rect(75, 85.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: 77.1, turnSide: "east" },
  },
  {
    number: 12, id: "theater-12", preset: "standard50", bounds: rect(54, 64.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: 56.1, turnSide: "east" },
  },
  {
    number: 13, id: "theater-13", preset: "standard50", bounds: rect(36, 46.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: 38.1, turnSide: "east" },
  },
  {
    number: 14, id: "theater-14", preset: "standard50", bounds: rect(18, 28.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: topEntryStadium,
    entry: { type: "trash-cubby", center: 21.1, turnSide: "west" },
  },
]);

export const PUBLIC_SPACES = Object.freeze([
  { id: "front-walk", name: "Front Walk", detail: "Public entrance", bounds: rect(-27, 29, -10, 0), kind: "exterior" },
  { id: "lobby", name: "Main Lobby", detail: "Concessions, bar, box office, kiosks, and guest gathering", bounds: rect(-24.5, 23, 0, 27), kind: "lobby" },
  { id: "lobby-approach", name: "Carpeted Lobby Hall", detail: "Long guest route to ticket check", bounds: rect(-7.3, 14.4, 24, 58), kind: "corridor" },
  { id: "ticket-check", name: "Ticket Check", detail: "Guest entry checkpoint", bounds: rect(-5, 7, 53, 58), kind: "ticket" },
  { id: "main-corridor", name: "Main Theater Hall", detail: "Long, narrow auditorium corridor", bounds: rect(-40, 140, 58, 62.2), kind: "corridor" },
  { id: "soda-service", name: "Self-Serve Fountain Court", detail: "Dark-gray-tile courtyard with soda, ICEE, lids, straws, and cup service", bounds: rect(-18.5, 9, 62.2, COURTYARD_BACK_WALL_Z), kind: "soda-service", courtyardId: COURTYARD_PLAN.id, floorFinish: COURTYARD_PLAN.floorFinish },
  { id: "recessed-theater-court", name: "Theaters 3–5 Court", detail: "Continuous dark-gray-tile courtyard sharing the fountain court and the four-door back wall", bounds: rect(9, 25, 62.2, COURTYARD_BACK_WALL_Z), kind: "corridor", courtyardId: COURTYARD_PLAN.id, floorFinish: COURTYARD_PLAN.floorFinish },
]);

export const SERVICE_ROOMS = Object.freeze([
  { id: "office-overflow", name: "Office Overflow / Candy", short: "STOCK", detail: "Interim excess-candy room before the manager office", bounds: rect(-36.5, -24.5, 0.4, 3.8), kind: "storage", entrySide: "east", doorCenter: 2.7, extraDoors: [{ side: "north", center: -34.7 }] },
  { id: "office", name: "Manager Office", short: "OFF", detail: "Back-office operations behind the overflow room", bounds: rect(-36.5, -24.5, 3.8, 7), kind: "office", entrySide: "south", doorCenter: -34.7 },
  { id: "kitchen-storage", name: "Kitchen Storage", short: "KS", detail: "Dry, refrigerated, and service stock connected directly to the hot line through the diagonal partition", bounds: rect(-37, -29, 7, 24), kind: "storage", entrySide: "east", doorCenter: 10.35, connections: Object.freeze(["kitchen"]) },
  { id: "concession-boh", name: "Concession Backline", short: "C", detail: "Irregular preparation area behind the bent customer counter", bounds: rect(-29, -8.6, 4.9, 24), kind: "concession" },
  { id: "kitchen", name: "Kitchen Hot Line", short: "K", detail: "Fryers, grill, and turbo-oven line", bounds: rect(-29, -17.8, 17, 24), kind: "kitchen" },
  { id: "bar", name: "Lobby Bar", short: "B", detail: "Horizontal guest bar and back-bar worktop", bounds: rect(-16.1, -8.6, 20.4, 24), kind: "bar" },
  { id: "box-office", name: "Box Office", short: "BOX", detail: "Freestanding L-shaped ticket counter", bounds: rect(9.2, 15.5, 6.9, 14.4), kind: "office" },
  { id: "electrical-room", name: "Electrical Room", short: "ELEC", detail: "Closed service room behind the former provisional restroom door", bounds: rect(14.4, 20, 34, 43), kind: "electrical", entrySide: "west", doorCenter: 39, closed: true },
  { id: "trash-room", name: "Trash Room", short: "TRASH", detail: "Waste and cleaning support; the door is at the right end and the room opens left", bounds: rect(-40, -33.2, 62.2, 65.5), kind: "trash", entrySide: "south", doorCenter: -34.35, doorPlacement: "right", opensToward: "west" },
  {
    id: "boys-restroom", name: "Men's Restroom", short: "BB",
    detail: "Privacy vestibule with two left turns, followed by stalls, urinals, and sinks",
    bounds: rect(-36, -21.4, 65.5, 72), kind: "restroom", entrySide: "south", doorCenter: -29.6,
    privacyTurn: "west", pathTurns: Object.freeze(["left", "left"]),
    cubby: { bounds: rect(-28.2, -21.4, 62.2, 65.5), outerDoorCenter: -22.7, innerSide: "west", innerDoorCenter: 64.05 },
  },
  {
    id: "girls-restroom", name: "Women's Restroom", short: "GB",
    detail: "Left-turn cubby, stalls, and sinks",
    bounds: rect(61.5, 73.5, 65.5, 74), kind: "restroom", entrySide: "south", doorCenter: 72,
    privacyTurn: "west",
    cubby: { bounds: rect(73.5, 77.3, 62.2, 65.5), outerDoorCenter: 75.4, innerSide: "west", innerDoorCenter: 64.05 },
  },
  { id: "future-task-room", name: "Future Task Room", short: "TASK", detail: "Empty gameplay room directly behind the fountain counters on the shared courtyard door plane", bounds: rect(-7, 8.5, COURTYARD_BACK_WALL_Z, 74.8), kind: "storage", entrySide: "south", doorCenter: -5.4, courtyardId: COURTYARD_PLAN.id },
  { id: "candy-storage", name: "Candy Storage", short: "CANDY", detail: "Bulk concession inventory opposite Theater 9", bounds: rect(128.5, 138.5, 62.2, 75.5), kind: "storage", entrySide: "south", doorCenter: 132.4, extraDoors: [{ side: "east", center: 72.1 }] },
  { id: "under-storage-3", name: "Under-Seat Storage 3", short: "U/S 3", detail: "Horizontal two-door room extending left from Theater 3's east-side access hall", bounds: rect(-33.5, -21.4, 74, 82.5), kind: "storage-lower", orientation: "horizontal", ceilingHeight: 2.32, doorSide: "east", doorCenters: [75.8, 80.5], accessHall: rect(-21.4, -18.5, 69.2, 83), outerDoorCenter: 70.5 },
  { id: "under-storage-6", name: "Under-Seat Storage 6", short: "U/S 6", detail: "Shared two-door room below Theater 6's upper tiers", bounds: rect(45, 58, 68.5, 71.8), kind: "storage-lower", ceilingHeight: 2.32, doorSide: "south", doorCenters: [48.5, 55] },
]);

export const LOBBY_PLAN = Object.freeze({
  envelope: rect(-37, 23, 0, 24),
  frontDoorCenters: [-10.8, -2.2, 8.7],
  customerCounter: [
    { x: -8.8, z: 20.4 },
    { x: -16.1, z: 20.4 },
    { x: -16.8, z: 17.8 },
    { x: -20.5, z: 8.2 },
    { x: -20.1, z: 4.9 },
  ],
  backBar: rect(-16.1, -8.6, 23.05, 24),
  hotLine: rect(-28.8, -17.8, 23.05, 24),
  kitchenPartition: [
    { x: -29, z: 23.5 }, { x: -29, z: 19.6 }, { x: -27.3, z: 17.3 },
    { x: -24.4, z: 17.1 }, { x: -24.6, z: 15.5 }, { x: -24.5, z: 11.1 },
    { x: -24.5, z: 9.6 }, { x: -24.5, z: 7 },
  ],
  serviceDoor: { x: -24.5, z: 10.35 },
  kitchenStorageDoor: {
    x: -28.15, z: 18.45, width: 1.5,
    wall: "diagonal", partitionSegment: 1, segmentT: 0.5,
    connects: Object.freeze(["kitchen-storage", "kitchen"]),
  },
  futureStairs: rect(15.9, 22, 8.2, 24),
  boxOfficeVertical: rect(9.2, 10.3, 6.9, 14.4),
  boxOfficeReturn: rect(9.2, 15.5, 6.9, 8),
  kiosks: [
    { id: "ticket-kiosk-1", position: [21.4, 0, 3.3], rotation: Math.PI / 2 },
    { id: "ticket-kiosk-2", position: [21.4, 0, 5.3], rotation: Math.PI / 2 },
  ],
  officePath: ["lobby", "office-overflow", "office"],
});

export const EQUIPMENT_ANCHORS = Object.freeze([
  { id: "concession-popper-1", type: "popper", roomId: "concession-boh", position: [-23.5, 0, 14.5], rotation: 0.34, footprint: [1.35, 0.9] },
  { id: "concession-popper-2", type: "popper", roomId: "concession-boh", position: [-23.2, 0, 13.0], rotation: 0.34, footprint: [1.35, 0.9] },
  { id: "kitchen-grill", type: "grill", roomId: "kitchen", position: [-27.5, 0, 22.7], rotation: 0, footprint: [1.35, 0.9] },
  { id: "kitchen-fryer-1", type: "fryer", roomId: "kitchen", position: [-25.7, 0, 22.7], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-fryer-2", type: "fryer", roomId: "kitchen", position: [-24.3, 0, 22.7], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-turbo-oven", type: "turbo-oven", roomId: "kitchen", position: [-22.5, 0, 22.7], rotation: 0, footprint: [1.15, 0.95] },
  { id: "bar-well", type: "bar-well", roomId: "bar", position: [-12.3, 0, 22.7], rotation: Math.PI, footprint: [1.5, 0.8] },
  { id: "soda-icee-left", type: "icee-fountain", roomId: "soda-service", position: [-3.7, 0, 63.6], rotation: 0, footprint: [1.5, 0.95] },
  { id: "soda-fountain-1", type: "soda-fountain", roomId: "soda-service", position: [-1.5, 0, 63.6], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-fountain-2", type: "soda-fountain", roomId: "soda-service", position: [3.0, 0, 63.6], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-icee-right", type: "icee-fountain", roomId: "soda-service", position: [5.7, 0, 63.6], rotation: 0, footprint: [1.5, 0.95] },
  { id: "boys-water-fountain-1", type: "drinking-fountain", roomId: "main-corridor", position: [-20.3, 0, 61.78], rotation: 0, footprint: [0.65, 0.42] },
  { id: "boys-water-fountain-2", type: "drinking-fountain", roomId: "main-corridor", position: [-19.4, 0, 61.78], rotation: 0, footprint: [0.65, 0.42] },
]);

export const POS_STATIONS = Object.freeze([
  [-17.3, 16.8], [-17.9, 15.0], [-18.5, 13.3],
  [-19.2, 11.5], [-19.8, 9.7], [-20.3, 8.0],
].map(([x, z], index) => ({
  id: `concession-pos-${index + 1}`,
  position: [x, 0, z],
  rotation: 0.37,
  counterSegment: "diagonal-pos-run",
})));

export const HALL_END_EXITS = Object.freeze([
  { id: "hall-west-exit", side: "west", x: -40, z: 60.1 },
  { id: "hall-east-exit", side: "east", x: 140, z: 60.1 },
]);

export const ALL_ZONES = Object.freeze([
  ...PUBLIC_SPACES,
  ...SERVICE_ROOMS.filter((room) => room.kind !== "storage-lower"),
  ...AUDITORIUMS.map((auditorium) => ({
    id: auditorium.id,
    name: `Theater ${auditorium.number}`,
    detail: `${auditorium.seats} brown-leather recliner seats${auditorium.number === 3 ? " · large-format scale" : ""}`,
    bounds: auditorium.bounds,
    kind: "auditorium",
  })),
]);

export const MAP_BOUNDS = Object.freeze(rect(-41, 141, -10, 99));
export const PLAYER_SPAWN_PLAN = Object.freeze({ x: 1.5, y: 0, z: -6.8 });

export const AUDITORIUM_ENTRY_ZONES = Object.freeze([
  { id: "theater-3-entry", name: "Theater 3 Entrance", detail: "Shared courtyard door · horizontal under-tier storage left · gentle incline · front seating apron", bounds: rect(-21.4, -15.5, COURTYARD_BACK_WALL_Z, 95.3) },
  { id: "theater-4-entry", name: "Theater 4 Vestibule", detail: "Long left turn · right turn · open front aisle", bounds: rect(14.9, 21.55, 68.2, 75) },
  { id: "theater-5-entry", name: "Theater 5 Vestibule", detail: "Long right turn · left turn · open front aisle", bounds: rect(21.95, 28.6, 68.2, 75) },
]);

export function pointInBounds(x, z, bounds, padding = 0) {
  return x >= bounds.xMin - padding && x <= bounds.xMax + padding
    && z >= bounds.zMin - padding && z <= bounds.zMax + padding;
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
    if (!room.stadium || room.stadium.aisles !== "dual-side") errors.push(`${room.id} must use dual side aisles.`);
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

  const auditoriumById = new Map(AUDITORIUMS.map((room) => [room.id, room]));
  const serviceRoomById = new Map(SERVICE_ROOMS.map((room) => [room.id, room]));
  const courtyardDoorCenters = COURTYARD_PLAN.doors.map(({ center }) => center);
  if (COURTYARD_PLAN.floorFinish !== "dark-gray-tile") errors.push("The fountain / T3–5 courtyard must use dark-gray tile.");
  if (COURTYARD_PLAN.doors.map(({ targetId }) => targetId).join(",") !== "theater-3,future-task-room,theater-4,theater-5") {
    errors.push("Courtyard doors must run T3, future task, T4, T5 from plan-left to plan-right.");
  }
  if (!courtyardDoorCenters.every((center, index) => index === 0 || center > courtyardDoorCenters[index - 1])) {
    errors.push("Courtyard door centers must increase from plan-left to plan-right.");
  }
  for (const targetId of ["theater-3", "theater-4", "theater-5"]) {
    const auditorium = auditoriumById.get(targetId);
    if (auditorium?.entry?.outerPlaneZ !== COURTYARD_PLAN.backWallZ || auditorium?.entry?.courtyardId !== COURTYARD_PLAN.id) {
      errors.push(`${targetId} must open from the shared courtyard back-wall plane.`);
    }
  }
  const futureTask = serviceRoomById.get("future-task-room");
  if (futureTask?.bounds?.zMin !== COURTYARD_PLAN.backWallZ || futureTask?.courtyardId !== COURTYARD_PLAN.id) {
    errors.push("The future task room must open from the shared courtyard back-wall plane.");
  }
  if (serviceRoomById.has("usher-stock")) errors.push("The bogus T4/T5 below-tier stock room must not exist.");
  const boys = serviceRoomById.get("boys-restroom");
  if (boys?.pathTurns?.join(",") !== "left,left") errors.push("The boys restroom vestibule must turn left, then left.");
  const trash = serviceRoomById.get("trash-room");
  if (trash?.doorPlacement !== "right" || trash?.opensToward !== "west") errors.push("The trash room door must be on the right and open into a room extending left.");
  if (trash && boys && trash.bounds.xMin < boys.bounds.xMax && trash.bounds.xMax > boys.bounds.xMin
    && trash.bounds.zMin < boys.bounds.zMax && trash.bounds.zMax > boys.bounds.zMin) {
    errors.push("The boys restroom and trash room must not overlap.");
  }
  if (LOBBY_PLAN.kitchenStorageDoor.wall !== "diagonal" || LOBBY_PLAN.kitchenStorageDoor.partitionSegment !== 1) {
    errors.push("Kitchen storage must connect to the kitchen through the diagonal partition.");
  }
  if (EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").length !== 2) {
    errors.push("Two drinking fountains are required outside the boys restroom.");
  }

  return { valid: errors.length === 0, errors, auditoriumCount: AUDITORIUMS.length, seatTotal };
}
