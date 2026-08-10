import * as THREE from "three";
import { EQUIPMENT_ANCHORS, PLAYER_SPAWN_PLAN, validateLayoutData, zoneAt } from "./layout-data.js";
import { planToWorldX, worldToPlanDirection, worldToPlanPoint } from "./coordinates.js";
import { createMaterialLibrary } from "./materials.js";
import { createMinimap } from "./minimap.js";
import { AABBCollisionWorld, FirstPersonController } from "./player.js";
import { createTheaterWorld } from "./world.js";

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
  loadingScreen.innerHTML = `
    <div class="eyebrow">LAYOUT COULD NOT START</div>
    <p>${String(error?.message ?? error)}</p>
  `;
}

try {
  const validation = validateLayoutData();
  if (!validation.valid) throw new Error(validation.errors.join("\n"));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080b);
  scene.fog = new THREE.Fog(0x08080b, 92, 205);

  const camera = new THREE.PerspectiveCamera(67, window.innerWidth / window.innerHeight, 0.06, 260);
  const spawnWorld = {
    x: planToWorldX(PLAYER_SPAWN_PLAN.x),
    y: PLAYER_SPAWN_PLAN.y,
    z: PLAYER_SPAWN_PLAN.z,
  };
  camera.position.set(spawnWorld.x, 1.68, spawnWorld.z);

  const hemisphere = new THREE.HemisphereLight(0xdce8ff, 0x241414, 1.65);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffead4, 1.8);
  sun.position.set(-18, 28, -16);
  scene.add(sun);

  const materials = createMaterialLibrary(renderer);
  const world = createTheaterWorld({ scene, materials });
  const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds });
  collisionWorld.addBoxes(world.colliders);

  let entered = false;
  let currentZoneId = "";
  let nearestAnchorId = "";

  const setPausedUi = (paused) => {
    if (!entered) return;
    pauseCard.hidden = !paused;
    crosshair.hidden = paused;
  };

  const controller = new FirstPersonController({
    camera,
    domElement: canvas,
    collisionWorld,
    spawn: [spawnWorld.x, spawnWorld.y, spawnWorld.z],
    initialYaw: Math.PI,
    groundSampler: world.groundHeight,
    onLockChange(active) {
      setPausedUi(!active);
    },
    onLockError() {
      showToast("Click the walkthrough to resume mouse look.", 2600);
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
    controller.start();
  };

  enterButton.addEventListener("click", enterWalkthrough);
  resumeButton.addEventListener("click", () => controller.resume());
  canvas.addEventListener("click", () => {
    if (entered && !controller.active && !controller.isTouchMode) controller.resume();
  });

  const toggleMap = (force) => {
    const hide = force ?? !minimapPanel.classList.contains("is-hidden");
    minimapPanel.classList.toggle("is-hidden", hide);
    if (!hide) minimap.resize();
  };

  mapClose.addEventListener("click", () => toggleMap(true));
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyM" && !event.repeat) toggleMap();
    if (event.code === "KeyR" && !event.repeat && entered) {
      controller.setPosition([spawnWorld.x, spawnWorld.y, spawnWorld.z]);
      controller.setLook(Math.PI, 0);
      showToast("Returned to the front entrance.");
    }
  });

  const updateHud = () => {
    const position = controller.position;
    worldToPlanPoint(position, planPosition);
    const zone = zoneAt(planPosition.x, planPosition.z);
    if (zone.id !== currentZoneId) {
      currentZoneId = zone.id;
      locationName.textContent = zone.name;
      locationDetail.textContent = zone.detail;
    }

    let nearest = null;
    let nearestDistance = 2.25;
    for (const anchor of EQUIPMENT_ANCHORS) {
      const distance = Math.hypot(anchor.position[0] - planPosition.x, anchor.position[2] - planPosition.z);
      if (distance < nearestDistance) {
        nearest = anchor;
        nearestDistance = distance;
      }
    }
    const nextAnchorId = nearest?.id ?? "";
    if (nextAnchorId && nextAnchorId !== nearestAnchorId) {
      showToast(nearest.type.replaceAll("-", " ").toUpperCase());
    }
    nearestAnchorId = nextAnchorId;
  };

  const clock = new THREE.Clock();
  let frame = 0;
  let averageFrameTime = 0;
  let adaptiveDprApplied = false;

  function animate() {
    const delta = Math.min(clock.getDelta(), 0.1);
    controller.update(delta);
    world.updateVisibility(controller.position.x, controller.position.z);
    updateHud();

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

  requestAnimationFrame(() => {
    loadingScreen.classList.add("is-hidden");
    document.body.dataset.ready = "true";
  });

  Object.defineProperty(window, "__THEATER_DEBUG__", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      layoutVersion: "mililani-sketch-v3",
      validation: Object.freeze(validation),
      stats: world.stats,
      controller,
      collisionWorld,
      scene,
      camera,
      equipment: world.equipment,
    }),
  });
} catch (error) {
  showFatalError(error);
}
