import assert from "node:assert/strict";
import * as THREE from "three";
import { AUDITORIUMS, HALL_PLAN } from "../src/layout-data.js";
import { planToWorldX } from "../src/coordinates.js";
import { createTheaterLighting, sampleTheaterLighting, HALL_DOWNLIGHTS } from "../src/lighting.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";

const position = (x, z, y = 1.68) => new THREE.Vector3(planToWorldX(x), y, z);
const lobby = position(1, 8);
const hall = position(38, 58.85);
const lobbyProfile = sampleTheaterLighting(lobby);
const hallProfile = sampleTheaterLighting(hall);
assert.equal(lobbyProfile.hallWeight, 0);
assert.equal(hallProfile.hallWeight, 1);
for (const key of ["hemisphere", "sun", "environment"]) {
  assert.ok(hallProfile[key] > 0, `${key}: hall must retain usable fill`);
  assert.ok(hallProfile[key] < lobbyProfile[key] * 0.4, `${key}: the hall needs materially lower uniform fill`);
  assert.equal(sampleTheaterLighting(position(38, 80))[key], lobbyProfile[key], `${key}: a deep auditorium retains its lighting`);
  assert.equal(sampleTheaterLighting(position(38, 58.85, 9))[key], lobbyProfile[key], `${key}: upstairs is outside the hall profile`);
}
// Continuous route through approach, hall and north doorway. No discrete
// zone switch or brighter stripe along the narrow/wide hall seam.
let continuitySamples = 0;
for (const x of [-26, -13.62, 5.8, 38, 100]) {
  let previous = sampleTheaterLighting(position(x, 40));
  for (let z = 40.02; z < 76; z += 0.02) {
    const next = sampleTheaterLighting(position(x, z));
    for (const key of ["hemisphere", "sun", "environment"]) {
      assert.ok(Number.isFinite(next[key]) && Math.abs(next[key] - previous[key]) < 0.01, `Lighting seam at ${x}, ${z}: ${key}`);
    }
    previous = next;
    continuitySamples++;
  }
}
for (let x = HALL_PLAN.narrow.xMin; x < HALL_PLAN.wide.xMax; x += 0.25) {
  assert.equal(sampleTheaterLighting(position(x, 57.6)).hallWeight, 1, "Whole hall centerline uses the same low ambient profile");
}

const scene = new THREE.Scene();
scene.environmentIntensity = 0.37;
const lighting = createTheaterLighting({ scene });
lighting.update(lobby);
assert.equal(lighting.lights.hemisphere.intensity, lobbyProfile.hemisphere);
lighting.update(hall, 1 / 60);
assert.ok(lighting.lights.hemisphere.intensity < lobbyProfile.hemisphere && lighting.lights.hemisphere.intensity > hallProfile.hemisphere);
for (let i = 1; i < 60; i++) lighting.update(hall, 1 / 60);
const oneSecond60Hz = lighting.lights.hemisphere.intensity;
lighting.update(lobby);
for (let i = 0; i < 30; i++) lighting.update(hall, 1 / 30);
assert.ok(Math.abs(lighting.lights.hemisphere.intensity - oneSecond60Hz) < 1e-12, "Adaptation must not depend on frame rate");
lighting.update(hall);
assert.equal(lighting.lights.hemisphere.intensity, hallProfile.hemisphere, "Review camera changes snap to their correct profile");
assert.equal(scene.environmentIntensity, hallProfile.environment);

class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() {
    const gradient = { addColorStop() {} };
    return new Proxy({ canvas: this, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      measureText: text => ({ width: String(text).length * 12 }),
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    }, { get: (object, key) => object[key] ?? (() => {}) });
  }
}
globalThis.OffscreenCanvas = CanvasStub;
const materials = createMaterialLibrary({ capabilities: { getMaxAnisotropy: () => 4 } });
const world = createTheaterWorld({ scene, materials });
scene.updateMatrixWorld(true);
const pools = [];
world.root.traverse(object => { if (object.isSpotLight) pools.push(object); });
assert.equal(pools.length, HALL_DOWNLIGHTS.length);
assert.ok(pools.length <= 12, "Hall lighting must keep a bounded light budget");
for (const fixture of HALL_DOWNLIGHTS) {
  const mesh = world.root.getObjectByName(fixture.id);
  const pool = world.root.getObjectByName(`${fixture.id}-pool`);
  assert.ok(mesh?.isMesh && pool?.isSpotLight, `${fixture.id}: light source must align to a visible fixture`);
  assert.equal(pool.position.x, mesh.position.x);
  assert.equal(pool.position.z, mesh.position.z);
  assert.ok(pool.position.y < mesh.position.y && pool.position.y > 4.2, "Light source must be below its opaque diffuser");
  assert.equal(pool.target.position.y, 0);
  assert.equal(pool.target.position.x, pool.position.x);
  assert.equal(pool.target.position.z, pool.position.z);
  assert.equal(pool.castShadow, false, "Downlights must not allocate shadow maps");
  assert.ok(pool.color.r > pool.color.g && pool.color.g > pool.color.b, "Warm light pools");
  assert.ok(pool.distance <= 10, "Local pools must not illuminate the whole hall");
}
let shadowLights = 0;
scene.traverse(object => { if (object.isLight && object.castShadow) shadowLights++; });
assert.equal(shadowLights, 1, "The existing sun remains the only shadow-casting light");

// Irradiance on a horizontal floor, using Three's spotlight cone/distance
// attenuation. This catches a return to long-range uniform hall fill even
// if the light type and fixture count remain unchanged.
function floorIrradiance(point) {
  return pools.reduce((sum, pool) => {
    const distance = point.distanceTo(pool.position);
    const incidence = pool.position.y / distance;
    const cone = THREE.MathUtils.smoothstep(incidence, Math.cos(pool.angle), Math.cos(pool.angle * (1 - pool.penumbra)));
    const cutoff = Math.max(0, 1 - (distance / pool.distance) ** 4) ** 2;
    return sum + pool.intensity * cone * cutoff * incidence / Math.max(distance ** pool.decay, 0.01);
  }, 0);
}
const centerPool = pools.find(pool => Math.abs(pool.position.x - planToWorldX(38)) < 0.01);
assert.ok(centerPool);
const underFixture = new THREE.Vector3(centerPool.position.x, 0, centerPool.position.z);
const betweenFixtures = underFixture.clone().add(new THREE.Vector3(-6, 0, 0));
const poolIrradiance = floorIrradiance(underFixture);
const gapIrradiance = floorIrradiance(betweenFixtures);
assert.ok(poolIrradiance > 2 && poolIrradiance > gapIrradiance * 5, "Bright pools and darker intervals must be measurably distinct");
assert.ok(hallProfile.hemisphere >= 0.3, "Intervals retain sufficient ambient fill for navigation");
const theaterSigns = AUDITORIUMS.map(room => world.root.getObjectByName(`${room.id}-sign`));
assert.ok(theaterSigns.every(sign => sign?.isMesh && sign.material?.map));
assert.ok(theaterSigns.every(sign => sign.material.isMeshBasicMaterial), "Wayfinding remains readable independently of dimmed ambient light");

world.dispose();
assert.ok(pools.every(pool => !pool.parent && !pool.target.parent), "World disposal releases all local light objects");
lighting.dispose();
lighting.dispose();
assert.equal(scene.environmentIntensity, 0.37);
assert.ok(!lighting.lights.hemisphere.parent && !lighting.lights.sun.parent);
lighting.update(lobby);
assert.equal(scene.environmentIntensity, 0.37, "Disposed lighting cannot mutate the scene");
materials.dispose();
console.log(`Lighting smoke passed: ${continuitySamples} transition samples; ${pools.length} warm fixture pools; floor irradiance ${poolIrradiance.toFixed(2)} vs ${gapIrradiance.toFixed(2)} between fixtures; one shadow light.`);
