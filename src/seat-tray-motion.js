// The Blender recliner is fitted by its full exported bounds, not by the tray.
// Keep the working tray and its fixed metal swivel post in that same space.
const MODEL_WIDTH = .665, MODEL_HEIGHT = 1.345, MODEL_DEPTH = .73049;
const MODEL_BOTTOM = .06, MODEL_CENTER_Z = .004755;
const SCALE_Y = 1.36 / MODEL_HEIGHT, SCALE_Z = .74 / MODEL_DEPTH;
const angles = new Map();
export function seatTrayGeometry(width) {
  const scaleX = width / MODEL_WIDTH;
  // A short fixed bracket carries the swivel forward from the original post,
  // beneath the closed tabletop. Without it, a full opening turns sideways
  // onto the next customer instead of clearing the chair toward the row aisle.
  return { post: [.25 * scaleX, (.96 - MODEL_BOTTOM) * SCALE_Y, (.12 - MODEL_CENTER_Z) * SCALE_Z],
    pivot: [.25 * scaleX, (.968 - MODEL_BOTTOM) * SCALE_Y, (.27 - MODEL_CENTER_Z) * SCALE_Z],
    offset: [-.18 * scaleX, 0, -.04 * SCALE_Z], size: [.4 * scaleX, .04 * SCALE_Y, .28 * SCALE_Z],
    upholstery: { halfWidth: width / 2, back: (-.36049 - MODEL_CENTER_Z) * SCALE_Z, front: (.325 - MODEL_CENTER_Z) * SCALE_Z } };
}
export function seatTrayCorners(width, angle) {
  const { pivot, offset, size } = seatTrayGeometry(width), cosine = Math.cos(angle), sine = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([side, front]) => {
    const x = offset[0] + side * size[0] / 2, z = offset[2] + front * size[2] / 2;
    return { x: pivot[0] + x * cosine + z * sine, z: pivot[2] - x * sine + z * cosine };
  });
}
function clip(points, inside, intersection) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], aIn = inside(a), bIn = inside(b);
    if (aIn) result.push(a);
    if (aIn !== bIn) result.push(intersection(a, b));
  }
  return result;
}
export function trayOverlapsAdjacentSeat(width, angle, clearance = .012) {
  const { upholstery } = seatTrayGeometry(width), spacing = width + .095;
  // Only the hinge-side neighboring chair is approached by this outward arc.
  // Include the full cushion/footrest silhouette and a small visual clearance.
  const xMin = spacing - upholstery.halfWidth - clearance, zMax = upholstery.front + clearance;
  let points = seatTrayCorners(width, angle);
  points = clip(points, p => p.x >= xMin, (a, b) => ({ x: xMin, z: a.z + (b.z - a.z) * (xMin - a.x) / (b.x - a.x) }));
  points = clip(points, p => p.z <= zMax, (a, b) => ({ z: zMax, x: a.x + (b.x - a.x) * (zMax - a.z) / (b.z - a.z) }));
  return points.length >= 3;
}
export function seatTrayOpenAngle(width) {
  if (angles.has(width)) return angles.get(width);
  const { offset } = seatTrayGeometry(width);
  // This is the forward-most possible tray center around the supported pivot.
  // Stop earlier wherever the neighboring upholstery prevents that rotation.
  let low = 0, high = Math.atan2(-offset[0], offset[2]);
  for (let i = 0; i < 24; i++) {
    const angle = (low + high) / 2;
    if (trayOverlapsAdjacentSeat(width, angle)) high = angle; else low = angle;
  }
  const angle = Math.max(0, low - .002); angles.set(width, angle); return angle;
}
