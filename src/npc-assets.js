import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const NPC_VARIANTS = Object.freeze([
  "NPC_Visitor_01", "NPC_Visitor_02", "NPC_Visitor_03",
  "NPC_Staff_01", "NPC_Staff_02", "NPC_Staff_03",
]);

function ownResources(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    textures.forEach((resource) => resource.dispose());
    materials.forEach((resource) => resource.dispose());
    geometries.forEach((resource) => resource.dispose());
  };
}

function characterFrom(scene, name) {
  const source = scene.getObjectByName(name);
  if (!source) throw new Error(`Missing NPC variant ${name}.`);
  const visual = source.clone(true);
  visual.position.set(0, 0, 0);
  visual.rotation.set(0, 0, 0);
  visual.scale.set(1, 1, 1);
  const limbs = [-1, 1].map((side) => {
    const suffix = side < 0 ? "L" : "R";
    const arm = visual.getObjectByName(`${name}_Arm_${suffix}`);
    const leg = visual.getObjectByName(`${name}_Leg_${suffix}`);
    if (!arm?.isMesh || !leg?.isMesh) throw new Error(`Missing ${name} articulated limbs.`);
    return { arm, leg, side };
  });
  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  const size = bounds.getSize(new THREE.Vector3());
  if (![...size.toArray(), bounds.min.y].every(Number.isFinite)
      || Math.abs(bounds.min.y) > 0.03 || size.y < 1.6 || size.y > 1.85
      || size.x < 0.35 || size.x > 0.72 || size.z > 0.48) {
    throw new Error(`NPC ${name} violates its meter-scale character envelope.`);
  }
  visual.traverse((object) => {
    if (!object.isMesh) return;
    // Static world shadow maps must not retain a walking person's old silhouette.
    object.castShadow = false;
    object.receiveShadow = true;
  });
  return { visual, limbs };
}

/** Swap all six visual bodies atomically; actor roots/colliders/routes stay owned by the crowd. */
export function createNpcAssets({
  actors,
  url = `${import.meta.env?.BASE_URL ?? "/"}models/theater-npcs.glb`,
  loadModel = (source) => new GLTFLoader().loadAsync(source),
  onLoaded = () => {},
  onError = (error) => console.warn("NPC models unavailable; retaining theater people.", error),
}) {
  let disposed = false;
  let releaseResources = () => {};
  const replacements = [];
  function restore() {
    for (const { actor, visual } of replacements) {
      visual.removeFromParent();
      actor.fallback.visible = true;
      actor.limbs = actor.fallbackLimbs;
    }
    replacements.length = 0;
  }
  const ready = (async () => {
    try {
      const { scene } = await loadModel(url);
      releaseResources = ownResources(scene);
      if (disposed) {
        releaseResources();
        return { status: "disposed", actorCount: 0 };
      }
      if (actors.length !== NPC_VARIANTS.length) throw new Error("The NPC asset expects six theater actors.");
      const prepared = actors.map((actor, index) => ({ actor, ...characterFrom(scene, NPC_VARIANTS[index]) }));
      for (const replacement of prepared) {
        const { actor, visual, limbs } = replacement;
        actor.group.add(visual);
        actor.fallback.visible = false;
        actor.limbs = limbs;
        replacements.push(replacement);
      }
      onLoaded();
      return { status: "ready", actorCount: replacements.length };
    } catch (error) {
      restore();
      releaseResources();
      if (!disposed) onError(error);
      return { status: disposed ? "disposed" : "fallback", actorCount: disposed ? 0 : actors.length };
    }
  })();
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      restore();
      releaseResources();
    },
  };
}
