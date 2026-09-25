import { COURTYARD_PLAN } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";

export function auditoriumCubbyBounds(room) {
  if (room.entry.type !== "trash-cubby") return null;
  const { entry, bounds } = room;
  return entry.cubbyBounds ?? {
    xMin: entry.center - (entry.cubbyHalfWidth ?? 1.6),
    xMax: entry.center + (entry.cubbyHalfWidth ?? 1.6),
    zMin: bounds.zMax - (entry.cubbyDepth ?? 2.2), zMax: bounds.zMax,
  };
}

/** The blind pocket opposite the cubby's exit has no circulation function. */
export function auditoriumBlindAlcove(room) {
  const cubby = auditoriumCubbyBounds(room);
  if (!cubby) return null;
  const xMin = room.entry.turnSide === "east" ? room.bounds.xMin : cubby.xMax;
  const xMax = room.entry.turnSide === "east" ? cubby.xMin : room.bounds.xMax;
  return xMax - xMin > .18 ? { xMin, xMax, zMin: cubby.zMin, zMax: room.bounds.zMax } : null;
}

/** Geometry shared by manual doors and patron routes; positions are world meters. */
export function auditoriumDoorLayout(room) {
  const small = room.entry.type === "trash-cubby";
  const court = COURTYARD_PLAN.doors.find(d => d.targetId === room.id);
  const cubby = auditoriumCubbyBounds(room);
  const width = small ? 1.22 : court?.width ?? (room.number === 6 ? 2.2 : 2.05);
  const x = planToWorldX(small ? (room.entry.turnSide === "west" ? cubby.xMin : cubby.xMax) : room.entry.center);
  const z = small ? room.entry.innerDoorCenter ?? cubby.zMin + 1.05
    : room.entry.outerPlaneZ ?? (room.screenSide === "north" ? room.bounds.zMin : room.bounds.zMax);
  const inward = small ? (room.entry.turnSide === "west" ? 1 : -1) : room.screenSide === "north" ? 1 : -1;
  const normal = small ? [inward, 0, 0] : [0, 0, inward];
  const outside = [x - normal[0] * (small ? 1.65 : .85), 0, z - normal[2] * (small ? 1.65 : .85)];
  const inside = [x + normal[0] * .95, 0, z + normal[2] * .95];
  const route = { outside, threshold: [x, 0, z], inside,
    hall: small ? [planToWorldX(room.entry.center), 0, room.bounds.zMax + .9] : outside,
    cubby: small ? [planToWorldX(room.entry.center), 0, z] : outside };
  return { id: room.id, number: room.number, small, x, z, width, height: room.number === 6 ? 2.18 : 2.48,
    yaw: small ? Math.PI / 2 : 0, hingeSide: small ? 1 : null,
    inward, swing: small ? -inward : inward, normal, route };
}
