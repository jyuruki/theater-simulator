import * as THREE from "three";
import { segmentHitsBox } from "./visit-state.js";
import { createUsherState, restoreUsherState, serializeUsherState, usherSummary,
  stepUsherState, beginUsherPour, USHER_STEP, USHER_WORK_BOUNDS } from "./usher-state.js";

export const USHER_STATION = Object.freeze({ x: 24.3, y: 0, z: 54.7 });
export const USHER_SPAWN = Object.freeze({ position: [24.3, 0, 52.8], yaw: Math.PI });
export const USHER_TRASH = Object.freeze({ x: 20.106, y: 1.01, z: 53.32 });
const STORAGE_KEY = "mililani-usher-v1";
const clamp = THREE.MathUtils.clamp;
const copyPoint = p => ({ x: p.x, z: p.z });

/** Physical first shift. Input and overlays belong to the caller. */
export function createUsherGameplay({ scene, world, camera, collisionWorld, showToast = () => {}, onSound = () => {}, storage }) {
  let state;
  try { state = restoreUsherState(storage?.getItem(STORAGE_KEY)); } catch { state = createUsherState(); }
  const root = new THREE.Group(); root.name = "usher-first-shift"; scene.add(root);
  const resources = new Set(), materials = new Set(), textures = new Set();
  const geometry = g => { resources.add(g); return g; };
  const material = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  const mat = {
    metal: material({ color: 0xbac3c5, metalness: .72, roughness: .35 }),
    dark: material({ color: 0x202b2c, roughness: .78 }),
    teal: material({ color: 0x317b76, roughness: .7 }),
    bristle: material({ color: 0xcdab64, roughness: 1 }),
    cloth: material({ color: 0x64b8c1, roughness: 1 }),
    popcorn: material({ color: 0xffde88, roughness: .88 }),
    kernel: material({ color: 0xe6b65c, roughness: .9 }),
  };
  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeometry = geometry(new THREE.IcosahedronGeometry(1, 1));
  const cylinderGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  function box(parent, name, position, size, m) {
    const mesh = new THREE.Mesh(boxGeometry, m); mesh.name = name;
    mesh.position.set(...position); mesh.scale.set(...size); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rod(parent, name, a, b, radius, m) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(cylinderGeometry, m); mesh.name = name;
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.scale.set(radius, start.distanceTo(end), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function makeBroom(name) {
    const g = new THREE.Group(); g.name = name;
    box(g, `${name}-head`, [0, .075, 0], [.44, .055, .105], mat.teal);
    for (let i = 0; i < 14; i++) box(g, `${name}-bristles-${i}`, [(i - 6.5) * .029, .024, 0], [.023, .055, .08], mat.bristle);
    rod(g, `${name}-handle`, [0, .08, 0], [0, 1.30, -.22], .018, mat.metal);
    rod(g, `${name}-grip`, [0, 1.12, -.19], [0, 1.32, -.225], .025, mat.teal);
    return g;
  }
  function makePan(name) {
    const g = new THREE.Group(); g.name = name;
    box(g, `${name}-tray`, [0, .024, 0], [.55, .035, .41], mat.teal);
    box(g, `${name}-back`, [0, .105, .205], [.55, .16, .025], mat.teal);
    for (const x of [-.27, .27]) box(g, `${name}-side`, [x, .079, .035], [.025, .11, .35], mat.teal);
    rod(g, `${name}-handle`, [0, .06, .17], [0, 1.12, .20], .018, mat.metal);
    box(g, `${name}-grip`, [0, 1.15, .20], [.15, .07, .045], mat.teal);
    return g;
  }
  const cart = new THREE.Group(); cart.name = "usher-cart"; cart.position.set(USHER_STATION.x, 0, USHER_STATION.z); root.add(cart);
  for (const y of [.22, .80]) box(cart, `usher-cart-shelf-${y}`, [0, y, 0], [1.14, .055, .58], mat.dark);
  for (const x of [-.52, .52]) for (const z of [-.25, .25]) {
    rod(cart, "usher-cart-leg", [x, .12, z], [x, .87, z], .024, mat.metal);
    const wheel = new THREE.Mesh(cylinderGeometry, mat.dark); wheel.rotation.z = Math.PI / 2;
    wheel.scale.set(.085, .047, .085); wheel.position.set(x, .09, z); cart.add(wheel);
  }
  rod(cart, "usher-cart-handle", [-.52, .95, .20], [.52, .95, .20], .026, mat.metal);
  const storedBroom = makeBroom("usher-broom-stored"); storedBroom.position.set(-.42, .23, -.05); cart.add(storedBroom);
  const storedPan = makePan("usher-pan-stored"); storedPan.position.set(.16, .24, .0); cart.add(storedPan);
  const storedCloth = box(cart, "usher-cloth-stored", [.42, .853, -.12], [.26, .035, .22], mat.cloth);
  const ownCollider = collisionWorld?.addBox({ id: "usher-cart", minX: USHER_STATION.x - .59, maxX: USHER_STATION.x + .59,
    minZ: USHER_STATION.z - .32, maxZ: USHER_STATION.z + .32, minY: 0, maxY: .94 });

  const Canvas = globalThis.OffscreenCanvas;
  const canvas = Canvas ? new Canvas(768, 1024) : Object.assign(document.createElement("canvas"), { width: 768, height: 1024 });
  const ctx = canvas.getContext("2d");
  const paperTexture = new THREE.CanvasTexture(canvas); paperTexture.colorSpace = THREE.SRGBColorSpace; textures.add(paperTexture);
  const paperMat = new THREE.MeshBasicMaterial({ map: paperTexture, side: THREE.DoubleSide }); materials.add(paperMat);
  const paper = new THREE.Group(); paper.name = "usher-schedule-clipboard";
  paper.position.set(0, 1.45, -.27); paper.rotation.y = Math.PI; cart.add(paper);
  box(paper, "usher-clipboard-board", [0, 0, -.022], [.76, 1.02, .035], mat.dark);
  const sheet = new THREE.Mesh(geometry(new THREE.PlaneGeometry(.70, .94)), paperMat); sheet.name = "usher-schedule-paper"; paper.add(sheet);
  box(paper, "usher-clipboard-clip", [0, .49, .008], [.22, .055, .018], mat.metal);
  // A paper sign at the tool rack identifies the physical supplies, not a HUD inventory.
  const signCanvas = Canvas ? new Canvas(512, 96) : Object.assign(document.createElement("canvas"), { width: 512, height: 96 });
  const signCtx = signCanvas.getContext("2d"); signCtx.fillStyle = "#263634"; signCtx.fillRect(0, 0, 512, 96);
  signCtx.fillStyle = "#fff3d7"; signCtx.font = "bold 35px sans-serif"; signCtx.textAlign = "center"; signCtx.fillText("USHER SUPPLIES · T2", 256, 61);
  const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace; textures.add(signTexture);
  const signMat = new THREE.MeshBasicMaterial({ map: signTexture }); materials.add(signMat);
  const sign = new THREE.Mesh(geometry(new THREE.PlaneGeometry(1.05, .197)), signMat);
  sign.position.set(0, .56, -.301); sign.rotation.y = Math.PI; cart.add(sign);

  const broom = makeBroom("usher-broom-held"), pan = makePan("usher-pan-held"); root.add(broom, pan);
  const cloth = box(root, "usher-cloth-held", [0, 0, 0], [.29, .025, .25], mat.cloth);
  // The building uses a static shadow map. Movable supplies must not leave a
  // baked shadow behind when picked up or cleaned; the cart keeps its shadow.
  for (const tool of [broom, pan, cloth, storedBroom, storedPan, storedCloth]) {
    tool.traverse(object => { if (object.isMesh) object.castShadow = false; });
  }
  // Cache complete local bounds, including handles and tray sides. A center
  // ray alone misses a pan held beside the camera or a wide broom at a corner.
  const toolBounds = new Map([broom, pan, cloth].map(tool => {
    tool.updateWorldMatrix(true, true);
    return [tool, new THREE.Box3().setFromObject(tool).applyMatrix4(tool.matrixWorld.clone().invert())];
  }));
  const transformedToolBounds = new THREE.Box3();
  const kernels = state.particles.map(p => {
    const g = new THREE.Group(); g.name = `usher-popcorn-${p.id}`;
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(sphereGeometry, i === 2 ? mat.kernel : mat.popcorn);
      m.scale.set(.029, .026, .026); m.position.set((i - 1) * .025, i === 1 ? .014 : 0, i === 2 ? .02 : 0);
      m.castShadow = false; g.add(m);
    }
    root.add(g); return g;
  });
  const spillMeshes = state.spills.map(spill => spill.cells.map((cell, i) => {
    const m = material({ color: 0x56301b, transparent: true, opacity: .86, roughness: .2, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mesh = new THREE.Mesh(geometry(new THREE.CircleGeometry(.099 + (i % 3) * .009, 12)), m);
    mesh.name = `usher-spill-${spill.id}-patch-${i}`; mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cell.x, .009 + i * .000035, cell.z); root.add(mesh); return mesh;
  }));

  const targets = [
    { id: "paper", position: new THREE.Vector3(24.3, 1.48, 54.415), radius: .39 },
    { id: "broom", position: new THREE.Vector3(23.87, 1.16, 54.56), radius: .23 },
    { id: "cloth", position: new THREE.Vector3(24.72, .86, 54.58), radius: .19 },
    { id: "bin", position: new THREE.Vector3(USHER_TRASH.x, USHER_TRASH.y, USHER_TRASH.z), radius: .40 },
  ];
  let disposed = false, active = false, focus = null, accumulator = 0, phase = 0, previousBrush = null, previousCloth = null;
  let floorAim = null, smoothAim = null, lastSummary = "", saveTimer = 0, completedNotified = state.completed;
  let lastPan = { x: USHER_STATION.x + .16, z: USHER_STATION.z, forward: { x: 0, z: -1 }, right: { x: -1, z: 0 } };
  const toolVisible = { broom: true, pan: true, cloth: true };
  const look = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3();
  const viewRay = new THREE.Ray();

  function save() { try { storage?.setItem(STORAGE_KEY, serializeUsherState(state)); } catch { /* Private-mode storage is optional. */ } }
  function clearSegment(from, to, ignore = "", radius = 0) {
    return !(collisionWorld?.colliders ?? []).some(c => {
      if (c.enabled === false || (ignore === "station" && c.id === "usher-cart")
        || (ignore === "bin" && String(c.id).startsWith("theater-2-trash"))) return false;
      const box = radius ? { ...c, minX: c.minX - radius, maxX: c.maxX + radius, minZ: c.minZ - radius, maxZ: c.maxZ + radius } : c;
      return segmentHitsBox(from, to, box);
    });
  }
  const groundClear = (from, to) => clearSegment({ x: from.x, y: .11, z: from.z }, { x: to.x, y: .11, z: to.z }, "", .035);
  function fullToolClear(tool) {
    tool.updateWorldMatrix(true, false);
    transformedToolBounds.copy(toolBounds.get(tool)).applyMatrix4(tool.matrixWorld);
    const { min, max } = transformedToolBounds;
    // A conservative transformed box retracts the complete tool before any
    // bristle, tray corner, or handle can enter a solid wall or seat collider.
    return !(collisionWorld?.colliders ?? []).some(c => c.enabled !== false
      && max.x > c.minX + .001 && min.x < c.maxX - .001
      && max.y > c.minY + .001 && min.y < c.maxY - .001
      && max.z > c.minZ + .001 && min.z < c.maxZ - .001);
  }
  function reachable(point, ignore = "", maximum = 2.3) {
    return camera.position.distanceTo(point) <= maximum && clearSegment(camera.position, point, ignore);
  }
  function locateFocus() {
    focus = null; camera.getWorldDirection(look); viewRay.set(camera.position, look);
    let closest = Infinity;
    for (const t of targets) {
      if (t.id === "bin" && state.heldTool !== "broom") continue;
      const along = new THREE.Vector3().subVectors(t.position, camera.position).dot(look);
      if (along <= 0 || along > 2.3 || viewRay.distanceToPoint(t.position) > t.radius) continue;
      if (reachable(t.position, t.id === "bin" ? "bin" : "station") && along < closest) { closest = along; focus = t; }
    }
  }
  function findFloorAim() {
    camera.getWorldDirection(look);
    if (look.y >= -.18 || camera.position.y < .8 || camera.position.y > 2.2) return null;
    const distance = -camera.position.y / look.y;
    if (distance > 3.1) return null;
    const p = camera.position.clone().addScaledVector(look, distance); p.y = 0;
    if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > 1.85
      || p.x < USHER_WORK_BOUNDS.minX - .4 || p.x > USHER_WORK_BOUNDS.maxX + .4
      || p.z < USHER_WORK_BOUNDS.minZ - .4 || p.z > USHER_WORK_BOUNDS.maxZ + .4
      || Math.abs(world.groundHeight(p.x, p.z, 0)) > .04) return null;
    if (!clearSegment(camera.position, new THREE.Vector3(p.x, .04, p.z))
      || !groundClear({ x: camera.position.x, z: camera.position.z }, p)) return null;
    return p;
  }
  function drawPaper() {
    const s = usherSummary(state);
    const signature = `${state.shift}/${state.started}/${s.floor}/${s.pan}/${s.trash}/${s.spills}/${state.completed}`;
    if (signature === lastSummary) return;
    lastSummary = signature;
    ctx.fillStyle = "#f1ebda"; ctx.fillRect(0, 0, 768, 1024);
    ctx.fillStyle = "#183c35"; ctx.fillRect(0, 0, 768, 139);
    ctx.fillStyle = "#fffaf0"; ctx.textAlign = "left"; ctx.font = "bold 54px sans-serif"; ctx.fillText("USHER SCHEDULE", 40, 70);
    ctx.font = "28px sans-serif"; ctx.fillText(`MILILANI 14  /  SHIFT ${state.shift}`, 43, 113);
    ctx.fillStyle = "#202a27"; ctx.font = "bold 57px sans-serif"; ctx.fillText("THEATER 2", 44, 226);
    ctx.font = "29px sans-serif"; ctx.fillText("First break · rear aisle", 46, 274);
    ctx.strokeStyle = "#8a9d92"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(44, 307); ctx.lineTo(724, 307); ctx.stroke();
    const line = (done, text, y) => {
      ctx.strokeStyle = "#304e42"; ctx.lineWidth = 3; ctx.strokeRect(47, y - 28, 29, 29);
      if (done) { ctx.beginPath(); ctx.moveTo(50, y - 13); ctx.lineTo(59, y - 3); ctx.lineTo(78, y - 30); ctx.stroke(); }
      ctx.fillStyle = "#202a27"; ctx.font = "bold 34px sans-serif"; ctx.fillText(text, 99, y);
    };
    line(s.floor === 0, `Sweep popcorn  ${s.total - s.floor}/${s.total}`, 375);
    line(s.trash === s.total, `Empty pan at cubby bin`, 446);
    line(s.spills === 2, `Wipe both spills  ${s.spills}/2`, 517);
    ctx.font = "27px sans-serif"; ctx.fillText("1  Pick up broom + long-handled pan.", 46, 607);
    ctx.fillText("2  Aim at popcorn; hold to sweep.", 46, 653);
    ctx.fillText("3  Empty into bin through inner door.", 46, 699);
    ctx.fillText("4  Return tools. Take cloth; hold + drag.", 46, 745);
    ctx.fillStyle = state.completed ? "#216347" : "#40534a"; ctx.font = "bold 36px sans-serif";
    ctx.fillText(state.completed ? "THEATER 2 READY" : state.started ? "BREAK IN PROGRESS" : "READ SHEET TO START", 45, 854);
    ctx.fillStyle = "#40534a"; ctx.font = "26px sans-serif";
    ctx.fillText(state.completed ? "Use this sheet to start another shift." : `Dustpan holding ${s.pan} pieces.`, 45, 906);
    ctx.font = "22px sans-serif"; ctx.fillText("Return supplies to the cart after cleaning.", 45, 976);
    paperTexture.needsUpdate = true;
  }
  function syncVisuals() {
    storedBroom.visible = storedPan.visible = state.heldTool !== "broom";
    storedCloth.visible = state.heldTool !== "cloth";
    broom.visible = state.heldTool === "broom" && toolVisible.broom;
    pan.visible = state.heldTool === "broom" && toolVisible.pan;
    cloth.visible = state.heldTool === "cloth" && toolVisible.cloth;
    const panMembers = state.particles.filter(p => p.mode === "pan");
    for (const p of state.particles) {
      const mesh = kernels[p.id]; mesh.visible = p.mode !== "trash";
      if (p.mode === "floor") mesh.position.set(p.x, .032, p.z);
      if (p.mode === "pan") {
        mesh.visible = state.heldTool === "broom" ? pan.visible : storedPan.visible;
        const i = panMembers.indexOf(p), ox = ((i % 6) - 2.5) * .06, oz = (Math.floor(i / 6) - 2) * .045;
        const local = new THREE.Vector3(ox, .082 + Math.floor(i / 18) * .04, oz);
        if (state.heldTool === "broom") pan.localToWorld(local); else storedPan.localToWorld(local);
        if (state.pouring) {
          const t = clamp((.85 - state.pouring - i * .008) / .56, 0, 1);
          local.lerp(new THREE.Vector3(USHER_TRASH.x + ox * .4, USHER_TRASH.y - .08, USHER_TRASH.z + oz * .4), t);
          local.y += Math.sin(t * Math.PI) * .22;
        }
        mesh.position.copy(local);
      }
      mesh.rotation.set(p.id * .7, p.id * 1.4 + (p.mode === "floor" ? p.x * 3 + p.z : 0), p.id * .4);
    }
    state.spills.forEach((s, i) => s.cells.forEach((c, j) => {
      spillMeshes[i][j].visible = c.dirt > .001;
      spillMeshes[i][j].material.opacity = c.dirt * .86;
    }));
    drawPaper();
  }
  function positionTools(action, dt) {
    toolVisible.broom = toolVisible.pan = toolVisible.cloth = true;
    camera.getWorldDirection(look); forward.set(look.x, 0, look.z).normalize(); right.set(-forward.z, 0, forward.x);
    if (state.pouring) {
      pan.position.set(USHER_TRASH.x, USHER_TRASH.y + .22, USHER_TRASH.z - .1);
      pan.rotation.set(-Math.PI / 3 * (1 - state.pouring / .85), 0, 0);
      broom.position.set(camera.position.x + right.x * .45, .12, camera.position.z + right.z * .45);
      previousBrush = previousCloth = null; return {};
    }
    if (!floorAim || !state.heldTool) {
      smoothAim = null; previousBrush = previousCloth = null;
      const hold = camera.position.clone().addScaledVector(forward, .62).addScaledVector(right, .28); hold.y -= .85;
      broom.position.copy(hold); broom.rotation.set(0, Math.atan2(forward.x, forward.z), -.20);
      pan.position.copy(hold).addScaledVector(right, -.56); pan.position.y = Math.max(.2, camera.position.y - 1.20); pan.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
      cloth.position.copy(hold); cloth.rotation.set(.2, 0, .1);
      // Each carried object has its own offset and full footprint. Retract an
      // obstructed object independently; hiding the pan also hides its contents.
      toolVisible.broom = clearSegment(camera.position, broom.position) && fullToolClear(broom);
      toolVisible.pan = clearSegment(camera.position, pan.position) && fullToolClear(pan);
      toolVisible.cloth = clearSegment(camera.position, cloth.position) && fullToolClear(cloth);
      return {};
    }
    if (!smoothAim) smoothAim = floorAim.clone();
    const difference = floorAim.clone().sub(smoothAim);
    if (difference.length() > 3 * dt) difference.setLength(3 * dt);
    const nextAim = smoothAim.clone().add(difference);
    if (!groundClear(smoothAim, nextAim)) { previousBrush = previousCloth = null; return {}; }
    smoothAim.copy(nextAim);
    const oldPhase = phase;
    phase = action ? (phase + dt) % 1.1 : 0;
    const working = action && phase < .72;
    const offset = action ? (phase < .72 ? -.24 + phase / .72 * .61 : .37 - (phase - .72) / .38 * .61) : -.22;
    const head = smoothAim.clone().addScaledVector(forward, offset);
    const tray = smoothAim.clone().addScaledVector(forward, .44);
    const withinToolReach = (p, range) => Math.hypot(p.x - camera.position.x, p.z - camera.position.z) <= range
      && clearSegment(camera.position, new THREE.Vector3(p.x, .04, p.z))
      && groundClear({ x: camera.position.x, z: camera.position.z }, p);
    const yaw = Math.atan2(forward.x, forward.z);
    broom.position.set(head.x, working ? .006 : .13, head.z); broom.rotation.set(0, yaw, 0);
    pan.position.set(tray.x, .008, tray.z); pan.rotation.set(0, yaw, 0);
    cloth.position.set(smoothAim.x, action ? .019 : .14, smoothAim.z); cloth.rotation.set(0, yaw, 0);
    const validHead = groundClear(smoothAim, head) && withinToolReach(head, 2.2) && fullToolClear(broom);
    const validPan = groundClear(smoothAim, tray) && withinToolReach(tray, 2.35) && fullToolClear(pan);
    const validCloth = withinToolReach(smoothAim, 1.9) && fullToolClear(cloth);
    const contact = { canMove: groundClear };
    if (validHead && validPan && state.heldTool === "broom") {
      lastPan = { x: tray.x, z: tray.z, forward: copyPoint(forward), right: copyPoint(right) };
      contact.pan = lastPan;
      if (working && oldPhase < .72 && previousBrush) contact.brush = { from: previousBrush, to: copyPoint(head), right: copyPoint(right) };
      previousBrush = working ? copyPoint(head) : null;
    } else previousBrush = null;
    if (action && state.heldTool === "cloth" && validCloth) {
      if (previousCloth) contact.cloth = { from: previousCloth, to: copyPoint(smoothAim) };
      previousCloth = copyPoint(smoothAim);
    } else previousCloth = null;
    if (!validHead) toolVisible.broom = false;
    if (!validPan) toolVisible.pan = false;
    if (!validCloth) toolVisible.cloth = false;
    return contact;
  }
  function notifyCompletion() {
    if (state.completed && !completedNotified) {
      completedNotified = true; showToast("Theater 2 is ready. Your schedule is checked off."); onSound("complete"); save();
    }
  }
  function returnTool() {
    if (!state.heldTool || state.pouring) return false;
    if (!reachable(new THREE.Vector3(24.3, 1.05, 54.38), "station", 2.3)) { showToast("Bring the tool back to the usher cart."); return false; }
    state.heldTool = null; previousBrush = previousCloth = null; save(); syncVisuals(); return true;
  }
  function interact() {
    if (disposed || !active) return false;
    locateFocus(); if (!focus || state.pouring) return false;
    if (focus.id === "paper") {
      if (state.completed) {
        if (state.heldTool) { showToast("Return your tool to the cart before the next shift."); return true; }
        const nextShift = state.shift + 1; state = createUsherState(); state.shift = nextShift; state.started = true; completedNotified = false;
        showToast("New break: Theater 2. Supplies are on the cart.");
      } else if (!state.started) { state.started = true; showToast("Theater 2 break: sweep, empty the pan, then wipe both spills."); }
      else showToast("Theater 2 · rear aisle. Follow the checklist on the clipboard.");
    } else if (focus.id === "bin") {
      if (beginUsherPour(state)) onSound("empty"); else showToast("Sweep popcorn into the dustpan first.");
    } else {
      if (!state.started) { showToast("Read the schedule on the clipboard first."); return true; }
      if (state.heldTool === focus.id) return returnTool();
      state.heldTool = focus.id; previousBrush = previousCloth = null; smoothAim = null; phase = 0;
      onSound("pickup");
      showToast(focus.id === "broom" ? "Aim at the floor and hold to sweep popcorn into the pan." : "Aim at a spill. Hold and move the cloth across it.");
    }
    save(); root.updateMatrixWorld(true); syncVisuals(); return true;
  }
  function update(delta, input = {}) {
    if (disposed) return;
    active = Boolean(input.active);
    if (!active) { accumulator = 0; previousBrush = previousCloth = null; focus = null; return; }
    locateFocus(); floorAim = findFloorAim();
    const seconds = Number.isFinite(delta) ? clamp(delta, 0, .1) : 0;
    accumulator += seconds;
    while (accumulator + 1e-10 >= USHER_STEP) {
      const contacts = positionTools(Boolean(input.action) && state.started && !state.completed, USHER_STEP);
      stepUsherState(state, USHER_STEP, contacts); accumulator -= USHER_STEP;
    }
    root.updateMatrixWorld(true); syncVisuals(); notifyCompletion();
    saveTimer += seconds; if (saveTimer > 1) { saveTimer = 0; save(); }
  }
  root.updateMatrixWorld(true); syncVisuals();
  return {
    root, update, interact, returnTool, dropOrReturn: returnTool,
    get heldTool() { return state.heldTool; },
    get role() { return "Usher"; },
    get status() { return state.completed ? "Theater 2 ready" : state.started ? "Theater 2 break" : "Read the schedule"; },
    get focusedPrompt() {
      if (!focus) return "";
      if (focus.id === "paper") return state.completed ? "Start another shift" : state.started ? "Read the usher schedule" : "Read schedule · begin Theater 2 break";
      if (focus.id === "bin") return state.pouring ? "Emptying dustpan…" : "Empty dustpan into bin";
      if (focus.id === state.heldTool) return "Return tool to cart";
      return focus.id === "broom" ? "Take broom + dustpan" : "Take wiping cloth";
    },
    get hint() {
      if (!state.started) return "Read the clipboard on the usher cart.";
      if (state.completed) return "Theater 2 is ready. Return tools to the cart.";
      if (state.pouring) return "Emptying the dustpan into the cubby bin.";
      if (state.heldTool === "broom") return usherSummary(state).floor === 0 ? "Empty the pan into the bin through the inner doorway." : "Aim down at popcorn · hold to sweep toward the pan.";
      if (state.heldTool === "cloth") return "Aim down · hold and move the cloth over a spill.";
      return "Take a tool from the cart. The checklist is on the clipboard.";
    },
    getSnapshot() {
      return { status: this.status, heldTool: state.heldTool, state: JSON.parse(serializeUsherState(state)),
        summary: usherSummary(state), pouring: state.pouring, focus: focus?.id ?? null,
        floorAim: floorAim?.toArray() ?? null, pan: lastPan,
        anchors: { cart: [24.3, 1.45, 54.43], broom: [23.87, 1.16, 54.56], cloth: [24.72, .86, 54.58],
          bin: [20.106, 1.01, 53.32], popcorn: [[24.95, .03, 52.18], [27.1, .03, 52.18]],
          spills: [[23.75, .02, 52.04], [27.65, .02, 53.24]] } };
    },
    dispose() {
      if (disposed) return; disposed = true; save(); root.removeFromParent();
      if (ownCollider) collisionWorld?.remove(ownCollider);
      for (const g of resources) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
    },
  };
}
