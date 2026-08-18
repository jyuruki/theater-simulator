export const EXPECTED_SEAT_TOTAL = 1093;

const rect = (xMin, xMax, zMin, zMax) => ({ xMin, xMax, zMin, zMax });

// V10 preserves V9's stepped hall while shortening its full west-to-east run
// by 15 percent and rigidly re-stationing complete auditorium/service modules.
// V11 retains that Z translation and moves only the complete front lobby module
// to plan-right so the customer-bar end aligns with the ticket approach.
// V12 closes the concession volume with an attached mural soffit, realigns the
// kitchen back wall, and authors the photographed counter/service cadence.
// V13 keeps those authored fixtures while tightening the stair / box-office
// side of the lobby and moving the fountain island deeper into its court.
// V14 restores V12's kitchen partition and connector nook, limits the sealed
// floor mismatch to its genuinely tiny triangular wedge, and fixes the mural
// to the literal door-left-to-back-bar line with a continuous low roof and a
// dense exposed-mechanical field overhead.
export const FRONT_SHIFT_Z = -2.5;
export const LOBBY_SHIFT_X = 8.3;
const shiftedZ = (value) => value + FRONT_SHIFT_Z;
const shiftedRect = (xMin, xMax, zMin, zMax) => rect(xMin, xMax, shiftedZ(zMin), shiftedZ(zMax));
const shiftedLobbyX = (value) => value + LOBBY_SHIFT_X;
const shiftedLobbyRect = (xMin, xMax, zMin, zMax) => rect(
  shiftedLobbyX(xMin),
  shiftedLobbyX(xMax),
  shiftedZ(zMin),
  shiftedZ(zMax),
);

const LOBBY_ENVELOPE_WEST_X = shiftedLobbyX(-37);
const LOBBY_EAST_X = 19.81;
const FRONT_WALK_WEST_X = shiftedLobbyX(-27);
const FRONT_WALK_EAST_X = LOBBY_EAST_X + 6;
const TICKET_APPROACH_EAST_X = 12.1;
const STAIR_APPROACH_REVEAL = 0.61;
const STAIR_WEST_X = TICKET_APPROACH_EAST_X + STAIR_APPROACH_REVEAL;
const STAIR_EAST_X = STAIR_WEST_X + 6.1;
const STAIR_SOUTH_Z = 5.1;
const LOBBY_BACK_Z = shiftedZ(24);
const BOX_OFFICE_RETURN_LENGTH = (shiftedLobbyX(15.5) - shiftedLobbyX(9.2)) / 2;
const BOX_OFFICE_RETURN_DEPTH = 0.7;
const BOX_OFFICE_RETURN_X_MAX = STAIR_WEST_X;
const BOX_OFFICE_RETURN_X_MIN = BOX_OFFICE_RETURN_X_MAX - BOX_OFFICE_RETURN_LENGTH;
const BOX_OFFICE_RETURN_Z_MIN = shiftedZ(6.9);
const BOX_OFFICE_RETURN_Z_MAX = BOX_OFFICE_RETURN_Z_MIN + BOX_OFFICE_RETURN_DEPTH;
const BOX_OFFICE_VERTICAL_WIDTH = 1.1;
const BOX_OFFICE_VERTICAL_X_MIN = BOX_OFFICE_RETURN_X_MIN;
const BOX_OFFICE_VERTICAL_X_MAX = BOX_OFFICE_VERTICAL_X_MIN + BOX_OFFICE_VERTICAL_WIDTH;
const BOX_OFFICE_VERTICAL_Z_MAX = shiftedZ(14.4);
// Moving the island +0.59 m puts its back edge on the 64.9 m trash-can line
// without crowding the fixed rear counter.
const FOUNTAIN_ISLAND_CENTER_Z = 64.19;
const FOUNTAIN_ISLAND_HALF_DEPTH = (64.31 - 62.89) / 2;

export const LOBBY_CEILING_PLAN = Object.freeze({
  baseHeight: 4.6,
  multiplier: 3,
  highHeight: 13.8,
  // Only the stone-floor front lobby rises into the exposed-volume ceiling.
  // The ticket approach, main hall, and fountain / T3-5 court all share the
  // retained 4.6 m ceiling datum.
  highPublicSpaceIds: Object.freeze(["lobby"]),
  lowServiceRoomIds: Object.freeze([
    "office-overflow",
    "office",
    "kitchen-storage",
    "kitchen",
  ]),
});

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
  waistPartition: Object.freeze({
    x: -3.55,
    zMin: FOUNTAIN_ISLAND_CENTER_Z - FOUNTAIN_ISLAND_HALF_DEPTH,
    zMax: COURTYARD_BACK_WALL_Z,
    height: 1.05,
    thickness: 0.12,
  }),
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
  island: rect(
    -0.5,
    12.1,
    FOUNTAIN_ISLAND_CENTER_Z - FOUNTAIN_ISLAND_HALF_DEPTH,
    FOUNTAIN_ISLAND_CENTER_Z + FOUNTAIN_ISLAND_HALF_DEPTH,
  ),
  rearCounter: rect(-0.5, 12.1, 67.3, COURTYARD_BACK_WALL_Z),
  shiftZ: 0.59,
  centerZ: FOUNTAIN_ISLAND_CENTER_Z,
  rearPassage: 67.3 - (FOUNTAIN_ISLAND_CENTER_Z + FOUNTAIN_ISLAND_HALF_DEPTH),
  pillars: Object.freeze([
    Object.freeze({
      id: "fountain-island-west-pillar",
      position: Object.freeze([-2.03, 0, FOUNTAIN_ISLAND_CENTER_Z]),
      footprint: Object.freeze([0.7, 0.7]),
      height: LOBBY_CEILING_PLAN.baseHeight,
      finish: "white",
    }),
    Object.freeze({
      id: "fountain-island-east-pillar",
      position: Object.freeze([13.63, 0, FOUNTAIN_ISLAND_CENTER_Z]),
      footprint: Object.freeze([0.7, 0.7]),
      height: LOBBY_CEILING_PLAN.baseHeight,
      finish: "white",
    }),
  ]),
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
  { id: "front-walk", name: "Front Walk", detail: "Public entrance", bounds: rect(FRONT_WALK_WEST_X, FRONT_WALK_EAST_X, shiftedZ(-10), shiftedZ(0)), kind: "exterior" },
  { id: "lobby", name: "Main Lobby", detail: "Concessions, bar, box office, kiosks, and guest gathering", bounds: rect(shiftedLobbyX(-24.5), LOBBY_EAST_X, shiftedZ(0), shiftedZ(27)), kind: "lobby" },
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
  { id: "office-overflow", name: "Office Overflow / Candy", short: "STOCK", detail: "Interim excess-candy room before the manager office", bounds: shiftedLobbyRect(-36.5, -24.5, 0.4, 3.8), kind: "storage", entrySide: "east", doorCenter: shiftedZ(2.7), extraDoors: [{ side: "north", center: shiftedLobbyX(-34.7) }] },
  { id: "office", name: "Manager Office", short: "OFF", detail: "Back-office operations behind the overflow room", bounds: shiftedLobbyRect(-36.5, -24.5, 3.8, 7), kind: "office", entrySide: "south", doorCenter: shiftedLobbyX(-34.7) },
  { id: "kitchen-storage", name: "Kitchen Storage", short: "KS", detail: "Dry, refrigerated, and service stock connected directly to the hot line through the diagonal partition", bounds: shiftedLobbyRect(-37, -29, 7, 24), kind: "storage", entrySide: "east", doorCenter: shiftedZ(10.35), connections: Object.freeze(["kitchen"]) },
  { id: "concession-boh", name: "Concession Backline", short: "C", detail: "Irregular preparation area behind the bent customer counter", bounds: shiftedLobbyRect(-29, -8.6, 4.9, 24), kind: "concession" },
  { id: "kitchen", name: "Kitchen Hot Line", short: "K", detail: "Fryers, grill, and turbo-oven line", bounds: shiftedLobbyRect(-29, -17.8, 17, 24), kind: "kitchen" },
  { id: "bar", name: "Lobby Bar", short: "B", detail: "Horizontal guest bar and back-bar worktop", bounds: shiftedLobbyRect(-16.1, -8.6, 20.4, 24), kind: "bar" },
  {
    id: "box-office", name: "Box Office", short: "BOX",
    detail: "Compact L-shaped ticket counter with a clear view down the ticket hall",
    bounds: rect(BOX_OFFICE_VERTICAL_X_MIN, BOX_OFFICE_RETURN_X_MAX, BOX_OFFICE_RETURN_Z_MIN, BOX_OFFICE_VERTICAL_Z_MAX),
    kind: "office",
  },
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

const CUSTOMER_COUNTER = Object.freeze([
  { x: shiftedLobbyX(-8.8), z: shiftedZ(20.4) },
  { x: shiftedLobbyX(-16.1), z: shiftedZ(20.4) },
  { x: shiftedLobbyX(-16.8), z: shiftedZ(17.8) },
  { x: shiftedLobbyX(-20.5), z: shiftedZ(8.2) },
  { x: shiftedLobbyX(-20.1), z: shiftedZ(4.9) },
].map((point) => Object.freeze(point)));

// After the public kitchen door, the back wall follows the concession face
// for exactly two-thirds of its diagonal run. The midpoint preserves the
// existing eight-vertex representation while both halves remain collinear.
const KITCHEN_PARTITION = Object.freeze([
  { x: shiftedLobbyX(-29), z: shiftedZ(23.5) },
  { x: shiftedLobbyX(-29), z: shiftedZ(19.6) },
  { x: shiftedLobbyX(-27.3), z: shiftedZ(17.3) },
  { x: shiftedLobbyX(-22.03333333333333), z: shiftedZ(17.5) },
  { x: shiftedLobbyX(-23.26666666666667), z: shiftedZ(14.3) },
  { x: shiftedLobbyX(-24.5), z: shiftedZ(11.1) },
  { x: shiftedLobbyX(-24.5), z: shiftedZ(9.6) },
  { x: shiftedLobbyX(-24.5), z: shiftedZ(7) },
].map((point) => Object.freeze(point)));

const concessionRunStart = CUSTOMER_COUNTER[2];
const concessionRunEnd = CUSTOMER_COUNTER[3];
const concessionRunDx = concessionRunEnd.x - concessionRunStart.x;
const concessionRunDz = concessionRunEnd.z - concessionRunStart.z;
const concessionRunLength = Math.hypot(concessionRunDx, concessionRunDz);
const concessionGuestNormal = Object.freeze({
  x: -concessionRunDz / concessionRunLength,
  z: concessionRunDx / concessionRunLength,
});
const concessionRunRotation = Math.atan2(-concessionRunDx, -concessionRunDz);
// Fixture models use local X as their visible width. Rotate those fixtures a
// quarter turn from the POS orientation so their width follows the counter
// run and their depth faces the guest/back wall instead of becoming a fin.
// Use the -90° equivalent so local +Z points toward the staff/back wall;
// candy glass and contents authored at local -Z then face the guests.
const concessionFixtureRotation = concessionRunRotation - Math.PI / 2;
const CONCESSION_RUN = Object.freeze({
  start: concessionRunStart,
  end: concessionRunEnd,
  length: concessionRunLength,
  rotation: concessionRunRotation,
  fixtureRotation: concessionFixtureRotation,
  guestNormal: concessionGuestNormal,
});

const CUSTOMER_COUNTER_SECTIONS = Object.freeze([
  Object.freeze({
    id: "customer-counter-bar", segmentIndex: 0, role: "bar",
    baseMaterialKey: "wood", topMaterialKey: "counterStone",
  }),
  Object.freeze({
    id: "customer-counter-white-service", segmentIndex: 1, role: "service-white",
    baseMaterialKey: "counterWhite", topMaterialKey: "counterStone",
  }),
  Object.freeze({
    id: "customer-counter-concession", segmentIndex: 2, role: "concession",
    baseMaterialKey: "concessionBlue", topMaterialKey: "counterStone",
  }),
  Object.freeze({
    id: "customer-counter-expo", segmentIndex: 3, role: "expo",
    baseMaterialKey: "counterWhite", topMaterialKey: "counterStone",
  }),
]);

const BACK_BAR_BOUNDS = shiftedLobbyRect(-16.1, -8.6, 23.05, 24);
const KITCHEN_CEILING_BOUNDS = shiftedLobbyRect(-29, -17.8, 17, 24);
const MURAL_FASCIA_DEPTH = 0.7;
const MURAL_ARTWORK_WIDTH = concessionRunLength - MURAL_FASCIA_DEPTH;
const MURAL_ARTWORK_HEIGHT = 4.3;
const MURAL_BOTTOM_Y = LOBBY_CEILING_PLAN.baseHeight;
const MURAL_TOP_Y = MURAL_BOTTOM_Y + MURAL_ARTWORK_HEIGHT;
// The pink plan line is literal: the facade begins immediately below / to the
// plan-left of the kitchen service door (partition p7) and terminates at the
// southwest start of the isolated back-bar table.
const MURAL_AXIS_START = KITCHEN_PARTITION[7];
const MURAL_AXIS_END = Object.freeze({ x: BACK_BAR_BOUNDS.xMin, z: BACK_BAR_BOUNDS.zMin });
const muralAxisDx = MURAL_AXIS_END.x - MURAL_AXIS_START.x;
const muralAxisDz = MURAL_AXIS_END.z - MURAL_AXIS_START.z;
const muralSurroundWidth = Math.hypot(muralAxisDx, muralAxisDz);
const muralAxisUnit = Object.freeze({
  x: muralAxisDx / muralSurroundWidth,
  z: muralAxisDz / muralSurroundWidth,
});
const muralGuestNormal = Object.freeze({
  x: muralAxisUnit.z,
  z: -muralAxisUnit.x,
});
const muralSurroundStart = MURAL_AXIS_START;
const muralSurroundEnd = MURAL_AXIS_END;
const muralRearFaceStart = Object.freeze({
  x: muralSurroundStart.x - muralGuestNormal.x * MURAL_FASCIA_DEPTH / 2,
  z: muralSurroundStart.z - muralGuestNormal.z * MURAL_FASCIA_DEPTH / 2,
});
const muralRearFaceEnd = Object.freeze({
  x: muralSurroundEnd.x - muralGuestNormal.x * MURAL_FASCIA_DEPTH / 2,
  z: muralSurroundEnd.z - muralGuestNormal.z * MURAL_FASCIA_DEPTH / 2,
});
const muralGrayFillWidth = (muralSurroundWidth - MURAL_ARTWORK_WIDTH) / 2;
const muralArtworkStart = Object.freeze({
  x: muralSurroundStart.x + muralAxisUnit.x * muralGrayFillWidth,
  z: muralSurroundStart.z + muralAxisUnit.z * muralGrayFillWidth,
});
const muralArtworkEnd = Object.freeze({
  x: muralSurroundEnd.x - muralAxisUnit.x * muralGrayFillWidth,
  z: muralSurroundEnd.z - muralAxisUnit.z * muralGrayFillWidth,
});
const pointAtZ = (start, end, z) => Object.freeze({
  x: start.x + (end.x - start.x) * ((z - start.z) / (end.z - start.z)),
  z,
});
const pointAtX = (start, end, x) => Object.freeze({
  x,
  z: start.z + (end.z - start.z) * ((x - start.x) / (end.x - start.x)),
});
const segmentLineIntersection = (firstStart, firstEnd, secondStart, secondEnd) => {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDz = firstEnd.z - firstStart.z;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDz = secondEnd.z - secondStart.z;
  const denominator = firstDx * secondDz - firstDz * secondDx;
  const offsetX = secondStart.x - firstStart.x;
  const offsetZ = secondStart.z - firstStart.z;
  const firstT = (offsetX * secondDz - offsetZ * secondDx) / denominator;
  return Object.freeze({
    x: firstStart.x + firstDx * firstT,
    z: firstStart.z + firstDz * firstT,
  });
};
const muralRearLowIntersection = pointAtX(
  muralRearFaceStart,
  muralRearFaceEnd,
  KITCHEN_PARTITION[6].x,
);
const muralRearHighIntersection = segmentLineIntersection(
  muralRearFaceStart,
  muralRearFaceEnd,
  MURAL_AXIS_END,
  KITCHEN_PARTITION[3],
);
// This low slab fills the clipped plan gap between the pink facade and the
// restored V12 p7→p5→p3 kitchen wall. The endpoint strips are closed by the
// fascia itself, while the clipped high edge meets the main kitchen roof.
const MURAL_SOFFIT_VERTICES = Object.freeze([
  muralRearLowIntersection,
  muralRearHighIntersection,
  KITCHEN_PARTITION[3],
  KITCHEN_PARTITION[4],
  KITCHEN_PARTITION[5],
  KITCHEN_PARTITION[6],
]);

// V13 accidentally sealed the entire p2/p3/p5 work triangle. V14 restores
// that connector nook and isolates only the 0.2 m-deep sliver between the
// nearly-horizontal p2→p3 wall and the restored counter-parallel p3→p5 wall.
const DEAD_WEDGE_AXIS_POINT = pointAtZ(
  KITCHEN_PARTITION[5],
  KITCHEN_PARTITION[3],
  KITCHEN_PARTITION[2].z,
);
const KITCHEN_DEAD_SPACE_VERTICES = Object.freeze([
  KITCHEN_PARTITION[2],
  KITCHEN_PARTITION[3],
  DEAD_WEDGE_AXIS_POINT,
]);
const KITCHEN_CONNECTOR_NOOK_VERTICES = Object.freeze([
  KITCHEN_PARTITION[2],
  DEAD_WEDGE_AXIS_POINT,
  KITCHEN_PARTITION[5],
]);
const KITCHEN_MAIN_CEILING_VERTICES = Object.freeze([
  KITCHEN_PARTITION[2],
  KITCHEN_PARTITION[3],
  MURAL_AXIS_END,
  Object.freeze({ x: KITCHEN_CEILING_BOUNDS.xMax, z: KITCHEN_CEILING_BOUNDS.zMax }),
  Object.freeze({ x: KITCHEN_CEILING_BOUNDS.xMin, z: KITCHEN_CEILING_BOUNDS.zMax }),
  KITCHEN_PARTITION[0],
  KITCHEN_PARTITION[1],
]);

const OFFICE_ATTIC_BOUNDS = shiftedLobbyRect(-36.5, -24.5, 0.4, 7);
const OFFICE_DOOR_WALL_START = Object.freeze({
  x: OFFICE_ATTIC_BOUNDS.xMax,
  z: shiftedZ(0.4),
});
const OFFICE_DOOR_WALL_END = Object.freeze({
  x: OFFICE_ATTIC_BOUNDS.xMax,
  z: shiftedZ(3.8),
});

const mechanicalPoint = (x, y, z) => Object.freeze({ x, y, z });
const mechanicalPlanPoint = (x, z) => Object.freeze({ x, z });
const OVERHEAD_DUCTS = Object.freeze([
  Object.freeze({ id: "lobby-overhead-duct-main-diagonal", start: mechanicalPlanPoint(-25.5, 6), end: mechanicalPlanPoint(1.5, 18), y: 12.4, width: 1.05, height: 0.8, materialKey: "hvacDuct" }),
  Object.freeze({ id: "lobby-overhead-duct-rear-header", start: mechanicalPlanPoint(-24, 20.4), end: mechanicalPlanPoint(5, 20.4), y: 11.7, width: 0.9, height: 0.7, materialKey: "hvacDuct" }),
  Object.freeze({ id: "lobby-overhead-duct-west-cross", start: mechanicalPlanPoint(-22, 1.2), end: mechanicalPlanPoint(-22, 21), y: 10.9, width: 0.7, height: 0.65, materialKey: "hvacDuct" }),
  Object.freeze({ id: "lobby-overhead-duct-center-cross", start: mechanicalPlanPoint(-14.5, 0.5), end: mechanicalPlanPoint(-14.5, 21), y: 12.7, width: 0.65, height: 0.55, materialKey: "hvacDuct" }),
  Object.freeze({ id: "lobby-overhead-duct-mural-diagonal", start: mechanicalPlanPoint(-18.5, 2), end: mechanicalPlanPoint(-6.3, 21), y: 11.25, width: 0.78, height: 0.62, materialKey: "hvacDuct" }),
  Object.freeze({ id: "lobby-overhead-duct-east-branch", start: mechanicalPlanPoint(-8, -1), end: mechanicalPlanPoint(4, 16), y: 12, width: 0.6, height: 0.5, materialKey: "hvacDuct" }),
]);
const OVERHEAD_PIPES = Object.freeze([
  Object.freeze({ id: "lobby-overhead-pipe-diagonal-1", start: mechanicalPoint(-27, 12.9, 3), end: mechanicalPoint(-5, 12.9, 21), radius: 0.14, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-diagonal-2", start: mechanicalPoint(-24, 11.8, 2), end: mechanicalPoint(-2, 11.8, 20), radius: 0.12, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-diagonal-3", start: mechanicalPoint(-20, 10.4, 0), end: mechanicalPoint(1, 10.4, 17.5), radius: 0.1, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-diagonal-4", start: mechanicalPoint(-17, 13.1, -1), end: mechanicalPoint(4, 13.1, 16), radius: 0.09, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-header-1", start: mechanicalPoint(-27, 10.2, 6), end: mechanicalPoint(3, 10.2, 6), radius: 0.12, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-header-2", start: mechanicalPoint(-26, 11.4, 9.2), end: mechanicalPoint(4, 11.4, 9.2), radius: 0.1, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-header-3", start: mechanicalPoint(-25, 12.1, 12.4), end: mechanicalPoint(5, 12.1, 12.4), radius: 0.12, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-header-4", start: mechanicalPoint(-24, 10.8, 15.6), end: mechanicalPoint(5, 10.8, 15.6), radius: 0.11, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-header-5", start: mechanicalPoint(-22, 12.9, 18.8), end: mechanicalPoint(4, 12.9, 18.8), radius: 0.13, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-cross-1", start: mechanicalPoint(-24, 13.2, 0.5), end: mechanicalPoint(-24, 13.2, 21), radius: 0.08, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-cross-2", start: mechanicalPoint(-19, 11.1, -1), end: mechanicalPoint(-19, 11.1, 21), radius: 0.1, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-cross-3", start: mechanicalPoint(-11, 12.55, -1), end: mechanicalPoint(-11, 12.55, 21), radius: 0.09, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-cross-4", start: mechanicalPoint(-4, 10.4, 1), end: mechanicalPoint(-4, 10.4, 20), radius: 0.11, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-branch-1", start: mechanicalPoint(-16, 9.8, 5), end: mechanicalPoint(-8, 9.8, 5), radius: 0.1, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-branch-2", start: mechanicalPoint(-18, 9.9, 17), end: mechanicalPoint(-8, 9.9, 17), radius: 0.1, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-branch-3", start: mechanicalPoint(-9, 11, 8), end: mechanicalPoint(2, 11, 8), radius: 0.09, materialKey: "utilityPipe" }),
  Object.freeze({ id: "lobby-overhead-pipe-riser-west", start: mechanicalPoint(-23, 9.4, 4), end: mechanicalPoint(-23, 12.8, 4), radius: 0.14, materialKey: "black" }),
  Object.freeze({ id: "lobby-overhead-pipe-riser-east", start: mechanicalPoint(-6, 9.6, 19), end: mechanicalPoint(-6, 12.5, 19), radius: 0.12, materialKey: "utilityPipe" }),
]);

export const LOBBY_PLAN = Object.freeze({
  envelope: rect(LOBBY_ENVELOPE_WEST_X, LOBBY_EAST_X, shiftedZ(0), LOBBY_BACK_Z),
  frontDoorCenters: [shiftedLobbyX(-10.8), shiftedLobbyX(-2.2), shiftedLobbyX(8.7)],
  customerCounter: CUSTOMER_COUNTER,
  customerCounterSections: CUSTOMER_COUNTER_SECTIONS,
  concessionRun: CONCESSION_RUN,
  backBar: BACK_BAR_BOUNDS,
  hotLine: shiftedLobbyRect(-28.8, -17.8, 23.05, 24),
  kitchenPartition: KITCHEN_PARTITION,
  concessionBackWall: Object.freeze({
    id: "concession-back-wall-parallel",
    start: KITCHEN_PARTITION[3],
    midpoint: KITCHEN_PARTITION[4],
    end: KITCHEN_PARTITION[5],
    counterRunFraction: 2 / 3,
    mergedPartitionSegments: Object.freeze([3, 4]),
    height: LOBBY_CEILING_PLAN.baseHeight,
    materialKey: "wall",
  }),
  serviceDoor: Object.freeze({
    x: shiftedLobbyX(-24.5), z: shiftedZ(10.35), partitionSegment: 5,
  }),
  kitchenStorageDoor: {
    x: shiftedLobbyX(-28.15), z: shiftedZ(18.45), width: 1.5,
    wall: "diagonal", partitionSegment: 1, segmentT: 0.5,
    connects: Object.freeze(["kitchen-storage", "kitchen"]),
  },
  kitchenDeadSpace: Object.freeze({
    id: "kitchen-dead-wedge",
    vertices: KITCHEN_DEAD_SPACE_VERTICES,
    area: Math.abs(
      (KITCHEN_PARTITION[3].x - KITCHEN_PARTITION[2].x)
        * (DEAD_WEDGE_AXIS_POINT.z - KITCHEN_PARTITION[2].z)
      - (KITCHEN_PARTITION[3].z - KITCHEN_PARTITION[2].z)
        * (DEAD_WEDGE_AXIS_POINT.x - KITCHEN_PARTITION[2].x)
    ) / 2,
    maxDepth: KITCHEN_PARTITION[3].z - KITCHEN_PARTITION[2].z,
    floorMaterialKey: "floorDark",
    separatingWall: Object.freeze({
      id: "kitchen-dead-wedge-separating-wall",
      start: KITCHEN_PARTITION[2],
      end: DEAD_WEDGE_AXIS_POINT,
      height: LOBBY_CEILING_PLAN.baseHeight,
      materialKey: "wall",
    }),
    sharedPartitionEdges: Object.freeze([
      Object.freeze({ segmentIndex: 2, start: KITCHEN_PARTITION[2], end: KITCHEN_PARTITION[3] }),
      Object.freeze({ segmentIndex: 3, start: KITCHEN_PARTITION[3], end: DEAD_WEDGE_AXIS_POINT }),
    ]),
    ceiling: Object.freeze({
      id: "kitchen-dead-wedge-ceiling",
      elevation: LOBBY_CEILING_PLAN.baseHeight,
      thickness: 0.1,
      vertices: KITCHEN_DEAD_SPACE_VERTICES,
    }),
  }),
  kitchenConnectorNook: Object.freeze({
    id: "kitchen-storage-connector-nook",
    vertices: KITCHEN_CONNECTOR_NOOK_VERTICES,
    preservedDoorSegment: 1,
    preservedBackWallSegments: Object.freeze([3, 4]),
    connects: Object.freeze(["kitchen-storage", "kitchen"]),
    floorMaterialKey: "floorDark",
    ceiling: Object.freeze({
      id: "kitchen-connector-nook-ceiling",
      elevation: LOBBY_CEILING_PLAN.baseHeight,
      thickness: 0.1,
      vertices: KITCHEN_CONNECTOR_NOOK_VERTICES,
    }),
  }),
  kitchenCeiling: Object.freeze({
    id: "kitchen-complete-low-ceiling",
    legacyBounds: KITCHEN_CEILING_BOUNDS,
    elevation: LOBBY_CEILING_PLAN.baseHeight,
    replacementForRoomId: "kitchen",
    surfaces: Object.freeze([
      Object.freeze({
        id: "kitchen-complete-ceiling",
        elevation: LOBBY_CEILING_PLAN.baseHeight,
        thickness: 0.1,
        vertices: KITCHEN_MAIN_CEILING_VERTICES,
      }),
      Object.freeze({
        id: "kitchen-connector-nook-ceiling",
        elevation: LOBBY_CEILING_PLAN.baseHeight,
        thickness: 0.1,
        vertices: KITCHEN_CONNECTOR_NOOK_VERTICES,
      }),
    ]),
    closureSurfaceIds: Object.freeze([
      "kitchen-complete-ceiling",
      "kitchen-connector-nook-ceiling",
      "kitchen-dead-wedge-ceiling",
      "concession-mural-soffit",
    ]),
  }),
  officeAttic: Object.freeze({
    id: "office-door-attic",
    bounds: OFFICE_ATTIC_BOUNDS,
    baseY: LOBBY_CEILING_PLAN.baseHeight,
    topY: MURAL_TOP_Y,
    materialKey: "wall",
    doorWall: Object.freeze({
      id: "office-door-attic-wall",
      start: OFFICE_DOOR_WALL_START,
      end: OFFICE_DOOR_WALL_END,
    }),
  }),
  futureStairs: rect(STAIR_WEST_X, STAIR_EAST_X, STAIR_SOUTH_Z, LOBBY_BACK_Z),
  futureStairWall: Object.freeze({
    id: "future-stair-wall-white",
    side: "west",
    start: Object.freeze({ x: STAIR_WEST_X, z: STAIR_SOUTH_Z }),
    end: Object.freeze({ x: STAIR_WEST_X, z: LOBBY_BACK_Z }),
    finish: "white",
    materialKey: "wall",
    approachReveal: STAIR_APPROACH_REVEAL,
  }),
  boxOfficeVertical: rect(
    BOX_OFFICE_VERTICAL_X_MIN,
    BOX_OFFICE_VERTICAL_X_MAX,
    BOX_OFFICE_RETURN_Z_MIN,
    BOX_OFFICE_VERTICAL_Z_MAX,
  ),
  boxOfficeReturn: rect(
    BOX_OFFICE_RETURN_X_MIN,
    BOX_OFFICE_RETURN_X_MAX,
    BOX_OFFICE_RETURN_Z_MIN,
    BOX_OFFICE_RETURN_Z_MAX,
  ),
  boxOfficeCubby: Object.freeze({
    id: "box-office-stair-cubby",
    flushWallX: STAIR_WEST_X,
    returnLength: BOX_OFFICE_RETURN_LENGTH,
    returnDepth: BOX_OFFICE_RETURN_DEPTH,
  }),
  boxOfficeSightline: Object.freeze({
    id: "box-office-ticket-hall-sightline",
    bounds: rect(
      BOX_OFFICE_VERTICAL_X_MIN,
      BOX_OFFICE_VERTICAL_X_MAX,
      BOX_OFFICE_VERTICAL_Z_MAX,
      TICKET_APPROACH_PLAN.bounds.zMax,
    ),
    axisX: (BOX_OFFICE_VERTICAL_X_MIN + BOX_OFFICE_VERTICAL_X_MAX) / 2,
  }),
  boxOfficePos: Object.freeze({
    id: "box-office-pos",
    position: Object.freeze([
      (BOX_OFFICE_VERTICAL_X_MIN + BOX_OFFICE_VERTICAL_X_MAX) / 2,
      0,
      shiftedZ(11.2),
    ]),
    rotation: 0,
    footprint: Object.freeze([0.72, 0.5]),
    counterSegment: "box-office-vertical",
  }),
  kiosks: [
    { id: "ticket-kiosk-1", position: [LOBBY_EAST_X - 1.6, 0, shiftedZ(3)], rotation: Math.PI / 2 },
    { id: "ticket-kiosk-2", position: [LOBBY_EAST_X - 1.6, 0, shiftedZ(5)], rotation: Math.PI / 2 },
    { id: "ticket-kiosk-3", position: [LOBBY_EAST_X - 1.6, 0, shiftedZ(7)], rotation: Math.PI / 2 },
  ],
  ticketPodium: Object.freeze({
    id: "ticket-podium-center",
    position: Object.freeze([5.8, 0, shiftedZ(56.4)]),
    footprint: Object.freeze([0.85, 0.65]),
    height: 1.25,
    material: "wood",
    style: "lectern",
  }),
  muralFacade: Object.freeze({
    id: "concession-mural-facade",
    start: MURAL_AXIS_START,
    end: MURAL_AXIS_END,
    projection: 0,
    rearOffset: 0,
    fasciaDepth: MURAL_FASCIA_DEPTH,
    projectedStart: muralSurroundStart,
    projectedEnd: muralSurroundEnd,
    bottomY: MURAL_BOTTOM_Y,
    topY: MURAL_TOP_Y,
    muralHeight: MURAL_ARTWORK_HEIGHT,
    axis: Object.freeze({
      id: "concession-mural-door-to-bar-axis",
      start: MURAL_AXIS_START,
      end: MURAL_AXIS_END,
      direction: muralAxisUnit,
      length: muralSurroundWidth,
      guestNormal: muralGuestNormal,
      lowAnchor: "kitchen-partition-p7-plan-left-door-side",
      highAnchor: "back-bar-southwest-start",
    }),
    surround: Object.freeze({
      id: "concession-mural-surround",
      start: muralSurroundStart,
      end: muralSurroundEnd,
      width: muralSurroundWidth,
      height: MURAL_ARTWORK_HEIGHT,
      depth: MURAL_FASCIA_DEPTH,
      rearOffset: 0,
      verticalGrayFill: Object.freeze({ top: 0, bottom: 0 }),
      materialKey: "concrete",
    }),
    artwork: Object.freeze({
      id: "concession-botanical-mural",
      start: muralArtworkStart,
      end: muralArtworkEnd,
      width: MURAL_ARTWORK_WIDTH,
      height: MURAL_ARTWORK_HEIGHT,
      preservedFromVersion: 12,
    }),
    grayFills: Object.freeze([
      Object.freeze({
        id: "concession-mural-gray-fill-low",
        start: muralSurroundStart,
        end: muralArtworkStart,
        width: muralGrayFillWidth,
        height: MURAL_ARTWORK_HEIGHT,
        materialKey: "concrete",
      }),
      Object.freeze({
        id: "concession-mural-gray-fill-high",
        start: muralArtworkEnd,
        end: muralSurroundEnd,
        width: muralGrayFillWidth,
        height: MURAL_ARTWORK_HEIGHT,
        materialKey: "concrete",
      }),
    ]),
    returnAnchors: Object.freeze({ start: MURAL_AXIS_START, end: MURAL_AXIS_END }),
    // Returns meet the rear face of the projecting fascia. The soffit is
    // clipped inward to its two wall intersections, so the fascia closes the
    // short endpoint strips without a crossing or ceiling overlap.
    returnTargets: Object.freeze({ start: muralRearFaceStart, end: muralRearFaceEnd }),
    soffit: Object.freeze({
      id: "concession-mural-soffit",
      elevation: LOBBY_CEILING_PLAN.baseHeight,
      thickness: 0.1,
      // Runs from the two rear-face/wall intersections through p3→p6. The
      // clipped high edge meets the complete kitchen roof; no coplanar regions
      // overlap and the polygon remains simple.
      vertices: MURAL_SOFFIT_VERTICES,
    }),
  }),
  overheadMechanicals: Object.freeze({
    id: "lobby-mural-overhead-mechanicals",
    coverageBounds: rect(-27, 5, -1, 21),
    minClearanceY: MURAL_TOP_Y + 0.5,
    maxY: LOBBY_CEILING_PLAN.highHeight - 0.45,
    ducts: OVERHEAD_DUCTS,
    pipes: OVERHEAD_PIPES,
    hangerSpacing: 2.4,
  }),
  officePath: ["lobby", "office-overflow", "office"],
});

export const EQUIPMENT_ANCHORS = Object.freeze([
  {
    id: "concession-popper-1", type: "popper", roomId: "concession-boh",
    position: Object.freeze([shiftedLobbyX(-22.58), 0, shiftedZ(14.5)]),
    rotation: concessionFixtureRotation, footprint: Object.freeze([1.35, 0.9]), height: 2.8,
    glassBottom: 1.05, glassTop: 2.48, canopyBottom: 2.48, canopyTop: 2.76,
  },
  {
    id: "concession-popper-2", type: "popper", roomId: "concession-boh",
    position: Object.freeze([shiftedLobbyX(-23.16), 0, shiftedZ(13.0)]),
    rotation: concessionFixtureRotation, footprint: Object.freeze([1.35, 0.9]), height: 2.8,
    glassBottom: 1.05, glassTop: 2.48, canopyBottom: 2.48, canopyTop: 2.76,
  },
  { id: "kitchen-grill", type: "grill", roomId: "kitchen", position: [shiftedLobbyX(-27.5), 0, shiftedZ(22.7)], rotation: 0, footprint: [1.35, 0.9] },
  { id: "kitchen-fryer-1", type: "fryer", roomId: "kitchen", position: [shiftedLobbyX(-25.7), 0, shiftedZ(22.7)], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-fryer-2", type: "fryer", roomId: "kitchen", position: [shiftedLobbyX(-24.3), 0, shiftedZ(22.7)], rotation: 0, footprint: [0.9, 0.9] },
  { id: "kitchen-turbo-oven", type: "turbo-oven", roomId: "kitchen", position: [shiftedLobbyX(-22.5), 0, shiftedZ(22.7)], rotation: 0, footprint: [1.15, 0.95] },
  { id: "bar-well", type: "bar-well", roomId: "bar", position: [shiftedLobbyX(-12.3), 0, shiftedZ(22.7)], rotation: Math.PI, footprint: [1.5, 0.8] },
  { id: "soda-icee-left", type: "icee-fountain", roomId: "soda-service", position: [1.1, 0, FOUNTAIN_ISLAND_CENTER_Z], rotation: 0, footprint: [1.5, 0.95] },
  { id: "soda-fountain-1", type: "soda-fountain", roomId: "soda-service", position: [3.3, 0, FOUNTAIN_ISLAND_CENTER_Z], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-fountain-2", type: "soda-fountain", roomId: "soda-service", position: [7.8, 0, FOUNTAIN_ISLAND_CENTER_Z], rotation: 0, footprint: [1.8, 0.95] },
  { id: "soda-icee-right", type: "icee-fountain", roomId: "soda-service", position: [10.5, 0, FOUNTAIN_ISLAND_CENTER_Z], rotation: 0, footprint: [1.5, 0.95] },
  { id: "boys-water-fountain-1", type: "drinking-fountain", roomId: "boys-fountain-alcove", position: [-13.36, 0, shiftedZ(63.03)], rotation: -Math.PI / 2, footprint: [0.65, 0.42] },
  { id: "boys-water-fountain-2", type: "drinking-fountain", roomId: "boys-fountain-alcove", position: [-13.36, 0, shiftedZ(63.83)], rotation: -Math.PI / 2, footprint: [0.65, 0.42] },
]);

const concessionServiceTypes = Object.freeze(["pos", "pos", "candy", "pos", "pos", "candy", "pos", "pos"]);
let concessionPosIndex = 0;
let concessionCandyIndex = 0;
export const CONCESSION_SERVICE_SEQUENCE = Object.freeze(concessionServiceTypes.map((type, slotIndex) => {
  const slotT = (slotIndex + 0.5) / concessionServiceTypes.length;
  const position = Object.freeze([
    concessionRunStart.x + concessionRunDx * slotT,
    0,
    concessionRunStart.z + concessionRunDz * slotT,
  ]);
  if (type === "pos") {
    concessionPosIndex += 1;
    return Object.freeze({
      id: `concession-pos-${concessionPosIndex}`,
      type,
      slotIndex,
      slotT,
      position,
      rotation: concessionRunRotation,
      counterSegment: "diagonal-pos-run",
    });
  }
  concessionCandyIndex += 1;
  return Object.freeze({
    id: `concession-candy-${concessionCandyIndex}`,
    type,
    slotIndex,
    slotT,
    position,
    rotation: concessionFixtureRotation,
    footprint: Object.freeze([1, 0.12]),
    guestOffset: 0.58,
    counterSegment: "diagonal-pos-run",
  });
}));

export const POS_STATIONS = Object.freeze(CONCESSION_SERVICE_SEQUENCE.filter(({ type }) => type === "pos"));
export const CONCESSION_CANDY_DISPLAYS = Object.freeze(
  CONCESSION_SERVICE_SEQUENCE.filter(({ type }) => type === "candy"),
);

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
export const PLAYER_SPAWN_PLAN = Object.freeze({ x: shiftedLobbyX(1.5), y: 0, z: shiftedZ(-6.8) });

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
  const lobby = PUBLIC_SPACES.find(({ id }) => id === "lobby");
  const frontWalk = PUBLIC_SPACES.find(({ id }) => id === "front-walk");
  const ticketCheck = PUBLIC_SPACES.find(({ id }) => id === "ticket-check");
  const nearlyEqual = (first, second) => Math.abs(first - second) <= 1e-9;
  const expectedCounterSections = [
    ["customer-counter-bar", "bar", "wood"],
    ["customer-counter-white-service", "service-white", "counterWhite"],
    ["customer-counter-concession", "concession", "concessionBlue"],
    ["customer-counter-expo", "expo", "counterWhite"],
  ];
  if (LOBBY_PLAN.customerCounterSections?.length !== expectedCounterSections.length
    || LOBBY_PLAN.customerCounterSections.some((section, index) => {
      const [id, role, baseMaterialKey] = expectedCounterSections[index] ?? [];
      return section.id !== id
        || section.segmentIndex !== index
        || section.role !== role
        || section.baseMaterialKey !== baseMaterialKey
        || section.topMaterialKey !== "counterStone";
    })) {
    errors.push("V12 counter sections must run wood bar, white service, blue concession, then white Expo.");
  }

  const partition = LOBBY_PLAN.kitchenPartition ?? [];
  const parallelStart = partition[3];
  const parallelMidpoint = partition[4];
  const parallelEnd = partition[5];
  const serviceDoorEnd = partition[6];
  const expectedParallelFraction = 2 / 3;
  if (partition.length !== 8
    || !parallelStart || !parallelMidpoint || !parallelEnd || !serviceDoorEnd
    || !nearlyEqual(parallelEnd.x - parallelStart.x, concessionRunDx * expectedParallelFraction)
    || !nearlyEqual(parallelEnd.z - parallelStart.z, concessionRunDz * expectedParallelFraction)
    || !nearlyEqual(parallelMidpoint.x, (parallelStart.x + parallelEnd.x) / 2)
    || !nearlyEqual(parallelMidpoint.z, (parallelStart.z + parallelEnd.z) / 2)) {
    errors.push("V12 kitchen partition points 3–5 must form a counter-parallel back wall spanning two-thirds of the concession run.");
  }
  const concessionBackWall = LOBBY_PLAN.concessionBackWall;
  if (concessionBackWall?.id !== "concession-back-wall-parallel"
    || concessionBackWall.start !== parallelStart
    || concessionBackWall.midpoint !== parallelMidpoint
    || concessionBackWall.end !== parallelEnd
    || !nearlyEqual(concessionBackWall.counterRunFraction, expectedParallelFraction)
    || concessionBackWall.mergedPartitionSegments?.join(",") !== "3,4") {
    errors.push("V14 must restore the merged p3→p5 counter-parallel kitchen wall and retain p4 only as its collinear midpoint.");
  }
  if (LOBBY_PLAN.serviceDoor?.partitionSegment !== 5
    || !nearlyEqual(LOBBY_PLAN.serviceDoor?.x, (parallelEnd?.x + serviceDoorEnd?.x) / 2)
    || !nearlyEqual(LOBBY_PLAN.serviceDoor?.z, (parallelEnd?.z + serviceDoorEnd?.z) / 2)) {
    errors.push("The concession service door must remain centered in kitchen-partition segment 5 after the V12 wall realignment.");
  }
  if (!nearlyEqual(LOBBY_SHIFT_X, 8.3)
    || !nearlyEqual(LOBBY_PLAN.customerCounter[0].x, TICKET_APPROACH_PLAN.bounds.xMin)) {
    errors.push("V11 must shift the rigid lobby module 8.3 m so the guest-bar end aligns with the ticket approach.");
  }
  if (!nearlyEqual(LOBBY_PLAN.envelope.xMin, LOBBY_ENVELOPE_WEST_X)
    || !nearlyEqual(LOBBY_PLAN.envelope.xMax, LOBBY_EAST_X)
    || !nearlyEqual(lobby?.bounds.xMin, -16.2)
    || !nearlyEqual(lobby?.bounds.xMax, LOBBY_EAST_X)
    || !nearlyEqual(frontWalk?.bounds.xMin, FRONT_WALK_WEST_X)
    || !nearlyEqual(frontWalk?.bounds.xMax, FRONT_WALK_EAST_X)) {
    errors.push("V13 must retain the concession-side lobby while tightening the stair-side envelope and front walk.");
  }
  if (LOBBY_CEILING_PLAN.multiplier !== 3
    || !nearlyEqual(LOBBY_CEILING_PLAN.highHeight, LOBBY_CEILING_PLAN.baseHeight * 3)
    || LOBBY_CEILING_PLAN.highPublicSpaceIds.length !== 1
    || LOBBY_CEILING_PLAN.highPublicSpaceIds[0] !== "lobby") {
    errors.push("Only the open lobby may use the three-times-height ceiling; the fountain court stays at the lower datum.");
  }
  if (LOBBY_PLAN.kiosks.length !== 3
    || LOBBY_PLAN.kiosks.some((kiosk, index) => (
      kiosk.id !== `ticket-kiosk-${index + 1}`
      || !nearlyEqual(kiosk.position[0], LOBBY_EAST_X - 1.6)
      || !nearlyEqual(kiosk.position[2], 0.5 + index * 2)
    ))) {
    errors.push("The tightened lobby must contain three evenly spaced ticket kiosks along its east wall.");
  }
  const boxOffice = serviceRoomById.get("box-office");
  if (LOBBY_PLAN.boxOfficePos?.id !== "box-office-pos"
    || LOBBY_PLAN.boxOfficePos.counterSegment !== "box-office-vertical"
    || !pointInBounds(LOBBY_PLAN.boxOfficePos.position[0], LOBBY_PLAN.boxOfficePos.position[2], boxOffice?.bounds ?? rect(0, 0, 0, 0))) {
    errors.push("The box-office POS must remain centered on the long leg of the shifted L counter.");
  }
  if (LOBBY_PLAN.ticketPodium?.id !== "ticket-podium-center"
    || LOBBY_PLAN.ticketPodium.style !== "lectern"
    || !nearlyEqual(LOBBY_PLAN.ticketPodium.position[0], (TICKET_APPROACH_PLAN.bounds.xMin + TICKET_APPROACH_PLAN.bounds.xMax) / 2)
    || !pointInBounds(LOBBY_PLAN.ticketPodium.position[0], LOBBY_PLAN.ticketPodium.position[2], ticketCheck?.bounds ?? rect(0, 0, 0, 0))) {
    errors.push("Ticket check must use one centered wooden lectern.");
  }
  const boxOfficeReturnLength = LOBBY_PLAN.boxOfficeReturn.xMax - LOBBY_PLAN.boxOfficeReturn.xMin;
  const boxOfficeReturnDepth = LOBBY_PLAN.boxOfficeReturn.zMax - LOBBY_PLAN.boxOfficeReturn.zMin;
  const stairEastGap = LOBBY_PLAN.envelope.xMax - LOBBY_PLAN.futureStairs.xMax;
  const kioskEastGap = LOBBY_PLAN.envelope.xMax - LOBBY_PLAN.kiosks[0].position[0];
  const sightline = LOBBY_PLAN.boxOfficeSightline;
  if (!nearlyEqual(LOBBY_PLAN.futureStairs.xMin - TICKET_APPROACH_PLAN.bounds.xMax, STAIR_APPROACH_REVEAL)
    || !nearlyEqual(LOBBY_PLAN.boxOfficeReturn.xMax, LOBBY_PLAN.futureStairs.xMin)
    || !nearlyEqual(LOBBY_PLAN.boxOfficeReturn.zMax, LOBBY_PLAN.futureStairs.zMin)
    || !nearlyEqual(boxOfficeReturnLength, 3.15)
    || !nearlyEqual(boxOfficeReturnDepth, BOX_OFFICE_RETURN_DEPTH)
    || !nearlyEqual(stairEastGap, 1)
    || !nearlyEqual(kioskEastGap, 1.6)
    || LOBBY_PLAN.futureStairWall?.finish !== "white"
    || sightline?.bounds.xMin < TICKET_APPROACH_PLAN.bounds.xMin
    || sightline?.bounds.xMax > TICKET_APPROACH_PLAN.bounds.xMax
    || !nearlyEqual(sightline?.bounds.zMax, TICKET_APPROACH_PLAN.bounds.zMax)) {
    errors.push("V13 must use a two-foot stair reveal, a half-length narrow box-office return, a white stair wall, and a clear ticket-hall sightline.");
  }
  const [westPillar, eastPillar] = FOUNTAIN_PLAN.pillars ?? [];
  const westPillarHalfWidth = (westPillar?.footprint?.[0] ?? 0) / 2;
  const dividerEastFace = COURTYARD_PLAN.waistPartition.x + COURTYARD_PLAN.waistPartition.thickness / 2;
  const dividerPassage = (westPillar?.position?.[0] ?? -Infinity) - westPillarHalfWidth - dividerEastFace;
  if (FOUNTAIN_PLAN.pillars?.length !== 2
    || westPillar?.id !== "fountain-island-west-pillar"
    || eastPillar?.id !== "fountain-island-east-pillar"
    || !nearlyEqual(dividerPassage, 1.11)
    || dividerPassage <= 0.68
    || !nearlyEqual(FOUNTAIN_PLAN.shiftZ, 0.59)
    || !nearlyEqual(FOUNTAIN_PLAN.island.zMax, 64.9)
    || FOUNTAIN_PLAN.rearPassage < 1.5
    || !nearlyEqual(COURTYARD_PLAN.waistPartition.zMin, FOUNTAIN_PLAN.island.zMin)
    || FOUNTAIN_PLAN.pillars.some((pillar) => !nearlyEqual(pillar.height, LOBBY_CEILING_PLAN.baseHeight)
      || !nearlyEqual(pillar.position[2], FOUNTAIN_PLAN.centerZ))
    || EQUIPMENT_ANCHORS.filter(({ roomId, type }) => roomId === "soda-service"
      && ["icee-fountain", "soda-fountain"].includes(type))
      .some((anchor) => !nearlyEqual(anchor.position[2], FOUNTAIN_PLAN.centerZ))) {
    errors.push("The V13 fountain island, pillars, equipment, and divider must shift together +0.59 m while retaining a traversable rear passage.");
  }
  const muralFacade = LOBBY_PLAN.muralFacade;
  const muralSoffit = muralFacade?.soffit;
  const muralSurround = muralFacade?.surround;
  const muralArtwork = muralFacade?.artwork;
  const muralAxis = muralFacade?.axis;
  const segmentLength = (start, end) => Math.hypot(end.x - start.x, end.z - start.z);
  const samePlanPoint = (first, second) => Boolean(first && second)
    && nearlyEqual(first.x, second.x)
    && nearlyEqual(first.z, second.z);
  const polygonArea = (vertices = []) => Math.abs(vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + vertex.x * next.z - next.x * vertex.z;
  }, 0)) / 2;
  const expectedMuralAxisStart = partition[7];
  const expectedMuralAxisEnd = Object.freeze({
    x: LOBBY_PLAN.backBar.xMin,
    z: LOBBY_PLAN.backBar.zMin,
  });
  const muralFillLow = muralFacade?.grayFills?.[0];
  const muralFillHigh = muralFacade?.grayFills?.[1];
  const muralFillRatio = muralFillLow?.width / muralArtwork?.width;
  if (muralFacade?.id !== "concession-mural-facade"
    || muralAxis?.id !== "concession-mural-door-to-bar-axis"
    || !samePlanPoint(muralAxis?.start, expectedMuralAxisStart)
    || !samePlanPoint(muralAxis?.end, expectedMuralAxisEnd)
    || muralAxis?.lowAnchor !== "kitchen-partition-p7-plan-left-door-side"
    || muralAxis?.highAnchor !== "back-bar-southwest-start"
    || !nearlyEqual(muralAxis?.length, segmentLength(muralAxis.start, muralAxis.end))
    || !nearlyEqual(Math.hypot(muralAxis?.direction?.x, muralAxis?.direction?.z), 1)
    || !nearlyEqual(Math.hypot(muralAxis?.guestNormal?.x, muralAxis?.guestNormal?.z), 1)
    || !nearlyEqual(
      muralAxis?.direction?.x * muralAxis?.guestNormal?.x
        + muralAxis?.direction?.z * muralAxis?.guestNormal?.z,
      0,
    )
    || !nearlyEqual(muralFacade.projection, 0)
    || !nearlyEqual(muralFacade.rearOffset, 0)
    || !samePlanPoint(muralFacade.start, expectedMuralAxisStart)
    || !samePlanPoint(muralFacade.end, expectedMuralAxisEnd)
    || !samePlanPoint(muralFacade.projectedStart, expectedMuralAxisStart)
    || !samePlanPoint(muralFacade.projectedEnd, expectedMuralAxisEnd)
    || muralSurround?.id !== "concession-mural-surround"
    || !samePlanPoint(muralSurround?.start, expectedMuralAxisStart)
    || !samePlanPoint(muralSurround?.end, expectedMuralAxisEnd)
    || !nearlyEqual(muralSurround.width, segmentLength(muralSurround.start, muralSurround.end))
    || !nearlyEqual(muralSurround.width, muralAxis.length)
    || !nearlyEqual(muralSurround.height, MURAL_ARTWORK_HEIGHT)
    || !nearlyEqual(muralSurround.depth, MURAL_FASCIA_DEPTH)
    || !nearlyEqual(muralSurround.rearOffset, 0)
    || !nearlyEqual(muralSurround.verticalGrayFill?.top, 0)
    || !nearlyEqual(muralSurround.verticalGrayFill?.bottom, 0)
    || muralArtwork?.id !== "concession-botanical-mural"
    || muralArtwork?.preservedFromVersion !== 12
    || !nearlyEqual(muralArtwork?.width, concessionRunLength - MURAL_FASCIA_DEPTH)
    || !nearlyEqual(muralArtwork?.width, segmentLength(muralArtwork.start, muralArtwork.end))
    || !nearlyEqual(muralArtwork?.height, MURAL_ARTWORK_HEIGHT)
    || !nearlyEqual(muralFacade.muralHeight, MURAL_ARTWORK_HEIGHT)
    || !nearlyEqual(muralFacade.bottomY, LOBBY_CEILING_PLAN.baseHeight)
    || !nearlyEqual(muralFacade.topY - muralFacade.bottomY, muralArtwork.height)
    || muralFacade.grayFills?.length !== 2
    || muralFillLow?.id !== "concession-mural-gray-fill-low"
    || muralFillHigh?.id !== "concession-mural-gray-fill-high"
    || !nearlyEqual(muralFillLow?.width, muralFillHigh?.width)
    || !nearlyEqual(muralFillLow?.height, muralArtwork.height)
    || !nearlyEqual(muralFillHigh?.height, muralArtwork.height)
    || muralFillRatio < 0.4
    || muralFillRatio > 0.5
    || !nearlyEqual(
      muralFillLow?.width * 2 + muralArtwork?.width,
      muralSurround?.width,
    )
    || !samePlanPoint(muralFillLow?.start, muralSurround.start)
    || !samePlanPoint(muralFillLow?.end, muralArtwork.start)
    || !samePlanPoint(muralFillHigh?.start, muralArtwork.end)
    || !samePlanPoint(muralFillHigh?.end, muralSurround.end)
    || !samePlanPoint(muralFacade.returnAnchors?.start, muralAxis.start)
    || !samePlanPoint(muralFacade.returnAnchors?.end, muralAxis.end)
    || !samePlanPoint(muralFacade.returnTargets?.start, muralRearFaceStart)
    || !samePlanPoint(muralFacade.returnTargets?.end, muralRearFaceEnd)
    || muralFacade.topY > LOBBY_CEILING_PLAN.highHeight) {
    errors.push("V14 mural surround must run exactly from kitchen p7 to the back-bar southwest start, retain the V12 artwork with zero vertical gray, and use equal near-half-width gray side panels.");
  }
  if (muralSoffit?.id !== "concession-mural-soffit"
    || !nearlyEqual(muralSoffit.elevation, LOBBY_CEILING_PLAN.baseHeight)
    || !nearlyEqual(muralSoffit.thickness, 0.1)
    || muralSoffit.vertices?.length !== 6
    || muralSoffit.vertices.some(({ x, z }) => !Number.isFinite(x) || !Number.isFinite(z))
    || polygonArea(muralSoffit.vertices) <= 1
    || !samePlanPoint(muralSoffit.vertices?.[0], muralRearLowIntersection)
    || !samePlanPoint(muralSoffit.vertices?.[1], muralRearHighIntersection)
    || muralSoffit.vertices?.[2] !== partition[3]
    || muralSoffit.vertices?.[3] !== partition[4]
    || muralSoffit.vertices?.[4] !== partition[5]
    || muralSoffit.vertices?.[5] !== partition[6]) {
    errors.push("The V14 mural soffit must be the simple six-point gap between the fascia rear face and restored p3→p6 kitchen boundary, without a crossing or roof overlap.");
  }
  const deadSpace = LOBBY_PLAN.kitchenDeadSpace;
  const connectorNook = LOBBY_PLAN.kitchenConnectorNook;
  const deadWedgeAxisPoint = deadSpace?.vertices?.[2];
  const kitchenCeiling = LOBBY_PLAN.kitchenCeiling;
  const kitchenMainCeiling = kitchenCeiling?.surfaces?.[0];
  const connectorNookCeiling = kitchenCeiling?.surfaces?.[1];
  const expectedClosureSurfaceIds = [
    "kitchen-complete-ceiling",
    "kitchen-connector-nook-ceiling",
    "kitchen-dead-wedge-ceiling",
    "concession-mural-soffit",
  ];
  if (deadSpace?.id !== "kitchen-dead-wedge"
    || deadSpace.vertices?.length !== 3
    || deadSpace.vertices?.[0] !== partition[2]
    || deadSpace.vertices?.[1] !== partition[3]
    || !samePlanPoint(deadWedgeAxisPoint, pointAtZ(partition[5], partition[3], partition[2].z))
    || deadSpace.area >= 1
    || !nearlyEqual(deadSpace.area, polygonArea(deadSpace.vertices))
    || !nearlyEqual(deadSpace.maxDepth, 0.2)
    || deadSpace.separatingWall?.id !== "kitchen-dead-wedge-separating-wall"
    || deadSpace.separatingWall?.start !== partition[2]
    || !samePlanPoint(deadSpace.separatingWall?.end, deadWedgeAxisPoint)
    || deadSpace.sharedPartitionEdges?.length !== 2
    || deadSpace.sharedPartitionEdges?.[0]?.segmentIndex !== 2
    || deadSpace.sharedPartitionEdges?.[1]?.segmentIndex !== 3
    || deadSpace.ceiling?.id !== "kitchen-dead-wedge-ceiling"
    || deadSpace.ceiling?.vertices?.length !== 3
    || deadSpace.ceiling.vertices !== deadSpace.vertices
    || !nearlyEqual(deadSpace.ceiling.elevation, LOBBY_CEILING_PLAN.baseHeight)
    || !nearlyEqual(deadSpace.ceiling.thickness, 0.1)) {
    errors.push("V14 must isolate only the authored 0.2 m-deep kitchen wedge and give that tiny triangle its own separating wall and low ceiling.");
  }
  if (connectorNook?.id !== "kitchen-storage-connector-nook"
    || connectorNook.vertices?.length !== 3
    || connectorNook.vertices?.[0] !== partition[2]
    || !samePlanPoint(connectorNook.vertices?.[1], deadWedgeAxisPoint)
    || connectorNook.vertices?.[2] !== partition[5]
    || connectorNook.preservedDoorSegment !== 1
    || connectorNook.preservedBackWallSegments?.join(",") !== "3,4"
    || connectorNook.connects?.join(",") !== "kitchen-storage,kitchen"
    || connectorNook.ceiling?.id !== "kitchen-connector-nook-ceiling"
    || connectorNook.ceiling?.vertices !== connectorNook.vertices
    || !nearlyEqual(connectorNook.ceiling?.elevation, LOBBY_CEILING_PLAN.baseHeight)
    || !nearlyEqual(connectorNook.ceiling?.thickness, 0.1)) {
    errors.push("The kitchen-storage connector nook must remain open beside the diagonal connector door and retain the restored p3→p5 wall.");
  }
  if (kitchenCeiling?.id !== "kitchen-complete-low-ceiling"
    || Object.hasOwn(kitchenCeiling ?? {}, "bounds")
    || kitchenCeiling?.legacyBounds !== KITCHEN_CEILING_BOUNDS
    || kitchenCeiling?.replacementForRoomId !== "kitchen"
    || !nearlyEqual(kitchenCeiling?.elevation, LOBBY_CEILING_PLAN.baseHeight)
    || kitchenCeiling?.surfaces?.length !== 2
    || kitchenMainCeiling?.id !== "kitchen-complete-ceiling"
    || kitchenMainCeiling?.vertices?.length !== 7
    || kitchenMainCeiling.vertices?.[0] !== partition[2]
    || kitchenMainCeiling.vertices?.[1] !== partition[3]
    || !samePlanPoint(kitchenMainCeiling.vertices?.[2], expectedMuralAxisEnd)
    || !nearlyEqual(kitchenMainCeiling?.elevation, LOBBY_CEILING_PLAN.baseHeight)
    || !nearlyEqual(kitchenMainCeiling?.thickness, 0.1)
    || polygonArea(kitchenMainCeiling?.vertices) <= 20
    || connectorNookCeiling?.id !== "kitchen-connector-nook-ceiling"
    || connectorNookCeiling?.vertices !== connectorNook.vertices
    || !nearlyEqual(connectorNookCeiling?.elevation, LOBBY_CEILING_PLAN.baseHeight)
    || !nearlyEqual(connectorNookCeiling?.thickness, 0.1)
    || kitchenCeiling.closureSurfaceIds?.join(",") !== expectedClosureSurfaceIds.join(",")
    || !samePlanPoint(kitchenMainCeiling.vertices?.[1], muralSoffit.vertices?.[2])
    || !samePlanPoint(kitchenMainCeiling.vertices?.[2], expectedMuralAxisEnd)) {
    errors.push("The complete kitchen roof must use the authored main polygon plus connector-nook slab and meet the mural soffit edge without a coplanar rectangular overlap.");
  }
  const officeAttic = LOBBY_PLAN.officeAttic;
  if (officeAttic?.id !== "office-door-attic"
    || !nearlyEqual(officeAttic.baseY, LOBBY_CEILING_PLAN.baseHeight)
    || !nearlyEqual(officeAttic.topY, muralFacade?.topY)
    || officeAttic.doorWall?.id !== "office-door-attic-wall"
    || !nearlyEqual(officeAttic.doorWall?.start.x, officeAttic.bounds.xMax)
    || !nearlyEqual(officeAttic.doorWall?.end.x, officeAttic.bounds.xMax)) {
    errors.push("The office-door attic wall must rise from the service ceiling to the mural top.");
  }
  const overheadMechanicals = LOBBY_PLAN.overheadMechanicals;
  const ducts = overheadMechanicals?.ducts ?? [];
  const pipes = overheadMechanicals?.pipes ?? [];
  const mechanicalIds = [...ducts, ...pipes].map(({ id }) => id);
  const ductRunLength = ducts.reduce((sum, duct) => sum + segmentLength(duct.start, duct.end), 0);
  const pipeRunLength = pipes.reduce((sum, pipe) => sum + Math.hypot(
    pipe.end.x - pipe.start.x,
    pipe.end.y - pipe.start.y,
    pipe.end.z - pipe.start.z,
  ), 0);
  const mechanicalPointInCoverage = ({ x, z }) => pointInBounds(
    x,
    z,
    overheadMechanicals?.coverageBounds ?? rect(0, 0, 0, 0),
  );
  const hasDiagonalPipe = pipes.some(({ start, end }) => (
    !nearlyEqual(start.x, end.x) && !nearlyEqual(start.z, end.z)
  ));
  const hasHeaderPipe = pipes.some(({ start, end }) => (
    !nearlyEqual(start.x, end.x) && nearlyEqual(start.z, end.z)
  ));
  const hasCrossPipe = pipes.some(({ start, end }) => (
    nearlyEqual(start.x, end.x) && !nearlyEqual(start.z, end.z)
  ));
  const hasRiserPipe = pipes.some(({ start, end }) => (
    nearlyEqual(start.x, end.x) && nearlyEqual(start.z, end.z) && !nearlyEqual(start.y, end.y)
  ));
  if (overheadMechanicals?.id !== "lobby-mural-overhead-mechanicals"
    || ducts.length !== 6
    || pipes.length !== 18
    || new Set(mechanicalIds).size !== mechanicalIds.length
    || !nearlyEqual(overheadMechanicals?.minClearanceY, muralFacade.topY + 0.5)
    || !nearlyEqual(overheadMechanicals?.maxY, LOBBY_CEILING_PLAN.highHeight - 0.45)
    || !nearlyEqual(overheadMechanicals?.hangerSpacing, 2.4)
    || ducts.some((duct) => duct.materialKey !== "hvacDuct"
      || duct.width < 0.6
      || duct.height < 0.5
      || duct.y < overheadMechanicals.minClearanceY
      || duct.y > overheadMechanicals.maxY
      || !mechanicalPointInCoverage(duct.start)
      || !mechanicalPointInCoverage(duct.end))
    || pipes.some((pipe) => !["black", "utilityPipe"].includes(pipe.materialKey)
      || pipe.radius < 0.08
      || pipe.radius > 0.14
      || pipe.start.y < overheadMechanicals.minClearanceY
      || pipe.end.y < overheadMechanicals.minClearanceY
      || pipe.start.y > overheadMechanicals.maxY
      || pipe.end.y > overheadMechanicals.maxY
      || !mechanicalPointInCoverage(pipe.start)
      || !mechanicalPointInCoverage(pipe.end))
    || Math.max(...ducts.map(({ width }) => width)) < 1
    || Math.max(...pipes.map(({ radius }) => radius)) < 0.14
    || ductRunLength < 140
    || pipeRunLength < 370
    || !hasDiagonalPipe
    || !hasHeaderPipe
    || !hasCrossPipe
    || !hasRiserPipe) {
    errors.push("The V14 high lobby must carry six large HVAC ducts and eighteen distributed overhead pipe runs spanning the full mural zone, including diagonal, header, cross, branch, and riser routes.");
  }

  const expectedServiceTypes = ["pos", "pos", "candy", "pos", "pos", "candy", "pos", "pos"];
  let expectedPosIndex = 0;
  let expectedCandyIndex = 0;
  if (CONCESSION_SERVICE_SEQUENCE.length !== expectedServiceTypes.length
    || CONCESSION_SERVICE_SEQUENCE.some((station, slotIndex) => {
      const type = expectedServiceTypes[slotIndex];
      const slotT = (slotIndex + 0.5) / expectedServiceTypes.length;
      if (type === "pos") expectedPosIndex += 1;
      else expectedCandyIndex += 1;
      const expectedId = type === "pos"
        ? `concession-pos-${expectedPosIndex}`
        : `concession-candy-${expectedCandyIndex}`;
      return station.type !== type
        || station.id !== expectedId
        || station.slotIndex !== slotIndex
        || !nearlyEqual(station.slotT, slotT)
        || !nearlyEqual(station.position[0], concessionRunStart.x + concessionRunDx * slotT)
        || !nearlyEqual(station.position[1], 0)
        || !nearlyEqual(station.position[2], concessionRunStart.z + concessionRunDz * slotT)
        || !nearlyEqual(
          station.rotation,
          type === "candy" ? concessionFixtureRotation : concessionRunRotation,
        )
        || station.counterSegment !== "diagonal-pos-run";
    })
    || POS_STATIONS.length !== 6
    || CONCESSION_CANDY_DISPLAYS.length !== 2
    || POS_STATIONS.some((station) => !CONCESSION_SERVICE_SEQUENCE.includes(station))
    || CONCESSION_CANDY_DISPLAYS.some((station) => !CONCESSION_SERVICE_SEQUENCE.includes(station))) {
    errors.push("Concession service must derive from the eight-slot 2 POS / candy / 2 POS / candy / 2 POS sequence.");
  }

  const poppers = EQUIPMENT_ANCHORS.filter(({ type }) => type === "popper");
  if (poppers.length !== 2
    || poppers.some((popper, index) => popper.id !== `concession-popper-${index + 1}`
      || !nearlyEqual(popper.height, 2.8)
      || !nearlyEqual(popper.glassBottom, 1.05)
      || !nearlyEqual(popper.glassTop, 2.48)
      || !nearlyEqual(popper.canopyBottom, popper.glassTop)
      || !nearlyEqual(popper.canopyTop, 2.76)
      || !nearlyEqual(popper.rotation, concessionFixtureRotation)
      || popper.canopyTop > popper.height)) {
    errors.push("The two V12 concession poppers must use the authored tall glass-and-canopy profile.");
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
