import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createVisitUI } from "./visit-ui.js";
import { createTheaterCrowd, createTheaterAudio } from "./atmosphere.js";
import { createCinemaMedia } from "./cinema-media.js";
import { PLAYER_SPAWN_PLAN, validateLayoutData, zoneAt } from "./layout-data.js";
import { worldToPlanDirection, worldToPlanPoint } from "./coordinates.js";
import { createMaterialLibrary } from "./materials.js";
import { createMinimap } from "./minimap.js";
import { AABBCollisionWorld, FirstPersonController } from "./player.js";
import { createTheaterWorld } from "./world.js";
import { createTheaterLighting } from "./lighting.js";
import { USHER_SPAWN } from "./usher-gameplay.js";
import { createUsherShift } from "./usher-shift.js";
import { createUsherUI } from "./usher-ui.js";
import { createShowStartMedia, HULA_DURATION } from "./show-start-media.js";
import { createShowCustomers } from "./show-customers.js";
import { setupInstallApp } from "./install-app.js";
import { SHIFT_TIME_SCALE } from "./usher-schedule.js";

const canvas = document.querySelector("#game-canvas");
const loadingScreen = document.querySelector("#loading-screen");
const intro = document.querySelector("#intro");
const enterButton = document.querySelector("#enter-button");
const resumeButton = document.querySelector("#resume-button");
const pauseCard = document.querySelector("#pause-card");
const hud = document.querySelector("#hud");
const crosshair = document.querySelector("#crosshair");
const locationName = document.querySelector("#location-name");
const locationDetail = document.querySelector("#location-detail");
const minimapPanel = document.querySelector("#minimap-panel");
const mapClose = document.querySelector("#map-close");
const toast = document.querySelector("#toast");

let toastTimer = 0;

function showToast(message, duration = 1900) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), duration);
}

function showFatalError(error) {
  console.error(error);
  loadingScreen.classList.remove("is-hidden");
  loadingScreen.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "eyebrow";
  heading.textContent = "THEATER COULD NOT START";
  const message = document.createElement("p");
  message.textContent = String(error?.message ?? error);
  loadingScreen.append(heading, message);
}

try {
  setupInstallApp();
  const validation = validateLayoutData();
  if (!validation.valid) throw new Error(validation.errors.join("\n"));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  // A visible exterior sky lets the tall transparent storefront read as
  // glazing instead of a black wall. Enclosed rooms retain their materials.
  scene.background = new THREE.Color(0x88a4b5);
  // Keep atmospheric depth without making the far end of the authored
  // complex look as if it is loading in by proximity.
  scene.fog = new THREE.Fog(0x08080b, 220, 320);

  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.22;
  environment.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(67, window.innerWidth / window.innerHeight, 0.06, 260);
  const spawnWorld = {
    x: USHER_SPAWN.position[0],
    y: USHER_SPAWN.position[1],
    z: USHER_SPAWN.position[2],
  };
  camera.position.set(spawnWorld.x, 1.68, spawnWorld.z);

  const lighting = createTheaterLighting({ scene });
  lighting.update(camera.position);

  const materials = createMaterialLibrary(renderer);
  const world = createTheaterWorld({ scene, materials });
  world.loadPropAssets({
    url: `${import.meta.env.BASE_URL}models/theater-props.glb`,
    onLoaded: () => { renderer.shadowMap.needsUpdate = true; },
  });
  world.loadKioskAssets({
    url: `${import.meta.env.BASE_URL}models/mililani-ticket-kiosk.glb`,
    onLoaded: () => { renderer.shadowMap.needsUpdate = true; },
  });
  const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds });
  collisionWorld.addBoxes(world.colliders);
  const doorColliders = collisionWorld.addBoxes(world.dynamicColliders);
  const crowd = createTheaterCrowd({ scene, collisionWorld, world });
  crowd.loadAssets({ url: `${import.meta.env.BASE_URL}models/theater-npcs.glb` });
  const audio = createTheaterAudio();
  const media = createCinemaMedia({ scene, world, materials });
  let usher, patrons;
  let mediaWarningShown = false;
  const startMedia = createShowStartMedia({ camera, world, audio,
    getDoor: id => usher?.doors.getSnapshot().find(d => d.id === id),
    onError: () => { if (!mediaWarningShown) { showToast("Start trailer unavailable. The break sheet still shows all show starts.", 4000); mediaWarningShown = true; } },
  });
  let interactions = null;

  let entered = false;
  let currentZoneId = "";

  const setPausedUi = (paused) => {
    if (!entered) return;
    pauseCard.hidden = !paused || Boolean(interactions?.isOpen);
    crosshair.hidden = paused;
  };

  const controller = new FirstPersonController({
    camera,
    domElement: canvas,
    collisionWorld,
    spawn: [spawnWorld.x, spawnWorld.y, spawnWorld.z],
    initialYaw: USHER_SPAWN.yaw,
    groundSampler: world.groundHeight,
    ceilingSampler: world.ceilingHeight,
    onLockChange(active) {
      setPausedUi(!active);
    },
    onLockError() {
      showToast("Click the theater to resume mouse look.", 2600);
      setPausedUi(true);
    },
    onStuckRecovered() {
      showToast("Moved you back to the last safe spot.", 2200);
    },
  });

  const minimap = createMinimap({
    canvas: "#minimap",
    player: { x: PLAYER_SPAWN_PLAN.x, z: PLAYER_SPAWN_PLAN.z, directionZ: 1 },
  });
  const cameraDirection = new THREE.Vector3();
  const planPosition = { x: PLAYER_SPAWN_PLAN.x, y: 0, z: PLAYER_SPAWN_PLAN.z };
  const planDirection = { x: 0, y: 0, z: 1 };

  const enterWalkthrough = () => {
    if (!entered) {
      entered = true;
      intro.classList.add("is-hidden");
      hud.hidden = false;
      crosshair.hidden = false;
    }
    pauseCard.hidden = true;
    audio.start();
    startMedia.prepare(); startMedia.retry();
    controller.start();
  };

  enterButton.addEventListener("click", enterWalkthrough);
  resumeButton.addEventListener("click", () => { audio.start(); startMedia.retry(); controller.resume(); });
  canvas.addEventListener("click", () => {
    if (entered && !controller.active && !controller.isTouchMode && !interactions?.isOpen) controller.resume();
  });

  const toggleMap = (force) => {
    const hide = force ?? !minimapPanel.classList.contains("is-hidden");
    minimapPanel.classList.toggle("is-hidden", hide);
    if (!hide) minimap.resize();
  };

  interactions = createVisitUI({ controller, camera, collisionWorld, showToast,
    onSound: (kind) => audio.play(kind), audio, crowd, toggleMap, employeeMode: true });
  let shiftStorage;
  try { shiftStorage = window.localStorage; } catch { /* The shift also works without browser storage. */ }
  usher = createUsherShift({ scene, world, camera, collisionWorld, showToast,
    onSound: (kind) => audio.play(kind), storage: shiftStorage,
    onStart: event => { startMedia.onStart(event); patrons?.onStart(event); },
    onBreak: event => patrons?.onBreak(event) });
  patrons = createShowCustomers({ scene, world, camera, collisionWorld, doors: usher.doors, waste: usher.waste });
  const patronsReady = patrons.loadAssets({ url: `${import.meta.env.BASE_URL}models/theater-npcs.glb` });
  // Refreshing during the opening cue resumes at the corresponding show time.
  const scheduleSnapshot = usher.schedule.getSnapshot();
  const boarding = new Set(scheduleSnapshot.done);
  for (const event of usher.schedule.events.filter(e => e.kind === "start" && scheduleSnapshot.done.includes(e.id))) {
    const seconds = (usher.schedule.minute - event.time) * 60 / SHIFT_TIME_SCALE;
    if (seconds >= 0 && seconds < HULA_DURATION) startMedia.onStart(event, seconds);
  }
  const usherUI = createUsherUI({ gameplay: usher, controller, canvas,
    isBlocked: () => interactions.isOpen });

  mapClose.addEventListener("click", () => toggleMap(true));
  window.addEventListener("keydown", (event) => {
    if (interactions.isOpen) return;
    if (event.code === "KeyM" && !event.repeat) toggleMap();
    if (event.code === "KeyR" && !event.repeat && entered) {
      controller.setPosition([spawnWorld.x, spawnWorld.y, spawnWorld.z]);
      controller.setLook(USHER_SPAWN.yaw, 0);
      lighting.update(controller.position);
      showToast("Returned to the usher station.");
    }
  });

  const updateHud = () => {
    const position = controller.position;
    worldToPlanPoint(position, planPosition);
    const zone = zoneAt(planPosition.x, planPosition.z, position.y);
    if (zone.id !== currentZoneId) {
      currentZoneId = zone.id;
      locationName.textContent = zone.name;
      locationDetail.textContent = zone.detail;
    }
  };

  const clock = new THREE.Clock();
  let frame = 0;
  let averageFrameTime = 0;
  let adaptiveDprApplied = false;

  function animate() {
    const delta = Math.min(clock.getDelta(), 0.1);
    world.update(delta, controller.position);
    doorColliders.forEach(collider => Object.assign(collider, collider.source));
    crowd.update(delta, controller.position, entered && controller.active && !document.hidden);
    controller.update(delta);
    updateHud();
    interactions.update(delta);
    usherUI.update(delta);
    if (entered && controller.active && !document.hidden) {
      // Give guests time to walk the real building before the usher hears the
      // start cue and closes the doors. Exact-start dispatch deduplicates by ID.
      for (const event of usher.schedule.events) if (event.kind === "start" && !boarding.has(event.id)
        && event.time >= usher.schedule.minute && event.time - usher.schedule.minute <= 8) {
        boarding.add(event.id); patrons.onStart(event);
      }
    }
    lighting.update(controller.position, delta);
    audio.update(controller.position, currentZoneId, entered && (controller.active || interactions.isOpen), controller.grounded);
    media.update(delta, currentZoneId, entered && controller.active && !document.hidden);
    startMedia.update(delta, entered && controller.active && !document.hidden);
    patrons.setEnabled(crowd.enabled);
    patrons.update(delta, entered && controller.active && !document.hidden);

    camera.getWorldDirection(cameraDirection);
    if (frame % 3 === 0 && !minimapPanel.classList.contains("is-hidden")) {
      worldToPlanPoint(controller.position, planPosition);
      worldToPlanDirection(cameraDirection, planDirection);
      minimap.updatePlayer(planPosition, planDirection);
    }

    renderer.render(scene, camera);
    frame += 1;
    averageFrameTime += (delta - averageFrameTime) * 0.025;
    if (!adaptiveDprApplied && frame > 240 && averageFrameTime > 1 / 42 && renderer.getPixelRatio() > 1) {
      renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(1);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      adaptiveDprApplied = true;
    }
  }

  renderer.setAnimationLoop(animate);
  renderer.render(scene, camera);

  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    minimap.resize();
  };
  window.addEventListener("resize", resize, { passive: true });

  requestAnimationFrame(async () => {
    try {
      await patronsReady;
      loadingScreen.classList.add("is-hidden");
      document.body.dataset.ready = "true";
    } catch (error) { showFatalError(error); }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Hidden pages may stop rendering immediately, before the next frame can
      // pause the independently running video and decoded soundtrack.
      startMedia.update(0, false);
      if (entered && !interactions.isOpen) controller.pause();
    }
  });
  window.addEventListener("pagehide", (event) => {
    startMedia.update(0, false);
    if (event.persisted) return;
    renderer.setAnimationLoop(null);
    startMedia.dispose();
    audio.dispose();
    patrons.dispose();
    crowd.dispose();
    media.dispose();
    usherUI.dispose();
    usher.dispose();
    lighting.dispose();
    controller.dispose();
    world.dispose();
  });

  Object.defineProperty(window, "__THEATER_DEBUG__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      layoutVersion: "mililani-sketch-v23",
      validation: Object.freeze(validation),
      stats: world.stats,
      controller,
      collisionWorld,
      scene,
      camera,
      equipment: world.equipment,
      interactions,
      crowd,
      usher,
      patrons,
      startMedia,
    }),
  });
} catch (error) {
  showFatalError(error);
}
