export const PLAN_MIRROR_AXIS_X = 1.5;

export function planToWorldX(planX) {
  return PLAN_MIRROR_AXIS_X * 2 - planX;
}

export function worldToPlanX(worldX) {
  return PLAN_MIRROR_AXIS_X * 2 - worldX;
}

export function planToWorldPoint(point, target = {}) {
  target.x = planToWorldX(point.x);
  target.y = point.y ?? 0;
  target.z = point.z;
  return target;
}

export function worldToPlanPoint(point, target = {}) {
  target.x = worldToPlanX(point.x);
  target.y = point.y ?? 0;
  target.z = point.z;
  return target;
}

export function planToWorldDirection(direction, target = {}) {
  target.x = -direction.x;
  target.y = direction.y ?? 0;
  target.z = direction.z;
  return target;
}

export function worldToPlanDirection(direction, target = {}) {
  target.x = -direction.x;
  target.y = direction.y ?? 0;
  target.z = direction.z;
  return target;
}

export function planToWorldBounds(bounds) {
  return {
    xMin: planToWorldX(bounds.xMax),
    xMax: planToWorldX(bounds.xMin),
    zMin: bounds.zMin,
    zMax: bounds.zMax,
  };
}

export function planToWorldYaw(planYaw) {
  return -planYaw;
}

export function planToWorldSide(side) {
  if (side === "east") return "west";
  if (side === "west") return "east";
  return side;
}
