import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function resourceDisposer(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  };
}

function validateKiosk(scene) {
  const screens = [];
  scene.traverse((object) => {
    if (object.name === "KioskScreen" && object.isMesh) screens.push(object);
  });
  if (screens.length !== 1) throw new Error("The kiosk asset needs one KioskScreen mesh.");
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  if (![...size.toArray(), bounds.min.y].every(Number.isFinite)
    || Math.abs(bounds.min.y) > 0.02 || size.x < 0.65 || size.x > 0.85
    || size.y < 1.5 || size.y > 1.7 || size.z < 0.8 || size.z > 1.05) {
    throw new Error("The kiosk asset does not match the meter-scale fixture envelope.");
  }
}

/** Load visual replacements only; the authored collision and interaction data stay in the world. */
export function createKioskAssets({
  root,
  kiosks,
  url,
  loadModel = (source) => new GLTFLoader().loadAsync(source),
  onLoaded = () => {},
  onError = (error) => console.warn("Kiosk model unavailable; retaining the existing fixtures.", error),
}) {
  let disposed = false;
  let releaseResources = () => {};
  const instances = [];
  const displayMaterials = new Map();

  const gltfDisplay = (source) => {
    if (!displayMaterials.has(source)) {
      const material = source.clone();
      // glTF UVs use the opposite V convention from the fallback PlaneGeometry.
      // Own the texture wrapper while sharing its canvas; leave the fallback intact.
      if (source.map) {
        material.map = source.map.clone();
        material.map.flipY = false;
        material.map.needsUpdate = true;
      }
      displayMaterials.set(source, material);
    }
    return displayMaterials.get(source);
  };

  const releaseAllResources = () => {
    releaseResources();
    for (const material of displayMaterials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    displayMaterials.clear();
  };

  const ready = (async () => {
    try {
      const { scene } = await loadModel(url);
      // Capture ownership before borrowing the world's live display material.
      releaseResources = resourceDisposer(scene);
      if (disposed) {
        releaseAllResources();
        return false;
      }
      validateKiosk(scene);
      for (const kiosk of kiosks) {
        const instance = new THREE.Group();
        instance.name = `${kiosk.id}-asset`;
        instance.position.copy(kiosk.position);
        // The GLB faces +Z; the kiosk bank faces +X in the reflected world.
        instance.rotation.y = Math.PI / 2;
        const visual = scene.clone(true);
        visual.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = object.name !== "KioskScreen";
          object.receiveShadow = true;
          if (object.name === "KioskScreen") object.material = gltfDisplay(kiosk.screenMaterial);
        });
        instance.add(visual);
        instances.push(instance);
      }
      root.add(...instances);
      kiosks.forEach(({ fallback }) => { fallback.visible = false; });
      onLoaded();
      return true;
    } catch (error) {
      instances.forEach((instance) => instance.removeFromParent());
      kiosks.forEach(({ fallback }) => { fallback.visible = true; });
      releaseAllResources();
      if (!disposed) onError(error);
      return false;
    }
  })();

  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      instances.forEach((instance) => instance.removeFromParent());
      kiosks.forEach(({ fallback }) => { fallback.visible = true; });
      releaseAllResources();
    },
  };
}
