import * as THREE from "three";
import { AUDITORIUMS } from "./layout-data.js";
import { createNpcAssets } from "./npc-assets.js";
import { createCustomerNavigation, PATRON_HEIGHT, PATRON_RADIUS, PATRON_EXIT } from "./show-customer-navigation.js";

const idOf = event => typeof event === "string" ? event : event?.theaterId ?? event?.id;
const copyRoute = route => route.map(point => point.clone());
const REAL_STEP = .05, MAX_MOVING = 20;

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
  const navigation = createCustomerNavigation(world, () => [...parkedLeaves, ...collisionWorld.colliders.filter(c => /^rolling-bin-|^waste-bag-|^supplies-loose-/.test(c.id))]), actors = [], routes = new Map(), queue = [], completed = new Set();
  const geometry = new THREE.BoxGeometry(1, 1, 1), materials = [0xb38e72, 0x795d47, 0xc29e7c, 0x729186, 0x7a7695, 0xad725b]
    .map(color => new THREE.MeshStandardMaterial({ color, roughness: .88 }));
  const stats = { entered: 0, exited: 0, tossed: 0, queuedStarts: 0, queuedBreaks: 0 };
  let frontExit = []; const disposalExits = new Map();
  let disposed = false, enabled = true, clock = 0, assets, ready, prepared = false, carry = 0;
  for (const room of AUDITORIUMS) for (let index = 0; index < 4; index++) {
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
      walked: 0, time: 0, speed: 1.04 + index * .065, waiting: false, departing: false, seat: null, disposal: null, retry: 0 });
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
    const reversed = copyRoute(routes.get(actor.room)[actor.index].route).reverse();
    const completeExit = [...reversed, ...copyRoute(frontExit).slice(1)];
    const outside = doors?.getSnapshot().find(d => d.id === actor.room)?.route.hall ?? origin.toArray();
    actor.disposal = waste?.getCustomerDisposalTarget(outside, actor.room) ?? null;
    if (actor.disposal) {
      const outsidePoint = new THREE.Vector3(...outside);
      let nearest = 0; reversed.forEach((p, i) => { if (p.distanceTo(outsidePoint) < reversed[nearest].distanceTo(outsidePoint)) nearest = i; });
      const tail = navigation.path(reversed[nearest], actor.disposal.stand);
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
    queue.push({ room, kind, time: clock }); return true;
  }
  async function prepare() {
    frontExit = navigation.path([1.925, 0, 2.2], PATRON_EXIT);
    for (const room of AUDITORIUMS) {
      if (disposed) return;
      const seats = navigation.theaterSeats(room.id);
      if (seats.length !== 4) throw new Error(`Scheduled customers cannot reach four seats in ${room.id}`);
      routes.set(room.id, seats);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    for (const bin of waste?.getSnapshot().bins ?? []) {
      const target = waste.getCustomerDisposalTarget([bin.x, 0, bin.z], bin.room); if (target) disposalExit(target);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    prepared = true;
  }
  function serviceQueue() {
    if (!prepared) return;
    let moving = actors.filter(a => !["idle", "seated"].includes(a.state)).length;
    for (const event of queue) {
      const roomActors = actors.filter(a => a.room === event.room), plans = routes.get(event.room);
      for (const actor of roomActors) {
        if (actor.lastEvent === event || clock < event.time + actor.index * 2.6 || moving >= MAX_MOVING) continue;
        if (event.kind === "start") {
          if (actor.state !== "idle") continue;
          const start = plans[actor.index].route[0];
          if (camera.position.distanceTo(start.clone().add(new THREE.Vector3(0, 1.68, 0))) < 1.0
            || actors.some(a => a !== actor && a.collider.enabled && a.group.position.distanceTo(start) < .8)) continue;
          actor.seat = plans[actor.index].seat; actor.group.position.copy(start); actor.departing = false;
          actor.packaging.visible = false;
          setPath(actor, plans[actor.index].route, "arriving");
        } else {
          // The first break of a loaded shift already has an audience in its
          // chairs. Later breaks use the same people who visibly entered.
          actor.seat ??= plans[actor.index].seat;
          if (actor.state === "idle") { poseSeated(actor); actor.state = "seated"; }
          if (actor.state === "seated") leaveSeat(actor);
          else if (actor.state === "arriving") { actor.departing = true; planExit(actor); }
          else continue;
        }
        actor.lastEvent = event; actor.group.visible = enabled; body(actor); moving++;
      }
    }
    for (let i = queue.length - 1; i >= 0; i--) if (actors.filter(a => a.room === queue[i].room).every(a => a.lastEvent === queue[i])) queue.splice(i, 1);
  }
  function walk(actor, dt) {
    const target = actor.path[actor.waypoint]; if (!target) return true;
    const p = actor.group.position, dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
    const following = actor.path[actor.waypoint + 1];
    if (following && distance < .46 && navigation.clearSegment(p, following)) { actor.waypoint++; return false; }
    if (distance < (actor.state === "exit" && !following ? .35 : .11)) { p.copy(target); actor.waypoint++; return actor.waypoint >= actor.path.length; }
    const step = Math.min(distance, actor.speed * dt), direction = new THREE.Vector3(dx / distance, 0, dz / distance);
    let next = null;
    actor.collider.enabled = false;
    for (const angle of [0, .6, -.6, 1.05, -1.05, 1.5, -1.5]) {
      const d = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle), trial = { x: p.x, y: p.y, z: p.z };
      collisionWorld.moveCircle(trial, d.x * step, d.z * step, PATRON_RADIUS, p.y + .03, PATRON_HEIGHT);
      const ground = world.groundHeight(trial.x, trial.z, p.y);
      const door = doors?.doors.find(d => d.id === actor.room);
      if (door && door.angle < 1.40) {
        const signed = (trial.x - door.x) * door.normal[0] + (trial.z - door.z) * door.normal[2];
        const lateral = (trial.x - door.x) * door.normal[2] - (trial.z - door.z) * door.normal[0];
        if (Math.abs(signed) < 1.75 && Math.abs(lateral) < door.width / 2 + .35) continue;
      }
      if (Math.abs(ground - p.y) > .32 || !navigation.clearPoint(trial.x, trial.z, ground)) continue;
      if (Math.abs(camera.position.y - 1.68 - ground) < 1.6 && Math.hypot(camera.position.x - trial.x, camera.position.z - trial.z) < .70) continue;
      if (actors.some(other => other !== actor && other.collider.enabled && Math.abs(other.group.position.y - ground) < 1.6
        && Math.hypot(other.group.position.x - trial.x, other.group.position.z - trial.z) < .53)) continue;
      const progressed = (trial.x - p.x) * direction.x + (trial.z - p.z) * direction.z;
      if (progressed > -.0001 && Math.hypot(trial.x - p.x, trial.z - p.z) > step * .30) { next = new THREE.Vector3(trial.x, ground, trial.z); break; }
    }
    actor.waiting = !next;
    if (next) { actor.walked += p.distanceTo(next); p.copy(next); actor.group.rotation.y = Math.atan2(dx, dz); }
    actor.limbs.forEach(({ arm, leg, side }) => {
      const swing = next ? Math.sin(actor.walked * 8.8) * .33 * side : 0; leg.rotation.x = swing; arm.rotation.x = -swing;
    });
    body(actor); return false;
  }
  function step(dt) {
    clock += dt; serviceQueue();
    for (const actor of actors) {
      if (actor.state === "idle") { actor.group.visible = false; continue; }
      actor.group.visible = Math.hypot(actor.group.position.x - camera.position.x, actor.group.position.z - camera.position.z) < 70;
      actor.time += dt;
      if (actor.state === "seated") { poseSeated(actor); continue; }
      if (actor.state === "sitting") {
        poseSeated(actor, Math.min(1, actor.time / .8));
        if (actor.time >= .8) { actor.state = "seated"; stats.entered++; } continue;
      }
      if (actor.state === "standing") {
        poseSeated(actor, Math.max(0, 1 - actor.time / .8));
        if (actor.time >= .8) planExit(actor); continue;
      }
      if (actor.state === "leaving") { actor.retry -= dt; if (actor.retry <= 0) planExit(actor); continue; }
      if (actor.state === "tossing") {
        actor.limbs[1].arm.rotation.x = -1.3 + Math.sin(Math.min(1, actor.time) * Math.PI) * .5;
        if (!actor.tossStarted && actor.time > .25) {
          actor.tossStarted = waste?.throwCustomerTrash({ binId: actor.disposal.binId, from: actor.group.position.clone().setY(actor.group.position.y + 1.3), units: 7 + actor.index * 2, shape: actor.index % 3, sourceColliderId: actor.collider.id });
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
        waiting: a.waiting, waypoint: a.waypoint, pathLength: a.path.length, seat: a.seat?.label, visible: a.group.visible })) }; },
    dispose() { if (disposed) return; disposed = true; assets?.dispose(); world.entranceDoors?.setAdditionalVisitors(null);
      actors.forEach(actor => collisionWorld.remove(actor.collider)); root.removeFromParent(); geometry.dispose(); materials.forEach(m => m.dispose()); },
  };
}
