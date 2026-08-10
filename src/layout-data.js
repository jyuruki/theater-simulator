export const EXPECTED_SEAT_TOTAL = 1093;

const rect = (xMin, xMax, zMin, zMax) => ({ xMin, xMax, zMin, zMax });

export const AUDITORIUM_PRESETS = Object.freeze({
  compact38: { label: "Compact 38", width: 9.5, depth: 13, rowPitch: 1.55, rise: 0.27 },
  medium58: { label: "Medium 58", width: 11.5, depth: 15.5, rowPitch: 1.62, rise: 0.28 },
  large150: { label: "Large 150", width: 17.5, depth: 23, rowPitch: 1.78, rise: 0.31 },
  standard50: { label: "Standard 50", width: 10.5, depth: 13.5, rowPitch: 1.58, rise: 0.27 },
});

export const AUDITORIUMS = Object.freeze([
  { number: 1, id: "theater-1", preset: "compact38", bounds: rect(-15.5, -6, 25, 38), screenSide: "south", seats: 38, rows: [8, 10, 10, 10] },
  { number: 2, id: "theater-2", preset: "compact38", bounds: rect(-27, -17.5, 25, 38), screenSide: "south", seats: 38, rows: [8, 10, 10, 10] },
  { number: 3, id: "theater-3", preset: "large150", bounds: rect(-25, -7.5, 50, 73), screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20], underStorage: true },
  { number: 4, id: "theater-4", preset: "medium58", bounds: rect(-6, 5.5, 43.5, 59), screenSide: "north", seats: 58, rows: [10, 12, 12, 12, 12] },
  { number: 5, id: "theater-5", preset: "medium58", bounds: rect(6.5, 18, 43.5, 59), screenSide: "north", seats: 58, rows: [10, 12, 12, 12, 12] },
  { number: 6, id: "theater-6", preset: "large150", bounds: rect(19.5, 37, 43.5, 66.5), screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20], underStorage: true },
  { number: 7, id: "theater-7", preset: "large150", bounds: rect(52, 69.5, 43.5, 66.5), screenSide: "north", seats: 153, rows: [15, 18, 20, 20, 20, 20, 20, 20], dogleg: true },
  { number: 8, id: "theater-8", preset: "large150", bounds: rect(76, 93.5, 43.5, 66.5), screenSide: "north", seats: 152, rows: [14, 18, 20, 20, 20, 20, 20, 20], dogleg: true },
  { number: 9, id: "theater-9", preset: "standard50", bounds: rect(116, 126.5, 24.5, 38), screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10] },
  { number: 10, id: "theater-10", preset: "standard50", bounds: rect(96, 106.5, 24.5, 38), screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10] },
  { number: 11, id: "theater-11", preset: "standard50", bounds: rect(72, 82.5, 24.5, 38), screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10] },
  { number: 12, id: "theater-12", preset: "standard50", bounds: rect(51, 61.5, 24.5, 38), screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10] },
  { number: 13, id: "theater-13", preset: "standard50", bounds: rect(32, 42.5, 24.5, 38), screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10] },
  { number: 14, id: "theater-14", preset: "standard50", bounds: rect(14, 24.5, 24.5, 38), screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10] },
]);

export const PUBLIC_SPACES = Object.freeze([
  { id: "front-walk", name: "Front Walk", detail: "Public entrance", bounds: rect(-20, 22, -9, 0), kind: "exterior" },
  { id: "lobby", name: "Main Lobby", detail: "Guest arrival and gathering", bounds: rect(-14, 17, 0, 16), kind: "lobby" },
  { id: "lobby-neck", name: "Lobby Approach", detail: "Box office and queue", bounds: rect(-7, 9, 16, 38), kind: "lobby" },
  { id: "ticket-check", name: "Ticket Check", detail: "Guest entry checkpoint", bounds: rect(-5, 6, 34, 38), kind: "ticket" },
  { id: "main-corridor", name: "Main Theater Hall", detail: "Auditoriums 1–14", bounds: rect(-31, 127, 38, 43.5), kind: "corridor" },
]);

export const SERVICE_ROOMS = Object.freeze([
  { id: "kitchen-storage", name: "Kitchen Storage", short: "KS", detail: "Dry and refrigerated stock", bounds: rect(-30, -22, 9, 16), kind: "storage" },
  { id: "office", name: "Manager Office", short: "OFF", detail: "Back-office operations", bounds: rect(-30, -22, 0, 8), kind: "office" },
  { id: "kitchen", name: "Kitchen", short: "K", detail: "Equipment-ready hot line", bounds: rect(-22, -14, 9, 16), kind: "kitchen" },
  { id: "concession-boh", name: "Concession Backline", short: "C", detail: "Prep and soda service", bounds: rect(-22, -14, 0, 9), kind: "concession" },
  { id: "bar", name: "Lobby Bar", short: "B", detail: "Beverage service", bounds: rect(-14, -4, 12, 16), kind: "bar" },
  { id: "box-office", name: "Box Office", short: "BOX", detail: "Ticket sales", bounds: rect(8, 13, 5, 10), kind: "office" },
  { id: "boys-restroom", name: "Men's Restroom", short: "BB", detail: "3 stalls · 4 urinals · 3 sinks", bounds: rect(-25, -13, 43.5, 50), kind: "restroom" },
  { id: "girls-restroom", name: "Women's Restroom", short: "GB", detail: "6 stalls · 4 sinks", bounds: rect(38.5, 50, 43.5, 51.5), kind: "restroom" },
  { id: "usher-stock", name: "Below-Tier Usher / Soda Stock", short: "STOCK", detail: "Dotted lower storage from sketch", bounds: rect(-5.5, 17.5, 59.5, 63), kind: "storage-lower" },
  { id: "candy-storage", name: "Candy Storage", short: "CANDY", detail: "Bulk concession inventory", bounds: rect(96, 116, 43.5, 56), kind: "storage" },
  { id: "under-storage-3", name: "Under-Seat Storage 3", short: "STORAGE", detail: "Below stadium tiers", bounds: rect(-22.5, -10, 50.5, 57), kind: "storage-lower" },
  { id: "under-storage-6", name: "Under-Seat Storage 6", short: "STORAGE", detail: "Below stadium tiers", bounds: rect(22, 34.5, 44, 50.5), kind: "storage-lower" },
]);

export const EQUIPMENT_ANCHORS = Object.freeze([
  { id: "concession-popper", type: "popper", roomId: "concession-boh", position: [-18.6, 0, 2.1], rotation: Math.PI / 2, footprint: [1.4, 1.1] },
  { id: "concession-soda-1", type: "soda-fountain", roomId: "concession-boh", position: [-18.6, 0, 5.1], rotation: Math.PI / 2, footprint: [1.8, 0.9] },
  { id: "concession-soda-2", type: "soda-fountain", roomId: "concession-boh", position: [-18.6, 0, 7.1], rotation: Math.PI / 2, footprint: [1.8, 0.9] },
  { id: "kitchen-grill", type: "grill", roomId: "kitchen", position: [-19.6, 0, 13.8], rotation: 0, footprint: [1.2, 0.9] },
  { id: "kitchen-fryer", type: "fryer", roomId: "kitchen", position: [-17.9, 0, 13.8], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-turbo-oven", type: "turbo-oven", roomId: "kitchen", position: [-16.2, 0, 13.8], rotation: 0, footprint: [1.1, 1] },
  { id: "bar-well", type: "bar-well", roomId: "bar", position: [-9.2, 0, 14.4], rotation: Math.PI, footprint: [1.5, 0.8] },
]);

export const ALL_ZONES = Object.freeze([
  ...PUBLIC_SPACES,
  ...SERVICE_ROOMS.filter((room) => room.kind !== "storage-lower"),
  ...AUDITORIUMS.map((auditorium) => ({
    id: auditorium.id,
    name: `Theater ${auditorium.number}`,
    detail: `${auditorium.seats} seats${auditorium.number === 3 ? " · TITAN LUXE scale" : ""}`,
    bounds: auditorium.bounds,
    kind: "auditorium",
  })),
]);

export const MAP_BOUNDS = Object.freeze(rect(-32, 128, -9, 73));

export function pointInBounds(x, z, bounds, padding = 0) {
  return x >= bounds.xMin - padding && x <= bounds.xMax + padding && z >= bounds.zMin - padding && z <= bounds.zMax + padding;
}

export function zoneAt(x, z) {
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
