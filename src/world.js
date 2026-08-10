import * as THREE from "three";
import {
  AUDITORIUMS,
  EQUIPMENT_ANCHORS,
  PUBLIC_SPACES,
  SERVICE_ROOMS,
} from "./layout-data.js";
import { createBotanicalMuralTexture, createSignTexture } from "./materials.js";

const WALL_HEIGHT = 4.6;
const WALL_THICKNESS = 0.18;
const DOOR_WIDTH = 2.1;
const DOOR_HEIGHT = 2.55;

const centerOf = (bounds) => ({
  x: (bounds.xMin + bounds.xMax) / 2,
  z: (bounds.zMin + bounds.zMax) / 2,
});

const sizeOf = (bounds) => ({
  width: bounds.xMax - bounds.xMin,
  depth: bounds.zMax - bounds.zMin,
});

export function createTheaterWorld({ scene, materials }) {
  const root = new THREE.Group();
  root.name = "Mililani 14 layout prototype";
  scene.add(root);

  const colliders = [];
  const equipment = new Map();
  const auditoriumGroups = new Map();
  const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const unitPlaneGeometry = new THREE.PlaneGeometry(1, 1);
  const seatGeometries = {
    cushion: new THREE.BoxGeometry(0.54, 0.14, 0.5),
    back: new THREE.BoxGeometry(0.56, 0.72, 0.13),
    base: new THREE.BoxGeometry(0.09, 0.44, 0.09),
  };
  let meshCount = 0;
  let seatCount = 0;

  const addCollider = (id, x, y, z, width, height, depth) => {
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
  }) => {
    const mesh = new THREE.Mesh(unitBoxGeometry, material);
    mesh.name = id;
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    meshCount += 1;
    if (collide) addCollider(id, x, y, z, width, height, depth);
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
    return addBox({
      id: `${id}-floor`,
      x,
      y: elevation - 0.06,
      z,
      width,
      height: 0.12,
      depth,
      material,
    });
  };

  const addCeiling = (id, bounds, height = WALL_HEIGHT) => {
    const { x, z } = centerOf(bounds);
    const { width, depth } = sizeOf(bounds);
    return addBox({
      id: `${id}-ceiling`,
      x,
      y: height,
      z,
      width,
      height: 0.1,
      depth,
      material: materials.ceiling,
      receiveShadow: false,
    });
  };

  const addWallX = (id, xMin, xMax, z, material = materials.wall, height = WALL_HEIGHT) => {
    if (xMax - xMin <= 0.03) return null;
    return addBox({
      id,
      x: (xMin + xMax) / 2,
      y: height / 2,
      z,
      width: xMax - xMin,
      height,
      depth: WALL_THICKNESS,
      material,
      collide: true,
    });
  };

  const addWallZ = (id, x, zMin, zMax, material = materials.wall, height = WALL_HEIGHT) => {
    if (zMax - zMin <= 0.03) return null;
    return addBox({
      id,
      x,
      y: height / 2,
      z: (zMin + zMax) / 2,
      width: WALL_THICKNESS,
      height,
      depth: zMax - zMin,
      material,
      collide: true,
    });
  };

  const addWallXWithDoor = (id, xMin, xMax, z, doorCenter, material = materials.wall, height = WALL_HEIGHT) => {
    const left = Math.max(xMin, doorCenter - DOOR_WIDTH / 2);
    const right = Math.min(xMax, doorCenter + DOOR_WIDTH / 2);
    addWallX(`${id}-left`, xMin, left, z, material, height);
    addWallX(`${id}-right`, right, xMax, z, material, height);
    addBox({
      id: `${id}-header`,
      x: (left + right) / 2,
      y: DOOR_HEIGHT + (height - DOOR_HEIGHT) / 2,
      z,
      width: right - left,
      height: height - DOOR_HEIGHT,
      depth: WALL_THICKNESS,
      material,
      collide: true,
    });
  };

  const addWallZWithDoor = (id, x, zMin, zMax, doorCenter, material = materials.wall, height = WALL_HEIGHT) => {
    const near = Math.max(zMin, doorCenter - DOOR_WIDTH / 2);
    const far = Math.min(zMax, doorCenter + DOOR_WIDTH / 2);
    addWallZ(`${id}-near`, x, zMin, near, material, height);
    addWallZ(`${id}-far`, x, far, zMax, material, height);
    addBox({
      id: `${id}-header`,
      x,
      y: DOOR_HEIGHT + (height - DOOR_HEIGHT) / 2,
      z: (near + far) / 2,
      width: WALL_THICKNESS,
      height: height - DOOR_HEIGHT,
      depth: far - near,
      material,
      collide: true,
    });
  };

  const addDoorTrim = (id, side, coordinate, center, colorMaterial = materials.red) => {
    if (side === "north" || side === "south") {
      addBox({ id: `${id}-trim-left`, x: center - DOOR_WIDTH / 2, y: DOOR_HEIGHT / 2, z: coordinate, width: 0.09, height: DOOR_HEIGHT, depth: 0.25, material: colorMaterial });
      addBox({ id: `${id}-trim-right`, x: center + DOOR_WIDTH / 2, y: DOOR_HEIGHT / 2, z: coordinate, width: 0.09, height: DOOR_HEIGHT, depth: 0.25, material: colorMaterial });
      addBox({ id: `${id}-trim-top`, x: center, y: DOOR_HEIGHT, z: coordinate, width: DOOR_WIDTH + 0.09, height: 0.09, depth: 0.25, material: colorMaterial });
    } else {
      addBox({ id: `${id}-trim-near`, x: coordinate, y: DOOR_HEIGHT / 2, z: center - DOOR_WIDTH / 2, width: 0.25, height: DOOR_HEIGHT, depth: 0.09, material: colorMaterial });
      addBox({ id: `${id}-trim-far`, x: coordinate, y: DOOR_HEIGHT / 2, z: center + DOOR_WIDTH / 2, width: 0.25, height: DOOR_HEIGHT, depth: 0.09, material: colorMaterial });
      addBox({ id: `${id}-trim-top`, x: coordinate, y: DOOR_HEIGHT, z: center, width: 0.25, height: 0.09, depth: DOOR_WIDTH + 0.09, material: colorMaterial });
    }
  };

  const addLabel = ({ id, text, position, rotationY = 0, width = 2.7, height = 0.62, accent = "#ef4657", small = false, parent = root }) => {
    const texture = createSignTexture(text, { accent, small });
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const sign = new THREE.Mesh(unitPlaneGeometry, signMaterial);
    sign.name = id;
    sign.position.set(...position);
    sign.rotation.y = rotationY;
    sign.scale.set(width, height, 1);
    parent.add(sign);
    meshCount += 1;
    return sign;
  };

  const addLightPanel = (id, x, z, width = 1.5, depth = 0.42, height = 4.45, parent = root) => {
    return addBox({
      id,
      x,
      y: height,
      z,
      width,
      height: 0.035,
      depth,
      material: materials.light,
      parent,
      receiveShadow: false,
    });
  };

  const addRoomShell = ({ room, entrySide = "south", doorCenter, material = materials.wall, floor = materials.floorDark, ceiling = true, height = WALL_HEIGHT }) => {
    const { bounds } = room;
    const { x, z } = centerOf(bounds);
    if (floor) addFloor(room.id, bounds, floor);
    if (ceiling) addCeiling(room.id, bounds, height);

    if (entrySide === "south") {
      addWallXWithDoor(`${room.id}-entry`, bounds.xMin, bounds.xMax, bounds.zMin, doorCenter ?? x, material, height);
      addDoorTrim(room.id, entrySide, bounds.zMin, doorCenter ?? x);
      addWallX(`${room.id}-north`, bounds.xMin, bounds.xMax, bounds.zMax, material, height);
      addWallZ(`${room.id}-west-side`, bounds.xMin, bounds.zMin, bounds.zMax, material, height);
      addWallZ(`${room.id}-east-side`, bounds.xMax, bounds.zMin, bounds.zMax, material, height);
    } else if (entrySide === "north") {
      addWallXWithDoor(`${room.id}-entry`, bounds.xMin, bounds.xMax, bounds.zMax, doorCenter ?? x, material, height);
      addDoorTrim(room.id, entrySide, bounds.zMax, doorCenter ?? x);
      addWallX(`${room.id}-south`, bounds.xMin, bounds.xMax, bounds.zMin, material, height);
      addWallZ(`${room.id}-west-side`, bounds.xMin, bounds.zMin, bounds.zMax, material, height);
      addWallZ(`${room.id}-east-side`, bounds.xMax, bounds.zMin, bounds.zMax, material, height);
    } else if (entrySide === "east") {
      addWallZWithDoor(`${room.id}-entry`, bounds.xMax, bounds.zMin, bounds.zMax, doorCenter ?? z, material, height);
      addDoorTrim(room.id, entrySide, bounds.xMax, doorCenter ?? z);
      addWallZ(`${room.id}-west`, bounds.xMin, bounds.zMin, bounds.zMax, material, height);
      addWallX(`${room.id}-south-side`, bounds.xMin, bounds.xMax, bounds.zMin, material, height);
      addWallX(`${room.id}-north-side`, bounds.xMin, bounds.xMax, bounds.zMax, material, height);
    } else {
      addWallZWithDoor(`${room.id}-entry`, bounds.xMin, bounds.zMin, bounds.zMax, doorCenter ?? z, material, height);
      addDoorTrim(room.id, entrySide, bounds.xMin, doorCenter ?? z);
      addWallZ(`${room.id}-east`, bounds.xMax, bounds.zMin, bounds.zMax, material, height);
      addWallX(`${room.id}-south-side`, bounds.xMin, bounds.xMax, bounds.zMin, material, height);
      addWallX(`${room.id}-north-side`, bounds.xMin, bounds.xMax, bounds.zMax, material, height);
    }
    return room;
  };

  const addScreen = (auditorium, parent) => {
    const { bounds } = auditorium;
    const { x } = centerOf(bounds);
    const width = Math.min(bounds.xMax - bounds.xMin - 1.35, 14.8);
    const height = Math.min(width / 2.05, 5.9);
    const z = auditorium.screenSide === "north" ? bounds.zMax - 0.12 : bounds.zMin + 0.12;
    const screen = new THREE.Mesh(unitPlaneGeometry, materials.screen);
    screen.name = `${auditorium.id}-screen`;
    screen.position.set(x, Math.max(2.2, height / 2 + 0.45), z);
    screen.rotation.y = auditorium.screenSide === "north" ? Math.PI : 0;
    screen.scale.set(width, height, 1);
    parent.add(screen);
    meshCount += 1;

    addBox({ id: `${auditorium.id}-screen-top`, x, y: screen.position.y + height / 2 + 0.12, z, width: width + 0.25, height: 0.16, depth: 0.18, material: materials.black, parent });
    addBox({ id: `${auditorium.id}-screen-bottom`, x, y: screen.position.y - height / 2 - 0.12, z, width: width + 0.25, height: 0.16, depth: 0.18, material: materials.black, parent });
  };

  const addAuditoriumSeats = (auditorium, parent) => {
    const { bounds, rows, screenSide } = auditorium;
    const width = bounds.xMax - bounds.xMin;
    const depth = bounds.zMax - bounds.zMin;
    const rowPitch = Math.min(1.75, (depth - 5.1) / Math.max(1, rows.length - 1));
    const direction = screenSide === "north" ? -1 : 1;
    const firstRowZ = screenSide === "north" ? bounds.zMax - 3.9 : bounds.zMin + 3.9;
    const backOffset = screenSide === "north" ? -0.22 : 0.22;
    const rise = auditorium.preset === "large150" ? 0.26 : 0.23;
    const cushionMesh = new THREE.InstancedMesh(seatGeometries.cushion, materials.seat, auditorium.seats);
    const backMesh = new THREE.InstancedMesh(seatGeometries.back, materials.seat, auditorium.seats);
    const baseMesh = new THREE.InstancedMesh(seatGeometries.base, materials.seatMetal, auditorium.seats);
    cushionMesh.name = `${auditorium.id}-seat-cushions`;
    backMesh.name = `${auditorium.id}-seat-backs`;
    baseMesh.name = `${auditorium.id}-seat-bases`;
    const matrix = new THREE.Matrix4();
    let instance = 0;

    rows.forEach((rowCount, rowIndex) => {
      const tierY = rowIndex * rise;
      const rowZ = firstRowZ + direction * rowIndex * rowPitch;
      const aisle = rowCount > 6 ? 1.05 : 0;
      const seatSpacing = Math.min(0.69, (width - 1.7 - aisle) / rowCount);
      const rowWidth = seatSpacing * (rowCount - 1) + aisle;

      const tierSeatingWidth = (width - 1.35) / 2;
      addBox({
        id: `${auditorium.id}-tier-${rowIndex}-left`,
        x: (bounds.xMin + bounds.xMax) / 2 - 0.675 - tierSeatingWidth / 2,
        y: Math.max(0.015, tierY / 2),
        z: rowZ,
        width: tierSeatingWidth,
        height: Math.max(0.03, tierY),
        depth: Math.min(rowPitch * 0.92, 1.5),
        material: materials.floorDark,
        parent,
      });
      addBox({
        id: `${auditorium.id}-tier-${rowIndex}-right`,
        x: (bounds.xMin + bounds.xMax) / 2 + 0.675 + tierSeatingWidth / 2,
        y: Math.max(0.015, tierY / 2),
        z: rowZ,
        width: tierSeatingWidth,
        height: Math.max(0.03, tierY),
        depth: Math.min(rowPitch * 0.92, 1.5),
        material: materials.floorDark,
        parent,
      });
      addBox({
        id: `${auditorium.id}-aisle-step-${rowIndex}`,
        x: (bounds.xMin + bounds.xMax) / 2,
        y: Math.max(0.015, tierY / 2),
        z: rowZ,
        width: 1.05,
        height: Math.max(0.03, tierY),
        depth: Math.min(rowPitch * 0.92, 1.5),
        material: materials.carpet,
        parent,
      });

      for (let column = 0; column < rowCount; column += 1) {
        const onRight = aisle > 0 && column >= rowCount / 2;
        const x = (bounds.xMin + bounds.xMax) / 2 - rowWidth / 2 + column * seatSpacing + (onRight ? aisle : 0);
        matrix.makeTranslation(x, tierY + 0.53, rowZ);
        cushionMesh.setMatrixAt(instance, matrix);
        matrix.makeTranslation(x, tierY + 0.92, rowZ + backOffset);
        backMesh.setMatrixAt(instance, matrix);
        matrix.makeTranslation(x, tierY + 0.27, rowZ + backOffset * 0.3);
        baseMesh.setMatrixAt(instance, matrix);
        instance += 1;
      }

      const blockerWidth = (width - 1.85) / 2;
      addCollider(`${auditorium.id}-seats-${rowIndex}-left`, bounds.xMin + 0.25 + blockerWidth / 2, 0.8, rowZ, blockerWidth, 1.6 + tierY, 0.78);
      addCollider(`${auditorium.id}-seats-${rowIndex}-right`, bounds.xMax - 0.25 - blockerWidth / 2, 0.8, rowZ, blockerWidth, 1.6 + tierY, 0.78);
    });

    cushionMesh.instanceMatrix.needsUpdate = true;
    backMesh.instanceMatrix.needsUpdate = true;
    baseMesh.instanceMatrix.needsUpdate = true;
    cushionMesh.castShadow = false;
    backMesh.castShadow = false;
    parent.add(cushionMesh, backMesh, baseMesh);
    meshCount += 3;
    seatCount += auditorium.seats;
  };

  const addAcousticPanels = (auditorium, parent) => {
    const { bounds } = auditorium;
    const { z } = centerOf(bounds);
    const depth = bounds.zMax - bounds.zMin;
    for (const side of [bounds.xMin + 0.1, bounds.xMax - 0.1]) {
      for (const offset of [-0.25, 0.25]) {
        addBox({
          id: `${auditorium.id}-acoustic-panel-${side}-${offset}`,
          x: side,
          y: 2.25,
          z: z + offset * depth,
          width: 0.12,
          height: 2.7,
          depth: Math.max(2.2, depth * 0.34),
          material: materials.acoustic,
          parent,
        });
      }
    }
  };

  const addAuditorium = (auditorium) => {
    const entrySide = auditorium.screenSide === "north" ? "south" : "north";
    const boundsCenter = centerOf(auditorium.bounds);
    const doorCenter = auditorium.number === 3 ? -10 : boundsCenter.x;
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

    addRoomShell({ room: auditorium, entrySide, doorCenter, material: materials.darkWall, floor: materials.carpet, height: ceilingHeight });
    addScreen(auditorium, interior);
    addAuditoriumSeats(auditorium, interior);
    addAcousticPanels(auditorium, interior);

    const rowPitch = Math.min(1.75, (auditorium.bounds.zMax - auditorium.bounds.zMin - 5.1) / Math.max(1, auditorium.rows.length - 1));
    const rise = auditorium.preset === "large150" ? 0.26 : 0.23;
    const backTierHeight = (auditorium.rows.length - 1) * rise;
    const rowDirection = auditorium.screenSide === "north" ? -1 : 1;
    const entryDirection = -rowDirection;
    const firstRowZ = auditorium.screenSide === "north" ? auditorium.bounds.zMax - 3.9 : auditorium.bounds.zMin + 3.9;
    const backRowZ = firstRowZ + rowDirection * (auditorium.rows.length - 1) * rowPitch;
    const entryEdgeZ = auditorium.screenSide === "north" ? auditorium.bounds.zMin : auditorium.bounds.zMax;
    const rampStart = entryEdgeZ + entryDirection * 0.55;
    const rampEnd = backRowZ - entryDirection * rowPitch * 0.52;
    const rampLength = Math.max(1.2, Math.abs(rampEnd - rampStart));
    const rampSteps = Math.max(4, Math.ceil(backTierHeight / 0.23));
    for (let step = 0; step < rampSteps; step += 1) {
      const stepDepth = rampLength / rampSteps + 0.025;
      const stepHeight = backTierHeight * ((step + 1) / rampSteps);
      addBox({
        id: `${auditorium.id}-entry-ramp-${step}`,
        x: boundsCenter.x,
        y: stepHeight / 2,
        z: rampStart + entryDirection * (step + 0.5) * (rampLength / rampSteps),
        width: 1.05,
        height: stepHeight,
        depth: stepDepth,
        material: materials.carpet,
        parent: interior,
      });
    }

    const entryZ = entrySide === "south" ? auditorium.bounds.zMin - 0.13 : auditorium.bounds.zMax + 0.13;
    addLabel({
      id: `${auditorium.id}-sign`,
      text: `THEATER ${auditorium.number}  ·  ${auditorium.seats} SEATS`,
      position: [doorCenter, 3.15, entryZ],
      rotationY: entrySide === "south" ? Math.PI : 0,
      width: auditorium.number >= 10 ? 3.05 : 2.8,
      height: 0.52,
      small: true,
    });

    const lightZ = boundsCenter.z;
    addLightPanel(`${auditorium.id}-light-front`, boundsCenter.x, lightZ - 2.1, 2.3, 0.34, ceilingHeight - 0.18, interior);
    addLightPanel(`${auditorium.id}-light-back`, boundsCenter.x, lightZ + 2.1, 2.3, 0.34, ceilingHeight - 0.18, interior);

    if (auditorium.underStorage) {
      const storageZ = auditorium.screenSide === "north" ? auditorium.bounds.zMin + 1.9 : auditorium.bounds.zMax - 1.9;
      addBox({ id: `${auditorium.id}-storage-door`, x: auditorium.bounds.xMin + 1.8, y: 1.05, z: storageZ, width: 1.4, height: 2.1, depth: 0.12, material: materials.stainless, parent: interior });
      addLabel({ id: `${auditorium.id}-storage-label`, text: "BELOW-TIER STORAGE", position: [auditorium.bounds.xMin + 1.8, 1.55, storageZ + (auditorium.screenSide === "north" ? 0.08 : -0.08)], rotationY: auditorium.screenSide === "north" ? 0 : Math.PI, width: 1.12, height: 0.22, small: true, accent: "#68a3d8", parent: interior });
    }
  };

  const addServiceFixtures = (room) => {
    if (room.id === "boys-restroom" || room.id === "girls-restroom") {
      const isMens = room.id === "boys-restroom";
      const stallCount = isMens ? 3 : 6;
      const sinkCount = isMens ? 3 : 4;
      const width = room.bounds.xMax - room.bounds.xMin;
      const stallWidth = Math.min(1.35, (width - 1) / stallCount);
      for (let index = 0; index < stallCount; index += 1) {
        const x = room.bounds.xMin + 0.7 + index * stallWidth;
        addBox({ id: `${room.id}-stall-divider-${index}`, x, y: 1.05, z: room.bounds.zMax - 1.55, width: 0.06, height: 2.1, depth: 2.25, material: materials.stall });
        addBox({ id: `${room.id}-stall-door-${index}`, x: x + stallWidth * 0.48, y: 1.05, z: room.bounds.zMax - 0.43, width: stallWidth * 0.84, height: 2, depth: 0.06, material: materials.stall });
      }
      const sinkPositions = isMens
        ? [room.bounds.xMin + 1.35, room.bounds.xMin + 2.9, room.bounds.xMin + 4.45]
        : [room.bounds.xMin + 1.35, room.bounds.xMin + 2.9, room.bounds.xMax - 2.9, room.bounds.xMax - 1.35];
      for (let index = 0; index < sinkCount; index += 1) {
        const x = sinkPositions[index];
        addBox({ id: `${room.id}-sink-${index}`, x, y: 0.82, z: room.bounds.zMin + 0.68, width: 1.05, height: 0.16, depth: 0.56, material: materials.porcelain, collide: true });
        addBox({ id: `${room.id}-mirror-${index}`, x, y: 1.72, z: room.bounds.zMin + 0.35, width: 0.82, height: 1.02, depth: 0.04, material: materials.mirror });
      }
      if (isMens) {
        for (let index = 0; index < 4; index += 1) {
          addBox({ id: `${room.id}-urinal-${index}`, x: room.bounds.xMin + 0.35, y: 0.68, z: room.bounds.zMin + 1.25 + index * 1.05, width: 0.42, height: 0.66, depth: 0.55, material: materials.porcelain, collide: true });
        }
      }
    }
  };

  const addEquipmentPlaceholder = (anchor) => {
    const [x, , z] = anchor.position;
    const [width, depth] = anchor.footprint;
    const group = new THREE.Group();
    group.name = anchor.id;
    group.position.set(x, 0, z);
    group.rotation.y = anchor.rotation;
    root.add(group);
    equipment.set(anchor.id, { anchor, group });

    const localBox = (id, px, py, pz, w, h, d, material, collide = false) => {
      const mesh = addBox({ id, x: px, y: py, z: pz, width: w, height: h, depth: d, material, parent: group });
      if (collide) {
        const cosine = Math.abs(Math.cos(anchor.rotation));
        const sine = Math.abs(Math.sin(anchor.rotation));
        const rotatedWidth = w * cosine + d * sine;
        const rotatedDepth = w * sine + d * cosine;
        addCollider(id, x, h / 2, z, rotatedWidth, h, rotatedDepth);
      }
      return mesh;
    };

    localBox(`${anchor.id}-base`, 0, 0.46, 0, width, 0.92, depth, materials.stainless, true);
    if (anchor.type === "popper") {
      localBox(`${anchor.id}-glass`, 0, 1.45, 0, width * 0.9, 1.02, depth * 0.86, materials.glass);
      localBox(`${anchor.id}-canopy`, 0, 2.02, 0, width, 0.16, depth, materials.red);
      localBox(`${anchor.id}-kettle`, 0, 1.55, 0, 0.52, 0.27, 0.52, materials.black);
    } else if (anchor.type === "soda-fountain") {
      localBox(`${anchor.id}-tower`, 0, 1.27, depth * 0.25, width * 0.92, 0.7, depth * 0.4, materials.black);
      for (let nozzle = -2; nozzle <= 2; nozzle += 1) {
        localBox(`${anchor.id}-nozzle-${nozzle}`, nozzle * width * 0.16, 1.22, -depth * 0.1, 0.1, 0.18, 0.12, materials.red);
      }
    } else if (anchor.type === "turbo-oven") {
      localBox(`${anchor.id}-oven`, 0, 1.35, 0, width * 0.9, 0.82, depth * 0.88, materials.black);
      localBox(`${anchor.id}-oven-window`, 0, 1.4, -depth * 0.46, width * 0.62, 0.38, 0.03, materials.glass);
    } else if (anchor.type === "fryer") {
      localBox(`${anchor.id}-fryer-well`, 0, 1.01, 0, width * 0.76, 0.14, depth * 0.7, materials.black);
      localBox(`${anchor.id}-fryer-back`, 0, 1.35, depth * 0.38, width * 0.88, 0.74, 0.08, materials.stainless);
    } else if (anchor.type === "grill") {
      localBox(`${anchor.id}-griddle`, 0, 0.98, 0, width * 0.94, 0.12, depth * 0.9, materials.black);
      localBox(`${anchor.id}-backsplash`, 0, 1.25, depth * 0.43, width, 0.55, 0.07, materials.stainless);
    } else if (anchor.type === "bar-well") {
      localBox(`${anchor.id}-well`, 0, 1, 0, width * 0.78, 0.18, depth * 0.7, materials.black);
    }

    addLabel({ id: `${anchor.id}-tag`, text: anchor.type.replaceAll("-", " ").toUpperCase(), position: [x, 2.35, z], rotationY: anchor.rotation, width: Math.max(1.05, width), height: 0.25, small: true, accent: "#f0c36f" });
  };

  // Exterior approach and the recognizable arrival facade.
  const frontWalk = PUBLIC_SPACES.find((space) => space.id === "front-walk");
  const lobby = PUBLIC_SPACES.find((space) => space.id === "lobby");
  const neck = PUBLIC_SPACES.find((space) => space.id === "lobby-neck");
  const hall = PUBLIC_SPACES.find((space) => space.id === "main-corridor");
  addFloor(frontWalk.id, frontWalk.bounds, materials.concrete);
  addFloor(lobby.id, lobby.bounds, materials.lobbyTile);
  addFloor(neck.id, neck.bounds, materials.carpet);
  addFloor(hall.id, hall.bounds, materials.carpet);
  addCeiling(lobby.id, lobby.bounds);
  addCeiling(neck.id, neck.bounds);
  addCeiling(hall.id, hall.bounds);

  addWallXWithDoor("lobby-front", lobby.bounds.xMin, lobby.bounds.xMax, lobby.bounds.zMin, 1.5, materials.glass);
  addDoorTrim("lobby-front-door", "south", lobby.bounds.zMin - 0.03, 1.5, materials.stainless);
  addWallZ("lobby-east", lobby.bounds.xMax, lobby.bounds.zMin, lobby.bounds.zMax, materials.wall);
  addWallX("lobby-back-west", lobby.bounds.xMin, neck.bounds.xMin, lobby.bounds.zMax, materials.wall);
  addWallX("lobby-back-east", neck.bounds.xMax, lobby.bounds.xMax, lobby.bounds.zMax, materials.wall);
  addWallZ("neck-west", neck.bounds.xMin, neck.bounds.zMin, neck.bounds.zMax, materials.darkWall);
  addWallZ("neck-east", neck.bounds.xMax, neck.bounds.zMin, neck.bounds.zMax, materials.darkWall);
  addWallZ("hall-west-end", hall.bounds.xMin, hall.bounds.zMin, hall.bounds.zMax, materials.darkWall);
  addWallZ("hall-east-end", hall.bounds.xMax, hall.bounds.zMin, hall.bounds.zMax, materials.darkWall);

  addBox({ id: "front-canopy", x: 1.5, y: 3.55, z: -1.85, width: 18, height: 0.28, depth: 4.1, material: materials.black });
  addBox({ id: "front-red-band", x: 1.5, y: 3.04, z: -0.18, width: 20, height: 0.42, depth: 0.24, material: materials.red });
  addLabel({ id: "facade-title", text: "CONSOLIDATED THEATRES  ·  MILILANI", position: [1.5, 3.62, -4.02], rotationY: Math.PI, width: 10.8, height: 0.72, accent: "#ef4657" });

  // Low planters bound the modeled arrival walk so players cannot bypass the shell through the void.
  addBox({ id: "front-walk-west-planter", x: frontWalk.bounds.xMin, y: 0.45, z: -4.5, width: 0.35, height: 0.9, depth: 9, material: materials.concrete, collide: true });
  addBox({ id: "front-walk-east-planter", x: frontWalk.bounds.xMax, y: 0.45, z: -4.5, width: 0.35, height: 0.9, depth: 9, material: materials.concrete, collide: true });
  addBox({ id: "front-walk-south-planter", x: 1, y: 0.45, z: frontWalk.bounds.zMin, width: 42, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });
  addBox({ id: "front-walk-north-west-stop", x: -17, y: 0.45, z: 0, width: 6, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });
  addBox({ id: "front-walk-north-east-stop", x: 19.5, y: 0.45, z: 0, width: 5, height: 0.9, depth: 0.35, material: materials.concrete, collide: true });

  // Concession and bar counters establish the remodeled food-and-beverage lobby.
  addBox({ id: "concession-counter", x: -13.35, y: 0.56, z: 4.2, width: 1.18, height: 1.12, depth: 6.6, material: materials.wood, collide: true });
  addBox({ id: "concession-counter-top", x: -13.35, y: 1.16, z: 4.2, width: 1.35, height: 0.09, depth: 6.9, material: materials.black });
  addLabel({ id: "concession-overhead", text: "CONCESSIONS", position: [-12.7, 3.05, 4.2], rotationY: Math.PI / 2, width: 3.6, height: 0.54 });
  addBox({ id: "bar-counter", x: -9, y: 0.58, z: 11.8, width: 9.3, height: 1.16, depth: 0.88, material: materials.wood, collide: true });
  addBox({ id: "bar-counter-top", x: -9, y: 1.19, z: 11.8, width: 9.55, height: 0.1, depth: 1.06, material: materials.black });
  addLabel({ id: "bar-overhead", text: "THE LANAI BAR", position: [-9, 3.1, 11.65], width: 3.4, height: 0.54, accent: "#f0c36f" });

  // Original island-botanical artwork, inspired by the location's local visual character.
  const mural = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 3.25),
    new THREE.MeshBasicMaterial({ map: createBotanicalMuralTexture(), toneMapped: false }),
  );
  mural.name = "original-naupaka-inspired-lobby-mural";
  mural.position.set(16.88, 2.12, 9.2);
  mural.rotation.y = -Math.PI / 2;
  root.add(mural);
  meshCount += 1;

  // Ticket checkpoint and freestanding scanning stations.
  addLabel({ id: "ticket-check-sign", text: "TICKETS  ·  AUDITORIUMS 1–14", position: [0.5, 3.12, 34.2], rotationY: Math.PI, width: 5.4, height: 0.64 });
  for (const x of [-2.4, 0.5, 3.4]) {
    addBox({ id: `ticket-podium-${x}`, x, y: 0.55, z: 35.8, width: 0.62, height: 1.1, depth: 0.62, material: materials.black, collide: true });
    addBox({ id: `ticket-scanner-${x}`, x, y: 1.16, z: 35.8, width: 0.38, height: 0.14, depth: 0.42, material: materials.red });
  }

  // Generic poster lightboxes keep the shell visually rich without using movie artwork.
  for (let index = 0; index < 5; index += 1) {
    const x = 20 + index * 24;
    const z = hall.bounds.zMin + 0.22;
    addBox({ id: `poster-frame-${index}-left`, x: x - 0.78, y: 1.8, z, width: 0.09, height: 2.55, depth: 0.1, material: materials.black });
    addBox({ id: `poster-frame-${index}-right`, x: x + 0.78, y: 1.8, z, width: 0.09, height: 2.55, depth: 0.1, material: materials.black });
    addBox({ id: `poster-frame-${index}-top`, x, y: 3.03, z, width: 1.65, height: 0.09, depth: 0.1, material: materials.black });
    addBox({ id: `poster-frame-${index}-bottom`, x, y: 0.57, z, width: 1.65, height: 0.09, depth: 0.1, material: materials.black });
    addLabel({ id: `poster-art-${index}`, text: `NOW SHOWING\nSCREEN ${String(index * 3 + 1).padStart(2, "0")}`, position: [x, 1.8, z + 0.06], width: 1.42, height: 2.28, accent: index % 2 ? "#6f8fe8" : "#ef4657" });
  }

  // Service rooms. Under-tier volumes are represented inside their auditoriums instead.
  const serviceEntry = {
    "kitchen-storage": "east",
    office: "east",
    kitchen: "east",
    "concession-boh": "east",
    bar: "east",
    "box-office": "west",
    "boys-restroom": "south",
    "girls-restroom": "south",
    "usher-stock": "south",
    "candy-storage": "south",
  };
  const backOfHouseIds = new Set(["kitchen-storage", "office", "kitchen", "concession-boh", "bar"]);
  const serviceDoorCenters = {
    "kitchen-storage": 13,
    office: 4,
    kitchen: 14,
    "concession-boh": 8,
    bar: 14,
  };
  for (const room of SERVICE_ROOMS) {
    if (room.kind === "storage-lower") continue;
    const entrySide = serviceEntry[room.id] ?? "south";
    const roomFloor = room.kind === "restroom" || room.kind === "kitchen" ? materials.lobbyTile : materials.floorDark;
    if (backOfHouseIds.has(room.id)) {
      if (room.id !== "bar") {
        addFloor(room.id, room.bounds, roomFloor);
        addCeiling(room.id, room.bounds);
      }
    } else {
      const embeddedInLobby = room.id === "box-office";
      addRoomShell({ room, entrySide, material: materials.wall, floor: embeddedInLobby ? false : roomFloor, ceiling: !embeddedInLobby });
    }
    const { x, z } = centerOf(room.bounds);
    let labelPosition;
    let rotationY = 0;
    if (entrySide === "south") { labelPosition = [x, 3.02, room.bounds.zMin - 0.13]; rotationY = Math.PI; }
    else if (entrySide === "north") labelPosition = [x, 3.02, room.bounds.zMax + 0.13];
    else if (entrySide === "east") { labelPosition = [room.bounds.xMax + 0.13, 3.02, serviceDoorCenters[room.id] ?? z]; rotationY = Math.PI / 2; }
    else { labelPosition = [room.bounds.xMin - 0.13, 3.02, z]; rotationY = -Math.PI / 2; }
    addLabel({ id: `${room.id}-sign`, text: `${room.short ?? "STAFF"}  ·  ${room.name.toUpperCase()}`, position: labelPosition, rotationY, width: 2.55, height: 0.46, small: true, accent: room.kind === "restroom" ? "#68a3d8" : "#f0c36f" });
    addServiceFixtures(room);
    addLightPanel(`${room.id}-light`, x, z, Math.min(2.1, room.bounds.xMax - room.bounds.xMin - 1), 0.4);
  }

  // Build the kitchen/concession/bar/office block once so shared staff doors remain traversable.
  addWallZ("service-block-west", -30, 0, 16, materials.wall);
  addWallX("service-block-south", -30, -14, 0, materials.wall);
  addWallX("service-block-north", -30, -4, 16, materials.wall);
  addWallXWithDoor("office-to-storage", -30, -22, 8.5, -26, materials.wall);
  addWallZWithDoor("office-to-concession", -22, 0, 8, 4, materials.wall);
  addWallZWithDoor("storage-to-kitchen", -22, 9, 16, 13, materials.wall);
  addWallXWithDoor("concession-to-kitchen", -22, -14, 9, -18, materials.wall);
  addWallZ("kitchen-lobby-boundary", -14, 9, 12, materials.wall);
  addWallZWithDoor("kitchen-to-bar", -14, 12, 16, 14, materials.wall);
  addWallZWithDoor("bar-staff-entry", -4, 12, 16, 14, materials.wall);
  addDoorTrim("office-to-concession", "east", -22, 4, materials.stainless);
  addDoorTrim("storage-to-kitchen", "east", -22, 13, materials.stainless);
  addDoorTrim("concession-to-kitchen", "south", 9, -18, materials.stainless);
  addDoorTrim("kitchen-to-bar", "east", -14, 14, materials.stainless);
  addDoorTrim("bar-staff-entry", "east", -4, 14, materials.stainless);

  // Theater 3 uses the narrow passage shown between the restroom and auditorium.
  const passageBounds = { xMin: -12, xMax: -8, zMin: 43.5, zMax: 50 };
  addFloor("theater-3-passage", passageBounds, materials.carpet);
  addCeiling("theater-3-passage", passageBounds);
  addWallZ("theater-3-passage-west", passageBounds.xMin, passageBounds.zMin, passageBounds.zMax, materials.darkWall);
  addWallZ("theater-3-passage-east", passageBounds.xMax, passageBounds.zMin, passageBounds.zMax, materials.darkWall);

  for (const auditorium of AUDITORIUMS) addAuditorium(auditorium);
  for (const anchor of EQUIPMENT_ANCHORS) addEquipmentPlaceholder(anchor);

  // Fill open corridor edges between room blocks while preserving each doorway.
  const addFillSegments = (side, z, occupied, openings = []) => {
    const combined = [...occupied, ...openings].sort((a, b) => a[0] - b[0]);
    let cursor = hall.bounds.xMin;
    for (const [start, end] of combined) {
      if (start > cursor) addWallX(`hall-${side}-fill-${cursor.toFixed(1)}`, cursor, start, z, materials.darkWall);
      cursor = Math.max(cursor, end);
    }
    if (cursor < hall.bounds.xMax) addWallX(`hall-${side}-fill-last`, cursor, hall.bounds.xMax, z, materials.darkWall);
  };

  const southRooms = AUDITORIUMS.filter((room) => room.screenSide === "south").map((room) => [room.bounds.xMin, room.bounds.xMax]);
  const northRooms = [
    ...AUDITORIUMS.filter((room) => room.screenSide === "north" && room.number !== 3).map((room) => [room.bounds.xMin, room.bounds.xMax]),
    ...SERVICE_ROOMS.filter((room) => ["boys-restroom", "girls-restroom", "candy-storage"].includes(room.id)).map((room) => [room.bounds.xMin, room.bounds.xMax]),
    [passageBounds.xMin, passageBounds.xMax],
  ];
  addFillSegments("south", hall.bounds.zMin, southRooms, [[neck.bounds.xMin, neck.bounds.xMax]]);
  addFillSegments("north", hall.bounds.zMax, northRooms);

  // Shared practical lighting; emissive panels supply the visible fixtures.
  for (let x = -24; x <= 120; x += 12) addLightPanel(`hall-light-${x}`, x, 40.75, 2.7, 0.32);
  for (const [x, z] of [[-8, 5], [1, 5], [10, 5], [-5, 13], [5, 13], [1, 22], [1, 30]]) {
    addLightPanel(`lobby-light-${x}-${z}`, x, z, 2.2, 0.45);
  }

  const warmLobbyLight = new THREE.PointLight(0xffd7ae, 72, 24, 2);
  warmLobbyLight.position.set(1, 3.6, 8);
  root.add(warmLobbyLight);
  const hallLights = [-19, 8, 35, 62, 89, 116].map((x) => {
    const light = new THREE.PointLight(0xffe7cf, 44, 27, 2);
    light.position.set(x, 3.7, 40.7);
    root.add(light);
    return light;
  });
  const approachLight = new THREE.PointLight(0xffdfc7, 52, 28, 2);
  approachLight.position.set(1, 3.7, 27);
  root.add(approachLight);

  batchBoxMeshes(root);
  let batchedMeshCount = 0;
  root.traverse((object) => {
    if (object.isMesh) batchedMeshCount += 1;
  });

  const groundHeight = (x, z) => {
    for (const auditorium of AUDITORIUMS) {
      const { bounds } = auditorium;
      if (x < bounds.xMin || x > bounds.xMax || z < bounds.zMin || z > bounds.zMax) continue;
      const centerX = (bounds.xMin + bounds.xMax) / 2;
      if (Math.abs(x - centerX) >= 0.64) return 0;

      const rowPitch = Math.min(1.75, (bounds.zMax - bounds.zMin - 5.1) / Math.max(1, auditorium.rows.length - 1));
      const rise = auditorium.preset === "large150" ? 0.26 : 0.23;
      const rowDirection = auditorium.screenSide === "north" ? -1 : 1;
      const entryDirection = -rowDirection;
      const firstRowZ = auditorium.screenSide === "north" ? bounds.zMax - 3.9 : bounds.zMin + 3.9;
      const backRowZ = firstRowZ + rowDirection * (auditorium.rows.length - 1) * rowPitch;
      const backTierHeight = (auditorium.rows.length - 1) * rise;
      const entryEdgeZ = auditorium.screenSide === "north" ? bounds.zMin : bounds.zMax;
      const rampStart = entryEdgeZ + entryDirection * 0.55;
      const rampEnd = backRowZ - entryDirection * rowPitch * 0.52;
      const rampLength = Math.max(1.2, Math.abs(rampEnd - rampStart));
      const entryProgress = (z - entryEdgeZ) * entryDirection;
      if (entryProgress >= 0 && entryProgress < 0.55) return 0;
      const rampProgress = (z - rampStart) * entryDirection;
      if (rampProgress >= 0 && rampProgress <= rampLength) {
        return backTierHeight * (rampProgress / rampLength);
      }

      const rowProgress = (z - firstRowZ) * rowDirection;
      if (rowProgress <= 0) return 0;
      return Math.min(backTierHeight, (rowProgress / rowPitch) * rise);
    }
    return 0;
  };

  const updateVisibility = (x, z) => {
    for (const { auditorium, group } of auditoriumGroups.values()) {
      const { bounds } = auditorium;
      group.visible = x >= bounds.xMin - 4
        && x <= bounds.xMax + 4
        && z >= bounds.zMin - 6
        && z <= bounds.zMax + 6;
    }
  };

  updateVisibility(1.5, -5.2);

  return {
    root,
    colliders,
    equipment,
    auditoriumGroups,
    groundHeight,
    updateVisibility,
    stats: Object.freeze({ auditoriumCount: AUDITORIUMS.length, seatCount, equipmentAnchors: equipment.size, meshCount: batchedMeshCount, sourceMeshCount: meshCount, lightCount: hallLights.length + 2 }),
  };
}
