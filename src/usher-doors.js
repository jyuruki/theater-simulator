import * as THREE from "three";
import { AUDITORIUMS } from "./layout-data.js";
import { auditoriumDoorLayout } from "./auditorium-door-layout.js";
import { segmentHitsBox } from "./visit-state.js";

/** Manually operated auditorium doors; guests open them at the break. */
export function createUsherDoors({ scene, camera, collisionWorld, showToast = () => {}, storage }) {
  const root = new THREE.Group(); root.name = "usher-auditorium-doors"; scene.add(root);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const panel = new THREE.MeshStandardMaterial({ color: 0x30212a, roughness: .85 });
  const redPanel = new THREE.MeshStandardMaterial({ color: 0x971d2b, roughness: .74 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8c9c9, metalness: .65, roughness: .36 });
  let saved;
  try { saved = JSON.parse(storage?.getItem("mililani-doors-v22")); } catch {}
  const doors = AUDITORIUMS.map(room => {
    const spec = auditoriumDoorLayout(room);
    const { width, height, x, z } = spec;
    const previous = saved?.[room.id];
    const open = typeof previous?.open === "boolean" ? previous.open : true;
    const door = { ...spec,
      targetOpen: open, angle: open ? Math.PI / 2 : 0, startDue: Boolean(previous?.startDue), leaves: [] };
    for (const sign of spec.small ? [-1] : [-1, 1]) {
      const hinge = new THREE.Group(); hinge.name = `${room.id}-usher-door-${sign}`;
      const offset = sign * (width / 2 - (spec.small ? .065 : .15));
      hinge.position.set(x + Math.cos(spec.yaw) * offset, 0, z - Math.sin(spec.yaw) * offset); root.add(hinge);
      const leafWidth = spec.small ? width - .15 : width / 2 - .175, direction = -sign;
      const box = (name, position, size, mat) => {
        const mesh = new THREE.Mesh(geometry, mat); mesh.name = `${hinge.name}-${name}`;
        mesh.position.set(...position); mesh.scale.set(...size); hinge.add(mesh); return mesh;
      };
      box("panel", [direction * leafWidth / 2, height / 2, 0], [leafWidth, height - .10, .045], spec.small ? redPanel : panel);
      for (const side of [-1, 1]) box(`pushbar-${side}`, [direction * leafWidth * .6, 1.03, side * .04], [leafWidth * .55, .045, .045], metal);
      const colliders = Array.from({ length: 6 }, (_, i) => collisionWorld.addBox({
        id: `${hinge.name}-${i}`, minX: x, maxX: x + .1, minY: .05, maxY: height - .05,
        minZ: z, maxZ: z + .1, enabled: false,
      }));
      door.leaves.push({ hinge, direction, leafWidth, colliders });
    }
    return door;
  });
  const colliders = doors.flatMap(d => d.leaves.flatMap(l => l.colliders));
  const own = new Set(colliders);
  const look = new THREE.Vector3(), ray = new THREE.Ray();
  let focus = null, active = false;
  const save = () => { try { storage?.setItem("mililani-doors-v22", JSON.stringify(Object.fromEntries(doors.map(d => [d.id, { open: d.targetOpen, startDue: d.startDue }])))); } catch {} };
  function boxesAt(door, leaf, angle) {
    const theta = door.yaw - door.swing * leaf.direction * angle, cos = Math.cos(theta), sin = Math.sin(theta);
    const hx = Math.abs(cos) * leaf.leafWidth / 12 + Math.abs(sin) * .035;
    const hz = Math.abs(sin) * leaf.leafWidth / 12 + Math.abs(cos) * .035;
    return leaf.colliders.map((_, i) => {
      const lx = leaf.direction * leaf.leafWidth * (i + .5) / 6;
      const x = leaf.hinge.position.x + lx * cos, z = leaf.hinge.position.z - lx * sin;
      return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, minY: .05, maxY: door.height - .05 };
    });
  }
  function apply(door) {
    for (const leaf of door.leaves) {
      leaf.hinge.rotation.y = door.yaw - door.swing * leaf.direction * door.angle;
      boxesAt(door, leaf, door.angle).forEach((b, i) => Object.assign(leaf.colliders[i], b, { enabled: true }));
    }
  }
  function blocked(boxes) {
    const feet = camera.position.y - 1.68;
    for (const b of boxes) {
      const nx = THREE.MathUtils.clamp(camera.position.x, b.minX, b.maxX), nz = THREE.MathUtils.clamp(camera.position.z, b.minZ, b.maxZ);
      if (feet < b.maxY && camera.position.y > b.minY && Math.hypot(camera.position.x - nx, camera.position.z - nz) < .34) return true;
      if (collisionWorld.colliders.some(c => !own.has(c) && c.enabled !== false
        && b.maxX > c.minX + .003 && b.minX < c.maxX - .003 && b.maxZ > c.minZ + .003 && b.minZ < c.maxZ - .003
        && b.maxY > c.minY + .003 && b.minY < c.maxY - .003)) return true;
    }
    return false;
  }
  function findFocus() {
    focus = null; camera.getWorldDirection(look); ray.set(camera.position, look);
    for (const door of doors) {
      for (const leaf of door.leaves) {
        leaf.hinge.updateWorldMatrix(true, false);
        const point = leaf.hinge.localToWorld(new THREE.Vector3(leaf.direction * leaf.leafWidth * .65, 1.05, 0));
        const distance = camera.position.distanceTo(point), along = point.clone().sub(camera.position).dot(look);
        if (distance > 2.2 || along < 0 || ray.distanceToPoint(point) > .45 || distance >= (focus?.distance ?? Infinity)) continue;
        if (collisionWorld.colliders.some(c => !own.has(c) && c.enabled !== false && segmentHitsBox(camera.position, point, c))) continue;
        focus = { door, distance };
      }
    }
  }
  doors.forEach(apply);
  return {
    root, doors,
    update(delta, input = {}) {
      active = Boolean(input.active); if (!active) { focus = null; return; }
      const dt = Number.isFinite(delta) ? Math.min(.1, Math.max(0, delta)) : 0;
      for (const door of doors) {
        const goal = door.targetOpen ? Math.PI / 2 : 0;
        if (Math.abs(goal - door.angle) < .0001) continue;
        // Small angular substeps keep a door from tunneling into a person or can.
        const target = door.angle + THREE.MathUtils.clamp(goal - door.angle, -dt * 1.4, dt * 1.4);
        const steps = Math.max(1, Math.ceil(Math.abs(target - door.angle) / .025)), step = (target - door.angle) / steps;
        for (let i = 0; i < steps; i++) {
          if (blocked(door.leaves.flatMap(leaf => boxesAt(door, leaf, door.angle + step)))) break;
          door.angle += step;
        }
        apply(door);
        if (!door.targetOpen && door.angle < .002 && door.startDue) { door.startDue = false; save(); }
      }
      findFocus();
    },
    interact() {
      if (!active || !focus) return false;
      focus.door.targetOpen = !focus.door.targetOpen;
      showToast(`${focus.door.targetOpen ? "Opening" : "Closing"} Theater ${focus.door.number} doors. Keep the swing clear.`);
      save(); return true;
    },
    onBreak(id) { const d = doors.find(d => d.id === id); if (d) { d.targetOpen = true; d.startDue = false; save(); } },
    onStart(id) { const d = doors.find(d => d.id === id); if (d) { d.startDue = d.angle > .002; save(); } },
    get focusedPrompt() { return focus ? `${focus.door.targetOpen ? "Close" : "Open"} Theater ${focus.door.number} doors` : ""; },
    get focusDistance() { return focus?.distance ?? Infinity; },
    get due() { return doors.filter(d => d.startDue).map(d => d.number); },
    getSnapshot() { return doors.map(d => ({ id: d.id, angle: d.angle, targetOpen: d.targetOpen, startDue: d.startDue, center: [d.x, 1, d.z], route: d.route, single: d.small, handles: d.leaves.map(l => l.hinge.localToWorld(new THREE.Vector3(l.direction * l.leafWidth * .65, 1.05, 0)).toArray()) })); },
    dispose() { save(); root.removeFromParent(); colliders.forEach(c => collisionWorld.remove(c)); geometry.dispose(); panel.dispose(); redPanel.dispose(); metal.dispose(); },
  };
}
