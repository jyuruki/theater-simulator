import * as THREE from "three";
import { AUDITORIUMS, SERVICE_ROOMS } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";
import { segmentHitsBox } from "./visit-state.js";
import { createPlacementPreview } from "./prop-placement.js";
import { resolveHeldPose } from "./held-prop-pose.js";

export const WASTE_CAPACITY = 120;
export const WASTE_BIN_RADIUS = .46;
export const WASTE_STORAGE_KEY = "v22-waste";
const STEP = 1 / 120, BIN_TOP = 1.12, BAG_RADIUS = .28, BAG_HALF_HEIGHT = .36;
const clamp = THREE.MathUtils.clamp;
const trashRoom = SERVICE_ROOMS.find(room => room.id === "trash-room");
export const WASTE_GONDOLA = Object.freeze({ x: planToWorldX(trashRoom.bounds.xMin + 1.55), z: 60.96, width: 2.3, depth: 1.48, height: 1.14 });
export const WASTE_STOCK = Object.freeze({ x: planToWorldX(trashRoom.bounds.xMax - 1.08), y: .95, z: 61.68 });
const roomId = value => typeof value === "number" ? `theater-${value}` : typeof value === "string" ? value : value?.theaterId ?? value?.id;
const roomById = id => AUDITORIUMS.find(room => room.id === roomId(id));
const roomNumber = id => roomById(id)?.number ?? "?";
const finite = value => Number.isFinite(value);

export function wasteParkingCandidates(id) {
  const room = roomById(id);
  if (!room) return [];
  const outward = room.screenSide === "south" ? 1 : -1;
  const doorwayZ = room.entry.outerPlaneZ ?? (outward > 0 ? room.bounds.zMax : room.bounds.zMin);
  const doorwayX = planToWorldX(room.entry.center);
  // Beside the jamb, never in the doorway. Try both sides against the actual
  // colliders: T1/T2 share a wall, while T3 opens onto the fountain court.
  return [1.86, -1.86, 2.45, -2.45, 3, -3].flatMap(offset => [.68, 1.15].map(distance => ({ x: doorwayX + offset, z: doorwayZ + outward * distance })));
}

/** Three constrained rolling cans, removable liners, and ballistic full bags. */
export function createUsherWaste({ scene, world, camera, collisionWorld, controller, showToast = () => {}, hands = { owner: null }, storage,
  getNextBreaks = () => ["theater-2", "theater-1", "theater-3"], getRoomReady = () => false, scheduledCustomers = false }) {
  const root = new THREE.Group(); root.name = "usher-rolling-waste"; scene.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set(), ownedColliders = [];
  const geometry = value => { geometries.add(value); return value; };
  const material = options => { const value = new THREE.MeshStandardMaterial(options); materials.add(value); return value; };
  const mat = {
    gray: material({ color: 0x777d80, roughness: .67 }), rim: material({ color: 0xa1a8a8, roughness: .48 }),
    dark: material({ color: 0x202424, roughness: .84 }), bag: material({ color: 0x252e2b, roughness: .65 }),
    metal: material({ color: 0xadb3b4, metalness: .65, roughness: .35 }), paper: material({ color: 0xd6ad75, roughness: .92 }),
    cup: material({ color: 0xe5e2d7, roughness: .8 }), box: material({ color: 0xb53937, roughness: .8 }),
    cart: material({ color: 0x455e64, metalness: .16, roughness: .64 }), cloth: material({ color: 0x667f8e, roughness: .9 }),
    skin: material({ color: 0xbc906f, roughness: .9 }),
  };
  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeometry = geometry(new THREE.IcosahedronGeometry(1, 1));
  const cylinderGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 18));
  const binShellGeometry = geometry(new THREE.CylinderGeometry(.425, .37, .87, 28, 1, true));
  const ringGeometry = geometry(new THREE.TorusGeometry(.43, .035, 8, 32));
  function mesh(parent, name, geom, m, p, scale = [1, 1, 1]) {
    const object = new THREE.Mesh(geom, m); object.name = name; object.position.set(...p); object.scale.set(...scale);
    object.receiveShadow = true; object.castShadow = false; parent.add(object); return object;
  }
  const box = (parent, name, p, size, m) => mesh(parent, name, boxGeometry, m, p, size);
  function addCollider(data) { const value = collisionWorld.addBox(data); ownedColliders.push(value); return value; }
  function withoutCollider(collider, fn) { const enabled = collider?.enabled; if (collider) collider.enabled = false; try { return fn(); } finally { if (collider) collider.enabled = enabled; } }
  function groundAt(x, z, feet = 0) { const y = world.groundHeight(x, z, feet); return finite(y) ? y : null; }
  const inBounds = (x, z) => {
    const bounds = collisionWorld.bounds;
    return finite(x) && finite(z) && (!bounds || (x > bounds.minX + .5 && x < bounds.maxX - .5 && z > bounds.minZ + .5 && z < bounds.maxZ - .5));
  };
  function clear(from, to, ignored = null) {
    return !collisionWorld.colliders.some(collider => collider.enabled !== false && collider !== ignored && segmentHitsBox(from, to, collider));
  }
  function validBinPosition(p) {
    return inBounds(p.x, p.z) && Math.abs(groundAt(p.x, p.z) ?? Infinity) < .05
      && !(Math.abs(p.x - WASTE_GONDOLA.x) < WASTE_GONDOLA.width / 2 + WASTE_BIN_RADIUS + .045
        && Math.abs(p.z - WASTE_GONDOLA.z) < WASTE_GONDOLA.depth / 2 + WASTE_BIN_RADIUS + .045)
      && !(Math.abs(p.x - WASTE_STOCK.x) < .33 + WASTE_BIN_RADIUS && Math.abs(p.z - WASTE_STOCK.z) < .245 + WASTE_BIN_RADIUS)
      && !collisionWorld.isOverlapping({ ...p, y: 0 }, WASTE_BIN_RADIUS, .03, BIN_TOP);
  }
  function parking(id) { return wasteParkingCandidates(id).find(validBinPosition); }

  const defaultRooms = [...new Set(getNextBreaks().map(roomId).filter(id => roomById(id)))];
  for (const id of ["theater-2", "theater-1", "theater-3"]) if (!defaultRooms.includes(id)) defaultRooms.push(id);
  let state = { version: 1, nextBag: 1, depositedBags: 0, bins: [], bags: [], breakQueue: [] };
  let saved;
  try { saved = JSON.parse(storage?.getItem(WASTE_STORAGE_KEY)); } catch { /* New physical round. */ }
  if (saved?.version === 1 && saved.bins?.length === 3 && Array.isArray(saved.bags) && saved.bags.length <= 500
    && saved.bins.every(b => inBounds(b.x, b.z) && roomById(b.room) && finite(b.fill) && b.fill >= 0 && b.fill <= WASTE_CAPACITY
      && typeof b.lined === "boolean" && Number.isInteger(b.spares) && b.spares >= 0 && b.spares <= 24)
    && new Set(saved.bags.map(b => b.id)).size === saved.bags.length
    && saved.bags.every(b => /^waste-bag-[1-9]\d*$/.test(b.id) && inBounds(b.x, b.z) && finite(b.y) && b.y >= 0 && b.y < 15
      && finite(b.units) && b.units > 0 && b.units <= WASTE_CAPACITY && typeof b.tied === "boolean")
    && Number.isInteger(saved.nextBag) && saved.nextBag > 0 && Number.isInteger(saved.depositedBags) && saved.depositedBags >= 0) {
    state = { ...saved, breakQueue: Array.isArray(saved.breakQueue) ? saved.breakQueue.filter(q => roomById(q.room) && Number.isInteger(q.remaining) && q.remaining > 0 && q.remaining <= 6).map(q => ({ room: q.room, remaining: q.remaining })) : [] };
  }
  state.looseLiners = Array.isArray(state.looseLiners) ? state.looseLiners.filter(item =>
    typeof item.id === "string" && typeof item.open === "boolean" && Array.isArray(item.position)
    && item.position.length === 3 && item.position.every(finite) && inBounds(item.position[0], item.position[2])
    && item.position[1] >= -3 && item.position[1] < 10).slice(0, 48) : [];
  state.nextLiner = Number.isInteger(state.nextLiner) ? Math.max(1, state.nextLiner) : 1;
  const bins = [], bagModels = new Map(), linerModels = new Map();
  let held = null, focus = null, active = false, disposed = false, accumulator = 0, saveElapsed = 0, previousAction = false, charge = 0, actionWaitRelease = false;
  const placement = createPlacementPreview({ scene: root, camera, world, getColliders: () => collisionWorld.colliders });
  const forward = new THREE.Vector3(), look = new THREE.Vector3(), ray = new THREE.Ray();
  const physicalLabel = () => {
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(512, 256) : Object.assign(document.createElement("canvas"), { width: 512, height: 256 });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const m = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false }); materials.add(m);
    return { canvas, texture, material: m };
  };
  for (let index = 0; index < 3; index++) {
    const previous = state.bins[index];
    const assigned = previous?.room ?? defaultRooms[index];
    const spawn = previous && validBinPosition(previous) ? previous : parking(assigned);
    if (!spawn) throw new Error(`No clear rolling-bin parking location for ${assigned}`);
    const data = { id: `rolling-bin-${index + 1}`, room: assigned, x: spawn.x, z: spawn.z,
      yaw: finite(previous?.yaw) ? previous.yaw : roomById(assigned).screenSide === "south" ? Math.PI : 0,
      fill: previous?.fill ?? [86, 44, 18][index], lined: previous?.lined ?? true, spares: previous?.spares ?? 12, vx: 0, vz: 0 };
    state.bins[index] = data;
    const group = new THREE.Group(); group.name = data.id; root.add(group);
    mesh(group, `${data.id}-round-gray-shell`, binShellGeometry, mat.gray, [0, .655, 0]);
    mesh(group, `${data.id}-bottom`, cylinderGeometry, mat.gray, [0, .215, 0], [.373, .055, .373]);
    const rim = mesh(group, `${data.id}-rim`, ringGeometry, mat.rim, [0, BIN_TOP, 0]); rim.rotation.x = Math.PI / 2;
    const liner = mesh(group, `${data.id}-liner`, geometry(new THREE.CylinderGeometry(.403, .345, .80, 28, 1, true)), mat.bag, [0, .70, 0]); liner.material.side = THREE.DoubleSide;
    const linerBottom = mesh(group, `${data.id}-liner-bottom`, cylinderGeometry, mat.bag, [0, .315, 0], [.346, .04, .346]);
    const contents = new THREE.Group(); contents.name = `${data.id}-contents`; group.add(contents);
    for (let item = 0; item < 12; item++) {
      const a = item * 2.39996, r = .26 * Math.sqrt(item / 12);
      const thing = mesh(contents, `${data.id}-waste-${item}`, item % 3 ? boxGeometry : cylinderGeometry, item % 3 === 0 ? mat.cup : item % 3 === 1 ? mat.paper : mat.box,
        [Math.cos(a) * r, .06 * (item % 3), Math.sin(a) * r], item % 3 ? [.15, .10, .17] : [.06, .18, .06]);
      thing.rotation.set(.17 * item, a, .1 * item);
    }
    for (const x of [-.29, .29]) box(group, `${data.id}-handle-upright`, [x, 1.01, -.43], [.045, .25, .045], mat.dark);
    box(group, `${data.id}-push-handle`, [0, 1.14, -.43], [.62, .055, .065], mat.dark);
    const roll = mesh(group, `${data.id}-stored-spare-liners`, cylinderGeometry, mat.bag, [.36, .74, -.20], [.10, .28, .10]); roll.rotation.z = Math.PI / 2;
    box(group, `${data.id}-spare-pouch`, [.37, .65, -.20], [.22, .13, .31], mat.gray);
    const wheels = [];
    for (const x of [-.27, .27]) for (const z of [-.27, .27]) {
      const caster = new THREE.Group(); caster.position.set(x, .105, z); group.add(caster);
      box(caster, `${data.id}-caster-fork`, [0, .035, 0], [.115, .115, .045], mat.metal);
      const wheel = mesh(caster, `${data.id}-caster-tire`, cylinderGeometry, mat.dark, [0, -.01, .025], [.085, .068, .085]); wheel.rotation.z = Math.PI / 2;
      wheels.push({ caster, wheel });
    }
    const label = physicalLabel();
    const plate = mesh(group, `${data.id}-assignment-label`, geometry(new THREE.PlaneGeometry(.55, .275)), label.material, [0, .73, -.416]); plate.rotation.y = Math.PI;
    const collider = addCollider({ id: data.id, minX: data.x - WASTE_BIN_RADIUS, maxX: data.x + WASTE_BIN_RADIUS,
      minZ: data.z - WASTE_BIN_RADIUS, maxZ: data.z + WASTE_BIN_RADIUS, minY: 0, maxY: BIN_TOP });
    bins.push({ data, group, collider, wheels, liner, linerBottom, contents, roll, label, labelKey: "", reserved: 0 });
  }
  // Reload starts with free hands, as the cleaning tools do. An unused clean
  // liner is returned to its original spare roll rather than lost on refresh.
  if (state.pendingSpareBinId) {
    const source = bins.find(bin => bin.data.id === state.pendingSpareBinId);
    if (source) source.data.spares = Math.min(24, source.data.spares + 1);
    delete state.pendingSpareBinId;
  }

  const gondola = new THREE.Group(); gondola.name = "trash-room-gondola"; gondola.position.set(WASTE_GONDOLA.x, 0, WASTE_GONDOLA.z); root.add(gondola);
  const gw = WASTE_GONDOLA.width, gd = WASTE_GONDOLA.depth, gh = WASTE_GONDOLA.height;
  box(gondola, "gondola-floor", [0, .28, 0], [gw, .14, gd], mat.cart);
  for (const z of [-gd / 2, gd / 2]) box(gondola, "gondola-long-side", [0, .74, z], [gw, .80, .09], mat.cart);
  for (const x of [-gw / 2, gw / 2]) box(gondola, "gondola-end", [x, .74, 0], [.09, .80, gd], mat.cart);
  for (const x of [-gw * .36, gw * .36]) for (const z of [-gd * .35, gd * .35]) {
    const wheel = mesh(gondola, "gondola-wheel", cylinderGeometry, mat.dark, [x, .14, z], [.13, .08, .13]); wheel.rotation.z = Math.PI / 2;
  }
  const gondolaCollider = addCollider({ id: "waste-gondola", minX: WASTE_GONDOLA.x - gw / 2 - .045, maxX: WASTE_GONDOLA.x + gw / 2 + .045,
    minZ: WASTE_GONDOLA.z - gd / 2 - .045, maxZ: WASTE_GONDOLA.z + gd / 2 + .045, minY: 0, maxY: gh });
  const stock = box(root, "trash-room-spare-liner-box", [WASTE_STOCK.x, .79, WASTE_STOCK.z], [.66, .38, .49], mat.paper);
  for (let i = 0; i < 4; i++) {
    const roll = mesh(stock, "spare-liner-stock-roll", cylinderGeometry, mat.bag, [(i - 1.5) * .24, .62, 0], [.11, .60, .16]); roll.rotation.z = Math.PI / 2;
  }
  addCollider({ id: "waste-spare-stock", minX: WASTE_STOCK.x - .33, maxX: WASTE_STOCK.x + .33, minZ: WASTE_STOCK.z - .245, maxZ: WASTE_STOCK.z + .245, minY: .60, maxY: .98 });
  const freshLiner = new THREE.Group(); freshLiner.name = "held-spare-trash-liner"; root.add(freshLiner);
  const freshBody = mesh(freshLiner, "fresh-bag-folds", geometry(new THREE.CylinderGeometry(1, .4, 1, 20, 1, true)), mat.bag, [0, 0, 0], [.09, .32, .025]);
  const freshMouth = mesh(freshLiner, "fresh-bag-open-mouth", geometry(new THREE.TorusGeometry(1, .032, 6, 24)), mat.bag, [0, .16, 0]); freshMouth.rotation.x = Math.PI / 2;
  const freshBottom = mesh(freshLiner, "fresh-bag-bottom", cylinderGeometry, mat.bag, [0, -.16, 0], [.04, .01, .012]);

  function makeBag(data) {
    const group = new THREE.Group(); group.name = data.id; root.add(group);
    const body = mesh(group, `${data.id}-body`, sphereGeometry, mat.bag, [0, -.05, 0], [.29, .31, .27]);
    const neck = mesh(group, `${data.id}-neck`, cylinderGeometry, mat.bag, [0, .27, 0], [.12, .18, .12]);
    const tie = box(group, `${data.id}-tie`, [0, .34, 0], [.21, .04, .05], mat.gray);
    const collider = addCollider({ id: data.id, minX: data.x - BAG_RADIUS, maxX: data.x + BAG_RADIUS, minZ: data.z - BAG_RADIUS,
      maxZ: data.z + BAG_RADIUS, minY: data.y - BAG_HALF_HEIGHT, maxY: data.y + BAG_HALF_HEIGHT, enabled: false });
    bagModels.set(data.id, { group, body, neck, tie, collider });
  }
  state.bags.forEach(data => {
    data.vx = data.vy = data.vz = 0;
    data.phase = data.phase === "disposed" ? "disposed" : data.phase === "gondola" ? "gondola" : "falling";
    // A saved hand item becomes a physical object where it was left, never an
    // invisible occupied hand. Gravity resumes only when play resumes.
    if (data.phase === "falling" && bins.some(bin => Math.hypot(data.x - bin.data.x, data.z - bin.data.z) < WASTE_BIN_RADIUS + BAG_RADIUS
      && data.y - BAG_HALF_HEIGHT < BIN_TOP)) data.y = BIN_TOP + BAG_HALF_HEIGHT + .04;
    makeBag(data);
  });
  let customer = null;
  const customerRoot = new THREE.Group(); customerRoot.name = "guest-waste-disposal"; customerRoot.visible = false; root.add(customerRoot);
  mesh(customerRoot, "guest-head", sphereGeometry, mat.skin, [0, 1.51, 0], [.12, .15, .12]);
  box(customerRoot, "guest-shirt", [0, 1.03, 0], [.39, .65, .22], mat.cloth);
  for (const x of [-.11, .11]) box(customerRoot, "guest-leg", [x, .36, 0], [.13, .72, .15], mat.dark);
  box(customerRoot, "guest-toss-arm", [-.22, 1.11, .18], [.09, .13, .49], mat.skin);
  const tossed = new THREE.Group(); tossed.name = "guest-tossed-litter"; root.add(tossed);
  const tossCup = mesh(tossed, "guest-paper-cup", cylinderGeometry, mat.cup, [0, 0, 0], [.06, .19, .06]);
  const tossBox = box(tossed, "guest-food-box", [0, 0, 0], [.23, .14, .18], mat.box);
  const tossBag = box(tossed, "guest-paper-bag", [0, 0, 0], [.19, .28, .14], mat.paper);

  function save() {
    try { storage?.setItem(WASTE_STORAGE_KEY, JSON.stringify({ ...state,
      pendingSpareBinId: held?.kind === "liner" ? held.sourceBinId : null,
      bins: state.bins.map(({ id, room, x, z, yaw, fill, lined, spares }) => ({ id, room, x, z, yaw, fill, lined, spares })),
      bags: state.bags.map(({ id, x, y, z, units, tied, phase }) => ({ id, x, y, z, units, tied, phase })),
    })); } catch { /* The physical round remains playable without storage. */ }
  }
  function acquire(item) {
    if (hands.owner && hands.owner !== "waste") { showToast("Holster your cleaning tools before handling the bin."); return false; }
    hands.owner = "waste"; held = item; charge = 0; actionWaitRelease = true; return true;
  }
  function release() { placement.cancel(); held = null; charge = 0; if (hands.owner === "waste") hands.owner = null; }
  function recommendation(bin) {
    const occupied = new Set(bins.filter(other => other !== bin).map(other => other.data.room));
    if (!getRoomReady(bin.data.room)) return bin.data.room;
    return getNextBreaks().map(roomId).find(id => roomById(id) && !occupied.has(id)) ?? bin.data.room;
  }
  function roomNearby(id, x, z) { return wasteParkingCandidates(id).some(p => Math.hypot(p.x - x, p.z - z) < 1.55); }
  function updateBinCollider(bin) {
    Object.assign(bin.collider, { minX: bin.data.x - WASTE_BIN_RADIUS, maxX: bin.data.x + WASTE_BIN_RADIUS,
      minZ: bin.data.z - WASTE_BIN_RADIUS, maxZ: bin.data.z + WASTE_BIN_RADIUS });
  }
  function depositTrash(id, count) {
    const bin = bins.find(item => item.data.id === id);
    if (!bin || !bin.data.lined || !finite(count) || count <= 0) return 0;
    const accepted = Math.min(count, Math.max(0, WASTE_CAPACITY - bin.data.fill - bin.reserved));
    bin.data.fill += accepted;
    if (accepted) { syncVisuals(); save(); }
    return accepted;
  }
  function getBinTargets() { return bins.filter(bin => bin.data.lined).map(bin => ({ id: bin.data.id, position: [bin.data.x, BIN_TOP, bin.data.z], radius: .4, ignoreColliderId: bin.collider.id, capacity: WASTE_CAPACITY, fill: bin.data.fill })); }
  function onTheaterBreak(id) {
    if (scheduledCustomers) return;
    const room = roomId(id);
    if (!roomById(room) || state.breakQueue.some(event => event.room === room)) return;
    state.breakQueue.push({ room, remaining: 6 }); save();
  }
  function enableScheduledCustomers() {
    scheduledCustomers = true; state.breakQueue = [];
    if (customer && !customer.external) { customer.bin.reserved -= customer.units; customer = null; }
    syncVisuals();
  }
  function getCustomerDisposalTarget(position, theaterId = null) {
    const p = position?.isVector3 ? position : new THREE.Vector3(...position);
    const candidates = bins.filter(bin => bin.data.lined && bin.data.fill + bin.reserved < WASTE_CAPACITY && held?.id !== bin.data.id)
      .sort((a, b) => (a.data.room === roomId(theaterId) ? -4 : 0) + Math.hypot(a.data.x - p.x, a.data.z - p.z)
        - ((b.data.room === roomId(theaterId) ? -4 : 0) + Math.hypot(b.data.x - p.x, b.data.z - p.z)));
    for (const bin of candidates) {
      if (Math.hypot(bin.data.x - p.x, bin.data.z - p.z) > 18) continue;
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const stand = new THREE.Vector3(bin.data.x + dx * 1.04, 0, bin.data.z + dz * 1.04);
        if (!collisionWorld.isOverlapping(stand, .23, 0, 1.7)
          && clear(stand.clone().setY(1.3), new THREE.Vector3(bin.data.x, 1.12, bin.data.z), bin.collider))
          return { binId: bin.data.id, position: [bin.data.x, BIN_TOP, bin.data.z], stand: stand.toArray(), room: bin.data.room };
      }
    }
    return null;
  }
  function throwCustomerTrash({ binId, from, units = 8, shape = 0, sourceColliderId = null }) {
    if (customer || !finite(units) || units <= 0) return false;
    const bin = bins.find(item => item.data.id === binId), start = from?.isVector3 ? from.clone() : new THREE.Vector3(...from);
    if (!bin?.data.lined || held?.id === binId || start.distanceTo(new THREE.Vector3(bin.data.x, BIN_TOP, bin.data.z)) > 2.1
      || collisionWorld.colliders.some(c => c.enabled !== false && c !== bin.collider && c.id !== sourceColliderId
        && segmentHitsBox(start, new THREE.Vector3(bin.data.x, BIN_TOP, bin.data.z), c))) return false;
    const accepted = Math.min(units, WASTE_CAPACITY - bin.data.fill - bin.reserved); if (accepted <= 0) return false;
    bin.reserved += accepted;
    customer = { bin, units: accepted, start, shape: Math.abs(Math.round(shape)) % 3, t: 0, external: true };
    syncVisuals(); return true;
  }
  function locateFocus() {
    focus = null; camera.getWorldDirection(look); ray.set(camera.position, look); let best = Infinity;
    const candidates = [];
    for (const bin of bins) {
      bin.group.updateWorldMatrix(true, false);
      const toWorld = p => bin.group.localToWorld(new THREE.Vector3(...p));
      candidates.push({ kind: "handle", bin, p: toWorld([0, 1.14, -.43]), radius: .24, ignored: bin.collider });
      candidates.push({ kind: "mouth", bin, p: toWorld([0, 1.02, 0]), radius: .29, ignored: bin.collider });
      candidates.push({ kind: "spare", bin, p: toWorld([.36, .74, -.20]), radius: .16, ignored: bin.collider });
    }
    for (const bag of state.bags) if (bag.phase === "ground") candidates.push({ kind: "bag", bag, p: new THREE.Vector3(bag.x, bag.y, bag.z), radius: .32, ignored: bagModels.get(bag.id).collider });
    for (const liner of state.looseLiners) candidates.push({ kind: "loose-liner", liner,
      p: new THREE.Vector3(...liner.position).add(new THREE.Vector3(0, .045, 0)), radius: .28 });
    candidates.push({ kind: "stock", p: new THREE.Vector3(WASTE_STOCK.x, WASTE_STOCK.y, WASTE_STOCK.z), radius: .33, ignored: ownedColliders.find(c => c.id === "waste-spare-stock") });
    for (const candidate of candidates) {
      const distance = camera.position.distanceTo(candidate.p);
      const along = candidate.p.clone().sub(camera.position).dot(look);
      const aimError = ray.distanceToPoint(candidate.p);
      if (distance > 2 || along <= 0 || aimError > candidate.radius || !clear(camera.position, candidate.p, candidate.ignored)) continue;
      const score = aimError / candidate.radius + distance * .08;
      if (score < best) { best = score; focus = candidate; }
    }
  }
  function handPosition(height = -.52) {
    camera.getWorldDirection(look); forward.set(look.x, 0, look.z).normalize();
    return camera.position.clone().addScaledVector(forward, .62).add(new THREE.Vector3(0, height, 0));
  }
  function moveHeldBag(bag, dt) {
    const target = handPosition();
    if (bag.phase === "lifting") {
      bag.lift = Math.min(1, (bag.lift ?? 0) + dt / .95);
      if (bag.lift < .48) target.set(bag.fromX, 1.57, bag.fromZ);
      else if (bag.lift >= 1) bag.phase = "held";
    }
    if (bag.phase === "held" && collisionWorld.isOverlapping(target, BAG_RADIUS, target.y - BAG_HALF_HEIGHT, BAG_HALF_HEIGHT * 2)) {
      const object = bagModels.get(bag.id).group; object.position.copy(target);
      const resolved = resolveHeldPose({ object, camera, colliders: collisionWorld.colliders, ignoreIds: [bag.id] });
      target.copy(resolved.position);
    }
    const origin = new THREE.Vector3(bag.x, bag.y, bag.z), delta = target.sub(origin);
    if (delta.length() > 3 * dt) delta.setLength(3 * dt);
    const next = origin.add(delta);
    const ignored = bag.phase === "lifting" ? bins.find(b => b.data.id === bag.fromBin)?.collider : null;
    const valid = withoutCollider(bagModels.get(bag.id).collider, () => withoutCollider(ignored, () =>
      !collisionWorld.isOverlapping(next, BAG_RADIUS, next.y - BAG_HALF_HEIGHT, BAG_HALF_HEIGHT * 2)));
    if (valid && clear({ x: bag.x, y: bag.y, z: bag.z }, next, ignored)) {
      bag.x = next.x; bag.y = next.y; bag.z = next.z;
    }
    if (Math.hypot(camera.position.x - bag.x, camera.position.z - bag.z) > 2.1) {
      bag.phase = "falling"; bag.vx = bag.vy = bag.vz = 0; release(); showToast("The bag caught on the doorway and was set down.");
    }
  }
  function moveBins(dt) {
    for (const bin of bins) {
      const b = bin.data; let gripping = held?.kind === "bin" && held.id === b.id;
      let dx, dz;
      if (gripping) {
        if (Math.hypot(camera.position.x - b.x, camera.position.z - b.z) > 4 || camera.position.y > 2.3) { release(); gripping = false; showToast("Your grip released. Walk back to the bin handle."); }
        else {
          camera.getWorldDirection(look); forward.set(look.x, 0, look.z).normalize();
          const tx = camera.position.x + forward.x * 1.03, tz = camera.position.z + forward.z * 1.03;
          // A constrained grip follows walking immediately, without a slow
          // spring or a speed cap below the player's walking pace.
          dx = tx - b.x; dz = tz - b.z;
        }
      } else { b.vx *= Math.exp(-5 * dt); b.vz *= Math.exp(-5 * dt); }
      const speed = Math.hypot(b.vx, b.vz);
      if (speed > 2.15) { b.vx *= 2.15 / speed; b.vz *= 2.15 / speed; }
      const oldX = b.x, oldZ = b.z, candidate = { x: b.x, y: 0, z: b.z };
      withoutCollider(bin.collider, () => collisionWorld.moveCircle(candidate, dx ?? b.vx * dt, dz ?? b.vz * dt, WASTE_BIN_RADIUS, .025, BIN_TOP));
      if (Math.abs(groundAt(candidate.x, candidate.z) ?? Infinity) > .06
        || Math.hypot(candidate.x - camera.position.x, candidate.z - camera.position.z) < .735) { b.vx = b.vz = 0; }
      else { b.x = candidate.x; b.z = candidate.z; if (Math.abs(b.x - oldX) < .000001) b.vx = 0; if (Math.abs(b.z - oldZ) < .000001) b.vz = 0; }
      const moved = Math.hypot(b.x - oldX, b.z - oldZ);
      if (gripping) {
        b.vx = clamp((b.x - oldX) / dt, -4.8, 4.8); b.vz = clamp((b.z - oldZ) / dt, -4.8, 4.8);
        // When the can hits a wall, hold the player's end of the handle too.
        // Both bodies remain swept against the world instead of clipping.
        const handle = { x: b.x - forward.x * 1.03, y: 0, z: b.z - forward.z * 1.03 };
        const feet = { x: camera.position.x, y: 0, z: camera.position.z };
        updateBinCollider(bin);
        if (controller && Math.hypot(handle.x - feet.x, handle.z - feet.z) > .015) {
          collisionWorld.moveCircle(feet, handle.x - feet.x, handle.z - feet.z, controller.radius ?? .28, 0, controller.bodyHeight ?? 1.8);
          if (Math.abs(groundAt(feet.x, feet.z) ?? Infinity) < .06) controller.setPosition([feet.x, 0, feet.z], { resetVelocity: false, depenetrate: false });
        }
      }
      if (moved > .00001) {
        if (gripping) b.yaw = Math.atan2(forward.x, forward.z);
        for (const wheel of bin.wheels) { wheel.caster.rotation.y = Math.atan2(b.vx, b.vz) - b.yaw; wheel.wheel.rotation.x -= moved / .085; }
      }
      updateBinCollider(bin);
    }
  }
  function insideGondola(bag, margin = BAG_RADIUS) {
    return Math.abs(bag.x - WASTE_GONDOLA.x) < gw / 2 - margin && Math.abs(bag.z - WASTE_GONDOLA.z) < gd / 2 - margin;
  }
  function moveBags(dt) {
    for (const bag of state.bags) {
      if (["held", "lifting"].includes(bag.phase)) { moveHeldBag(bag, dt); continue; }
      if (!["falling", "gondola"].includes(bag.phase)) continue;
      const previousBottom = bag.y - BAG_HALF_HEIGHT;
      bag.vy -= 9.81 * dt;
      const candidate = { x: bag.x, y: bag.y, z: bag.z };
      const bagCollider = bagModels.get(bag.id).collider;
      const allowGondola = bag.phase === "gondola" || (insideGondola(bag) && previousBottom >= gh - .08);
      withoutCollider(bagCollider, () => {
        if (allowGondola) withoutCollider(gondolaCollider, () => collisionWorld.moveCircle(candidate, bag.vx * dt, bag.vz * dt, BAG_RADIUS, bag.y - BAG_HALF_HEIGHT, BAG_HALF_HEIGHT * 2));
        else collisionWorld.moveCircle(candidate, bag.vx * dt, bag.vz * dt, BAG_RADIUS, bag.y - BAG_HALF_HEIGHT, BAG_HALF_HEIGHT * 2);
      });
      if (Math.abs(candidate.x - bag.x) < 1e-8) bag.vx *= -.15;
      if (Math.abs(candidate.z - bag.z) < 1e-8) bag.vz *= -.15;
      bag.x = candidate.x; bag.z = candidate.z; bag.y += bag.vy * dt;
      if (bag.phase === "falling" && bag.tied && insideGondola(bag) && previousBottom >= gh - .08 && bag.y - BAG_HALF_HEIGHT <= gh && bag.vy < 0) bag.phase = "gondola";
      let floor = bag.phase === "gondola" ? .35 : groundAt(bag.x, bag.z, bag.y - BAG_HALF_HEIGHT) ?? 0;
      if (bag.phase !== "gondola") for (const c of collisionWorld.colliders) {
        if (c.enabled === false || c === bagCollider || bag.x + BAG_RADIUS <= c.minX || bag.x - BAG_RADIUS >= c.maxX || bag.z + BAG_RADIUS <= c.minZ || bag.z - BAG_RADIUS >= c.maxZ) continue;
        if (bag.vy < 0 && previousBottom >= c.maxY - .015 && bag.y - BAG_HALF_HEIGHT <= c.maxY) floor = Math.max(floor, c.maxY);
        if (bag.vy > 0 && bag.y + BAG_HALF_HEIGHT >= c.minY && bag.y + BAG_HALF_HEIGHT - bag.vy * dt <= c.minY) { bag.y = c.minY - BAG_HALF_HEIGHT; bag.vy = 0; }
      }
      if (bag.y - BAG_HALF_HEIGHT <= floor) {
        bag.y = floor + BAG_HALF_HEIGHT; bag.vx = bag.vy = bag.vz = 0;
        if (bag.phase === "gondola") { bag.phase = "disposed"; state.depositedBags++; showToast("Tied bag landed in the trash-room gondola."); save(); }
        else bag.phase = "ground";
      }
      bag.vx *= Math.exp(-.4 * dt); bag.vz *= Math.exp(-.4 * dt);
    }
  }
  function guestStep(dt) {
    if (!customer) {
      if (scheduledCustomers) return;
      const event = state.breakQueue.find(event => bins.some(bin => bin.data.room === event.room && roomNearby(event.room, bin.data.x, bin.data.z)));
      if (!event) return;
      const bin = bins.find(bin => bin.data.room === event.room && roomNearby(event.room, bin.data.x, bin.data.z));
      if (!bin.data.lined || bin.data.fill + bin.reserved >= WASTE_CAPACITY || held?.id === bin.data.id) return;
      const desired = [12, 18, 10, 22, 18, 16][6 - event.remaining];
      const units = Math.min(desired, WASTE_CAPACITY - bin.data.fill);
      bin.reserved += units;
      const approach = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)].find(d => {
        const p = { x: bin.data.x + d.x * 1.1, z: bin.data.z + d.z * 1.1, y: 0 };
        return !collisionWorld.isOverlapping(p, .23, 0, 1.7) && clear({ ...p, y: 1.3 }, { x: bin.data.x, y: 1.12, z: bin.data.z }, bin.collider);
      });
      if (!approach) { bin.reserved -= units; return; }
      customer = { bin, event, units, t: 0, start: new THREE.Vector3(bin.data.x + approach.x * 1.1, 1.28, bin.data.z + approach.z * 1.1), shape: event.remaining % 3 };
      customerRoot.position.set(customer.start.x, 0, customer.start.z); customerRoot.lookAt(bin.data.x, 0, bin.data.z);
    }
    customer.t += dt;
    const delay = customer.external ? 0 : .8, t = clamp((customer.t - delay) / .9, 0, 1);
    const end = new THREE.Vector3(customer.bin.data.x, .90, customer.bin.data.z);
    tossed.position.copy(customer.start).lerp(end, t); tossed.position.y += Math.sin(t * Math.PI) * .72;
    tossed.rotation.set(t * 3, t * 4, t * 2);
    if (customer.t >= delay + .9) {
      customer.bin.reserved -= customer.units;
      depositTrash(customer.bin.data.id, customer.units);
      if (customer.event) {
        customer.event.remaining--;
        if (customer.event.remaining <= 0) state.breakQueue.splice(state.breakQueue.indexOf(customer.event), 1);
      }
      customer = null;
    }
  }
  function actionStep(dt, action) {
    if (!held) return;
    if (!action) actionWaitRelease = false;
    if (held.kind === "bag") {
      const bag = state.bags.find(bag => bag.id === held.id);
      if (bag.phase !== "held") return;
      if (!bag.tied) {
        if (action && !actionWaitRelease) {
          charge = Math.min(1, charge + dt / 1.1);
          if (charge >= 1) { bag.tied = true; charge = 0; actionWaitRelease = true; showToast("Bag tied. Hold then release to throw it into the gondola."); save(); }
        }
      } else if (!actionWaitRelease) {
        if (action) charge = Math.min(1.2, charge + dt);
        else if (previousAction && charge > .04) {
          camera.getWorldDirection(look);
          bag.vx = look.x * (2.4 + charge * 3.2); bag.vz = look.z * (2.4 + charge * 3.2); bag.vy = 2.8 + clamp(look.y * 3, -1.5, 2.7) + charge;
          bag.phase = "falling"; release(); save();
        }
      }
    } else if (held.kind === "liner") {
      if (held.phase === "installing") {
        const fittingBin = bins.find(bin => bin.data.id === held.binId);
        const rim = new THREE.Vector3(fittingBin.data.x, BIN_TOP, fittingBin.data.z);
        if (camera.position.distanceTo(rim) > 2 || !clear(camera.position, rim, fittingBin.collider)) {
          held.phase = "opened"; charge = 0; showToast("Stay beside the empty can while fitting the liner."); return;
        }
        charge += dt;
        if (charge >= .75) { const bin = bins.find(bin => bin.data.id === held.binId); bin.data.lined = true; bin.data.fill = 0; release(); showToast("Fresh bag opened and fitted around the rim."); save(); }
      } else if (!held.open && action && !actionWaitRelease) { charge = Math.min(1, charge + dt / .8); if (charge >= 1) { held.open = true; charge = 0; actionWaitRelease = true; showToast("Liner opened. Fit it into an empty can at the rim."); } }
    }
  }
  function syncVisuals() {
    for (const bin of bins) {
      const b = bin.data; bin.group.position.set(b.x, 0, b.z); bin.group.rotation.y = b.yaw;
      bin.liner.visible = bin.linerBottom.visible = b.lined; bin.contents.visible = b.lined && b.fill > 0;
      bin.contents.position.y = .34 + .64 * b.fill / WASTE_CAPACITY;
      bin.contents.children.forEach((item, i) => { item.visible = i < Math.ceil(b.fill / 10); });
      bin.roll.visible = b.spares > 0;
      const next = recommendation(bin), key = `${b.room}/${Math.floor(b.fill)}/${b.lined}/${b.spares}/${next}`;
      if (key !== bin.labelKey) {
        bin.labelKey = key; const c = bin.label.canvas.getContext("2d");
        c.fillStyle = "#e0e3df"; c.fillRect(0, 0, 512, 256); c.textAlign = "center"; c.fillStyle = "#283432"; c.font = "bold 53px sans-serif";
        c.fillText(`THEATER ${roomNumber(b.room)}`, 256, 60); c.font = "bold 36px sans-serif";
        c.fillText(b.lined ? `${Math.round(b.fill / WASTE_CAPACITY * 100)}% FULL · ${b.fill >= 108 ? "CHANGE BAG" : "LINED"}` : "EMPTY · NEEDS LINER", 256, 112);
        c.fillStyle = "#344b43"; c.font = "29px sans-serif"; c.fillText(`SPARE BAGS: ${b.spares}`, 256, 161);
        c.fillText(next !== b.room ? `PUSH TO THEATER ${roomNumber(next)}` : "PARK BESIDE THE DOOR", 256, 213); bin.label.texture.needsUpdate = true;
      }
    }
    for (const bag of state.bags) {
      const model = bagModels.get(bag.id); model.group.position.set(bag.x, bag.y, bag.z); model.neck.scale.x = model.neck.scale.z = bag.tied ? .038 : .12;
      model.tie.visible = bag.tied; model.collider.enabled = bag.phase === "ground";
      Object.assign(model.collider, { minX: bag.x - BAG_RADIUS, maxX: bag.x + BAG_RADIUS, minZ: bag.z - BAG_RADIUS, maxZ: bag.z + BAG_RADIUS, minY: bag.y - BAG_HALF_HEIGHT, maxY: bag.y + BAG_HALF_HEIGHT });
    }
    freshLiner.visible = held?.kind === "liner";
    if (freshLiner.visible) {
      freshLiner.position.copy(handPosition());
      const opening = held.open ? 1 : charge;
      const rx = .09 + opening * .22, rz = .025 + opening * .18, height = .32 + opening * .22;
      freshBody.scale.set(rx, height, rz);
      freshMouth.position.y = height / 2; freshMouth.scale.set(rx, rz, .25);
      freshBottom.position.y = -height / 2; freshBottom.scale.set(rx * .4, .012, rz * .4);
      if (held.phase === "installing") {
        const b = bins.find(bin => bin.data.id === held.binId).data;
        freshLiner.position.lerp(new THREE.Vector3(b.x, .88, b.z), clamp(charge / .75, 0, 1));
      } else resolveHeldPose({ object: freshLiner, camera, colliders: collisionWorld.colliders });
    }
    for (const [id, model] of linerModels) if (!state.looseLiners.some(item => item.id === id)) { model.removeFromParent(); linerModels.delete(id); }
    for (const liner of state.looseLiners) {
      let model = linerModels.get(liner.id);
      if (!model) {
        model = new THREE.Group(); model.name = liner.id; root.add(model);
        box(model, `${liner.id}-folded-clean-liner`, [0, .025, 0], [.32, .045, .24], mat.bag);
        for (const x of [-.08, 0, .08]) box(model, `${liner.id}-fold`, [x, .049, 0], [.012, .008, .23], mat.gray);
        linerModels.set(liner.id, model);
      }
      model.position.fromArray(liner.position);
    }
    customerRoot.visible = Boolean(customer && !customer.external); tossed.visible = Boolean(customer);
    if (customer) { tossCup.visible = customer.shape === 0; tossBox.visible = customer.shape === 1; tossBag.visible = customer.shape === 2; }
    root.updateMatrixWorld(true);
  }
  function interact() {
    if (!active || disposed) return false;
    if (placement.active) return confirmPlacement();
    locateFocus(); if (!focus) return false;
    if (hands.owner && hands.owner !== "waste") return false;
    if (held?.kind === "bin") return returnTool();
    if (held?.kind === "liner") {
      if (focus.kind !== "mouth" || focus.bin.data.lined) return false;
      if (!held.open) { showToast("Hold to open the spare liner first."); return true; }
      held.phase = "installing"; held.binId = focus.bin.data.id; charge = 0; return true;
    }
    if (held) return false;
    if (focus.kind === "handle") {
      if (customer?.bin === focus.bin) { showToast("Let the guest finish the toss before moving the can."); return true; }
      if (acquire({ kind: "bin", id: focus.bin.data.id })) {
        const b = focus.bin.data; camera.getWorldDirection(look); forward.set(look.x, 0, look.z).normalize();
        const feet = { x: camera.position.x, y: 0, z: camera.position.z };
        collisionWorld.moveCircle(feet, b.x - forward.x * 1.03 - feet.x, b.z - forward.z * 1.03 - feet.z, controller?.radius ?? .28, 0, 1.8);
        if (controller && Math.abs(groundAt(feet.x, feet.z) ?? Infinity) < .06) controller.setPosition([feet.x, 0, feet.z], { depenetrate: false });
        showToast("Handle gripped. The can follows your movement; Q releases.");
      }
    } else if (focus.kind === "mouth") {
      const bin = focus.bin, b = bin.data;
      if (!b.lined) { showToast("Take a stored spare bag from the side, open it, then fit the rim."); return true; }
      if (b.fill < WASTE_CAPACITY * .9) { showToast(`Can is ${Math.round(b.fill / WASTE_CAPACITY * 100)}% full. Leave the liner until it is full.`); return true; }
      if (bin.reserved) { showToast("A guest is putting rubbish into this can."); return true; }
      const bag = { id: `waste-bag-${state.nextBag++}`, x: b.x, y: .73, z: b.z, fromX: b.x, fromZ: b.z, fromBin: b.id, lift: 0,
        units: b.fill, tied: false, phase: "lifting", vx: 0, vy: 0, vz: 0 };
      if (acquire({ kind: "bag", id: bag.id })) { state.bags.push(bag); makeBag(bag); b.fill = 0; b.lined = false; showToast("Lifted the full liner. Hold to tie the bag before carrying it to the gondola."); }
    } else if (focus.kind === "spare" || focus.kind === "stock") {
      if (focus.bin && focus.bin.data.spares === 0) { showToast("Spare liners are stored inside the trash room."); return true; }
      if (acquire({ kind: "liner", open: false, phase: "folded", sourceBinId: focus.bin?.data.id ?? null })) { if (focus.bin) focus.bin.data.spares--; showToast("Spare bag taken. Hold to shake it open."); }
    } else if (focus.kind === "bag") {
      if (acquire({ kind: "bag", id: focus.bag.id })) { focus.bag.phase = "held"; focus.bag.vx = focus.bag.vy = focus.bag.vz = 0; }
    } else if (focus.kind === "loose-liner") {
      const liner = focus.liner;
      if (acquire({ kind: "liner", open: liner.open, phase: liner.open ? "opened" : "folded", sourceBinId: liner.sourceBinId }))
        state.looseLiners = state.looseLiners.filter(item => item.id !== liner.id);
    }
    syncVisuals(); save(); return true;
  }
  function returnTool() {
    if (!held || hands.owner !== "waste") return false;
    if (held.kind !== "bin") return togglePlacement();
    if (held.kind === "bin") {
      const bin = bins.find(bin => bin.data.id === held.id), next = recommendation(bin);
      if (next !== bin.data.room && roomNearby(next, bin.data.x, bin.data.z)) { bin.data.room = next; showToast(`Can parked beside Theater ${roomNumber(next)}.`); }
    }
    release(); syncVisuals(); save(); return true;
  }
  function beginPlacement() {
    if (!active || !held || held.kind === "bin" || hands.owner !== "waste") return false;
    if (held.kind === "liner" && state.looseLiners.length >= 48) { showToast("Use a placed spare liner before opening more."); return false; }
    charge = 0; previousAction = false; actionWaitRelease = true;
    if (held.kind === "liner") held.phase = held.open ? "opened" : "folded";
    return placement.begin(held.kind === "bag" ? { size: [.60, .72, .60], shape: "round", ignoreIds: [held.id] } : { size: [.32, .06, .24] });
  }
  function cancelPlacement() { return placement.cancel(); }
  function togglePlacement() { return placement.active ? cancelPlacement() : beginPlacement(); }
  function confirmPlacement() {
    if (!active || !placement.active || !held) return false;
    const p = placement.confirm(); if (!p) { showToast(placement.snapshot.reason); return false; }
    if (held.kind === "bag") {
      const bag = state.bags.find(b => b.id === held.id); Object.assign(bag, { x: p.x, y: p.y + BAG_HALF_HEIGHT, z: p.z, phase: "ground", vx: 0, vy: 0, vz: 0 });
    } else state.looseLiners.push({ id: `placed-liner-${state.nextLiner++}`, position: p.toArray(), open: held.open, sourceBinId: held.sourceBinId });
    release(); syncVisuals(); save(); showToast("Placed. Aim at it to pick it up again."); return true;
  }
  function update(delta, input = {}) {
    if (disposed) return;
    if (input.cancelAction) { previousAction = false; charge = 0; actionWaitRelease = true; }
    active = Boolean(input.active);
    if (!active) { accumulator = 0; focus = null; previousAction = false; actionWaitRelease = true; return; }
    const dt = finite(delta) ? clamp(delta, 0, .1) : 0, action = Boolean(input.action && !placement.active);
    accumulator += dt;
    while (accumulator >= STEP - 1e-9) { moveBins(STEP); moveBags(STEP); actionStep(STEP, action); guestStep(STEP); accumulator -= STEP; }
    previousAction = action; syncVisuals(); locateFocus(); placement.update();
    saveElapsed += dt; if (saveElapsed >= 1) { saveElapsed = 0; save(); }
  }
  syncVisuals();
  return {
    root, update, interact, returnTool, getBinTargets, depositTrash, onTheaterBreak,
    getCustomerDisposalTarget, throwCustomerTrash, enableScheduledCustomers,
    beginPlacement, togglePlacement, cancelPlacement, confirmPlacement,
    get placementActive() { return placement.active; },
    get canPlace() { return Boolean(held && held.kind !== "bin"); },
    get heldTool() { if (!held) return null; if (held.kind === "bin") return "rolling bin"; if (held.kind === "liner") return "fresh liner"; return state.bags.find(b => b.id === held.id)?.tied ? "tied trash bag" : "untied trash bag"; },
    get focusDistance() { return focus ? camera.position.distanceTo(focus.p) : Infinity; },
    get actionLabel() { return held?.kind === "bag" ? (state.bags.find(b => b.id === held.id)?.tied ? "HOLD / RELEASE TO THROW" : "HOLD TO TIE BAG") : held?.kind === "liner" ? "HOLD TO OPEN LINER" : "WALK TO PUSH"; },
    get focusedPrompt() {
      if (placement.active) return placement.snapshot.reason;
      if (!focus || (hands.owner && hands.owner !== "waste")) return "";
      if (held?.kind === "bin") return "Release rolling can";
      if (held?.kind === "liner") return focus.kind === "mouth" && !focus.bin.data.lined ? held.open ? "Fit opened liner around rim" : "Open liner before fitting" : "";
      if (held) return "";
      if (focus.kind === "handle") return `Push Theater ${roomNumber(focus.bin.data.room)} can`;
      if (focus.kind === "spare") return "Take stored spare bag";
      if (focus.kind === "stock") return "Take fresh bag from trash-room stock";
      if (focus.kind === "bag") return focus.bag.tied ? "Lift tied trash bag" : "Lift bag to tie it";
      if (focus.kind === "loose-liner") return "Pick up the spare liner";
      return !focus.bin.data.lined ? "Empty can · needs an opened liner" : focus.bin.data.fill >= 108 ? "Lift full trash bag" : `Inspect can · ${Math.round(focus.bin.data.fill / WASTE_CAPACITY * 100)}% full`;
    },
    get hint() {
      if (placement.active) return placement.snapshot.reason;
      if (held?.kind === "bin") { const bin = bins.find(b => b.data.id === held.id), next = recommendation(bin); return `Walk to push · Q releases. ${next !== bin.data.room ? `Next: Theater ${roomNumber(next)}.` : "Park beside the doorway."}`; }
      if (held?.kind === "bag") return state.bags.find(b => b.id === held.id)?.tied ? "Carry to the trash-room gondola · hold, then release to throw · Q sets down." : "Hold to tie the lifted bag · Q sets it down.";
      if (held?.kind === "liner") return held.open ? "Aim at an empty can's rim and fit the opened liner." : "Hold to open the spare bag.";
      return "Three rolling cans · push them to upcoming theater breaks. Spare liners are on each can.";
    },
    getSnapshot() { return { bins: state.bins.map(b => ({ ...b, reserved: bins.find(bin => bin.data.id === b.id).reserved, recommendation: recommendation(bins.find(bin => bin.data.id === b.id)) })),
      bags: state.bags.map(b => ({ ...b })), looseLiners: state.looseLiners.map(item => ({ ...item, position: [...item.position] })),
      held: held ? { ...held } : null, focus: focus?.kind ?? null, depositedBags: state.depositedBags, placement: placement.snapshot,
      heldVisible: held?.kind === "liner" ? freshLiner.visible : held?.kind === "bag" ? bagModels.get(held.id)?.group.visible : Boolean(held),
      customer: customer ? { room: customer.event?.room ?? customer.bin.data.room, external: Boolean(customer.external), progress: customer.t, units: customer.units, binId: customer.bin.data.id } : null,
      breakQueue: state.breakQueue.map(q => ({ ...q })), gondola: { ...WASTE_GONDOLA }, stock: { ...WASTE_STOCK } }; },
    dispose() { if (disposed) return; disposed = true; save(); release(); placement.dispose(); root.removeFromParent(); for (const collider of ownedColliders) collisionWorld.remove(collider);
      for (const value of geometries) value.dispose(); for (const value of materials) value.dispose(); for (const value of textures) value.dispose(); },
  };
}
