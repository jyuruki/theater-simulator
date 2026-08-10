import * as THREE from "three";
import {
  AUDITORIUMS,
  EQUIPMENT_ANCHORS,
  MAP_BOUNDS,
  POS_STATIONS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
} from "./layout-data.js";
import {
  planToWorldBounds,
  planToWorldDirection,
  planToWorldX,
  planToWorldYaw,
  worldToPlanX,
} from "./coordinates.js";
import { createBotanicalMuralTexture, createSignTexture } from "./materials.js";

const WALL_HEIGHT = 4.6;
const WALL_THICKNESS = 0.18;
const DOOR_WIDTH = 2.05;
const DOOR_HEIGHT = 2.48;

const centerOf = (bounds) => ({
  x: (bounds.xMin + bounds.xMax) / 2,
  z: (bounds.zMin + bounds.zMax) / 2,
});

const sizeOf = (bounds) => ({
  width: bounds.xMax - bounds.xMin,
  depth: bounds.zMax - bounds.zMin,
});

const roomById = (id) => SERVICE_ROOMS.find((room) => room.id === id);
const publicById = (id) => PUBLIC_SPACES.find((room) => room.id === id);

export function createTheaterWorld({ scene, materials }) {
  const root = new THREE.Group();
  root.name = "Mililani 14 layout prototype v2";
  scene.add(root);

  const colliders = [];
  const equipment = new Map();
  const auditoriumGroups = new Map();
  const seatLayouts = new Map();
  const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const unitPlaneGeometry = new THREE.PlaneGeometry(1, 1);
  const unitCylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const seatGeometries = {
    cushion: new THREE.BoxGeometry(0.54, 0.14, 0.5),
    back: new THREE.BoxGeometry(0.56, 0.72, 0.13),
    base: new THREE.BoxGeometry(0.09, 0.44, 0.09),
  };
  let meshCount = 0;
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

  const addCollider = (id, planX, y, z, width, height, depth) => {
    addColliderWorld(id, planToWorldX(planX), y, z, width, height, depth);
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
    space = "plan",
  }) => {
    const mesh = new THREE.Mesh(unitBoxGeometry, material);
    mesh.name = id;
    const resolvedX = space === "plan" ? planToWorldX(x) : x;
    mesh.position.set(resolvedX, y, z);
    mesh.scale.set(width, height, depth);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    meshCount += 1;
    if (collide) {
      if (space === "plan") addCollider(id, x, y, z, width, height, depth);
      else addColliderWorld(id, parent.position.x + x, y, parent.position.z + z, width, height, depth);
    }
    return mesh;
  };

  const addCylinder = ({ id, x, y, z, radius, height, material, parent = root, space = "plan" }) => {
    const mesh = new THREE.Mesh(unitCylinderGeometry, material);
    mesh.name = id;
    mesh.position.set(space === "plan" ? planToWorldX(x) : x, y, z);
    mesh.scale.set(radius * 2, height, radius * 2);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshCount += 1;
    return mesh;
  };

  const batchBoxMeshes = (parent) => {
    for (const child of [...parent.children]) {
      if (child.children?.length && !child.isMesh) batchBoxMeshes(child);
    }

    const batches = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || child.isInstancedMesh || child.geometry !== unitBoxGeometry) continue;
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

  const addFloor = (id, bounds, material, elevation = 0) => {
    const { x, z } = centerOf(bounds);
    const { width, depth } = sizeOf(bounds);
    return addBox({ id: `${id}-floor`, x, y: elevation - 0.06, z, width, height: 0.12, depth, material });
  };

  const addCeiling = (id, bounds, height = WALL_HEIGHT) => {
    const { x, z } = centerOf(bounds);
    const { width, depth } = sizeOf(bounds);
    return addBox({
      id: `${id}-ceiling`, x, y: height, z, width, height: 0.1, depth,
      material: materials.ceiling, receiveShadow: false,
    });
  };

  const addWallX = (id, xMin, xMax, z, material = materials.wall, height = WALL_HEIGHT) => {
    if (xMax - xMin <= 0.03) return null;
    return addBox({
      id, x: (xMin + xMax) / 2, y: height / 2, z,
      width: xMax - xMin, height, depth: WALL_THICKNESS, material, collide: true,
    });
  };

  const addWallZ = (id, x, zMin, zMax, material = materials.wall, height = WALL_HEIGHT) => {
    if (zMax - zMin <= 0.03) return null;
    return addBox({
      id, x, y: height / 2, z: (zMin + zMax) / 2,
      width: WALL_THICKNESS, height, depth: zMax - zMin, material, collide: true,
    });
  };

  const addWallXWithOpenings = (id, xMin, xMax, z, openings = [], material = materials.wall, height = WALL_HEIGHT) => {
    const normalized = openings
      .map((opening) => ({
        center: opening.center,
        width: opening.width ?? DOOR_WIDTH,
        height: opening.height ?? DOOR_HEIGHT,
      }))
      .sort((a, b) => a.center - b.center);
    let cursor = xMin;
    for (const [index, opening] of normalized.entries()) {
      const left = Math.max(xMin, opening.center - opening.width / 2);
      const right = Math.min(xMax, opening.center + opening.width / 2);
      addWallX(`${id}-segment-${index}`, cursor, left, z, material, height);
      if (right > left && height > opening.height) {
        addBox({
          id: `${id}-header-${index}`, x: (left + right) / 2,
          y: opening.height + (height - opening.height) / 2, z,
          width: right - left, height: height - opening.height, depth: WALL_THICKNESS,
          material, collide: true,
        });
      }
      cursor = Math.max(cursor, right);
    }
    addWallX(`${id}-segment-last`, cursor, xMax, z, material, height);
  };

  const addWallZWithOpenings = (id, x, zMin, zMax, openings = [], material = materials.wall, height = WALL_HEIGHT) => {
    const normalized = openings
      .map((opening) => ({
        center: opening.center,
        width: opening.width ?? DOOR_WIDTH,
        height: opening.height ?? DOOR_HEIGHT,
      }))
      .sort((a, b) => a.center - b.center);
    let cursor = zMin;
    for (const [index, opening] of normalized.entries()) {
      const near = Math.max(zMin, opening.center - opening.width / 2);
      const far = Math.min(zMax, opening.center + opening.width / 2);
      addWallZ(`${id}-segment-${index}`, x, cursor, near, material, height);
      if (far > near && height > opening.height) {
        addBox({
          id: `${id}-header-${index}`, x,
          y: opening.height + (height - opening.height) / 2,
          z: (near + far) / 2, width: WALL_THICKNESS,
          height: height - opening.height, depth: far - near,
          material, collide: true,
        });
      }
      cursor = Math.max(cursor, far);
    }
    addWallZ(`${id}-segment-last`, x, cursor, zMax, material, height);
  };

  const addDoorTrim = (id, side, coordinate, center, accent = materials.stainless, doorHeight = DOOR_HEIGHT) => {
    const reveal = materials.red;
    if (side === "north" || side === "south") {
      addBox({ id: `${id}-jamb-left`, x: center - DOOR_WIDTH / 2, y: doorHeight / 2, z: coordinate, width: 0.08, height: doorHeight, depth: 0.22, material: accent });
      addBox({ id: `${id}-jamb-right`, x: center + DOOR_WIDTH / 2, y: doorHeight / 2, z: coordinate, width: 0.08, height: doorHeight, depth: 0.22, material: accent });
      addBox({ id: `${id}-jamb-top`, x: center, y: doorHeight, z: coordinate, width: DOOR_WIDTH + 0.08, height: 0.08, depth: 0.22, material: accent });
      addBox({ id: `${id}-threshold`, x: center, y: 0.015, z: coordinate, width: DOOR_WIDTH, height: 0.03, depth: 0.24, material: reveal });
    } else {
      addBox({ id: `${id}-jamb-near`, x: coordinate, y: doorHeight / 2, z: center - DOOR_WIDTH / 2, width: 0.22, height: doorHeight, depth: 0.08, material: accent });
      addBox({ id: `${id}-jamb-far`, x: coordinate, y: doorHeight / 2, z: center + DOOR_WIDTH / 2, width: 0.22, height: doorHeight, depth: 0.08, material: accent });
      addBox({ id: `${id}-jamb-top`, x: coordinate, y: doorHeight, z: center, width: 0.22, height: 0.08, depth: DOOR_WIDTH + 0.08, material: accent });
      addBox({ id: `${id}-threshold`, x: coordinate, y: 0.015, z: center, width: 0.24, height: 0.03, depth: DOOR_WIDTH, material: reveal });
    }
  };

  const addClosedDoor = (id, side, coordinate, center) => {
    if (side === "north" || side === "south") {
      addBox({ id, x: center, y: 1.18, z: coordinate, width: DOOR_WIDTH - 0.1, height: 2.34, depth: 0.13, material: materials.black, collide: true });
      addBox({ id: `${id}-push-bar`, x: center, y: 1.08, z: coordinate + (side === "south" ? 0.075 : -0.075), width: 1.28, height: 0.07, depth: 0.05, material: materials.stainless });
    } else {
      addBox({ id, x: coordinate, y: 1.18, z: center, width: 0.13, height: 2.34, depth: DOOR_WIDTH - 0.1, material: materials.black, collide: true });
      addBox({ id: `${id}-push-bar`, x: coordinate + (side === "west" ? 0.075 : -0.075), y: 1.08, z: center, width: 0.05, height: 0.07, depth: 1.28, material: materials.stainless });
    }
  };

  const addLabel = ({ id, text, position, rotationY = 0, width = 2.7, height = 0.62, accent = "#ef4657", small = false, parent = root }) => {
    const texture = createSignTexture(text, { accent, small });
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const sign = new THREE.Mesh(unitPlaneGeometry, signMaterial);
    sign.name = id;
    sign.position.set(planToWorldX(position[0]), position[1], position[2]);
    sign.rotation.y = planToWorldYaw(rotationY);
    sign.scale.set(width, height, 1);
    parent.add(sign);
    meshCount += 1;
    return sign;
  };

  const addLightPanel = (id, x, z, width = 1.5, depth = 0.42, height = 4.45, parent = root) => addBox({
    id, x, y: height, z, width, height: 0.035, depth,
    material: materials.light, parent, receiveShadow: false,
  });

  const addSimpleRoomShell = (room, { floorMaterial, ceiling = true, height = WALL_HEIGHT, material = materials.wall } = {}) => {
    const { bounds, entrySide = "south", doorCenter } = room;
    const center = centerOf(bounds);
    if (floorMaterial) addFloor(room.id, bounds, floorMaterial);
    if (ceiling) addCeiling(room.id, bounds, height);
    const openings = { north: [], south: [], east: [], west: [] };
    const primaryCenter = doorCenter ?? (entrySide === "north" || entrySide === "south" ? center.x : center.z);
    openings[entrySide].push({ center: primaryCenter });
    for (const extraDoor of room.extraDoors ?? []) openings[extraDoor.side].push({ center: extraDoor.center, width: extraDoor.width });

    addWallXWithOpenings(`${room.id}-south`, bounds.xMin, bounds.xMax, bounds.zMin, openings.south, material, height);
    addWallXWithOpenings(`${room.id}-north`, bounds.xMin, bounds.xMax, bounds.zMax, openings.north, material, height);
    addWallZWithOpenings(`${room.id}-west`, bounds.xMin, bounds.zMin, bounds.zMax, openings.west, material, height);
    addWallZWithOpenings(`${room.id}-east`, bounds.xMax, bounds.zMin, bounds.zMax, openings.east, material, height);

    for (const [side, sideOpenings] of Object.entries(openings)) {
      const coordinate = side === "south" ? bounds.zMin
        : side === "north" ? bounds.zMax
          : side === "west" ? bounds.xMin
            : bounds.xMax;
      for (const [index, opening] of sideOpenings.entries()) {
        addDoorTrim(`${room.id}-${side}-${index}`, side, coordinate, opening.center);
      }
    }
  };

  const addTrashCan = (id, x, z, rotationY = 0, parent = root) => {
    const group = new THREE.Group();
    group.name = id;
    group.position.set(planToWorldX(x), 0, z);
    group.rotation.y = planToWorldYaw(rotationY);
    parent.add(group);
    addCylinder({ id: `${id}-body`, x: 0, y: 0.48, z: 0, radius: 0.34, height: 0.92, material: materials.black, parent: group, space: "local" });
    addCylinder({ id: `${id}-rim`, x: 0, y: 0.96, z: 0, radius: 0.37, height: 0.08, material: materials.stainless, parent: group, space: "local" });
    addBox({ id: `${id}-opening`, x: 0, y: 1.01, z: -0.04, width: 0.44, height: 0.04, depth: 0.28, material: materials.floorDark, parent: group, space: "local" });
    return group;
  };

  const getSeatLayout = (auditorium) => {
    const { bounds, entry } = auditorium;
    let xMin = bounds.xMin + 0.55;
    let xMax = bounds.xMax - 0.55;
    if (entry.routeSide === "east") xMax -= 2.75;
    if (entry.routeSide === "west") xMin += 2.75;

    let firstRowZ;
    let rowPitch;
    let direction;
    if (auditorium.screenSide === "north") {
      firstRowZ = bounds.zMax - 3.9;
      direction = -1;
      rowPitch = Math.min(1.75, (bounds.zMax - bounds.zMin - 5.1) / Math.max(1, auditorium.rows.length - 1));
    } else {
      firstRowZ = bounds.zMin + 3.25;
      direction = 1;
      const backLimit = bounds.zMax - 4.15;
      rowPitch = Math.min(1.58, (backLimit - firstRowZ) / Math.max(1, auditorium.rows.length - 1));
    }

    const rise = auditorium.preset === "large150" ? 0.26 : auditorium.preset === "medium58" ? 0.24 : 0.22;
    const centerX = (xMin + xMax) / 2;
    const backRowZ = firstRowZ + direction * (auditorium.rows.length - 1) * rowPitch;
    return { xMin, xMax, centerX, firstRowZ, backRowZ, rowPitch, direction, rise };
  };

  const addScreen = (auditorium, layout, parent) => {
    const roomWidth = auditorium.bounds.xMax - auditorium.bounds.xMin;
    const width = Math.min(roomWidth - 1.2, auditorium.preset === "large150" ? 15.8 : 10.3);
    const height = Math.min(width / 2.05, auditorium.preset === "large150" ? 5.8 : 4.8);
    const x = (auditorium.bounds.xMin + auditorium.bounds.xMax) / 2;
    const z = auditorium.screenSide === "north" ? auditorium.bounds.zMax - 0.12 : auditorium.bounds.zMin + 0.12;
    const screen = new THREE.Mesh(unitPlaneGeometry, materials.screen);
    screen.name = `${auditorium.id}-screen`;
    screen.position.set(planToWorldX(x), Math.max(2.2, height / 2 + 0.45), z);
    screen.rotation.y = planToWorldYaw(auditorium.screenSide === "north" ? Math.PI : 0);
    screen.scale.set(width, height, 1);
    parent.add(screen);
    meshCount += 1;
    addBox({ id: `${auditorium.id}-screen-top`, x, y: screen.position.y + height / 2 + 0.12, z, width: width + 0.25, height: 0.16, depth: 0.18, material: materials.black, parent });
    addBox({ id: `${auditorium.id}-screen-bottom`, x, y: screen.position.y - height / 2 - 0.12, z, width: width + 0.25, height: 0.16, depth: 0.18, material: materials.black, parent });
  };

  const addAuditoriumSeats = (auditorium, layout, parent) => {
    const width = layout.xMax - layout.xMin;
    const cushionMesh = new THREE.InstancedMesh(seatGeometries.cushion, materials.seat, auditorium.seats);
    const backMesh = new THREE.InstancedMesh(seatGeometries.back, materials.seat, auditorium.seats);
    const baseMesh = new THREE.InstancedMesh(seatGeometries.base, materials.seatMetal, auditorium.seats);
    cushionMesh.name = `${auditorium.id}-seat-cushions`;
    backMesh.name = `${auditorium.id}-seat-backs`;
    baseMesh.name = `${auditorium.id}-seat-bases`;
    const matrix = new THREE.Matrix4();
    let instance = 0;

    auditorium.rows.forEach((rowCount, rowIndex) => {
      const tierY = rowIndex * layout.rise;
      const rowZ = layout.firstRowZ + layout.direction * rowIndex * layout.rowPitch;
      const aisle = rowCount > 6 ? 1.02 : 0;
      const seatSpacing = Math.min(0.69, (width - 0.72 - aisle) / rowCount);
      const rowWidth = seatSpacing * (rowCount - 1) + aisle;
      const tierWidth = (width - 1.18) / 2;

      addBox({ id: `${auditorium.id}-tier-${rowIndex}-west`, x: layout.centerX - 0.59 - tierWidth / 2, y: Math.max(0.015, tierY / 2), z: rowZ, width: tierWidth, height: Math.max(0.03, tierY), depth: Math.min(layout.rowPitch * 0.93, 1.5), material: materials.floorDark, parent });
      addBox({ id: `${auditorium.id}-tier-${rowIndex}-east`, x: layout.centerX + 0.59 + tierWidth / 2, y: Math.max(0.015, tierY / 2), z: rowZ, width: tierWidth, height: Math.max(0.03, tierY), depth: Math.min(layout.rowPitch * 0.93, 1.5), material: materials.floorDark, parent });
      addBox({ id: `${auditorium.id}-aisle-step-${rowIndex}`, x: layout.centerX, y: Math.max(0.015, tierY / 2), z: rowZ, width: 1.02, height: Math.max(0.03, tierY), depth: Math.min(layout.rowPitch * 0.93, 1.5), material: materials.carpet, parent });

      for (let column = 0; column < rowCount; column += 1) {
        const onRight = aisle > 0 && column >= rowCount / 2;
        const planX = layout.centerX - rowWidth / 2 + column * seatSpacing + (onRight ? aisle : 0);
        const worldX = planToWorldX(planX);
        const backOffset = auditorium.screenSide === "north" ? -0.22 : 0.22;
        matrix.makeTranslation(worldX, tierY + 0.53, rowZ);
        cushionMesh.setMatrixAt(instance, matrix);
        matrix.makeTranslation(worldX, tierY + 0.92, rowZ + backOffset);
        backMesh.setMatrixAt(instance, matrix);
        matrix.makeTranslation(worldX, tierY + 0.27, rowZ + backOffset * 0.3);
        baseMesh.setMatrixAt(instance, matrix);
        instance += 1;
      }

      const blockerWidth = (width - 1.55) / 2;
      addCollider(`${auditorium.id}-seats-${rowIndex}-west`, layout.xMin + blockerWidth / 2, 0.8, rowZ, blockerWidth, 1.6 + tierY, 0.76);
      addCollider(`${auditorium.id}-seats-${rowIndex}-east`, layout.xMax - blockerWidth / 2, 0.8, rowZ, blockerWidth, 1.6 + tierY, 0.76);
    });

    for (const mesh of [cushionMesh, backMesh, baseMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
    meshCount += 3;
    seatCount += auditorium.seats;
  };

  const addAcousticPanels = (auditorium, parent) => {
    const { bounds } = auditorium;
    const z = (bounds.zMin + bounds.zMax) / 2;
    const depth = bounds.zMax - bounds.zMin;
    for (const side of [bounds.xMin + 0.1, bounds.xMax - 0.1]) {
      for (const offset of [-0.25, 0.25]) {
        addBox({ id: `${auditorium.id}-acoustic-${side}-${offset}`, x: side, y: 2.3, z: z + offset * depth, width: 0.12, height: 2.8, depth: Math.max(2.2, depth * 0.34), material: materials.acoustic, parent });
      }
    }
  };

  const addSmallTheaterCubby = (auditorium) => {
    const { bounds, entry } = auditorium;
    const halfWidth = 1.6;
    const cubbySouth = bounds.zMax - 2.2;
    const westX = entry.center - halfWidth;
    const eastX = entry.center + halfWidth;
    addWallXWithOpenings(`${auditorium.id}-north`, bounds.xMin, bounds.xMax, bounds.zMax, [{ center: entry.center }], materials.darkWall);
    addWallX(`${auditorium.id}-cubby-back`, westX, eastX, cubbySouth, materials.darkWall);
    const doorZ = cubbySouth + 1.05;
    if (entry.turnSide === "west") {
      addWallZWithOpenings(`${auditorium.id}-cubby-west`, westX, cubbySouth, bounds.zMax, [{ center: doorZ }], materials.darkWall);
      addWallZ(`${auditorium.id}-cubby-east`, eastX, cubbySouth, bounds.zMax, materials.darkWall);
      addDoorTrim(`${auditorium.id}-inner`, "west", westX, doorZ);
      addTrashCan(`${auditorium.id}-trash`, eastX - 0.52, cubbySouth + 0.55);
    } else {
      addWallZ(`${auditorium.id}-cubby-west`, westX, cubbySouth, bounds.zMax, materials.darkWall);
      addWallZWithOpenings(`${auditorium.id}-cubby-east`, eastX, cubbySouth, bounds.zMax, [{ center: doorZ }], materials.darkWall);
      addDoorTrim(`${auditorium.id}-inner`, "east", eastX, doorZ);
      addTrashCan(`${auditorium.id}-trash`, westX + 0.52, cubbySouth + 0.55);
    }
  };

  const addT3Route = (auditorium) => {
    const route = { xMin: -18.4, xMax: -15.5, zMin: 62.2, zMax: 78.5 };
    addFloor(`${auditorium.id}-entry-route`, route, materials.corridorCarpet);
    addCeiling(`${auditorium.id}-entry-route`, route);
    addWallXWithOpenings(`${auditorium.id}-outer-entry`, route.xMin, route.xMax, route.zMin, [{ center: auditorium.entry.center }], materials.darkWall);
    addDoorTrim(`${auditorium.id}-outer`, "south", route.zMin, auditorium.entry.center);
    addWallZWithOpenings(`${auditorium.id}-route-west`, route.xMin, route.zMin, route.zMax, [
      { center: 67.2 }, { center: 77.15, width: 2.35, height: 4.05 },
    ], materials.darkWall);
    addWallZ(`${auditorium.id}-route-east`, route.xMax, route.zMin, route.zMax, materials.darkWall);
    addWallX(`${auditorium.id}-route-north-cap`, route.xMin, route.xMax, route.zMax, materials.darkWall);
    addDoorTrim(`${auditorium.id}-storage-door`, "west", route.xMin, 67.2);
    addDoorTrim(`${auditorium.id}-route-inner`, "west", route.xMin, 77.15, materials.stainless, 4.05);
    addLabel({ id: `${auditorium.id}-storage-plaque`, text: "UNDER-TIER STORAGE", position: [route.xMin + 0.1, 2.85, 67.2], rotationY: Math.PI / 2, width: 2.1, height: 0.36, small: true, accent: "#f0c36f" });
    addLabel({ id: `${auditorium.id}-turn-plaque`, text: "THEATER 3  ←", position: [route.xMin + 0.1, 2.85, 76.85], rotationY: Math.PI / 2, width: 1.95, height: 0.4, small: true });
    addLightPanel(`${auditorium.id}-route-light-a`, -16.95, 66.1, 1.55, 0.34, 4.42);
    addLightPanel(`${auditorium.id}-route-light-b`, -16.95, 75.0, 1.55, 0.34, 4.42);
  };

  const addT6Route = (auditorium) => {
    const { bounds } = auditorium;
    const turnX = bounds.xMax - 2.4;
    addWallXWithOpenings(`${auditorium.id}-south`, bounds.xMin, bounds.xMax, bounds.zMin, [{ center: auditorium.entry.center }], materials.darkWall);
    addDoorTrim(`${auditorium.id}-outer`, "south", bounds.zMin, auditorium.entry.center);
    addWallXWithOpenings(`${auditorium.id}-transverse-partition`, bounds.xMin, turnX, bounds.zMin + 3.0, [
      { center: 24.0, width: 1.75 }, { center: 30.4, width: 1.75 },
    ], materials.darkWall, 3.2);
    addDoorTrim(`${auditorium.id}-storage-door-a`, "north", bounds.zMin + 3.0, 24.0);
    addDoorTrim(`${auditorium.id}-storage-door-b`, "north", bounds.zMin + 3.0, 30.4);
    addWallZWithOpenings(`${auditorium.id}-long-route`, turnX, bounds.zMin + 3.0, bounds.zMin + 10.1, [{ center: bounds.zMin + 5.65, height: 4.05 }], materials.darkWall);
    addDoorTrim(`${auditorium.id}-route-inner`, "west", turnX, bounds.zMin + 5.65, materials.stainless, 4.05);
    addLabel({ id: `${auditorium.id}-first-turn`, text: "THEATER 6  →", position: [bounds.xMin + 4.7, 2.8, bounds.zMin + 2.82], rotationY: Math.PI, width: 2.05, height: 0.4, small: true });
    addLabel({ id: `${auditorium.id}-second-turn`, text: "THEATER 6  ←", position: [turnX + 0.1, 2.8, bounds.zMin + 5.25], rotationY: Math.PI / 2, width: 2.05, height: 0.4, small: true });
    addLightPanel(`${auditorium.id}-route-light-a`, 28.5, bounds.zMin + 1.55, 2.0, 0.34, 4.42);
    addLightPanel(`${auditorium.id}-route-light-b`, turnX + 1.15, bounds.zMin + 5.25, 1.55, 0.34, 4.42);
  };

  const addStraightRoute = (auditorium) => {
    const { bounds, entry } = auditorium;
    const routeX = bounds.xMin + 2.85;
    addWallXWithOpenings(`${auditorium.id}-south`, bounds.xMin, bounds.xMax, bounds.zMin, [{ center: entry.center }], materials.darkWall);
    addDoorTrim(`${auditorium.id}-outer`, "south", bounds.zMin, entry.center);
    addWallZWithOpenings(`${auditorium.id}-route-divider`, routeX, bounds.zMin, bounds.zMin + 10.2, [{ center: bounds.zMin + 2.75 }], materials.darkWall);
    addDoorTrim(`${auditorium.id}-route-inner`, "east", routeX, bounds.zMin + 2.75);
    addLightPanel(`${auditorium.id}-soundlock-light`, entry.center, bounds.zMin + 1.35, 1.45, 0.3, 4.42);
    addLightPanel(`${auditorium.id}-route-light`, bounds.xMin + 1.4, bounds.zMin + 6.7, 1.45, 0.3, 4.42);
  };

  const addDoglegRoute = (auditorium) => {
    const { bounds, entry } = auditorium;
    const westRoute = entry.firstTurn === "west";
    const sideX = westRoute ? bounds.xMax - 2.75 : bounds.xMin + 2.75;
    const routeBounds = {
      xMin: westRoute ? sideX : entry.center - 1.35,
      xMax: westRoute ? entry.center + 1.35 : sideX,
      zMin: 68.2,
      zMax: 72,
    };
    addWallXWithOpenings(`${auditorium.id}-outer-entry`, routeBounds.xMin, routeBounds.xMax, routeBounds.zMin, [{ center: entry.center }], materials.darkWall);
    addDoorTrim(`${auditorium.id}-outer`, "south", routeBounds.zMin, entry.center);
    const soundlockNorth = 70.6;
    const verticalCenter = westRoute
      ? (sideX + bounds.xMax) / 2
      : (bounds.xMin + sideX) / 2;
    addWallXWithOpenings(`${auditorium.id}-dogleg-sound-wall`, routeBounds.xMin, routeBounds.xMax, soundlockNorth, [{ center: verticalCenter }], materials.darkWall, 3.2);
    addDoorTrim(`${auditorium.id}-soundlock-inner`, "north", soundlockNorth, verticalCenter);
    addLabel({
      id: `${auditorium.id}-dogleg-direction`,
      text: `THEATER ${auditorium.number}  ${westRoute ? "←" : "→"}`,
      position: [entry.center, 2.35, soundlockNorth - 0.11],
      rotationY: Math.PI,
      width: 2.15,
      height: 0.42,
      small: true,
    });
    addLightPanel(`${auditorium.id}-vestibule-light`, entry.center, 69.25, 1.5, 0.3, 4.42);
    addLightPanel(`${auditorium.id}-side-route-light`, verticalCenter, 76.2, 1.5, 0.3, 4.42);
    addBox({ id: `${auditorium.id}-guide-entry`, x: entry.center, y: 0.014, z: 69.35, width: 0.075, height: 0.028, depth: 2.0, material: materials.red });
    addBox({ id: `${auditorium.id}-guide-turn`, x: (entry.center + verticalCenter) / 2, y: 0.014, z: 70.28, width: Math.abs(entry.center - verticalCenter), height: 0.028, depth: 0.075, material: materials.red });
    addBox({ id: `${auditorium.id}-guide-route`, x: verticalCenter, y: 0.014, z: 77.25, width: 0.075, height: 0.028, depth: 13.3, material: materials.red });
    if (westRoute) {
      addWallZ(`${auditorium.id}-vestibule-west`, routeBounds.xMin, routeBounds.zMin, soundlockNorth, materials.darkWall);
      addWallZ(`${auditorium.id}-vestibule-east`, routeBounds.xMax, routeBounds.zMin, soundlockNorth, materials.darkWall);
      addWallZ(`${auditorium.id}-route-outer`, bounds.xMax, soundlockNorth, bounds.zMin, materials.darkWall);
      addWallZWithOpenings(`${auditorium.id}-route-divider`, sideX, soundlockNorth, 85.3, [{ center: 84.05 }], materials.darkWall);
      addDoorTrim(`${auditorium.id}-route-inner`, "west", sideX, 84.05);
    } else {
      addWallZ(`${auditorium.id}-vestibule-west`, routeBounds.xMin, routeBounds.zMin, soundlockNorth, materials.darkWall);
      addWallZ(`${auditorium.id}-vestibule-east`, routeBounds.xMax, routeBounds.zMin, soundlockNorth, materials.darkWall);
      addWallZ(`${auditorium.id}-route-outer`, bounds.xMin, soundlockNorth, bounds.zMin, materials.darkWall);
      addWallZWithOpenings(`${auditorium.id}-route-divider`, sideX, soundlockNorth, 85.3, [{ center: 84.05 }], materials.darkWall);
      addDoorTrim(`${auditorium.id}-route-inner`, "east", sideX, 84.05);
    }
  };

  const addAuditorium = (auditorium) => {
    const { bounds, entry } = auditorium;
    const ceilingHeight = {
      large150: 7.2,
      medium58: 6.2,
      standard50: 5.6,
      compact38: 5.4,
    }[auditorium.preset];
    const interior = new THREE.Group();
    interior.name = `${auditorium.id}-interior`;
    interior.visible = false;
    root.add(interior);
    auditoriumGroups.set(auditorium.id, { auditorium, group: interior });

    addFloor(auditorium.id, bounds, materials.carpet);
    addCeiling(auditorium.id, bounds, ceilingHeight);
    addWallX(`${auditorium.id}-screen-wall`, bounds.xMin, bounds.xMax, auditorium.screenSide === "north" ? bounds.zMax : bounds.zMin, materials.darkWall, ceilingHeight);
    if (auditorium.number === 3) {
      addWallZWithOpenings(`${auditorium.id}-west`, bounds.xMin, bounds.zMin, bounds.zMax, [{ center: 90.5 }], materials.darkWall, ceilingHeight);
      addDoorTrim(`${auditorium.id}-west-egress`, "west", bounds.xMin, 90.5);
      addClosedDoor(`${auditorium.id}-west-egress-door`, "west", bounds.xMin, 90.5);
    } else {
      addWallZ(`${auditorium.id}-west`, bounds.xMin, bounds.zMin, bounds.zMax, materials.darkWall, ceilingHeight);
    }
    addWallZ(`${auditorium.id}-east`, bounds.xMax, bounds.zMin, bounds.zMax, materials.darkWall, ceilingHeight);

    if (entry.type === "trash-cubby") {
      addSmallTheaterCubby(auditorium);
    } else if (entry.type === "storage-left-then-left") {
      addWallXWithOpenings(`${auditorium.id}-south`, bounds.xMin, bounds.xMax, bounds.zMin, [{ center: -16.95, width: 2.7 }], materials.darkWall, ceilingHeight);
      addT3Route(auditorium);
      const storage = roomById(entry.storageId);
      if (storage) {
        const connector = { xMin: -20.9, xMax: -18.4, zMin: 66.1, zMax: 73.4 };
        addFloor(`${storage.id}-connector`, connector, materials.floorDark);
        addCeiling(`${storage.id}-connector`, connector, 2.38);
        addWallX(`${storage.id}-connector-south`, connector.xMin, connector.xMax, connector.zMin, materials.darkWall, 2.38);
        addWallX(`${storage.id}-connector-north`, connector.xMin, connector.xMax, connector.zMax, materials.darkWall, 2.38);
        addWallZ(`${storage.id}-connector-west`, connector.xMin, connector.zMin, storage.bounds.zMin, materials.darkWall, 2.38);
        addSimpleRoomShell({ ...storage, entrySide: "east", doorCenter: 73.0 }, { floorMaterial: materials.floorDark, height: 2.38, material: materials.darkWall });
      }
    } else if (entry.type === "right-then-left") {
      addT6Route(auditorium);
      const storage = roomById(entry.storageId);
      if (storage) {
        addFloor(storage.id, { ...storage.bounds, zMin: bounds.zMin + 3.0 }, materials.floorDark);
        addCeiling(storage.id, { ...storage.bounds, zMin: bounds.zMin + 3.0 }, 1.55);
        addWallX(`${storage.id}-north`, storage.bounds.xMin, storage.bounds.xMax, storage.bounds.zMax, materials.darkWall, 1.55);
        addWallZ(`${storage.id}-west`, storage.bounds.xMin, bounds.zMin + 3.0, storage.bounds.zMax, materials.darkWall, 1.55);
        addWallZ(`${storage.id}-east`, storage.bounds.xMax, bounds.zMin + 3.0, storage.bounds.zMax, materials.darkWall, 1.55);
      }
    } else if (entry.type === "straight-side") {
      addStraightRoute(auditorium);
    } else if (entry.type === "dogleg") {
      const sideCenter = entry.routeSide === "east" ? bounds.xMax - 1.35 : bounds.xMin + 1.35;
      addWallXWithOpenings(`${auditorium.id}-south`, bounds.xMin, bounds.xMax, bounds.zMin, [{ center: sideCenter, width: 2.7 }], materials.darkWall, ceilingHeight);
      addDoglegRoute(auditorium);
    }

    const layout = getSeatLayout(auditorium);
    seatLayouts.set(auditorium.id, layout);
    addScreen(auditorium, layout, interior);
    addAuditoriumSeats(auditorium, layout, interior);
    addAcousticPanels(auditorium, interior);

    const portalZ = auditorium.screenSide === "north"
      ? (entry.type === "dogleg" ? 68.05 : entry.type === "storage-left-then-left" ? 62.05 : bounds.zMin - 0.13)
      : bounds.zMax + 0.13;
    addLabel({
      id: `${auditorium.id}-sign`, text: `THEATER ${auditorium.number}`,
      position: [entry.center, 3.08, portalZ], rotationY: auditorium.screenSide === "north" ? Math.PI : 0,
      width: auditorium.number >= 10 ? 2.35 : 2.05, height: 0.52, small: true,
    });

    addLightPanel(`${auditorium.id}-light-a`, layout.centerX, (bounds.zMin + bounds.zMax) / 2 - 2.2, 2.3, 0.34, ceilingHeight - 0.18, interior);
    addLightPanel(`${auditorium.id}-light-b`, layout.centerX, (bounds.zMin + bounds.zMax) / 2 + 2.2, 2.3, 0.34, ceilingHeight - 0.18, interior);
  };

  const addRestroomFixtures = (room) => {
    const { bounds } = room;
    if (room.id === "boys-restroom") {
      // Three stalls at the rear-left, matching the green marks in the sketch.
      for (let index = 0; index < 3; index += 1) {
        const x = bounds.xMin + 0.75 + index * 1.55;
        addBox({ id: `${room.id}-stall-divider-${index}`, x, y: 1.05, z: bounds.zMax - 1.25, width: 0.06, height: 2.1, depth: 2.2, material: materials.stall });
        addBox({ id: `${room.id}-toilet-${index}`, x: x + 0.72, y: 0.32, z: bounds.zMax - 1.55, width: 0.55, height: 0.64, depth: 0.72, material: materials.porcelain });
      }
      for (let index = 0; index < 4; index += 1) {
        addBox({ id: `${room.id}-urinal-${index}`, x: bounds.xMin + 0.38, y: 0.68, z: bounds.zMin + 1.0 + index * 1.15, width: 0.45, height: 0.7, depth: 0.55, material: materials.porcelain, collide: true });
      }
      for (let index = 0; index < 3; index += 1) {
        const z = bounds.zMin + 3.2 + index * 1.15;
        addBox({ id: `${room.id}-sink-${index}`, x: bounds.xMax - 0.62, y: 0.82, z, width: 0.56, height: 0.16, depth: 0.9, material: materials.porcelain, collide: true });
        addBox({ id: `${room.id}-mirror-${index}`, x: bounds.xMax - 0.28, y: 1.72, z, width: 0.04, height: 1.0, depth: 0.78, material: materials.mirror });
      }
    } else if (room.id === "girls-restroom") {
      for (let index = 0; index < 6; index += 1) {
        const x = bounds.xMin + 0.68 + index * 1.75;
        addBox({ id: `${room.id}-stall-divider-${index}`, x, y: 1.05, z: bounds.zMax - 1.25, width: 0.06, height: 2.1, depth: 2.2, material: materials.stall });
        addBox({ id: `${room.id}-toilet-${index}`, x: x + 0.72, y: 0.32, z: bounds.zMax - 1.55, width: 0.55, height: 0.64, depth: 0.72, material: materials.porcelain });
      }
      for (let index = 0; index < 4; index += 1) {
        const x = bounds.xMin + 1.25 + index * 2.25;
        addBox({ id: `${room.id}-sink-${index}`, x, y: 0.82, z: bounds.zMin + 0.72, width: 1.0, height: 0.16, depth: 0.58, material: materials.porcelain, collide: true });
        addBox({ id: `${room.id}-mirror-${index}`, x, y: 1.72, z: bounds.zMin + 0.35, width: 0.82, height: 1.0, depth: 0.04, material: materials.mirror });
      }
    }
  };

  const addRestroom = (room) => {
    addSimpleRoomShell(room, { floorMaterial: materials.lobbyTile });
    const { bounds } = room;
    if (room.kind === "restroom") {
      const returnZ = bounds.zMin + 2.35;
      if (room.privacyTurn === "west") {
        addWallX(`${room.id}-privacy-return`, room.doorCenter - 0.3, bounds.xMax - 0.4, returnZ, materials.wall, 2.75);
      } else {
        addWallX(`${room.id}-privacy-return`, bounds.xMin + 0.4, room.doorCenter + 0.3, returnZ, materials.wall, 2.75);
      }
      addRestroomFixtures(room);
    }
    const center = centerOf(bounds);
    addLabel({ id: `${room.id}-sign`, text: room.name.toUpperCase(), position: [room.doorCenter ?? center.x, 3.0, bounds.zMin - 0.13], rotationY: Math.PI, width: 2.4, height: 0.45, small: true, accent: "#68a3d8" });
    addLightPanel(`${room.id}-light`, center.x, center.z, Math.min(2.2, bounds.xMax - bounds.xMin - 1), 0.4);
  };

  const addPOSStation = (station) => {
    const [x, , z] = station.position;
    addBox({ id: `${station.id}-drawer`, x, y: 1.12, z, width: 0.72, height: 0.16, depth: 0.48, material: materials.black });
    addBox({ id: `${station.id}-pole`, x: x + 0.13, y: 1.46, z, width: 0.08, height: 0.62, depth: 0.08, material: materials.stainless });
    addBox({ id: `${station.id}-screen`, x: x + 0.13, y: 1.74, z, width: 0.12, height: 0.48, depth: 0.7, material: materials.display });
    addBox({ id: `${station.id}-reader`, x: x - 0.35, y: 1.25, z: z + 0.2, width: 0.24, height: 0.12, depth: 0.34, material: materials.black });
    addBox({ id: `${station.id}-printer`, x: x - 0.22, y: 1.24, z: z - 0.25, width: 0.34, height: 0.16, depth: 0.28, material: materials.stainless });
  };

  const addConcessionFront = () => {
    const zMin = 2.1;
    const zMax = 19.0;
    const gateCenter = 8.5;
    const gateWidth = 2.25;
    const addCounterRun = (id, runMin, runMax) => {
      const center = (runMin + runMax) / 2;
      addBox({ id, x: -19.45, y: 0.56, z: center, width: 1.1, height: 1.12, depth: runMax - runMin, material: materials.wood, collide: true });
      addBox({ id: `${id}-top`, x: -19.45, y: 1.16, z: center, width: 1.32, height: 0.1, depth: runMax - runMin + 0.18, material: materials.counterStone });
    };
    addCounterRun("concession-counter-south", zMin, gateCenter - gateWidth / 2);
    addCounterRun("concession-counter-north", gateCenter + gateWidth / 2, zMax);
    addLabel({ id: "concession-staff-gate", text: "STAFF", position: [-19.62, 1.55, gateCenter], rotationY: Math.PI / 2, width: 1.0, height: 0.28, small: true, accent: "#f0c36f" });
    for (const station of POS_STATIONS) addPOSStation(station);
    for (let index = 0; index < 5; index += 1) {
      const z = 3.8 + index * 3.25;
      addBox({ id: `concession-menu-${index}`, x: -20.22, y: 3.15, z, width: 0.1, height: 1.1, depth: 2.55, material: materials.display });
    }
    addLabel({ id: "concession-overhead", text: "CONCESSIONS", position: [-19.1, 3.92, 10.5], rotationY: Math.PI / 2, width: 5.8, height: 0.68 });
  };

  const addCupCaddy = (id, x, z) => {
    addBox({ id: `${id}-base`, x, y: 1.12, z, width: 0.75, height: 0.2, depth: 0.72, material: materials.black });
    for (let index = -1; index <= 1; index += 1) {
      addCylinder({ id: `${id}-stack-${index}`, x: x + index * 0.22, y: 1.45, z, radius: 0.1, height: 0.55, material: materials.porcelain });
      addCylinder({ id: `${id}-lid-${index}`, x: x + index * 0.22, y: 1.77, z, radius: 0.12, height: 0.07, material: materials.black });
    }
    addBox({ id: `${id}-straws`, x, y: 1.42, z: z + 0.28, width: 0.18, height: 0.62, depth: 0.18, material: materials.stainless });
  };

  const addSodaService = () => {
    const court = publicById("soda-service");
    addFloor(court.id, court.bounds, materials.corridorCarpet);
    addCeiling(court.id, court.bounds);
    addWallZ("soda-court-east", court.bounds.xMax, court.bounds.zMin, court.bounds.zMax, materials.darkWall);
    addWallX("soda-court-north-west", court.bounds.xMin, -12.5, court.bounds.zMax, materials.darkWall);
    addWallX("soda-court-north-east", 13.5, court.bounds.xMax, court.bounds.zMax, materials.darkWall);

    addBox({ id: "soda-island", x: 1.5, y: 0.52, z: 63.6, width: 11.5, height: 1.04, depth: 1.42, material: materials.wood, collide: true });
    addBox({ id: "soda-island-top", x: 1.5, y: 1.08, z: 63.6, width: 11.75, height: 0.1, depth: 1.6, material: materials.counterStone });
    addCupCaddy("soda-cup-caddy", 0.45, 63.55);
    addBox({ id: "rear-empty-counter", x: 1.5, y: 0.5, z: 66.45, width: 11.5, height: 1.0, depth: 0.9, material: materials.wood, collide: true });
    addBox({ id: "rear-empty-counter-top", x: 1.5, y: 1.04, z: 66.45, width: 11.75, height: 0.09, depth: 1.08, material: materials.counterStone });
    addLabel({ id: "soda-service-sign", text: "DRINKS  ·  ICEE", position: [1.5, 3.35, 68.7], rotationY: 0, width: 4.8, height: 0.58, accent: "#68a3d8" });
    addTrashCan("soda-trash-left", -5.0, 64.9);
    addTrashCan("soda-trash-right", 8.0, 64.9);
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

    const localBox = (id, x, y, localZ, w, h, d, material) => addBox({
      id, x, y, z: localZ, width: w, height: h, depth: d,
      material, parent: group, space: "local",
    });
    const onIsland = anchor.roomId === "soda-service";
    const baseY = onIsland ? 1.15 : 0;

    if (!onIsland) {
      localBox(`${anchor.id}-base`, 0, 0.46, 0, width, 0.92, depth, materials.stainless);
      const cosine = Math.abs(Math.cos(planToWorldYaw(anchor.rotation)));
      const sine = Math.abs(Math.sin(planToWorldYaw(anchor.rotation)));
      addColliderWorld(
        `${anchor.id}-base`, planToWorldX(planX), 0.46, z,
        width * cosine + depth * sine, 0.92, width * sine + depth * cosine,
      );
    }

    if (anchor.type === "popper") {
      localBox(`${anchor.id}-glass`, 0, 1.45, 0, width * 0.9, 1.02, depth * 0.86, materials.glass);
      localBox(`${anchor.id}-canopy`, 0, 2.02, 0, width, 0.16, depth, materials.red);
      localBox(`${anchor.id}-kettle`, 0, 1.55, 0, 0.52, 0.27, 0.52, materials.black);
    } else if (anchor.type === "soda-fountain") {
      localBox(`${anchor.id}-base`, 0, baseY + 0.22, 0, width, 0.42, depth, materials.black);
      localBox(`${anchor.id}-tower`, 0, baseY + 0.75, depth * 0.24, width * 0.94, 0.75, depth * 0.4, materials.black);
      localBox(`${anchor.id}-display`, 0, baseY + 0.89, depth * 0.03, width * 0.82, 0.28, 0.04, materials.display);
      localBox(`${anchor.id}-drip`, 0, baseY + 0.3, -depth * 0.18, width * 0.8, 0.06, depth * 0.34, materials.stainless);
      for (let nozzle = -2; nozzle <= 2; nozzle += 1) {
        localBox(`${anchor.id}-nozzle-${nozzle}`, nozzle * width * 0.16, baseY + 0.64, -depth * 0.15, 0.1, 0.2, 0.12, materials.red);
      }
    } else if (anchor.type === "icee-fountain") {
      localBox(`${anchor.id}-base`, 0, baseY + 0.28, 0, width, 0.54, depth, materials.black);
      localBox(`${anchor.id}-header`, 0, baseY + 1.25, depth * 0.15, width * 0.95, 0.25, depth * 0.38, materials.display);
      const bowlMaterialA = anchor.id.includes("left") ? materials.iceeRed : materials.iceeBlue;
      const bowlMaterialB = anchor.id.includes("left") ? materials.iceeBlue : materials.iceeRed;
      const bowlA = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.62, 16), bowlMaterialA);
      bowlA.position.set(-0.32, baseY + 0.82, 0);
      const bowlB = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.62, 16), bowlMaterialB);
      bowlB.position.set(0.32, baseY + 0.82, 0);
      group.add(bowlA, bowlB);
      meshCount += 2;
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

  // Public floors: gray stone stops at the larger lobby; patterned maroon
  // carpet begins at the long approach and continues through the theater hall.
  const frontWalk = publicById("front-walk");
  const lobby = publicById("lobby");
  const approach = publicById("lobby-approach");
  const hall = publicById("main-corridor");
  addFloor(frontWalk.id, frontWalk.bounds, materials.concrete);
  addFloor(lobby.id, lobby.bounds, materials.lobbyStone);
  addFloor(approach.id, approach.bounds, materials.corridorCarpet);
  addFloor(hall.id, hall.bounds, materials.corridorCarpet);
  addCeiling(lobby.id, lobby.bounds);
  addCeiling(approach.id, approach.bounds);
  addCeiling(hall.id, hall.bounds);

  addWallXWithOpenings("lobby-front", -37, lobby.bounds.xMax, 0, [
    { center: -3.2, width: 2.3 }, { center: 1.5, width: 2.3 }, { center: 6.2, width: 2.3 },
  ], materials.glass);
  for (const center of [-3.2, 1.5, 6.2]) addDoorTrim(`lobby-front-${center}`, "south", -0.03, center, materials.stainless);
  addWallZ("lobby-east", lobby.bounds.xMax, 0, lobby.bounds.zMax, materials.wall);
  addWallX("lobby-back-west", lobby.bounds.xMin, approach.bounds.xMin, lobby.bounds.zMax, materials.wall);
  addWallX("lobby-back-east", approach.bounds.xMax, lobby.bounds.xMax, lobby.bounds.zMax, materials.wall);
  // Seal the short exterior return between the west lobby corner and the
  // concession frontage. Without this segment the rendered lobby floor was
  // walkable directly into the unmodelled exterior void.
  addWallZ("lobby-west-entry-return", lobby.bounds.xMin, lobby.bounds.zMin, 2.1, materials.wall);
  addWallZ("approach-west", approach.bounds.xMin, approach.bounds.zMin, approach.bounds.zMax, materials.darkWall);
  addWallZWithOpenings("approach-east", approach.bounds.xMax, approach.bounds.zMin, approach.bounds.zMax, [{ center: 39 }], materials.darkWall);
  addDoorTrim("approach-extra-room-door", "east", approach.bounds.xMax, 39);
  addWallZ("hall-west-end", hall.bounds.xMin, hall.bounds.zMin, hall.bounds.zMax, materials.darkWall);
  addWallZ("hall-east-end", hall.bounds.xMax, hall.bounds.zMin, hall.bounds.zMax, materials.darkWall);

  addBox({ id: "front-canopy", x: 1.5, y: 3.55, z: -1.8, width: 24, height: 0.28, depth: 4.1, material: materials.black });
  addBox({ id: "front-red-band", x: 1.5, y: 3.04, z: -0.18, width: 27, height: 0.42, depth: 0.24, material: materials.red });
  addLabel({ id: "facade-title", text: "CONSOLIDATED THEATRES  ·  MILILANI", position: [1.5, 3.62, -4.0], rotationY: Math.PI, width: 11.5, height: 0.74 });

  addBox({ id: "front-west-planter", x: frontWalk.bounds.xMin, y: 0.45, z: -5, width: 0.35, height: 0.9, depth: 10, material: materials.concrete, collide: true });
  addBox({ id: "front-east-planter", x: frontWalk.bounds.xMax, y: 0.45, z: -5, width: 0.35, height: 0.9, depth: 10, material: materials.concrete, collide: true });
  addBox({ id: "front-south-planter", x: 1.5, y: 0.45, z: frontWalk.bounds.zMin, width: 55, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });
  addBox({ id: "front-north-west-stop", x: -23, y: 0.45, z: 0, width: 6, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });
  addBox({ id: "front-north-east-stop", x: 26, y: 0.45, z: 0, width: 6, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });

  addConcessionFront();
  addSodaService();
  // The fountain court is open to the main hall on its south side, but its
  // west perimeter is a real building edge rather than another guest route.
  addWallZ("soda-court-west-perimeter", roomById("soda-support").bounds.xMin - 0.5, 62.2, 72, materials.darkWall);

  // Back-of-house rooms on the concession side of the enlarged lobby.
  for (const id of ["office", "kitchen-storage", "kitchen"]) {
    const room = roomById(id);
    addSimpleRoomShell(room, {
      floorMaterial: id === "kitchen" ? materials.lobbyTile : materials.floorDark,
      material: materials.wall,
    });
    const center = centerOf(room.bounds);
    addLabel({
      id: `${room.id}-sign`, text: `${room.short}  ·  ${room.name.toUpperCase()}`,
      position: [room.bounds.xMax + 0.13, 3.0, room.doorCenter ?? center.z], rotationY: Math.PI / 2,
      width: 2.5, height: 0.44, small: true, accent: "#f0c36f",
    });
  }

  const concessionRoom = roomById("concession-boh");
  addFloor(concessionRoom.id, concessionRoom.bounds, materials.floorDark);
  addCeiling(concessionRoom.id, concessionRoom.bounds);
  addWallZWithOpenings("concession-boh-west", concessionRoom.bounds.xMin, concessionRoom.bounds.zMin, concessionRoom.bounds.zMax, [
    { center: 5.5 }, { center: 17.5 },
  ], materials.wall);
  addWallX("concession-boh-south", concessionRoom.bounds.xMin, concessionRoom.bounds.xMax, concessionRoom.bounds.zMin, materials.wall);
  addWallXWithOpenings("concession-boh-north", concessionRoom.bounds.xMin, concessionRoom.bounds.xMax, concessionRoom.bounds.zMax, [{ center: -26.3 }], materials.wall);
  addDoorTrim("concession-to-kitchen", "north", concessionRoom.bounds.zMax, -26.3);

  const bar = roomById("bar");
  addFloor(bar.id, bar.bounds, materials.floorDark);
  addCeiling(bar.id, bar.bounds);
  addWallX("bar-north", bar.bounds.xMin, bar.bounds.xMax, bar.bounds.zMax, materials.wall);
  addWallZWithOpenings("bar-west", bar.bounds.xMin, bar.bounds.zMin, bar.bounds.zMax, [{ center: 21.5 }], materials.wall);
  addWallZ("bar-east", bar.bounds.xMax, bar.bounds.zMin, bar.bounds.zMax, materials.wall);
  addBox({ id: "bar-counter", x: (bar.bounds.xMin + bar.bounds.xMax) / 2, y: 0.56, z: bar.bounds.zMin + 0.4, width: bar.bounds.xMax - bar.bounds.xMin - 0.5, height: 1.12, depth: 0.82, material: materials.wood, collide: true });
  addBox({ id: "bar-counter-top", x: (bar.bounds.xMin + bar.bounds.xMax) / 2, y: 1.16, z: bar.bounds.zMin + 0.4, width: bar.bounds.xMax - bar.bounds.xMin - 0.25, height: 0.1, depth: 1.0, material: materials.counterStone });
  addLabel({ id: "bar-sign", text: "THE LANAI BAR", position: [(bar.bounds.xMin + bar.bounds.xMax) / 2, 3.1, bar.bounds.zMin - 0.08], rotationY: Math.PI, width: 3.5, height: 0.52, accent: "#f0c36f" });

  // Freestanding L-shaped box office, matching the plan more closely than a
  // sealed rectangular room.
  const boxOffice = roomById("box-office");
  addFloor(boxOffice.id, boxOffice.bounds, materials.lobbyStone);
  addBox({ id: "box-office-long-counter", x: 16.0, y: 0.56, z: 8.0, width: 5.6, height: 1.12, depth: 0.9, material: materials.wood, collide: true });
  addBox({ id: "box-office-return-counter", x: 18.35, y: 0.56, z: 10.8, width: 0.9, height: 1.12, depth: 4.8, material: materials.wood, collide: true });
  addBox({ id: "box-office-top-a", x: 16.0, y: 1.16, z: 8.0, width: 5.85, height: 0.1, depth: 1.08, material: materials.counterStone });
  addBox({ id: "box-office-top-b", x: 18.35, y: 1.16, z: 10.8, width: 1.08, height: 0.1, depth: 5.05, material: materials.counterStone });
  addLabel({ id: "box-office-sign", text: "BOX OFFICE", position: [16.0, 2.75, 7.5], rotationY: Math.PI, width: 2.8, height: 0.5 });

  // Original procedural island-botanical lobby art.
  const mural = new THREE.Mesh(
    new THREE.PlaneGeometry(11.5, 3.35),
    new THREE.MeshBasicMaterial({ map: createBotanicalMuralTexture(), toneMapped: false }),
  );
  mural.name = "original-naupaka-inspired-lobby-mural";
  mural.position.set(planToWorldX(22.88), 2.1, 17.0);
  mural.rotation.y = planToWorldYaw(-Math.PI / 2);
  root.add(mural);
  meshCount += 1;

  // The additional door along the lobby approach is intentionally an empty
  // shell until its exact use is confirmed.
  const approachRoom = roomById("approach-room");
  addSimpleRoomShell(approachRoom, { floorMaterial: materials.lobbyTile });
  addLabel({ id: "approach-room-sign", text: "RESTROOM", position: [approachRoom.bounds.xMin - 0.12, 3.0, approachRoom.doorCenter], rotationY: -Math.PI / 2, width: 2.0, height: 0.42, small: true, accent: "#68a3d8" });

  for (const id of ["unconfirmed-restroom", "boys-restroom", "girls-restroom"]) addRestroom(roomById(id));
  for (const id of ["trash-room", "soda-support", "candy-storage"]) {
    const room = roomById(id);
    addSimpleRoomShell(room, { floorMaterial: room.id === "trash-room" ? materials.lobbyTile : materials.floorDark });
    const center = centerOf(room.bounds);
    addLabel({ id: `${room.id}-sign`, text: room.name.toUpperCase(), position: [room.doorCenter ?? center.x, 3.0, room.bounds.zMin - 0.13], rotationY: Math.PI, width: Math.min(3.0, room.bounds.xMax - room.bounds.xMin - 0.3), height: 0.44, small: true, accent: "#f0c36f" });
  }
  addClosedDoor("office-exterior-door", "south", roomById("office").bounds.zMin, -33);
  addClosedDoor("candy-east-exit-door", "east", roomById("candy-storage").bounds.xMax, 72.1);

  // Boys-room soundlock/cubby between the hall and the recessed restroom.
  const boys = roomById("boys-restroom");
  const boysCubby = { xMin: -24.8, xMax: -21, zMin: 62.2, zMax: 65.5 };
  addFloor("boys-restroom-cubby", boysCubby, materials.corridorCarpet);
  addCeiling("boys-restroom-cubby", boysCubby);
  addWallXWithOpenings("boys-cubby-south", boysCubby.xMin, boysCubby.xMax, boysCubby.zMin, [{ center: boys.doorCenter }], materials.wall);
  addDoorTrim("boys-cubby-outer", "south", boysCubby.zMin, boys.doorCenter);
  addWallZ("boys-cubby-east", boysCubby.xMax, boysCubby.zMin, boysCubby.zMax, materials.wall);
  addWallZ("boys-cubby-west", boysCubby.xMin, boysCubby.zMin, boysCubby.zMax, materials.wall);

  // Matching recessed privacy entry for the women's restroom. The main room
  // begins farther north so the hall door does not open directly to fixtures.
  const girls = roomById("girls-restroom");
  const girlsCubby = { xMin: 42.7, xMax: 46.5, zMin: 62.2, zMax: 65.0 };
  addFloor("girls-restroom-cubby", girlsCubby, materials.corridorCarpet);
  addCeiling("girls-restroom-cubby", girlsCubby);
  addWallXWithOpenings("girls-cubby-south", girlsCubby.xMin, girlsCubby.xMax, girlsCubby.zMin, [{ center: girls.doorCenter }], materials.wall);
  addDoorTrim("girls-cubby-outer", "south", girlsCubby.zMin, girls.doorCenter);
  addWallZ("girls-cubby-east", girlsCubby.xMax, girlsCubby.zMin, girlsCubby.zMax, materials.wall);
  addWallZ("girls-cubby-west", girlsCubby.xMin, girlsCubby.zMin, girlsCubby.zMax, materials.wall);

  // Ticket podiums deliberately leave a wide center lane to the soda court.
  addLabel({ id: "ticket-sign", text: "TICKETS  ·  AUDITORIUMS 1–14", position: [1.0, 3.15, 54.0], rotationY: Math.PI, width: 5.2, height: 0.62 });
  for (const x of [-3.2, 5.8]) {
    addBox({ id: `ticket-podium-${x}`, x, y: 0.55, z: 56.4, width: 0.65, height: 1.1, depth: 0.65, material: materials.black, collide: true });
    addBox({ id: `ticket-scanner-${x}`, x, y: 1.16, z: 56.4, width: 0.4, height: 0.14, depth: 0.43, material: materials.red });
  }
  addLabel({ id: "hall-wayfinding", text: "THEATERS 1–4  ←     5–14  →", position: [1.5, 3.25, 61.85], rotationY: Math.PI, width: 5.4, height: 0.54, accent: "#f0c36f" });

  for (const auditorium of AUDITORIUMS) addAuditorium(auditorium);
  for (const anchor of EQUIPMENT_ANCHORS) addEquipmentFixture(anchor);

  // Generic poster lightboxes along the long corridor.
  for (let index = 0; index < 7; index += 1) {
    const x = 12 + index * 23.5;
    const z = hall.bounds.zMin + 0.2;
    addBox({ id: `poster-${index}-left`, x: x - 0.78, y: 1.8, z, width: 0.09, height: 2.55, depth: 0.1, material: materials.black });
    addBox({ id: `poster-${index}-right`, x: x + 0.78, y: 1.8, z, width: 0.09, height: 2.55, depth: 0.1, material: materials.black });
    addBox({ id: `poster-${index}-top`, x, y: 3.03, z, width: 1.65, height: 0.09, depth: 0.1, material: materials.black });
    addBox({ id: `poster-${index}-bottom`, x, y: 0.57, z, width: 1.65, height: 0.09, depth: 0.1, material: materials.black });
    addLabel({ id: `poster-art-${index}`, text: `NOW SHOWING\nSCREEN ${String(index * 2 + 1).padStart(2, "0")}`, position: [x, 1.8, z + 0.06], width: 1.42, height: 2.28, accent: index % 2 ? "#6f8fe8" : "#ef4657" });
  }

  const addFillSegments = (side, z, occupied, openings = []) => {
    const combined = [...occupied, ...openings].sort((a, b) => a[0] - b[0]);
    let cursor = hall.bounds.xMin;
    for (const [start, end] of combined) {
      if (start > cursor) addWallX(`hall-${side}-fill-${cursor.toFixed(1)}`, cursor, start, z, materials.darkWall);
      cursor = Math.max(cursor, end);
    }
    if (cursor < hall.bounds.xMax) addWallX(`hall-${side}-fill-last`, cursor, hall.bounds.xMax, z, materials.darkWall);
  };

  const southOccupied = AUDITORIUMS
    .filter((room) => room.screenSide === "south")
    .map((room) => [room.bounds.xMin, room.bounds.xMax]);
  const northOccupied = [
    [-40, -33], [-32, -24], [-24.8, -21], [-18.4, -15.5], [-13, 17],
    [20, 37.5], [42.7, 46.5], [65, 82.5], [98, 115.5], [132, 158],
  ];
  addFillSegments("south", hall.bounds.zMin, southOccupied, [[approach.bounds.xMin, approach.bounds.xMax]]);
  addFillSegments("north", hall.bounds.zMax, northOccupied);

  for (let x = -34; x <= 158; x += 12) addLightPanel(`hall-light-${x}`, x, 60.1, 2.65, 0.3);
  for (const [x, z] of [[-14, 6], [-4, 6], [7, 6], [17, 6], [-11, 17], [2, 17], [14, 17], [1.5, 29], [1.5, 39], [1.5, 49], [4, 65]]) {
    addLightPanel(`lobby-light-${x}-${z}`, x, z, 2.2, 0.44);
  }

  const warmLobbyLight = new THREE.PointLight(0xffd7ae, 58, 32, 2);
  warmLobbyLight.position.set(planToWorldX(1.5), 3.6, 10);
  root.add(warmLobbyLight);
  const approachLight = new THREE.PointLight(0xffdfc7, 56, 34, 2);
  approachLight.position.set(planToWorldX(1.5), 3.7, 40);
  root.add(approachLight);
  const hallLights = [-30, 0, 30, 60, 90, 120, 150].map((planX) => {
    const light = new THREE.PointLight(0xffe7cf, 44, 28, 2);
    light.position.set(planToWorldX(planX), 3.7, 60.1);
    root.add(light);
    return light;
  });

  const routeSurfaceFor = (auditorium, layout) => {
    const backHeight = (auditorium.rows.length - 1) * layout.rise;
    if (auditorium.number === 3) {
      return {
        backHeight,
        ramp: { xMin: -18.4, xMax: -15.5, zStart: 70.2, zEnd: 77.65 },
        cross: { xMin: layout.centerX - 0.65, xMax: -15.5, z: 77.65, depth: 1.2 },
      };
    }
    if (auditorium.number === 6) {
      return {
        backHeight,
        ramp: { xMin: 35.1, xMax: 37.5, zStart: 65.1, zEnd: 67.85 },
        cross: { xMin: layout.centerX - 0.65, xMax: 37.5, z: 67.85, depth: 1.2 },
      };
    }
    if (auditorium.number === 7 || auditorium.number === 8) {
      return {
        backHeight,
        ramp: { xMin: auditorium.bounds.xMin, xMax: auditorium.bounds.xMin + 2.85, zStart: 64.9, zEnd: 69.5 },
        cross: null,
      };
    }
    if (auditorium.entry.type === "trash-cubby") {
      const cubbySouth = auditorium.bounds.zMax - 2.2;
      const doorZ = cubbySouth + 1.05;
      const sideX = auditorium.entry.turnSide === "west"
        ? auditorium.entry.center - 1.6
        : auditorium.entry.center + 1.6;
      const ramp = auditorium.entry.turnSide === "west"
        ? { xMin: auditorium.bounds.xMin, xMax: sideX, zStart: doorZ, zEnd: layout.backRowZ + layout.direction * 1.05 }
        : { xMin: sideX, xMax: auditorium.bounds.xMax, zStart: doorZ, zEnd: layout.backRowZ + layout.direction * 1.05 };
      const routeX = (ramp.xMin + ramp.xMax) / 2;
      return {
        backHeight,
        ramp,
        cross: {
          xMin: Math.min(routeX, layout.centerX) - 0.62,
          xMax: Math.max(routeX, layout.centerX) + 0.62,
          z: ramp.zEnd,
          depth: 0.9,
        },
      };
    }
    return null;
  };

  const routeSurfaces = new Map(AUDITORIUMS.map((auditorium) => {
    const layout = seatLayouts.get(auditorium.id);
    return [auditorium.id, layout ? routeSurfaceFor(auditorium, layout) : null];
  }));

  const routeSurfaceHeight = (surface, planX, z) => {
    if (!surface) return null;
    const { cross, ramp, backHeight } = surface;
    // Prefer the ramp where it overlaps the raised cross aisle. Returning the
    // cross-aisle height first created a 40 cm ledge in Theater 6 just before
    // the top of the ramp, larger than the controller's safe step height.
    if (planX >= ramp.xMin && planX <= ramp.xMax) {
      const zMin = Math.min(ramp.zStart, ramp.zEnd);
      const zMax = Math.max(ramp.zStart, ramp.zEnd);
      if (z >= zMin && z <= zMax) {
        const progress = Math.max(0, Math.min(1, (z - ramp.zStart) / (ramp.zEnd - ramp.zStart)));
        return backHeight * progress;
      }
    }
    if (cross
      && planX >= cross.xMin && planX <= cross.xMax
      && Math.abs(z - cross.z) <= cross.depth / 2) return backHeight;
    return null;
  };

  const groundHeight = (worldX, z) => {
    const planX = worldToPlanX(worldX);
    for (const auditorium of AUDITORIUMS) {
      const layout = seatLayouts.get(auditorium.id);
      if (!layout) continue;
      const routeHeight = routeSurfaceHeight(routeSurfaces.get(auditorium.id), planX, z);
      if (routeHeight !== null) return routeHeight;
      const { bounds } = auditorium;
      if (planX < bounds.xMin || planX > bounds.xMax || z < bounds.zMin || z > bounds.zMax) continue;
      if (Math.abs(planX - layout.centerX) >= 0.63) return 0;

      const rowProgress = (z - layout.firstRowZ) / (layout.direction * layout.rowPitch);
      if (rowProgress < 0) return 0;
      // Keep the stepped center aisle tied to the actual seating rake. The
      // route-specific ramp/cross-aisle sampler above owns the area behind the
      // final row; extending this generic plateau to the auditorium wall made
      // an invisible full-height divider across Theater 6's entry apron.
      const distancePastBackRow = (z - layout.backRowZ) * layout.direction;
      if (distancePastBackRow > 0.62) return 0;
      return Math.min((auditorium.rows.length - 1) * layout.rise, rowProgress * layout.rise);
    }
    return 0;
  };

  const updateVisibility = (worldX, z) => {
    const planX = worldToPlanX(worldX);
    for (const { auditorium, group } of auditoriumGroups.values()) {
      const { bounds } = auditorium;
      group.visible = planX >= bounds.xMin - 6
        && planX <= bounds.xMax + 6
        && z >= Math.min(bounds.zMin, 62.2) - 7
        && z <= bounds.zMax + 7;
    }
  };

  // Visualize every elevation transition represented by the ground sampler.
  // This keeps the cubby and side-route floors readable and, crucially, makes
  // all raised rear aisles walkable without relying on the jump button.
  for (const auditorium of AUDITORIUMS) {
    const layout = seatLayouts.get(auditorium.id);
    const surface = routeSurfaces.get(auditorium.id);
    if (!surface) continue;
    const group = auditoriumGroups.get(auditorium.id).group;
    const { backHeight, cross, ramp } = surface;
    const rampWidth = ramp.xMax - ramp.xMin;
    const rampCenterX = (ramp.xMin + ramp.xMax) / 2;
    const rampLength = Math.abs(ramp.zEnd - ramp.zStart);
    const direction = Math.sign(ramp.zEnd - ramp.zStart) || 1;
    const steps = 8;
    for (let index = 0; index < steps; index += 1) {
      const stepDepth = rampLength / steps + 0.025;
      const height = backHeight * ((index + 1) / steps);
      const z = ramp.zStart + direction * (index + 0.5) * (rampLength / steps);
      const nosingZ = ramp.zStart + direction * (index + 1) * (rampLength / steps);
      addBox({ id: `${auditorium.id}-side-ramp-${index}`, x: rampCenterX, y: height / 2, z, width: rampWidth, height, depth: stepDepth, material: materials.carpet, parent: group });
      addBox({ id: `${auditorium.id}-side-ramp-nosing-${index}`, x: rampCenterX, y: height + 0.012, z: nosingZ, width: rampWidth, height: 0.024, depth: 0.055, material: materials.red, parent: group });
    }
    if (cross) {
      addBox({ id: `${auditorium.id}-rear-cross-aisle`, x: (cross.xMin + cross.xMax) / 2, y: backHeight / 2, z: cross.z, width: cross.xMax - cross.xMin, height: Math.max(0.04, backHeight), depth: cross.depth, material: materials.carpet, parent: group });
    }
  }

  batchBoxMeshes(root);
  let batchedMeshCount = 0;
  root.traverse((object) => {
    if (object.isMesh) batchedMeshCount += 1;
  });

  const worldBounds = planToWorldBounds(MAP_BOUNDS);
  updateVisibility(planToWorldX(1.5), -6.8);

  return {
    root,
    colliders,
    equipment,
    auditoriumGroups,
    worldBounds,
    groundHeight,
    updateVisibility,
    stats: Object.freeze({
      auditoriumCount: AUDITORIUMS.length,
      seatCount,
      equipmentAnchors: equipment.size,
      meshCount: batchedMeshCount,
      sourceMeshCount: meshCount,
      lightCount: hallLights.length + 2,
    }),
  };
}
