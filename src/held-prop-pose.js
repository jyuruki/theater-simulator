import * as THREE from "three";
import { segmentHitsBox } from "./visit-state.js";

const overlaps = (a, b, gap) => b.enabled !== false && a.max.x > b.minX - gap && a.min.x < b.maxX + gap
  && a.max.y > b.minY - gap && a.min.y < b.maxY + gap && a.max.z > b.minZ - gap && a.min.z < b.maxZ + gap;

/** Keep a carried prop in the world: shorten the reach, then slide along contact.
 * Call after assigning its desired pose. This changes visuals, never the work
 * target; callers must still validate cleaning/pouring contact independently. */
export function resolveHeldPose({ object, camera, colliders, anchor, ignoreIds = [], padding = .008 }) {
  const ignored = new Set(ignoreIds), blockers = colliders.filter(c => c.enabled !== false && !ignored.has(c.id));
  const desired = object.position.clone(), box = new THREE.Box3();
  const measure = () => { object.updateWorldMatrix(true, true); box.setFromObject(object); };
  const hits = () => blockers.filter(c => overlaps(box, c, padding));
  measure();
  const home = anchor?.clone() ?? camera.position.clone().add(new THREE.Vector3(0, -.42, 0));
  const localMin = box.min.clone().sub(desired), localMax = box.max.clone().sub(desired);
  const blockedPath = blockers.some(c => segmentHitsBox(home, desired, {
    minX: c.minX - localMax.x - padding, maxX: c.maxX - localMin.x + padding,
    minY: c.minY - localMax.y - padding, maxY: c.maxY - localMin.y + padding,
    minZ: c.minZ - localMax.z - padding, maxZ: c.maxZ - localMin.z + padding,
  }));
  if (!blockedPath && !hits().length) { object.visible = true; return { clear: true, contact: false, position: object.position.clone() }; }
  // Begin on the player's side, not the desired endpoint: an otherwise-clear
  // endpoint can be on the far side of a thin wall.
  object.position.copy(home); measure();
  // A wall alongside the player can overlap even the retracted pose. Resolve
  // that contact sideways rather than hiding the object or teleporting it away.
  for (let pass = 0; pass < 8; pass++) {
    const contacts = hits(); if (!contacts.length) break;
    const c = contacts[0];
    const shifts = [
      new THREE.Vector3(c.minX - padding - .003 - box.max.x, 0, 0), new THREE.Vector3(c.maxX + padding + .003 - box.min.x, 0, 0),
      new THREE.Vector3(0, 0, c.minZ - padding - .003 - box.max.z), new THREE.Vector3(0, 0, c.maxZ + padding + .003 - box.min.z),
      new THREE.Vector3(0, c.minY - padding - .003 - box.max.y, 0), new THREE.Vector3(0, c.maxY + padding + .003 - box.min.y, 0),
    ].sort((a, b) => a.lengthSq() - b.lengthSq());
    const shift = shifts.find(v => {
      const candidate = box.clone().translate(v);
      return !blockers.some(other => other !== c && overlaps(candidate, other, padding * .5));
    }) ?? shifts[0];
    object.position.add(shift); measure();
  }
  const safe = object.position.clone();
  if (!hits().length) {
    const direction = desired.clone().sub(safe), distance = direction.length();
    if (distance > .001) {
      direction.divideScalar(distance);
      const sweep = new THREE.Ray(safe, direction), hit = new THREE.Vector3(); let reach = distance;
      for (const c of blockers) {
        const expanded = new THREE.Box3(new THREE.Vector3(c.minX - localMax.x - padding, c.minY - localMax.y - padding, c.minZ - localMax.z - padding),
          new THREE.Vector3(c.maxX - localMin.x + padding, c.maxY - localMin.y + padding, c.maxZ - localMin.z + padding));
        if (sweep.intersectBox(expanded, hit)) reach = Math.min(reach, Math.max(0, safe.distanceTo(hit) - .012));
      }
      object.position.copy(safe).addScaledVector(direction, reach); measure();
    }
  }
  object.visible = true;
  return { clear: !hits().length, contact: true, position: object.position.clone() };
}
