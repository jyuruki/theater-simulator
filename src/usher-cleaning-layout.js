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
      const spacing = Math.min(.76, (width - .14) / row.seatCount), rowWidth = spacing * (row.seatCount - 1);
      for (let column = 0; column < row.seatCount; column++, instance++) {
        const x = planToWorldX(layout.centerX - rowWidth / 2 + column * spacing);
        seats.push({ id: `${a.id}-recliner-${row.index}-${column}`, theaterId: a.id, row: row.index, column,
          label: `${row.label}${column + 1}`, instance, x, z: row.z, floorY: row.elevation, forward,
          width: Math.min(.54, spacing - .13), rowColliderId: `${a.id}-seat-row-${row.index}`,
          stand: [x, row.elevation, row.z + forward * .73], floorBounds: planToWorldBounds(row.floorBounds) });
      }
    }
    const apron = layout.frontApronBounds, patchZ = (apron.zMin + apron.zMax) / 2, centerX = planToWorldX(layout.centerX);
    const patches = [-1, 1].map(sign => ({ x: centerX + sign * Math.min(1.7, width * .22),
      y: layout.frontElevation, z: patchZ, bounds: planToWorldBounds(apron) }));
    return { id: a.id, number: a.number, bounds: planToWorldBounds(a.bounds), seats, patches };
  });
}
