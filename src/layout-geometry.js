import { AUDITORIUM_PRESETS } from "./layout-data.js";
import { seatingProfileFor } from "./seating-profiles.js";

const EPSILON = 1e-6;

export const STAIR_TREADS_PER_ROW = 2;
export const DEFAULT_MAX_STEP_UP = 0.34;
export const SEATING_RISER_DEPTH = 0.08;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const lerp = (start, end, amount) => start + (end - start) * amount;

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function pointCoordinates(point, label = "point") {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const z = Array.isArray(point) ? point[1] : point?.z;
  return { x: finite(x, `${label}.x`), z: finite(z, `${label}.z`) };
}

export function normalizeBounds(bounds, label = "bounds") {
  if (!bounds) throw new TypeError(`${label} is required.`);
  const normalized = {
    xMin: finite(bounds.xMin, `${label}.xMin`),
    xMax: finite(bounds.xMax, `${label}.xMax`),
    zMin: finite(bounds.zMin, `${label}.zMin`),
    zMax: finite(bounds.zMax, `${label}.zMax`),
  };
  if (normalized.xMax <= normalized.xMin || normalized.zMax <= normalized.zMin) {
    throw new RangeError(`${label} must have positive width and depth.`);
  }
  return normalized;
}

export function boundsContainPoint(bounds, x, z, padding = 0) {
  return x >= bounds.xMin - padding && x <= bounds.xMax + padding
    && z >= bounds.zMin - padding && z <= bounds.zMax + padding;
}

export function pointInRect(x, z, bounds, padding = 0) {
  return boundsContainPoint(bounds, x, z, padding);
}

export function boundsOverlap(first, second, padding = 0) {
  return first.xMin < second.xMax + padding && first.xMax > second.xMin - padding
    && first.zMin < second.zMax + padding && first.zMax > second.zMin - padding;
}

export function boundsFromPoints(points, padding = 0) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new TypeError("boundsFromPoints requires at least one point.");
  }
  const coordinates = points.map((point, index) => pointCoordinates(point, `points[${index}]`));
  return {
    xMin: Math.min(...coordinates.map(({ x }) => x)) - padding,
    xMax: Math.max(...coordinates.map(({ x }) => x)) + padding,
    zMin: Math.min(...coordinates.map(({ z }) => z)) - padding,
    zMax: Math.max(...coordinates.map(({ z }) => z)) + padding,
  };
}

function pointOnSegment(x, z, start, end, tolerance = EPSILON) {
  const cross = (x - start.x) * (end.z - start.z) - (z - start.z) * (end.x - start.x);
  if (Math.abs(cross) > tolerance) return false;
  const dot = (x - start.x) * (end.x - start.x) + (z - start.z) * (end.z - start.z);
  if (dot < -tolerance) return false;
  const lengthSquared = (end.x - start.x) ** 2 + (end.z - start.z) ** 2;
  return dot <= lengthSquared + tolerance;
}

/** Inclusive point-in-polygon test for lobby and service footprints. */
export function pointInPolygon(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const points = polygon.map((point, index) => pointCoordinates(point, `polygon[${index}]`));
  let inside = false;
  for (let currentIndex = 0, previousIndex = points.length - 1; currentIndex < points.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = points[currentIndex];
    const previous = points[previousIndex];
    if (pointOnSegment(x, z, previous, current)) return true;
    const crosses = (current.z > z) !== (previous.z > z)
      && x < ((previous.x - current.x) * (z - current.z)) / (previous.z - current.z) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw new TypeError("polygonCentroid requires at least three points.");
  }
  const points = polygon.map((point, index) => pointCoordinates(point, `polygon[${index}]`));
  let twiceArea = 0;
  let weightedX = 0;
  let weightedZ = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.z - next.x * current.z;
    twiceArea += cross;
    weightedX += (current.x + next.x) * cross;
    weightedZ += (current.z + next.z) * cross;
  }
  if (Math.abs(twiceArea) <= EPSILON) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
    };
  }
  return { x: weightedX / (3 * twiceArea), z: weightedZ / (3 * twiceArea) };
}

function inferRouteReserve(auditorium) {
  const { bounds, entry } = auditorium;
  if (!entry?.routeSide || (entry.type === "storage-left-then-left" && !entry.directAuditoriumEntry)) return null;

  const candidates = [entry.routeBounds, entry.longRouteBounds, entry.ramp?.bounds, entry.vestibuleBounds]
    .filter(Boolean)
    .map((candidate) => normalizeBounds(candidate));
  let overlapWidth = 0;
  for (const candidate of candidates) {
    const overlapMin = Math.max(bounds.xMin, candidate.xMin);
    const overlapMax = Math.min(bounds.xMax, candidate.xMax);
    overlapWidth = Math.max(overlapWidth, Math.max(0, overlapMax - overlapMin));
  }

  const defaultWidth = auditorium.preset === "medium58" ? 2.5 : 2.5;
  const inferredWidth = Math.max(overlapWidth, defaultWidth);
  const requestedWidth = Number.isFinite(entry.routeWidth)
    ? finite(entry.routeWidth, `${auditorium.id}.entry.routeWidth`)
    : inferredWidth;
  const width = clamp(requestedWidth, 0, (bounds.xMax - bounds.xMin) * 0.34);
  if (width <= EPSILON) return null;
  return entry.routeSide === "west"
    ? { side: "west", width, bounds: { xMin: bounds.xMin, xMax: bounds.xMin + width, zMin: bounds.zMin, zMax: bounds.zMax } }
    : { side: "east", width, bounds: { xMin: bounds.xMax - width, xMax: bounds.xMax, zMin: bounds.zMin, zMax: bounds.zMax } };
}

function resolveFrontRowZ(auditorium, rowPitch) {
  const { bounds, entry, screenSide, stadium } = auditorium;
  if (Number.isFinite(stadium?.frontRowZ)) return stadium.frontRowZ;
  if (screenSide === "north") {
    const fromArrival = Number.isFinite(entry?.arrivalZ) ? entry.arrivalZ + 1.05 : bounds.zMax - 3.45;
    return Math.min(bounds.zMax - 2.8, fromArrival);
  }
  if (screenSide === "south") return bounds.zMin + (stadium?.screenApronDepth ?? 3.1);
  throw new RangeError(`${auditorium.id} has unsupported screenSide ${screenSide}.`);
}

function freezeBounds(bounds) {
  return Object.freeze({ ...bounds });
}

/**
 * Builds the authoritative seating bowl geometry in plan space.
 * Rows are always ordered from the screen/front toward the rear.
 */
export function buildAuditoriumLayout(auditorium, presets = AUDITORIUM_PRESETS) {
  if (!auditorium?.id) throw new TypeError("An auditorium with an id is required.");
  const bounds = normalizeBounds(auditorium.bounds, `${auditorium.id}.bounds`);
  const preset = presets[auditorium.preset];
  if (!preset) throw new RangeError(`${auditorium.id} references unknown preset ${auditorium.preset}.`);
  if (!Array.isArray(auditorium.rows) || auditorium.rows.length < 2) {
    throw new RangeError(`${auditorium.id} needs at least two seating rows.`);
  }
  if (!auditorium.stadium || !["top", "bottom"].includes(auditorium.stadium.access)) {
    throw new RangeError(`${auditorium.id} needs stadium.access set to top or bottom.`);
  }
  if (auditorium.stadium.aisles !== "dual-side") {
    throw new RangeError(`${auditorium.id} must use dual-side aisles.`);
  }

  const seatingProfile = seatingProfileFor(auditorium);
  const rowPitch = seatingProfile
    ? Math.min(finite(preset.rowPitch, `${auditorium.preset}.rowPitch`), seatingProfile.maximumRowPitch)
    : finite(preset.rowPitch, `${auditorium.preset}.rowPitch`);
  const rise = seatingProfile?.rowRise ?? finite(preset.rise, `${auditorium.preset}.rise`);
  const rowTransitions = auditorium.rows.length - 1;
  const levelRowCount = seatingProfile?.levelRowCount ?? 1;
  const steppedRowTransitions = auditorium.rows.length - levelRowCount;
  const stairTreadsPerRow = seatingProfile?.stairTreadsPerRow ?? STAIR_TREADS_PER_ROW;
  const totalRise = steppedRowTransitions * rise;
  const corridorRise = finite(auditorium.stadium.corridorRise ?? 0, `${auditorium.id}.stadium.corridorRise`);
  const frontElevation = auditorium.stadium.access === "top" ? -totalRise : corridorRise;
  const backElevation = auditorium.stadium.access === "top" ? 0 : corridorRise + totalRise;
  const direction = auditorium.screenSide === "north" ? -1 : 1;
  // Arrival is at B/C for the new profile, so it must not determine row A.
  const frontRowZ = seatingProfile
    ? (auditorium.screenSide === "north"
      ? bounds.zMax - seatingProfile.screenApronDepth
      : bounds.zMin + seatingProfile.screenApronDepth)
    : resolveFrontRowZ(auditorium, rowPitch);
  const rowDistance = (index) => index * rowPitch
    + (seatingProfile && index > seatingProfile.crossAisleAfterRow ? seatingProfile.crossAisleDepth : 0);
  const backRowZ = frontRowZ + direction * rowDistance(rowTransitions);
  if (frontRowZ < bounds.zMin - EPSILON || frontRowZ > bounds.zMax + EPSILON
    || backRowZ < bounds.zMin - EPSILON || backRowZ > bounds.zMax + EPSILON) {
    throw new RangeError(`${auditorium.id} seating rows do not fit inside its Z bounds.`);
  }

  const outerMargin = auditorium.stadium.outerMargin ?? 0.48;
  const routeReserve = inferRouteReserve(auditorium);
  let bowlXMin = bounds.xMin + outerMargin;
  let bowlXMax = bounds.xMax - outerMargin;
  if (routeReserve?.side === "west") bowlXMin = Math.max(bowlXMin, routeReserve.bounds.xMax);
  if (routeReserve?.side === "east") bowlXMax = Math.min(bowlXMax, routeReserve.bounds.xMin);

  const sideAisleWidth = finite(auditorium.stadium.sideAisleWidth, `${auditorium.id}.stadium.sideAisleWidth`);
  if (bowlXMax - bowlXMin <= sideAisleWidth * 2 + 1) {
    throw new RangeError(`${auditorium.id} has insufficient width for two side aisles and seating.`);
  }

  const stairZMin = Math.min(frontRowZ, backRowZ);
  const stairZMax = Math.max(frontRowZ, backRowZ);
  const rearWallZ = seatingProfile ? backRowZ + direction * seatingProfile.rearWallOffset : null;
  const bowlBounds = freezeBounds({
    xMin: bowlXMin, xMax: bowlXMax,
    zMin: seatingProfile && direction < 0 ? rearWallZ : bounds.zMin,
    zMax: seatingProfile && direction > 0 ? rearWallZ : bounds.zMax,
  });
  const seatBounds = freezeBounds({
    xMin: bowlXMin + sideAisleWidth,
    xMax: bowlXMax - sideAisleWidth,
    zMin: stairZMin,
    zMax: stairZMax,
  });
  const westAisle = Object.freeze({
      side: "west",
      centerX: bowlXMin + sideAisleWidth / 2,
      bounds: freezeBounds({ xMin: bowlXMin, xMax: bowlXMin + sideAisleWidth, zMin: bowlBounds.zMin, zMax: bowlBounds.zMax }),
    });
  const eastAisle = Object.freeze({
      side: "east",
      centerX: bowlXMax - sideAisleWidth / 2,
      bounds: freezeBounds({ xMin: bowlXMax - sideAisleWidth, xMax: bowlXMax, zMin: bowlBounds.zMin, zMax: bowlBounds.zMax }),
    });
  const sideAisles = Object.freeze({ west: westAisle, east: eastAisle });

  const rows = Object.freeze(auditorium.rows.map((seatCount, index) => {
    const z = frontRowZ + direction * rowDistance(index);
    const elevation = frontElevation + Math.max(0, index - levelRowCount + 1) * rise;
    let frontDistance = rowDistance(index) - rowPitch / 2;
    let rearDistance = rowDistance(index) + rowPitch / 2;
    if (seatingProfile) {
      if (index >= levelRowCount) frontDistance += SEATING_RISER_DEPTH / 2;
      if (index >= levelRowCount - 1 && index < rowTransitions) rearDistance -= SEATING_RISER_DEPTH / 2;
      if (index === rowTransitions) rearDistance = rowDistance(index) + seatingProfile.rearWallOffset - 0.09;
    } else {
      frontDistance += SEATING_RISER_DEPTH / 2;
      rearDistance -= SEATING_RISER_DEPTH / 2;
    }
    const firstZ = frontRowZ + direction * frontDistance;
    const secondZ = frontRowZ + direction * rearDistance;
    return Object.freeze({
      index,
      label: String.fromCharCode(65 + index),
      seatCount,
      z,
      elevation,
      floorBounds: freezeBounds({
        xMin: seatBounds.xMin, xMax: seatBounds.xMax,
        zMin: Math.min(firstZ, secondZ), zMax: Math.max(firstZ, secondZ),
      }),
    });
  }));

  const entryCrossCenterZ = seatingProfile
    ? (rows[seatingProfile.crossAisleAfterRow].z + rows[seatingProfile.crossAisleAfterRow + 1].z) / 2
    : null;
  const entryCross = seatingProfile ? Object.freeze({
    id: `${auditorium.id}-entry-cross-aisle`,
    elevation: frontElevation,
    beforeRow: "B", afterRow: "C",
    centerZ: entryCrossCenterZ,
    bounds: freezeBounds({
      xMin: bowlXMin, xMax: bowlXMax,
      zMin: entryCrossCenterZ - seatingProfile.crossAisleDepth / 2,
      zMax: entryCrossCenterZ + seatingProfile.crossAisleDepth / 2,
    }),
    // Side strips already have a continuous flat floor; avoid coplanar slabs.
    floorBounds: freezeBounds({
      xMin: seatBounds.xMin, xMax: seatBounds.xMax,
      zMin: entryCrossCenterZ - seatingProfile.crossAisleDepth / 2,
      zMax: entryCrossCenterZ + seatingProfile.crossAisleDepth / 2,
    }),
  }) : null;
  const flatSideAisles = Object.freeze(seatingProfile ? Object.values(sideAisles).map((aisle) => Object.freeze({
    id: `${auditorium.id}-${aisle.side}-level-front-aisle`,
    elevation: frontElevation,
    bounds: freezeBounds({ ...aisle.bounds,
      zMin: Math.min(frontRowZ, rows[levelRowCount - 1].z),
      zMax: Math.max(frontRowZ, rows[levelRowCount - 1].z),
    }),
  })) : []);

  const crossDepth = auditorium.stadium.crossAisleDepth ?? 1.1;
  const frontCrossCenterZ = clamp(
    frontRowZ + direction * crossDepth * 0.5,
    bounds.zMin + crossDepth / 2,
    bounds.zMax - crossDepth / 2,
  );
  const rearCrossCenterZ = seatingProfile
    ? backRowZ + direction * seatingProfile.rearWallOffset / 2
    : clamp(
    backRowZ + direction * crossDepth * 0.5,
    bounds.zMin + crossDepth / 2,
    bounds.zMax - crossDepth / 2,
  );
  const frontCross = entryCross ?? Object.freeze({
    id: `${auditorium.id}-front-cross-aisle`,
    elevation: frontElevation,
    bounds: freezeBounds({
      xMin: bowlXMin,
      xMax: bowlXMax,
      zMin: frontCrossCenterZ - crossDepth / 2,
      zMax: frontCrossCenterZ + crossDepth / 2,
    }),
  });
  const rearCross = Object.freeze({
    id: `${auditorium.id}-rear-cross-aisle`,
    elevation: backElevation,
    bounds: freezeBounds({
      xMin: bowlXMin,
      xMax: bowlXMax,
      zMin: rearCrossCenterZ - (seatingProfile ? seatingProfile.rearWallOffset : crossDepth) / 2,
      zMax: rearCrossCenterZ + (seatingProfile ? seatingProfile.rearWallOffset : crossDepth) / 2,
    }),
    walkableCrossing: !seatingProfile,
  });

  const layout = {
    id: auditorium.id,
    number: auditorium.number,
    auditorium,
    preset,
    bounds: freezeBounds(bounds),
    access: auditorium.stadium.access,
    screenSide: auditorium.screenSide,
    direction,
    rowPitch,
    rise,
    halfStepRise: rise / stairTreadsPerRow,
    stairTreadsPerRow,
    levelRowCount,
    steppedRowTransitions,
    seatingProfile,
    rowTransitions,
    totalRise,
    corridorRise,
    frontElevation,
    backElevation,
    frontRowZ,
    backRowZ,
    rearWallZ,
    bowlBounds,
    seatBounds,
    centerX: (seatBounds.xMin + seatBounds.xMax) / 2,
    sideAisleWidth,
    sideAisles,
    frontCross,
    rearCross,
    entryCross,
    flatSideAisles,
    routeReserve: routeReserve ? Object.freeze({ ...routeReserve, bounds: freezeBounds(routeReserve.bounds) }) : null,
    rows,
  };
  layout.sideStairTreads = buildSideStairTreads(layout);
  layout.routeSurfaces = buildRouteSurfaceDescriptors(auditorium, layout);
  return Object.freeze(layout);
}

/** Only elevated transitions produce stairs, duplicated on both side aisles. */
export function buildSideStairTreads(layout) {
  const treads = [];
  for (const aisle of Object.values(layout.sideAisles)) {
    for (let transition = 0; transition < layout.rowTransitions; transition += 1) {
      const previous = layout.rows[transition];
      const next = layout.rows[transition + 1];
      if (Math.abs(next.elevation - previous.elevation) <= EPSILON) continue;
      const transitionStartZ = previous.z;
      const transitionDistance = Math.abs(next.z - previous.z);
      for (let half = 0; half < layout.stairTreadsPerRow; half += 1) {
        const startZ = transitionStartZ
          + layout.direction * transitionDistance * (half / layout.stairTreadsPerRow);
        const endZ = transitionStartZ
          + layout.direction * transitionDistance * ((half + 1) / layout.stairTreadsPerRow);
        const elevation = previous.elevation
          + (half + 1) * layout.halfStepRise;
        treads.push(Object.freeze({
          id: `${layout.id}-${aisle.side}-stair-${transition}-${half}`,
          kind: "stadium-stair-tread",
          auditoriumId: layout.id,
          side: aisle.side,
          transition,
          half,
          elevation,
          stepRise: layout.halfStepRise,
          bounds: freezeBounds({
            xMin: aisle.bounds.xMin,
            xMax: aisle.bounds.xMax,
            zMin: Math.min(startZ, endZ),
            zMax: Math.max(startZ, endZ),
          }),
        }));
      }
    }
  }
  return Object.freeze(treads);
}

function flatSurface(id, bounds, height, auditoriumId, kind = "flat-route") {
  return Object.freeze({
    id,
    kind,
    auditoriumId,
    bounds: freezeBounds(normalizeBounds(bounds, `${id}.bounds`)),
    height,
    startHeight: height,
    endHeight: height,
    axis: null,
  });
}

function rampSurface(id, ramp, auditoriumId) {
  const bounds = normalizeBounds(ramp.bounds, `${id}.bounds`);
  const axis = ramp.axis ?? ((bounds.zMax - bounds.zMin) >= (bounds.xMax - bounds.xMin) ? "z" : "x");
  const direction = ramp.direction === -1 ? -1 : 1;
  return Object.freeze({
    id,
    kind: "corridor-ramp",
    auditoriumId,
    bounds: freezeBounds(bounds),
    startHeight: finite(ramp.startHeight, `${id}.startHeight`),
    endHeight: finite(ramp.endHeight, `${id}.endHeight`),
    axis,
    direction,
  });
}

function addRouteReserveSurface(surfaces, auditorium, layout) {
  if (!layout.routeReserve || !Number.isFinite(auditorium.entry?.arrivalZ)) return;
  const entry = auditorium.entry;
  // A direct route (Theater 3) already contributes its accurately segmented
  // flat/ramp/flat descriptors above. Its reserve only removes that strip from
  // the seating bowl; adding a second flat descriptor would mask the incline.
  if (entry.directAuditoriumEntry && entry.routeBounds) return;
  const startZ = entry.vestibuleBounds?.zMax
    ?? entry.lateralBounds?.zMax
    ?? entry.stemBounds?.zMax
    ?? entry.transverseBounds?.zMax
    ?? auditorium.bounds.zMin;
  const endZ = auditorium.screenSide === "north"
    ? auditorium.bounds.zMax - 0.2
    : Math.max(startZ + 0.05, entry.arrivalZ + 0.35);
  surfaces.push(flatSurface(
    `${auditorium.id}-reserved-side-route`,
    {
      xMin: layout.routeReserve.bounds.xMin,
      xMax: layout.routeReserve.bounds.xMax,
      zMin: Math.min(startZ, endZ),
      zMax: Math.max(startZ, endZ),
    },
    layout.corridorRise,
    auditorium.id,
  ));
}

/** Describes flat and gently sloped entry floors without creating meshes. */
export function buildRouteSurfaceDescriptors(auditorium, layout) {
  const entry = auditorium.entry ?? {};
  const surfaces = [];
  // The arrival must already be level when it reaches the B/C cross-aisle.
  // Keep the ramp's original start and total rise; only its end moves with
  // the seating opening. These rooms' approach direction is positive Z.
  const rampDefinition = entry.ramp && layout.entryCross
    ? { ...entry.ramp, bounds: { ...entry.ramp.bounds, zMax: layout.entryCross.bounds.zMin } }
    : entry.ramp;
  const ramp = rampDefinition ? rampSurface(`${auditorium.id}-entry-ramp`, rampDefinition, auditorium.id) : null;

  if (entry.routeBounds && ramp) {
    const routeBounds = normalizeBounds(entry.routeBounds);
    if (ramp.axis === "z") {
      if (routeBounds.zMin < ramp.bounds.zMin - EPSILON) {
        surfaces.push(flatSurface(`${auditorium.id}-route-before-ramp`, {
          ...routeBounds, zMax: ramp.bounds.zMin,
        }, ramp.startHeight, auditorium.id));
      }
      surfaces.push(ramp);
      if (routeBounds.zMax > ramp.bounds.zMax + EPSILON) {
        surfaces.push(flatSurface(`${auditorium.id}-route-after-ramp`, {
          ...routeBounds, zMin: ramp.bounds.zMax,
        }, ramp.endHeight, auditorium.id));
      }
    } else {
      if (routeBounds.xMin < ramp.bounds.xMin - EPSILON) {
        surfaces.push(flatSurface(`${auditorium.id}-route-before-ramp`, {
          ...routeBounds, xMax: ramp.bounds.xMin,
        }, ramp.startHeight, auditorium.id));
      }
      surfaces.push(ramp);
      if (routeBounds.xMax > ramp.bounds.xMax + EPSILON) {
        surfaces.push(flatSurface(`${auditorium.id}-route-after-ramp`, {
          ...routeBounds, xMin: ramp.bounds.xMax,
        }, ramp.endHeight, auditorium.id));
      }
    }
  } else {
    if (entry.routeBounds) {
      surfaces.push(flatSurface(`${auditorium.id}-entry-route`, entry.routeBounds, layout.corridorRise, auditorium.id));
    }
    if (ramp) surfaces.push(ramp);
  }

  for (const [field, label] of [
    ["entranceStemBounds", "entrance-stem"],
    ["entranceLateralBounds", "entrance-lateral"],
    ["stemBounds", "stem"],
    ["lateralBounds", "lateral"],
    ["transverseBounds", "transverse-route"],
    ["longRouteBounds", "long-route"],
    ["vestibuleBounds", "vestibule"],
    ["usherNookBounds", "usher-nook"],
  ]) {
    if (entry[field]) {
      const height = field === "usherNookBounds" && entry.ramp
        ? entry.ramp.startHeight
        : layout.corridorRise;
      surfaces.push(flatSurface(`${auditorium.id}-${label}`, entry[field], height, auditorium.id));
    }
  }

  if (entry.type === "straight-side" && ramp) {
    const approachEnd = ramp.axis === "z" ? ramp.bounds.zMin : auditorium.bounds.zMin + 0.9;
    if (approachEnd > auditorium.bounds.zMin + EPSILON) {
      surfaces.push(flatSurface(`${auditorium.id}-soundlock-floor`, {
        xMin: ramp.bounds.xMin,
        xMax: ramp.bounds.xMax,
        zMin: auditorium.bounds.zMin,
        zMax: approachEnd,
      }, ramp.startHeight, auditorium.id));
    }
  }

  if (entry.type === "trash-cubby") {
    let cubbyBounds = entry.cubbyBounds;
    if (!cubbyBounds) {
      const halfWidth = entry.cubbyHalfWidth ?? 1.6;
      const depth = entry.cubbyDepth ?? 2.2;
      cubbyBounds = {
        xMin: entry.center - halfWidth,
        xMax: entry.center + halfWidth,
        zMin: auditorium.bounds.zMax - depth,
        zMax: auditorium.bounds.zMax,
      };
    }
    surfaces.push(flatSurface(
      `${auditorium.id}-cubby-landing`,
      cubbyBounds,
      layout.backElevation,
      auditorium.id,
      "top-entry-landing",
    ));
  }

  addRouteReserveSurface(surfaces, auditorium, layout);
  return Object.freeze(surfaces);
}

export function sampleSurfaceDescriptor(surface, x, z) {
  if (!boundsContainPoint(surface.bounds, x, z)) return null;
  if (surface.kind !== "corridor-ramp") return surface.height;
  const coordinate = surface.axis === "x" ? x : z;
  const minimum = surface.axis === "x" ? surface.bounds.xMin : surface.bounds.zMin;
  const maximum = surface.axis === "x" ? surface.bounds.xMax : surface.bounds.zMax;
  let progress = clamp((coordinate - minimum) / Math.max(EPSILON, maximum - minimum), 0, 1);
  if (surface.direction < 0) progress = 1 - progress;
  return lerp(surface.startHeight, surface.endHeight, progress);
}

function candidate(surface, height, priority) {
  return Object.freeze({
    id: surface.id,
    surfaceId: surface.id,
    auditoriumId: surface.auditoriumId,
    kind: surface.kind,
    level: surface.kind === "corridor-ramp" || surface.kind.includes("route") || surface.kind.includes("landing")
      ? "entry-route"
      : "seating-bowl",
    height,
    priority,
    walkable: true,
  });
}

export function sampleRouteFloorCandidates(layout, x, z) {
  const containing = layout.routeSurfaces.filter((surface) => boundsContainPoint(surface.bounds, x, z));
  const ramps = containing.filter((surface) => surface.kind === "corridor-ramp");
  const selected = ramps.length ? ramps : containing;
  return selected.map((surface) => candidate(surface, sampleSurfaceDescriptor(surface, x, z), 80));
}

function progressFromFront(layout, z) {
  return (z - layout.frontRowZ) * layout.direction;
}

export function sampleSideStairHeight(layout, z) {
  const distance = progressFromFront(layout, z);
  const totalDistance = Math.abs(layout.backRowZ - layout.frontRowZ);
  if (distance <= EPSILON) return layout.frontElevation;
  if (distance >= totalDistance - EPSILON) return layout.backElevation;
  for (let index = 1; index < layout.rows.length; index += 1) {
    const previous = layout.rows[index - 1];
    const next = layout.rows[index];
    const endDistance = progressFromFront(layout, next.z);
    if (distance > endDistance + EPSILON) continue;
    if (Math.abs(next.elevation - previous.elevation) <= EPSILON) return previous.elevation;
    const startDistance = progressFromFront(layout, previous.z);
    const stepDepth = (endDistance - startDistance) / layout.stairTreadsPerRow;
    const stepIndex = clamp(Math.ceil((distance - startDistance) / stepDepth - EPSILON), 0, layout.stairTreadsPerRow);
    return previous.elevation + stepIndex * layout.halfStepRise;
  }
  return layout.backElevation;
}

export function sampleTierHeight(layout, z) {
  const distance = progressFromFront(layout, z);
  for (let index = 1; index < layout.rows.length; index += 1) {
    const previous = layout.rows[index - 1];
    const next = layout.rows[index];
    const boundaryDistance = progressFromFront(layout, (previous.z + next.z) / 2);
    if (distance < boundaryDistance) return previous.elevation;
  }
  return layout.backElevation;
}

export function sampleBowlFloorCandidate(layout, x, z) {
  if (!boundsContainPoint(layout.bowlBounds, x, z)) return null;
  const aisle = Object.values(layout.sideAisles)
    .find((candidateAisle) => boundsContainPoint(candidateAisle.bounds, x, z));
  const height = aisle ? sampleSideStairHeight(layout, z) : sampleTierHeight(layout, z);
  return Object.freeze({
    id: `${layout.id}-${aisle ? `${aisle.side}-stair` : "tier"}-surface`,
    surfaceId: `${layout.id}-${aisle ? `${aisle.side}-stair` : "tier"}-surface`,
    auditoriumId: layout.id,
    kind: aisle ? "stadium-stair" : "seating-tier",
    level: "seating-bowl",
    side: aisle?.side ?? null,
    height,
    priority: aisle ? 60 : 40,
    walkable: true,
  });
}

/** Returns every plausible floor at X/Z; callers resolve stacked levels with feetY. */
export function sampleAuditoriumGroundCandidates(layout, x, z) {
  const candidates = sampleRouteFloorCandidates(layout, x, z);
  const bowl = sampleBowlFloorCandidate(layout, x, z);
  if (bowl) candidates.push(bowl);
  return candidates;
}

export const sampleRouteGround = sampleRouteFloorCandidates;
export const sampleAuditoriumGround = sampleAuditoriumGroundCandidates;

function deduplicateCandidates(candidates, epsilon) {
  const sorted = [...candidates]
    .filter((item) => item && item.walkable !== false && Number.isFinite(item.height))
    .sort((first, second) => (second.priority ?? 0) - (first.priority ?? 0) || second.height - first.height);
  const unique = [];
  for (const item of sorted) {
    if (!unique.some((other) => Math.abs(other.height - item.height) <= epsilon && other.level === item.level)) {
      unique.push(item);
    }
  }
  return unique;
}

/**
 * Resolves overlapping route, seating, and storage floors. Candidates more
 * than maxStepUp above the current feet are ignored when a reachable floor
 * exists; the closest remaining height wins, with lower floors winning ties.
 */
export function selectStackedFloorCandidate(candidates, feetY, options = {}) {
  const epsilon = options.epsilon ?? 1e-4;
  const unique = deduplicateCandidates(candidates, epsilon);
  if (!unique.length) return null;
  if (!Number.isFinite(feetY)) {
    return [...unique].sort((first, second) => second.height - first.height || second.priority - first.priority)[0];
  }

  const maxStepUp = options.maxStepUp ?? DEFAULT_MAX_STEP_UP;
  const reachable = unique.filter((item) => item.height <= feetY + maxStepUp + epsilon);
  const pool = reachable.length ? reachable : unique;
  pool.sort((first, second) => {
    const firstDistance = Math.abs(first.height - feetY);
    const secondDistance = Math.abs(second.height - feetY);
    if (Math.abs(firstDistance - secondDistance) > epsilon) return firstDistance - secondDistance;
    if (Math.abs(first.height - second.height) > epsilon) return first.height - second.height;
    return (second.priority ?? 0) - (first.priority ?? 0);
  });
  return pool[0];
}

export const selectGroundCandidate = selectStackedFloorCandidate;

export function selectStackedFloorHeight(candidates, feetY, options) {
  return selectStackedFloorCandidate(candidates, feetY, options)?.height ?? null;
}

export function buildAuditoriumLayouts(auditoriums, presets = AUDITORIUM_PRESETS) {
  if (!Array.isArray(auditoriums)) throw new TypeError("buildAuditoriumLayouts requires an auditorium array.");
  return new Map(auditoriums.map((auditorium) => [auditorium.id, buildAuditoriumLayout(auditorium, presets)]));
}

export const buildAllAuditoriumLayouts = buildAuditoriumLayouts;
