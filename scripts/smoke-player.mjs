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

function createController({
  collisionWorld,
  spawn,
  yaw = 0,
  ceilingSampler = null,
  onStuckRecovered = null,
}) {
  const controller = new FirstPersonController({
    camera: new THREE.PerspectiveCamera(70, 1, 0.1, 100),
    domElement: createDomStub(),
    collisionWorld,
    spawn,
    initialYaw: yaw,
    touchMode: false,
    ceilingSampler,
    onStuckRecovered,
  });
  controller.active = true;
  return controller;
}

// V6 movement tuning raises both default speeds by exactly 30 percent.
{
  const controller = createController({
    collisionWorld: new AABBCollisionWorld(),
    spawn: [0, 0, 0],
  });
  assertNear(controller.walkSpeed, 4.2 * 1.3, "default walk speed");
  assertNear(controller.runSpeed, 7.1 * 1.3, "default run speed");
}

// A sampled ceiling limits jump headroom, cancels the upward velocity at
// contact, and therefore keeps both the body and the lower camera below it.
{
  const ceilingUnderside = 2.12;
  let ceilingSamples = 0;
  const controller = createController({
    collisionWorld: new AABBCollisionWorld(),
    spawn: [0, 0, 0],
    ceilingSampler: (worldX, worldZ, feetY) => {
      assert.ok([worldX, worldZ, feetY].every(Number.isFinite));
      ceilingSamples += 1;
      return ceilingUnderside;
    },
  });
  controller._onKeyDown({
    code: "Space",
    repeat: false,
    preventDefault() {},
  });

  let contactedCeiling = false;
  for (let frame = 0; frame < 120; frame += 1) {
    controller.update(1 / 60);
    assert.ok(
      controller.position.y + controller.bodyHeight <= ceilingUnderside + POSITION_EPSILON,
      "jumping body must remain below the sampled ceiling",
    );
    assert.ok(
      controller.camera.position.y <= ceilingUnderside + POSITION_EPSILON,
      "jumping camera must remain below the sampled ceiling",
    );
    if (Math.abs(controller.position.y + controller.bodyHeight - ceilingUnderside) <= POSITION_EPSILON) {
      contactedCeiling = true;
      assert.equal(controller.verticalVelocity, 0, "ceiling contact must cancel upward velocity");
      break;
    }
  }

  assert.equal(contactedCeiling, true, "jump must reach the low sampled ceiling");
  assert.ok(ceilingSamples > 0, "jump must query the ceiling sampler");
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

// A thin walkable stair slab is solid from below, while a player whose feet
// are within one legal step of its top can cross the riser and be lifted by
// the ground sampler. This is the one-way collision contract used by V16's
// visually open lobby stair.
{
  const lowStepWorld = new AABBCollisionWorld();
  lowStepWorld.addBox({
    id: "reachable-stair-tread",
    minX: -1,
    maxX: 1,
    minY: 0.09,
    maxY: 0.21,
    minZ: 0,
    maxZ: 0.4,
    walkableTop: true,
    maxStepUp: 0.34,
  });
  const ascending = new THREE.Vector3(0, 0, -0.5);
  const lowCollision = lowStepWorld.moveCircle(ascending, 0, 1, 0.34, 0, 1.78);
  assert.equal(lowCollision.collidedZ, false, "reachable tread must not block a legal stair step");
  assert.ok(ascending.z > 0.4, "reachable tread must permit forward ascent movement");

  const highUndersideWorld = new AABBCollisionWorld();
  highUndersideWorld.addBox({
    id: "overhead-stair-tread",
    minX: -1,
    maxX: 1,
    minY: 1.88,
    maxY: 2,
    minZ: 0,
    maxZ: 0.4,
    walkableTop: true,
    maxStepUp: 0.34,
  });
  const underneath = new THREE.Vector3(0, 0, -0.5);
  const undersideCollision = highUndersideWorld.moveCircle(underneath, 0, 1, 0.34, 0, 1.78);
  assert.equal(undersideCollision.collidedZ, false, "a tread above standing headroom must leave the open underside traversable");
  assert.ok(underneath.z > 0.4, "open-underneath stair must remain visibly and physically open where headroom permits");

  const blockedUndersideWorld = new AABBCollisionWorld();
  blockedUndersideWorld.addBox({
    id: "low-overhead-stair-tread",
    minX: -1,
    maxX: 1,
    minY: 1.5,
    maxY: 1.62,
    minZ: 0,
    maxZ: 0.4,
    walkableTop: true,
    maxStepUp: 0.34,
  });
  const tooLow = new THREE.Vector3(0, 0, -0.5);
  const blockedCollision = blockedUndersideWorld.moveCircle(tooLow, 0, 1, 0.34, 0, 1.78);
  assert.equal(blockedCollision.collidedZ, true, "low tread underside must block body clipping");
  assertNear(tooLow.z, -0.34, "low tread underside capsule stop");
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

// V6's faster run speed still cannot tunnel through a wall during ordinary
// controller updates, even after acceleration reaches its new maximum.
{
  const world = new AABBCollisionWorld();
  world.addBox({ minX: -10, maxX: 10, minZ: -1, maxZ: 0 });
  const controller = createController({ collisionWorld: world, spawn: [0, 0, 3] });
  controller._onKeyDown({ code: "KeyW" });
  controller._onKeyDown({ code: "ShiftLeft" });
  for (let frame = 0; frame < 180; frame += 1) controller.update(1 / 60);
  assertNear(controller.position.z, controller.radius, "high-speed run must stop at capsule contact");
  assert.equal(world.isOverlapping(controller.position, controller.radius), false);
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

console.log("Player smoke valid: wall stop/slide, stable input, jump headroom, and manual recovery.");
