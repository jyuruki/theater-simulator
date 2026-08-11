import assert from "node:assert/strict";

class FakeCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    const gradient = { addColorStop() {} };
    const context = {
      canvas: this,
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      measureText: (text) => ({ width: String(text).length * 12 }),
    };
    return new Proxy(context, {
      get(target, property) {
        if (property in target) return target[property];
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    });
  }
}

globalThis.OffscreenCanvas = FakeCanvas;

const THREE = await import("three");
const { planToWorldX } = await import("../src/coordinates.js");
const { createMaterialLibrary } = await import("../src/materials.js");
const { createMinimap } = await import("../src/minimap.js");
const { createTheaterWorld } = await import("../src/world.js");

const rendererStub = { capabilities: { getMaxAnisotropy: () => 4 } };
const materials = createMaterialLibrary(rendererStub);
const scene = new THREE.Scene();
const world = createTheaterWorld({ scene, materials });

assert.equal(world.stats.auditoriumCount, 14);
assert.equal(world.stats.seatCount, 1093);
assert.equal(world.stats.equipmentAnchors, 13);
assert.equal(world.stats.layoutVersion, "mililani-sketch-v4");
assert.ok(world.stats.meshCount > 0);
assert.ok(world.stats.colliderCount > 0);
assert.equal(world.auditoriumGroups.size, 14);
assert.equal(world.auditoriumLayouts.size, 14);

const t1 = world.auditoriumLayouts.get("theater-1");
const t1FrontHeight = world.groundHeight(planToWorldX(t1.sideAisles.west.centerX), t1.frontRowZ, 0);
const t1RearHeight = world.groundHeight(planToWorldX(t1.sideAisles.west.centerX), t1.backRowZ, 0);
assert.equal(t1FrontHeight, t1.frontElevation);
assert.equal(t1RearHeight, 0);

const t3 = world.auditoriumLayouts.get("theater-3");
const t3Ramp = t3.auditorium.entry.ramp.bounds;
const t3RampHeight = world.groundHeight(
  planToWorldX((t3Ramp.xMin + t3Ramp.xMax) / 2),
  (t3Ramp.zMin + t3Ramp.zMax) / 2,
  0,
);
assert.ok(Math.abs(t3RampHeight - 0.12) < 0.001);

const t6Storage = t3.auditorium.id && { x: 50, z: 68 };
assert.equal(world.groundHeight(planToWorldX(t6Storage.x), t6Storage.z, 0), 0);
assert.ok(world.groundHeight(planToWorldX(t6Storage.x), t6Storage.z, 3.1) > 2);

world.updateVisibility(planToWorldX(1.5), -6.8);
for (const { group } of world.auditoriumGroups.values()) assert.equal(group.visible, true, "Auditorium interiors must remain resident and visible.");
const minimap = createMinimap({ canvas: new FakeCanvas(700, 360) });
minimap.updatePlayer({ x: -2, z: 64, directionX: 1, directionZ: 0 });
minimap.draw();
minimap.destroy();
world.dispose();
materials.dispose();

console.log(
  `World smoke valid: ${world.stats.meshCount} runtime meshes · ${world.stats.instancedMeshCount} instanced · ${world.stats.colliderCount} colliders.`,
);
