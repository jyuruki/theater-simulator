import {
  AUDITORIUMS,
  COURTYARD_PLAN,
  FOUNTAIN_PLAN,
  HALL_END_EXITS,
  MAP_BOUNDS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
} from "./layout-data.js";

const DESIGN_WIDTH = 700;
const DESIGN_HEIGHT = 360;
const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

const COLORS = Object.freeze({
  background: "#111017",
  grid: "rgba(255,255,255,0.035)",
  outline: "rgba(246,239,226,0.42)",
  text: "rgba(250,246,238,0.9)",
  mutedText: "rgba(250,246,238,0.58)",
  screen: "#5c84ff",
  player: "#f04452",
});

const ZONE_COLORS = Object.freeze({
  exterior: "rgba(50,52,64,0.32)",
  lobby: "rgba(83,58,82,0.72)",
  ticket: "rgba(124,60,70,0.78)",
  corridor: "rgba(52,55,68,0.82)",
  auditorium: "rgba(58,43,61,0.9)",
  restroom: "rgba(43,71,91,0.9)",
  storage: "rgba(82,70,43,0.9)",
  "storage-lower": "rgba(86,72,46,0.3)",
  office: "rgba(61,66,80,0.92)",
  kitchen: "rgba(111,68,39,0.9)",
  concession: "rgba(116,55,70,0.9)",
  bar: "rgba(94,47,72,0.92)",
  "soda-service": "rgba(62,88,104,0.88)",
  trash: "rgba(77,78,83,0.92)",
  electrical: "rgba(57,62,75,0.94)",
});

const SERVICE_LABELS = Object.freeze({
  "office-overflow": "STOCK",
  "future-task-room": "TASK",
  "electrical-room": "ELEC",
  "under-storage-3": "U/S 3",
  "under-storage-6": "U/S 6",
});

const ROUTE_STYLE = Object.freeze({
  fill: "rgba(224,166,102,0.15)",
  stroke: "rgba(244,201,145,0.78)",
  lowerFill: "rgba(198,160,102,0.09)",
});

const BOYS_ENTRY_FEATURES = Object.freeze({
  "boys-fountain-alcove": {
    label: "H₂O",
    fill: "rgba(43,93,113,0.96)",
  },
  "boys-men-entry-cubby": {
    label: "MEN",
    fill: "rgba(48,76,101,0.98)",
  },
});

const boysEntryFeatureIds = new Set(Object.keys(BOYS_ENTRY_FEATURES));

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveCanvas(canvasOrSelector) {
  if (canvasOrSelector && typeof canvasOrSelector.getContext === "function") {
    return canvasOrSelector;
  }

  if (typeof document === "undefined") {
    throw new Error("A canvas element is required outside a browser.");
  }

  const canvas = document.querySelector(canvasOrSelector || "#minimap");
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new Error(`Minimap canvas not found: ${canvasOrSelector || "#minimap"}`);
  }

  return canvas;
}

function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function createView(width, height) {
  const padding = clamp(width * 0.018, 6, 12);
  const worldWidth = MAP_BOUNDS.xMax - MAP_BOUNDS.xMin;
  const worldDepth = MAP_BOUNDS.zMax - MAP_BOUNDS.zMin;
  const scale = Math.min(
    (width - padding * 2) / worldWidth,
    (height - padding * 2) / worldDepth,
  );
  const contentWidth = worldWidth * scale;
  const contentHeight = worldDepth * scale;

  return {
    width,
    height,
    scale,
    originX: (width - contentWidth) / 2,
    originY: (height - contentHeight) / 2,
  };
}

function project(x, z, view) {
  return {
    x: view.originX + (x - MAP_BOUNDS.xMin) * view.scale,
    y: view.height - view.originY - (z - MAP_BOUNDS.zMin) * view.scale,
  };
}

function projectBounds(bounds, view) {
  const topLeft = project(bounds.xMin, bounds.zMax, view);
  const bottomRight = project(bounds.xMax, bounds.zMin, view);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

function fillZone(context, zone, view, options = {}) {
  const rectangle = projectBounds(zone.bounds, view);
  const fill = options.fill || ZONE_COLORS[zone.kind] || "rgba(65,65,76,0.82)";
  const dashed = options.dashed || zone.kind === "exterior" || zone.kind === "storage-lower";

  context.save();
  if (options.square) {
    context.beginPath();
    context.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  } else {
    roundedRectPath(
      context,
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      Math.min(2.5, rectangle.width * 0.08, rectangle.height * 0.08),
    );
  }
  context.fillStyle = fill;
  context.fill();
  if (options.stroke !== false) {
    context.setLineDash(dashed ? [3, 2.5] : []);
    context.lineWidth = zone.kind === "corridor" ? 1.2 : 0.8;
    context.strokeStyle = COLORS.outline;
    context.stroke();
  }
  context.restore();

  return rectangle;
}

function fillFootprint(context, room, view) {
  const rectangles = room.footprintRects || [room.bounds];
  const fill = ZONE_COLORS[room.kind] || "rgba(65,65,76,0.82)";

  context.save();
  context.fillStyle = fill;
  for (const bounds of rectangles) {
    const rectangle = projectBounds(bounds, view);
    context.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  }

  // Trace only exposed rectangle-union edges. Drawing every source rectangle
  // would invent walls through the connected BB/GB floor plans.
  const xs = [...new Set(rectangles.flatMap(({ xMin, xMax }) => [xMin, xMax]))].sort((a, b) => a - b);
  const zs = [...new Set(rectangles.flatMap(({ zMin, zMax }) => [zMin, zMax]))].sort((a, b) => a - b);
  const occupied = (x, z) => rectangles.some((bounds) => (
    x > bounds.xMin && x < bounds.xMax && z > bounds.zMin && z < bounds.zMax
  ));

  context.beginPath();
  for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
    for (let zIndex = 0; zIndex < zs.length - 1; zIndex += 1) {
      const xMin = xs[xIndex];
      const xMax = xs[xIndex + 1];
      const zMin = zs[zIndex];
      const zMax = zs[zIndex + 1];
      const centerX = (xMin + xMax) / 2;
      const centerZ = (zMin + zMax) / 2;
      if (!occupied(centerX, centerZ)) continue;

      const addEdge = (firstX, firstZ, secondX, secondZ) => {
        const first = project(firstX, firstZ, view);
        const second = project(secondX, secondZ, view);
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
      };
      const xProbe = Math.max(0.0001, (xMax - xMin) * 0.01);
      const zProbe = Math.max(0.0001, (zMax - zMin) * 0.01);
      if (!occupied(xMin - xProbe, centerZ)) addEdge(xMin, zMin, xMin, zMax);
      if (!occupied(xMax + xProbe, centerZ)) addEdge(xMax, zMin, xMax, zMax);
      if (!occupied(centerX, zMin - zProbe)) addEdge(xMin, zMin, xMax, zMin);
      if (!occupied(centerX, zMax + zProbe)) addEdge(xMin, zMax, xMax, zMax);
    }
  }
  context.setLineDash([]);
  context.lineWidth = 0.8;
  context.strokeStyle = COLORS.outline;
  context.stroke();
  context.restore();

  return projectBounds(room.bounds, view);
}

function fitFontSize(label, rectangle, preferred, minimum = 5.5) {
  const widthLimit = rectangle.width / Math.max(1, label.length * 0.62);
  const heightLimit = rectangle.height * 0.42;
  return clamp(Math.min(preferred, widthLimit, heightLimit), minimum, preferred);
}

function drawCenteredLabel(context, label, rectangle, options = {}) {
  const fontSize = fitFontSize(label, rectangle, options.preferredSize || 8.5, options.minimumSize || 5.5);
  const anchorX = clamp(options.anchorX ?? 0.5, 0, 1);
  const anchorY = clamp(options.anchorY ?? 0.5, 0, 1);
  context.save();
  context.fillStyle = options.color || COLORS.text;
  context.font = `${options.weight || 800} ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    label,
    rectangle.x + rectangle.width * anchorX,
    rectangle.y + rectangle.height * anchorY,
    Math.max(1, rectangle.width - 2),
  );
  context.restore();
}

function drawPublicSpaces(context, view) {
  for (const space of PUBLIC_SPACES) {
    if (COURTYARD_PLAN.publicSpaceIds.includes(space.id) || boysEntryFeatureIds.has(space.id)) continue;
    // The V10 theater hall is a stepped union: its T9-side run is wider and
    // narrows exactly at the drinking-fountain wall. Drawing its broad bounds
    // would invent floor in the notch, so all multi-rectangle public spaces
    // use the same footprint renderer as the concave restrooms.
    const rectangle = space.footprintRects?.length
      ? fillFootprint(context, space, view)
      : fillZone(context, space, view);
    const label = {
      lobby: "LOBBY",
      "lobby-approach": "LOBBY HALL",
      "ticket-check": "TICKETS",
      "ticket-poster-alcove": "POSTER",
      "ticket-empty-alcove": "ALCOVE",
      "main-corridor": "THEATER HALL",
    }[space.id];

    if (label) {
      drawCenteredLabel(context, label, rectangle, {
        color: "rgba(250,246,238,0.35)",
        preferredSize: space.id === "main-corridor" ? 6.5
          : space.id.includes("alcove") ? 4.6
            : 7.5,
        minimumSize: space.id.includes("alcove") ? 3.4 : 4.5,
        weight: 700,
      });
    }
  }

  const courtyardRectangle = fillZone(context, {
    id: COURTYARD_PLAN.id,
    bounds: COURTYARD_PLAN.bounds,
    kind: "soda-service",
  }, view);
  drawCenteredLabel(context, "FOUNTAIN / T3–5 COURT", courtyardRectangle, {
    color: "rgba(250,246,238,0.4)",
    preferredSize: 7.2,
    minimumSize: 4.5,
    weight: 700,
  });

  for (const [id, bounds] of Object.entries(FOUNTAIN_PLAN)) {
    const rectangle = fillZone(context, {
      id: `minimap-${id}`,
      bounds,
      kind: "storage",
    }, view, {
      fill: id === "island" ? "rgba(120,92,65,0.95)" : "rgba(99,80,63,0.95)",
    });
    if (rectangle.width > 24 && rectangle.height > 4) {
      drawCenteredLabel(context, id === "island" ? "DRINKS" : "REAR COUNTER", rectangle, {
        preferredSize: 4.8,
        minimumSize: 3.8,
        color: "rgba(250,246,238,0.62)",
      });
    }
  }

  const partition = COURTYARD_PLAN.waistPartition;
  fillZone(context, {
    id: "theater-3-task-waist-partition",
    bounds: {
      xMin: partition.x - partition.thickness / 2,
      xMax: partition.x + partition.thickness / 2,
      zMin: partition.zMin,
      zMax: partition.zMax,
    },
    kind: "storage",
  }, view, { fill: "rgba(43,205,210,0.98)" });
}

function drawBoysEntryFeatures(context, view) {
  for (const space of PUBLIC_SPACES) {
    const feature = BOYS_ENTRY_FEATURES[space.id];
    if (!feature) continue;
    const rectangle = fillZone(context, space, view, {
      fill: feature.fill,
      square: true,
    });
    drawCenteredLabel(context, feature.label, rectangle, {
      color: "rgba(250,246,238,0.82)",
      preferredSize: 5.2,
      minimumSize: 3.2,
      weight: 800,
    });
  }
}

function strokePlanSegment(context, first, second, view, options = {}) {
  const start = project(first.x, first.z, view);
  const end = project(second.x, second.z, view);
  context.save();
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.setLineDash(options.dashed ? [2.4, 2] : []);
  context.lineWidth = options.width ?? 1.5;
  context.strokeStyle = options.color ?? "rgba(246,239,226,0.74)";
  context.stroke();
  context.restore();
}

function sharedBoundarySegments(first, second, epsilon = 0.001) {
  const segments = [];
  const zMin = Math.max(first.zMin, second.zMin);
  const zMax = Math.min(first.zMax, second.zMax);
  if (zMax > zMin) {
    if (Math.abs(first.xMax - second.xMin) <= epsilon) {
      segments.push([{ x: first.xMax, z: zMin }, { x: first.xMax, z: zMax }]);
    }
    if (Math.abs(first.xMin - second.xMax) <= epsilon) {
      segments.push([{ x: first.xMin, z: zMin }, { x: first.xMin, z: zMax }]);
    }
  }

  const xMin = Math.max(first.xMin, second.xMin);
  const xMax = Math.min(first.xMax, second.xMax);
  if (xMax > xMin) {
    if (Math.abs(first.zMax - second.zMin) <= epsilon) {
      segments.push([{ x: xMin, z: first.zMax }, { x: xMax, z: first.zMax }]);
    }
    if (Math.abs(first.zMin - second.zMax) <= epsilon) {
      segments.push([{ x: xMin, z: first.zMin }, { x: xMax, z: first.zMin }]);
    }
  }
  return segments;
}

function drawV10SpatialRelationships(context, view) {
  const boys = SERVICE_ROOMS.find((room) => room.id === "boys-restroom");
  const lowerStorage = SERVICE_ROOMS.find((room) => room.id === "under-storage-3");

  // Emphasize only boundaries that the source rectangles actually share. The
  // minimap therefore follows future BB/T3 scaling without maintaining a
  // second set of coordinates.
  if (boys && lowerStorage) {
    const footprints = boys.footprintRects?.length ? boys.footprintRects : [boys.bounds];
    const lowerFootprints = [lowerStorage.accessHall, lowerStorage.bounds].filter(Boolean);
    for (const footprint of footprints) {
      for (const lowerFootprint of lowerFootprints) {
        for (const [first, second] of sharedBoundarySegments(footprint, lowerFootprint)) {
          strokePlanSegment(context, first, second, view, {
            color: "rgba(131,202,222,0.95)",
            width: 2.1,
          });
        }
      }
    }
  }

  // The court boundary is read directly from COURTYARD_PLAN. This makes a
  // shifted west edge visible without assuming an earlier-version position.
  strokePlanSegment(
    context,
    { x: COURTYARD_PLAN.bounds.xMin, z: COURTYARD_PLAN.bounds.zMin },
    { x: COURTYARD_PLAN.bounds.xMin, z: COURTYARD_PLAN.bounds.zMax },
    view,
    { color: "rgba(146,191,211,0.9)", width: 1.8 },
  );
}

function drawRouteRectangle(context, bounds, view, options = {}) {
  if (!bounds) return null;
  const rectangle = projectBounds(bounds, view);
  context.save();
  roundedRectPath(
    context,
    rectangle.x,
    rectangle.y,
    rectangle.width,
    rectangle.height,
    Math.min(1.8, rectangle.width * 0.08, rectangle.height * 0.08),
  );
  context.fillStyle = options.lower ? ROUTE_STYLE.lowerFill : ROUTE_STYLE.fill;
  context.fill();
  context.strokeStyle = ROUTE_STYLE.stroke;
  context.lineWidth = options.emphasis ? 1.15 : 0.85;
  context.setLineDash(options.dashed ? [2.4, 2] : []);
  context.stroke();
  context.restore();
  return rectangle;
}

function routeSegmentsFor(auditorium) {
  const { bounds, entry } = auditorium;

  if (entry.type === "trash-cubby") {
    const halfWidth = entry.cubbyHalfWidth ?? 1.6;
    const depth = entry.cubbyDepth ?? 2.2;
    return [{
      kind: "cubby",
      // Cubby bounds and handedness remain in source plan space. In
      // particular, Theater 9 must not receive an extra display-time mirror.
      bounds: entry.cubbyBounds || {
        xMin: entry.center - halfWidth,
        xMax: entry.center + halfWidth,
        zMin: bounds.zMax - depth,
        zMax: bounds.zMax,
      },
    }];
  }

  if (entry.type === "storage-left-then-left") {
    return [
      ...(entry.entranceStemBounds ? [{ kind: "entrance-stem", bounds: entry.entranceStemBounds }] : []),
      ...(entry.entranceLateralBounds ? [{ kind: "entrance-lateral", bounds: entry.entranceLateralBounds }] : []),
      ...(entry.usherNookBounds ? [{ kind: "usher-nook", bounds: entry.usherNookBounds }] : []),
      ...(entry.routeBounds ? [{ kind: "route", bounds: entry.routeBounds }] : []),
      ...(entry.ramp?.bounds ? [{ kind: "ramp", bounds: entry.ramp.bounds }] : []),
    ];
  }

  if (entry.type === "dogleg") {
    return [
      ...(entry.stemBounds ? [{ kind: "stem", bounds: entry.stemBounds }] : []),
      ...(entry.lateralBounds ? [{ kind: "lateral", bounds: entry.lateralBounds }] : []),
      ...(entry.longRouteBounds ? [{ kind: "route", bounds: entry.longRouteBounds }] : []),
    ];
  }

  if (entry.transverseBounds || entry.longRouteBounds) {
    return [
      ...(entry.vestibuleBounds ? [{ kind: "vestibule", bounds: entry.vestibuleBounds }] : []),
      ...(entry.transverseBounds ? [{ kind: "transverse", bounds: entry.transverseBounds }] : []),
      ...(entry.longRouteBounds ? [{ kind: "route", bounds: entry.longRouteBounds }] : []),
    ];
  }

  if (entry.type === "straight-side") {
    return [
      ...(entry.usherNookBounds ? [{ kind: "usher-nook", bounds: entry.usherNookBounds }] : []),
      ...(entry.ramp?.bounds ? [{ kind: "ramp", bounds: entry.ramp.bounds }] : []),
    ];
  }

  if (entry.routeBounds) {
    return [{ kind: "route", bounds: entry.routeBounds }];
  }

  if (entry.vestibuleBounds) {
    const routeWidth = Math.max(1.6, (entry.vestibuleBounds.xMax - entry.vestibuleBounds.xMin) * 0.24);
    const sideRoute = entry.routeSide === "east"
      ? {
          xMin: bounds.xMax - routeWidth,
          xMax: bounds.xMax,
          zMin: entry.vestibuleBounds.zMin,
          zMax: entry.arrivalZ,
        }
      : {
          xMin: bounds.xMin,
          xMax: bounds.xMin + routeWidth,
          zMin: entry.vestibuleBounds.zMin,
          zMax: entry.arrivalZ,
        };
    return [
      { kind: "vestibule", bounds: entry.vestibuleBounds },
      { kind: "route", bounds: sideRoute },
    ];
  }

  if (entry.ramp?.bounds) {
    return [{
      kind: "ramp",
      bounds: {
        ...entry.ramp.bounds,
        zMin: Math.min(bounds.zMin, entry.ramp.bounds.zMin),
      },
    }];
  }

  return [];
}

function drawEntryRoutes(context, view) {
  for (const auditorium of AUDITORIUMS) {
    for (const segment of routeSegmentsFor(auditorium)) {
      drawRouteRectangle(context, segment.bounds, view, {
        dashed: segment.kind === "ramp",
        emphasis: ["vestibule", "transverse", "stem", "lateral", "entrance-lateral", "usher-nook"].includes(segment.kind),
      });
    }
  }
}

function drawScreen(context, auditorium, view) {
  const rectangle = projectBounds(auditorium.bounds, view);
  const horizontalInset = Math.max(2, rectangle.width * 0.17);
  const y = auditorium.screenSide === "north" ? rectangle.y + 1.4 : rectangle.y + rectangle.height - 1.4;

  context.save();
  context.beginPath();
  context.moveTo(rectangle.x + horizontalInset, y);
  context.lineTo(rectangle.x + rectangle.width - horizontalInset, y);
  context.strokeStyle = COLORS.screen;
  context.lineWidth = clamp(view.scale * 0.9, 1.5, 2.5);
  context.lineCap = "round";
  context.shadowColor = COLORS.screen;
  context.shadowBlur = 4;
  context.stroke();
  context.restore();
}

function drawAuditoriums(context, view) {
  for (const auditorium of AUDITORIUMS) {
    fillZone(
      context,
      { ...auditorium, kind: "auditorium" },
      view,
    );
    drawScreen(context, auditorium, view);
  }
}

function drawAuditoriumLabels(context, view) {
  for (const auditorium of AUDITORIUMS) {
    const rectangle = projectBounds(auditorium.bounds, view);
    const label = `T${auditorium.number}`;
    const fontSize = fitFontSize(label, rectangle, 9.5, 5.5);
    const centerX = rectangle.x + rectangle.width / 2;
    const hasLowerStorage = auditorium.underStorage;
    const labelAnchorY = auditorium.screenSide === "north" && hasLowerStorage ? 0.22 : 0.5;
    const centerY = rectangle.y + rectangle.height * labelAnchorY;

    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = COLORS.text;
    context.font = `900 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    context.fillText(label, centerX, centerY - (rectangle.height > 28 ? 2.6 : 0));

    if (rectangle.height > 28 && rectangle.width > 25 && !hasLowerStorage) {
      context.fillStyle = COLORS.mutedText;
      context.font = `700 ${Math.max(5, fontSize * 0.56)}px Inter, ui-sans-serif, system-ui, sans-serif`;
      context.fillText(`${auditorium.seats}`, centerX, centerY + fontSize * 0.72);
    }
    context.restore();
  }
}

function drawServiceRooms(context, view) {
  const normalRooms = SERVICE_ROOMS.filter((room) => room.kind !== "storage-lower");
  const lowerStorage = SERVICE_ROOMS.filter((room) => room.kind === "storage-lower");

  for (const room of [...normalRooms, ...lowerStorage]) {
    if (room.accessHall) {
      const anteroom = drawRouteRectangle(context, room.accessHall, view, {
        dashed: true,
        lower: true,
        emphasis: room.id === "under-storage-3",
      });
      if (room.id === "under-storage-3" && anteroom) {
        drawCenteredLabel(context, "ANTEROOM", anteroom, {
          preferredSize: 4.4,
          minimumSize: 3.5,
          color: "rgba(250,246,238,0.5)",
        });
      }
    }

    const rectangle = room.footprintRects?.length
      ? fillFootprint(context, room, view)
      : fillZone(context, room, view);
    const label = SERVICE_LABELS[room.id] || room.short || room.name;
    if (room.kind === "storage-lower" && (rectangle.width < 22 || rectangle.height < 10)) continue;
    drawCenteredLabel(context, label, rectangle, {
      preferredSize: room.kind === "storage-lower" ? 6 : 7.5,
      minimumSize: 4.5,
      color: room.kind === "storage-lower" ? "rgba(250,246,238,0.55)" : COLORS.text,
      anchorY: room.id === "under-storage-6" ? 0.68 : 0.5,
    });
  }
}

function drawDoorMarker(context, side, coordinate, center, view, options = {}) {
  if (!Number.isFinite(coordinate) || !Number.isFinite(center)) return;
  const halfWidth = (options.width || 1.75) / 2;
  const first = side === "north" || side === "south"
    ? project(center - halfWidth, coordinate, view)
    : project(coordinate, center - halfWidth, view);
  const second = side === "north" || side === "south"
    ? project(center + halfWidth, coordinate, view)
    : project(coordinate, center + halfWidth, view);

  context.save();
  context.beginPath();
  context.moveTo(first.x, first.y);
  context.lineTo(second.x, second.y);
  context.strokeStyle = options.closed ? "#f0525f" : "#ec704f";
  context.lineWidth = options.closed ? 2.3 : 1.65;
  context.lineCap = "round";
  context.shadowColor = options.closed ? "rgba(240,82,95,0.55)" : "transparent";
  context.shadowBlur = options.closed ? 3 : 0;
  context.stroke();
  context.restore();
}

function drawAuditoriumDoors(context, view) {
  for (const auditorium of AUDITORIUMS) {
    const { bounds, entry } = auditorium;
    if (entry.type === "trash-cubby") {
      const cubby = routeSegmentsFor(auditorium)[0]?.bounds;
      if (!cubby) continue;
      drawDoorMarker(context, "north", cubby.zMax, entry.center, view);
      const innerSide = entry.turnSide;
      const innerX = innerSide === "west" ? cubby.xMin : cubby.xMax;
      drawDoorMarker(context, innerSide, innerX, entry.innerDoorCenter ?? cubby.zMin + 1.05, view);
      continue;
    }

    const outerZ = entry.outerPlaneZ
      ?? entry.stemBounds?.zMin
      ?? entry.routeBounds?.zMin
      ?? entry.vestibuleBounds?.zMin
      ?? entry.transverseBounds?.zMin
      ?? bounds.zMin;
    drawDoorMarker(context, "south", outerZ, entry.center, view);
  }
}

function drawServiceDoors(context, view) {
  for (const room of SERVICE_ROOMS) {
    if (room.entry && Number.isFinite(room.entry.coordinate) && Number.isFinite(room.entry.center)) {
      drawDoorMarker(context, room.entry.side, room.entry.coordinate, room.entry.center, view, {
        width: room.entry.width,
        closed: room.closed,
      });
    } else if (room.entrySide && Number.isFinite(room.doorCenter)) {
      const coordinate = room.entrySide === "south" ? room.bounds.zMin
        : room.entrySide === "north" ? room.bounds.zMax
          : room.entrySide === "west" ? room.bounds.xMin
            : room.bounds.xMax;
      drawDoorMarker(context, room.entrySide, coordinate, room.doorCenter, view, { closed: room.closed });
    }

    for (const extraDoor of room.extraDoors || []) {
      const coordinate = extraDoor.side === "south" ? room.bounds.zMin
        : extraDoor.side === "north" ? room.bounds.zMax
          : extraDoor.side === "west" ? room.bounds.xMin
            : room.bounds.xMax;
      drawDoorMarker(context, extraDoor.side, coordinate, extraDoor.center, view, {
        width: extraDoor.width,
        closed: room.closed,
      });
    }

    if (room.outerDoorSide && Number.isFinite(room.outerDoorCenter)) {
      const outerBounds = room.accessHall || room.bounds;
      const coordinate = room.outerDoorSide === "south" ? outerBounds.zMin
        : room.outerDoorSide === "north" ? outerBounds.zMax
          : room.outerDoorSide === "west" ? outerBounds.xMin
            : outerBounds.xMax;
      drawDoorMarker(context, room.outerDoorSide, coordinate, room.outerDoorCenter, view);
    }

    if (room.doorSide && Array.isArray(room.doorCenters)) {
      const coordinate = room.doorSide === "south" ? room.bounds.zMin
        : room.doorSide === "north" ? room.bounds.zMax
          : room.doorSide === "west" ? room.bounds.xMin
            : room.bounds.xMax;
      for (const center of room.doorCenters) {
        drawDoorMarker(context, room.doorSide, coordinate, center, view);
      }
    }
  }
}

function drawHallExits(context, view) {
  for (const exit of HALL_END_EXITS) {
    drawDoorMarker(context, exit.side, exit.x, exit.z, view, { closed: true, width: 2.2 });
    const insideOffset = exit.side === "west" ? 3.2 : -3.2;
    const labelPosition = project(exit.x + insideOffset, exit.z, view);
    context.save();
    context.fillStyle = "rgba(250,246,238,0.78)";
    context.font = "800 4.8px Inter, ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("EXIT", labelPosition.x, labelPosition.y);
    context.restore();
  }
}

function drawGrid(context, view) {
  context.save();
  context.beginPath();
  context.strokeStyle = COLORS.grid;
  context.lineWidth = 1;

  for (let x = Math.ceil(MAP_BOUNDS.xMin / 10) * 10; x <= MAP_BOUNDS.xMax; x += 10) {
    const top = project(x, MAP_BOUNDS.zMax, view);
    const bottom = project(x, MAP_BOUNDS.zMin, view);
    context.moveTo(top.x, top.y);
    context.lineTo(bottom.x, bottom.y);
  }

  for (let z = Math.ceil(MAP_BOUNDS.zMin / 10) * 10; z <= MAP_BOUNDS.zMax; z += 10) {
    const left = project(MAP_BOUNDS.xMin, z, view);
    const right = project(MAP_BOUNDS.xMax, z, view);
    context.moveTo(left.x, left.y);
    context.lineTo(right.x, right.y);
  }

  context.stroke();
  context.restore();
}

function drawPlayer(context, player, view) {
  if (!player.visible || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return;

  const center = project(player.x, player.z, view);
  const magnitude = Math.hypot(player.directionX, player.directionZ) || 1;
  const directionX = player.directionX / magnitude;
  const directionY = -player.directionZ / magnitude;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const size = clamp(view.width * 0.022, 6.5, 10);

  context.save();
  context.beginPath();
  context.arc(center.x, center.y, size * 0.92, 0, Math.PI * 2);
  context.fillStyle = "rgba(240,68,82,0.16)";
  context.fill();

  context.beginPath();
  context.moveTo(center.x + directionX * size, center.y + directionY * size);
  context.lineTo(
    center.x - directionX * size * 0.48 + perpendicularX * size * 0.52,
    center.y - directionY * size * 0.48 + perpendicularY * size * 0.52,
  );
  context.lineTo(
    center.x - directionX * size * 0.48 - perpendicularX * size * 0.52,
    center.y - directionY * size * 0.48 - perpendicularY * size * 0.52,
  );
  context.closePath();
  context.fillStyle = COLORS.player;
  context.shadowColor = COLORS.player;
  context.shadowBlur = 8;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(255,255,255,0.9)";
  context.stroke();
  context.restore();
}

/**
 * Creates and maintains the responsive floor-plan minimap.
 *
 * updatePlayer accepts either a THREE.Vector3-like object plus an optional
 * direction vector, or an object containing x, z, directionX and directionZ.
 */
export function createMinimap(options = {}) {
  const canvas = resolveCanvas(options.canvas || "#minimap");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The minimap requires a 2D canvas context.");

  const player = {
    x: options.player?.x ?? 0,
    z: options.player?.z ?? -4,
    directionX: options.player?.directionX ?? 0,
    directionZ: options.player?.directionZ ?? 1,
    visible: options.player?.visible ?? true,
  };
  let view = createView(DESIGN_WIDTH, DESIGN_HEIGHT);
  let animationFrame = 0;
  let destroyed = false;

  function syncCanvasSize() {
    const cssWidth = Math.max(1, canvas.clientWidth || DESIGN_WIDTH);
    const cssHeight = Math.max(1, canvas.clientHeight || cssWidth / DESIGN_ASPECT);
    const pixelRatio = clamp(globalThis.devicePixelRatio || 1, 1, 2);
    const backingWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
    const backingHeight = Math.max(1, Math.round(cssHeight * pixelRatio));

    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    view = createView(cssWidth, cssHeight);
  }

  function draw() {
    if (destroyed) return;
    animationFrame = 0;
    syncCanvasSize();
    context.clearRect(0, 0, view.width, view.height);

    const gradient = context.createLinearGradient(0, 0, view.width, view.height);
    gradient.addColorStop(0, COLORS.background);
    gradient.addColorStop(1, "#0c0b11");
    context.fillStyle = gradient;
    context.fillRect(0, 0, view.width, view.height);

    drawGrid(context, view);
    drawPublicSpaces(context, view);
    drawAuditoriums(context, view);
    drawServiceRooms(context, view);
    drawBoysEntryFeatures(context, view);
    drawEntryRoutes(context, view);
    drawV10SpatialRelationships(context, view);
    drawAuditoriumDoors(context, view);
    drawServiceDoors(context, view);
    drawHallExits(context, view);
    drawAuditoriumLabels(context, view);
    drawPlayer(context, player, view);
  }

  function requestDraw() {
    if (destroyed || animationFrame) return;
    if (typeof requestAnimationFrame === "function") {
      animationFrame = requestAnimationFrame(draw);
    } else {
      draw();
    }
  }

  function updatePlayer(position, direction) {
    if (!position) return;
    if (Number.isFinite(position.x)) player.x = position.x;
    if (Number.isFinite(position.z)) player.z = position.z;
    if (typeof position.visible === "boolean") player.visible = position.visible;

    const suppliedDirection = direction || position.direction;
    if (suppliedDirection && Number.isFinite(suppliedDirection.x) && Number.isFinite(suppliedDirection.z)) {
      player.directionX = suppliedDirection.x;
      player.directionZ = suppliedDirection.z;
    } else if (Number.isFinite(position.directionX) && Number.isFinite(position.directionZ)) {
      player.directionX = position.directionX;
      player.directionZ = position.directionZ;
    } else if (Number.isFinite(position.heading)) {
      // Heading 0 faces map north (+Z); positive rotation turns toward +X.
      player.directionX = Math.sin(position.heading);
      player.directionZ = Math.cos(position.heading);
    }

    requestDraw();
  }

  function worldToCanvas(x, z) {
    return project(x, z, view);
  }

  function destroy() {
    destroyed = true;
    resizeObserver?.disconnect();
    globalThis.removeEventListener?.("resize", requestDraw);
    if (animationFrame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(animationFrame);
    }
    animationFrame = 0;
  }

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(requestDraw)
    : null;
  resizeObserver?.observe(canvas);
  globalThis.addEventListener?.("resize", requestDraw, { passive: true });
  draw();

  return Object.freeze({
    canvas,
    draw,
    resize: requestDraw,
    updatePlayer,
    worldToCanvas,
    destroy,
  });
}
