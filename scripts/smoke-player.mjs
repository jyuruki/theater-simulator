import assert from "node:assert/strict";

import * as THREE from "three";

import { AABBCollisionWorld, FirstPersonController } from "../src/player.js";

const POSITION_EPSILON = 1e-4;

function assertNear(actual, expected, message, epsilon = POSITION_EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function createDomStub() {
  const windowStub = {
    addEventListener() {},
    removeEventListener() {},
  };
  const documentStub = {
    defaultView: windowStub,
    pointerLockElement: null,
    addEventListener() {},
    removeEventListener() {},
    getElementById() {
      return null;
    },
  };

  return {
    ownerDocument: documentStub,
    addEventListener() {},
    removeEventListener() {},
  };
}

function createController({ collisionWorld, spawn, yaw = 0, onStuckRecovered = null }) {
  const controller = new FirstPersonController({
    camera: new THREE.PerspectiveCamera(70, 1, 0.1, 100),
    domElement: createDomStub(),
    collisionWorld,
    spawn,
    initialYaw: yaw,
    touchMode: false,
    onStuckRecovered,
  });
  controller.active = true;
  return controller;
}

// Direct movement into a wall stops at capsule contact without tunneling.
{
  const world = new AABBCollisionWorld();
  world.addBox({ minX: -10, maxX: 10, minZ: -1, maxZ: 0 });
  const position = new THREE.Vector3(0, 0, 1);
  const collision = world.moveCircle(position, 0, -2, 0.34);

  assertNear(position.x, 0, "wall stop must not add sideways movement");
  assertNear(position.z, 0.34, "wall stop must preserve capsule clearance");
  assert.equal(collision.collidedZ, true);
  assert.equal(world.isOverlapping(position, 0.34), false);
}

// Diagonal input retains its tangential component and slides along the wall.
{
  const world = new AABBCollisionWorld();
  world.addBox({ minX: 0, maxX: 0.25, minZ: -20, maxZ: 20 });
  const position = new THREE.Vector3(-0.34, 0, 0);

  for (let frame = 0; frame < 120; frame += 1) {
    world.moveCircle(position, 0.08, 0.08, 0.34);
  }

  assertNear(position.x, -0.34, "wall slide must retain the contact coordinate");
  assert.ok(position.z > 9, `wall slide should make useful progress, received z=${position.z}`);
  assert.ok(position.z < 10, `wall slide must not jump to a wall endpoint, received z=${position.z}`);
}

// Regression: X-first resolution formerly sent this shallowly overlapping
// capsule more than ten metres to an endpoint when it moved along the wall.
{
  const world = new AABBCollisionWorld();
  world.addBox({ minX: -10, maxX: 10, minZ: -1, maxZ: 0 });
  const position = new THREE.Vector3(0, 0, 0.2);

  world.moveCircle(position, 0.2, 0, 0.34);

  assertNear(position.x, 0.2, "shallow-overlap repair must preserve tangential movement");
  assertNear(position.z, 0.34 + 1e-6, "shallow-overlap repair must use the nearest face");
  assert.equal(world.isOverlapping(position, 0.34), false);
}

// Holding W against a flat wall for well beyond the old recovery timer is
// ordinary contact and must not copy a previous safe position.
{
  const world = new AABBCollisionWorld();
  world.addBox({ minX: -10, maxX: 10, minZ: -1, maxZ: 0 });
  let recoveryCount = 0;
  const controller = createController({
    collisionWorld: world,
    spawn: [0, 0, 0.34],
    onStuckRecovered: () => {
      recoveryCount += 1;
    },
  });
  controller._onKeyDown({ code: "KeyW" });

  for (let frame = 0; frame < 240; frame += 1) controller.update(1 / 60);

  assertNear(controller.position.x, 0, "held input must not shift the player sideways");
  assertNear(controller.position.z, 0.34, "held input must remain at wall contact");
  assert.equal(recoveryCount, 0, "wall contact must not invoke recovery");
}

// Jump input remains functional after collision resolution.
{
  const controller = createController({
    collisionWorld: new AABBCollisionWorld(),
    spawn: [0, 0, 0],
  });
  controller._onKeyDown({
    code: "Space",
    repeat: false,
    preventDefault() {},
  });
  controller.update(1 / 60);

  assert.equal(controller.grounded, false);
  assert.ok(controller.position.y > 0, "jump must raise the player");
  assert.ok(controller.verticalVelocity > 0, "jump must retain upward velocity");
}

// Recovery remains available explicitly and chooses the nearest wall face.
{
  const world = new AABBCollisionWorld();
  const controller = createController({ collisionWorld: world, spawn: [0, 0, 0.5] });
  world.addBox({ minX: -10, maxX: 10, minZ: -1, maxZ: 0.4 });

  assert.equal(world.isOverlapping(controller.position, controller.radius), true);
  assert.equal(controller.unstick({ fallback: false }), true);
  assertNear(controller.position.x, 0, "manual recovery must not jump along the wall");
  assertNear(
    controller.position.z,
    0.4 + controller.radius + 1e-6,
    "manual recovery must use the nearest face",
  );
  assert.equal(world.isOverlapping(controller.position, controller.radius), false);
}

console.log("Player smoke valid: wall stop/slide, stable input, jump, and manual recovery.");
