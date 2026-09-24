import * as THREE from "three";
import { SERVICE_ROOMS, FOUNTAIN_PLAN } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";
import { segmentHitsBox } from "./visit-state.js";
import { BIB_TYPES, SUPPLY_TYPES, SUPPLY_SAVE_KEY, createSuppliesState,
  restoreSuppliesState, serializeSuppliesState, stepSuppliesState } from "./usher-supplies-state.js";

const point = (x, y, z) => new THREE.Vector3(planToWorldX(x), y, z);
const clone = value => JSON.parse(JSON.stringify(value));
const room = SERVICE_ROOMS.find(item => item.id === "future-task-room");
const roomBack = room.bounds.zMax;
const owner = "supplies";

/** Physical stock handling. The caller supplies input, one shared hand owner, and a small contextual prompt. */
export function createUsherSupplies({ scene, world, camera, collisionWorld, showToast = () => {},
  hands = { owner: null }, storage, timeScale = 5 }) {
  let state;
  try { state = restoreSuppliesState(storage?.getItem(SUPPLY_SAVE_KEY)); } catch { state = createSuppliesState(); }
  const root = new THREE.Group(); root.name = "usher-BIB-and-supplies"; scene.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set(), ownColliders = [];
  const geo = item => { geometries.add(item); return item; };
  const mat = (color, options = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .75, ...options }); materials.add(m); return m; };
  const finish = { steel: mat(0xa0adb3, { metalness: .65, roughness: .38 }), dark: mat(0x253037),
    board: mat(0xb49060), paper: mat(0xe6dec4), tray: mat(0x54666a), dirt: mat(0x71502d),
    water: mat(0x77c2d6, { transparent: true, opacity: .60 }), green: mat(0x57b689), red: mat(0xc55643) };
  const colors = Object.fromEntries([...BIB_TYPES, ...SUPPLY_TYPES].map(type => [type.id, mat(type.color)]));
  const boxGeo = geo(new THREE.BoxGeometry(1, 1, 1)), cylinderGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 12));
  const planeGeo = geo(new THREE.PlaneGeometry(1, 1));
  function box(parent, id, p, size, material, movable = false) {
    const mesh = new THREE.Mesh(boxGeo, material); mesh.name = id;
    mesh.position.copy(p?.isVector3 ? p : new THREE.Vector3(...p)); mesh.scale.set(...size);
    mesh.castShadow = !movable; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rod(parent, id, from, to, radius, material, movable = false) {
    const mesh = new THREE.Mesh(cylinderGeo, material); mesh.name = id; mesh.castShadow = !movable; parent.add(mesh);
    setRod(mesh, from, to, radius); return mesh;
  }
  function setRod(mesh, from, to, radius) {
    const a = from?.isVector3 ? from : new THREE.Vector3(...from), b = to?.isVector3 ? to : new THREE.Vector3(...to);
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  function label(parent, id, p, width, height, yaw = Math.PI) {
    const canvas = globalThis.OffscreenCanvas ? new OffscreenCanvas(512, 192)
      : Object.assign(document.createElement("canvas"), { width: 512, height: 192 });
    const ctx = canvas.getContext("2d"), texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }); materials.add(material);
    const mesh = new THREE.Mesh(planeGeo, material); mesh.name = id;
    mesh.position.copy(p?.isVector3 ? p : new THREE.Vector3(...p)); mesh.scale.set(width, height, 1); mesh.rotation.y = yaw; parent.add(mesh);
    let last = "";
    return { mesh, dispose() { texture.dispose(); material.dispose(); textures.delete(texture); materials.delete(material); }, draw(title, detail = "", color = "#77bcaa") {
      const signature = `${title}/${detail}/${color}`; if (signature === last) return; last = signature;
      ctx.fillStyle = "#19282b"; ctx.fillRect(0, 0, 512, 192); ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 12);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff5df"; ctx.font = "bold 43px sans-serif"; ctx.fillText(title, 256, 81, 486);
      ctx.font = "30px sans-serif"; ctx.fillText(detail, 256, 141, 482); texture.needsUpdate = true;
    } };
  }
  function collider(id, p, size) {
    const center = p?.isVector3 ? p : new THREE.Vector3(...p);
    const c = { id, minX: center.x - size[0] / 2, maxX: center.x + size[0] / 2,
      minY: center.y - size[1] / 2, maxY: center.y + size[1] / 2,
      minZ: center.z - size[2] / 2, maxZ: center.z + size[2] / 2 };
    const result = collisionWorld?.addBox(c) ?? c; ownColliders.push(result); return result;
  }
  const targets = [];
  function target(id, position, stand, radius = .22, ignore = "") {
    const t = { id, position, stand, radius, ignore }; targets.push(t); return t;
  }
  function carton(id, type, kind) {
    const group = new THREE.Group(); group.name = id;
    box(group, `${id}-bottom`, [0, -.21, 0], [.60, .035, .45], finish.board, true);
    for (const x of [-.289, .289]) box(group, `${id}-side`, [x, 0, 0], [.022, .44, .45], finish.board, true);
    for (const z of [-.214, .214]) box(group, `${id}-end`, [0, 0, z], [.60, .44, .022], finish.board, true);
    const content = box(group, `${id}-contents`, [0, 0, 0], [.54, .38, .39], colors[type] ?? finish.paper, true);
    const text = label(group, `${id}-label`, [0, .01, -.231], .54, .20);
    return { group, content, text, dispose() { text.dispose(); group.removeFromParent(); }, set(amount) {
      content.visible = amount > .002; content.scale.y = Math.max(.004, .38 * amount); content.position.y = -.18 + .19 * amount;
      const title = [...BIB_TYPES, ...SUPPLY_TYPES].find(item => item.id === type)?.label ?? "CARTON";
      text.draw(title, kind === "bib" ? `${Math.round(amount * 100)}% SYRUP` : `${Math.round(amount * 100)}% LEFT`);
    } };
  }
  function tray(id) {
    const group = new THREE.Group(); group.name = id;
    box(group, `${id}-base`, [0, 0, 0], [.48, .025, .34], finish.tray, true);
    for (const x of [-.235, .235]) box(group, `${id}-rim`, [x, .018, 0], [.018, .038, .35], finish.tray, true);
    for (const z of [-.166, .166]) box(group, `${id}-rim`, [0, .018, z], [.48, .038, .018], finish.tray, true);
    const dirt = [];
    for (let i = 0; i < 9; i++) dirt.push(box(group, `${id}-soil-${i}`, [((i % 3) - 1) * .10, .015, (Math.floor(i / 3) - 1) * .085], [.052, .004, .043], finish.dirt, true));
    return { group, dispose() { group.removeFromParent(); }, set(amount) { dirt.forEach((mesh, i) => { mesh.visible = i < Math.ceil(amount * dirt.length); }); } };
  }

  // Back-wall syrup rack: the broad center aisle and the original door remain clear.
  const rackId = "supplies-BIB-rack", rackZ = roomBack - .65;
  collider(rackId, point(1.95, 1.05, rackZ), [4.5, 2.1, .78]);
  for (const y of [.29, .92, 1.72]) box(root, `${rackId}-shelf-${y}`, point(1.95, y, rackZ), [4.5, .055, .78], finish.steel);
  for (const x of [-.25, 4.15]) for (const z of [rackZ - .35, rackZ + .35]) box(root, `${rackId}-post`, point(x, 1.02, z), [.065, 2.04, .065], finish.steel);
  const bibViews = BIB_TYPES.map((type, index) => {
    const x = .45 + index * 1.5, installed = carton(`bib-${type.id}-installed`, type.id, "bib"), spare = carton(`bib-${type.id}-spare`, type.id, "bib");
    installed.group.position.copy(point(x, 1.20, rackZ)); spare.group.position.copy(point(x, .56, rackZ)); root.add(installed.group, spare.group);
    const port = point(x + .28, 1.06, rackZ - .25);
    const hose = rod(root, `bib-${type.id}-hose`, point(x + .48, 1.91, rackZ), port, .024, finish.dark, true);
    const connector = box(root, `bib-${type.id}-connector`, port, [.14, .12, .10], finish.green, true);
    const gaugeBack = point(x - .43, 1.21, rackZ - .37);
    box(root, `bib-${type.id}-gauge-back`, gaugeBack, [.14, .47, .06], finish.dark);
    const gauge = box(root, `bib-${type.id}-gauge-fill`, gaugeBack, [.09, .40, .07], colors[type.id], true);
    const sign = label(root, `bib-${type.id}-status`, point(x, 1.97, rackZ - .34), 1.16, .36);
    const stand = point(x, 0, rackZ - 1.28);
    target(`bib:${type.id}:hose`, point(x + .28, 1.06, rackZ - .32), stand, .13, rackId);
    target(`bib:${type.id}:box`, point(x - .10, 1.38, rackZ - .29), stand, .18, rackId);
    target(`bib:${type.id}:spare`, point(x, .57, rackZ - .29), stand, .20, rackId);
    return { installed, spare, hose, connector, gauge, sign, x, port };
  });

  const stockViews = SUPPLY_TYPES.map((type, index) => {
    const z = room.bounds.zMin + 1.4 + index * 1.05, x = room.bounds.xMin + .56, id = `supplies-stock-${type.id}`;
    collider(id, point(x, .75, z), [.79, 1.5, .75]);
    for (const y of [.26, .85]) box(root, `${id}-shelf`, point(x, y, z), [.79, .055, .75], finish.steel);
    const source = carton(id, type.id, "refill"); source.group.position.copy(point(x, 1.10, z)); source.group.rotation.y = Math.PI / 2; root.add(source.group);
    const reserve = box(root, `${id}-lower-stock`, point(x, .53, z), [.57, .44, .48], finish.board, true);
    const sign = label(root, `${id}-sign`, point(x + .42, 1.54, z), .65, .26, -Math.PI / 2);
    target(`stock:${type.id}`, point(x + .42, 1.11, z), point(x + 1.30, 0, z), .23, id);
    return { source, reserve, sign };
  });

  const dispenserViews = SUPPLY_TYPES.map((type, index) => {
    const x = 1.4 + index * 1.35, z = FOUNTAIN_PLAN.rearCounter.zMin + .14, id = `supplies-dispenser-${type.id}`;
    const base = 1.09;
    box(root, `${id}-base`, point(x, base + .035, z), [.88, .07, .51], finish.dark);
    for (const edgeX of [x - .41, x + .41]) box(root, `${id}-side`, point(edgeX, base + .18, z), [.045, .30, .51], finish.dark);
    box(root, `${id}-back`, point(x, base + .18, z + .24), [.88, .30, .045], finish.dark);
    const contents = [];
    for (let i = 0; i < 24; i++) {
      if (type.id === "lids") {
        const mesh = new THREE.Mesh(cylinderGeo, colors[type.id]); mesh.name = `${id}-lid-${i}`;
        mesh.scale.set(.105, .012, .105); mesh.position.copy(point(x + ((i % 3) - 1) * .24, base + .08 + Math.floor(i / 3) * .023, z)); root.add(mesh); contents.push(mesh);
      } else if (type.id === "straws") {
        contents.push(box(root, `${id}-straw-${i}`, point(x + ((i % 8) - 3.5) * .065, base + .09 + Math.floor(i / 8) * .075, z), [.045, .047, .38], colors[type.id], true));
      } else contents.push(box(root, `${id}-packet-${i}`, point(x + ((i % 6) - 2.5) * .11, base + .08 + Math.floor(i / 6) * .04, z), [.09, .025, .19], colors[type.id], true));
    }
    const sign = label(root, `${id}-label`, point(x, base + .14, z - .269), .79, .22);
    collider(id, point(x, base + .15, z), [.88, .30, .51]);
    target(`dispenser:${type.id}`, point(x, 1.40, z - .25), point(x, 0, FOUNTAIN_PLAN.rearCounter.zMin - .94), .28, id);
    return { contents, sign, pourPosition: point(x, 1.92, z - .04) };
  });

  const benchId = "supplies-tray-wash-bench", benchX = room.bounds.xMax - .76, sinkZ = room.bounds.zMin + 3.5;
  collider(benchId, point(benchX, .46, sinkZ), [1.18, .92, 3.1]);
  box(root, `${benchId}-top`, point(benchX, .89, sinkZ), [1.18, .07, 3.1], finish.steel);
  for (const x of [benchX - .51, benchX + .51]) for (const z of [sinkZ - 1.4, sinkZ + 1.4]) box(root, `${benchId}-leg`, point(x, .44, z), [.055, .86, .055], finish.steel);
  box(root, "supplies-sink-basin", point(benchX, .944, sinkZ), [.95, .05, .76], finish.dark);
  for (const x of [benchX - .52, benchX + .52]) box(root, "supplies-sink-rim", point(x, 1.0, sinkZ), [.08, .16, .92], finish.steel);
  for (const z of [sinkZ - .43, sinkZ + .43]) box(root, "supplies-sink-rim", point(benchX, 1.0, z), [1.1, .16, .06], finish.steel);
  const waterSurface = box(root, "supplies-sink-water", point(benchX, .98, sinkZ), [.92, .014, .74], finish.water, true);
  rod(root, "supplies-wash-tap", point(benchX + .40, .99, sinkZ + .24), point(benchX + .40, 1.52, sinkZ + .24), .032, finish.steel);
  rod(root, "supplies-wash-spout", point(benchX + .40, 1.52, sinkZ + .24), point(benchX, 1.52, sinkZ), .032, finish.steel);
  const waterStream = rod(root, "supplies-wash-water-stream", point(benchX, 1.47, sinkZ), point(benchX, 1.05, sinkZ), .025, finish.water, true);
  const trayViews = { dirty: [], clean: [] };
  for (const kind of ["dirty", "clean"]) for (let i = 0; i < 6; i++) {
    const model = tray(`supplies-${kind}-tray-${i}`); model.group.position.copy(point(benchX, .96 + i * .045, sinkZ + (kind === "dirty" ? -1.05 : 1.05)));
    model.set(kind === "dirty" ? 1 : 0); root.add(model.group); trayViews[kind].push(model);
  }
  for (const [id, offset, text] of [["dirty", -1.05, "DIRTY TRAYS"], ["sink", 0, "TRAY WASH"], ["clean", 1.05, "CLEAN TRAYS"]]) {
    label(root, `supplies-${id}-sign`, point(benchX - .61, .77, sinkZ + offset), .79, .25, Math.PI / 2).draw(text, id === "sink" ? "HOLD TO RINSE + SCRUB" : id === "dirty" ? "TAKE A TRAY TO WASH" : "PLACE ON THIS STACK");
    target(`tray:${id}`, point(benchX - .40, 1.08, sinkZ + offset), point(benchX - 1.33, 0, sinkZ + offset), .26, benchId);
  }
  const washPosition = point(benchX, 1.04, sinkZ);
  const binPosition = point(room.bounds.xMin + .78, .42, roomBack - .68);
  const binId = "supplies-carton-recycling";
  collider(binId, binPosition, [.73, .84, .72]);
  for (const x of [-.34, .34]) box(root, `${binId}-side`, binPosition.clone().add(new THREE.Vector3(x, 0, 0)), [.05, .84, .72], finish.dark);
  for (const z of [-.34, .34]) box(root, `${binId}-side`, binPosition.clone().add(new THREE.Vector3(0, 0, z)), [.73, .84, .05], finish.dark);
  box(root, `${binId}-bottom`, binPosition.clone().add(new THREE.Vector3(0, -.39, 0)), [.73, .06, .72], finish.dark);
  label(root, `${binId}-label`, binPosition.clone().add(new THREE.Vector3(0, 0, -.367)), .66, .26).draw("EMPTY CARTONS", "RECYCLE HERE");
  target("recycle", binPosition.clone().add(new THREE.Vector3(0, .36, -.25)), point(room.bounds.xMin + 1.6, 0, roomBack - 1.4), .29, binId);
  const instruction = label(root, "supplies-work-instructions", point(1.90, 2.54, roomBack - .12), 3.8, .75);
  instruction.draw("BIB + CONCESSION SUPPLIES", "DISCONNECT · EXCHANGE · CONNECT");
  const supplyFlow = Array.from({ length: 6 }, (_, i) => box(root, `supplies-pouring-${i}`, [0, 0, 0], [.035, .04, .03], finish.paper, true));

  const looseViews = new Map(), itemViews = new Map();
  let heldView = null, heldUid = null, active = false, disposed = false, focus = null, saveTimer = 0, phase = 0;
  let pouring = false, washing = false, safeTimer = 0;
  const look = new THREE.Vector3(), horizontal = new THREE.Vector3(), right = new THREE.Vector3(), viewRay = new THREE.Ray(), floorRay = new THREE.Raycaster();
  const heldBounds = new THREE.Box3();
  const blockers = () => collisionWorld?.colliders ?? world.colliders ?? [];
  function clearSegment(from, to, ignore = "") {
    return !blockers().some(c => c.enabled !== false && c.id !== ignore && segmentHitsBox(from, to, c));
  }
  function freeVolume(p, height = .5, radius = .33) {
    return !blockers().some(c => c.enabled !== false && p.x + radius > c.minX && p.x - radius < c.maxX
      && p.z + radius > c.minZ && p.z - radius < c.maxZ && p.y + height > c.minY + .002 && p.y < c.maxY - .002);
  }
  function floorAt(x, z, feetY) {
    const y = world.groundHeight(x, z, feetY);
    if (!Number.isFinite(y) || Math.abs(y - feetY) > .35) return null;
    floorRay.set(new THREE.Vector3(x, y + .15, z), new THREE.Vector3(0, -1, 0)); floorRay.near = .001; floorRay.far = .24;
    const hit = floorRay.intersectObject(world.root, true)[0];
    return hit && Math.abs(hit.point.y - y) < .035 ? new THREE.Vector3(x, y, z) : null;
  }
  function safeDrop() {
    camera.getWorldDirection(look); horizontal.copy(look).setY(0).normalize();
    if (horizontal.lengthSq() < .1) horizontal.set(0, 0, 1);
    const feetY = camera.position.y - 1.68;
    for (const turn of [0, -.65, .65, -1.2, 1.2, Math.PI]) {
      const direction = horizontal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      const p = floorAt(camera.position.x + direction.x * .90, camera.position.z + direction.z * .90, feetY);
      if (p && freeVolume(p) && clearSegment(camera.position, p.clone().add(new THREE.Vector3(0, .28, 0)))) return p;
    }
    return null;
  }
  // A stale or edited save cannot place cartons in walls or beyond real floors.
  state.loose = state.loose.filter(item => {
    const p = new THREE.Vector3(...item.position), floor = floorAt(p.x, p.z, p.y);
    if (floor && freeVolume(floor)) return true;
    // Recover quantities if an old save's resting point is now occupied. Do
    // not lose stock or trays, or re-create an object inside a wall/cabinet.
    if (item.kind === "tray") state[item.dirt > .001 ? "dirtyTrays" : "cleanTrays"]++;
    else if (item.amount > .001 && (item.kind !== "bib" || !item.used)) {
      const stock = (item.kind === "bib" ? state.bibs : state.stock).find(s => s.id === item.id);
      const reserves = item.kind === "bib" ? stock.spares : stock.reserves;
      if (reserves.length < 4) reserves.push(item.amount);
    }
    return false;
  });
  function save() { try { storage?.setItem(SUPPLY_SAVE_KEY, serializeSuppliesState(state)); } catch { /* Storage is optional. */ } }
  function makeItemView(item, id) {
    if (itemViews.has(item.uid)) return itemViews.get(item.uid);
    const model = item.kind === "tray" ? tray(id) : carton(id, item.id, item.kind);
    root.add(model.group); itemViews.set(item.uid, model); return model;
  }
  function sync() {
    state.bibs.forEach((b, i) => {
      const v = bibViews[i]; v.installed.group.visible = b.installed; v.installed.set(b.level);
      v.spare.group.visible = b.spares.length > 0; v.spare.set(b.spares[0] ?? 0);
      const end = b.connected && b.installed ? v.port : point(v.x + .51, .99, rackZ - .28);
      setRod(v.hose, point(v.x + .48, 1.91, rackZ), end, .024); v.connector.position.copy(end);
      v.connector.material = b.connected ? finish.green : finish.red;
      v.gauge.scale.y = Math.max(.008, .40 * b.level); v.gauge.position.y = .985 + .20 * b.level;
      v.sign.draw(BIB_TYPES[i].label, `${b.installed ? `${Math.round(b.level * 100)}%` : "EMPTY"} · ${b.connected ? "ON" : "HOSE OFF"} · ${b.spares.length} SPARES`);
    });
    state.stock.forEach((s, i) => {
      stockViews[i].source.group.visible = s.reserves.length > 0; stockViews[i].source.set(s.reserves[0] ?? 0);
      stockViews[i].reserve.visible = s.reserves.length > 1;
      stockViews[i].sign.draw(SUPPLY_TYPES[i].label, `${s.reserves.length} REFILL CARTONS`);
      dispenserViews[i].sign.draw(SUPPLY_TYPES[i].label, `${Math.round(s.level * 100)}% FULL`);
      dispenserViews[i].contents.forEach((mesh, n) => { mesh.visible = n < Math.ceil(s.level * 24); });
    });
    for (const kind of ["dirty", "clean"]) trayViews[kind].forEach((v, i) => { v.group.visible = i < state[`${kind}Trays`]; });
    for (const [uid, model] of itemViews) {
      model.group.visible = false;
      if (state.held?.uid !== uid && !state.loose.some(item => item.uid === uid)) { model.dispose(); itemViews.delete(uid); }
    }
    for (const [uid, v] of looseViews) if (!state.loose.some(item => item.uid === uid)) {
      if (v.collider) { collisionWorld?.remove(v.collider); ownColliders.splice(ownColliders.indexOf(v.collider), 1); } looseViews.delete(uid);
    }
    for (const item of state.loose) {
      let v = looseViews.get(item.uid);
      if (!v) {
        const model = makeItemView(item, `supplies-loose-${item.uid}`);
        const pos = new THREE.Vector3(...item.position); const height = item.kind === "tray" ? .07 : .46;
        v = { model, collider: collider(`supplies-loose-${item.uid}`, pos.clone().add(new THREE.Vector3(0, height / 2, 0)), [.61, height, .46]) };
        looseViews.set(item.uid, v);
      }
      v.model.group.visible = true;
      v.model.group.position.fromArray(item.position); v.model.group.position.y += item.kind === "tray" ? .035 : .23;
      v.model.set(item.kind === "tray" ? item.dirt : item.amount);
    }
    if (state.held?.uid !== heldUid) {
      heldUid = state.held?.uid ?? null; heldView = state.held ? makeItemView(state.held, `supplies-held-${state.held.uid}`) : null;
    }
    if (heldView) { heldView.group.visible = true; heldView.set(state.held.kind === "tray" ? state.held.dirt : state.held.amount); }
    waterStream.visible = washing; waterSurface.visible = true;
    supplyFlow.forEach(mesh => { mesh.visible = pouring; });
    root.updateMatrixWorld(true);
  }
  function availableTargets() {
    return [...targets.filter(t => {
      const parts = t.id.split(":");
      if (parts[0] === "bib" && parts[2] === "spare") return state.bibs.find(b => b.id === parts[1]).spares.length > 0;
      if (parts[0] === "stock") return state.stock.find(s => s.id === parts[1]).reserves.length > 0;
      if (t.id === "tray:dirty") return state.dirtyTrays > 0;
      return true;
    }), ...state.loose.map(item => ({ id: `loose:${item.uid}`, position: new THREE.Vector3(...item.position).add(new THREE.Vector3(0, item.kind === "tray" ? .06 : .27, 0)), radius: .28, ignore: `supplies-loose-${item.uid}` }))];
  }
  function locateFocus() {
    focus = null; camera.getWorldDirection(look); viewRay.set(camera.position, look);
    let closest = Infinity;
    for (const t of availableTargets()) {
      const offset = t.position.clone().sub(camera.position), along = offset.dot(look), distance = offset.length();
      if (along <= 0 || distance > 2.05 || viewRay.distanceToPoint(t.position) > t.radius || distance >= closest) continue;
      if (clearSegment(camera.position, t.position, t.ignore)) { focus = t; closest = distance; }
    }
  }
  function acquire(item) {
    if (state.held || (hands.owner && hands.owner !== owner)) { showToast("Set down the tool in your hands first."); return false; }
    const floor = safeDrop(); if (!floor) { showToast("Stand in the clear aisle to pick this up."); return false; }
    item.uid ??= state.nextId++; item.position = floor.toArray(); state.held = item; hands.owner = owner; return true;
  }
  function release() { state.held = null; if (hands.owner === owner) hands.owner = null; }
  function interact() {
    if (disposed || !active) return false;
    locateFocus(); if (!focus) return false;
    if (hands.owner && hands.owner !== owner) { showToast("Set down the tool in your hands first."); return true; }
    const [kind, id, part] = focus.id.split(":");
    if (kind === "loose") {
      const item = state.loose.find(item => item.uid === Number(id));
      if (item && !state.held) {
        // Remove its own obstruction before looking for another safe resting point.
        const v = looseViews.get(item.uid); if (v?.collider) v.collider.enabled = false;
        if (acquire(clone(item))) state.loose = state.loose.filter(candidate => candidate.uid !== item.uid);
        else if (v?.collider) v.collider.enabled = true;
      }
    } else if (kind === "bib") {
      const bib = state.bibs.find(b => b.id === id);
      if (part === "spare") {
        if (bib.spares.length && acquire({ kind: "bib", id, amount: bib.spares[0], used: false })) bib.spares.shift();
      } else if (part === "hose") {
        if (state.held) showToast("Set down the carton so both hands can operate the connector.");
        else if (!bib.installed) showToast("Place a matching full BIB in the empty rack slot first.");
        else {
          bib.connected = !bib.connected;
          if (bib.connected && bib.pendingConnection) { bib.exchanges++; bib.pendingConnection = false; }
          showToast(bib.connected ? "Hose connected. Syrup supply restored." : "Hose disconnected. Lift out the depleted box.");
        }
      } else if (bib.installed) {
        if (bib.connected) showToast("Disconnect this flavor's hose before removing its carton.");
        else if (bib.level > .10) showToast("This BIB still has syrup. Reconnect its hose.");
        else if (acquire({ kind: "bib", id, amount: bib.level, used: true })) {
          bib.installed = false; bib.level = 0; bib.pendingConnection = false;
        }
      } else if (state.held?.kind === "bib" && state.held.id === id && !state.held.used && state.held.amount > .10) {
        bib.installed = true; bib.level = state.held.amount; bib.connected = false; bib.pendingConnection = true; release();
        showToast("Box seated in the rack. Connect the matching hose.");
      } else showToast("Carry this flavor's full spare carton to the empty slot.");
    } else if (kind === "stock") {
      const stock = state.stock.find(item => item.id === id);
      if (stock.reserves.length && acquire({ kind: "refill", id, amount: stock.reserves[0] })) stock.reserves.shift();
    } else if (kind === "dispenser") showToast(state.held?.kind === "refill" && state.held.id === id
      ? "Aim at the dispenser and hold the action button to pour." : "Bring the matching refill carton from the BIB room.");
    else if (focus.id === "recycle") {
      if (state.held && ((state.held.kind === "bib" && state.held.used) || (state.held.kind === "refill" && state.held.amount <= .001))) {
        release(); showToast("Empty carton recycled.");
      } else showToast("Only depleted cartons go in this recycling crate.");
    } else if (focus.id === "tray:dirty") {
      if (state.dirtyTrays && acquire({ kind: "tray", id: "tray", dirt: 1 })) state.dirtyTrays--;
    } else if (focus.id === "tray:clean") {
      if (state.held?.kind === "tray" && state.held.dirt === 0) { state.cleanTrays++; release(); showToast("Clean tray returned to the drying stack."); }
      else showToast("Wash the tray completely before placing it on the clean stack.");
    } else if (focus.id === "tray:sink") showToast("Hold the action button with a dirty tray under the faucet.");
    sync(); poseHeld(); save(); return true;
  }
  function returnTool() {
    if (disposed || !active || !state.held || hands.owner !== owner) return false;
    if (state.loose.length >= 32) { showToast("Recycle empty cartons to clear floor space first."); return false; }
    const p = safeDrop(); if (!p) { showToast("Move into a clear aisle to set this down safely."); return false; }
    state.held.position = p.toArray(); state.loose.push(state.held); release(); pouring = washing = false;
    sync(); save(); showToast("Set down nearby. Aim at it to pick it up again."); return true;
  }
  function poseHeld() {
    if (!heldView || !state.held) return;
    camera.getWorldDirection(look); right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const group = heldView.group;
    group.position.copy(camera.position).addScaledVector(look, .68).addScaledVector(right, .24); group.position.y -= .40;
    group.quaternion.copy(camera.quaternion); group.rotateY(Math.PI);
    if (pouring) {
      const i = SUPPLY_TYPES.findIndex(t => t.id === state.held.id);
      group.position.copy(dispenserViews[i].pourPosition); group.rotation.set(.30, 0, .22);
      supplyFlow.forEach((mesh, n) => {
        const t = (phase * 1.7 + n / 6) % 1;
        mesh.position.copy(group.position).add(new THREE.Vector3((n % 2 ? 1 : -1) * .06, -.22 - t * .33, -.06));
        mesh.material = colors[state.held.id];
      });
    } else if (washing) { group.position.copy(washPosition); group.position.z += Math.sin(phase * 8) * .065; group.rotation.set(0, .1 * Math.sin(phase * 6), 0); }
    group.updateWorldMatrix(true, true); heldBounds.setFromObject(group);
    group.visible = !blockers().some(c => c.enabled !== false && heldBounds.max.x > c.minX + .002 && heldBounds.min.x < c.maxX - .002
      && heldBounds.max.y > c.minY + .002 && heldBounds.min.y < c.maxY - .002 && heldBounds.max.z > c.minZ + .002 && heldBounds.min.z < c.maxZ - .002);
  }
  function update(delta, input = {}) {
    if (disposed) return; active = Boolean(input.active);
    if (!active) { focus = null; pouring = washing = false; waterStream.visible = false; supplyFlow.forEach(mesh => { mesh.visible = false; }); return; }
    locateFocus();
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0; phase += dt;
    pouring = Boolean(input.action && hands.owner === owner && state.held?.kind === "refill" && focus?.id === `dispenser:${state.held.id}` && state.held.amount > .001);
    washing = Boolean(input.action && hands.owner === owner && state.held?.kind === "tray" && focus?.id === "tray:sink" && state.held.dirt > 0);
    stepSuppliesState(state, dt, { active: true, timeScale, pour: pouring ? state.held.id : null, wash: washing });
    safeTimer += dt;
    if (state.held && safeTimer >= .5) { safeTimer = 0; const p = safeDrop(); if (p) state.held.position = p.toArray(); }
    sync(); poseHeld();
    saveTimer += dt; if (saveTimer >= 1) { saveTimer = 0; save(); }
  }
  sync();
  return { root, update, interact, returnTool,
    get heldTool() { return state.held ? `${state.held.kind}:${state.held.id}` : null; },
    get focusDistance() { return focus ? focus.position.distanceTo(camera.position) : Infinity; },
    get focusedPrompt() {
      if (!focus) return "";
      const [kind, id, part] = focus.id.split(":");
      if (kind === "bib") {
        const bib = state.bibs.find(b => b.id === id), name = BIB_TYPES.find(t => t.id === id).label;
        if (part === "hose") return `${bib.connected ? "Disconnect" : "Connect"} ${name} hose`;
        if (part === "spare") return `Lift full ${name} spare BIB`;
        return bib.installed ? bib.connected ? `${name} ${Math.round(bib.level * 100)}% · disconnect hose first` : `Lift depleted ${name} carton` : `Place matching ${name} BIB`;
      }
      if (kind === "stock") return `Take ${SUPPLY_TYPES.find(t => t.id === id).label} refill carton`;
      if (kind === "dispenser") return `Hold to refill ${SUPPLY_TYPES.find(t => t.id === id).label} · ${Math.round(state.stock.find(t => t.id === id).level * 100)}%`;
      if (kind === "loose") return "Pick up the supply you set down";
      return ({ recycle: "Recycle depleted carton", "tray:dirty": "Pick up dirty kitchen tray", "tray:sink": "Hold to rinse and scrub tray", "tray:clean": "Place clean tray on drying stack" })[focus.id] ?? "";
    },
    get hint() {
      if (state.held?.kind === "refill") return `Carry to the matching dispenser · ${Math.round(state.held.amount * 100)}% left · Q set down`;
      if (state.held?.kind === "bib") return state.held.used ? "Carry depleted box to the recycling crate · Q set down" : "Place in the matching empty BIB slot, then connect its hose · Q set down";
      if (state.held?.kind === "tray") return state.held.dirt > 0 ? `Hold under the faucet to wash · ${Math.round((1 - state.held.dirt) * 100)}% clean` : "Place the washed tray on the clean stack";
      return "Check BIB gauges and fountain supplies. Stock and tray washing are behind the soda fountains.";
    },
    getSnapshot() { return { state: clone(state), heldTool: this.heldTool, focus: focus?.id ?? null, focusDistance: this.focusDistance,
      pouring, washing, heldVisible: heldView?.group.visible ?? false,
      heldPosition: heldView?.group.position.toArray() ?? null,
      anchors: targets.map(t => ({ id: t.id, position: t.position.toArray(), stand: t.stand.toArray() })),
      colliders: ownColliders.map(c => ({ ...c })), room: clone(room.bounds) }; },
    dispose() {
      if (disposed) return; disposed = true; save(); root.removeFromParent();
      if (hands.owner === owner) hands.owner = null;
      ownColliders.forEach(c => collisionWorld?.remove(c));
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}
