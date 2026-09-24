import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AUDITORIUMS } from "../src/layout-data.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { createCinemaMedia } from "../src/cinema-media.js";
import { planToWorldX } from "../src/coordinates.js";

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; this.transforms = []; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({ canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      setTransform: (...values) => this.transforms.push(values),
      measureText: (text) => ({ width: String(text).length * 12 }),
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
  }
}
globalThis.OffscreenCanvas = CanvasStub;
const close = (actual, expected, label, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} != ${expected}`);
const scene = new THREE.Scene();
const materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
const bytes = await readFile(new URL("../public/models/theater-props.glb", import.meta.url));
assert.equal(await world.loadPropAssets({
  loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""),
  onError(error) { throw error; },
}), true, "Sightline tests require the actual imported recliners");
const media = createCinemaMedia({ scene, world, materials });
scene.updateMatrixWorld(true);
const meshes = [];
world.root.traverse((object) => {
  if (!object.isMesh) return;
  for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
  meshes.push(object);
});
const ray = new THREE.Raycaster();
let seatedRays = 0, headComparisons = 0, shellRays = 0, apronBoundaryRays = 0, minimumHeadClearance = Infinity;
// Explicit sightline model, not a guarantee for every body size/posture.
const seatedEyeHeight = 1.25;
const occupiedHeadTop = 1.40;
for (const auditorium of AUDITORIUMS) {
  const layout = world.auditoriumLayouts.get(auditorium.id);
  const screen = world.root.getObjectByName(`${auditorium.id}-screen`);
  const bounds = new THREE.Box3().setFromObject(screen);
  const width = bounds.max.x - bounds.min.x, height = bounds.max.y - bounds.min.y;
  close(bounds.min.y - layout.frontElevation, 1.8, `${auditorium.id}: person-height bottom`);
  close(width / height, 1.6, `${auditorium.id}: taller image aspect`);
  assert.ok(width > (layout.bowlBounds.xMax - layout.bowlBounds.xMin) * .92, `${auditorium.id}: image fills unobstructed bowl width`);
  const wallInnerMin = planToWorldX(auditorium.bounds.xMax) + .09;
  const wallInnerMax = planToWorldX(auditorium.bounds.xMin) - .09;
  assert.ok(bounds.min.x - .125 > wallInnerMin && bounds.max.x + .125 < wallInnerMax,
    `${auditorium.id}: the complete frame must clear both side walls`);
  assert.ok(bounds.max.y + .17 + .18 <= layout.presentation.ceilingUnderside + 1e-6,
    `${auditorium.id}: full top frame and clearance fit below ceiling`);
  const canvas = screen.material.map.image;
  close(canvas.width / canvas.height, width / height, `${auditorium.id}: projected content has no aspect stretch`);
  const [scaleX, , , scaleY] = canvas.transforms.at(-1);
  close(scaleX, scaleY, `${auditorium.id}: pre-show artwork uses a uniform drawing scale`);
  const forward = auditorium.screenSide === "north" ? 1 : -1;
  const screenWallZ = auditorium.screenSide === "north" ? auditorium.bounds.zMax - .095 : auditorium.bounds.zMin + .095;
  const leftApronX = layout.routeReserve?.side === "west" ? layout.bowlBounds.xMin + .15 : auditorium.bounds.xMin + .095;
  const rightApronX = layout.routeReserve?.side === "east" ? layout.bowlBounds.xMax - .15 : auditorium.bounds.xMax - .095;
  const apronProbes = [];
  // Five millimetres inside each wall face: these rays detect the old 11 cm
  // screen-wall slit and the free-side margin exposed by the raised image.
  for (let index = 0; index <= 20; index++) {
    apronProbes.push({ x: leftApronX + (rightApronX - leftApronX) * index / 20,
      z: screenWallZ, y: layout.frontElevation });
  }
  for (const side of ["west", "east"]) {
    if (layout.routeReserve?.side === side) continue;
    for (const fraction of [.03, .25, .5, .75]) {
      apronProbes.push({ x: side === "west" ? leftApronX : rightApronX,
        z: layout.frontRowZ + (screenWallZ - layout.frontRowZ) * fraction, y: layout.frontElevation });
    }
  }
  if (layout.routeReserve) apronProbes.push({
    x: (layout.routeReserve.bounds.xMin + layout.routeReserve.bounds.xMax) / 2,
    z: screenWallZ, y: layout.entryCross?.elevation ?? layout.frontElevation,
  });
  for (const probe of apronProbes) {
    ray.set(new THREE.Vector3(planToWorldX(probe.x), probe.y + .08, probe.z), new THREE.Vector3(0, -1, 0));
    ray.near = .001; ray.far = .12;
    const hit = ray.intersectObjects(meshes, false)[0];
    assert.ok(hit, `${auditorium.id}: floor/wall seam remains at ${probe.x},${probe.z}`);
    close(hit.point.y, probe.y, `${auditorium.id}: apron edge is physically closed`);
    close(world.groundHeight(planToWorldX(probe.x), probe.z, probe.y), probe.y,
      `${auditorium.id}: extended apron sampler agrees with its floor`);
    apronBoundaryRays++;
  }
  const roomMeshes = meshes.filter((mesh) => mesh.parent?.name === `${auditorium.id}-interior`
    || !/^theater-\d+-interior$/.test(mesh.parent?.name ?? ""));
  const placements = world.propPlacements.filter(({ id, model }) => model === "recliner" && id.startsWith(`${auditorium.id}-`));
  for (const seat of placements) {
    const rowIndex = Number(seat.id.split("-").at(-2));
    const row = layout.rows[rowIndex];
    const eye = new THREE.Vector3(seat.position[0], row.elevation + seatedEyeHeight, row.z + forward * .05);
    // Probe the whole image from EVERY seat, including the extreme corners,
    // not merely the center. The dense vertical sweep catches thin low-route
    // roofs crossing the middle of the image from back-row side seats.
    const targets = [];
    for (const xFraction of [0, .25, .5, .75, 1]) {
      for (let yIndex = 0; yIndex <= 20; yIndex++) {
        targets.push({ x: bounds.min.x + .01 + (width - .02) * xFraction,
          // Offset the exact grid intersections off the plane's triangle seam.
          y: bounds.min.y + .01031 + (height - .02) * yIndex / 20 });
      }
    }
    for (const target of targets) {
      const end = new THREE.Vector3(target.x, target.y, screen.position.z);
      const direction = end.clone().sub(eye);
      ray.set(eye, direction.clone().normalize());
      ray.near = .005;
      ray.far = direction.length() + .005;
      const hit = ray.intersectObjects(roomMeshes, false)[0];
      assert.ok(hit?.object === screen, `${seat.id}: image ${end.toArray()} is occluded by ${hit?.object.name ?? "a missing screen"} at ${hit?.point.toArray()}`);
      seatedRays++;
      // A conservative continuous head-height envelope across every row ahead
      // also checks heads even where the actual seats are staggered in X.
      for (const ahead of layout.rows.slice(0, rowIndex)) {
        const fraction = (ahead.z + forward * .05 - eye.z) / (end.z - eye.z);
        const lineY = eye.y + (end.y - eye.y) * fraction;
        const clearance = lineY - (ahead.elevation + occupiedHeadTop);
        minimumHeadClearance = Math.min(minimumHeadClearance, clearance);
        assert.ok(clearance > 0, `${seat.id}: occupied row ${ahead.label} blocks the lower screen (${clearance}m)`);
        headComparisons++;
      }
    }
  }
  // Probe actual raised roofs and every upper shell direction, above all old
  // roof elevations. This catches a raised roof with an unchanged wall/header.
  const centerZ = (layout.frontRowZ + layout.backRowZ) / 2;
  const highOrigin = new THREE.Vector3(planToWorldX(layout.centerX), layout.presentation.ceilingUnderside - .12, centerZ);
  for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)]) {
    ray.set(highOrigin, direction);
    ray.near = .001;
    ray.far = direction.y ? .2 : Math.max(auditorium.bounds.xMax - auditorium.bounds.xMin, auditorium.bounds.zMax - auditorium.bounds.zMin);
    const hit = ray.intersectObjects(meshes, false)[0];
    assert.ok(hit, `${auditorium.id}: upper shell must be enclosed in direction ${direction.toArray()}`);
    if (direction.y) {
      close(hit.point.y, layout.presentation.ceilingUnderside, `${auditorium.id}: actual raised roof underside`);
      close(world.ceilingHeight(highOrigin.x, centerZ, highOrigin.y - 1.68), hit.point.y, `${auditorium.id}: high roof sampler agrees with mesh`);
    }
    shellRays++;
  }
}
// Existing lower route/storage roofs must win over the raised full shell.
for (const [id, x, z, expected] of [
  ["T3 side route", -5.5, 84, 4.55],
  ["T6 long route", 39.45, 75, 3.38],
  ["T7 side route", 58.35, 75, 4.85],
  ["T8 side route", 76.15, 75, 4.85],
]) {
  ray.set(new THREE.Vector3(planToWorldX(x), 1.7, z), new THREE.Vector3(0, 1, 0));
  ray.near = .001; ray.far = 4;
  const hit = ray.intersectObjects(meshes, false)[0];
  assert.ok(hit, `${id}: preserved roof must remain rendered`);
  close(hit.point.y, expected, `${id}: lower roof preserved`);
  close(world.ceilingHeight(planToWorldX(x), z, 0), hit.point.y, `${id}: actual lower roof wins in sampler`);
}
media.dispose();
world.dispose();
materials.dispose();
console.log(`Screen audit valid: all 14 images at front floor +1.80m; 1.60:1 unstretched content; ${seatedRays} full-image actual-GLB seated sightlines; ${headComparisons} occupied-row checks (minimum ${(minimumHeadClearance * 100).toFixed(1)}cm clearance); ${shellRays} upper shell/roof rays; ${apronBoundaryRays} sealed apron/wall boundary rays; low entrance roofs retained.`);
