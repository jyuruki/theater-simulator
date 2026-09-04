import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import * as THREE from "three";
import { AUDITORIUMS, LOBBY_PLAN } from "../src/layout-data.js";
import { planToWorldX } from "../src/coordinates.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AABBCollisionWorld } from "../src/player.js";
import { createTheaterCrowd } from "../src/atmosphere.js";
import { createCinemaMedia } from "../src/cinema-media.js";
import { createVisitState, segmentHitsBox } from "../src/visit-state.js";
import {
  createVisitUI,
  createInteractionTargets,
  nearestInteraction,
} from "../src/visit-ui.js";
import { SHOWS } from "../src/showtimes.js";

class CanvasStub {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    const gradient = { addColorStop() {} };
    const context = {
      canvas: this,
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      getImageData: (_x, _y, w, h) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
      measureText: (text) => ({ width: String(text).length * 12 }),
    };
    return new Proxy(context, {
      get: (target, key) => target[key] ?? (() => {}),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
  }
}
globalThis.OffscreenCanvas = CanvasStub;
const dom = new Window({
  url: "https://example.test/theater-simulator/",
  settings: {
    disableJavaScriptEvaluation: true,
    disableCSSFileLoading: true,
    disableJavaScriptFileLoading: true,
  },
});
globalThis.window = dom;
globalThis.document = dom.document;
document.write(readFileSync(new URL("../index.html", import.meta.url), "utf8"));
const scene = new THREE.Scene(),
  materials = createMaterialLibrary({
    capabilities: { getMaxAnisotropy: () => 4 },
  });
const world = createTheaterWorld({ scene, materials });
const staticCollision = new AABBCollisionWorld({ bounds: world.worldBounds });
staticCollision.addBoxes(world.colliders);
scene.updateMatrixWorld(true);

// Verify rendered triangles and materials, not just layout declarations.
const ray = new THREE.Raycaster();
const probes = [
  [-15.4, 18, "Floor / dark service concrete"],
  [-18, 14.4, "Floor / dark service concrete"],
  [-8, 11, "Stone / warm gray honed lobby slabs"],
];
for (const [x, z, finish] of probes) {
  ray.set(
    new THREE.Vector3(planToWorldX(x), 0.22, z),
    new THREE.Vector3(0, -1, 0),
  );
  const hits = ray
    .intersectObject(world.root, true)
    .filter((hit) => hit.distance < 0.23);
  assert.ok(hits.length, `Rendered floor missing at ${x},${z}`);
  assert.ok(
    Math.abs(hits[0].point.y) < 0.001,
    "Floor finishes must share the same level.",
  );
  assert.equal(hits[0].object.material.name, finish);
}
for (const [x, z] of [
  [-15.4, 18],
  [-18, 14.4],
  [-17, 19],
]) {
  ray.set(
    new THREE.Vector3(planToWorldX(x), 1.68, z),
    new THREE.Vector3(0, 1, 0),
  );
  const hits = ray.intersectObject(world.root, true);
  assert.ok(hits.length, `Kitchen ceiling hole at ${x},${z}`);
  assert.ok(
    Math.abs(hits[0].point.y - 4.55) < 0.005,
    `Kitchen roof must be low and continuous at ${x},${z}. Got ${hits[0].point.y}`,
  );
  assert.ok(
    Math.abs(world.ceilingHeight(planToWorldX(x), z, 0) - hits[0].point.y) <
      0.005,
  );
}
for (let x = -16.5; x <= -15.9; x += 0.1)
  for (let z = 17; z <= 19; z += 0.25) {
    ray.set(
      new THREE.Vector3(planToWorldX(x), 0.22, z),
      new THREE.Vector3(0, -1, 0),
    );
    const hits = ray
      .intersectObject(world.root, true)
      .filter((hit) => hit.distance < 0.23);
    assert.ok(hits.length, "Floor boundary has a rendered gap.");
    assert.equal(
      new Set(hits.map((hit) => hit.object.uuid + ":" + (hit.instanceId ?? "")))
        .size,
      1,
      "Separate floor owners must not overlap along the kitchen finish boundary.",
    );
  }
const nookPosition = { x: planToWorldX(-18), y: 0, z: 14.1 };
assert.equal(
  staticCollision.isOverlapping(nookPosition, 0.34, 0, 1.78),
  false,
  "The connector-door nook stays usable.",
);
assert.equal(
  staticCollision.isOverlapping(
    { x: planToWorldX(-16.2), y: 0, z: 12 },
    0.34,
    0,
    1.78,
  ),
  true,
  "The separator must sit on the original straight floor boundary.",
);

// Actual animated leaves, with collision updated before each movement step.
const movement = new AABBCollisionWorld({ bounds: world.worldBounds });
movement.addBoxes(world.colliders);
const dynamic = movement.addBoxes(world.dynamicColliders);
function updateDoors(delta, position) {
  world.update(delta, position);
  dynamic.forEach((box) => Object.assign(box, box.source));
}
for (const door of LOBBY_PLAN.frontEntrance.doors) {
  for (let i = 0; i < 90; i++) updateDoors(1 / 60, null);
  const closedPoint = {
    x: planToWorldX(door.center + 0.4),
    y: 0,
    z: LOBBY_PLAN.frontEntrance.facadeZ,
  };
  assert.equal(
    movement.isOverlapping(closedPoint, 0.34, 0, 1.78),
    true,
    "Closed glass leaves must block movement.",
  );
  const player = { x: planToWorldX(door.center), y: 0, z: -8 };
  for (let frame = 0; frame < 150; frame++) {
    updateDoors(1 / 60, player);
    const oldZ = player.z;
    movement.moveCircle(player, 0, 5.6 / 60, 0.34, 0, 1.78);
    assert.ok(
      player.z >= oldZ - 0.005,
      "Door movement must not eject an approaching player backwards.",
    );
  }
  assert.ok(player.z > 0.5, `Door ${door.id} did not open a traversable path.`);
  const threshold = { x: planToWorldX(door.center), y: 0, z: -2.5 };
  for (let frame = 0; frame < 180; frame++) updateDoors(1 / 60, threshold);
  assert.equal(
    movement.isOverlapping(threshold, 0.34, 0, 1.78),
    false,
    "Doors must remain open while someone is in the threshold.",
  );
}

const crowd = createTheaterCrowd({
  scene,
  collisionWorld: staticCollision,
  world,
});
assert.equal(crowd.actors.length, 6);
const actorStarts = crowd.actors.map((actor) => actor.group.position.clone());
for (let frame = 0; frame < 900; frame++)
  crowd.update(1 / 30, { x: 90, y: 0, z: -5 }, true);
assert.ok(
  crowd.actors
    .slice(0, 3)
    .every(
      (actor, index) => actor.group.position.distanceTo(actorStarts[index]) > 1,
    ),
  "All three visitors must actually walk.",
);
for (const actor of crowd.actors) {
  const position = actor.group.position;
  const other = new AABBCollisionWorld();
  other.addBoxes(world.colliders);
  assert.equal(
    other.isOverlapping(position, 0.22, 0, 1.78),
    false,
    `${actor.group.name} clips into architecture.`,
  );
}
const yielding = crowd.actors[0],
  yieldPosition = yielding.group.position.clone();
crowd.update(0.1, { x: yieldPosition.x + 0.8, y: 0, z: yieldPosition.z }, true);
assert.equal(
  yielding.group.position.distanceTo(yieldPosition),
  0,
  "Visitors must yield near the player.",
);
crowd.setEnabled(false);
assert.ok(crowd.actors.every((actor) => !actor.box.enabled));
const media = createCinemaMedia({ scene, world, materials });
media.update(1 / 6, "theater-3", true);
scene.updateMatrixWorld(true);
for (const room of AUDITORIUMS) {
  for (const side of ["east", "west"]) {
    const sign = scene.getObjectByName(`${room.id}-hanging-show-${side}`);
    assert.ok(sign);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      sign.getWorldQuaternion(new THREE.Quaternion()),
    );
    assert.ok(
      side === "east" ? normal.x < -0.99 : normal.x > 0.99,
      "Both placard faces must point outward, with readable text.",
    );
  }
}
for (const material of [
  materials.hallWall,
  materials.restroomWall,
  materials.mosaicWall,
]) {
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes("instanceMatrix * finishPosition"));
  assert.ok(
    shader.fragmentShader.includes("diffuseColor.rgb *=") &&
      shader.fragmentShader.includes("vFinishWorld"),
  );
}

const visit = createVisitState();
assert.equal(visit.checkTicket(), false);
assert.equal(visit.collectOrder(), false);
for (const show of SHOWS) {
  const room = AUDITORIUMS.find((room) => room.number === show.auditorium);
  const row = room.rows.length - 1,
    seat = room.rows[row];
  assert.equal(visit.reserve(show.id, show.times[2], row, seat).seat, seat);
  assert.throws(
    () => visit.reserve(show.id, show.times[2], row, seat + 1),
    RangeError,
  );
}
assert.throws(
  () => visit.reserve("show-1", "not-a-showtime", 0, 1),
  RangeError,
);
visit.placeOrder("burger");
assert.throws(() => visit.placeOrder("popcorn"));
assert.equal(visit.collectOrder(), false);
for (let i = 0; i < 120; i++) visit.update(0.1);
assert.equal(visit.order.status, "ready");
assert.ok(visit.collectOrder());
assert.equal(visit.collectOrder(), false);
assert.throws(() => visit.placeOrder("nonexistent"), RangeError);
assert.equal(
  segmentHitsBox(
    { x: 0, y: 1.6, z: 0 },
    { x: 3, y: 1.6, z: 0 },
    { minX: 1, maxX: 1.2, minY: 0, maxY: 3, minZ: -1, maxZ: 1 },
  ),
  true,
);

// Exercise the actual DOM ticket/order flow using the actual scene targets.
const camera = new THREE.PerspectiveCamera();
const controller = {
  started: true,
  active: true,
  isTouchMode: false,
  position: new THREE.Vector3(),
  pause() {
    this.active = false;
  },
  resume() {
    this.active = true;
  },
};
const audio = {
  enabled: false,
  volume: 0.25,
  setEnabled(value) {
    this.enabled = value;
  },
  setVolume(value) {
    this.volume = value;
  },
};
const ui = createVisitUI({
  controller,
  camera,
  collisionWorld: staticCollision,
  showToast() {},
  onSound() {},
  audio,
  crowd,
  toggleMap() {},
});
const targets = createInteractionTargets(),
  locations = new Map();
for (const target of targets) {
  let found = null;
  for (const radius of [1.05, 1.5, 2])
    for (let i = 0; i < 24 && !found; i++) {
      const angle = (i * Math.PI) / 12,
        feet = new THREE.Vector3(
          target.position.x + Math.cos(angle) * radius,
          0,
          target.position.z + Math.sin(angle) * radius,
        );
      if (
        staticCollision.isOverlapping(feet, 0.34, 0, 1.78) ||
        Math.abs(world.groundHeight(feet.x, feet.z, 0)) > 0.05
      )
        continue;
      const eye = feet.clone();
      eye.y = 1.68;
      const direction = target.position.clone().sub(eye).normalize();
      if (
        nearestInteraction(targets, eye, direction, staticCollision.colliders)
          ?.id === target.id
      )
        found = feet;
    }
  assert.ok(found, `${target.id} cannot be used from a clear reachable side.`);
  locations.set(target.id, found);
}
function approach(id) {
  controller.active = true;
  controller.position.copy(locations.get(id));
  camera.position.copy(controller.position);
  camera.position.y = 1.68;
  camera.lookAt(targets.find((target) => target.id === id).position);
  ui.update(0.016);
  assert.equal(document.querySelector("#interact-button").hidden, false);
  document.querySelector("#interact-button").click();
  assert.equal(document.querySelector("#visit-dialog").open, true);
  assert.equal(controller.active, false);
}
function clickText(text) {
  const button = [...document.querySelectorAll("#visit-dialog button")].find(
    (button) => button.textContent.includes(text),
  );
  assert.ok(button, `Missing button: ${text}`);
  button.click();
}
function close() {
  document.querySelector("#visit-dialog").close();
  assert.equal(controller.active, true);
}
approach("ticket-kiosk-1");
assert.equal(document.querySelectorAll("#movie-select option").length, 14);
assert.equal(
  document.querySelectorAll(".seat-choice").length,
  AUDITORIUMS[0].seats,
);
clickText("Get ticket");
assert.ok(ui.visit.ticket);
assert.match(
  document.querySelector(".admission-ticket").textContent,
  /Theater 1/,
);
close();
approach("ticket-check");
assert.equal(ui.visit.ticket.checked, true);
close();
approach(targets.find((target) => target.kind === "concessions").id);
clickText("Garlic fries");
assert.equal(ui.visit.order.status, "preparing");
close();
approach("expo");
assert.equal(document.querySelector("#collect-order").disabled, true);
for (let i = 0; i < 100; i++) ui.update(0.1);
assert.equal(document.querySelector("#collect-order").disabled, false);
clickText("Collect your food");
assert.equal(ui.visit.order.status, "collected");
close();
approach("soda-fountain-1");
clickText("Cola");
assert.equal(ui.visit.drink, "Cola");
assert.equal(document.querySelector("#visit-dialog").open, false);
document.querySelector("#settings-button").click();
assert.ok(document.querySelector("input[type=range]"));
close();

console.log(
  `V18 visit valid: rendered kitchen floors/roofs · 6 animated double doors · 6 safe actors · ${targets.length} usable targets · all 14 real seat plans · ticket, order, pickup, drink and settings DOM flows.`,
);
media.dispose();
crowd.dispose();
world.dispose();
materials.dispose();
dom.happyDOM.abort();
