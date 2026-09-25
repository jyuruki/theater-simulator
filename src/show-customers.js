import * as THREE from "three";
import { AUDITORIUMS } from "./layout-data.js";
import { createNpcAssets } from "./npc-assets.js";
import { createCustomerNavigation, PATRON_HEIGHT, PATRON_RADIUS, PATRON_EXIT } from "./show-customer-navigation.js";
import { createShowAttendance, attendanceCycle, MAX_SHOW_AUDIENCE } from "./show-attendance.js";

const idOf = event => typeof event === "string" ? event : event?.theaterId ?? event?.id;
const copyRoute = route => route.map(point => point.clone());
const REAL_STEP = .05, MAX_MOVING = 28;

/** A bounded set of visitors lives through arrival, sitting, departure and
 * rubbish disposal. Movement uses the same capsule collisions as the usher. */
export function createShowCustomers({ scene, world, collisionWorld, camera, doors, waste }) {
  const root = new THREE.Group(); root.name = "scheduled-theater-customers"; scene.add(root);
  // The leaf's parked, fully-open footprint is still an obstacle. Routing only
  // around walls would send the first patron into its narrow hinge-side pocket.
  const parkedLeaves = (doors?.doors ?? []).flatMap(door => door.leaves.map(leaf => {
    const angle = door.yaw - door.swing * leaf.direction * Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle);
    const x = leaf.hinge.position.x + leaf.direction * leaf.leafWidth / 2 * cos;
    const z = leaf.hinge.position.z - leaf.direction * leaf.leafWidth / 2 * sin;
    const hx = Math.abs(cos) * leaf.leafWidth / 2 + Math.abs(sin) * .035, hz = Math.abs(sin) * leaf.leafWidth / 2 + Math.abs(cos) * .035;
    return { id: `${door.id}-parked-leaf`, minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, minY: .05, maxY: door.height };
  }));
  const navigation = createCustomerNavigation(world, () => [...parkedLeaves, ...collisionWorld.colliders.filter(c => /^rolling-bin-|^waste-bag-|^supplies-loose-/.test(c.id))]), actors = [], routes = new Map(), queue = [], completed = new Set(), audiences = new Map();
  const geometry = new THREE.BoxGeometry(1, 1, 1), materials = [0xb38e72, 0x795d47, 0xc29e7c, 0x729186, 0x7a7695, 0xad725b]
    .map(color => new THREE.MeshStandardMaterial({ color, roughness: .88 }));
  const stats = { entered: 0, exited: 0, tossed: 0, queuedStarts: 0, queuedBreaks: 0 };
  let frontExit = []; const disposalExits = new Map(), disposalApproaches = new Map();
  let disposed = false, enabled = true, clock = 0, assets, ready, prepared = false, carry = 0;
  for (const room of AUDITORIUMS) for (let index = 0; index < MAX_SHOW_AUDIENCE; index++) {
    const group = new THREE.Group(), fallback = new THREE.Group(); group.name = `${room.id}-customer-${index + 1}`; group.visible = false; group.add(fallback); root.add(group);
    const make = (parent, position, size, material) => { const m = new THREE.Mesh(geometry, material); m.position.set(...position); m.scale.set(...size); parent.add(m); return m; };
    make(fallback, [0, 1.16, 0], [.35, .52, .22], materials[3 + index % 3]);
    make(fallback, [0, 1.58, 0], [.23, .28, .23], materials[index % 3]);
    const limbs = [-1, 1].map(side => {
      const arm = new THREE.Group(), leg = new THREE.Group(); arm.position.set(side * .21, 1.36, 0); leg.position.set(side * .095, .82, 0); fallback.add(arm, leg);
      make(arm, [0, -.25, 0], [.085, .51, .1], materials[index % 3]); make(leg, [0, -.39, 0], [.14, .78, .16], materials[4]);
      return { arm, leg, side };
    });
    const collider = collisionWorld.addBox({ id: `${group.name}-body`, minX: 0, maxX: .4, minY: 0, maxY: PATRON_HEIGHT, minZ: 0, maxZ: .4, enabled: false });
    const packaging = make(group, [.24, .97, .15], index % 2 ? [.20, .12, .17] : [.13, .24, .13], materials[index % 3]);
    packaging.name = `${group.name}-carried-packaging`; packaging.visible = false;
    actors.push({ group, fallback, fallbackLimbs: limbs, limbs, packaging, collider, room: room.id, index, state: "idle", path: [], waypoint: 1,
      walked: 0, time: 0, speed: 1.10 + index % 4 * .035, waiting: false, departing: false, seat: null, disposal: null, retry: 0,
      rank: actors.length, stalled: 0, repathAt: 0, party: null, partySlot: 0, baseRoute: [], lastPosition: new THREE.Vector3() });
  }
  waste?.enableScheduledCustomers();
  world.entranceDoors?.setAdditionalVisitors(() => enabled ? actors.filter(a => a.collider.enabled).map(a => a.group.position) : []);
  function body(actor) {
    const p = actor.group.position, physical = enabled && ["arriving", "leaving", "to-bin", "exit", "tossing"].includes(actor.state);
    Object.assign(actor.collider, { minX: p.x - .21, maxX: p.x + .21, minZ: p.z - .21, maxZ: p.z + .21,
      minY: p.y + .03, maxY: p.y + PATRON_HEIGHT, enabled: physical });
  }
  function poseSeated(actor, amount = 1) {
    const seat = actor.seat, approach = new THREE.Vector3(...seat.stand), sit = new THREE.Vector3(seat.x, seat.floorY - .24, seat.z - seat.forward * .03);
    actor.group.position.copy(approach).lerp(sit, amount); actor.group.rotation.y = seat.forward > 0 ? 0 : Math.PI;
    actor.limbs.forEach(({ arm, leg }) => { leg.rotation.x = -1.24 * amount; arm.rotation.x = -.48 * amount; });
  }
  function setPath(actor, path, state) {
    actor.path = copyRoute(path); actor.waypoint = 1; actor.state = state; actor.time = 0; actor.waiting = false;
  }
  function leaveSeat(actor) {
    actor.departing = true; actor.state = "standing"; actor.time = 0; actor.collider.enabled = false;
    actor.packaging.visible = true;
  }
  function disposalExit(disposal) {
    const key = `${disposal.binId}:${disposal.stand.join(",")}`;
    if (disposalExits.has(key)) return copyRoute(disposalExits.get(key));
    const start = new THREE.Vector3(...disposal.stand), bin = new THREE.Vector3(...disposal.position).setY(start.y);
    const outward = start.clone().sub(bin).normalize();
    for (const distance of [.95, .7, 1.25]) {
      const clearLane = start.clone().addScaledVector(outward, distance);
      if (!navigation.clearSegment(start, clearLane)) continue;
      const route = navigation.path(clearLane, PATRON_EXIT);
      if (route) { const result = [start, ...route]; disposalExits.set(key, result); return copyRoute(result); }
    }
    return navigation.path(start, PATRON_EXIT);
  }
  function planExit(actor) {
    const origin = actor.group.position;
    if (!actor.baseRoute.length) actor.baseRoute = navigation.theaterSeats(actor.room, [actor.seat.id])[0]?.route ?? [];
    if (!actor.baseRoute.length) { actor.state = "leaving"; actor.retry = 2; return; }
    const reversed = copyRoute(actor.baseRoute).reverse();
    const completeExit = [...reversed, ...copyRoute(frontExit).slice(1)];
    const outside = doors?.getSnapshot().find(d => d.id === actor.room)?.route.hall ?? origin.toArray();
    actor.disposal = waste?.getCustomerDisposalTarget(outside, actor.room) ?? null;
    if (actor.disposal) {
      const outsidePoint = new THREE.Vector3(...outside);
      let nearest = 0; reversed.forEach((p, i) => { if (p.distanceTo(outsidePoint) < reversed[nearest].distanceTo(outsidePoint)) nearest = i; });
      const approachKey = `${actor.room}:${reversed[nearest].toArray()}:${actor.disposal.binId}:${actor.disposal.stand}`;
      if (!disposalApproaches.has(approachKey)) disposalApproaches.set(approachKey, navigation.path(reversed[nearest], actor.disposal.stand));
      const tail = disposalApproaches.get(approachKey);
      if (tail) {
        const prefix = reversed.slice(0, nearest + 1), path = [...prefix, ...tail.slice(1)];
        if (origin.distanceTo(prefix[0]) > .15) { const access = navigation.path(origin, prefix[0]); if (access) path.unshift(...access.slice(0, -1)); }
        actor.afterToss = disposalExit(actor.disposal) ?? [...copyRoute(tail).reverse(), ...reversed.slice(nearest + 1), ...copyRoute(frontExit).slice(1)];
        setPath(actor, path, "to-bin"); return;
      }
      actor.disposal = null;
    }
    if (origin.distanceTo(completeExit[0]) < .15) setPath(actor, completeExit, "exit");
    else { const path = navigation.path(origin, PATRON_EXIT); if (path) setPath(actor, path, "exit");
    else { actor.state = "leaving"; actor.retry = 1; }
    }
  }
  function enqueue(event, kind) {
    const room = idOf(event); if (!AUDITORIUMS.some(a => a.id === room)) return false;
    const key = `${kind}:${typeof event === "object" ? event.id ?? `${room}:${event.time ?? clock}` : `${room}:${clock}`}`;
    if (completed.has(key)) return false; completed.add(key);
    if (kind === "start") stats.queuedStarts++; else stats.queuedBreaks++;
    const activeShow = actors.find(actor => actor.room === room && actor.state !== "idle");
    const cycle = kind === "break" && !Number.isInteger(event?.cycle) && activeShow ? activeShow.showCycle : attendanceCycle(event, kind);
    queue.push({ room, kind, cycle, time: clock }); return true;
  }
  async function prepare() {
    frontExit = navigation.path([1.925, 0, 2.2], PATRON_EXIT);
    for (const room of AUDITORIUMS) {
      if (disposed) return;
      const path = navigation.theaterPath(room.id);
      if (!path) throw new Error(`Scheduled customers cannot reach ${room.id}`);
      routes.set(room.id, path);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    for (const bin of waste?.getSnapshot().bins ?? []) {
      const target = waste.getCustomerDisposalTarget([bin.x, 0, bin.z], bin.room); if (target) disposalExit(target);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    prepared = true;
  }
  function audience(room, cycle) {
    const key = `${room}:${cycle}`;
    if (!audiences.has(key)) {
      const plan = navigation.seatPlans.find(p => p.id === room), attendance = createShowAttendance(plan, { cycle });
      const byId = new Map(plan.seats.map(seat => [seat.id, seat]));
      const members = attendance.groups.flatMap(party => party.seatIds.map((id, slot) => ({ seat: byId.get(id), route: null, party: party.id, partySlot: slot,
        delay: party.arrivalDelay + Math.floor(slot / 2) * .9 })));
      audiences.set(key, { ...attendance, members, key });
    }
    return audiences.get(key);
  }
  function assign(actor, member, show) {
    actor.seat = member.seat; actor.baseRoute = member.route ?? []; actor.party = member.party; actor.partySlot = member.partySlot;
    actor.show = show.key; actor.showCycle = show.cycle; actor.packaging.visible = false; actor.stalled = 0; actor.repathAt = 0;
  }
  function serviceQueue() {
    if (!prepared) return;
    let moving = actors.filter(a => !["idle", "seated"].includes(a.state)).length;
    // A departing audience owns the narrow cubby until its last member clears
    // it. New parties queue in the lobby, never face-to-face inside the door.
    for (const event of queue) {
      const roomActors = actors.filter(a => a.room === event.room);
      const show = audience(event.room, event.cycle);
      if (event.kind === "start" && (queue.some(other => other !== event && other.room === event.room && other.kind === "break")
        || roomActors.some(a => a.departing && a.state !== "idle"))) continue;
      event.done ??= new Set();
      for (let index = 0; index < show.count; index++) {
        const actor = roomActors[index], member = show.members[index];
        if (event.done.has(index) || moving >= MAX_MOVING) continue;
        if (clock < event.time + (event.kind === "start" ? member.delay : index * 1.6)) continue;
        if (event.kind === "start") {
          if (actor.state !== "idle") continue;
          member.route ??= navigation.theaterSeats(event.room, [member.seat.id])[0]?.route;
          if (!member.route) throw new Error(`Customer cannot reach ${member.seat.id}`);
          const start = member.route[0].clone();
          // Companions start together across the broad lobby. The formation
          // naturally compresses at narrow passages and widens again afterward.
          const next = member.route[1], tangent = next.clone().sub(start).setY(0).normalize();
          const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
          start.addScaledVector(side, (member.partySlot % 2 ? 1 : -1) * .36);
          if (!navigation.clearSegment(member.route[0], start)) start.copy(member.route[0]);
          if (Math.hypot(camera.position.x - start.x, camera.position.z - start.z) < 1
            || actors.some(a => a !== actor && a.collider.enabled && a.group.position.distanceTo(start) < .60)) continue;
          assign(actor, member, show); actor.group.position.copy(start); actor.departing = false;
          setPath(actor, [start, ...member.route.slice(1)], "arriving");
        } else {
          if (actor.show !== show.key && actor.state !== "idle") continue;
          if (actor.state === "idle") { assign(actor, member, show); poseSeated(actor); actor.state = "seated"; }
          if (actor.state === "seated") leaveSeat(actor);
          else if (actor.state === "arriving" || actor.state === "sitting") { actor.departing = true; actor.packaging.visible = true; planExit(actor); }
          else continue;
        }
        event.done.add(index); actor.group.visible = enabled; body(actor); moving++;
      }
    }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].done?.size === audience(queue[i].room, queue[i].cycle).count) queue.splice(i, 1);
  }
  const up = new THREE.Vector3(0, 1, 0);
  function localObstacles(actor) {
    const p = actor.group.position, result = [];
    if (Math.abs(camera.position.y - 1.68 - p.y) < 1.6 && Math.hypot(camera.position.x - p.x, camera.position.z - p.z) > .72) {
      result.push({ minX: camera.position.x - .34, maxX: camera.position.x + .34, minZ: camera.position.z - .34, maxZ: camera.position.z + .34,
        minY: camera.position.y - 1.68, maxY: camera.position.y + .05 });
    }
    for (const other of actors) if (other !== actor && other.collider.enabled && p.distanceTo(other.group.position) > .72
      && p.distanceTo(other.group.position) < 5) result.push(other.collider);
    return result;
  }
  function replan(actor) {
    const nextIndex = Math.min(actor.waypoint + 1, actor.path.length - 1), goal = actor.path[nextIndex];
    if (!goal || clock < actor.repathAt) return;
    actor.repathAt = clock + 3 + actor.rank % 7 * .13;
    const result = navigation.path(actor.group.position, goal, { obstacles: localObstacles(actor), maxNodes: 1600 });
    if (result) { actor.path = [...result, ...actor.path.slice(nextIndex + 1)]; actor.waypoint = 1; actor.stalled = 0; }
  }
  function walk(actor, dt) {
    const target = actor.path[actor.waypoint]; if (!target) return true;
    const p = actor.group.position, following = actor.path[actor.waypoint + 1];
    let distance = Math.hypot(target.x - p.x, target.z - p.z);
    if (following && distance < .22 && navigation.clearSegment(p, following)) { actor.waypoint++; return false; }
    if (distance < (actor.state === "exit" && !following ? .35 : .12)) { p.copy(target); actor.waypoint++; actor.stalled = 0; return actor.waypoint >= actor.path.length; }
    const destination = target.clone(), door = doors?.doors.find(d => d.id === actor.room);
    const roomPlan = navigation.seatPlans.find(plan => plan.id === actor.room);
    const inRoom = p.x > roomPlan.bounds.xMin && p.x < roomPlan.bounds.xMax && p.z > roomPlan.bounds.zMin && p.z < roomPlan.bounds.zMax;
    if (following && !inRoom && actor.party && distance > 1.5 && navigation.clearance(p.x, p.z, p.y) > 1) {
      const lane = (actor.partySlot % 2 ? 1 : -1) * .35;
      destination.x += (target.z - p.z) / distance * lane; destination.z -= (target.x - p.x) / distance * lane;
      if (!navigation.clearSegment(p, destination)) destination.copy(target);
    }
    const direction = destination.clone().sub(p).setY(0).normalize();
    let pace = actor.speed;
    if (!inRoom && actor.party && navigation.clearance(p.x, p.z, p.y) > .85) {
      const mate = actors.find(other => other !== actor && other.party === actor.party && other.partySlot === (actor.partySlot ^ 1)
        && other.state === actor.state);
      if (mate) {
        const along = (mate.group.position.x - p.x) * direction.x + (mate.group.position.z - p.z) * direction.z;
        if (along < -.9 && along > -4) pace *= .66;
        else if (along > 1.1) pace *= 1.1;
      }
    }
    const step = Math.min(distance, pace * dt);
    let next = null, bestScore = -Infinity, closedDoor = false;
    actor.collider.enabled = false;
    const nearby = actors.filter(other => other !== actor && other.collider.enabled && Math.abs(other.group.position.y - p.y) < 1.6
      && Math.hypot(other.group.position.x - p.x, other.group.position.z - p.z) < 1.7);
    const playerNear = Math.abs(camera.position.y - 1.68 - p.y) < 1.6 && Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 1.6;
    for (const angle of [0, -.35, .35, -.75, .75, -1.15, 1.15, -1.57, 1.57, -2.15, 2.15, Math.PI]) {
      const d = direction.clone().applyAxisAngle(up, angle), trial = { x: p.x, y: p.y, z: p.z };
      collisionWorld.moveCircle(trial, d.x * step, d.z * step, PATRON_RADIUS, p.y + .03, PATRON_HEIGHT);
      const ground = world.groundHeight(trial.x, trial.z, p.y);
      if (door && door.angle < 1.40) {
        const signed = (trial.x - door.x) * door.normal[0] + (trial.z - door.z) * door.normal[2];
        const lateral = (trial.x - door.x) * door.normal[2] - (trial.z - door.z) * door.normal[0];
        if (Math.abs(signed) < 1.75 && Math.abs(lateral) < door.width / 2 + .35) { closedDoor = true; continue; }
      }
      if (Math.abs(ground - p.y) > .32 || !navigation.clearPoint(trial.x, trial.z, ground)) continue;
      if (!navigation.clearSegment(p, new THREE.Vector3(trial.x, ground, trial.z))) continue;
      const moved = Math.hypot(trial.x - p.x, trial.z - p.z); if (moved < step * .30) continue;
      if (playerNear && Math.hypot(camera.position.x - trial.x, camera.position.z - trial.z) < .68) continue;
      if (nearby.some(other => {
        const previousGap = Math.hypot(other.group.position.x - p.x, other.group.position.z - p.z);
        const gap = Math.hypot(other.group.position.x - trial.x, other.group.position.z - trial.z);
        // A standing animation or player shove may begin in overlap. Allow
        // separating motion instead of trapping both people forever.
        return gap < .52 && gap < previousGap + .001;
      })) continue;
      let score = ((trial.x - p.x) * direction.x + (trial.z - p.z) * direction.z) / step;
      // Look ahead rather than waiting until capsules touch. Everyone passes
      // on their right, so opposite streams choose opposite physical sides.
      const ahead = new THREE.Vector3(trial.x + d.x * .75, ground, trial.z + d.z * .75);
      for (const other of nearby) {
        const gap = Math.hypot(other.group.position.x - ahead.x, other.group.position.z - ahead.z);
        score -= Math.max(0, 1 - gap / .85) * 2.2;
      }
      if (playerNear) score -= Math.max(0, 1 - Math.hypot(camera.position.x - ahead.x, camera.position.z - ahead.z) / .95) * 3;
      score += angle < 0 ? .06 : 0;
      if (Math.abs(angle) > 1.6 && actor.stalled < .7) score -= 2;
      if (score > bestScore) { bestScore = score; next = new THREE.Vector3(trial.x, ground, trial.z); }
    }
    actor.waiting = !next || bestScore < -.5 && closedDoor;
    if (actor.waiting) next = null;
    const before = distance;
    if (next) {
      actor.walked += p.distanceTo(next); const travel = next.clone().sub(p); p.copy(next);
      actor.group.rotation.y = Math.atan2(travel.x, travel.z);
    }
    const progress = before - Math.hypot(target.x - p.x, target.z - p.z);
    actor.stalled = progress > step * .18 ? Math.max(0, actor.stalled - dt * .25) : actor.stalled + dt;
    const crossing = nearby.some(other => {
      const goal = other.path[other.waypoint];
      return goal && direction.x * (goal.x - other.group.position.x) + direction.z * (goal.z - other.group.position.z) < -.1;
    });
    if (actor.stalled > 1.1 && !closedDoor && (playerNear || crossing || actor.stalled > 5 && !nearby.length)) replan(actor);
    actor.limbs.forEach(({ arm, leg, side }) => {
      const swing = next ? Math.sin(actor.walked * 8.8) * .33 * side : 0; leg.rotation.x = swing; arm.rotation.x = -swing;
    });
    body(actor); return false;
  }
  function step(dt) {
    clock += dt; serviceQueue();
    for (const actor of actors) {
      if (actor.state === "idle") { actor.group.visible = false; continue; }
      const room = navigation.seatPlans.find(plan => plan.id === actor.room);
      const cameraInRoom = camera.position.x > room.bounds.xMin - 1 && camera.position.x < room.bounds.xMax + 1
        && camera.position.z > room.bounds.zMin - 1 && camera.position.z < room.bounds.zMax + 1;
      actor.group.visible = actor.state === "seated" ? cameraInRoom : Math.hypot(actor.group.position.x - camera.position.x, actor.group.position.z - camera.position.z) < 65;
      actor.time += dt;
      if (actor.state === "seated") continue;
      if (actor.state === "sitting") {
        poseSeated(actor, Math.min(1, actor.time / .8));
        if (actor.time >= .8) { actor.state = "seated"; stats.entered++; } continue;
      }
      if (actor.state === "standing") {
        const stand = new THREE.Vector3(...actor.seat.stand);
        if (actor.time >= .65 && actors.some(other => other !== actor && other.collider.enabled
          && Math.abs(other.group.position.y - stand.y) < 1.6 && Math.hypot(other.group.position.x - stand.x, other.group.position.z - stand.z) < .7)) {
          actor.time = .65; poseSeated(actor, .22); continue;
        }
        poseSeated(actor, Math.max(0, 1 - actor.time / .8));
        if (actor.time >= .8) planExit(actor); continue;
      }
      if (actor.state === "leaving") { actor.retry -= dt; if (actor.retry <= 0) planExit(actor); continue; }
      if (actor.state === "tossing") {
        actor.limbs[1].arm.rotation.x = -1.3 + Math.sin(Math.min(1, actor.time) * Math.PI) * .5;
        if (!actor.tossStarted && actor.time > .25) {
          actor.tossStarted = waste?.throwCustomerTrash({ binId: actor.disposal.binId, from: actor.group.position.clone().setY(actor.group.position.y + 1.3), units: 7 + actor.index % 4 * 2, shape: actor.index % 3, sourceColliderId: actor.collider.id });
          if (actor.tossStarted) { actor.time = 0; actor.packaging.visible = false; stats.tossed++; }
        }
        if ((actor.tossStarted && actor.time > 1.05) || actor.time > 5) {
          const path = actor.afterToss ?? navigation.path(actor.group.position, PATRON_EXIT);
          if (path) setPath(actor, path, "exit"); else { actor.state = "leaving"; actor.retry = 1; }
        }
        continue;
      }
      if (walk(actor, dt)) {
        if (actor.state === "arriving") { actor.state = "sitting"; actor.time = 0; actor.collider.enabled = false; }
        else if (actor.state === "to-bin") { actor.state = "tossing"; actor.time = 0; actor.tossStarted = false;
          actor.group.lookAt(...actor.disposal.position); actor.group.rotation.x = actor.group.rotation.z = 0; }
        else { actor.state = "idle"; actor.group.visible = false; actor.collider.enabled = false; stats.exited++; }
      }
    }
  }
  return {
    root, actors, navigation,
    onStart(event) { return enqueue(event, "start"); }, onBreak(event) { return enqueue(event, "break"); },
    restoreSchedule({ minute = 0, done = [], events = [] } = {}) {
      const processed = new Set(done); let restored = 0;
      for (const room of AUDITORIUMS) {
        if (actors.some(a => a.room === room.id && a.state !== "idle") || queue.some(event => event.room === room.id)) continue;
        const past = events.filter(event => event.theaterId === room.id && event.time <= minute && processed.has(event.id));
        const last = past.at(-1); if (last?.kind === "break") continue;
        const cycle = last ? attendanceCycle(last, "start") : 0, show = audience(room.id, cycle);
        const roomActors = actors.filter(actor => actor.room === room.id);
        show.members.forEach((member, index) => { const actor = roomActors[index]; assign(actor, member, show); poseSeated(actor);
          actor.state = "seated"; actor.departing = false; actor.group.visible = false; restored++; });
      }
      return restored;
    },
    loadAssets(options = {}) {
      if (disposed) return Promise.resolve({ status: "disposed", actorCount: 0 });
      if (!ready) {
        assets = createNpcAssets({ ...options, actors, variants: actors.map((actor, index) => `NPC_Visitor_0${index % 3 + 1}`) });
        ready = Promise.all([assets.ready, prepare()]).then(([result]) => ({ ...result, routes: routes.size }));
      }
      return ready;
    },
    update(delta, active = true) {
      if (disposed || !enabled || !active || !Number.isFinite(delta)) return;
      carry += Math.min(.1, Math.max(0, delta));
      while (carry >= REAL_STEP - 1e-9) { step(REAL_STEP); carry -= REAL_STEP; }
    },
    setEnabled(value) { enabled = Boolean(value); root.visible = enabled; actors.forEach(body); },
    getSnapshot() { return { enabled, prepared, clock, stats: { ...stats }, queued: queue.map(event => ({ room: event.room, kind: event.kind })),
      actors: actors.filter(a => a.state !== "idle").map(a => ({ room: a.room, index: a.index, state: a.state, position: a.group.position.toArray(),
        waiting: a.waiting, waypoint: a.waypoint, pathLength: a.path.length, seat: a.seat?.label, seatId: a.seat?.id, show: a.show,
        party: a.party, partySlot: a.partySlot, visible: a.group.visible })) }; },
    dispose() { if (disposed) return; disposed = true; assets?.dispose(); world.entranceDoors?.setAdditionalVisitors(null);
      actors.forEach(actor => collisionWorld.remove(actor.collider)); root.removeFromParent(); geometry.dispose(); materials.forEach(m => m.dispose()); },
  };
}
