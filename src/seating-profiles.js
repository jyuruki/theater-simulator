/**
 * Opt-in seating profiles. Distances are auditorium-local: translating a room
 * and its entrance never changes its seating shape.
 */
export const SEATING_PROFILES = Object.freeze({
  "front-cross-aisle": Object.freeze({
    id: "front-cross-aisle",
    levelRowCount: 3,
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
  if (auditorium.rows.length <= profile.levelRowCount) {
    throw new RangeError(`${auditorium.id} needs at least four rows for the front cross-aisle profile.`);
  }
  return profile;
}
