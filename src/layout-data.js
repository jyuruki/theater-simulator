export const EXPECTED_SEAT_TOTAL = 1093;

const rect = (xMin, xMax, zMin, zMax) => ({ xMin, xMax, zMin, zMax });

// V10 preserves V9's stepped hall while shortening its full west-to-east run
// by 15 percent and rigidly re-stationing complete auditorium/service modules.
// toward the entrance as one rigid module. North-side auditorium and service
// geometry remains in its established plan coordinates.
export const FRONT_SHIFT_Z = -2.5;
const shiftedZ = (value) => value + FRONT_SHIFT_Z;
const shiftedRect = (xMin, xMax, zMin, zMax) => rect(xMin, xMax, shiftedZ(zMin), shiftedZ(zMax));

// The wall carrying the two drinking fountains is the exact width transition:
// west of it the hall keeps the former 4.2 m depth; east of it the south edge
// is translated while the north edge remains fixed, producing the wider hall.
export const HALL_PLAN = Object.freeze({
  transitionX: -13.62,
  southZ: 55.5,
  narrowNorthZ: 59.7,
  wideNorthZ: 62.2,
  narrow: rect(-40, -13.62, 55.5, 59.7),
  wide: rect(-13.62, 113, 55.5, 62.2),
  drinkingFountainWall: Object.freeze({ x: -13.62, zMin: 59.7, zMax: 62.2 }),
});

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

const compactTopEntryStadium = Object.freeze({
  ...topEntryStadium,
  screenApronDepth: 2.5,
});

const standardTopEntryStadium = Object.freeze({
  ...topEntryStadium,
  screenApronDepth: 1.85,
});

const bottomEntryStadium = (corridorRise = 0) => ({
  access: "bottom",
  aisles: "dual-side",
  sideAisleWidth: 1.15,
  corridorRise,
});

const COURTYARD_BACK_WALL_Z = 68.2;

// Authoritative relationship for the compact, recessed dark-tile court behind the
// fountain island. The public-space records below remain split so zone lookup
// can distinguish the fountain half from the theater-approach half, but these
// two halves must render as one continuous room with one back-wall plane.
export const COURTYARD_PLAN = Object.freeze({
  id: "fountain-theaters-3-5-courtyard",
  name: "Fountain / Theaters 3–5 Courtyard",
  bounds: rect(-6.82, 18.3, 62.2, COURTYARD_BACK_WALL_Z),
  backWallZ: COURTYARD_BACK_WALL_Z,
  floorFinish: "dark-gray-tile",
  publicSpaceIds: Object.freeze(["soda-service", "recessed-theater-court"]),
  waistPartition: Object.freeze({ x: -3.55, zMin: 62.89, zMax: COURTYARD_BACK_WALL_Z, height: 1.05, thickness: 0.12 }),
  doors: Object.freeze([
    { targetId: "theater-3", center: -5.5, width: 2.4 },
    { targetId: "future-task-room", center: -1.7, width: 2.2 },
    // The rear counter ends at x=12.1; T4 follows immediately, then T5,
    // then the court closes at x=18.3. Do not reintroduce an empty east bay.
    { targetId: "theater-4", center: 13.7, width: 2.4 },
    { targetId: "theater-5", center: 16.8, width: 2.4 },
  ]),
});

export const FOUNTAIN_PLAN = Object.freeze({
  island: rect(-0.5, 12.1, 62.89, 64.31),
  rearCounter: rect(-0.5, 12.1, 67.3, COURTYARD_BACK_WALL_Z),
});

// V9 treats the Theater 3 frontage, MEN entrance sequence, drinking-fountain
// hallway transition, and lower storage as one coordinated block. The bathroom
// and lower storage share a finished boundary without overlapping, while a
// small reveal keeps the facade from terminating directly on the T3 jamb.
export const T3_MEN_PLAN = Object.freeze({
  t3DoorLeftX: -6.7,
  t3DoorRightX: -4.3,
  facadeWallEndX: -6.82,
  doorReveal: Object.freeze({ xMin: -6.82, xMax: -6.7, width: 0.12 }),
  sharedBackWall: Object.freeze({ xMin: -21.62, xMax: -6.82, z: COURTYARD_BACK_WALL_Z }),
  boysMain: rect(-21.62, -6.82, 64.7, COURTYARD_BACK_WALL_Z),
  boysEntryLobe: rect(-9.47, -6.82, 62.2, 64.7),
  fountainNook: rect(-13.62, -11.72, 59.7, 62.2),
  menCubby: rect(-11.72, -9.47, 62.2, 64.7),
  trash: rect(-21.62, -13.62, 59.7, 62.2),
});

export const TICKET_APPROACH_PLAN = Object.freeze({
  bounds: shiftedRect(-0.5, 12.1, 24, 58),
  posterAlcove: shiftedRect(-6.5, -0.5, 52.2, 58),
  emptyAlcove: shiftedRect(12.1, 18.1, 52.2, 58),
});

// Layout data remains in hand-drawn plan space. X increases toward the
// sketch's right; Z runs from the front entrance into the complex. Rendering
// reflects X around the entrance axis so sketch-left is physically left for
// an entering guest without mirroring text or mouse input.
export const AUDITORIUMS = Object.freeze([
  {
    number: 1, id: "theater-1", preset: "compact38", bounds: shiftedRect(-25.5, -16, 45, 58),
    screenSide: "south", seats: 38, rows: [8, 10, 10, 10], stadium: compactTopEntryStadium,
    entry: {
      type: "trash-cubby", center: -23.9, turnSide: "east",
      cubbyBounds: shiftedRect(-25.5, -22.3, 54.4, 58), innerDoorCenter: shiftedZ(55.6),
      sharedBoundarySide: "west", sharedPair: "theaters-1-2",
    },
  },
  {
    number: 2, id: "theater-2", preset: "compact38", bounds: shiftedRect(-35, -25.5, 45, 58),
    screenSide: "south", seats: 38, rows: [8, 10, 10, 10], stadium: compactTopEntryStadium,
    entry: {
      type: "trash-cubby", center: -27.1, turnSide: "west",
      cubbyBounds: shiftedRect(-28.7, -25.5, 54.4, 58), innerDoorCenter: shiftedZ(55.6),
      sharedBoundarySide: "east", sharedPair: "theaters-1-2", sharedWallOwner: true,
    },
  },
  {
    number: 3, id: "theater-3", preset: "large150", bounds: rect(-21.8, -4.3, 72, 99),
    screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20],
    underStorage: true, stadium: { ...bottomEntryStadium(0.24), outerMargin: 0 },
    entry: {
      type: "storage-left-then-left", center: -5.5, routeSide: "east", routeWidth: 2.4,
      directAuditoriumEntry: true, storageId: "under-storage-3",
      courtyardId: COURTYARD_PLAN.id, outerPlaneZ: COURTYARD_BACK_WALL_Z,
      usherNookBounds: rect(-9.9, -6.7, COURTYARD_BACK_WALL_Z, 72),
      routeBounds: rect(-6.7, -4.3, COURTYARD_BACK_WALL_Z, 99), arrivalZ: 94.5,
      ramp: { bounds: rect(-6.7, -4.3, 82.5, 94.5), startHeight: 0, endHeight: 0.24 },
    },
  },
  {
    number: 4, id: "theater-4", preset: "medium58", bounds: rect(-1.5, 10, 75, 90.5),
    screenSide: "north", seats: 58, rows: [8, 10, 10, 10, 10, 10], stadium: bottomEntryStadium(0),
    entry: {
      type: "dogleg", center: 13.7, firstTurn: "west", routeSide: "east", routeWidth: 2.5,
      sharedBoundarySide: "east", sharedPair: "theaters-4-5", sharedWallOwner: true,
      courtyardId: COURTYARD_PLAN.id, outerPlaneZ: COURTYARD_BACK_WALL_Z,
      stemBounds: rect(12.35, 15.05, COURTYARD_BACK_WALL_Z, 70.6),
      lateralBounds: rect(7.5, 15.05, 70.6, 73.1),
      longRouteBounds: rect(7.5, 10, 73.1, 86.9), arrivalZ: 86.4,
    },
  },
  {
    number: 5, id: "theater-5", preset: "medium58", bounds: rect(10, 21.5, 75, 90.5),
    screenSide: "north", seats: 58, rows: [8, 10, 10, 10, 10, 10], stadium: bottomEntryStadium(0),
    entry: {
      type: "dogleg", center: 16.8, firstTurn: "east", routeSide: "east", routeWidth: 2.5,
      sharedBoundarySide: "west", sharedPair: "theaters-4-5",
      courtyardId: COURTYARD_PLAN.id, outerPlaneZ: COURTYARD_BACK_WALL_Z,
      stemBounds: rect(15.45, 18.3, COURTYARD_BACK_WALL_Z, 70.6),
      lateralBounds: rect(15.45, 21.5, 70.6, 73.1),
      longRouteBounds: rect(19, 21.5, 73.1, 86.9), arrivalZ: 86.4,
    },
  },
  {
    number: 6, id: "theater-6", preset: "large150", bounds: rect(29.7, 47.2, 62.2, 89.2),
    screenSide: "north", seats: 148, rows: [14, 16, 18, 20, 20, 20, 20, 20],
    underStorage: true, stadium: bottomEntryStadium(0),
    entry: {
      type: "right-then-left", center: 31.2, routeSide: "east", routeWidth: 2.5, storageId: "under-storage-6",
      vestibuleBounds: rect(29.7, 32.55, 62.2, 65.5),
      transverseBounds: rect(29.7, 47.2, 65.5, 68.5),
      longRouteBounds: rect(44.7, 47.2, 68.5, 85.5), arrivalZ: 84.7,
    },
  },
  {
    number: 7, id: "theater-7", preset: "large150", bounds: rect(64.5, 82, 62.2, 89.2),
    screenSide: "north", seats: 153, rows: [15, 18, 20, 20, 20, 20, 20, 20],
    stadium: bottomEntryStadium(0.24),
    entry: {
      type: "straight-side", center: 65.8, routeSide: "west", arrivalZ: 84.7,
      usherNookBounds: rect(67, 70, 62.2, 66.5),
      ramp: { bounds: rect(64.5, 67, 66.5, 84.7), startHeight: 0, endHeight: 0.24 },
    },
  },
  {
    number: 8, id: "theater-8", preset: "large150", bounds: rect(83, 100.5, 62.2, 89.2),
    screenSide: "north", seats: 152, rows: [14, 18, 20, 20, 20, 20, 20, 20],
    stadium: bottomEntryStadium(0.24),
    entry: {
      type: "straight-side", center: 84.3, routeSide: "west", arrivalZ: 84.7,
      usherNookBounds: rect(85.5, 88.5, 62.2, 66.5),
      ramp: { bounds: rect(83, 85.5, 66.5, 84.7), startHeight: 0, endHeight: 0.24 },
    },
  },
  {
    number: 9, id: "theater-9", preset: "standard50", bounds: shiftedRect(99.6, 110.1, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: standardTopEntryStadium,
    entry: { type: "trash-cubby", center: 102.7, turnSide: "east", cubbyDepth: 3.4, innerDoorCenter: shiftedZ(55.75) },
  },
  {
    number: 10, id: "theater-10", preset: "standard50", bounds: shiftedRect(78.5, 89, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: standardTopEntryStadium,
    entry: { type: "trash-cubby", center: 80.6, turnSide: "east", cubbyDepth: 3.4, innerDoorCenter: shiftedZ(55.75) },
  },
  {
    number: 11, id: "theater-11", preset: "standard50", bounds: shiftedRect(67, 77.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: standardTopEntryStadium,
    entry: { type: "trash-cubby", center: 69.1, turnSide: "east", cubbyDepth: 3.4, innerDoorCenter: shiftedZ(55.75) },
  },
  {
    number: 12, id: "theater-12", preset: "standard50", bounds: shiftedRect(55.5, 66, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: standardTopEntryStadium,
    entry: { type: "trash-cubby", center: 57.6, turnSide: "east", cubbyDepth: 3.4, innerDoorCenter: shiftedZ(55.75) },
  },
  {
    number: 13, id: "theater-13", preset: "standard50", bounds: shiftedRect(28.5, 39, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: standardTopEntryStadium,
    entry: {
      type: "trash-cubby", center: 30.1, turnSide: "east",
      cubbyBounds: shiftedRect(28.5, 31.7, 54.6, 58), innerDoorCenter: shiftedZ(55.75),
      sharedBoundarySide: "west", sharedPair: "theaters-13-14",
    },
  },
  {
    number: 14, id: "theater-14", preset: "standard50", bounds: shiftedRect(18, 28.5, 44.5, 58),
    screenSide: "south", seats: 50, rows: [10, 10, 10, 10, 10], stadium: standardTopEntryStadium,
    entry: {
      type: "trash-cubby", center: 26.9, turnSide: "west",
      cubbyBounds: shiftedRect(25.3, 28.5, 54.6, 58), innerDoorCenter: shiftedZ(55.75),
      sharedBoundarySide: "east", sharedPair: "theaters-13-14", sharedWallOwner: true,
    },
  },
]);

export const PUBLIC_SPACES = Object.freeze([
  { id: "front-walk", name: "Front Walk", detail: "Public entrance", bounds: shiftedRect(-27, 29, -10, 0), kind: "exterior" },
  { id: "lobby", name: "Main Lobby", detail: "Concessions, bar, box office, kiosks, and guest gathering", bounds: shiftedRect(-24.5, 23, 0, 27), kind: "lobby" },
  { id: "lobby-approach", name: "Carpeted Lobby Hall", detail: "Narrow guest route, approximately the fountain-counter width", bounds: TICKET_APPROACH_PLAN.bounds, kind: "corridor" },
  { id: "ticket-check", name: "Ticket Check", detail: "Guest entry checkpoint with two 90-degree side pockets", bounds: shiftedRect(0.5, 11.1, 52.2, 58), kind: "ticket" },
  { id: "ticket-poster-alcove", name: "Poster Alcove", detail: "Open 90-degree pocket at ticket check", bounds: TICKET_APPROACH_PLAN.posterAlcove, kind: "corridor" },
  { id: "ticket-empty-alcove", name: "Ticket Alcove", detail: "Open 90-degree pocket at ticket check", bounds: TICKET_APPROACH_PLAN.emptyAlcove, kind: "corridor" },
  {
    id: "main-corridor", name: "Main Theater Hall", detail: "Stepped-width auditorium corridor: existing-width west wing and widened east wing",
    bounds: rect(HALL_PLAN.narrow.xMin, HALL_PLAN.wide.xMax, HALL_PLAN.southZ, HALL_PLAN.wideNorthZ),
    footprintRects: Object.freeze([HALL_PLAN.narrow, HALL_PLAN.wide]), kind: "corridor",
  },
  { id: "boys-fountain-alcove", name: "Water-Fountain Transition", detail: "Hall apron beside the width-transition wall carrying two drinking fountains", bounds: T3_MEN_PLAN.fountainNook, kind: "corridor" },
  { id: "boys-men-entry-cubby", name: "MEN Entry Cubby", detail: "Distinct recessed MEN entrance between the fountain nook and privacy lobe", bounds: T3_MEN_PLAN.menCubby, kind: "corridor" },
  { id: "soda-service", name: "Self-Serve Fountain Court", detail: "Dark-gray-tile courtyard with soda, ICEE, lids, straws, and cup service", bounds: rect(-6.82, 12.1, 62.2, COURTYARD_BACK_WALL_Z), kind: "soda-service", courtyardId: COURTYARD_PLAN.id, floorFinish: COURTYARD_PLAN.floorFinish },
  { id: "recessed-theater-court", name: "Theaters 3–5 Court", detail: "Compact dark-gray-tile court: counter, T4, T5, wall", bounds: rect(12.1, 18.3, 62.2, COURTYARD_BACK_WALL_Z), kind: "corridor", courtyardId: COURTYARD_PLAN.id, floorFinish: COURTYARD_PLAN.floorFinish },
]);

export const SERVICE_ROOMS = Object.freeze([
  { id: "office-overflow", name: "Office Overflow / Candy", short: "STOCK", detail: "Interim excess-candy room before the manager office", bounds: shiftedRect(-36.5, -24.5, 0.4, 3.8), kind: "storage", entrySide: "east", doorCenter: shiftedZ(2.7), extraDoors: [{ side: "north", center: -34.7 }] },
  { id: "office", name: "Manager Office", short: "OFF", detail: "Back-office operations behind the overflow room", bounds: shiftedRect(-36.5, -24.5, 3.8, 7), kind: "office", entrySide: "south", doorCenter: -34.7 },
  { id: "kitchen-storage", name: "Kitchen Storage", short: "KS", detail: "Dry, refrigerated, and service stock connected directly to the hot line through the diagonal partition", bounds: shiftedRect(-37, -29, 7, 24), kind: "storage", entrySide: "east", doorCenter: shiftedZ(10.35), connections: Object.freeze(["kitchen"]) },
  { id: "concession-boh", name: "Concession Backline", short: "C", detail: "Irregular preparation area behind the bent customer counter", bounds: shiftedRect(-29, -8.6, 4.9, 24), kind: "concession" },
  { id: "kitchen", name: "Kitchen Hot Line", short: "K", detail: "Fryers, grill, and turbo-oven line", bounds: shiftedRect(-29, -17.8, 17, 24), kind: "kitchen" },
  { id: "bar", name: "Lobby Bar", short: "B", detail: "Horizontal guest bar and back-bar worktop", bounds: shiftedRect(-16.1, -8.6, 20.4, 24), kind: "bar" },
  { id: "box-office", name: "Box Office", short: "BOX", detail: "Freestanding L-shaped ticket counter", bounds: shiftedRect(9.2, 15.5, 6.9, 14.4), kind: "office" },
  { id: "electrical-room", name: "Electrical Room", short: "ELEC", detail: "Closed service room behind the former provisional restroom door", bounds: shiftedRect(12.1, 17.7, 34, 43), kind: "electrical", entrySide: "west", doorCenter: shiftedZ(39), closed: true },
  { id: "future-upstairs-stair", name: "Future Upstairs Stair", short: "STAIR", detail: "Closed future staircase entered from the left wall of Theater 6's short vestibule", bounds: rect(25, 29.7, 62.2, 68.5), kind: "electrical", entrySide: "east", doorCenter: 63.25, doorWidth: 1.8, closed: true },
  { id: "trash-room", name: "Trash Room", short: "TRASH", detail: "Waste and cleaning support; the door is at the right end and the room opens left", bounds: T3_MEN_PLAN.trash, kind: "trash", entrySide: "south", doorCenter: -14.77, doorPlacement: "right", opensToward: "west" },
  {
    id: "boys-restroom", name: "Men's Restroom", short: "BB",
    detail: "Southeast privacy lobe, left-left path, nine stalls, six urinals, and one long sink",
    bounds: rect(-21.62, -6.82, 62.2, COURTYARD_BACK_WALL_Z), kind: "restroom",
    footprintRects: Object.freeze([
      T3_MEN_PLAN.boysMain,
      T3_MEN_PLAN.boysEntryLobe,
    ]),
    entry: { side: "west", coordinate: -9.47, center: 63.45, width: 1.9 },
    privacyTurn: "west", pathTurns: Object.freeze(["left", "left"]),
    fixtures: Object.freeze({
      stalls: Object.freeze([{ side: "south", count: 9, start: -21.17, end: -11.87, depth: 1.15 }]),
      urinals: Object.freeze([{ side: "north", count: 6, start: -20.87, end: -15.97 }]),
      sinks: Object.freeze([{ side: "north", count: 1, start: -14.82, end: -7.77, trough: true }]),
    }),
  },
  {
    id: "girls-restroom", name: "Women's Restroom", short: "GB",
    detail: "Concave privacy entrance, fourteen stalls, and three sinks",
    bounds: rect(48, 63.8, 62.2, 74), kind: "restroom",
    footprintRects: Object.freeze([
      rect(48, 63.8, 65.5, 74),
      rect(48, 52.3, 62.2, 65.5),
      rect(52.3, 54.8, 62.2, 65.5),
      rect(54.8, 57.3, 62.2, 65.5),
    ]),
    entry: { side: "west", coordinate: 54.8, center: 63.85, width: 2.05 },
    fixtures: Object.freeze({
      stalls: Object.freeze([
        { side: "north", count: 6, start: 54.5, end: 63.5, depth: 2.0 },
        { side: "south", count: 6, start: 54.5, end: 63.5, depth: 2.0 },
        { side: "south-lobe", count: 2, start: 48.15, end: 52.15, depth: 2.0 },
      ]),
      sinks: Object.freeze([{ side: "north", count: 3, start: 48.5, end: 52.8 }]),
    }),
  },
  { id: "future-task-room", name: "Future Task Room", short: "TASK", detail: "Empty gameplay room directly behind the fountain counters on the shared courtyard door plane", bounds: rect(-3.2, 7.3, COURTYARD_BACK_WALL_Z, 74.8), kind: "storage", entrySide: "south", doorCenter: -1.7, courtyardId: COURTYARD_PLAN.id },
  { id: "candy-storage", name: "Candy Storage", short: "CANDY", detail: "Wide, shallow bulk-candy room with one left-side hall door", bounds: rect(101, 111, 62.2, 67.2), kind: "storage", entrySide: "south", doorCenter: 102.7 },
  { id: "under-storage-3", name: "Under-Seat Storage 3", short: "U/S 3", detail: "One-door horizontal anteroom leading to a two-door under-tier room", bounds: rect(-21.5, -9.9, 72, 82.5), kind: "storage-lower", orientation: "horizontal", ceilingHeight: 2.32, doorSide: "south", doorCenters: [-18.6, -12.3], accessHall: rect(-21.5, -9.9, 68.2, 72), outerDoorSide: "east", outerDoorCenter: 70.1 },
  { id: "under-storage-6", name: "Under-Seat Storage 6", short: "U/S 6", detail: "Shared two-door room below Theater 6's upper tiers", bounds: rect(31.7, 44.7, 68.5, 71.8), kind: "storage-lower", ceilingHeight: 2.32, doorSide: "south", doorCenters: [35.2, 41.7] },
]);

export const LOBBY_PLAN = Object.freeze({
  envelope: shiftedRect(-37, 23, 0, 24),
  frontDoorCenters: [-10.8, -2.2, 8.7],
  customerCounter: [
    { x: -8.8, z: shiftedZ(20.4) },
    { x: -16.1, z: shiftedZ(20.4) },
    { x: -16.8, z: shiftedZ(17.8) },
    { x: -20.5, z: shiftedZ(8.2) },
    { x: -20.1, z: shiftedZ(4.9) },
  ],
  backBar: shiftedRect(-16.1, -8.6, 23.05, 24),
  hotLine: shiftedRect(-28.8, -17.8, 23.05, 24),
  kitchenPartition: [
    { x: -29, z: shiftedZ(23.5) }, { x: -29, z: shiftedZ(19.6) }, { x: -27.3, z: shiftedZ(17.3) },
    { x: -24.4, z: shiftedZ(17.1) }, { x: -24.6, z: shiftedZ(15.5) }, { x: -24.5, z: shiftedZ(11.1) },
    { x: -24.5, z: shiftedZ(9.6) }, { x: -24.5, z: shiftedZ(7) },
  ],
  serviceDoor: { x: -24.5, z: shiftedZ(10.35) },
  kitchenStorageDoor: {
    x: -28.15, z: shiftedZ(18.45), width: 1.5,
    wall: "diagonal", partitionSegment: 1, segmentT: 0.5,
    connects: Object.freeze(["kitchen-storage", "kitchen"]),
  },
  futureStairs: shiftedRect(15.9, 22, 8.2, 24),
  boxOfficeVertical: shiftedRect(9.2, 10.3, 6.9, 14.4),
  boxOfficeReturn: shiftedRect(9.2, 15.5, 6.9, 8),
  kiosks: [
    { id: "ticket-kiosk-1", position: [21.4, 0, shiftedZ(3.3)], rotation: Math.PI / 2 },
    { id: "ticket-kiosk-2", position: [21.4, 0, shiftedZ(5.3)], rotation: Math.PI / 2 },
  ],
  officePath: ["lobby", "office-overflow", "office"],
});

export const EQUIPMENT_ANCHORS = Object.freeze([
  { id: "concession-popper-1", type: "popper", roomId: "concession-boh", position: [-23.5, 0, shiftedZ(14.5)], rotation: 0.34, footprint: [1.35, 0.9] },
  { id: "concession-popper-2", type: "popper", roomId: "concession-boh", position: [-23.2, 0, shiftedZ(13.0)], rotation: 0.34, footprint: [1.35, 0.9] },
  { id: "kitchen-grill", type: "grill", roomId: "kitchen", position: [-27.5, 0, shiftedZ(22.7)], rotation: 0, footprint: [1.35, 0.9] },
  { id: "kitchen-fryer-1", type: "fryer", roomId: "kitchen", position: [-25.7, 0, shiftedZ(22.7)], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-fryer-2", type: "fryer", roomId: "kitchen", position: [-24.3, 0, shiftedZ(22.7)], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-turbo-oven", type: "turbo-oven", roomId: "kitchen", position: [-22.5, 0, shiftedZ(22.7)], rotation: 0, footprint: [1.15, 0.95] },
  { id: "bar-well", type: "bar-well", roomId: "bar", position: [-12.3, 0, shiftedZ(22.7)], rotation: Math.PI, footprint: [1.5, 0.8] },
  { id: "soda-icee-left", type: "icee-fountain", roomId: "soda-service", position: [1.1, 0, 63.6], rotation: 0, footprint: [1.5, 0.95] },
  { id: "soda-fountain-1", type: "soda-fountain", roomId: "soda-service", position: [3.3, 0, 63.6], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-fountain-2", type: "soda-fountain", roomId: "soda-service", position: [7.8, 0, 63.6], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-icee-right", type: "icee-fountain", roomId: "soda-service", position: [10.5, 0, 63.6], rotation: 0, footprint: [1.5, 0.95] },
  { id: "boys-water-fountain-1", type: "drinking-fountain", roomId: "boys-fountain-alcove", position: [-13.36, 0, shiftedZ(63.03)], rotation: -Math.PI / 2, footprint: [0.65, 0.42] },
  { id: "boys-water-fountain-2", type: "drinking-fountain", roomId: "boys-fountain-alcove", position: [-13.36, 0, shiftedZ(63.83)], rotation: -Math.PI / 2, footprint: [0.65, 0.42] },
]);

export const POS_STATIONS = Object.freeze([
  [-17.3, shiftedZ(16.8)], [-17.9, shiftedZ(15.0)], [-18.5, shiftedZ(13.3)],
  [-19.2, shiftedZ(11.5)], [-19.8, shiftedZ(9.7)], [-20.3, shiftedZ(8.0)],
].map(([x, z], index) => ({
  id: `concession-pos-${index + 1}`,
  position: [x, 0, z],
  rotation: 0.37,
  counterSegment: "diagonal-pos-run",
})));

export const HALL_END_EXITS = Object.freeze([
  { id: "hall-west-exit", side: "west", x: -40, z: 57.6, segment: "narrow" },
  { id: "hall-east-exit", side: "east", x: 113, z: 58.85, segment: "wide" },
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

export const MAP_BOUNDS = Object.freeze(rect(-41, 114, shiftedZ(-10), 99));
export const PLAYER_SPAWN_PLAN = Object.freeze({ x: 1.5, y: 0, z: shiftedZ(-6.8) });

export const AUDITORIUM_ENTRY_ZONES = Object.freeze([
  { id: "theater-3-entry", name: "Theater 3 Entrance", detail: "Shared courtyard door · horizontal under-tier storage left · straight gentle incline into the bowl", bounds: rect(-21.5, -4.3, COURTYARD_BACK_WALL_Z, 99) },
  { id: "theater-4-entry", name: "Theater 4 Vestibule", detail: "Compact court door · left dogleg · east-side aisle", bounds: rect(7.5, 15.05, 68.2, 75) },
  { id: "theater-5-entry", name: "Theater 5 Vestibule", detail: "Wall-side court door · right dogleg · east-side aisle", bounds: rect(15.45, 21.5, 68.2, 75) },
]);

export function pointInBounds(x, z, bounds, padding = 0) {
  return x >= bounds.xMin - padding && x <= bounds.xMax + padding
    && z >= bounds.zMin - padding && z <= bounds.zMax + padding;
}

function pointInZone(x, z, zone) {
  return zone.footprintRects
    ? zone.footprintRects.some((bounds) => pointInBounds(x, z, bounds))
    : pointInBounds(x, z, zone.bounds);
}

export function zoneAt(x, z) {
  for (let index = AUDITORIUM_ENTRY_ZONES.length - 1; index >= 0; index -= 1) {
    if (pointInZone(x, z, AUDITORIUM_ENTRY_ZONES[index])) return AUDITORIUM_ENTRY_ZONES[index];
  }
  for (let index = ALL_ZONES.length - 1; index >= 0; index -= 1) {
    if (pointInZone(x, z, ALL_ZONES[index])) return ALL_ZONES[index];
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
  const boysFootprints = boys?.footprintRects ?? (boys ? [boys.bounds] : []);
  if (trash && boysFootprints.some((footprint) => trash.bounds.xMin < footprint.xMax && trash.bounds.xMax > footprint.xMin
    && trash.bounds.zMin < footprint.zMax && trash.bounds.zMax > footprint.zMin)) {
    errors.push("The boys restroom and trash room must not overlap.");
  }
  if (LOBBY_PLAN.kitchenStorageDoor.wall !== "diagonal" || LOBBY_PLAN.kitchenStorageDoor.partitionSegment !== 1) {
    errors.push("Kitchen storage must connect to the kitchen through the diagonal partition.");
  }
  if (EQUIPMENT_ANCHORS.filter(({ type }) => type === "drinking-fountain").length !== 2) {
    errors.push("Two drinking fountains are required outside the boys restroom.");
  }

  const hall = PUBLIC_SPACES.find(({ id }) => id === "main-corridor");
  if (FRONT_SHIFT_Z !== -2.5) errors.push("The V10 front module must preserve V9's -2.5 m rigid translation.");
  if (hall?.footprintRects?.length !== 2
    || hall.footprintRects[0] !== HALL_PLAN.narrow
    || hall.footprintRects[1] !== HALL_PLAN.wide) {
    errors.push("The main hall must use the authoritative narrow/wide footprint union.");
  }
  if (Math.abs((HALL_PLAN.narrow.zMax - HALL_PLAN.narrow.zMin) - 4.2) > 1e-9
    || Math.abs((HALL_PLAN.wide.zMax - HALL_PLAN.wide.zMin) - 6.7) > 1e-9
    || HALL_PLAN.narrow.xMax !== HALL_PLAN.transitionX
    || HALL_PLAN.wide.xMin !== HALL_PLAN.transitionX) {
    errors.push("The drinking-fountain wall must remain the exact V10 hallway-width transition.");
  }
  if (Math.abs((HALL_PLAN.wide.xMax - HALL_PLAN.narrow.xMin) - 153) > 1e-9) {
    errors.push("V10 must shorten the 180 m auditorium hall by exactly 15 percent.");
  }
  if (T3_MEN_PLAN.fountainNook.xMin !== HALL_PLAN.drinkingFountainWall.x
    || T3_MEN_PLAN.fountainNook.zMin !== HALL_PLAN.drinkingFountainWall.zMin
    || T3_MEN_PLAN.fountainNook.zMax !== HALL_PLAN.drinkingFountainWall.zMax) {
    errors.push("The drinking-fountain apron must align with the hallway transition wall.");
  }
  if (Math.abs((T3_MEN_PLAN.menCubby.xMax - T3_MEN_PLAN.menCubby.xMin) - 2.25) > 1e-9) {
    errors.push("The MEN entry cubby must be 50 percent wider than its former 1.5 m width.");
  }
  if (trash?.bounds.xMax !== HALL_PLAN.transitionX
    || trash?.bounds.zMin !== HALL_PLAN.narrowNorthZ
    || trash?.bounds.zMax !== HALL_PLAN.wideNorthZ) {
    errors.push("The shifted trash room must terminate at and own the drinking-fountain transition wall.");
  }

  const theater3 = auditoriumById.get("theater-3");
  if (!theater3?.entry?.directAuditoriumEntry
    || theater3.entry.routeBounds.xMax !== theater3.bounds.xMax
    || theater3.entry.routeBounds.zMax !== theater3.bounds.zMax) {
    errors.push("Theater 3's route must continue straight into its east-side auditorium reserve.");
  }
  if (T3_MEN_PLAN.doorReveal.xMin !== T3_MEN_PLAN.facadeWallEndX
    || T3_MEN_PLAN.doorReveal.xMax !== T3_MEN_PLAN.t3DoorLeftX
    || Math.abs(T3_MEN_PLAN.doorReveal.width - 0.12) > 1e-9) {
    errors.push("The Theater 3 left jamb needs the explicit 0.12 m facade reveal.");
  }

  const sequence = [
    Math.max(auditoriumById.get("theater-14")?.entry.center ?? -Infinity,
      auditoriumById.get("theater-13")?.entry.center ?? -Infinity,
      auditoriumById.get("theater-6")?.entry.center ?? -Infinity),
    serviceRoomById.get("girls-restroom")?.entry.coordinate,
    auditoriumById.get("theater-12")?.entry.center,
    auditoriumById.get("theater-7")?.entry.center,
    auditoriumById.get("theater-11")?.entry.center,
    auditoriumById.get("theater-10")?.entry.center,
    auditoriumById.get("theater-8")?.entry.center,
    Math.max(auditoriumById.get("theater-9")?.entry.center ?? -Infinity,
      serviceRoomById.get("candy-storage")?.doorCenter ?? -Infinity),
  ];
  if (sequence.some((station, index) => index > 0 && !(station > sequence[index - 1]))) {
    errors.push("The V10 hall encounter order must be 14/13/6, GB, 12, 7, 11, 10, 8, then 9/candy.");
  }
  const futureUpstairs = serviceRoomById.get("future-upstairs-stair");
  const theater6 = auditoriumById.get("theater-6");
  if (futureUpstairs?.entrySide !== "east"
    || futureUpstairs.bounds.xMax !== theater6?.bounds.xMin
    || futureUpstairs.doorCenter < theater6.entry.vestibuleBounds.zMin
    || futureUpstairs.doorCenter > theater6.entry.vestibuleBounds.zMax) {
    errors.push("The future-upstairs door must occupy Theater 6's west vestibule wall.");
  }

  return { valid: errors.length === 0, errors, auditoriumCount: AUDITORIUMS.length, seatTotal };
}
