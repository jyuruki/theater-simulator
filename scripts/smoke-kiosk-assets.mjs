import assert from "node:assert/strict";
import * as THREE from "three";
import { createKioskAssets } from "../src/kiosk-assets.js";

function fixture() {
  const scene = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(0.72, 1.6, 0.9);
  const body = new THREE.Mesh(geometry, material);
  body.name = "Cabinet";
  body.position.y = 0.8;
  const screenGeometry = new THREE.PlaneGeometry(0.53, 0.8);
  const screen = new THREE.Mesh(screenGeometry, material);
  screen.name = "KioskScreen";
  screen.position.set(0, 1.135, 0.461);
  scene.add(body, screen);
  const disposals = { texture: 0, material: 0, geometry: 0, screenGeometry: 0 };
  for (const [name, resource] of Object.entries({ texture, material, geometry, screenGeometry })) {
    resource.addEventListener("dispose", () => { disposals[name]++; });
  }
  return { scene, disposals };
}

function world() {
  const root = new THREE.Group();
  const screenTexture = new THREE.Texture();
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture });
  let screenDisposals = 0;
  let screenTextureDisposals = 0;
  screenMaterial.addEventListener("dispose", () => { screenDisposals++; });
  screenTexture.addEventListener("dispose", () => { screenTextureDisposals++; });
  const kiosks = [-0.9, 0.55, 2, 3.45].map((z, index) => {
    const fallback = new THREE.Group();
    root.add(fallback);
    return { id: `ticket-kiosk-${index + 1}`, fallback, screenMaterial,
      position: new THREE.Vector3(-11.61, 0, z) };
  });
  return { root, kiosks, get screenDisposals() { return screenDisposals; },
    get screenTextureDisposals() { return screenTextureDisposals; } };
}

const shared = fixture();
const host = world();
let resolveLoad;
let refreshes = 0;
const asset = createKioskAssets({ ...host, url: "fixture.glb",
  loadModel: () => new Promise((resolve) => { resolveLoad = resolve; }),
  onLoaded: () => { refreshes++; },
});
assert.ok(host.kiosks.every(({ fallback }) => fallback.visible), "Keep all fallbacks while loading.");
resolveLoad(shared);
assert.equal(await asset.ready, true);
assert.equal(refreshes, 1, "Refresh static shadows after the visual replacement.");
assert.ok(host.kiosks.every(({ fallback }) => !fallback.visible));
const replacements = host.root.children.filter(({ name }) => name.endsWith("-asset"));
assert.equal(replacements.length, 4);
const body = replacements[0].getObjectByName("Cabinet");
assert.equal(body.geometry, replacements[3].getObjectByName("Cabinet").geometry);
assert.equal(body.material, replacements[3].getObjectByName("Cabinet").material);
host.root.updateMatrixWorld(true);
const gltfDisplay = replacements[0].getObjectByName("KioskScreen").material;
let displayDisposals = 0;
let displayTextureDisposals = 0;
gltfDisplay.addEventListener("dispose", () => { displayDisposals++; });
gltfDisplay.map.addEventListener("dispose", () => { displayTextureDisposals++; });
for (const [index, replacement] of replacements.entries()) {
  const screen = replacement.getObjectByName("KioskScreen");
  const fallbackDisplay = host.kiosks[index].screenMaterial;
  assert.equal(screen.material, gltfDisplay, "All four imported screens share one display material.");
  assert.notEqual(screen.material, fallbackDisplay);
  assert.notEqual(screen.material.map, fallbackDisplay.map);
  assert.equal(screen.material.map.source, fallbackDisplay.map.source, "Share canvas pixels without duplicating the display.");
  assert.equal(screen.material.map.flipY, false, "The display follows glTF's V convention.");
  assert.equal(fallbackDisplay.map.flipY, true, "The fallback plane retains its original texture orientation.");
  const position = screen.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(position.x - (-11.61 + 0.461)) < 1e-6, "Screen faces the customer aisle.");
  assert.ok(Math.abs(position.y - 1.135) < 1e-6);
  assert.ok(Math.abs(position.z - host.kiosks[index].position.z) < 1e-6);
}
asset.dispose();
asset.dispose();
assert.deepEqual(shared.disposals, { texture: 1, material: 1, geometry: 1, screenGeometry: 1 });
assert.equal(host.screenDisposals, 0, "Borrowed display materials are owned by the world.");
assert.equal(host.screenTextureDisposals, 0, "The original screen texture is owned by the world.");
assert.equal(displayDisposals, 1);
assert.equal(displayTextureDisposals, 1);
assert.equal(host.root.children.length, 4);

const lateFixture = fixture();
const lateHost = world();
let finishLate;
const lateAsset = createKioskAssets({ ...lateHost,
  loadModel: () => new Promise((resolve) => { finishLate = resolve; }),
});
lateAsset.dispose();
finishLate(lateFixture);
assert.equal(await lateAsset.ready, false, "A disposed world cannot receive a late asset.");
assert.equal(lateHost.root.children.length, 4);
assert.deepEqual(lateFixture.disposals, { texture: 1, material: 1, geometry: 1, screenGeometry: 1 });

const failureHost = world();
let failures = 0;
const failed = createKioskAssets({ ...failureHost,
  loadModel: async () => { throw new Error("Offline"); },
  onError: () => { failures++; },
});
assert.equal(await failed.ready, false);
assert.equal(failures, 1);
assert.ok(failureHost.kiosks.every(({ fallback }) => fallback.visible));

const invalid = fixture();
invalid.scene.getObjectByName("KioskScreen").name = "MissingScreen";
const invalidAsset = createKioskAssets({ ...world(), loadModel: async () => invalid, onError() {} });
assert.equal(await invalidAsset.ready, false);
assert.deepEqual(invalid.disposals, { texture: 1, material: 1, geometry: 1, screenGeometry: 1 });

console.log("Kiosk asset smoke valid: shared clones, live screens, load fallback, and safe async disposal.");
