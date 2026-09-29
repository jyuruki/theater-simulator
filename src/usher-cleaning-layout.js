import { AUDITORIUMS } from "./layout-data.js";
import { buildAuditoriumLayout } from "./layout-geometry.js";
import { planToWorldX, planToWorldBounds } from "./coordinates.js";

export function createCleaningPlans(world) {
  return AUDITORIUMS.map(a => {
    const layout = world?.auditoriumLayouts?.get(a.id) ?? buildAuditoriumLayout(a);
    const width = layout.seatBounds.xMax - layout.seatBounds.xMin;
    const forward = a.screenSide === "north" ? 1 : -1;
    const seats = []; let instance = 0;
    for (const row of layout.rows) {
      const spacing = row.spacing;
      for (let column = 0; column < row.seatCount; column++, instance++) {
        const x = planToWorldX(row.seatCentersX[column]);
        const group = row.seatGroups.find(group => column >= group.firstColumn && column < group.firstColumn + group.count);
        seats.push({ id: `${a.id}-recliner-${row.index}-${column}`, theaterId: a.id, row: row.index, column,
          label: `${row.label}${column + 1}`, instance, x, z: row.z, floorY: row.elevation, forward,
          width: spacing - .095, groupIndex: group.groupIndex, accessible: row.accessible, rowColliderId: group.colliderId,
          stand: [x, row.elevation, row.z + forward * .73], floorBounds: planToWorldBounds(row.floorBounds) });
      }
    }
    // These apron anchors restore older, partially cleaned saves. New breaks
    // distribute their occasional messes along the occupied seats' row aisles.
    const apron = layout.frontApronBounds, patchZ = (apron.zMin + apron.zMax) / 2, centerX = planToWorldX(layout.centerX);
    const patches = [-1, 1].map(sign => ({ x: centerX + sign * Math.min(1.7, width * .22),
      y: layout.frontElevation, z: patchZ, bounds: planToWorldBounds(apron) }));
    return { id: a.id, number: a.number, geometryVersion: layout.accessibleLanding ? 27 : 26,
      bounds: planToWorldBounds(a.bounds), seats, patches };
  });
}
