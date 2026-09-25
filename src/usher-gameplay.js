import * as THREE from "three";
import { segmentHitsBox } from "./visit-state.js";
import { resolveHeldPose } from "./held-prop-pose.js";
import { createCleaningPlans } from "./usher-cleaning-layout.js";
import { createCleaningVisuals, USHER_STATION, USHER_SPAWN } from "./usher-cleaning-visuals.js";
import { createUsherState, restoreUsherState, serializeUsherState, usherSummary, theaterSummary, seatStage,
  beginCleaningBreak, closeCleaningTray, stepUsherState, beginUsherPour, USHER_STEP } from "./usher-state.js";
export { USHER_STATION, USHER_SPAWN };
export const USHER_TRASH = Object.freeze({ x: 20.106, y: 1.01, z: 53.32 });
const STORAGE_KEY = "v22-cleaning";
const clamp = THREE.MathUtils.clamp;
const point = p => ({ x: p.x, y: p.y, z: p.z });

export function createUsherGameplay({ scene, world, camera, collisionWorld, showToast = () => {}, onSound = () => {}, storage,
  hands = { owner: null }, getBinTargets = () => [{ id: "theater-2-trash", position: [20.106, 1.01, 53.32], radius: .4, ignoreColliderId: "theater-2-trash" }],
  depositTrash = (_id, count) => count, schedule = null }) {
  const plans = createCleaningPlans(world);
  let state;
  try { state = restoreUsherState(storage?.getItem(STORAGE_KEY), plans); } catch { state = createUsherState(); }
  const visuals = createCleaningVisuals({ scene, world, hands }), { root, tools, stored } = visuals;
  const look = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), ray = new THREE.Ray();
  let disposed = false, active = false, focus = null, target = null, smooth = null, previous = null, phase = 0, accumulator = 0, saveTimer = 0;
  let contactPose = null;
  const visible = { broom: true, pan: true, cloth: true }, announced = new Set(state.jobs.filter(j => j.completed).map(j => `${j.id}/${j.seed}`));
  const save = () => { try { storage?.setItem(STORAGE_KEY, serializeUsherState(state)); } catch { /* Optional private-mode storage. */ } };
  function clearSegment(a, b, ignoreId = null, radius = 0) {
    return !(collisionWorld?.colliders ?? []).some(c => {
      if (c.enabled === false || c.id === ignoreId) return false;
      return segmentHitsBox(a, b, radius ? { ...c, minX: c.minX - radius, maxX: c.maxX + radius, minZ: c.minZ - radius, maxZ: c.maxZ + radius } : c);
    });
  }
  function resolveTool(object, ignoreId = null) {
    const anchor = camera.position.clone(); anchor.y -= object.name.includes("cloth") ? .58 : 1.50;
    const result = resolveHeldPose({ object, camera, anchor, colliders: collisionWorld?.colliders ?? [], ignoreIds: ignoreId ? [ignoreId] : [], padding: .002 });
    return result.clear && !result.contact;
  }
  function canMove(a, b, particle, ignoreId = null) {
    const y = particle?.y ?? a.y ?? target?.point.y ?? 0;
    return clearSegment({ x: a.x, y: y + .055, z: a.z }, { x: b.x, y: y + .055, z: b.z }, ignoreId, .025);
  }
  function frontOfSeat(seat) {
    const front = (camera.position.z - seat.z) * seat.forward;
    return front > .45 && front < 1.85 && Math.abs(camera.position.x - seat.x) < 1.05 && Math.abs(camera.position.y - 1.68 - seat.floorY) < .44;
  }
  function findSurface() {
    let result = null, nearest = 2.45;
    for (const entry of visuals.surfaces.values()) {
      if (!entry.group.visible) continue;
      const s = entry.surface, seat = s.seatId && entry.job.seatsById.get(s.seatId);
      if (seat && !frontOfSeat(seat)) continue;
      entry.holder.updateWorldMatrix(true, false);
      const local = ray.clone().applyMatrix4(entry.holder.matrixWorld.clone().invert());
      if (local.direction.y >= -.08) continue;
      const distance = -local.origin.y / local.direction.y;
      if (distance <= 0) continue;
      const p = local.at(distance, new THREE.Vector3());
      if (Math.abs(p.x) > s.width / 2 + .035 || Math.abs(p.z) > s.depth / 2 + .035) continue;
      const worldPoint = entry.holder.localToWorld(p.clone()), d = camera.position.distanceTo(worldPoint);
      if (d < nearest && clearSegment(camera.position, worldPoint, seat?.rowColliderId)) {
        nearest = d; result = { kind: s.kind, point: worldPoint, local: p, surface: s, entry, seat, job: entry.job, ignoreId: seat?.rowColliderId };
      }
    }
    return result;
  }
  function findFloor() {
    const broom = state.heldTool === "broom";
    if (look.y >= (broom ? .12 : -.18)) return null;
    const feet = camera.position.y - 1.68;
    const horizontal = Math.hypot(look.x, look.z); if (horizontal < .001) return null;
    // The broom reaches the floor ahead of a slightly lowered gaze instead of
    // demanding that the camera ray itself hit a tiny patch beside the feet.
    const reach = clamp(1.68 * horizontal / Math.max(.05, -look.y), .08, broom ? 2.2 : 1.8);
    const p = new THREE.Vector3(camera.position.x + look.x / horizontal * reach, feet, camera.position.z + look.z / horizontal * reach);
    const y = world.groundHeight(p.x, p.z, feet);
    p.y = y;
    const job = state.jobs.find(j => { const b = plans.find(p => p.id === j.id).bounds; return p.x > b.xMin && p.x < b.xMax && p.z > b.zMin && p.z < b.zMax; });
    if (!job || Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > (broom ? 2.21 : 1.81)
      || !clearSegment(camera.position, new THREE.Vector3(p.x, y + .045, p.z))) return null;
    return { kind: "floor", point: p, job, ignoreId: null };
  }
  function refreshFocus() {
    camera.getWorldDirection(look); ray.set(camera.position, look); focus = null;
    if (state.heldTool === "broom") for (const bin of getBinTargets()) {
      const p = new THREE.Vector3(...bin.position);
      if (camera.position.distanceTo(p) < 2.3 && ray.distanceToPoint(p) < (bin.radius ?? .4)
        && p.clone().sub(camera.position).dot(look) > 0 && clearSegment(camera.position, p, bin.ignoreColliderId)) focus = { kind: "bin", bin };
    }
    target = findSurface() ?? findFloor();
    if (!focus && target?.seat) focus = { kind: "seat", seat: target.seat, job: target.job };
  }
  function selectTool(kind) {
    if (!['broom', 'cloth'].includes(kind) || disposed || !active || state.pouring) return false;
    if (hands.owner && hands.owner !== "cleaning") { showToast("Put down what you are carrying first."); return false; }
    state.heldTool = kind; hands.owner = "cleaning"; smooth = previous = null; phase = 0; onSound("pickup"); save(); return true;
  }
  function returnTool() {
    if (!state.heldTool || state.pouring) return false;
    state.heldTool = null; if (hands.owner === "cleaning") hands.owner = null; smooth = previous = null; save(); return true;
  }
  function interact() {
    if (!active || disposed || state.pouring || (hands.owner && hands.owner !== "cleaning")) return false;
    refreshFocus(); if (!focus) return false;
    if (focus.kind === "bin") {
      const count = state.particles.filter(p => p.mode === "pan").length;
      if (!count) { showToast("The dustpan is empty."); return true; }
      const accepted = clamp(Math.floor(Number(depositTrash(focus.bin.id, count)) || 0), 0, count);
      if (!accepted) { showToast("This bin is full. Roll it to the trash room and replace its bag."); return true; }
      beginUsherPour(state, { id: focus.bin.id, position: [...focus.bin.position], ignoreColliderId: focus.bin.ignoreColliderId }, accepted); onSound("empty");
    } else {
      if (!closeCleaningTray(focus.job, focus.seat)) showToast(`Seat ${focus.seat.label}: ${seatStage(focus.job, focus.seat)} first.`);
      else onSound("close");
    }
    save(); return true;
  }
  function positionTools(action, dt) {
    visible.broom = visible.pan = visible.cloth = true; contactPose = null;
    camera.getWorldDirection(look); forward.set(look.x, 0, look.z).normalize(); right.set(-forward.z, 0, forward.x);
    const feet = camera.position.y - 1.68, yaw = Math.atan2(forward.x, forward.z);
    if (state.pouring) {
      const liveBin = getBinTargets().find(bin => bin.id === state.pourTarget.id);
      if (liveBin) state.pourTarget.position = [...liveBin.position];
      const [x, y, z] = state.pourTarget.position;
      tools.pan.position.set(x, y + .20, z - .10); tools.pan.rotation.set(-Math.PI / 3 * (1 - state.pouring / .85), 0, 0);
      tools.broom.position.copy(camera.position).addScaledVector(right, .35); tools.broom.position.y = feet + .12;
      tools.broom.scale.set(1, 1, 1);
      resolveTool(tools.pan, liveBin?.ignoreColliderId ?? state.pourTarget.ignoreColliderId);
      resolveTool(tools.broom);
      previous = null; return {};
    }
    if (!target || !state.heldTool || (target.kind === "tray" && state.heldTool === "broom")) {
      smooth = previous = null;
      for (const [name, object] of Object.entries(tools)) {
        object.position.copy(camera.position).addScaledVector(forward, .55).addScaledVector(right, name === "pan" ? -.30 : .27);
        object.position.y = name === "cloth" ? camera.position.y - .78 : feet + .24;
        object.scale.set(1, 1, 1); object.rotation.set(0, yaw, 0);
        resolveTool(object);
      }
      return {};
    }
    const targetKey = target.surface?.id ?? `${target.job.id}-floor`;
    if (!smooth || smooth.key !== targetKey) { smooth = { key: targetKey, p: target.point.clone() }; previous = null; }
    const delta = target.point.clone().sub(smooth.p); if (delta.length() > 3 * dt) delta.setLength(3 * dt);
    smooth.p.add(delta);
    const at = smooth.p, pull = new THREE.Vector3(camera.position.x - at.x, 0, camera.position.z - at.z).normalize();
    const chair = target.kind === "seat" && state.heldTool === "broom";
    const oldPhase = phase; phase = action ? (phase + dt) % 1.1 : 0;
    const working = action && phase < .72;
    const progress = phase < .72 ? phase / .72 : 1 - (phase - .72) / .38;
    const panPoint = at.clone().addScaledVector(pull, .36).addScaledVector(right, -.13);
    panPoint.y = chair ? feet : at.y;
    const start = chair ? new THREE.Vector3(target.seat.x, at.y, target.seat.z - target.seat.forward * .075)
      : at.clone().addScaledVector(pull, -.20).addScaledVector(right, .07);
    const end = chair ? new THREE.Vector3(target.seat.x, at.y, target.seat.z + target.seat.forward * .45)
      : panPoint.clone().addScaledVector(pull, -.045);
    const head = action ? start.clone().lerp(end, progress) : start;
    const brushYaw = Math.atan2(-pull.x, -pull.z);
    tools.broom.position.copy(head); tools.broom.position.y += working ? .004 : .13; tools.broom.rotation.set(0, brushYaw, 0); tools.broom.scale.set(1, chair ? .64 : 1, 1);
    const panDirection = new THREE.Vector3(panPoint.x - at.x, 0, panPoint.z - at.z).normalize();
    tools.pan.position.copy(panPoint); tools.pan.position.y += .007; tools.pan.rotation.set(0, Math.atan2(panDirection.x, panDirection.z), 0);
    tools.cloth.position.copy(at); tools.cloth.position.y += action ? .008 : .12; tools.cloth.rotation.set(0, yaw, 0);
    if (action && state.heldTool === "cloth") tools.cloth.position.addScaledVector(right, Math.sin(state.elapsed * 15) * .025);
    const ignore = target.ignoreId;
    const clearAt = (p, limit) => Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < limit
      && clearSegment(camera.position, p.clone().add(new THREE.Vector3(0, .04, 0)), ignore);
    const broomContact = clearAt(head, 2.5) && resolveTool(tools.broom, chair ? ignore : null);
    const panContact = clearAt(panPoint, 2.5) && resolveTool(tools.pan);
    const clothContact = clearAt(at, 1.95) && resolveTool(tools.cloth, ignore);
    // A blocked visual retracts to the grip, but that retracted pose cannot
    // perform work at the original target through a wall or another seat.
    if (!broomContact) resolveTool(tools.broom, chair ? ignore : null);
    if (!panContact) resolveTool(tools.pan);
    if (!clothContact) resolveTool(tools.cloth, ignore);
    const contact = { canMove };
    if (state.heldTool === "broom" && broomContact && (chair || panContact)) {
      if (working && oldPhase < .72 && previous?.kind === "brush" && previous.key === targetKey) {
        contact.brush = { from: previous.p, to: point(head), y: head.y, right: { x: right.x, z: right.z }, seatId: chair ? target.seat.id : null };
      }
      if (!chair) contact.pan = { x: panPoint.x, y: panPoint.y, z: panPoint.z, forward: point(panDirection), right: { x: -panDirection.z, z: panDirection.x } };
      previous = working ? { kind: "brush", key: targetKey, p: point(head) } : null;
    } else if (state.heldTool === "cloth" && action && clothContact && target.surface) {
      const local = target.entry.holder.worldToLocal(at.clone());
      if (previous?.kind === "cloth" && previous.key === targetKey) contact.cloth = { surfaceId: target.surface.id, from: previous.p, to: point(local) };
      previous = { kind: "cloth", key: targetKey, p: point(local) };
    } else previous = null;
    contactPose = { head: head.toArray(), pan: panPoint.toArray(), working, kind: target.kind };
    return contact;
  }
  function update(delta, input = {}) {
    if (disposed) return;
    active = Boolean(input.active);
    if (!active) { accumulator = 0; previous = null; focus = target = null; return; }
    visuals.prepare(state, camera); refreshFocus();
    const seconds = Number.isFinite(delta) ? clamp(delta, 0, .1) : 0; accumulator += seconds;
    while (accumulator + 1e-10 >= USHER_STEP) {
      const contact = hands.owner === "cleaning" ? positionTools(Boolean(input.action), USHER_STEP) : {};
      contact.activeTheaterId = target?.job.id ?? null;
      stepUsherState(state, USHER_STEP, contact); accumulator -= USHER_STEP;
    }
    visuals.update(state, camera, visible, resolveTool);
    for (const job of state.jobs) if (job.completed && !announced.has(`${job.id}/${job.seed}`)) {
      announced.add(`${job.id}/${job.seed}`); showToast(`Theater ${job.number} is ready. Schedule checked off.`); onSound("complete"); save();
    }
    saveTimer += seconds; if (saveTimer > 1) { saveTimer = 0; save(); }
  }
  function beginBreak(theaterId, seed) {
    const id = typeof theaterId === "number" ? `theater-${theaterId}` : theaterId;
    const plan = plans.find(p => p.id === id); if (!plan) return false;
    const job = beginCleaningBreak(state, plan, seed); if (!job) return false;
    visuals.update(state, camera, visible); save(); return true;
  }
  visuals.update(state, camera, visible);
  return {
    root, update, interact, returnTool, dropOrReturn: returnTool, selectTool, beginBreak,
    isTheaterReady: id => theaterSummary(state.jobs.find(j => j.id === (typeof id === "number" ? `theater-${id}` : id))).complete,
    getTheaterSummary: id => theaterSummary(state.jobs.find(j => j.id === (typeof id === "number" ? `theater-${id}` : id))),
    get heldTool() { return state.heldTool; }, get role() { return "Usher"; },
    get focusDistance() {
      if (focus?.kind === "bin") return camera.position.distanceTo(new THREE.Vector3(...focus.bin.position));
      return focus?.kind === "seat" && target ? camera.position.distanceTo(target.point) : Infinity;
    },
    get status() { return target?.job ? `Theater ${target.job.number} cleaning` : "Usher shift"; },
    get focusedPrompt() {
      if (hands.owner && hands.owner !== "cleaning") return "";
      if (focus?.kind === "bin") return state.pouring ? "Emptying dustpan…" : "Empty dustpan into rolling bin";
      if (focus?.kind === "seat") { const stage = seatStage(focus.job, focus.seat); return stage === "close tray" ? `Close seat ${focus.seat.label} tray` : `Seat ${focus.seat.label} · ${stage}`; }
      return "";
    },
    get hint() {
      if (hands.owner && hands.owner !== "cleaning") return "Holstered tools · put down what you carry to clean.";
      if (!state.heldTool) return "1 broom · 2 cloth · open trays mark used seats.";
      if (target?.seat) return `Seat ${target.seat.label}: ${seatStage(target.job, target.seat)}. Clean surfaces need a one-second wipe.`;
      if (target?.job && !theaterSummary(target.job).floorUnlocked) return "Wipe trays and cushions, sweep chairs, then close trays. Floor last.";
      return state.heldTool === "broom" ? "Hold to pull popcorn toward the dustpan on your left." : "Hold and drag the cloth across the dirty surface.";
    },
    getSnapshot({ details = true } = {}) {
      const interaction = { status: this.status, heldTool: state.heldTool, kit: state.kit, handsOwner: hands.owner,
        focus: focus?.kind ?? null, target: target ? { kind: target.kind, point: target.point.toArray(), surfaceId: target.surface?.id, seatId: target.seat?.id } : null,
        tools: Object.fromEntries(Object.entries(tools).map(([id, object]) => [id, { visible: object.visible, position: object.position.toArray() }])) };
      if (!details) return interaction;
      return { ...interaction, summary: usherSummary(state),
        summaries: state.jobs.map(theaterSummary), state: JSON.parse(JSON.stringify({ ...state })), pouring: state.pouring,
        focus: focus?.kind ?? null, target: target ? { kind: target.kind, point: target.point.toArray(), surfaceId: target.surface?.id, seatId: target.seat?.id } : null,
        contactPose, anchors: { bins: getBinTargets(),
          seats: state.jobs.flatMap(j => j.seats.map(s => ({ id: s.id, theaterId: j.id, stand: [...s.stand], standingPose: [...s.stand],
            seat: visuals.surfaces.get(`${s.id}-seat`).holder.getWorldPosition(new THREE.Vector3()).toArray(),
            seatSurface: visuals.surfaces.get(`${s.id}-seat`).holder.getWorldPosition(new THREE.Vector3()).toArray(),
            tray: visuals.surfaces.get(`${s.id}-tray`).holder.getWorldPosition(new THREE.Vector3()).toArray(),
            traySurface: visuals.surfaces.get(`${s.id}-tray`).holder.getWorldPosition(new THREE.Vector3()).toArray(),
            chairKernelSweepPose: { position: [s.stand[0], s.stand[1] + 1.68, s.stand[2]], target: [s.x, s.floorY + .62, s.z] },
            floorSweepPose: { position: [s.x, s.floorY + 1.68, s.z + s.forward * .78], target: [s.x, s.floorY, s.z + s.forward * .46] } }))) } };
    },
    dispose() { if (disposed) return; disposed = true; save(); if (hands.owner === "cleaning") hands.owner = null;
      visuals.dispose(); },
  };
}
