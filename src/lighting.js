import * as THREE from "three";
import { HALL_PLAN } from "./layout-data.js";
import { planToWorldX, worldToPlanX } from "./coordinates.js";

export const THEATER_LIGHTING = Object.freeze({
  lobby: Object.freeze({ hemisphere: 1.65, sun: 1.8, environment: 0.22 }),
  hall: Object.freeze({ hemisphere: 0.44, sun: 0.16, environment: 0.065 }),
  transitionMeters: 6,
  adaptationSeconds: 0.24,
  // Broad overlapping diffuser light, with the old average floor brightness.
  // The local range still bounds spill; the soft cutoff replaces point-source
  // inverse-square hotspots beneath each ceiling panel.
  downlight: Object.freeze({ color: 0xffd3a0, intensity: 1.69, distance: 10, angle: 1.30, penumbra: 0.30, decay: 0 }),
});

const smoothstep = (min, max, value) => {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
};
const featheredInterval = (value, min, max, feather) =>
  smoothstep(min - feather, min, value) * (1 - smoothstep(max, max + feather, value));

// Feather outside the actual hall, so its full walkable width has one calm
// ambient level. A six-meter approach/doorway transition avoids a lighting
// switch at a zone boundary while retaining the lobby and auditorium lighting.
export function sampleTheaterLighting(position) {
  const x = worldToPlanX(position.x);
  const feather = THEATER_LIGHTING.transitionMeters;
  const northEdge = THREE.MathUtils.lerp(
    HALL_PLAN.narrowNorthZ,
    HALL_PLAN.wideNorthZ,
    smoothstep(HALL_PLAN.transitionX - feather, HALL_PLAN.transitionX, x),
  );
  const hallWeight = featheredInterval(x, HALL_PLAN.narrow.xMin, HALL_PLAN.wide.xMax, feather)
    * featheredInterval(position.z, HALL_PLAN.southZ, northEdge, feather)
    * (1 - smoothstep(4.6, 8, position.y ?? 1.68));
  const profile = { hallWeight };
  for (const key of ["hemisphere", "sun", "environment"]) {
    profile[key] = THREE.MathUtils.lerp(THEATER_LIGHTING.lobby[key], THEATER_LIGHTING.hall[key], hallWeight);
  }
  return profile;
}

const fixtures = [];
for (const [section, bounds, offset] of [["narrow", HALL_PLAN.narrow, 6], ["wide", HALL_PLAN.wide, 3.62]]) {
  for (let x = bounds.xMin + offset; x <= bounds.xMax - 2; x += 12) {
    fixtures.push(Object.freeze({ id: `hall-${section}-downlight-${x}`, x, y: 4.405, z: (bounds.zMin + bounds.zMax) / 2 }));
  }
}
// The shortened west corridor otherwise leaves a 16 m fixture gap at the
// width transition. Bridge that gap without increasing the regular spacing.
const west = fixtures[0], next = fixtures[1];
fixtures.splice(1, 0, Object.freeze({ id: "hall-transition-downlight", x: (west.x + next.x) / 2,
  y: 4.405, z: (HALL_PLAN.narrow.zMin + HALL_PLAN.narrow.zMax) / 2 }));
export const HALL_DOWNLIGHTS = Object.freeze(fixtures);

// Fixed overlapping pools under the modeled ceiling fixtures. They do not
// cast shadows: the existing sun remains the only shadow map in the scene.
export function createHallLightPools({ parent }) {
  const lights = HALL_DOWNLIGHTS.map((fixture) => {
    const config = THEATER_LIGHTING.downlight;
    const light = new THREE.SpotLight(config.color, config.intensity, config.distance, config.angle, config.penumbra, config.decay);
    light.name = `${fixture.id}-pool`;
    light.position.set(planToWorldX(fixture.x), fixture.y, fixture.z);
    light.target.name = `${light.name}-target`;
    light.target.position.set(light.position.x, 0, fixture.z);
    parent.add(light, light.target);
    return light;
  });
  return {
    lights,
    dispose() {
      for (const light of lights) {
        light.removeFromParent();
        light.target.removeFromParent();
        light.dispose();
      }
    },
  };
}

// World-space position. Omitting delta snaps for initial views and teleports;
// supplying delta eases the spatial profile during ordinary walking.
export function createTheaterLighting({ scene }) {
  const previousEnvironmentIntensity = scene.environmentIntensity;
  const hemisphere = new THREE.HemisphereLight(0xdce8ff, 0x241414, THEATER_LIGHTING.lobby.hemisphere);
  hemisphere.name = "theater-ambient";
  const sun = new THREE.DirectionalLight(0xffead4, THEATER_LIGHTING.lobby.sun);
  sun.name = "theater-daylight";
  sun.position.set(-18, 28, -16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -33, right: 33, top: 36, bottom: -29, near: 0.5, far: 100 });
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.00015;
  scene.add(hemisphere, sun);
  scene.environmentIntensity = THEATER_LIGHTING.lobby.environment;
  let initialized = false;
  let disposed = false;
  const current = { hallWeight: 0, ...THEATER_LIGHTING.lobby };
  return {
    lights: { hemisphere, sun },
    update(position, delta) {
      if (disposed || !Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return;
      const target = sampleTheaterLighting(position);
      const alpha = !initialized || delta === undefined
        ? 1
        : 1 - Math.exp(-Math.max(0, Number.isFinite(delta) ? delta : 0) / THEATER_LIGHTING.adaptationSeconds);
      for (const key of Object.keys(current)) current[key] += (target[key] - current[key]) * alpha;
      initialized = true;
      hemisphere.intensity = current.hemisphere;
      sun.intensity = current.sun;
      scene.environmentIntensity = current.environment;
      return { ...current };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hemisphere.removeFromParent();
      sun.removeFromParent();
      hemisphere.dispose();
      sun.dispose();
      scene.environmentIntensity = previousEnvironmentIntensity;
    },
  };
}
