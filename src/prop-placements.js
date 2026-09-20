import * as THREE from "three";
import { AUDITORIUMS, CONCESSION_SERVICE_SEQUENCE, EQUIPMENT_ANCHORS, FOUNTAIN_PLAN, LOBBY_PLAN, SERVICE_ROOMS } from "./layout-data.js";
import { planToWorldX, planToWorldYaw } from "./coordinates.js";

/** Replacement visuals share the existing architectural positions and colliders. */
export function createPropPlacements({ root, auditoriumLayouts, furnishings = [] }) {
  root.updateMatrixWorld(true);
  const placements = [];
  const objects = [];
  root.traverse(object => objects.push(object));
  const named = id => root.getObjectByName(id);
  const family = prefix => objects.filter(o => o.isMesh && o.name.startsWith(prefix));
  const worldPoint = object => object.getWorldPosition(new THREE.Vector3()).toArray();
  const put = (id, model, position, size, rotationY = 0, fallback = [], extra = {}) => {
    const originals = (Array.isArray(fallback) ? fallback : [fallback]).filter(Boolean);
    for (const original of originals) original.userData.propFallback = true;
    const placement = { id, model, position, size, rotationY, fallback: originals, ...extra };
    placements.push(placement);
    return placement;
  };
  for (const item of furnishings) put(item.id, item.model, item.position, item.size, item.rotationY, item.fallback);
  const fromMesh = (object, model, { height, baseY, width, depth, rotationY, fallback } = {}) => {
    if (!object) return;
    const position = worldPoint(object);
    position[1] = baseY ?? position[1] - object.scale.y / 2;
    return put(object.name, model, position,
      [width ?? object.scale.x, height ?? object.scale.y, depth ?? object.scale.z],
      rotationY ?? object.rotation.y, fallback ?? object);
  };
  // Keep counter runs continuous and at their authored angles, with cabinets
  // repeated at normal furniture widths instead of one stretched cupboard.
  const counter = (baseId, topId, model, extras = []) => {
    const base = named(baseId), top = named(topId);
    if (!base || !top) return;
    const hasDisplayBays = model === "counter_blue";
    const length = hasDisplayBays ? base.scale.x : top.scale.x;
    const depth = hasDisplayBays ? base.scale.z : top.scale.z;
    const height = hasDisplayBays ? top.position.y - top.scale.y / 2 : top.position.y + top.scale.y / 2;
    const spans = [];
    // These are actual openings in the cabinetry. Placing a display in front
    // of an unbroken cabinet face would bury its candy and water bottles.
    const cuts = hasDisplayBays ? CONCESSION_SERVICE_SEQUENCE.filter(p => p.type === "candy").map(p => {
      const offset = (planToWorldX(p.position[0]) - top.position.x) * Math.cos(top.rotation.y)
        - (p.position[2] - top.position.z) * Math.sin(top.rotation.y);
      return [offset - p.footprint[0] / 2 - 0.025, offset + p.footprint[0] / 2 + 0.025];
    }).sort((a, b) => a[0] - b[0]) : [];
    let cursor = -length / 2;
    for (const [start, end] of cuts) { if (start > cursor) spans.push([cursor, start]); cursor = end; }
    if (cursor < length / 2) spans.push([cursor, length / 2]);
    if (hasDisplayBays) top.userData.propFallback = true; // Keep the continuous countertop above both open bays.
    for (const [spanIndex, [start, end]] of spans.entries()) {
      const count = Math.max(1, Math.ceil((end - start) / 1.5));
      for (let index = 0; index < count; index++) {
        const offset = start + (index + 0.5) * (end - start) / count;
        const position = new THREE.Vector3(offset, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), top.rotation.y);
        position.add(new THREE.Vector3(top.position.x, 0, top.position.z));
        put(`${baseId}-cabinet-${spanIndex}-${index}`, model, position.toArray(), [(end - start) / count, height, depth], top.rotation.y,
          [base, ...(hasDisplayBays ? [] : [top]), ...extras.map(named)]);
      }
    }
  };
  for (const section of LOBBY_PLAN.customerCounterSections) {
    const material = section.baseMaterialKey;
    counter(section.id, `${section.id}-top`, material === "concessionBlue" ? "counter_blue" : material === "counterWhite" ? "counter_white" : "counter_wood", [`${section.id}-stainless-base`]);
  }
  counter("box-office-vertical", "box-office-vertical-top", "counter_white");
  counter("box-office-return", "box-office-return-top", "counter_wood");
  counter("soda-island", "soda-island-top", "counter_wood");
  counter("soda-rear-counter", "soda-rear-counter-top", "counter_wood");
  counter("back-bar-cabinet", "back-bar-top", "counter_wood");
  counter("kitchen-hot-line-base", "kitchen-hot-line-top", "counter_white");

  for (const object of objects) {
    if (object.isGroup && object.children.some(child => child.name === `${object.name}-rim`)) {
      put(object.name, "trash_can", worldPoint(object), [0.74, 1.02, 0.74], 0, object);
    }
    if (!object.isMesh) continue;
    if (/^(boys|girls)-restroom-toilet-/.test(object.name)) {
      const room = SERVICE_ROOMS.find(room => object.name.startsWith(room.id));
      const bankIndex = Number(object.name.split("-toilet-")[1].split("-")[0]);
      const bank = room.fixtures.stalls[bankIndex];
      fromMesh(object, "toilet", { height: 0.86, baseY: 0, rotationY: bank.side === "north" ? Math.PI : 0 });
    } else if (/^(boys|girls)-restroom-urinal-/.test(object.name)) {
      fromMesh(object, "urinal", { height: 0.90, baseY: 0.28, rotationY: Math.PI });
    } else if (/^(boys|girls)-restroom-mirror-/.test(object.name)) {
      fromMesh(object, "mirror", { rotationY: Math.PI });
    } else if (/^(boys|girls)-restroom-paper-dispenser-/.test(object.name)) {
      fromMesh(object, "paper_dispenser", { baseY: 1.15, height: 0.37, rotationY: Math.PI,
        fallback: [object, named(object.name.replace("paper-dispenser", "paper-sheet"))] });
    } else if (/^(boys|girls)-restroom-stall-bank-.*-partition-/.test(object.name)) {
      fromMesh(object, "stall_partition", { width: object.scale.z, depth: object.scale.x, rotationY: Math.PI / 2 });
    } else if (/^(boys|girls)-restroom-stall-bank-.*-door-/.test(object.name)) {
      fromMesh(object, "stall_door");
    }
  }
  for (const room of SERVICE_ROOMS.filter(room => room.kind === "restroom")) {
    room.fixtures.sinks.forEach((fixture, bankIndex) => {
      for (let index = 0; index < fixture.count; index++) {
        const id = `${room.id}-sink-${bankIndex}-${index}`, original = named(id);
        const related = [original, ...family(`${room.id}-basin-${bankIndex}-${index}-`),
          ...family(`${room.id}-tap-${bankIndex}-${index}-`), ...family(`${room.id}-tap-spout-${bankIndex}-${index}-`)];
        if (!fixture.trough) fromMesh(original, "sink", { baseY: 0, height: 1.16, rotationY: Math.PI, fallback: related });
        else {
          const width = original.scale.x, count = Math.max(2, Math.floor(width / 1.12));
          fromMesh(original, "counter_wood", { baseY: 0, height: 0.90, rotationY: Math.PI, fallback: related });
          for (let basin = 0; basin < count; basin++) {
            const x = original.position.x + (basin - (count - 1) / 2) * Math.min(1.12, width / count);
            put(`${id}-basin-${basin}`, "sink_basin", [x, 0.90, original.position.z], [0.50, 0.28, 0.48], Math.PI, []);
          }
        }
      }
    });
  }
  for (const station of [...CONCESSION_SERVICE_SEQUENCE.filter(s => s.type === "pos"), LOBBY_PLAN.boxOfficePos]) {
    put(station.id, "pos", [planToWorldX(station.position[0]), 1.21, station.position[2]], [0.72, 0.72, 0.57],
      planToWorldYaw(station.rotation) - Math.PI / 2, named(station.id));
  }
  CONCESSION_SERVICE_SEQUENCE.filter(s => s.type === "candy").forEach((display, index) => {
    const original = named(`concession-candy-bay-${index + 1}`);
    put(display.id, index ? "water_display" : "candy_display", worldPoint(original),
      [display.footprint[0], 1.05, 0.22], original.rotation.y + Math.PI, original);
  });
  const podium = LOBBY_PLAN.ticketPodium;
  put(podium.id, "ticket_podium", [planToWorldX(podium.position[0]), 0, podium.position[2]],
    [podium.footprint[0], podium.height + 0.06, podium.footprint[1]], Math.PI,
    [named(`${podium.id}-base`), named(`${podium.id}-body`), named(`${podium.id}-top`), named(`${podium.id}-label`)]);
  const equipmentModels = {
    popper: ["popcorn_popper", 2.76], grill: ["grill", 1.525], fryer: ["fryer", 1.72],
    "turbo-oven": ["turbo_oven", 1.80], "bar-well": ["bar_well", 1.09],
    "icee-fountain": ["icee_machine", 1.375], "soda-fountain": ["soda_fountain", 1.125],
    "drinking-fountain": ["drinking_fountain", 1.49],
  };
  for (const anchor of EQUIPMENT_ANCHORS) {
    const [model, height] = equipmentModels[anchor.type];
    const isIsland = anchor.roomId === "soda-service";
    const y = isIsland ? 1.15 : anchor.type === "drinking-fountain" && anchor.id.endsWith("-2") ? -0.12 : 0;
    put(anchor.id, model, [planToWorldX(anchor.position[0]), y, anchor.position[2]],
      [anchor.footprint[0], height, anchor.footprint[1]], planToWorldYaw(anchor.rotation) + Math.PI, named(anchor.id));
  }
  put("soda-cup-caddy", "cup_caddy", [planToWorldX((FOUNTAIN_PLAN.island.xMin + FOUNTAIN_PLAN.island.xMax) / 2 - 0.25), 1.02, FOUNTAIN_PLAN.centerZ],
    [0.78, 0.79, 0.72], Math.PI, family("soda-cup-caddy-"));

  for (const auditorium of AUDITORIUMS) {
    const layout = auditoriumLayouts.get(auditorium.id);
    const originals = ["cushions", "backs", "bases", "arms", "trays"].map(name => named(`${auditorium.id}-seat-${name}`));
    const width = layout.seatBounds.xMax - layout.seatBounds.xMin;
    for (const row of layout.rows) {
      const spacing = Math.min(0.76, (width - 0.14) / row.seatCount), rowWidth = spacing * (row.seatCount - 1);
      const yaw = auditorium.screenSide === "north" ? 0 : Math.PI;
      for (let column = 0; column < row.seatCount; column++) {
        const x = layout.centerX - rowWidth / 2 + column * spacing;
        put(`${auditorium.id}-recliner-${row.index}-${column}`, "recliner", [planToWorldX(x), row.elevation, row.z],
          [Math.min(0.54, spacing - 0.13), 1.36, 0.74], yaw, originals, { parent: named(`${auditorium.id}-interior`) });
      }
      for (let divider = 0; divider <= row.seatCount; divider++) {
        const x = layout.centerX - rowWidth / 2 - spacing / 2 + divider * spacing;
        put(`${auditorium.id}-shared-arm-${row.index}-${divider}`, "shared_armrest", [planToWorldX(x), row.elevation + 0.28, row.z],
          [0.095, 0.545, 0.621], yaw, originals, { parent: named(`${auditorium.id}-interior`) });
      }
    }
  }
  return placements;
}

/** Back-of-house furniture and the photographed sanitizer have real collision. */
export function addTheaterFurnishings({ root, materials, colliders }) {
  const placements = [];
  const add = (id, model, planX, z, size, rotationY = 0, baseY = 0) => {
    const position = [planToWorldX(planX), baseY, z];
    const geometry = new THREE.BoxGeometry(...size);
    const fallback = new THREE.Mesh(geometry, materials.stainless);
    fallback.name = `${id}-fallback`;
    fallback.position.set(position[0], baseY + size[1] / 2, z);
    fallback.rotation.y = rotationY;
    root.add(fallback);
    const c = Math.abs(Math.cos(rotationY)), s = Math.abs(Math.sin(rotationY));
    const width = size[0] * c + size[2] * s, depth = size[2] * c + size[0] * s;
    colliders.push({ id, minX: position[0] - width / 2, maxX: position[0] + width / 2,
      minZ: z - depth / 2, maxZ: z + depth / 2, minY: baseY, maxY: baseY + size[1] });
    placements.push({ id, model, position, size, rotationY, fallback });
  };
  const office = SERVICE_ROOMS.find(room => room.id === "office").bounds;
  add("manager-desk", "office_desk", office.xMax - 1.5, office.zMax - 0.6, [1.4, 0.78, 0.65], Math.PI);
  add("manager-chair", "office_chair", office.xMax - 1.5, office.zMax - 1.7, [0.62, 1.12, 0.62]);
  for (const [index, z] of [8.8, 12.8, 16.8].entries()) {
    const storage = SERVICE_ROOMS.find(room => room.id === "kitchen-storage").bounds;
    add(`kitchen-stock-rack-${index}`, "storage_rack", storage.xMin + 0.55, z, [1.6, 1.95, 0.55], -Math.PI / 2);
    add(`kitchen-stock-box-${index}`, "storage_box", storage.xMin + 1.4, z + 0.9, [0.5, 0.36, 0.4]);
  }
  const candy = SERVICE_ROOMS.find(room => room.id === "candy-storage").bounds;
  for (let index = 0; index < 3; index++) {
    add(`candy-stock-rack-${index}`, "storage_rack", candy.xMax - 1.2 - index * 2, candy.zMax - 0.5, [1.6, 1.95, 0.55], Math.PI);
  }
  const kioskA = LOBBY_PLAN.kiosks[1], kioskB = LOBBY_PLAN.kiosks[2];
  add("kiosk-bank-sanitizer", "sanitizer", kioskA.position[0] - 0.4,
    (kioskA.position[2] + kioskB.position[2]) / 2, [0.32, 1.28, 0.32], Math.PI / 2);
  return placements;
}
