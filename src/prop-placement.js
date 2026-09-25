import * as THREE from "three";
import { segmentHitsBox } from "./visit-state.js";

const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);

/** Feet/base coordinates are persisted, not the floating center of the ghost. */
export function findPlacementTarget({ camera, world, colliders, size, maxReach = 2.6, ignoreIds = [] }) {
  const ignored = new Set(ignoreIds), blockers = colliders.filter(c => c.enabled !== false && !ignored.has(c.id));
  const look = camera.getWorldDirection(new THREE.Vector3()), origin = camera.position;
  const horizontal = new THREE.Vector3(look.x, 0, look.z).normalize();
  if (horizontal.lengthSq() < .1) horizontal.set(0, 0, -1);
  const feet = origin.y - 1.68, ray = new THREE.Ray(origin, look);
  const groundProbe = new THREE.Vector3(origin.x + horizontal.x * 1.35, 0, origin.z + horizontal.z * 1.35);
  let position = groundProbe, support = null;
  if (look.y < -.12) {
    const plane = new THREE.Plane(up, -feet), hit = ray.intersectPlane(plane, new THREE.Vector3());
    if (hit && Math.hypot(hit.x - origin.x, hit.z - origin.z) <= maxReach) position = hit;
  }
  let nearest = maxReach + .6;
  for (const c of blockers) {
    if (c.maxY > origin.y + .08 || c.maxY < feet + .08) continue;
    const hit = ray.intersectBox(new THREE.Box3(new THREE.Vector3(c.minX, c.minY, c.minZ), new THREE.Vector3(c.maxX, c.maxY, c.maxZ)), new THREE.Vector3());
    if (!hit || Math.abs(hit.y - c.maxY) > .012 || origin.distanceTo(hit) >= nearest) continue;
    nearest = origin.distanceTo(hit); position = hit; support = c;
  }
  position = position.clone();
  const ground = world.groundHeight(position.x, position.z, feet);
  if (!support) position.y = ground;
  const fail = reason => ({ valid: false, position, reason, supportId: support?.id ?? null });
  if (!Number.isFinite(position.y)) { position.y = feet; return fail("Aim at a floor or a clear work surface"); }
  if (Math.hypot(position.x - origin.x, position.z - origin.z) > maxReach) return fail("Move closer to place this");
  const hx = size[0] / 2, hz = size[2] / 2;
  if (support) {
    if (position.x - hx < support.minX + .01 || position.x + hx > support.maxX - .01
      || position.z - hz < support.minZ + .01 || position.z + hz > support.maxZ - .01) return fail("The whole item needs support");
  } else {
    // Ray-test the actual floor as well as the walk-height function, which can
    // return a fallback height outside the building. Four corners reject steps.
    const floorRay = new THREE.Raycaster();
    for (const dx of [-hx, hx]) for (const dz of [-hz, hz]) {
      const x = position.x + dx, z = position.z + dz;
      const y = world.groundHeight(x, z, position.y);
      if (!Number.isFinite(y) || Math.abs(y - position.y) > .035) return fail("Find an even patch of floor");
      if (world.root) {
        floorRay.set(new THREE.Vector3(x, position.y + .12, z), down); floorRay.near = .001; floorRay.far = .20;
        const hit = floorRay.intersectObject(world.root, true)[0];
        if (!hit || Math.abs(hit.point.y - position.y) > .04) return fail("The whole item needs support");
      }
    }
  }
  const center = position.clone().add(new THREE.Vector3(0, size[1] / 2 + .008, 0));
  if (blockers.some(c => c !== support && position.x + hx > c.minX + .003 && position.x - hx < c.maxX - .003
    && position.z + hz > c.minZ + .003 && position.z - hz < c.maxZ - .003
    && position.y + size[1] > c.minY + .005 && position.y + .009 < c.maxY - .003)) return fail("This spot is blocked");
  if (blockers.some(c => c !== support && segmentHitsBox(origin, center, c))) return fail("A wall or object is in the way");
  return { valid: true, position, reason: "Click or E to place · Q cancels", supportId: support?.id ?? null };
}

export function createPlacementPreview({ scene, camera, world, getColliders }) {
  const root = new THREE.Group(); root.name = "physical-item-placement-preview"; root.visible = false; scene.add(root);
  const fill = new THREE.MeshBasicMaterial({ color: 0x69dfb9, transparent: true, opacity: .20, depthWrite: false });
  const line = new THREE.LineBasicMaterial({ color: 0x9affe0, transparent: true, opacity: .9, depthWrite: false });
  let active = false, spec = null, result = null, geometry = null, edges = null;
  function clear() { root.clear(); geometry?.dispose(); edges?.dispose(); }
  function update() {
    if (!active) return null;
    result = findPlacementTarget({ camera, world, colliders: getColliders(), ...spec });
    root.position.copy(result.position).add(new THREE.Vector3(0, spec.size[1] / 2 + .008, 0));
    fill.color.set(result.valid ? 0x69dfb9 : 0xee685b); line.color.set(result.valid ? 0x9affe0 : 0xffa18c);
    root.visible = true; return result;
  }
  function cancel() { const was = active; active = false; root.visible = false; result = null; return was; }
  return { root, update, cancel,
    begin(value) {
      spec = value; active = true; clear();
      geometry = spec.shape === "round" ? new THREE.CylinderGeometry(spec.size[0] / 2, spec.size[0] / 2, spec.size[1], 20)
        : new THREE.BoxGeometry(...spec.size);
      edges = new THREE.EdgesGeometry(geometry); root.add(new THREE.Mesh(geometry, fill), new THREE.LineSegments(edges, line));
      update(); return true;
    },
    confirm() { update(); if (!result?.valid) return null; const point = result.position.clone(); cancel(); return point; },
    get active() { return active; },
    get snapshot() { return { active, valid: Boolean(active && result?.valid), position: result?.position.toArray() ?? null, reason: result?.reason ?? "", supportId: result?.supportId ?? null }; },
    dispose() { cancel(); clear(); root.removeFromParent(); fill.dispose(); line.dispose(); },
  };
}
