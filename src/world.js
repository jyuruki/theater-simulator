import * as THREE from "three";
import {
  AUDITORIUMS,
  COURTYARD_PLAN,
  EQUIPMENT_ANCHORS,
  FOUNTAIN_PLAN,
  HALL_END_EXITS,
  LOBBY_PLAN,
  MAP_BOUNDS,
  POS_STATIONS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
  T3_MEN_PLAN,
  TICKET_APPROACH_PLAN,
} from "./layout-data.js";
import {
  buildAuditoriumLayouts,
  pointInRect,
  sampleAuditoriumGround,
  selectGroundCandidate,
} from "./layout-geometry.js";
import {
  planToWorldBounds,
  planToWorldX,
  planToWorldYaw,
  worldToPlanX,
} from "./coordinates.js";
import { createBotanicalMuralTexture, createSignTexture } from "./materials.js";

const WALL_HEIGHT = 4.6;
const WALL_THICKNESS = 0.18;
const DOOR_WIDTH = 2.05;
const DOOR_HEIGHT = 2.48;
const RISER_DEPTH = 0.08;
const EPSILON = 0.001;

const centerOf = (bounds) => ({
  x: (bounds.xMin + bounds.xMax) / 2,
  z: (bounds.zMin + bounds.zMax) / 2,
});

const sizeOf = (bounds) => ({
  width: bounds.xMax - bounds.xMin,
  depth: bounds.zMax - bounds.zMin,
});

const roomById = (id) => SERVICE_ROOMS.find((room) => room.id === id);
const publicById = (id) => PUBLIC_SPACES.find((space) => space.id === id);

export function createTheaterWorld({ scene, materials }) {
  const root = new THREE.Group();
  root.name = "Mililani 14 layout prototype v8";
  scene.add(root);

  const colliders = [];
  const equipment = new Map();
  const auditoriumGroups = new Map();
  const auditoriumLayouts = buildAuditoriumLayouts(AUDITORIUMS);
  const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const unitPlaneGeometry = new THREE.PlaneGeometry(1, 1);
  const unitCylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const seatGeometries = {
    cushion: new THREE.BoxGeometry(0.6, 0.15, 0.54),
    back: new THREE.BoxGeometry(0.62, 0.76, 0.15),
    base: new THREE.BoxGeometry(0.1, 0.46, 0.1),
    arm: new THREE.BoxGeometry(0.095, 0.18, 0.58),
    tray: new THREE.BoxGeometry(0.4, 0.045, 0.31),
  };
  const disposableFloorMaterials = [];
  let sourceMeshCount = 0;
  let seatCount = 0;

  const addColliderWorld = (id, x, y, z, width, height, depth) => {
    colliders.push({
      id,
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - height / 2,
      maxY: y + height / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    });
  };

  const addPlanCollider = (id, planX, y, z, width, height, depth, rotationY = 0) => {
    const cosine = Math.abs(Math.cos(rotationY));
    const sine = Math.abs(Math.sin(rotationY));
    addColliderWorld(
      id,
      planToWorldX(planX),
      y,
      z,
      width * cosine + depth * sine,
      height,
      width * sine + depth * cosine,
    );
  };

  const addBox = ({
    id,
    x,
    y,
    z,
    width,
    height,
    depth,
    material = materials.wall,
    parent = root,
    collide = false,
    castShadow = false,
    receiveShadow = true,
    rotationY = 0,
    space = "plan",
  }) => {
    const mesh = new THREE.Mesh(unitBoxGeometry, material);
    mesh.name = id;
    mesh.position.set(space === "plan" ? planToWorldX(x) : x, y, z);
    mesh.rotation.y = space === "plan" ? planToWorldYaw(rotationY) : rotationY;
    mesh.scale.set(width, height, depth);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    sourceMeshCount += 1;
    if (collide) {
      if (space !== "plan") throw new Error(`Colliding local box ${id} must be authored in plan space.`);
      addPlanCollider(id, x, y, z, width, height, depth, rotationY);
    }
    return mesh;
  };

  const addCylinder = ({ id, x, y, z, radius, height, material, parent = root, space = "plan" }) => {
    const mesh = new THREE.Mesh(unitCylinderGeometry, material);
    mesh.name = id;
    mesh.position.set(space === "plan" ? planToWorldX(x) : x, y, z);
    mesh.scale.set(radius * 2, height, radius * 2);
    mesh.receiveShadow = true;
    parent.add(mesh);
    sourceMeshCount += 1;
    return mesh;
  };

  const batchBoxMeshes = (parent) => {
    for (const child of [...parent.children]) {
      if (!child.isMesh && child.children?.length) batchBoxMeshes(child);
    }
    const batches = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || child.isInstancedMesh || child.geometry !== unitBoxGeometry || Array.isArray(child.material)) continue;
      const key = child.material.uuid;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(child);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const batch = new THREE.InstancedMesh(unitBoxGeometry, meshes[0].material, meshes.length);
      batch.name = `batched-${meshes[0].material.name || "boxes"}`;
      batch.castShadow = meshes.some((mesh) => mesh.castShadow);
      batch.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
      meshes.forEach((mesh, index) => {
        mesh.updateMatrix();
        batch.setMatrixAt(index, mesh.matrix);
        parent.remove(mesh);
      });
      batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      parent.add(batch);
    }
  };

  const tiledFloorMaterial = (base, bounds, metersPerRepeat) => {
    if (!metersPerRepeat || !base?.map) return base;
    const material = base.clone();
    const width = bounds.xMax - bounds.xMin;
    const depth = bounds.zMax - bounds.zMin;
    material.map = base.map.clone();
    material.map.repeat.set(Math.max(1, width / metersPerRepeat), Math.max(1, depth / metersPerRepeat));
    material.map.needsUpdate = true;
    if (base.bumpMap) {
      material.bumpMap = base.bumpMap.clone();
      material.bumpMap.repeat.copy(material.map.repeat);
      material.bumpMap.needsUpdate = true;
    }
    disposableFloorMaterials.push(material);
    return material;
  };

  const addFloor = (id, bounds, material, elevation = 0, parent = root, metersPerRepeat = 0) => {
    const { x, z } = centerOf(bounds);
    const { width, depth } = sizeOf(bounds);
    return addBox({
      id: `${id}-floor`, x, y: elevation - 0.055, z, width, height: 0.11, depth,
      material: tiledFloorMaterial(material, bounds, metersPerRepeat), parent,
    });
  };

  const addCeiling = (id, bounds, elevation = WALL_HEIGHT, parent = root) => {
    const { x, z } = centerOf(bounds);
    const { width, depth } = sizeOf(bounds);
    return addBox({
      id: `${id}-ceiling`, x, y: elevation, z, width, height: 0.1, depth,
      material: materials.ceiling, parent, receiveShadow: false,
    });
  };

  const addWallX = (id, xMin, xMax, z, options = {}) => {
    if (xMax - xMin <= EPSILON) return null;
    const baseY = options.baseY ?? 0;
    const height = options.height ?? WALL_HEIGHT;
    return addBox({
      id,
      x: (xMin + xMax) / 2,
      y: baseY + height / 2,
      z,
      width: xMax - xMin,
      height,
      depth: options.thickness ?? WALL_THICKNESS,
      material: options.material ?? materials.wall,
      parent: options.parent ?? root,
      collide: options.collide !== false,
    });
  };

  const addWallZ = (id, x, zMin, zMax, options = {}) => {
    if (zMax - zMin <= EPSILON) return null;
    const baseY = options.baseY ?? 0;
    const height = options.height ?? WALL_HEIGHT;
    return addBox({
      id,
      x,
      y: baseY + height / 2,
      z: (zMin + zMax) / 2,
      width: options.thickness ?? WALL_THICKNESS,
      height,
      depth: zMax - zMin,
      material: options.material ?? materials.wall,
      parent: options.parent ?? root,
      collide: options.collide !== false,
    });
  };

  const addWallXWithOpenings = (id, xMin, xMax, z, openings = [], options = {}) => {
    const baseY = options.baseY ?? 0;
    const height = options.height ?? WALL_HEIGHT;
    const material = options.material ?? materials.wall;
    const sorted = openings.map((opening) => ({
      center: opening.center,
      width: opening.width ?? DOOR_WIDTH,
      height: opening.height ?? DOOR_HEIGHT,
      baseY: opening.baseY ?? baseY,
    })).sort((first, second) => first.center - second.center);
    let cursor = xMin;
    sorted.forEach((opening, index) => {
      const left = Math.max(xMin, opening.center - opening.width / 2);
      const right = Math.min(xMax, opening.center + opening.width / 2);
      addWallX(`${id}-segment-${index}`, cursor, left, z, { ...options, material, baseY, height });
      const top = baseY + height;
      const headerBottom = opening.baseY + opening.height;
      if (right > left && top > headerBottom + EPSILON) {
        addBox({
          id: `${id}-header-${index}`,
          x: (left + right) / 2,
          y: headerBottom + (top - headerBottom) / 2,
          z,
          width: right - left,
          height: top - headerBottom,
          depth: options.thickness ?? WALL_THICKNESS,
          material,
          parent: options.parent ?? root,
          collide: options.collide !== false,
        });
      }
      cursor = Math.max(cursor, right);
    });
    addWallX(`${id}-segment-last`, cursor, xMax, z, { ...options, material, baseY, height });
  };

  const addWallZWithOpenings = (id, x, zMin, zMax, openings = [], options = {}) => {
    const baseY = options.baseY ?? 0;
    const height = options.height ?? WALL_HEIGHT;
    const material = options.material ?? materials.wall;
    const sorted = openings.map((opening) => ({
      center: opening.center,
      width: opening.width ?? DOOR_WIDTH,
      height: opening.height ?? DOOR_HEIGHT,
      baseY: opening.baseY ?? baseY,
    })).sort((first, second) => first.center - second.center);
    let cursor = zMin;
    sorted.forEach((opening, index) => {
      const near = Math.max(zMin, opening.center - opening.width / 2);
      const far = Math.min(zMax, opening.center + opening.width / 2);
      addWallZ(`${id}-segment-${index}`, x, cursor, near, { ...options, material, baseY, height });
      const top = baseY + height;
      const headerBottom = opening.baseY + opening.height;
      if (far > near && top > headerBottom + EPSILON) {
        addBox({
          id: `${id}-header-${index}`,
          x,
          y: headerBottom + (top - headerBottom) / 2,
          z: (near + far) / 2,
          width: options.thickness ?? WALL_THICKNESS,
          height: top - headerBottom,
          depth: far - near,
          material,
          parent: options.parent ?? root,
          collide: options.collide !== false,
        });
      }
      cursor = Math.max(cursor, far);
    });
    addWallZ(`${id}-segment-last`, x, cursor, zMax, { ...options, material, baseY, height });
  };

  const addDoorTrim = (id, side, coordinate, center, options = {}) => {
    const baseY = options.baseY ?? 0;
    const height = options.height ?? DOOR_HEIGHT;
    const width = options.width ?? DOOR_WIDTH;
    const accent = options.material ?? materials.stainless;
    if (side === "north" || side === "south") {
      addBox({ id: `${id}-left`, x: center - width / 2, y: baseY + height / 2, z: coordinate, width: 0.08, height, depth: 0.22, material: accent });
      addBox({ id: `${id}-right`, x: center + width / 2, y: baseY + height / 2, z: coordinate, width: 0.08, height, depth: 0.22, material: accent });
      addBox({ id: `${id}-top`, x: center, y: baseY + height, z: coordinate, width: width + 0.08, height: 0.08, depth: 0.22, material: accent });
      addBox({ id: `${id}-threshold`, x: center, y: baseY + 0.015, z: coordinate, width, height: 0.03, depth: 0.25, material: materials.red });
    } else {
      addBox({ id: `${id}-near`, x: coordinate, y: baseY + height / 2, z: center - width / 2, width: 0.22, height, depth: 0.08, material: accent });
      addBox({ id: `${id}-far`, x: coordinate, y: baseY + height / 2, z: center + width / 2, width: 0.22, height, depth: 0.08, material: accent });
      addBox({ id: `${id}-top`, x: coordinate, y: baseY + height, z: center, width: 0.22, height: 0.08, depth: width + 0.08, material: accent });
      addBox({ id: `${id}-threshold`, x: coordinate, y: baseY + 0.015, z: center, width: 0.25, height: 0.03, depth: width, material: materials.red });
    }
  };

  const addClosedDoor = (id, side, coordinate, center, options = {}) => {
    const baseY = options.baseY ?? 0;
    const width = options.width ?? DOOR_WIDTH;
    addDoorTrim(id, side, coordinate, center, { ...options, width });
    if (side === "north" || side === "south") {
      addBox({ id: `${id}-leaf`, x: center, y: baseY + 1.17, z: coordinate, width: width - 0.1, height: 2.34, depth: 0.13, material: materials.black, collide: true });
      addBox({ id: `${id}-bar`, x: center, y: baseY + 1.08, z: coordinate + (side === "south" ? 0.08 : -0.08), width: width * 0.62, height: 0.07, depth: 0.05, material: materials.stainless });
    } else {
      addBox({ id: `${id}-leaf`, x: coordinate, y: baseY + 1.17, z: center, width: 0.13, height: 2.34, depth: width - 0.1, material: materials.black, collide: true });
      addBox({ id: `${id}-bar`, x: coordinate + (side === "west" ? 0.08 : -0.08), y: baseY + 1.08, z: center, width: 0.05, height: 0.07, depth: width * 0.62, material: materials.stainless });
    }
  };

  const addLabel = ({ id, text, position, rotationY = 0, width = 2.7, height = 0.62, accent = "#ef4657", small = false, parent = root }) => {
    const texture = createSignTexture(text, { accent, small });
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const sign = new THREE.Mesh(unitPlaneGeometry, material);
    sign.name = id;
    sign.position.set(planToWorldX(position[0]), position[1], position[2]);
    sign.rotation.y = planToWorldYaw(rotationY);
    sign.scale.set(width, height, 1);
    parent.add(sign);
    sourceMeshCount += 1;
    return sign;
  };

  const addLightPanel = (id, x, z, width = 1.8, depth = 0.42, height = 4.42, parent = root) => addBox({
    id, x, y: height, z, width, height: 0.035, depth, material: materials.light, parent, receiveShadow: false,
  });

  const addPlanSegment = (id, start, end, options = {}) => {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length <= EPSILON) return null;
    const rotationY = -Math.atan2(dz, dx);
    const height = options.height ?? WALL_HEIGHT;
    const depth = options.depth ?? WALL_THICKNESS;
    const mesh = addBox({
      id,
      x: (start.x + end.x) / 2,
      y: options.y ?? height / 2,
      z: (start.z + end.z) / 2,
      width: length,
      height,
      depth,
      material: options.material ?? materials.wall,
      collide: false,
      rotationY,
    });
    if (options.collide !== false) {
      // A single AABB around a long diagonal creates enormous invisible
      // triangles. Short overlapping AABBs closely follow the visible run
      // while remaining compatible with the lightweight collision world.
      const segmentCount = Math.max(1, Math.ceil(length / 0.58));
      for (let index = 0; index < segmentCount; index += 1) {
        const progress = (index + 0.5) / segmentCount;
        addPlanCollider(
          `${id}-collider-${index}`,
          start.x + dx * progress,
          options.y ?? height / 2,
          start.z + dz * progress,
          length / segmentCount + 0.025,
          height,
          depth,
          rotationY,
        );
      }
    }
    return mesh;
  };

  const addPlanSegmentWithOpening = (id, start, end, opening, options = {}) => {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length <= EPSILON) return;
    const unitX = dx / length;
    const unitZ = dz / length;
    const centerDistance = Math.min(length, Math.max(0, (opening.segmentT ?? 0.5) * length));
    const halfWidth = Math.min(opening.width ?? DOOR_WIDTH, length - EPSILON) / 2;
    const nearDistance = Math.max(0, centerDistance - halfWidth);
    const farDistance = Math.min(length, centerDistance + halfWidth);
    const pointAt = (distance) => ({ x: start.x + unitX * distance, z: start.z + unitZ * distance });
    const near = pointAt(nearDistance);
    const far = pointAt(farDistance);
    const center = pointAt((nearDistance + farDistance) / 2);
    const material = options.material ?? materials.wall;

    if (nearDistance > EPSILON) addPlanSegment(`${id}-before`, start, near, { ...options, material });
    if (farDistance < length - EPSILON) addPlanSegment(`${id}-after`, far, end, { ...options, material });
    addPlanSegment(`${id}-header`, near, far, {
      ...options,
      y: DOOR_HEIGHT + (WALL_HEIGHT - DOOR_HEIGHT) / 2,
      height: WALL_HEIGHT - DOOR_HEIGHT,
      material,
    });

    const trimOptions = { collide: false, material: materials.stainless };
    const trimHalf = 0.04;
    addPlanSegment(`${id}-trim-near`, pointAt(Math.max(0, nearDistance - trimHalf)), pointAt(Math.min(length, nearDistance + trimHalf)), {
      ...trimOptions, y: DOOR_HEIGHT / 2, height: DOOR_HEIGHT, depth: 0.22,
    });
    addPlanSegment(`${id}-trim-far`, pointAt(Math.max(0, farDistance - trimHalf)), pointAt(Math.min(length, farDistance + trimHalf)), {
      ...trimOptions, y: DOOR_HEIGHT / 2, height: DOOR_HEIGHT, depth: 0.22,
    });
    addPlanSegment(`${id}-trim-top`, near, far, {
      ...trimOptions, y: DOOR_HEIGHT, height: 0.08, depth: 0.22,
    });
    addPlanSegment(`${id}-threshold`, near, far, {
      collide: false, y: 0.015, height: 0.03, depth: 0.25, material: materials.red,
    });
    return center;
  };

  const addRamp = (id, bounds, startHeight, endHeight, material, parent = root) => {
    const { width, depth } = sizeOf(bounds);
    const { x, z } = centerOf(bounds);
    const rise = endHeight - startHeight;
    const length = Math.hypot(depth, rise);
    const mesh = new THREE.Mesh(unitBoxGeometry, material);
    mesh.name = id;
    mesh.position.set(planToWorldX(x), (startHeight + endHeight) / 2 - 0.045, z);
    mesh.rotation.x = -Math.atan2(rise, depth);
    mesh.scale.set(width, 0.09, length);
    mesh.receiveShadow = true;
    parent.add(mesh);
    sourceMeshCount += 1;
    return mesh;
  };

  const addSimpleRoomShell = (room, options = {}) => {
    const bounds = room.bounds;
    const center = centerOf(bounds);
    const height = options.height ?? WALL_HEIGHT;
    const material = options.material ?? materials.wall;
    if (options.floorMaterial) addFloor(room.id, bounds, options.floorMaterial, options.elevation ?? 0, root, options.metersPerRepeat ?? 0);
    if (options.ceiling !== false) addCeiling(room.id, bounds, options.elevation + height || height);
    const openings = { north: [], south: [], east: [], west: [] };
    const entrySide = room.entrySide ?? "south";
    const primaryCenter = room.doorCenter ?? ((entrySide === "north" || entrySide === "south") ? center.x : center.z);
    openings[entrySide].push({ center: primaryCenter });
    for (const extra of room.extraDoors ?? []) openings[extra.side].push({ center: extra.center, width: extra.width });
    const skippedSides = new Set(options.skipSides ?? []);
    if (!skippedSides.has("south")) addWallXWithOpenings(`${room.id}-south`, bounds.xMin, bounds.xMax, bounds.zMin, openings.south, { material, height });
    if (!skippedSides.has("north")) addWallXWithOpenings(`${room.id}-north`, bounds.xMin, bounds.xMax, bounds.zMax, openings.north, { material, height });
    if (!skippedSides.has("west")) addWallZWithOpenings(`${room.id}-west`, bounds.xMin, bounds.zMin, bounds.zMax, openings.west, { material, height });
    if (!skippedSides.has("east")) addWallZWithOpenings(`${room.id}-east`, bounds.xMax, bounds.zMin, bounds.zMax, openings.east, { material, height });
    for (const [side, sideOpenings] of Object.entries(openings)) {
      const coordinate = side === "south" ? bounds.zMin : side === "north" ? bounds.zMax : side === "west" ? bounds.xMin : bounds.xMax;
      if (!skippedSides.has(side)) sideOpenings.forEach((opening, index) => addDoorTrim(`${room.id}-${side}-${index}`, side, coordinate, opening.center, { width: opening.width }));
    }
  };

  const addTrashCan = (id, x, z, parent = root) => {
    const group = new THREE.Group();
    group.name = id;
    group.position.set(planToWorldX(x), 0, z);
    parent.add(group);
    addCylinder({ id: `${id}-body`, x: 0, y: 0.47, z: 0, radius: 0.34, height: 0.9, material: materials.black, parent: group, space: "local" });
    addCylinder({ id: `${id}-rim`, x: 0, y: 0.95, z: 0, radius: 0.37, height: 0.08, material: materials.stainless, parent: group, space: "local" });
    addBox({ id: `${id}-opening`, x: 0, y: 1.0, z: -0.04, width: 0.44, height: 0.04, depth: 0.27, material: materials.floorDark, parent: group, space: "local" });
    return group;
  };

  const addScreen = (auditorium, layout, parent, ceilingY) => {
    const roomWidth = auditorium.bounds.xMax - auditorium.bounds.xMin;
    const width = Math.min(roomWidth - 1.2, auditorium.preset === "large150" ? 15.6 : auditorium.preset === "medium58" ? 9.8 : 8.9);
    const maximumHeight = auditorium.preset === "large150" ? 5.35 : auditorium.preset === "medium58" ? 4.2 : 3.75;
    const height = Math.min(width / 2.08, maximumHeight, ceilingY - layout.frontElevation - 0.7);
    const x = (auditorium.bounds.xMin + auditorium.bounds.xMax) / 2;
    const z = auditorium.screenSide === "north" ? auditorium.bounds.zMax - 0.12 : auditorium.bounds.zMin + 0.12;
    const screen = new THREE.Mesh(unitPlaneGeometry, materials.screen);
    screen.name = `${auditorium.id}-screen`;
    screen.position.set(planToWorldX(x), layout.frontElevation + height / 2 + 0.38, z);
    screen.rotation.y = planToWorldYaw(auditorium.screenSide === "north" ? Math.PI : 0);
    screen.scale.set(width, height, 1);
    parent.add(screen);
    sourceMeshCount += 1;
    addBox({ id: `${auditorium.id}-screen-top`, x, y: screen.position.y + height / 2 + 0.1, z, width: width + 0.25, height: 0.14, depth: 0.17, material: materials.black, parent });
    addBox({ id: `${auditorium.id}-screen-bottom`, x, y: screen.position.y - height / 2 - 0.1, z, width: width + 0.25, height: 0.14, depth: 0.17, material: materials.black, parent });
  };

  const addAuditoriumBowl = (auditorium, layout, parent) => {
    const counts = {
      seat: auditorium.seats,
      arm: auditorium.seats * 2,
    };
    const cushionMesh = new THREE.InstancedMesh(seatGeometries.cushion, materials.seat, counts.seat);
    const backMesh = new THREE.InstancedMesh(seatGeometries.back, materials.seat, counts.seat);
    const baseMesh = new THREE.InstancedMesh(seatGeometries.base, materials.seatMetal, counts.seat);
    const armMesh = new THREE.InstancedMesh(seatGeometries.arm, materials.seat, counts.arm);
    const trayMesh = new THREE.InstancedMesh(seatGeometries.tray, materials.trayTable ?? materials.black, counts.seat);
    cushionMesh.name = `${auditorium.id}-seat-cushions`;
    backMesh.name = `${auditorium.id}-seat-backs`;
    baseMesh.name = `${auditorium.id}-seat-bases`;
    armMesh.name = `${auditorium.id}-seat-arms`;
    trayMesh.name = `${auditorium.id}-seat-trays`;
    const matrix = new THREE.Matrix4();
    let seatInstance = 0;
    let armInstance = 0;
    const seatWidth = layout.seatBounds.xMax - layout.seatBounds.xMin;
    const forward = auditorium.screenSide === "north" ? 1 : -1;

    const treadDepth = layout.rowPitch - RISER_DEPTH;
    layout.rows.forEach((row, rowIndex) => {
      addBox({
        id: `${auditorium.id}-tier-${rowIndex}`,
        x: layout.centerX,
        y: row.elevation - 0.055,
        z: row.z,
        width: seatWidth,
        height: 0.11,
        depth: treadDepth,
        material: materials.carpet,
        parent,
      });
      if (rowIndex > 0) {
        const previous = layout.rows[rowIndex - 1];
        const transitionZ = (row.z + previous.z) / 2;
        addBox({
          id: `${auditorium.id}-riser-${rowIndex}`,
          x: layout.centerX,
          y: (row.elevation + previous.elevation) / 2,
          z: transitionZ,
          width: seatWidth,
          height: Math.abs(row.elevation - previous.elevation),
          depth: RISER_DEPTH,
          material: materials.floorDark,
          parent,
        });
      }

      const spacing = Math.min(0.76, (seatWidth - 0.14) / Math.max(1, row.seatCount));
      const rowWidth = spacing * (row.seatCount - 1);
      for (let column = 0; column < row.seatCount; column += 1) {
        const planX = layout.centerX - rowWidth / 2 + column * spacing;
        const worldX = planToWorldX(planX);
        const backZ = row.z - forward * 0.23;
        matrix.makeTranslation(worldX, row.elevation + 0.54, row.z);
        cushionMesh.setMatrixAt(seatInstance, matrix);
        matrix.makeTranslation(worldX, row.elevation + 0.94, backZ);
        backMesh.setMatrixAt(seatInstance, matrix);
        matrix.makeTranslation(worldX, row.elevation + 0.28, row.z - forward * 0.06);
        baseMesh.setMatrixAt(seatInstance, matrix);
        matrix.makeTranslation(worldX, row.elevation + 0.8, row.z + forward * 0.34);
        trayMesh.setMatrixAt(seatInstance, matrix);
        for (const offset of [-0.34, 0.34]) {
          matrix.makeTranslation(worldX - offset, row.elevation + 0.68, row.z - forward * 0.02);
          armMesh.setMatrixAt(armInstance, matrix);
          armInstance += 1;
        }
        seatInstance += 1;
      }
      addPlanCollider(
        `${auditorium.id}-seat-row-${rowIndex}`,
        layout.centerX,
        row.elevation + 0.82,
        row.z,
        Math.max(0.5, rowWidth + 0.72),
        1.64,
        0.78,
      );
    });

    // Tier, riser, apron, and landing edges all share the same dimensions.
    // The previous build mixed a 96%-pitch tread with fixed risers, which left visible slits
    // in large rooms and coplanar overlaps in smaller rooms.
    const frontScreenwardEdge = layout.frontRowZ - layout.direction * treadDepth / 2;
    const rearWallwardEdge = layout.backRowZ + layout.direction * treadDepth / 2;
    const frontApron = auditorium.screenSide === "north"
      ? { xMin: layout.bowlBounds.xMin, xMax: layout.bowlBounds.xMax, zMin: frontScreenwardEdge, zMax: auditorium.bounds.zMax - 0.2 }
      : { xMin: layout.bowlBounds.xMin, xMax: layout.bowlBounds.xMax, zMin: auditorium.bounds.zMin + 0.2, zMax: frontScreenwardEdge };
    const rearLanding = auditorium.screenSide === "north"
      ? { xMin: layout.bowlBounds.xMin, xMax: layout.bowlBounds.xMax, zMin: auditorium.bounds.zMin + 0.2, zMax: rearWallwardEdge }
      : { xMin: layout.bowlBounds.xMin, xMax: layout.bowlBounds.xMax, zMin: rearWallwardEdge, zMax: auditorium.bounds.zMax - 0.2 };
    if (frontApron.zMax > frontApron.zMin) addFloor(`${auditorium.id}-screen-apron`, frontApron, materials.carpet, layout.frontElevation, parent);
    if (rearLanding.zMax > rearLanding.zMin) addFloor(`${auditorium.id}-rear-landing`, rearLanding, materials.carpet, layout.backElevation, parent);

    for (const aisle of Object.values(layout.sideAisles)) {
      const frontEndcap = {
        xMin: aisle.bounds.xMin,
        xMax: aisle.bounds.xMax,
        zMin: Math.min(frontScreenwardEdge, layout.frontRowZ),
        zMax: Math.max(frontScreenwardEdge, layout.frontRowZ),
      };
      const rearEndcap = {
        xMin: aisle.bounds.xMin,
        xMax: aisle.bounds.xMax,
        zMin: Math.min(layout.backRowZ + layout.direction * 0.0075, rearWallwardEdge),
        zMax: Math.max(layout.backRowZ + layout.direction * 0.0075, rearWallwardEdge),
      };
      addFloor(`${auditorium.id}-${aisle.side}-front-endcap`, frontEndcap, materials.carpet, layout.frontElevation, parent);
      addFloor(`${auditorium.id}-${aisle.side}-rear-endcap`, rearEndcap, materials.carpet, layout.backElevation, parent);
    }

    for (const tread of layout.sideStairTreads) {
      const { x, z } = centerOf(tread.bounds);
      const { width, depth } = sizeOf(tread.bounds);
      addBox({
        id: tread.id,
        x,
        y: tread.elevation - 0.045,
        z,
        width,
        height: 0.09,
        depth: Math.max(0.1, depth + 0.015),
        material: materials.carpet,
        parent,
      });
      const nosingZ = layout.direction > 0 ? tread.bounds.zMax : tread.bounds.zMin;
      addBox({ id: `${tread.id}-nosing`, x, y: tread.elevation + 0.014, z: nosingZ, width, height: 0.028, depth: 0.055, material: materials.red, parent });
    }

    // Cross-aisle ground remains authoritative in layout-geometry, but it is
    // already visually covered by the adjacent tier, side treads, and landing.
    // Rendering a second full-width slab here created hundreds of coplanar
    // overlaps that flashed while walking through the auditoriums.

    for (const mesh of [cushionMesh, backMesh, baseMesh, armMesh, trayMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
    sourceMeshCount += 5;
    seatCount += auditorium.seats;
  };

  const addAcousticPanels = (auditorium, parent, floorY = 0) => {
    const { bounds } = auditorium;
    const centerZ = (bounds.zMin + bounds.zMax) / 2;
    const depth = bounds.zMax - bounds.zMin;
    for (const sideX of [bounds.xMin + 0.11, bounds.xMax - 0.11]) {
      for (const offset of [-0.25, 0.25]) {
        addBox({ id: `${auditorium.id}-acoustic-${sideX}-${offset}`, x: sideX, y: floorY + 2.4, z: centerZ + offset * depth, width: 0.12, height: 2.9, depth: Math.max(2.2, depth * 0.33), material: materials.acoustic, parent });
      }
    }
  };

  const addSmallTheaterCubby = (auditorium, layout) => {
    const { bounds, entry } = auditorium;
    const halfWidth = entry.cubbyHalfWidth ?? 1.6;
    const depth = entry.cubbyDepth ?? 2.2;
    const cubby = entry.cubbyBounds ?? {
      xMin: entry.center - halfWidth,
      xMax: entry.center + halfWidth,
      zMin: bounds.zMax - depth,
      zMax: bounds.zMax,
    };
    const westX = cubby.xMin;
    const eastX = cubby.xMax;
    const southZ = cubby.zMin;
    const doorZ = entry.innerDoorCenter ?? southZ + Math.min(1.05, depth / 2);
    // The rear landing already extends through this footprint. A second floor
    // here was coplanar with it and caused visible flicker at every small-room
    // entrance.
    addWallX(`${auditorium.id}-cubby-back`, westX, eastX, southZ, { material: materials.darkWall });
    if (entry.turnSide === "west") {
      addWallZWithOpenings(`${auditorium.id}-cubby-west`, westX, southZ, bounds.zMax, [{ center: doorZ, baseY: layout.backElevation }], { material: materials.darkWall });
      if (entry.sharedBoundarySide !== "east" && Math.abs(eastX - bounds.xMax) > EPSILON) {
        addWallZ(`${auditorium.id}-cubby-east`, eastX, southZ, bounds.zMax, { material: materials.darkWall });
      }
      addDoorTrim(`${auditorium.id}-inner`, "west", westX, doorZ, { baseY: layout.backElevation });
      addTrashCan(`${auditorium.id}-trash`, eastX - 0.52, southZ + 0.55);
    } else {
      if (entry.sharedBoundarySide !== "west" && Math.abs(westX - bounds.xMin) > EPSILON) {
        addWallZ(`${auditorium.id}-cubby-west`, westX, southZ, bounds.zMax, { material: materials.darkWall });
      }
      addWallZWithOpenings(`${auditorium.id}-cubby-east`, eastX, southZ, bounds.zMax, [{ center: doorZ, baseY: layout.backElevation }], { material: materials.darkWall });
      addDoorTrim(`${auditorium.id}-inner`, "east", eastX, doorZ, { baseY: layout.backElevation });
      addTrashCan(`${auditorium.id}-trash`, westX + 0.52, southZ + 0.55);
    }
  };

  const addStorageRoom = (storage, options = {}) => {
    const height = storage.ceilingHeight ?? 2.32;
    addFloor(storage.id, storage.bounds, materials.floorDark);
    addCeiling(`${storage.id}-roof`, storage.bounds, height - 0.05);
    const openings = { north: [], south: [], east: [], west: [] };
    const doorSide = storage.doorSide;
    for (const center of storage.doorCenters ?? []) openings[doorSide].push({ center, height: 2.18 });
    addWallXWithOpenings(`${storage.id}-south`, storage.bounds.xMin, storage.bounds.xMax, storage.bounds.zMin, openings.south, { material: materials.darkWall, height });
    addWallXWithOpenings(`${storage.id}-north`, storage.bounds.xMin, storage.bounds.xMax, storage.bounds.zMax, openings.north, { material: materials.darkWall, height });
    addWallZWithOpenings(`${storage.id}-west`, storage.bounds.xMin, storage.bounds.zMin, storage.bounds.zMax, openings.west, { material: materials.darkWall, height });
    addWallZWithOpenings(`${storage.id}-east`, storage.bounds.xMax, storage.bounds.zMin, storage.bounds.zMax, openings.east, { material: materials.darkWall, height });
    for (const [side, sideOpenings] of Object.entries(openings)) {
      const coordinate = side === "south" ? storage.bounds.zMin : side === "north" ? storage.bounds.zMax : side === "west" ? storage.bounds.xMin : storage.bounds.xMax;
      sideOpenings.forEach((opening, index) => addDoorTrim(`${storage.id}-${side}-${index}`, side, coordinate, opening.center, { height: 2.18 }));
    }
    if (options.labelPosition) addLabel({ id: `${storage.id}-label`, text: storage.name.toUpperCase(), position: options.labelPosition, rotationY: options.labelRotation ?? 0, width: 2.5, height: 0.38, small: true, accent: "#f0c36f" });
  };

  const addT3Route = (auditorium, layout) => {
    const route = auditorium.entry.routeBounds;
    const ramp = auditorium.entry.ramp;
    const nook = auditorium.entry.usherNookBounds;
    const storage = roomById(auditorium.entry.storageId);
    const anteroom = storage.accessHall;
    addFloor(`${auditorium.id}-route-flat`, { ...route, zMax: ramp.bounds.zMin }, materials.corridorCarpet, ramp.startHeight, root, 2.4);
    addRamp(`${auditorium.id}-route-ramp`, ramp.bounds, ramp.startHeight, ramp.endHeight, materials.corridorCarpet);
    addFloor(`${auditorium.id}-route-arrival`, { ...route, zMin: ramp.bounds.zMax }, materials.corridorCarpet, ramp.endHeight, root, 2.4);
    addCeiling(`${auditorium.id}-route`, route);
    // The public route is deliberately open to the usher nook for its first
    // few metres. Only after that nook does the west wall resume.
    addWallZWithOpenings(`${auditorium.id}-route-west`, route.xMin, nook.zMax, route.zMax, [
      { center: auditorium.entry.arrivalZ, width: 2.45, height: 3.6, baseY: layout.frontElevation },
    ], { material: materials.darkWall });
    addWallZ(`${auditorium.id}-route-east`, route.xMax, route.zMin, route.zMax, { material: materials.darkWall });
    addWallX(`${auditorium.id}-route-north`, route.xMin, route.xMax, route.zMax, { material: materials.darkWall });

    // Usher waiting nook: open on the east to the public route, with its
    // storage door on the west. The trash can sits clear of both openings.
    addFloor(`${auditorium.id}-usher-nook`, nook, materials.floorDark);
    addCeiling(`${auditorium.id}-usher-nook`, nook);
    // The shared courtyard facade owns the nook's south edge and runs flush
    // to the Theater 3 jamb; do not draw a coplanar second wall here.
    addWallX(`${auditorium.id}-usher-nook-north`, nook.xMin, nook.xMax, nook.zMax, { material: materials.darkWall });
    addWallZWithOpenings(`${storage.id}-anteroom-east`, anteroom.xMax, anteroom.zMin, anteroom.zMax, [
      { center: storage.outerDoorCenter, height: 2.18 },
    ], { material: materials.darkWall, height: storage.ceilingHeight });
    addDoorTrim(`${auditorium.id}-storage-hall-door`, "west", anteroom.xMax, storage.outerDoorCenter, { height: 2.18 });
    addTrashCan(`${auditorium.id}-usher-trash`, nook.xMin + 0.58, nook.zMin + 0.65);
    addLabel({ id: `${auditorium.id}-storage-arrow`, text: "STORAGE  ←", position: [anteroom.xMax + 0.11, 2.05, storage.outerDoorCenter], rotationY: Math.PI / 2, width: 1.8, height: 0.36, small: true, accent: "#f0c36f" });
    addLabel({ id: `${auditorium.id}-turn-arrow`, text: "THEATER 3  ←", position: [route.xMin + 0.11, 2.95, auditorium.entry.arrivalZ - 0.7], rotationY: Math.PI / 2, width: 2.05, height: 0.4, small: true });
    addLightPanel(`${auditorium.id}-entrance-light`, (route.xMin + route.xMax) / 2, 69.4, 1.8, 0.32);
    addLightPanel(`${auditorium.id}-route-light-a`, (route.xMin + route.xMax) / 2, 73.5, 1.5, 0.32);
    addLightPanel(`${auditorium.id}-route-light-b`, (route.xMin + route.xMax) / 2, 82, 1.5, 0.32);
    addLightPanel(`${auditorium.id}-route-light-c`, (route.xMin + route.xMax) / 2, 93, 1.5, 0.32);

    addStorageRoom(storage, { labelPosition: [(storage.bounds.xMin + storage.bounds.xMax) / 2, 2.0, storage.bounds.zMin + 0.12], labelRotation: Math.PI });
    addFloor(`${storage.id}-anteroom`, anteroom, materials.floorDark);
    addCeiling(`${storage.id}-anteroom`, anteroom, storage.ceilingHeight - 0.05);
    // The MEN/T3 shared back wall owns the full south edge of this anteroom.
    // Authoring another low wall here would overlap it and flash while moving.
    addWallZ(`${storage.id}-anteroom-west`, anteroom.xMin, anteroom.zMin, anteroom.zMax, { material: materials.darkWall, height: storage.ceilingHeight });
    // Storage's south wall owns the shared two-door boundary at z=72.
  };

  const addDoglegRoute = (auditorium, layout) => {
    const { entry, bounds } = auditorium;
    const stem = entry.stemBounds;
    const lateral = entry.lateralBounds;
    const long = entry.longRouteBounds;
    const routeCenter = (long.xMin + long.xMax) / 2;
    for (const [name, floorBounds] of [["stem", stem], ["lateral", lateral], ["long", long]]) {
      addFloor(`${auditorium.id}-${name}`, floorBounds, materials.corridorCarpet, 0, root, 2.4);
      addCeiling(`${auditorium.id}-${name}`, floorBounds);
    }
    addFloor(`${auditorium.id}-front-side-apron`, {
      ...layout.routeReserve.bounds,
      zMin: long.zMax,
      zMax: bounds.zMax - 0.2,
    }, materials.carpet, layout.frontElevation);
    // The shared courtyard wall owns the outer doorway and header.
    addWallZ(`${auditorium.id}-stem-west`, stem.xMin, stem.zMin, stem.zMax, { material: materials.darkWall });
    addWallZ(`${auditorium.id}-stem-east`, stem.xMax, stem.zMin, stem.zMax, { material: materials.darkWall });
    // The lateral corridor is a rectilinear union: its south wall omits the
    // stem, and its north wall omits the long side passage.
    addWallX(`${auditorium.id}-lateral-south-west`, lateral.xMin, stem.xMin, lateral.zMin, { material: materials.darkWall });
    addWallX(`${auditorium.id}-lateral-south-east`, stem.xMax, lateral.xMax, lateral.zMin, { material: materials.darkWall });
    addWallX(`${auditorium.id}-lateral-north-west`, lateral.xMin, long.xMin, lateral.zMax, { material: materials.darkWall });
    addWallX(`${auditorium.id}-lateral-north-east`, long.xMax, lateral.xMax, lateral.zMax, { material: materials.darkWall });
    addWallZ(`${auditorium.id}-lateral-west-cap`, lateral.xMin, lateral.zMin, lateral.zMax, { material: materials.darkWall });
    addWallZ(`${auditorium.id}-lateral-east-cap`, lateral.xMax, lateral.zMin, lateral.zMax, { material: materials.darkWall });
    const dividerX = entry.routeSide === "west" ? long.xMax : long.xMin;
    const outerX = entry.routeSide === "west" ? long.xMin : long.xMax;
    addWallZ(`${auditorium.id}-long-divider`, dividerX, lateral.zMax, entry.arrivalZ - 0.65, { material: materials.darkWall });
    addWallZ(`${auditorium.id}-outer-route`, outerX, lateral.zMax, bounds.zMin, { material: materials.darkWall });
    const arrow = entry.firstTurn === "west" ? "←" : "→";
    addLabel({ id: `${auditorium.id}-route-arrow`, text: `THEATER ${auditorium.number}  ${arrow}`, position: [entry.center, 2.7, 70.48], rotationY: Math.PI, width: 2.15, height: 0.42, small: true });
    addLightPanel(`${auditorium.id}-stem-light`, entry.center, 69.4, 1.45, 0.3);
    addLightPanel(`${auditorium.id}-long-light-a`, routeCenter, 76.5, 1.45, 0.3);
    addLightPanel(`${auditorium.id}-long-light-b`, routeCenter, 84.0, 1.45, 0.3);
  };

  const addT6Route = (auditorium, layout) => {
    const { entry } = auditorium;
    const storage = roomById(entry.storageId);
    const underTierHeight = storage.ceilingHeight;
    addFloor(`${auditorium.id}-vestibule`, entry.vestibuleBounds, materials.carpet);
    addFloor(`${auditorium.id}-transverse`, entry.transverseBounds, materials.carpet);
    addFloor(`${auditorium.id}-long`, entry.longRouteBounds, materials.carpet);
    addFloor(`${auditorium.id}-front-side-apron`, {
      ...layout.routeReserve.bounds,
      zMin: entry.longRouteBounds.zMax,
      zMax: auditorium.bounds.zMax - 0.2,
    }, materials.carpet, layout.frontElevation);
    addCeiling(`${auditorium.id}-vestibule`, entry.vestibuleBounds, underTierHeight - 0.05);
    addCeiling(`${auditorium.id}-transverse`, entry.transverseBounds, underTierHeight - 0.05);
    // This entire hall runs beneath the upper seating deck. Keeping the roof
    // low and continuous prevents sightlines into the back rows from below.
    addCeiling(`${auditorium.id}-long`, entry.longRouteBounds, underTierHeight - 0.05);
    // The auditorium's west perimeter owns the vestibule exterior wall.
    addWallZ(`${auditorium.id}-vestibule-east`, entry.vestibuleBounds.xMax, entry.vestibuleBounds.zMin, entry.vestibuleBounds.zMax, { material: materials.darkWall, height: underTierHeight });
    addWallX(`${auditorium.id}-transverse-south-right`, entry.vestibuleBounds.xMax, entry.transverseBounds.xMax, entry.transverseBounds.zMin, { material: materials.darkWall, height: underTierHeight });
    const transverseCenterX = (entry.transverseBounds.xMin + entry.transverseBounds.xMax) / 2;
    const longCenterX = (entry.longRouteBounds.xMin + entry.longRouteBounds.xMax) / 2;
    addStorageRoom(storage, { labelPosition: [(storage.bounds.xMin + storage.bounds.xMax) / 2, 1.92, storage.bounds.zMin + 0.14], labelRotation: Math.PI });
    addWallX(`${auditorium.id}-transverse-return`, entry.transverseBounds.xMin, storage.bounds.xMin, entry.transverseBounds.zMax, { material: materials.darkWall, height: storage.ceilingHeight });
    // The auditorium's east perimeter wall is already the outer wall of this
    // passage. Authoring it again here produced coplanar dark surfaces.
    addWallZ(`${auditorium.id}-long-divider`, entry.longRouteBounds.xMin, storage.bounds.zMax, entry.arrivalZ - 0.1, { material: materials.darkWall, height: underTierHeight });
    addLabel({ id: `${auditorium.id}-first-arrow`, text: "THEATER 6  →", position: [transverseCenterX, 1.78, entry.transverseBounds.zMax - 0.12], rotationY: Math.PI, width: 2.0, height: 0.4, small: true });
    addLabel({ id: `${auditorium.id}-second-arrow`, text: "THEATER 6  ←", position: [entry.longRouteBounds.xMin + 0.1, 1.78, 78.0], rotationY: Math.PI / 2, width: 2.0, height: 0.4, small: true });
    const lowLightY = underTierHeight - 0.18;
    addLightPanel(`${auditorium.id}-route-light-a`, transverseCenterX, 66.8, 2.0, 0.32, lowLightY);
    addLightPanel(`${auditorium.id}-route-light-b`, longCenterX, 74, 1.45, 0.32, lowLightY);
    addLightPanel(`${auditorium.id}-route-light-c`, longCenterX, 83.5, 1.45, 0.32, lowLightY);
  };

  const addStraightRoute = (auditorium, layout) => {
    const { entry, bounds } = auditorium;
    const ramp = entry.ramp;
    const routeBounds = { ...ramp.bounds, zMin: bounds.zMin, zMax: entry.arrivalZ + 0.55 };
    if (ramp.bounds.zMin > bounds.zMin) addFloor(`${auditorium.id}-soundlock`, { ...routeBounds, zMax: ramp.bounds.zMin }, materials.carpet, ramp.startHeight);
    addRamp(`${auditorium.id}-route-ramp`, ramp.bounds, ramp.startHeight, ramp.endHeight, materials.carpet);
    if (routeBounds.zMax > ramp.bounds.zMax) addFloor(`${auditorium.id}-arrival`, { ...routeBounds, zMin: ramp.bounds.zMax }, materials.carpet, ramp.endHeight);
    addFloor(`${auditorium.id}-front-side-apron`, {
      ...layout.routeReserve.bounds,
      zMin: routeBounds.zMax,
      zMax: bounds.zMax - 0.2,
    }, materials.carpet, layout.frontElevation);
    addCeiling(`${auditorium.id}-route`, routeBounds, 4.9);
    const dividerX = entry.routeSide === "west" ? routeBounds.xMax : routeBounds.xMin;
    // The auditorium perimeter supplies the route's outside wall; only the
    // inner divider is unique. Its first section is deliberately open to the
    // usher waiting nook shown in both T7 and T8 drawings.
    const nook = entry.usherNookBounds;
    addWallZ(`${auditorium.id}-route-divider`, dividerX, nook?.zMax ?? bounds.zMin, entry.arrivalZ - 0.65, { material: materials.darkWall, height: 4.9 });
    if (nook) {
      addFloor(`${auditorium.id}-usher-nook`, nook, materials.floorDark);
      addCeiling(`${auditorium.id}-usher-nook`, nook, 4.9);
      addWallX(`${auditorium.id}-usher-nook-north`, nook.xMin, nook.xMax, nook.zMax, { material: materials.darkWall, height: 4.9 });
      addWallZ(`${auditorium.id}-usher-nook-east`, nook.xMax, nook.zMin, nook.zMax, { material: materials.darkWall, height: 4.9 });
      addTrashCan(`${auditorium.id}-usher-trash`, nook.xMax - 0.62, nook.zMin + 0.72);
    }
    addLightPanel(`${auditorium.id}-route-light-a`, entry.center, bounds.zMin + 3.2, 1.4, 0.3, 4.72);
    addLightPanel(`${auditorium.id}-route-light-b`, entry.center, bounds.zMin + 13.4, 1.4, 0.3, 4.72);
  };

  const addAuditorium = (auditorium) => {
    const layout = auditoriumLayouts.get(auditorium.id);
    const ceilingY = {
      large150: 7.55,
      medium58: 6.25,
      standard50: 5.6,
      compact38: 5.45,
    }[auditorium.preset];
    const interior = new THREE.Group();
    interior.name = `${auditorium.id}-interior`;
    // Keep every auditorium resident and visible. Three.js still performs
    // normal camera-frustum culling, but no room is proximity-switched; that
    // prevents the visible doorway/interior pop-in reported in v3.
    interior.visible = true;
    root.add(interior);
    auditoriumGroups.set(auditorium.id, { auditorium, layout, group: interior });
    const wallBase = Math.min(0, layout.frontElevation);
    const wallHeight = ceilingY - wallBase;
    addCeiling(auditorium.id, auditorium.bounds, ceilingY, interior);

    const screenZ = auditorium.screenSide === "north" ? auditorium.bounds.zMax : auditorium.bounds.zMin;
    addWallX(`${auditorium.id}-screen-wall`, auditorium.bounds.xMin, auditorium.bounds.xMax, screenZ, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
    if (auditorium.screenSide === "south") {
      if (auditorium.entry.sharedBoundarySide !== "west" || auditorium.entry.sharedWallOwner) {
        addWallZ(`${auditorium.id}-west-wall`, auditorium.bounds.xMin, auditorium.bounds.zMin, auditorium.bounds.zMax, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
      }
      if (auditorium.entry.sharedBoundarySide !== "east" || auditorium.entry.sharedWallOwner) {
        addWallZ(`${auditorium.id}-east-wall`, auditorium.bounds.xMax, auditorium.bounds.zMin, auditorium.bounds.zMax, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
      }
      addWallXWithOpenings(`${auditorium.id}-hall-wall`, auditorium.bounds.xMin, auditorium.bounds.xMax, auditorium.bounds.zMax, [{ center: auditorium.entry.center, baseY: 0 }], { material: materials.darkWall, height: ceilingY, parent: interior });
      addDoorTrim(`${auditorium.id}-outer`, "north", auditorium.bounds.zMax, auditorium.entry.center);
      addSmallTheaterCubby(auditorium, layout);
    } else {
      const southOpenings = [];
      if ([4, 5].includes(auditorium.number)) {
        const long = auditorium.entry.longRouteBounds;
        southOpenings.push({ center: (long.xMin + long.xMax) / 2, width: long.xMax - long.xMin });
      } else if (auditorium.number === 6) {
        southOpenings.push({ center: auditorium.entry.center, width: 2.2, height: 2.18 });
      } else if ([7, 8].includes(auditorium.number)) {
        southOpenings.push({ center: auditorium.entry.center });
      }
      if (auditorium.number === 3) {
        const storage = roomById("under-storage-3");
        addWallX(`${auditorium.id}-south-west-cap`, auditorium.bounds.xMin, storage.bounds.xMin, auditorium.bounds.zMin, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
      } else {
        addWallXWithOpenings(`${auditorium.id}-south-wall`, auditorium.bounds.xMin, auditorium.bounds.xMax, auditorium.bounds.zMin, southOpenings, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
      }
      const westOpenings = [];
      const eastOpenings = auditorium.number === 3 ? [{ center: auditorium.entry.arrivalZ, width: 2.7, baseY: layout.frontElevation }] : [];
      if (auditorium.entry.sharedBoundarySide !== "west" || auditorium.entry.sharedWallOwner) {
        addWallZWithOpenings(`${auditorium.id}-west-wall`, auditorium.bounds.xMin, auditorium.bounds.zMin, auditorium.bounds.zMax, westOpenings, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
      }
      if (auditorium.number === 3) {
        addWallZ(`${auditorium.id}-east-wall-north-cap`, auditorium.bounds.xMax, auditorium.entry.routeBounds.zMax, auditorium.bounds.zMax, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
      } else if (auditorium.entry.sharedBoundarySide !== "east" || auditorium.entry.sharedWallOwner) {
        addWallZWithOpenings(`${auditorium.id}-east-wall`, auditorium.bounds.xMax, auditorium.bounds.zMin, auditorium.bounds.zMax, eastOpenings, { material: materials.darkWall, baseY: wallBase, height: wallHeight, parent: interior });
      }
      if ([6, 7, 8].includes(auditorium.number)) addDoorTrim(`${auditorium.id}-outer`, "south", auditorium.bounds.zMin, auditorium.entry.center, auditorium.number === 6 ? { width: 2.2, height: 2.18 } : undefined);
      if (auditorium.number === 3) addT3Route(auditorium, layout);
      if (auditorium.entry.type === "dogleg") addDoglegRoute(auditorium, layout);
      if (auditorium.number === 6) addT6Route(auditorium, layout);
      if ([7, 8].includes(auditorium.number)) addStraightRoute(auditorium, layout);
    }

    addScreen(auditorium, layout, interior, ceilingY);
    addAuditoriumBowl(auditorium, layout, interior);
    addAcousticPanels(auditorium, interior, layout.frontElevation);
    const portalZ = auditorium.screenSide === "south" ? auditorium.bounds.zMax + 0.13
      : auditorium.entry.type === "dogleg" ? 68.05
        : auditorium.number === 3 ? auditorium.entry.outerPlaneZ - 0.13
          : auditorium.bounds.zMin - 0.13;
    addLabel({
      id: `${auditorium.id}-sign`,
      text: `THEATER ${auditorium.number}`,
      position: [auditorium.entry.center, 3.08, portalZ],
      rotationY: auditorium.screenSide === "north" ? Math.PI : 0,
      width: auditorium.number >= 10 ? 2.35 : 2.05,
      height: 0.52,
      small: true,
    });
    addLightPanel(`${auditorium.id}-light-a`, layout.centerX, (layout.frontRowZ + layout.backRowZ) / 2 - 2, 2.2, 0.34, ceilingY - 0.2, interior);
    addLightPanel(`${auditorium.id}-light-b`, layout.centerX, (layout.frontRowZ + layout.backRowZ) / 2 + 2, 2.2, 0.34, ceilingY - 0.2, interior);
  };

  const addStallBank = (room, bank, bankIndex) => {
    const main = room.footprintRects[0];
    const southFacing = bank.side !== "north";
    const attachmentZ = bank.side === "north"
      ? main.zMax
      : bank.side === "south-lobe" ? room.footprintRects[1].zMin : main.zMin;
    const inward = southFacing ? 1 : -1;
    const bayWidth = (bank.end - bank.start) / bank.count;
    const bankCenterZ = attachmentZ + inward * bank.depth / 2;
    for (let edge = 0; edge <= bank.count; edge += 1) {
      const x = bank.start + bayWidth * edge;
      addBox({
        id: `${room.id}-stall-bank-${bankIndex}-partition-${edge}`,
        x, y: 1.05, z: bankCenterZ, width: 0.055, height: 2.1, depth: bank.depth,
        material: materials.stall, collide: true,
      });
    }
    for (let index = 0; index < bank.count; index += 1) {
      const x = bank.start + bayWidth * (index + 0.5);
      addBox({
        id: `${room.id}-stall-bank-${bankIndex}-door-${index}`,
        x, y: 1.0, z: attachmentZ + inward * (bank.depth - 0.025),
        width: Math.max(0.58, bayWidth - 0.18), height: 2.0, depth: 0.05,
        material: materials.stall, collide: true,
      });
      addBox({
        id: `${room.id}-toilet-${bankIndex}-${index}`,
        x, y: 0.32, z: attachmentZ + inward * 0.55,
        width: Math.min(0.58, bayWidth * 0.62), height: 0.64, depth: 0.7,
        material: materials.porcelain, collide: true,
      });
    }
  };

  const addNorthFixtureBank = (room, fixture, bankIndex, type) => {
    const wallZ = room.footprintRects[0].zMax;
    const bayWidth = (fixture.end - fixture.start) / fixture.count;
    for (let index = 0; index < fixture.count; index += 1) {
      const x = fixture.start + bayWidth * (index + 0.5);
      if (type === "urinal") {
        addBox({ id: `${room.id}-urinal-${bankIndex}-${index}`, x, y: 0.72, z: wallZ - 0.32, width: Math.min(0.48, bayWidth * 0.56), height: 0.72, depth: 0.42, material: materials.porcelain, collide: true });
      } else {
        const width = fixture.trough ? fixture.end - fixture.start - 0.18 : Math.min(1.05, bayWidth - 0.18);
        addBox({ id: `${room.id}-sink-${bankIndex}-${index}`, x, y: 0.82, z: wallZ - 0.38, width, height: 0.16, depth: 0.52, material: materials.porcelain, collide: true });
        // Mirrors sit just inside the wall face; they never cross or share the
        // wall plane, avoiding the flashing/overhang seen in prior versions.
        addBox({ id: `${room.id}-mirror-${bankIndex}-${index}`, x, y: 1.72, z: wallZ - 0.12, width: Math.max(0.72, width - 0.14), height: 1.0, depth: 0.035, material: materials.mirror });
      }
    }
  };

  const addRestroomFixtures = (room) => {
    room.fixtures.stalls.forEach((bank, index) => addStallBank(room, bank, index));
    room.fixtures.urinals?.forEach((bank, index) => addNorthFixtureBank(room, bank, index, "urinal"));
    room.fixtures.sinks.forEach((bank, index) => addNorthFixtureBank(room, bank, index, "sink"));
  };

  const addRestroom = (room) => {
    const [main, ...lobes] = room.footprintRects;
    room.footprintRects.forEach((footprint, index) => {
      addFloor(`${room.id}-section-${index}`, footprint, materials.lobbyTile);
      addCeiling(`${room.id}-section-${index}`, footprint);
    });

    if (room.id === "boys-restroom") {
      const lobe = lobes[0];
      const fountainNook = publicById("boys-fountain-alcove");
      const entryCubby = publicById("boys-men-entry-cubby");
      addFloor(fountainNook.id, fountainNook.bounds, materials.corridorCarpet, 0, root, 2.4);
      addCeiling(fountainNook.id, fountainNook.bounds);
      addFloor(entryCubby.id, entryCubby.bounds, materials.corridorCarpet, 0, root, 2.4);
      addCeiling(entryCubby.id, entryCubby.bounds);

      // One wall, two finishes: warm restroom surface to the south and dark
      // under-storage/usher surface to the north. Keeping this as one collider
      // prevents the overlapping-wall flicker that motivated V8.
      addWallX("boys-t3-shared-back-wall", T3_MEN_PLAN.sharedBackWall.xMin, T3_MEN_PLAN.sharedBackWall.xMax, T3_MEN_PLAN.sharedBackWall.z, {
        material: [
          materials.wall,
          materials.wall,
          materials.wall,
          materials.wall,
          materials.darkWall,
          materials.wall,
        ],
      });
      addWallZ(`${room.id}-west`, main.xMin, main.zMin, main.zMax);
      // This vertical wall is the one called out in the V8 sketch: it runs
      // continuously from the hall-side lobe to Theater 3's left door jamb.
      addWallZ(`${room.id}-east`, main.xMax, lobe.zMin, main.zMax);
      addWallX(`${room.id}-south`, main.xMin, lobe.xMin, main.zMin);
      addWallX(`${room.id}-entry-south`, lobe.xMin, lobe.xMax, lobe.zMin);
      addWallZWithOpenings(`${room.id}-entry-west`, lobe.xMin, lobe.zMin, lobe.zMax, [{ center: room.entry.center, width: room.entry.width }]);
      addDoorTrim(`${room.id}-entry`, "west", lobe.xMin, room.entry.center, { width: room.entry.width });
      const cubbyWidth = entryCubby.bounds.xMax - entryCubby.bounds.xMin;
      // The fountain nook is open to the hall. Its west/mounting wall is the
      // trash room's east wall, while this return separates H2O from MEN.
      addWallZ("boys-entry-cubby-west", entryCubby.bounds.xMin, entryCubby.bounds.zMin, entryCubby.bounds.zMax, { material: materials.darkWall });
      addWallXWithOpenings(
        "boys-men-cubby-mouth",
        entryCubby.bounds.xMin,
        entryCubby.bounds.xMax,
        entryCubby.bounds.zMin,
        [{ center: (entryCubby.bounds.xMin + entryCubby.bounds.xMax) / 2, width: cubbyWidth }],
        { material: materials.darkWall },
      );
      addLabel({ id: "boys-men-sign", text: "MEN", position: [(entryCubby.bounds.xMin + entryCubby.bounds.xMax) / 2, 2.95, entryCubby.bounds.zMin - 0.13], rotationY: Math.PI, width: 1.2, height: 0.42, small: true, accent: "#68a3d8" });
    } else {
      const [southwestLobe, connector, entryLobe] = lobes;
      addWallX(`${room.id}-north`, main.xMin, main.xMax, main.zMax);
      addWallZ(`${room.id}-west`, main.xMin, southwestLobe.zMin, main.zMax);
      addWallZ(`${room.id}-east`, main.xMax, main.zMin, main.zMax);
      addWallX(`${room.id}-south-east`, entryLobe.xMax, main.xMax, main.zMin);
      addWallX(`${room.id}-southwest-lobe-south`, southwestLobe.xMin, southwestLobe.xMax, southwestLobe.zMin);
      addWallZ(`${room.id}-southwest-lobe-east`, southwestLobe.xMax, southwestLobe.zMin, southwestLobe.zMax);
      addWallX(`${room.id}-connector-south`, connector.xMin, connector.xMax, connector.zMin);
      addWallX(`${room.id}-entry-lobe-north`, entryLobe.xMin, entryLobe.xMax, entryLobe.zMax);
      addWallZ(`${room.id}-entry-lobe-east`, entryLobe.xMax, entryLobe.zMin, entryLobe.zMax);
      addWallZWithOpenings(`${room.id}-entry-lobe-west`, entryLobe.xMin, entryLobe.zMin, entryLobe.zMax, [{ center: room.entry.center, width: room.entry.width }]);
      addDoorTrim(`${room.id}-entry`, "west", entryLobe.xMin, room.entry.center, { width: room.entry.width });
    }

    addRestroomFixtures(room);
    if (room.id !== "boys-restroom") addLabel({ id: `${room.id}-sign`, text: room.name.toUpperCase(), position: [room.entry.coordinate - 0.13, 2.95, room.entry.center], rotationY: -Math.PI / 2, width: 2.45, height: 0.44, small: true, accent: "#68a3d8" });
    addLightPanel(`${room.id}-light`, (main.xMin + main.xMax) / 2, (main.zMin + main.zMax) / 2, 2.2, 0.4);
  };

  const addPOSStation = (station) => {
    const [planX, , z] = station.position;
    const group = new THREE.Group();
    group.name = station.id;
    group.position.set(planToWorldX(planX), 0, z);
    group.rotation.y = planToWorldYaw(station.rotation);
    root.add(group);
    const localBox = (id, x, y, localZ, width, height, depth, material) => addBox({ id, x, y, z: localZ, width, height, depth, material, parent: group, space: "local" });
    localBox(`${station.id}-drawer`, 0, 1.13, 0, 0.7, 0.16, 0.48, materials.black);
    localBox(`${station.id}-pole`, 0.1, 1.47, 0, 0.08, 0.62, 0.08, materials.stainless);
    localBox(`${station.id}-screen`, 0.1, 1.75, -0.02, 0.12, 0.5, 0.72, materials.display);
    localBox(`${station.id}-reader`, -0.34, 1.26, 0.2, 0.24, 0.12, 0.34, materials.black);
    localBox(`${station.id}-printer`, -0.2, 1.25, -0.25, 0.34, 0.16, 0.28, materials.stainless);
  };

  const addCounterPolyline = () => {
    const points = LOBBY_PLAN.customerCounter;
    points.slice(0, -1).forEach((start, index) => {
      const end = points[index + 1];
      addPlanSegment(`customer-counter-${index}`, start, end, { y: 0.56, height: 1.12, depth: 1.08, material: materials.wood });
      addPlanSegment(`customer-counter-top-${index}`, start, end, { y: 1.16, height: 0.1, depth: 1.3, material: materials.counterStone, collide: false });
    });
    for (const station of POS_STATIONS) addPOSStation(station);
    addLabel({ id: "concession-header", text: "CONCESSIONS", position: [-20.9, 3.72, 11.5], rotationY: Math.PI / 2, width: 5.5, height: 0.62 });
    addLabel({ id: "bar-header", text: "THE LANAI BAR", position: [-12.45, 3.28, 20.92], rotationY: Math.PI, width: 3.8, height: 0.52, accent: "#f0c36f" });
  };

  const addBoxOfficeAndKiosks = () => {
    const vertical = LOBBY_PLAN.boxOfficeVertical;
    const horizontal = LOBBY_PLAN.boxOfficeReturn;
    addBox({ id: "box-office-vertical", x: (vertical.xMin + vertical.xMax) / 2, y: 0.56, z: (vertical.zMin + vertical.zMax) / 2, width: vertical.xMax - vertical.xMin, height: 1.12, depth: vertical.zMax - vertical.zMin, material: materials.wood, collide: true });
    addBox({ id: "box-office-vertical-top", x: (vertical.xMin + vertical.xMax) / 2, y: 1.16, z: (vertical.zMin + vertical.zMax) / 2, width: vertical.xMax - vertical.xMin + 0.18, height: 0.1, depth: vertical.zMax - vertical.zMin + 0.18, material: materials.counterStone });
    addBox({ id: "box-office-return", x: (horizontal.xMin + horizontal.xMax) / 2, y: 0.56, z: (horizontal.zMin + horizontal.zMax) / 2, width: horizontal.xMax - horizontal.xMin, height: 1.12, depth: horizontal.zMax - horizontal.zMin, material: materials.wood, collide: true });
    addBox({ id: "box-office-return-top", x: (horizontal.xMin + horizontal.xMax) / 2, y: 1.16, z: (horizontal.zMin + horizontal.zMax) / 2, width: horizontal.xMax - horizontal.xMin + 0.18, height: 0.1, depth: horizontal.zMax - horizontal.zMin + 0.18, material: materials.counterStone });
    addLabel({ id: "box-office-sign", text: "BOX OFFICE", position: [12.3, 2.65, 6.32], rotationY: Math.PI, width: 2.8, height: 0.48 });
    for (const kiosk of LOBBY_PLAN.kiosks) {
      const [x, , z] = kiosk.position;
      addBox({ id: `${kiosk.id}-body`, x, y: 0.8, z, width: 0.76, height: 1.6, depth: 0.9, material: materials.black, collide: true, rotationY: kiosk.rotation });
      addBox({ id: `${kiosk.id}-screen`, x: x - 0.42, y: 1.15, z, width: 0.05, height: 0.7, depth: 0.55, material: materials.display, rotationY: 0 });
      addLabel({ id: `${kiosk.id}-label`, text: "TICKETS", position: [x - 0.48, 1.68, z], rotationY: -Math.PI / 2, width: 0.75, height: 0.25, small: true, accent: "#68a3d8" });
    }
  };

  const addCupCaddy = (id, x, z) => {
    addBox({ id: `${id}-base`, x, y: 1.12, z, width: 0.78, height: 0.2, depth: 0.72, material: materials.black });
    for (let index = -1; index <= 1; index += 1) {
      addCylinder({ id: `${id}-cup-${index}`, x: x + index * 0.22, y: 1.44, z, radius: 0.1, height: 0.54, material: materials.porcelain });
      addCylinder({ id: `${id}-lid-${index}`, x: x + index * 0.22, y: 1.75, z, radius: 0.12, height: 0.06, material: materials.black });
    }
    addBox({ id: `${id}-straws`, x, y: 1.4, z: z + 0.28, width: 0.18, height: 0.58, depth: 0.18, material: materials.stainless });
  };

  const addSodaService = () => {
    const court = COURTYARD_PLAN;
    const island = FOUNTAIN_PLAN.island;
    const rear = FOUNTAIN_PLAN.rearCounter;
    const islandCenter = centerOf(island);
    const rearCenter = centerOf(rear);
    addFloor(court.id, court.bounds, materials.courtyardTile, 0, root, 2.15);
    addCeiling(court.id, court.bounds);
    // The MEN east wall owns the court's west boundary and terminates exactly
    // at the left jamb of Theater 3. A second wall here would be coplanar.
    addWallZ("fountain-courtyard-east", court.bounds.xMax, court.bounds.zMin, court.bounds.zMax, { material: materials.darkWall });
    addWallXWithOpenings(
      "fountain-courtyard-shared-back-wall",
      court.bounds.xMin,
      court.bounds.xMax,
      court.backWallZ,
      court.doors.map((door) => ({ center: door.center, width: door.width })),
      { material: materials.darkWall },
    );
    for (const door of court.doors) {
      addDoorTrim(`courtyard-${door.targetId}`, "north", court.backWallZ, door.center, { width: door.width });
    }
    addBox({ id: "soda-island", x: islandCenter.x, y: 0.52, z: islandCenter.z, width: island.xMax - island.xMin, height: 1.04, depth: island.zMax - island.zMin, material: materials.wood, collide: true });
    addBox({ id: "soda-island-top", x: islandCenter.x, y: 1.08, z: islandCenter.z, width: island.xMax - island.xMin, height: 0.1, depth: island.zMax - island.zMin, material: materials.counterStone });
    addCupCaddy("soda-cup-caddy", islandCenter.x - 0.25, islandCenter.z);
    addBox({ id: "soda-rear-counter", x: rearCenter.x, y: 0.5, z: rearCenter.z, width: rear.xMax - rear.xMin, height: 1, depth: rear.zMax - rear.zMin, material: materials.wood, collide: true });
    // The top overhangs only toward the guest; its back edge remains exactly
    // flush with the wall at z=68.2.
    addBox({ id: "soda-rear-counter-top", x: rearCenter.x, y: 1.04, z: (rear.zMin - 0.18 + rear.zMax) / 2, width: rear.xMax - rear.xMin, height: 0.09, depth: rear.zMax - (rear.zMin - 0.18), material: materials.counterStone });
    const partition = court.waistPartition;
    addBox({
      id: "theater-3-task-waist-partition",
      x: partition.x,
      y: partition.height / 2,
      z: (partition.zMin + partition.zMax) / 2,
      width: partition.thickness,
      height: partition.height,
      depth: partition.zMax - partition.zMin,
      material: materials.display,
      collide: true,
    });
    addBox({
      id: "theater-3-task-waist-partition-cap",
      x: partition.x,
      y: partition.height + 0.035,
      z: (partition.zMin + partition.zMax) / 2,
      width: partition.thickness + 0.1,
      height: 0.07,
      depth: partition.zMax - partition.zMin,
      material: materials.stainless,
    });
    addLabel({ id: "soda-sign", text: "DRINKS  ·  ICEE", position: [rearCenter.x, 3.35, 68.05], rotationY: Math.PI, width: 4.7, height: 0.58, accent: "#68a3d8" });
    addTrashCan("soda-trash-left", island.xMin - 0.75, 64.9);
    addTrashCan("soda-trash-right", island.xMax + 0.75, 64.9);
  };

  const addEquipmentFixture = (anchor) => {
    const [planX, , z] = anchor.position;
    const [width, depth] = anchor.footprint;
    const group = new THREE.Group();
    group.name = anchor.id;
    group.position.set(planToWorldX(planX), 0, z);
    group.rotation.y = planToWorldYaw(anchor.rotation);
    root.add(group);
    equipment.set(anchor.id, {
      anchor,
      group,
      planPosition: { x: planX, y: 0, z },
      worldPosition: { x: planToWorldX(planX), y: 0, z },
    });
    const localBox = (id, x, y, localZ, w, h, d, material) => addBox({ id, x, y, z: localZ, width: w, height: h, depth: d, material, parent: group, space: "local" });
    const onIsland = anchor.roomId === "soda-service";
    const baseY = onIsland ? 1.15 : 0;
    if (!onIsland) {
      localBox(`${anchor.id}-base`, 0, 0.46, 0, width, 0.92, depth, materials.stainless);
      addPlanCollider(`${anchor.id}-base`, planX, 0.46, z, width, 0.92, depth, anchor.rotation);
    }
    if (anchor.type === "popper") {
      localBox(`${anchor.id}-glass`, 0, 1.45, 0, width * 0.9, 1.02, depth * 0.86, materials.glass);
      localBox(`${anchor.id}-canopy`, 0, 2.02, 0, width, 0.16, depth, materials.red);
      localBox(`${anchor.id}-kettle`, 0, 1.55, 0, 0.52, 0.27, 0.52, materials.black);
    } else if (anchor.type === "soda-fountain") {
      localBox(`${anchor.id}-base`, 0, baseY + 0.22, 0, width, 0.42, depth, materials.black);
      localBox(`${anchor.id}-tower`, 0, baseY + 0.75, depth * 0.24, width * 0.94, 0.75, depth * 0.4, materials.black);
      localBox(`${anchor.id}-display`, 0, baseY + 0.89, -depth * 0.03, width * 0.82, 0.28, 0.04, materials.display);
      localBox(`${anchor.id}-drip`, 0, baseY + 0.3, -depth * 0.18, width * 0.8, 0.06, depth * 0.34, materials.stainless);
      for (let nozzle = -2; nozzle <= 2; nozzle += 1) localBox(`${anchor.id}-nozzle-${nozzle}`, nozzle * width * 0.16, baseY + 0.64, -depth * 0.15, 0.1, 0.2, 0.12, materials.red);
    } else if (anchor.type === "icee-fountain") {
      localBox(`${anchor.id}-base`, 0, baseY + 0.28, 0, width, 0.54, depth, materials.black);
      localBox(`${anchor.id}-header`, 0, baseY + 1.25, -depth * 0.05, width * 0.95, 0.25, depth * 0.38, materials.display);
      const leftMaterial = anchor.id.includes("left") ? materials.iceeRed : materials.iceeBlue;
      const rightMaterial = anchor.id.includes("left") ? materials.iceeBlue : materials.iceeRed;
      const bowlA = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.62, 16), leftMaterial);
      const bowlB = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.62, 16), rightMaterial);
      bowlA.position.set(-0.32, baseY + 0.82, 0);
      bowlB.position.set(0.32, baseY + 0.82, 0);
      group.add(bowlA, bowlB);
      sourceMeshCount += 2;
    } else if (anchor.type === "drinking-fountain") {
      const heightOffset = anchor.id.endsWith("-2") ? -0.12 : 0;
      localBox(`${anchor.id}-backplate`, 0, 1.18 + heightOffset, depth * 0.34, width * 0.92, 0.62, 0.08, materials.stainless);
      localBox(`${anchor.id}-basin`, 0, 1.0 + heightOffset, -depth * 0.08, width * 0.88, 0.16, depth * 0.76, materials.porcelain);
      localBox(`${anchor.id}-drain`, 0, 1.09 + heightOffset, -depth * 0.1, width * 0.38, 0.025, depth * 0.3, materials.black);
      localBox(`${anchor.id}-spout`, -width * 0.22, 1.2 + heightOffset, -depth * 0.2, 0.08, 0.14, 0.08, materials.stainless);
      localBox(`${anchor.id}-button`, width * 0.38, 1.08 + heightOffset, -depth * 0.22, 0.07, 0.07, 0.04, materials.black);
    } else if (anchor.type === "turbo-oven") {
      localBox(`${anchor.id}-oven`, 0, 1.35, 0, width * 0.9, 0.82, depth * 0.88, materials.black);
      localBox(`${anchor.id}-window`, 0, 1.4, -depth * 0.46, width * 0.62, 0.38, 0.03, materials.glass);
    } else if (anchor.type === "fryer") {
      localBox(`${anchor.id}-well`, 0, 1.01, 0, width * 0.76, 0.14, depth * 0.7, materials.black);
      localBox(`${anchor.id}-back`, 0, 1.35, depth * 0.38, width * 0.88, 0.74, 0.08, materials.stainless);
    } else if (anchor.type === "grill") {
      localBox(`${anchor.id}-griddle`, 0, 0.98, 0, width * 0.94, 0.12, depth * 0.9, materials.black);
      localBox(`${anchor.id}-backsplash`, 0, 1.25, depth * 0.43, width, 0.55, 0.07, materials.stainless);
    } else if (anchor.type === "bar-well") {
      localBox(`${anchor.id}-well`, 0, 1, 0, width * 0.78, 0.18, depth * 0.7, materials.black);
    }
  };

  const frontWalk = publicById("front-walk");
  const lobby = publicById("lobby");
  const approach = publicById("lobby-approach");
  const posterAlcove = publicById("ticket-poster-alcove");
  const emptyAlcove = publicById("ticket-empty-alcove");
  const hall = publicById("main-corridor");
  addFloor(frontWalk.id, frontWalk.bounds, materials.concrete, 0, root, 3);
  addFloor(lobby.id, { ...lobby.bounds, zMax: 24 }, materials.lobbyStone, 0, root, 3);
  addFloor(approach.id, approach.bounds, materials.corridorCarpet, 0, root, 2.4);
  addFloor(posterAlcove.id, posterAlcove.bounds, materials.corridorCarpet, 0, root, 2.4);
  addFloor(emptyAlcove.id, emptyAlcove.bounds, materials.corridorCarpet, 0, root, 2.4);
  addFloor(hall.id, hall.bounds, materials.corridorCarpet, 0, root, 2.4);
  addCeiling(lobby.id, LOBBY_PLAN.envelope);
  addCeiling(approach.id, approach.bounds);
  addCeiling(posterAlcove.id, posterAlcove.bounds);
  addCeiling(emptyAlcove.id, emptyAlcove.bounds);
  addCeiling(hall.id, hall.bounds);

  addWallX("lobby-front-service", LOBBY_PLAN.envelope.xMin, lobby.bounds.xMin, 0, { material: materials.wall });
  addWallXWithOpenings("lobby-front-public", lobby.bounds.xMin, LOBBY_PLAN.envelope.xMax, 0, LOBBY_PLAN.frontDoorCenters.map((center) => ({ center, width: 2.8 })), { material: materials.glass });
  for (const center of LOBBY_PLAN.frontDoorCenters) {
    addDoorTrim(`lobby-front-${center}`, "south", -0.03, center, { width: 2.8 });
    addBox({ id: `lobby-front-${center}-leaf-left`, x: center - 1.05, y: 1.15, z: -0.1, width: 1.15, height: 2.3, depth: 0.05, material: materials.glass, rotationY: 1.18 });
    addBox({ id: `lobby-front-${center}-leaf-right`, x: center + 1.05, y: 1.15, z: -0.1, width: 1.15, height: 2.3, depth: 0.05, material: materials.glass, rotationY: -1.18 });
  }
  addWallZ("lobby-west", LOBBY_PLAN.envelope.xMin, 0, 24);
  addWallZ("lobby-east", LOBBY_PLAN.envelope.xMax, 0, 24);
  addWallX("lobby-back-west", LOBBY_PLAN.envelope.xMin, approach.bounds.xMin, 24);
  addWallX("lobby-back-east", approach.bounds.xMax, LOBBY_PLAN.envelope.xMax, 24);
  addWallZ("approach-west-south", approach.bounds.xMin, 24, posterAlcove.bounds.zMin, { material: materials.darkWall });
  addWallZWithOpenings("approach-east-south", approach.bounds.xMax, 24, emptyAlcove.bounds.zMin, [{ center: 39 }], { material: materials.darkWall });
  addWallX("poster-alcove-south", posterAlcove.bounds.xMin, posterAlcove.bounds.xMax, posterAlcove.bounds.zMin, { material: materials.darkWall });
  addWallZ("poster-alcove-west", posterAlcove.bounds.xMin, posterAlcove.bounds.zMin, posterAlcove.bounds.zMax, { material: materials.darkWall });
  addWallX("empty-alcove-south", emptyAlcove.bounds.xMin, emptyAlcove.bounds.xMax, emptyAlcove.bounds.zMin, { material: materials.darkWall });
  addWallZ("empty-alcove-east", emptyAlcove.bounds.xMax, emptyAlcove.bounds.zMin, emptyAlcove.bounds.zMax, { material: materials.darkWall });

  addBox({ id: "front-canopy", x: 1.5, y: 3.55, z: -1.8, width: 28, height: 0.28, depth: 4.1, material: materials.black });
  addBox({ id: "front-red-band", x: 1.5, y: 3.04, z: -0.18, width: 30, height: 0.42, depth: 0.24, material: materials.red });
  addLabel({ id: "facade-title", text: "CONSOLIDATED THEATRES  ·  MILILANI", position: [1.5, 3.62, -4], rotationY: Math.PI, width: 11.5, height: 0.74 });
  addBox({ id: "front-west-planter", x: frontWalk.bounds.xMin, y: 0.45, z: -5, width: 0.35, height: 0.9, depth: 10, material: materials.concrete, collide: true });
  addBox({ id: "front-east-planter", x: frontWalk.bounds.xMax, y: 0.45, z: -5, width: 0.35, height: 0.9, depth: 10, material: materials.concrete, collide: true });
  addBox({ id: "front-south-planter", x: 1, y: 0.45, z: frontWalk.bounds.zMin, width: 55, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });
  addBox({ id: "front-east-stop", x: 26, y: 0.45, z: 0, width: 6, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });

  const overflow = roomById("office-overflow");
  const office = roomById("office");
  addSimpleRoomShell(overflow, { floorMaterial: materials.floorDark, skipSides: ["north"], ceiling: false });
  addSimpleRoomShell(office, { floorMaterial: materials.floorDark, ceiling: false });
  addLabel({ id: "overflow-label", text: "OFFICE / CANDY OVERFLOW", position: [overflow.bounds.xMax + 0.12, 2.9, overflow.doorCenter], rotationY: Math.PI / 2, width: 2.7, height: 0.4, small: true, accent: "#f0c36f" });
  addLabel({ id: "office-label", text: "MANAGER OFFICE", position: [office.doorCenter, 2.9, office.bounds.zMin - 0.12], rotationY: Math.PI, width: 2.4, height: 0.4, small: true, accent: "#f0c36f" });

  const kitchenStorage = roomById("kitchen-storage");
  addFloor(kitchenStorage.id, kitchenStorage.bounds, materials.floorDark);
  // The lobby envelope owns the west/back walls and ceiling. The office owns
  // most of the shared south wall, leaving only this short exposed return.
  addWallX("kitchen-storage-south-return", kitchenStorage.bounds.xMin, office.bounds.xMin, kitchenStorage.bounds.zMin);
  addFloor("concession-service-strip", { xMin: -29, xMax: -24.5, zMin: 7, zMax: 24 }, materials.floorDark);
  const partition = LOBBY_PLAN.kitchenPartition;
  for (let index = 0; index < partition.length - 1; index += 1) {
    const start = partition[index];
    const end = partition[index + 1];
    const isDoorGap = index === 5;
    const isKitchenStorageDoor = index === LOBBY_PLAN.kitchenStorageDoor.partitionSegment;
    if (isKitchenStorageDoor) {
      addPlanSegmentWithOpening(
        "kitchen-storage-diagonal-door",
        start,
        end,
        LOBBY_PLAN.kitchenStorageDoor,
        { material: materials.wall },
      );
    } else if (!isDoorGap) {
      addPlanSegment(`kitchen-partition-${index}`, start, end, { material: materials.wall });
    }
  }
  addBox({ id: "kitchen-service-door-header", x: LOBBY_PLAN.serviceDoor.x, y: DOOR_HEIGHT + (WALL_HEIGHT - DOOR_HEIGHT) / 2, z: LOBBY_PLAN.serviceDoor.z, width: WALL_THICKNESS, height: WALL_HEIGHT - DOOR_HEIGHT, depth: 1.5, material: materials.wall, collide: true });
  addDoorTrim("kitchen-service-door", "east", LOBBY_PLAN.serviceDoor.x, LOBBY_PLAN.serviceDoor.z, { width: 1.5 });
  addWallZ("kitchen-partition-top-join", -29, 23.5, 24);
  addLabel({ id: "kitchen-storage-label", text: "KITCHEN STORAGE", position: [-28.9, 3, 13], rotationY: Math.PI / 2, width: 2.5, height: 0.42, small: true, accent: "#f0c36f" });

  const concession = roomById("concession-boh");
  addCounterPolyline();
  const backBar = LOBBY_PLAN.backBar;
  addBox({ id: "back-bar-cabinet", x: (backBar.xMin + backBar.xMax) / 2, y: 0.52, z: (backBar.zMin + backBar.zMax) / 2, width: backBar.xMax - backBar.xMin, height: 1.04, depth: backBar.zMax - backBar.zMin, material: materials.wood, collide: true });
  addBox({ id: "back-bar-top", x: (backBar.xMin + backBar.xMax) / 2, y: 1.08, z: (backBar.zMin + backBar.zMax) / 2, width: backBar.xMax - backBar.xMin + 0.2, height: 0.1, depth: backBar.zMax - backBar.zMin + 0.16, material: materials.counterStone });
  const hotLine = LOBBY_PLAN.hotLine;
  addBox({ id: "kitchen-hot-line-base", x: (hotLine.xMin + hotLine.xMax) / 2, y: 0.45, z: (hotLine.zMin + hotLine.zMax) / 2, width: hotLine.xMax - hotLine.xMin, height: 0.9, depth: hotLine.zMax - hotLine.zMin, material: materials.stainless, collide: true });
  addBox({ id: "kitchen-hot-line-top", x: (hotLine.xMin + hotLine.xMax) / 2, y: 0.94, z: (hotLine.zMin + hotLine.zMax) / 2, width: hotLine.xMax - hotLine.xMin + 0.12, height: 0.08, depth: hotLine.zMax - hotLine.zMin + 0.08, material: materials.black });
  addBoxOfficeAndKiosks();

  const stairReserve = LOBBY_PLAN.futureStairs;
  addWallZ("future-stair-construction-wall", stairReserve.xMin, stairReserve.zMin, stairReserve.zMax, { material: materials.darkWall });
  addWallXWithOpenings("future-stair-south-cap", stairReserve.xMin, stairReserve.xMax, stairReserve.zMin, [{ center: 19, width: 1.7 }], { material: materials.darkWall });
  addClosedDoor("future-stair-closed-door", "south", stairReserve.zMin, 19, { width: 1.7 });
  addLabel({ id: "future-stair-sign", text: "SECOND FLOOR · FUTURE PHASE", position: [stairReserve.xMin - 0.1, 2.7, 16], rotationY: -Math.PI / 2, width: 3.5, height: 0.42, small: true, accent: "#8c6bd3" });

  const mural = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 2.6),
    new THREE.MeshBasicMaterial({ map: createBotanicalMuralTexture(), toneMapped: false }),
  );
  mural.name = "original-naupaka-inspired-lobby-mural";
  mural.position.set(planToWorldX(18.4), 2.8, 23.86);
  mural.rotation.y = planToWorldYaw(Math.PI);
  root.add(mural);
  sourceMeshCount += 1;

  const electrical = roomById("electrical-room");
  // The approach-east wall already forms the electrical room's west wall and
  // contains this doorway. Omitting the duplicate shell side prevents the
  // white/charcoal z-fighting that flashed while walking past it.
  addSimpleRoomShell(electrical, { floorMaterial: materials.floorDark, skipSides: ["west"] });
  addClosedDoor("electrical-room-closed", "west", electrical.bounds.xMin, electrical.doorCenter);
  addLabel({ id: "electrical-sign", text: "ELECTRICAL", position: [electrical.bounds.xMin - 0.13, 2.8, electrical.doorCenter], rotationY: -Math.PI / 2, width: 1.8, height: 0.38, small: true, accent: "#f0c36f" });

  const futureUpstairs = roomById("future-upstairs-stair");
  addSimpleRoomShell(futureUpstairs, { floorMaterial: materials.floorDark, material: materials.darkWall, skipSides: ["south", "east"] });
  addWallXWithOpenings(
    `${futureUpstairs.id}-south`,
    futureUpstairs.bounds.xMin,
    futureUpstairs.bounds.xMax,
    futureUpstairs.bounds.zMin,
    [{ center: futureUpstairs.doorCenter, width: 1.8 }],
    { material: materials.darkWall },
  );
  addClosedDoor(`${futureUpstairs.id}-closed`, "south", futureUpstairs.bounds.zMin, futureUpstairs.doorCenter, { width: 1.8 });
  addLabel({ id: `${futureUpstairs.id}-sign`, text: "UPSTAIRS · FUTURE", position: [futureUpstairs.doorCenter, 2.85, futureUpstairs.bounds.zMin - 0.13], rotationY: Math.PI, width: 2.4, height: 0.4, small: true, accent: "#8c6bd3" });

  addSodaService();
  const futureTask = roomById("future-task-room");
  addSimpleRoomShell(futureTask, { floorMaterial: materials.floorDark, material: materials.darkWall, skipSides: ["south"] });
  addLabel({ id: "future-task-label", text: "FUTURE TASK ROOM", position: [futureTask.doorCenter, 2.9, futureTask.bounds.zMin - 0.12], rotationY: Math.PI, width: 2.7, height: 0.42, small: true, accent: "#f0c36f" });

  const trash = roomById("trash-room");
  addSimpleRoomShell(trash, { floorMaterial: materials.lobbyTile, skipSides: ["north"] });
  addLabel({ id: "trash-label", text: "TRASH", position: [trash.doorCenter, 2.9, trash.bounds.zMin - 0.13], rotationY: Math.PI, width: 1.7, height: 0.4, small: true, accent: "#f0c36f" });
  addRestroom(roomById("boys-restroom"));
  addRestroom(roomById("girls-restroom"));

  const candy = roomById("candy-storage");
  addSimpleRoomShell(candy, { floorMaterial: materials.floorDark, material: materials.darkWall });
  addLabel({ id: "candy-label", text: "CANDY STORAGE", position: [candy.doorCenter, 2.9, candy.bounds.zMin - 0.13], rotationY: Math.PI, width: 2.6, height: 0.42, small: true, accent: "#f0c36f" });

  const approachCenterX = (approach.bounds.xMin + approach.bounds.xMax) / 2;
  addLabel({ id: "ticket-sign", text: "TICKETS  ·  AUDITORIUMS 1–14", position: [approachCenterX, 3.15, 54], rotationY: Math.PI, width: 5.2, height: 0.62 });
  for (const x of [2.2, 9.4]) {
    addBox({ id: `ticket-podium-${x}`, x, y: 0.55, z: 56.4, width: 0.65, height: 1.1, depth: 0.65, material: materials.black, collide: true });
    addBox({ id: `ticket-scanner-${x}`, x, y: 1.16, z: 56.4, width: 0.4, height: 0.14, depth: 0.43, material: materials.red });
  }
  addLabel({ id: "hall-wayfinding", text: "THEATERS 1–4  ←     5–14  →", position: [approachCenterX, 3.25, 61.85], rotationY: Math.PI, width: 5.4, height: 0.54, accent: "#f0c36f" });

  for (const auditorium of AUDITORIUMS) addAuditorium(auditorium);
  for (const anchor of EQUIPMENT_ANCHORS) addEquipmentFixture(anchor);

  const addFillSegments = (side, z, occupied) => {
    const sorted = [...occupied].sort((a, b) => a[0] - b[0]);
    let cursor = hall.bounds.xMin;
    for (const [start, end] of sorted) {
      if (start > cursor + EPSILON) addWallX(`hall-${side}-fill-${cursor.toFixed(1)}`, cursor, start, z, { material: materials.darkWall });
      cursor = Math.max(cursor, end);
    }
    if (cursor < hall.bounds.xMax) addWallX(`hall-${side}-fill-last`, cursor, hall.bounds.xMax, z, { material: materials.darkWall });
  };
  const theater6 = AUDITORIUMS.find((auditorium) => auditorium.number === 6);
  const southOccupied = [
    ...AUDITORIUMS.filter((room) => room.screenSide === "south").map((room) => [room.bounds.xMin, room.bounds.xMax]),
    [posterAlcove.bounds.xMin, posterAlcove.bounds.xMax],
    [approach.bounds.xMin, approach.bounds.xMax],
    [emptyAlcove.bounds.xMin, emptyAlcove.bounds.xMax],
  ];
  const northOccupied = [
    [trash.bounds.xMin, trash.bounds.xMax],
    [publicById("boys-fountain-alcove").bounds.xMin, roomById("boys-restroom").footprintRects[1].xMax],
    [COURTYARD_PLAN.bounds.xMin, COURTYARD_PLAN.bounds.xMax],
    [futureUpstairs.bounds.xMin, futureUpstairs.bounds.xMax],
    [theater6.bounds.xMin, theater6.bounds.xMax],
    [roomById("girls-restroom").footprintRects[1].xMin, roomById("girls-restroom").footprintRects.at(-1).xMax],
    [79.5, 97],
    [110, 127.5],
    [candy.bounds.xMin, candy.bounds.xMax],
  ];
  addFillSegments("south", hall.bounds.zMin, southOccupied);
  addFillSegments("north", hall.bounds.zMax, northOccupied);

  for (const exit of HALL_END_EXITS) {
    addWallZWithOpenings(`${exit.id}-wall`, exit.x, hall.bounds.zMin, hall.bounds.zMax, [{ center: exit.z, width: 2.35 }], { material: materials.darkWall });
    addClosedDoor(exit.id, exit.side, exit.x, exit.z, { width: 2.35 });
  }
  for (let x = -34; x <= 138; x += 12) addLightPanel(`hall-light-${x}`, x, 60.1, 2.65, 0.3);
  for (const [x, z] of [[-18, 5], [-7, 5], [4, 5], [15, 5], [-15, 14], [-4, 14], [8, 14], [5.8, 29], [5.8, 39], [5.8, 49], [5.8, 65], [13.7, 70], [16.8, 70]]) addLightPanel(`lobby-light-${x}-${z}`, x, z, 2.2, 0.44);

  const warmLobbyLightA = new THREE.PointLight(0xffd7ae, 34, 28, 2);
  warmLobbyLightA.position.set(planToWorldX(-7), 3.5, 10);
  root.add(warmLobbyLightA);
  const warmLobbyLightB = new THREE.PointLight(0xffd7ae, 34, 28, 2);
  warmLobbyLightB.position.set(planToWorldX(10), 3.5, 10);
  root.add(warmLobbyLightB);
  const approachLight = new THREE.PointLight(0xffdfc7, 48, 34, 2);
  approachLight.position.set(planToWorldX(1.5), 3.7, 40);
  root.add(approachLight);
  const hallLights = [-30, 0, 30, 60, 90, 120].map((planX) => {
    const light = new THREE.PointLight(0xffe7cf, 39, 28, 2);
    light.position.set(planToWorldX(planX), 3.7, 60.1);
    root.add(light);
    return light;
  });

  const lowerStorageCandidates = SERVICE_ROOMS.filter((room) => room.kind === "storage-lower");
  const storage3 = roomById("under-storage-3");
  const storage6 = roomById("under-storage-6");
  const lowCeilingRegions = [
    { bounds: storage3.bounds, underside: storage3.ceilingHeight - 0.1 },
    { bounds: storage3.accessHall, underside: storage3.ceilingHeight - 0.1 },
    { bounds: storage6.bounds, underside: storage6.ceilingHeight - 0.1 },
    { bounds: theater6.entry.vestibuleBounds, underside: storage6.ceilingHeight - 0.1 },
    { bounds: theater6.entry.transverseBounds, underside: storage6.ceilingHeight - 0.1 },
    { bounds: theater6.entry.longRouteBounds, underside: storage6.ceilingHeight - 0.1 },
  ];
  const groundHeight = (worldX, z, feetY = 0) => {
    const planX = worldToPlanX(worldX);
    const candidates = [];
    let insideTopEntryBowl = false;
    let hasAuditoriumSurface = false;
    for (const layout of auditoriumLayouts.values()) {
      if (pointInRect(planX, z, layout.bounds)) insideTopEntryBowl ||= layout.access === "top";
      const auditoriumCandidates = sampleAuditoriumGround(layout, planX, z);
      if (auditoriumCandidates.length) hasAuditoriumSurface = true;
      candidates.push(...auditoriumCandidates);
    }
    let hasLowerStorageSurface = false;
    for (const storage of lowerStorageCandidates) {
      if (pointInRect(planX, z, storage.bounds) || (storage.accessHall && pointInRect(planX, z, storage.accessHall))) {
        hasLowerStorageSurface = true;
        candidates.push({ id: `${storage.id}-lower-floor`, kind: "storage-floor", level: "lower-storage", height: 0, priority: 100, walkable: true });
      }
    }
    if (!insideTopEntryBowl && !hasAuditoriumSurface && !hasLowerStorageSurface) {
      candidates.push({ id: "main-floor", kind: "main-floor", level: "main", height: 0, priority: 1, walkable: true });
    }
    return selectGroundCandidate(candidates, feetY, { maxStepUp: 0.34 })?.height ?? 0;
  };

  const ceilingHeight = (worldX, z, feetY = 0) => {
    const planX = worldToPlanX(worldX);
    const containing = lowCeilingRegions
      .filter((region) => pointInRect(planX, z, region.bounds) && region.underside > feetY + 0.05)
      .map((region) => region.underside);
    return containing.length ? Math.min(...containing) : null;
  };

  // Kept as a compatibility hook for the render loop and debugging API.
  // Geometry is never unloaded or hidden by player proximity in this build.
  const updateVisibility = () => {
    for (const { group } of auditoriumGroups.values()) group.visible = true;
  };

  batchBoxMeshes(root);
  let runtimeMeshCount = 0;
  let instancedMeshCount = 0;
  root.traverse((object) => {
    if (object.isMesh) runtimeMeshCount += 1;
    if (object.isInstancedMesh) instancedMeshCount += 1;
  });

  const worldBounds = planToWorldBounds(MAP_BOUNDS);
  updateVisibility(planToWorldX(1.5), -6.8);

  return {
    root,
    colliders,
    equipment,
    auditoriumGroups,
    auditoriumLayouts,
    worldBounds,
    groundHeight,
    ceilingHeight,
    updateVisibility,
    dispose() {
      for (const material of disposableFloorMaterials) {
        material.map?.dispose();
        material.bumpMap?.dispose();
        material.dispose();
      }
    },
    stats: Object.freeze({
      auditoriumCount: AUDITORIUMS.length,
      seatCount,
      equipmentAnchors: equipment.size,
      meshCount: runtimeMeshCount,
      instancedMeshCount,
      sourceMeshCount,
      colliderCount: colliders.length,
      lightCount: hallLights.length + 3,
      layoutVersion: "mililani-sketch-v8",
    }),
  };
}
