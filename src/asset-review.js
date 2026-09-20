import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createTheaterWorld } from "./world.js";
import { createMaterialLibrary } from "./materials.js";
import { LOBBY_PLAN } from "./layout-data.js";

const canvas = document.querySelector("canvas");
const panel = document.querySelector("#view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08080b);
scene.fog = new THREE.Fog(0x08080b, 220, 320);
const environment = new RoomEnvironment();
const pmrem = new THREE.PMREMGenerator(renderer);
const environmentTarget = pmrem.fromScene(environment, .04);
scene.environment = environmentTarget.texture;
scene.environmentIntensity = .22;
environment.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xdce8ff, 0x241414, 1.65));
const sun = new THREE.DirectionalLight(0xffead4, 1.8);
sun.position.set(-18, 28, -16);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {left:-33,right:33,top:36,bottom:-29,near:.5,far:100});
sun.shadow.normalBias = .025;
sun.shadow.bias = -.00015;
scene.add(sun);
const materials = createMaterialLibrary(renderer);
const world = createTheaterWorld({scene, materials});
const camera = new THREE.PerspectiveCamera(50, 1, .04, 260);
const controls = new OrbitControls(camera, canvas);
controls.minDistance = .65;
controls.maxDistance = 20;
const views = {
  bank: {position:[-5.7,1.95,1.275],target:[-11.35,1.67,1.275]},
  detail: {position:[-9.1,1.35,-1.65],target:[-11.3,.83,-.9]},
  side: {position:[-9.6,1.35,-2.65],target:[-11.45,.92,-.9]},
};
function setView(name) {
  camera.position.fromArray(views[name].position);
  controls.target.fromArray(views[name].target);
  controls.update();
  document.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === name)));
}
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
setView("bank");
let loaded = false;
function setModel(after) {
  if (after && !loaded) return;
  for (const kiosk of LOBBY_PLAN.kiosks) {
    world.root.getObjectByName(`${kiosk.id}-fallback`).visible = !after;
    const asset = world.root.getObjectByName(`${kiosk.id}-asset`);
    if (asset) asset.visible = after;
  }
  document.querySelector("#after").setAttribute("aria-pressed", String(after));
  document.querySelector("#before").setAttribute("aria-pressed", String(!after));
  renderer.shadowMap.needsUpdate = true;
}
document.querySelector("#after").addEventListener("click", () => setModel(true));
document.querySelector("#before").addEventListener("click", () => setModel(false));
const resize = () => {
  camera.aspect = panel.clientWidth / panel.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(panel.clientWidth, panel.clientHeight, false);
};
new ResizeObserver(resize).observe(panel);
resize();
renderer.shadowMap.needsUpdate = true;
renderer.setAnimationLoop(() => { world.updateVisibility(camera.position.x,camera.position.z); renderer.render(scene,camera); });
world.loadKioskAssets({
  url: `${import.meta.env.BASE_URL}models/mililani-ticket-kiosk.glb`,
  onLoaded() {
    loaded = true;
    document.querySelector("#after").disabled = false;
    document.querySelector("#status").textContent = "Blender model loaded · four shared instances. Dimensions follow the existing game; fine details are estimated from photos.";
    setModel(true);
  },
  onError(error) {
    document.querySelector("#status").textContent = "Model unavailable. Original kiosks remain visible.";
    setModel(false);
    console.error(error);
  },
});
