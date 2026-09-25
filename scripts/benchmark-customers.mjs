import * as THREE from "three";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createShowAttendance, MAX_SHOW_AUDIENCE } from "../src/show-attendance.js";
import { PATRON_LOBBY, PATRON_EXIT } from "../src/show-customer-navigation.js";
import { createShowCustomers as currentCustomers } from "../src/show-customers.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const baseline = process.argv[2];
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const relativeImports = source => source.replaceAll('from "three"', `from "${import.meta.resolve("three")}"`).replace(/from "(\.\/[^"]+)"/g, (_all, path) => `from "${new URL(path, new URL("../src/", import.meta.url))}"`);
let createShowCustomers = currentCustomers;
if (baseline) {
  const git = path => execFileSync("git", ["show", `${baseline}:${path}`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
  const nav = moduleURL(relativeImports(git("src/show-customer-navigation.js")));
  const customer = relativeImports(git("src/show-customers.js")).replace(new URL("../src/show-customer-navigation.js", import.meta.url).href, nav);
  ({ createShowCustomers } = await import(moduleURL(customer)));
}
import { createUsherDoors } from "../src/usher-doors.js";
import { createUsherWaste } from "../src/usher-waste.js";
import { AABBCollisionWorld } from "../src/player.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AUDITORIUMS } from "../src/layout-data.js";
class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this, createLinearGradient: () => gradient,
    createRadialGradient: () => gradient, measureText: text => ({ width: String(text).length * 12 }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }) }, { get: (o, k) => o[k] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const scene = new THREE.Scene(), materials = createMaterialLibrary(), world = createTheaterWorld({ scene, materials });
const camera = new THREE.PerspectiveCamera(); camera.position.set(130, 1.68, -20);
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds }); collisionWorld.addBoxes(world.colliders);
const doors = createUsherDoors({ scene, world, camera, collisionWorld });
const waste = createUsherWaste({ scene, world, camera, collisionWorld });
const customers = createShowCustomers({ scene, world, camera, collisionWorld, doors, waste });
const bytes = readFileSync(new URL("../public/models/theater-npcs.glb", import.meta.url));
const before = performance.now();
await customers.loadAssets({ loadModel: () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "") });
const startupMs = performance.now() - before;
for (const id of ["theater-2", "theater-6"]) {
  const plan = customers.navigation.seatPlans.find(plan => plan.id === id);
  customers.navigation.theaterSeats(id, createShowAttendance(plan, {cycle: 1}).seatIds);
  customers.onStart({id:`bench-${id}`, theaterId:id,cycle:0});
}
const samples=[];let movingSamples=0;
for(let i=0;i<4000;i++) {
  if (i%10===0) await new Promise(resolve=>setTimeout(resolve,0));
  world.entranceDoors.update(.05,camera.position); doors.update(.05,{active:true});
  const began=performance.now();customers.update(.05,true);const elapsed=performance.now()-began;
  if(customers.actors.some(actor=>actor.state==="arriving")){ samples.push(elapsed); movingSamples++; }
}
samples.sort((a,b)=>a-b);
console.log(JSON.stringify({ version:baseline??"working", startupMs, movingSamples, meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1), entered:customers.getSnapshot().stats.entered,navigation:customers.navigation.stats??null }));
customers.dispose();waste.dispose();doors.dispose();world.dispose();materials.dispose();
