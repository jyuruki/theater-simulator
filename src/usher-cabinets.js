import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AUDITORIUMS } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";
import { segmentHitsBox } from "./visit-state.js";

export const USHER_CABINET_SIZE = Object.freeze({ width: 1.70, height: 2.15, depth: .66 });
const STORAGE_KEY = "mililani-cabinets-v27";

/** Recessed equipment closet and tray/trash return, with independent hinges. */
export function createUsherCabinets({ scene, camera, collisionWorld, storage, showToast = () => {} }) {
  const root = new THREE.Group(); root.name = "usher-service-cabinets"; scene.add(root);
  const materials = {
    black: new THREE.MeshStandardMaterial({ color: 0x171817, roughness: .69 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x93958f, roughness: .43, metalness: .73 }),
    gray: new THREE.MeshStandardMaterial({ color: 0x434642, roughness: .80 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe1bc32, roughness: .85 }),
  };
  const geometries = [], colliders = [];
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY)) ?? {}; } catch {}
  function builder(parent) {
    const parts = Object.fromEntries(Object.keys(materials).map(key => [key, []]));
    const add = (material, geometry) => parts[material].push(geometry);
    return {
      box(material, x, y, z, sx, sy, sz, rz = 0) {
        const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateZ(rz); g.translate(x, y, z); add(material, g);
      },
      cylinder(material, x, y, z, radius, height, open = false) {
        const g = new THREE.CylinderGeometry(radius, radius, height, 16, 1, open); g.translate(x, y, z); add(material, g);
      },
      add,
      finish() {
        for (const [material, list] of Object.entries(parts)) {
          if (!list.length) continue;
          const flat = list.map(g => g.index ? g.toNonIndexed() : g);
          const g = mergeGeometries(flat); geometries.push(g);
          list.forEach(g => g.dispose()); flat.forEach(g => g.dispose());
          const mesh = new THREE.Mesh(g, materials[material]); mesh.name = `${parent.name}-${material}`; parent.add(mesh);
        }
      },
    };
  }
  function worldBox(object, center, size) {
    object.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...center), new THREE.Vector3(...size));
    bounds.applyMatrix4(object.matrixWorld);
    return { minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y, maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z };
  }
  function collider(object, id, center, size) {
    const c = collisionWorld.addBox({ id, ...worldBox(object, center, size) }); colliders.push(c); return c;
  }
  const cabinets = AUDITORIUMS.filter(room => room.entry.serviceCabinet).map(room => {
    const spec = room.entry.serviceCabinet;
    const group = new THREE.Group(); group.name = `${room.id}-service-cabinet`;
    group.position.set(planToWorldX(spec.x), spec.y ?? 0, spec.z); group.rotation.y = spec.yaw; root.add(group);
    const art = builder(group), solid = [];
    function shell(name, position, size, material = "black") {
      art.box(material, ...position, ...size);
      solid.push(collider(group, `${group.name}-${name}`, position, size));
    }
    shell("left-side", [-.827, 1.075, 0], [.046, 2.15, .66]);
    shell("right-side", [.827, 1.075, 0], [.046, 2.15, .66]);
    shell("divider", [-.20, 1.075, 0], [.038, 2.15, .66]);
    shell("back", [0, 1.075, -.311], [1.61, 2.15, .038]);
    shell("top", [0, 2.127, 0], [1.61, .046, .66]);
    shell("base", [0, .035, 0], [1.61, .07, .66]);
    // The upper tray shelf occupies the rear half, leaving a clear drop in front.
    shell("tray-shelf", [.306, 1.62, -.145], [.966, .028, .305], "metal");
    shell("closet-shelf", [-.512, 1.59, -.16], [.588, .025, .28], "metal");
    art.box("metal", .306, 1.74, -.286, .966, .71, .014);
    // A real circular aperture in the worktop, rather than a black disc.
    const countertop = new THREE.Shape();
    countertop.moveTo(-.483, -.295); countertop.lineTo(.483, -.295); countertop.lineTo(.483, .295); countertop.lineTo(-.483, .295); countertop.closePath();
    const aperture = new THREE.Path(); aperture.absarc(0, 0, .145, 0, Math.PI * 2, true); countertop.holes.push(aperture);
    const counter = new THREE.ExtrudeGeometry(countertop, { depth: .03, bevelEnabled: false, curveSegments: 24 });
    counter.rotateX(-Math.PI / 2); counter.translate(.306, 1.10, .005); art.add("black", counter);
    const rim = new THREE.TorusGeometry(.145, .01, 6, 24); rim.rotateX(Math.PI / 2); rim.translate(.306, 1.137, .005); art.add("metal", rim);
    solid.push(collider(group, `${group.name}-trash-counter`, [.306, 1.115, .005], [.966, .03, .59]));
    // Open-topped gray can, visible through the hole and lower service door.
    art.cylinder("gray", .306, .55, 0, .25, .90, true);
    art.cylinder("black", .306, .109, 0, .245, .018);
    const canRim = new THREE.TorusGeometry(.25, .022, 6, 24); canRim.rotateX(Math.PI / 2); canRim.translate(.306, 1, 0); art.add("gray", canRim);
    for (let tray = 0; tray < 2; tray++) {
      const y = 1.66 + tray * .035;
      art.box("metal", .31, y, -.14, .55, .012, .26);
      for (const side of [-1, 1]) {
        art.box("metal", .31 + side * .269, y + .012, -.14, .012, .025, .26);
        art.box("metal", .31, y + .012, -.14 + side * .124, .55, .025, .012);
      }
    }
    // Two distinct stored broom/dustpan kits, with handle clearance in front of
    // the half-depth closet shelf, as in the reference cabinet.
    for (let kit = 0; kit < 2; kit++) {
      const x = -.665 + kit * .295, z = .095;
      art.box("black", x, .155, z, .235, .075, .095);
      art.box("yellow", x, .10, z, .23, .04, .083);
      art.cylinder("yellow", x, .88, z, .013, 1.43);
      art.box("black", x + .015, .078, -.08, .23, .025, .25);
      art.box("black", x + .015, .16, -.195, .23, .16, .024);
      for (const side of [-1, 1]) art.box("black", x + .015 + side * .105, .13, -.08, .019, .09, .25);
      art.cylinder("black", x + .015, .785, -.19, .014, 1.29);
      art.box("black", x + .015, 1.44, -.19, .11, .032, .036);
    }
    art.finish();
    const doors = [
      { id: "closet", label: "broom closet", hx: -.798, direction: 1, width: .577, height: 2.02, bottom: .076 },
      { id: "trash", label: "trash access", hx: .798, direction: -1, width: .959, height: 1.005, bottom: .076 },
    ].map(spec => {
      const hinge = new THREE.Group(); hinge.name = `${group.name}-${spec.id}-door`; hinge.position.set(spec.hx, 0, .316); group.add(hinge);
      const leaf = builder(hinge), x = spec.direction * spec.width / 2;
      leaf.box("black", x, spec.bottom + spec.height / 2, 0, spec.width, spec.height, .035);
      for (const y of [spec.bottom + .14, spec.bottom + spec.height - .14]) leaf.box("metal", spec.direction * .018, y, .027, .034, .06, .015);
      const handle = [spec.direction * (spec.width - .068), Math.min(1.03, spec.bottom + spec.height - .1), .04];
      leaf.box("metal", ...handle, .024, .105, .022); leaf.finish();
      const door = { ...spec, hinge, handle, angle: 0, targetOpen: Boolean(saved[room.id]?.[spec.id]), colliders: [] };
      door.angle = door.targetOpen ? Math.PI * .53 : 0;
      hinge.rotation.y = -spec.direction * door.angle;
      door.colliders = Array.from({ length: 6 }, (_, i) => collider(hinge, `${hinge.name}-${i}`,
        [spec.direction * spec.width * (i + .5) / 6, spec.bottom + spec.height / 2, 0], [spec.width / 6, spec.height, .044]));
      return door;
    });
    return { id: room.id, number: room.number, group, solid, doors };
  });
  const save = () => { try { storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cabinets.map(c => [c.id, Object.fromEntries(c.doors.map(d => [d.id, d.targetOpen]))])))); } catch {} };
  let active = false, focus = null;
  const look = new THREE.Vector3(), ray = new THREE.Ray();
  function leafBounds(door) {
    return door.colliders.map((_, i) => worldBox(door.hinge,
      [door.direction * door.width * (i + .5) / 6, door.bottom + door.height / 2, 0], [door.width / 6, door.height, .044]));
  }
  function blocked(boxes, own) {
    for (const b of boxes) {
      const px = THREE.MathUtils.clamp(camera.position.x, b.minX, b.maxX), pz = THREE.MathUtils.clamp(camera.position.z, b.minZ, b.maxZ);
      if (camera.position.y - 1.68 < b.maxY && camera.position.y > b.minY && Math.hypot(camera.position.x - px, camera.position.z - pz) < .32) return true;
      if (collisionWorld.colliders.some(c => c.enabled !== false && !own.has(c)
        && b.maxX > c.minX + .005 && b.minX < c.maxX - .005 && b.maxZ > c.minZ + .005 && b.minZ < c.maxZ - .005
        && b.maxY > c.minY + .005 && b.minY < c.maxY - .005)) return true;
    }
    return false;
  }
  return {
    root, cabinets,
    update(delta, input = {}) {
      active = Boolean(input.active); focus = null; if (!active) return;
      const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, .1) : 0;
      for (const cabinet of cabinets) for (const door of cabinet.doors) {
        const goal = door.targetOpen ? Math.PI * .53 : 0;
        if (Math.abs(goal - door.angle) > .0001) {
          const step = THREE.MathUtils.clamp(goal - door.angle, -dt * 1.5, dt * 1.5);
          const own = new Set([...cabinet.solid, ...door.colliders]);
          const steps = Math.max(1, Math.ceil(Math.abs(step) / .025));
          for (let i = 0; i < steps; i++) {
            door.hinge.rotation.y = -door.direction * (door.angle + step / steps);
            const boxes = leafBounds(door);
            if (blocked(boxes, own)) { door.hinge.rotation.y = -door.direction * door.angle; break; }
            door.angle += step / steps;
            boxes.forEach((b, index) => Object.assign(door.colliders[index], b));
          }
        }
      }
      camera.getWorldDirection(look); ray.set(camera.position, look);
      for (const cabinet of cabinets) for (const door of cabinet.doors) {
        door.hinge.updateWorldMatrix(true, false);
        const point = door.hinge.localToWorld(new THREE.Vector3(...door.handle));
        const distance = camera.position.distanceTo(point);
        const offAim = ray.distanceToPoint(point), score = offAim * 3 + distance * .05;
        if (distance > 2.2 || score >= (focus?.score ?? Infinity) || point.clone().sub(camera.position).dot(look) < 0 || offAim > .30) continue;
        if (collisionWorld.colliders.some(c => c.enabled !== false && !door.colliders.includes(c) && segmentHitsBox(camera.position, point, c))) continue;
        focus = { cabinet, door, distance, score };
      }
    },
    interact() {
      if (!active || !focus) return false;
      focus.door.targetOpen = !focus.door.targetOpen; save();
      showToast(`${focus.door.targetOpen ? "Opening" : "Closing"} the ${focus.door.label}.`); return true;
    },
    get focusedPrompt() { return focus ? `${focus.door.targetOpen ? "Close" : "Open"} ${focus.door.label}` : ""; },
    get focusDistance() { return focus?.distance ?? Infinity; },
    getSnapshot() {
      return cabinets.map(c => ({ id: c.id, number: c.number, position: c.group.position.toArray(), yaw: c.group.rotation.y,
        size: USHER_CABINET_SIZE, kits: 2, trayShelfDepth: .305, trashApertureRadius: .145,
        stand: c.group.localToWorld(new THREE.Vector3(0, 0, 1.6)).toArray(),
        doors: c.doors.map(d => { d.hinge.updateWorldMatrix(true, false); return { id: d.id, angle: d.angle, targetOpen: d.targetOpen, handle: d.hinge.localToWorld(new THREE.Vector3(...d.handle)).toArray() }; }) }));
    },
    dispose() { save(); root.removeFromParent(); colliders.forEach(c => collisionWorld.remove(c)); geometries.forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); },
  };
}
