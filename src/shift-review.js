import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createTheaterWorld } from "./world.js";
import { createMaterialLibrary } from "./materials.js";
import { AABBCollisionWorld } from "./player.js";
import { createTheaterLighting } from "./lighting.js";
import { createUsherShift } from "./usher-shift.js";
import { createTheaterAudio } from "./atmosphere.js";
import { createShowStartMedia } from "./show-start-media.js";
import { createFeatureProgram } from "./feature-program.js";
import { createShowCustomers } from "./show-customers.js";
import { AUDITORIUMS, LOBBY_PLAN } from "./layout-data.js";
import { auditoriumDoorLayout } from "./auditorium-door-layout.js";
import { planToWorldX } from "./coordinates.js";

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x88a4b5);
const pmrem = new THREE.PMREMGenerator(renderer), environment = new RoomEnvironment(), environmentTarget = pmrem.fromScene(environment, .04);
scene.environment = environmentTarget.texture; scene.environmentIntensity = .22; environment.dispose(); pmrem.dispose();
const lighting = createTheaterLighting({ scene }), materials = createMaterialLibrary(renderer), world = createTheaterWorld({ scene, materials });
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds }); collisionWorld.addBoxes(world.colliders);
const dynamicColliders = collisionWorld.addBoxes(world.dynamicColliders);
const camera = new THREE.PerspectiveCamera(67, 1, .04, 260), controls = new OrbitControls(camera, renderer.domElement);
const status = document.querySelector("#status"), select = document.querySelector("#view"), roomSelect = document.querySelector("#room");
for (const room of AUDITORIUMS) roomSelect.add(new Option(`Theater ${room.number}`, room.id)); roomSelect.value = "theater-2";
const audio = createTheaterAudio();
let shift, patrons, features, featurePreview = null;
const media = createShowStartMedia({ camera, world, audio, getDoor: id => shift?.doors.getSnapshot().find(d => d.id === id), onError: error => { status.textContent = String(error); } });
shift = createUsherShift({ scene, world, camera, collisionWorld, storage: null, seed: 23,
  showToast: message => { status.textContent = message; }, onSound: kind => audio.play(kind),
  onStart: event => { features?.suspend(event.theaterId); media.onStart(event); patrons?.onStart(event); }, onBreak: event => patrons?.onBreak(event) });
patrons = createShowCustomers({ scene, world, camera, collisionWorld, doors: shift.doors, waste: shift.waste });
const featureSchedule = {
  get minute() { return featurePreview ? featurePreview.time + 10 : shift.schedule.minute; },
  get events() { return featurePreview ? [featurePreview] : shift.schedule.events; },
  secondsSince: minute => featurePreview ? 100 : shift.schedule.secondsSince(minute),
};
features = createFeatureProgram({ world, camera, audio, schedule: featureSchedule, trailer: media, getDoor: id => shift.doors.getSnapshot().find(d => d.id === id) });
let action = false, capturing = false, paused = false, syntheticEvent = 0;
const views = [];
function add(id, label, position, target, roomId) {
  if (views.some(v => v.id === id)) return;
  views.push({ id, label, position, target, roomId }); select.add(new Option(label, String(views.length - 1)));
}
add("sign-hall", "Hall signs · sheet layering", [-22.6, 1.68, 57.8], [-17.8, 2.8, 55.2]);
const gate = LOBBY_PLAN.barServiceGate, gateZ = (gate.wall.z + gate.counter.z) / 2;
add("bar-gate", "Bar entrance swinging gate", [planToWorldX(gate.wall.x) + 2.1, 1.68, gateZ], [planToWorldX(gate.wall.x), .9, gateZ]);
shift.update(0, { active: true });
// Stage all rooms in this development scene without waiting through a shift.
for (const room of AUDITORIUMS) shift.cleaning.beginBreak(room.id, 23 + room.number);
for (const room of AUDITORIUMS) {
  const door = auditoriumDoorLayout(room), layout = world.auditoriumLayouts.get(room.id);
  add(`${room.id}-entry`, `${room.number} · ${door.small ? "inner red cubby door" : "entrance"}`,
    [door.route.outside[0], 1.68, door.route.outside[2]], [door.x, 1.2, door.z], room.id);
  if (door.small) add(`${room.id}-hall-cubby`, `${room.number} · open outer cubby`,
    [door.route.hall[0], 1.68, door.route.hall[2]], [door.route.cubby[0], 1.2, door.route.cubby[2]], room.id);
  const row = layout.rows[Math.floor(layout.rows.length / 2)], forward = room.screenSide === "north" ? 1 : -1;
  if (door.small) {
    const rear = layout.rows.at(-1);
    add(`${room.id}-rear-wall`, `${room.number} · flush rear cubby wall`,
      [planToWorldX(layout.centerX), rear.elevation + 1.68, rear.z + forward * .73],
      [planToWorldX(room.entry.center), 1.6, room.bounds.zMax], room.id);
  }
  add(`${room.id}-row-aisle`, `${room.number} · level row passage and seat width`,
    [planToWorldX(layout.seatBounds.xMin) + .5, row.elevation + 1.68, row.z + forward * .73],
    [planToWorldX(layout.centerX), row.elevation + .65, row.z], room.id);
  const screen = world.root.getObjectByName(`${room.id}-screen`).getWorldPosition(new THREE.Vector3());
  add(`${room.id}-screen`, `${room.number} · screen / trailer`,
    [planToWorldX(layout.centerX), row.elevation + 1.68, row.z + forward * .73], screen.toArray(), room.id);
  if ([3, 6, 7, 8].includes(room.number)) {
    const cross = layout.rows[2];
    add(`${room.id}-front-levels`, `${room.number} · A/B drops and C crosswalk`,
      [planToWorldX(layout.seatBounds.xMin) + .55, 1.68, cross.z + forward * 1.0],
      [planToWorldX(layout.centerX), -.15, layout.rows[0].z], room.id);
  }
}
function refreshViews() {
  const snapshot = shift.getSnapshot();
  for (const bin of snapshot.waste.bins) add(bin.id, `Rolling can · ${bin.room}`, [bin.x + 1.1, 1.68, bin.z + 1.1], [bin.x, .68, bin.z]);
  const gondola = snapshot.waste.gondola; add("gondola", "Trash-room gondola", [20.45, 1.68, 60.4], [gondola.x, .8, gondola.z]);
  for (const anchor of snapshot.supplies.anchors) add(`supply-${anchor.id.replaceAll(":", "-")}`, anchor.id,
    [anchor.stand[0], anchor.stand[1] + 1.68, anchor.stand[2]], anchor.position);
  const bounds = snapshot.supplies.room, cx = planToWorldX((bounds.xMin + bounds.xMax) / 2), cz = (bounds.zMin + bounds.zMax) / 2;
  add("bib-room", "BIB and tray wash room", [cx, 1.68, bounds.zMin + 1.2], [cx, 1.3, bounds.zMax - 1]);
  const wallX = planToWorldX(bounds.xMax) + .31;
  add("near-wall-carry", "Near wall · held prop contact / place preview", [wallX, 1.68, cz], [wallX - 1, 1.05, cz]);
  for (const number of [2, 3, 8]) {
    const job = snapshot.cleaning.state.jobs.find(j => j.number === number);
    for (const dirty of [false, true]) {
      const seat = job.seats.find(s => job.surfaces.find(f => f.id === `${s.id}-tray`).spill === dirty);
      if (!seat) continue;
      const anchor = snapshot.cleaning.anchors.seats.find(s => s.id === seat.id);
      const eye = [anchor.stand[0], anchor.stand[1] + 1.68, anchor.stand[2]];
      add(`${seat.id}-tray`, `${number} · ${dirty ? "spilled" : "routine"} tray wipe`, eye, anchor.tray, job.id);
      add(`${seat.id}-seat`, `${number} · ${dirty ? "selected" : "routine"} cushion wipe`, eye, anchor.seat, job.id);
    }
  }
  const job = snapshot.cleaning.state.jobs.find(j => j.number === 2);
  for (const surface of job.surfaces.filter(s => s.kind === "floor")) {
    add(surface.id, "2 · floor spill", [surface.x - .85, surface.y + 1.68, surface.z], [surface.x, surface.y, surface.z], job.id);
    add(`${surface.id}-shallow`, "2 · shallow-angle broom reach", [surface.x - 2.2, surface.y + 1.68, surface.z], [surface.x + 8, surface.y + 1.08, surface.z], job.id);
  }
}
refreshViews();
function setView(index) {
  const view = views[index]; select.value = String(index); if (view.roomId) roomSelect.value = view.roomId;
  controls.mouseButtons.LEFT = view.id.includes("recliner") ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  camera.position.fromArray(view.position); controls.target.fromArray(view.target); controls.update(); lighting.update(camera.position);
  world.update(0, camera.position); shift.update(0, { active: true }); media.update(0, !paused);
  renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
}
select.onchange = () => { action = false; document.querySelector("#work").textContent = "Hold action"; setView(+select.value); };
const resize = () => { const stage = document.querySelector("#stage"); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(stage.clientWidth, stage.clientHeight, false); };
new ResizeObserver(resize).observe(document.querySelector("#stage")); resize(); setView(0);
document.querySelector("#use").onclick = () => shift.interact();
document.querySelector("#broom").onclick = () => shift.selectTool("broom");
document.querySelector("#cloth").onclick = () => shift.selectTool("cloth");
document.querySelector("#stow").onclick = () => shift.returnTool();
document.querySelector("#sheet").onclick = () => shift.toggleSheet();
document.querySelector("#place").onclick = () => shift.togglePlacement();
document.querySelector("#confirm").onclick = () => shift.confirmPlacement();
document.querySelector("#work").onclick = event => { action = !action; event.target.textContent = action ? "Release action" : "Hold action"; };
document.querySelector("#pause").onclick = event => { paused = !paused; action = false; event.target.textContent = paused ? "Resume" : "Pause"; };
document.querySelector("#advance").onclick = () => {
  for (let i = 0; i < 8 * 60 / shift.schedule.timeScale / .1; i++) shift.update(.1, { active: true });
  refreshViews(); status.textContent = `Clock advanced eight game minutes: ${shift.schedule.time}`;
};
function testEvent(kind) {
  const room = AUDITORIUMS.find(r => r.id === roomSelect.value);
  const member = patrons.getSnapshot().actors.find(a => a.room === room.id);
  const occupiedCycle = Number(member?.show?.split(":").at(-1) ?? 0);
  return { id: `review-${++syntheticEvent}-${kind}`, theaterId: room.id, number: room.number, kind, cycle: occupiedCycle, time: shift.schedule.minute };
}
document.querySelector("#feature-audio").onclick = () => { audio.start(); features.retry(); };
document.querySelector("#preview-feature").onclick = () => {
  featurePreview = { ...testEvent("start"), audienceCycle: 0 }; features.retry(); paused = false;
  status.textContent = `Previewing feature program in Theater ${featurePreview.number}`;
};
document.querySelector("#start-show").onclick = () => {
  audio.start(); media.prepare(); media.retry(); paused = false;
  document.querySelector("#pause").textContent = "Pause";
  const event = testEvent("start"); shift.doors.onStart(event.theaterId); features.suspend(event.theaterId); media.onStart(event); patrons.onStart(event);
  status.textContent = `Playing supplied opening trailer in Theater ${event.number}`;
};
document.querySelector("#break-show").onclick = () => {
  const event = testEvent("break"); shift.doors.onBreak(event.theaterId); shift.waste.onTheaterBreak(event.theaterId);
  shift.cleaning.beginBreak(event.theaterId, `review-break-${syntheticEvent}`, { cycle: event.cycle }); patrons.onBreak(event); refreshViews();
};
async function post(endpoint, body) {
  const response = await fetch(`http://127.0.0.1:5184/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw Error(await response.text());
}
async function shot(name) { renderer.render(scene, camera); await post("shot", { name, image: renderer.domElement.toDataURL("image/png") }); }
document.querySelector("#shot").onclick = async () => {
  try { await shot(`${views[+select.value].id}${shift.sheet.visible ? "-sheet" : shift.placementActive ? "-place" : "-active"}`); status.textContent = "View captured"; }
  catch (error) { status.textContent = String(error); }
};
document.querySelector("#capture").onclick = async event => {
  event.target.disabled = true; capturing = true; action = false; shift.sheet.hide();
  try {
    for (let index = 0; index < views.length; index++) {
      setView(index); await new Promise(resolve => requestAnimationFrame(resolve)); await shot(views[index].id); status.textContent = `Captured ${index + 1}/${views.length}`;
    }
    setView(0); shift.toggleSheet(); shift.sheet.update(); await shot("sign-hall-break-sheet"); shift.sheet.hide();
    await post("index", { views, snapshot: shift.getSnapshot(), media: media.getSnapshot(), patrons: patrons.getSnapshot() });
    status.textContent = `Capture complete · ${views.length + 1} views`;
  } catch (error) { status.textContent = String(error); }
  finally { event.target.disabled = false; capturing = false; setView(0); }
};
let last = performance.now(), lastState = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  const active = !capturing && !paused;
  world.update(active ? dt : 0, camera.position);
  for (const collider of dynamicColliders) Object.assign(collider, collider.source);
  shift.update(dt, { active, action }); patrons.update(dt, active, shift.schedule); media.update(dt, active); features.update(dt, active);
  lighting.update(camera.position); renderer.render(scene, camera);
  if (now - lastState > 400) {
    lastState = now;
    document.querySelector("#state").textContent = `${shift.focusedPrompt || shift.hint} · ${shift.schedule.time} · ${renderer.info.render.calls} draw calls · held: ${shift.heldTool ?? "none"} · place: ${shift.placementActive}\nMedia: ${JSON.stringify(media.getSnapshot())}\nFeature: ${JSON.stringify(features.getSnapshot())}\nCustomers: ${JSON.stringify(patrons.getSnapshot())}`;
  }
});
const loaded = await Promise.all([world.loadKioskAssets({ url: "./models/mililani-ticket-kiosk.glb" }), world.loadPropAssets({ url: "./models/theater-props.glb" }), patrons.loadAssets({ url: "./models/theater-npcs.glb" })]);
patrons.restoreSchedule({ ...shift.schedule.getSnapshot(), events: shift.schedule.events });
renderer.shadowMap.needsUpdate = true; status.textContent = `Assets ${loaded.every(value => value !== false) ? "ready" : "CHECK FALLBACK"} · ${views.length} inspection views`;
