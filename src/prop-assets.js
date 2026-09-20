import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const PROP_MODEL_NAMES = Object.freeze([
  "recliner", "shared_armrest", "trash_can", "toilet", "urinal", "sink", "sink_basin", "mirror", "paper_dispenser",
  "pos", "ticket_podium", "candy_display", "water_display", "popcorn_popper", "soda_fountain",
  "icee_machine", "cup_caddy", "drinking_fountain", "turbo_oven", "fryer", "grill", "bar_well",
  "storage_rack", "storage_box", "office_desk", "office_chair", "sanitizer", "stanchion",
  "counter_blue", "counter_white", "counter_wood", "stall_partition", "stall_door",
]);

function ownedResources(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
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

/**
 * Swap visual fixtures, preserving all world-owned collision / interaction data.
 * Each placement has {id, model, position:[x,y,z], rotationY?, scale:[x,y,z]?, size:[width,height,depth]?,
 * parent?:Object3D, fallback?:Object3D|Object3D[]}. Coordinates are local to parent
 * (root by default); model +Z faces the customer, with the base at floor height.
 * size fits measured bounds and anchors their bottom center to position. scale
 * retains the authored floor-relative origin (including shared armrest height).
 * Seats use separate recliner and shared_armrest placements to fit narrow rows.
 * One InstancedMesh per component / parent shares geometry and materials across
 * the whole library, while preserving existing auditorium visibility groups.
 */
export function createPropAssets({
  root,
  placements,
  url,
  loadModel = (source) => new GLTFLoader().loadAsync(source),
  onLoaded = () => {},
  onError = (error) => console.warn("Prop models unavailable; retaining existing fixtures.", error),
}) {
  let disposed = false;
  let releaseResources = () => {};
  const instances = [];
  const previousVisibility = new Map();

  const restoreFallbacks = () => {
    previousVisibility.forEach((visible, object) => { object.visible = visible; });
    previousVisibility.clear();
  };
  const clearInstances = () => {
    for (const mesh of instances) {
      mesh.removeFromParent();
      mesh.dispose(); // Instancing buffers only; shared geometry belongs to the library.
    }
    instances.length = 0;
  };

  const ready = (async () => {
    try {
      const { scene } = await loadModel(url);
      releaseResources = ownedResources(scene);
      if (disposed) {
        releaseResources();
        return false;
      }
      scene.updateMatrixWorld(true);
      const models = new Map();
      for (const name of new Set(placements.map((placement) => placement.model))) {
        const model = scene.getObjectByName(name);
        if (!PROP_MODEL_NAMES.includes(name) || !model) throw new Error(`Unknown prop model: ${name}`);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        if (!size.toArray().every((value) => Number.isFinite(value) && value > 0 && value < 8)) {
          throw new Error(`Invalid meter-scale bounds for ${name}`);
        }
        const inverse = model.matrixWorld.clone().invert();
        const components = [];
        model.traverse((mesh) => {
          if (!mesh.isMesh) return;
          components.push({ mesh, matrix: inverse.clone().multiply(mesh.matrixWorld) });
        });
        if (!components.length) throw new Error(`No renderable geometry in ${name}`);
        models.set(name, { components, size, bounds });
      }

      const buckets = new Map();
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const axisY = new THREE.Vector3(0, 1, 0);
      for (const placement of placements) {
        const parent = placement.parent ?? root;
        if (!parent?.isObject3D) throw new Error(`Missing parent for ${placement.id}`);
        const position = placement.position ?? [0, 0, 0];
        const model = models.get(placement.model);
        const scale = placement.size ? placement.size.map((value, index) => value / model.size.getComponent(index)) : placement.scale ?? [1, 1, 1];
        const rotationY = placement.rotationY ?? 0;
        if (position.length !== 3 || scale.length !== 3 || ![...position, ...scale, rotationY].every(Number.isFinite)
          || scale.some((value) => value <= 0)) throw new Error(`Invalid transform for ${placement.id}`);
        matrix.compose(new THREE.Vector3(...position), quaternion.setFromAxisAngle(axisY, rotationY), new THREE.Vector3(...scale));
        if (placement.size) {
          const center = model.bounds.getCenter(new THREE.Vector3());
          matrix.multiply(new THREE.Matrix4().makeTranslation(-center.x, -model.bounds.min.y, -center.z));
        }
        for (const component of model.components) {
          const key = `${parent.uuid}/${component.mesh.uuid}`;
          if (!buckets.has(key)) buckets.set(key, { parent, component, model: placement.model, transforms: [], ids: [] });
          const bucket = buckets.get(key);
          bucket.transforms.push(matrix.clone().multiply(component.matrix));
          bucket.ids.push(placement.id);
        }
      }
      for (const { parent, component, model, transforms, ids } of buckets.values()) {
        const batch = new THREE.InstancedMesh(component.mesh.geometry, component.mesh.material, transforms.length);
        batch.name = `blender-props-${model}-${component.mesh.name}`;
        batch.userData.propModel = model;
        batch.userData.placementIds = ids;
        batch.castShadow = !(Array.isArray(batch.material) ? batch.material : [batch.material]).some((material) => material.transparent);
        batch.receiveShadow = true;
        transforms.forEach((transform, index) => batch.setMatrixAt(index, transform));
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        parent.add(batch);
        instances.push(batch);
      }
      // Transactional replacement: hide nothing until every model/transform validated.
      for (const placement of placements) {
        const fallbacks = Array.isArray(placement.fallback) ? placement.fallback : [placement.fallback];
        for (const object of fallbacks) {
          if (!object) continue;
          if (!previousVisibility.has(object)) previousVisibility.set(object, object.visible);
          object.visible = false;
        }
      }
      onLoaded({ models: models.size, placements: placements.length, drawCalls: instances.length });
      return true;
    } catch (error) {
      clearInstances();
      restoreFallbacks();
      releaseResources();
      if (!disposed) onError(error);
      return false;
    }
  })();

  return {
    ready,
    instances,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInstances();
      restoreFallbacks();
      releaseResources();
    },
  };
}
