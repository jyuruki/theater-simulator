import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seatTrayGeometry } from "./seat-tray-motion.js";
export const USHER_STATION = Object.freeze({ x: 24.3, y: 0, z: 54.7 });
export const USHER_SPAWN = Object.freeze({ position: [24.3, 0, 52.8], yaw: Math.PI });
export function createCleaningVisuals({ scene, world, hands }) {
  const root = new THREE.Group(); root.name = "usher-cleaning"; scene.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geo = g => (geometries.add(g), g);
  const mat = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const palette = { dark: mat({ color: 0x233532 }), teal: mat({ color: 0x377f78 }), cloth: mat({ color: 0x73bfd0 }),
    bristle: mat({ color: 0xd0ab63 }), metal: mat({ color: 0xb7c4c4, metalness: .7, roughness: .35 }),
    tray: mat({ color: 0x211918, roughness: .52 }), popcorn: mat({ color: 0xffdb83, roughness: .9 }) };
  const cube = geo(new THREE.BoxGeometry(1, 1, 1)), cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 8));
  const box = (parent, name, p, size, material) => {
    const m = new THREE.Mesh(cube, material); m.name = name; m.position.set(...p); m.scale.set(...size); m.receiveShadow = true; parent.add(m); return m;
  };
  const rod = (parent, p, length, material) => {
    const m = new THREE.Mesh(cylinder, material); m.position.set(...p); m.scale.set(.017, length, .017); parent.add(m); return m;
  };
  function tool(name, kind) {
    const g = new THREE.Group(); g.name = name; root.add(g);
    if (kind === "broom") {
      box(g, `${name}-head`, [0, .075, 0], [.40, .05, .10], palette.teal);
      for (let i = 0; i < 13; i++) box(g, `${name}-bristles-${i}`, [(i - 6) * .028, .028, 0], [.022, .054, .08], palette.bristle);
      rod(g, [0, .64, 0], 1.18, palette.metal); box(g, `${name}-grip`, [0, 1.24, 0], [.045, .19, .045], palette.teal);
    } else if (kind === "pan") {
      box(g, `${name}-tray`, [0, .027, 0], [.52, .035, .39], palette.teal);
      box(g, `${name}-back`, [0, .10, .19], [.52, .15, .023], palette.teal);
      for (const x of [-.25, .25]) box(g, `${name}-side`, [x, .08, .035], [.023, .10, .31], palette.teal);
      rod(g, [0, .58, .17], 1.10, palette.metal); box(g, `${name}-grip`, [0, 1.14, .17], [.14, .06, .04], palette.teal);
    } else box(g, name, [0, .012, 0], [.25, .022, .22], palette.cloth);
    g.visible = false; return g;
  }
  const tools = { broom: tool("usher-broom-held", "broom"), pan: tool("usher-pan-held", "pan"), cloth: tool("usher-cloth-held", "cloth") };
  const stored = { broom: tool("usher-broom-holstered", "broom"), pan: tool("usher-pan-holstered", "pan"), cloth: tool("usher-cloth-holstered", "cloth") };
  const belt = new THREE.Group(); belt.name = "usher-tool-belt"; root.add(belt);
  box(belt, "usher-belt-pouch", [.34, 0, 0], [.20, .27, .15], palette.dark);
  box(belt, "usher-cloth-pocket", [-.33, 0, 0], [.17, .20, .14], palette.teal);
  const makeCanvas = (w, h) => globalThis.OffscreenCanvas ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const lobes = [new THREE.IcosahedronGeometry(.027, 1), new THREE.IcosahedronGeometry(.024, 0).translate(.023, .008, .01), new THREE.IcosahedronGeometry(.021, 0).translate(-.02, -.004, -.006)];
  const kernelGeometry = geo(mergeGeometries(lobes)); lobes.forEach(g => g.dispose());
  const kernels = new THREE.InstancedMesh(kernelGeometry, palette.popcorn, 4096); kernels.name = "usher-popcorn"; kernels.count = 0; root.add(kernels);
  const kernelMatrix = new THREE.Matrix4(), kernelQuaternion = new THREE.Quaternion(), kernelEuler = new THREE.Euler();
  const kernelPosition = new THREE.Vector3(), kernelScale = new THREE.Vector3(1, 1, 1), pourPosition = new THREE.Vector3();
  const surfaces = new Map(), trays = new Map(), jobSeeds = new Map(), cleanGroups = new Map(), trayBatches = new Map(), supportBatches = new Map();
  function releaseSurface(entry) {
    if (!entry.mesh) return;
    entry.mesh.removeFromParent(); entry.texture.dispose(); textures.delete(entry.texture);
    entry.material.dispose(); materials.delete(entry.material);
    entry.mesh.geometry.dispose(); geometries.delete(entry.mesh.geometry);
    entry.mesh = entry.texture = entry.material = entry.context = null; entry.signature = "";
  }
  function ensureSurface(entry) {
    if (entry.mesh) return;
    const { surface } = entry;
    const canvas = makeCanvas(128, 128), context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); materials.add(material);
    const mesh = new THREE.Mesh(geo(new THREE.PlaneGeometry(surface.width, surface.depth)), material); mesh.rotation.x = -Math.PI / 2; entry.holder.add(mesh);
    Object.assign(entry, { mesh, texture, material, context });
  }
  let blenderSeats = false, assetChildren = -1;
  function ensure(state) {
    let changed = false;
    const childCount = (world.root?.children.length ?? 0) + [...(world.auditoriumGroups?.values() ?? [])].reduce((n, a) => n + a.group.children.length, 0);
    if (!blenderSeats && childCount !== assetChildren) {
      assetChildren = childCount;
      world.root?.traverse(o => { if (o.userData.propModel === "recliner") blenderSeats = true; });
    }
    for (const job of state.jobs) {
      if (jobSeeds.get(job.id) === job.seed) continue;
      changed = true;
      const old = cleanGroups.get(job.id); if (old) {
        old.removeFromParent(); for (const [id, entry] of surfaces) if (entry.job.id === job.id) {
          releaseSurface(entry); surfaces.delete(id);
        }
        for (const [id, entry] of trays) if (entry.job.id === job.id) trays.delete(id);
        trayBatches.get(job.id)?.dispose();
        supportBatches.get(job.id)?.dispose();
      }
      const group = new THREE.Group(); group.name = `${job.id}-cleaning`; root.add(group); cleanGroups.set(job.id, group); jobSeeds.set(job.id, job.seed);
      const batch = new THREE.InstancedMesh(cube, palette.tray, job.seats.length); batch.name = `${job.id}-moving-trays`; batch.receiveShadow = true;
      group.add(batch); trayBatches.set(job.id, batch);
      const supports = new THREE.InstancedMesh(cube, palette.metal, job.seats.length); supports.name = `${job.id}-tray-support-brackets`;
      group.add(supports); supportBatches.set(job.id, supports);
      for (const [index, seat] of job.seats.entries()) {
        const base = new THREE.Group(); base.position.set(seat.x, seat.floorY, seat.z); base.rotation.y = seat.forward > 0 ? 0 : Math.PI; group.add(base);
        const dimensions = seatTrayGeometry(seat.width);
        const hinge = new THREE.Group(); hinge.position.set(...dimensions.pivot); base.add(hinge);
        const trayMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...dimensions.offset), new THREE.Quaternion(), new THREE.Vector3(...dimensions.size));
        trays.set(seat.id, { base, hinge, seat, job, batch, index, trayMatrix, dimensions, angle: NaN });
        const support = new THREE.Matrix4().compose(new THREE.Vector3(dimensions.post[0], dimensions.pivot[1] - .032,
          (dimensions.post[2] + dimensions.pivot[2]) / 2), new THREE.Quaternion(),
        new THREE.Vector3(.034, .034, dimensions.pivot[2] - dimensions.post[2] + .025));
        base.updateMatrix(); supports.setMatrixAt(index, support.premultiply(base.matrix));
      }
      supports.instanceMatrix.needsUpdate = true; supports.computeBoundingSphere();
      for (const surface of job.surfaces) {
        const holder = new THREE.Group(); holder.name = surface.id;
        if (surface.kind === "tray") {
          const tray = trays.get(surface.seatId); tray.hinge.add(holder);
          holder.position.set(tray.dimensions.offset[0], tray.dimensions.size[1] / 2 + .004, tray.dimensions.offset[2]);
        } else group.add(holder);
        surfaces.set(surface.id, { surface, job, holder, group, mesh: null, signature: "" });
      }
    }
    if (changed) world.setCleaningSeatTrays?.(state.jobs.flatMap(j => j.seats.map(s => s.id)));
  }
  function prepare(state, camera) {
    ensure(state);
    for (const job of state.jobs) {
      const bounds = world.auditoriumGroups?.get(job.id)?.auditorium?.bounds;
      const xMin = bounds ? 3 - bounds.xMax : Math.min(...job.seats.map(s => s.x)) - 2;
      const xMax = bounds ? 3 - bounds.xMin : Math.max(...job.seats.map(s => s.x)) + 2;
      const zMin = bounds?.zMin ?? Math.min(...job.seats.map(s => s.z)) - 4;
      const zMax = bounds?.zMax ?? Math.max(...job.seats.map(s => s.z)) + 4;
      cleanGroups.get(job.id).visible = camera.position.x > xMin - 3 && camera.position.x < xMax + 3 && camera.position.z > zMin - 3 && camera.position.z < zMax + 3;
    }
  }
  function update(state, camera, visible = { broom: true, pan: true, cloth: true }, toolClear = () => true) {
    prepare(state, camera);
    const trayMatrix = new THREE.Matrix4(), changedBatches = new Set();
    for (const entry of trays.values()) {
      if (entry.angle === entry.seat.trayAngle) continue;
      entry.angle = entry.hinge.rotation.y = entry.seat.trayAngle; entry.base.updateMatrix(); entry.hinge.updateMatrix();
      trayMatrix.multiplyMatrices(entry.base.matrix, entry.hinge.matrix).multiply(entry.trayMatrix);
      entry.batch.setMatrixAt(entry.index, trayMatrix); changedBatches.add(entry.batch);
    }
    for (const batch of changedBatches) { batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); }
    for (const entry of surfaces.values()) {
      const { surface: s, job, holder } = entry;
      if (s.kind === "floor") holder.position.set(s.x, s.y, s.z);
      if (s.kind === "seat") {
        const seat = job.seatsById.get(s.seatId); holder.position.set(seat.x, seat.floorY + (blenderSeats ? .575 : .619), seat.z);
        holder.rotation.y = seat.forward > 0 ? 0 : Math.PI;
      }
      // Routine wipes have no fake spill overlay. Only nearby actual spills
      // allocate canvas textures; the remaining surface holders are ray targets.
      if (!entry.group.visible || !s.spill || s.cells.every(c => c.dirt <= .001)) { releaseSurface(entry); continue; }
      ensureSurface(entry);
      const c = entry.context, signature = s.cells.map(c => Math.round(c.dirt * 20)).join(",");
      if (signature !== entry.signature) {
        entry.signature = signature; c.clearRect(0, 0, 128, 128);
        let hash = 0; for (const letter of s.id) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
        const noise = i => Math.sin((hash % 8191) + i * 12.9898) * .5 + .5;
        c.globalCompositeOperation = "source-over";
        if (s.spill) {
          // One uneven puddle with a few droplets, independent of the contact
          // grid. Wiping erases its actual touched areas below.
          c.fillStyle = "rgba(89,43,15,.43)"; c.beginPath();
          for (let i = 0; i <= 28; i++) {
            const angle = i / 28 * Math.PI * 2;
            const radius = .78 + .11 * Math.sin(angle * 3 + noise(1) * 4) + .075 * Math.cos(angle * 7);
            const x = 64 + Math.cos(angle) * 54 * radius, y = 64 + Math.sin(angle) * 47 * radius;
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.closePath(); c.fill();
          for (let i = 0; i < 5; i++) {
            const angle = noise(i + 2) * Math.PI * 2;
            c.beginPath(); c.ellipse(64 + Math.cos(angle) * 51, 64 + Math.sin(angle) * 45, 2 + noise(i + 9) * 3, 1.5 + noise(i + 12) * 3, angle, 0, Math.PI * 2); c.fill();
          }
        } else {
          // A used surface need not have a visible spill. Faint, soft finger
          // smudges preserve that distinction without painting a task grid.
          for (let i = 0; i < 4; i++) {
            const x = 30 + noise(i + 4) * 68, y = 28 + noise(i + 7) * 70;
            c.save(); c.translate(x, y); c.rotate(noise(i + 5) * 2 - 1); c.scale(1, .26);
            const gradient = c.createRadialGradient(0, 0, 0, 0, 0, 25);
            gradient.addColorStop(0, "rgba(178,167,143,.075)"); gradient.addColorStop(1, "rgba(178,167,143,0)");
            c.fillStyle = gradient; c.fillRect(-26, -26, 52, 52); c.restore();
          }
        }
        c.globalCompositeOperation = "destination-out";
        for (const cell of s.cells) if (cell.dirt < .999) {
          const x = 64 + cell.x / s.width * 128, y = 64 + cell.z / s.depth * 128;
          const gradient = c.createRadialGradient(x, y, 10, x, y, 40);
          gradient.addColorStop(0, `rgba(0,0,0,${1 - cell.dirt})`); gradient.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gradient; c.fillRect(x - 40, y - 40, 80, 80);
        }
        c.globalCompositeOperation = "source-over";
        entry.texture.needsUpdate = true;
      }
      entry.mesh.visible = s.cells.some(c => c.dirt > .001);
    }
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x), yaw = Math.atan2(forward.x, forward.z), feet = camera.position.y - 1.68;
    belt.visible = state.kit; belt.position.copy(camera.position).addScaledVector(forward, .10); belt.position.y -= .88; belt.rotation.y = yaw;
    for (const [name, object] of Object.entries(stored)) {
      // Belt tools are stowed while carrying stock, waste or a rolling can.
      // Retracting those stored shafts as if they were held can otherwise
      // push them into the camera beside the actual carried object.
      object.visible = (!hands.owner || hands.owner === "cleaning")
        && (name === "cloth" ? state.heldTool !== "cloth" : state.heldTool !== "broom");
      if (state.kit) {
        object.position.copy(camera.position).addScaledVector(right, name === "pan" ? -.43 : .42).addScaledVector(forward, .08);
        object.position.y = name === "cloth" ? camera.position.y - .86 : feet + .14; object.rotation.set(0, yaw, name === "broom" ? -.12 : 0);
        object.scale.setScalar(name === "cloth" ? .85 : .72);
      } else { object.position.set(24.3 + (name === "broom" ? -.40 : name === "cloth" ? .4 : .10), name === "cloth" ? .85 : .23, 54.65); object.rotation.set(0, Math.PI, 0); object.scale.setScalar(1); }
      if (state.kit && object.visible) toolClear(object);
    }
    for (const name of ["broom", "pan", "cloth"]) tools[name].visible = hands.owner === "cleaning"
      && (name === "cloth" ? state.heldTool === "cloth" : state.heldTool === "broom") && visible[name];
    root.updateMatrixWorld(true);
    let index = 0, panIndex = 0;
    for (const job of state.jobs) for (const p of job.particles) {
      if (p.mode === "trash") continue;
      if (!["pan", "pouring"].includes(p.mode) && !cleanGroups.get(job.id).visible) continue;
      const position = kernelPosition.set(p.x, p.y, p.z);
      if (p.mode === "chair") { const seat = job.seatsById.get(p.seatId); p.y = seat.floorY + (blenderSeats ? .601 : .646); position.y = p.y; }
      if (["pan", "pouring"].includes(p.mode)) {
        const container = state.heldTool === "broom" ? tools.pan : stored.pan;
        if (!container.visible) continue;
        // Sequential packing stays linear even after cleaning several rows.
        // Searching the full pan for every kernel made a full pan quadratic.
        const i = panIndex++; position.set(((i % 7) - 3) * .055, .085 + Math.floor(i / 35) * .025, (Math.floor(i / 7) % 5 - 2) * .048); container.localToWorld(position);
        if (p.mode === "pouring" && state.pourTarget) {
          const t = Math.min(1, (.85 - state.pouring) / .7); position.lerp(pourPosition.fromArray(state.pourTarget.position), t); position.y += Math.sin(t * Math.PI) * .18;
        }
      }
      kernelQuaternion.setFromEuler(kernelEuler.set(index * .3, index, index * .7));
      kernelMatrix.compose(position, kernelQuaternion, kernelScale); kernels.setMatrixAt(index++, kernelMatrix);
    }
    kernels.count = index; kernels.instanceMatrix.needsUpdate = true; kernels.computeBoundingSphere();
  }
  return { root, tools, stored, belt, surfaces, trays, ensure, prepare, update,
    dispose() { root.removeFromParent(); world.setCleaningSeatTrays?.([]); kernels.dispose(); trayBatches.forEach(b => b.dispose()); supportBatches.forEach(b => b.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); },
  };
}
