import {
  AUDITORIUMS,
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
});

const SERVICE_LABELS = Object.freeze({
  "under-storage-3": "U/S 3",
  "under-storage-6": "U/S 6",
});

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
  roundedRectPath(
    context,
    rectangle.x,
    rectangle.y,
    rectangle.width,
    rectangle.height,
    Math.min(2.5, rectangle.width * 0.08, rectangle.height * 0.08),
  );
  context.fillStyle = fill;
  context.fill();
  context.setLineDash(dashed ? [3, 2.5] : []);
  context.lineWidth = zone.kind === "corridor" ? 1.2 : 0.8;
  context.strokeStyle = COLORS.outline;
  context.stroke();
  context.restore();

  return rectangle;
}

function fitFontSize(label, rectangle, preferred, minimum = 5.5) {
  const widthLimit = rectangle.width / Math.max(1, label.length * 0.62);
  const heightLimit = rectangle.height * 0.42;
  return clamp(Math.min(preferred, widthLimit, heightLimit), minimum, preferred);
}

function drawCenteredLabel(context, label, rectangle, options = {}) {
  const fontSize = fitFontSize(label, rectangle, options.preferredSize || 8.5, options.minimumSize || 5.5);
  context.save();
  context.fillStyle = options.color || COLORS.text;
  context.font = `${options.weight || 800} ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2);
  context.restore();
}

function drawPublicSpaces(context, view) {
  for (const space of PUBLIC_SPACES) {
    const rectangle = fillZone(context, space, view);
    const label = {
      lobby: "LOBBY",
      "lobby-neck": "APPROACH",
      "ticket-check": "TICKETS",
      "main-corridor": "THEATER HALL",
    }[space.id];

    if (label) {
      drawCenteredLabel(context, label, rectangle, {
        color: "rgba(250,246,238,0.35)",
        preferredSize: space.id === "main-corridor" ? 6.5 : 7.5,
        minimumSize: 4.5,
        weight: 700,
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
    const rectangle = fillZone(
      context,
      { ...auditorium, kind: "auditorium" },
      view,
    );
    drawScreen(context, auditorium, view);

    const label = `T${auditorium.number}`;
    const fontSize = fitFontSize(label, rectangle, 9.5, 5.5);
    const centerX = rectangle.x + rectangle.width / 2;
    const centerY = rectangle.y + rectangle.height / 2;

    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = COLORS.text;
    context.font = `900 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
    context.fillText(label, centerX, centerY - (rectangle.height > 28 ? 2.6 : 0));

    if (rectangle.height > 28 && rectangle.width > 25) {
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
    const rectangle = fillZone(context, room, view);
    const label = SERVICE_LABELS[room.id] || room.short || room.name;
    drawCenteredLabel(context, label, rectangle, {
      preferredSize: room.kind === "storage-lower" ? 6 : 7.5,
      minimumSize: 4.5,
      color: room.kind === "storage-lower" ? "rgba(250,246,238,0.55)" : COLORS.text,
    });
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
