import { COURTYARD_PLAN } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";

/** Geometry shared by manual doors and patron routes; positions are world meters. */
export function auditoriumDoorLayout(room) {
  const small = room.entry.type === "trash-cubby";
  const court = COURTYARD_PLAN.doors.find(d => d.targetId === room.id);
  const cubby = room.entry.cubbyBounds ?? {
    xMin: room.entry.center - (room.entry.cubbyHalfWidth ?? 1.6),
    xMax: room.entry.center + (room.entry.cubbyHalfWidth ?? 1.6),
    zMin: room.bounds.zMax - (room.entry.cubbyDepth ?? 2.2),
  };
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
    yaw: small ? Math.PI / 2 : 0, inward, swing: small ? -inward : inward, normal, route };
}
