/**
 * Opt-in seating profiles. Distances are auditorium-local: translating a room
 * and its entrance never changes its seating shape.
 */
export const SEATING_PROFILES = Object.freeze({
  "front-cross-aisle": Object.freeze({
    id: "front-cross-aisle",
    groundRowIndex: 2,
    frontRowRise: 0.44,
    crossAisleAfterRow: 1,
    crossAisleDepth: 1.3,
    maximumRowPitch: 2.1,
    screenApronDepth: 2.8,
    rowRise: 0.66,
    stairTreadsPerRow: 3,
    rearWallOffset: 0.72,
  }),
});

export function seatingProfileFor(auditorium) {
  const id = auditorium.stadium?.seatingProfile;
  if (!id) return null;
  const profile = SEATING_PROFILES[id];
  if (!profile) throw new RangeError(`${auditorium.id} references unknown seating profile ${id}.`);
  if (auditorium.stadium.access !== "bottom") {
    throw new RangeError(`${auditorium.id} front cross-aisle seating requires a bottom entrance.`);
  }
  if (auditorium.rows.length <= profile.groundRowIndex + 1) {
    throw new RangeError(`${auditorium.id} needs at least four rows for the front cross-aisle profile.`);
  }
  return profile;
}

/** Retain the seat bank and screen apron while widening its rear entry gap. */
export function withRearEntryClearance(auditorium, preset) {
  if (auditorium.stadium.access !== "top" || auditorium.entry.type !== "trash-cubby") return auditorium;
  const { entry, bounds, stadium } = auditorium;
  const originalCubbyFront = entry.cubbyBounds?.zMin ?? bounds.zMax - (entry.cubbyDepth ?? 2.2);
  const firstRow = stadium.frontRowZ ?? bounds.zMin + (stadium.screenApronDepth ?? 3.1);
  const lastRow = firstRow + (auditorium.rows.length - 1) * preset.rowPitch;
  const originalClearance = Number((originalCubbyFront - 0.09 - lastRow - 0.39).toFixed(2));
  const retreat = Math.max(0, originalClearance);
  const cubbyFront = Number((originalCubbyFront + retreat).toFixed(2));
  const depth = Number((bounds.zMax - cubbyFront).toFixed(2));
  if (depth < 2.5) throw new RangeError(`${auditorium.id} rear cubby would be too shallow for its side doorway.`);
  return {
    ...auditorium,
    entry: {
      ...entry,
      ...(entry.cubbyBounds ? { cubbyBounds: { ...entry.cubbyBounds, zMin: cubbyFront } } : { cubbyDepth: depth }),
      innerDoorCenter: (cubbyFront + bounds.zMax) / 2,
      rearClearanceBefore: originalClearance,
      cubbyWallRetreat: retreat,
    },
  };
}
