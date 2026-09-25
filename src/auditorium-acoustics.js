import { auditoriumDoorLayout } from "./auditorium-door-layout.js";
import { worldToPlanX } from "./coordinates.js";

const interiorRegions = new WeakMap();
export function auditoriumInteriorContains(room, listener) {
  let regions = interiorRegions.get(room);
  if (!regions) {
    regions = [room.bounds, ...["routeBounds", "stemBounds", "lateralBounds", "longRouteBounds",
      "entranceStemBounds", "entranceLateralBounds", "transverseBounds", "vestibuleBounds", "usherNookBounds"]
      .map(key => room.entry[key]).filter(Boolean)];
    interiorRegions.set(room, regions);
  }
  const entry = auditoriumDoorLayout(room), x = worldToPlanX(listener.x);
  const depth = (listener.x - entry.x) * entry.normal[0] + (listener.z - entry.z) * entry.normal[2];
  return depth > 0 && regions.some(b => x >= b.xMin && x <= b.xMax && listener.z >= b.zMin && listener.z <= b.zMax);
}

/** Distributed auditorium speakers: direction stays positional, but moving
 * farther from the screen inside the room must not make the soundtrack faint. */
export function auditoriumAcoustics(room, listener, screen, door) {
  const entry = auditoriumDoorLayout(room);
  const depth = (listener.x - entry.x) * entry.normal[0] + (listener.z - entry.z) * entry.normal[2];
  const inside = auditoriumInteriorContains(room, listener);
  const t = inside ? Math.min(1, Math.max(0, depth / 3)) : 0, blend = t * t * (3 - 2 * t);
  const anchor = door?.center ?? [entry.x, 1.8, entry.z];
  const distance = Math.hypot(listener.x - anchor[0], listener.z - anchor[2]);
  const closed = (door?.angle ?? 1.57) < .2;
  const outsideGain = distance > 42 ? 0 : (closed ? .045 : .62) / (1 + distance * distance / 64);
  // Cross the doorway continuously, including the dogleg and storage-side
  // approaches before the seating bowl. The room's distributed speakers take
  // over after the threshold, without screen-distance attenuation a second time.
  const threshold = inside ? Math.min(1, depth / .8) : 0;
  const mix = threshold * threshold * (3 - 2 * threshold);
  const outsideCutoff = closed ? 550 : 4800;
  return {
    inside, blend, distance,
    position: [anchor[0] + (screen.x - anchor[0]) * blend, 1.8 + .6 * blend, anchor[2] + (screen.z - anchor[2]) * blend],
    gain: outsideGain + (.62 + .15 * blend - outsideGain) * mix,
    cutoff: outsideCutoff + (4800 + 13200 * blend - outsideCutoff) * mix,
  };
}
