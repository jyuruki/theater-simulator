import * as THREE from "three";

const EPSILON = 1e-6;
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moveToward(value, target, maxDelta) {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return target;
}

function vectorFrom(value, fallback = { x: 0, y: 0, z: 0 }) {
  if (Array.isArray(value)) {
    return new THREE.Vector3(value[0] ?? fallback.x, value[1] ?? fallback.y, value[2] ?? fallback.z);
  }

  return new THREE.Vector3(value?.x ?? fallback.x, value?.y ?? fallback.y, value?.z ?? fallback.z);
}

function normalizeBounds(bounds) {
  if (!bounds) return null;

  const minX = bounds.xMin ?? bounds.minX ?? bounds.min?.x;
  const maxX = bounds.xMax ?? bounds.maxX ?? bounds.max?.x;
  const minZ = bounds.zMin ?? bounds.minZ ?? bounds.min?.z;
  const maxZ = bounds.zMax ?? bounds.maxZ ?? bounds.max?.z;

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ) {
    throw new TypeError("World bounds must contain finite xMin/xMax/zMin/zMax values with positive size.");
  }

  return { minX, maxX, minZ, maxZ };
}

function normalizeCollider(source, fallbackId) {
  if (!source) throw new TypeError("A collider is required.");

  const minX = source.xMin ?? source.minX ?? source.min?.x;
  const maxX = source.xMax ?? source.maxX ?? source.max?.x;
  const minZ = source.zMin ?? source.minZ ?? source.min?.z;
  const maxZ = source.zMax ?? source.maxZ ?? source.max?.z;
  const minY = source.yMin ?? source.minY ?? source.min?.y ?? Number.NEGATIVE_INFINITY;
  const maxY = source.yMax ?? source.maxY ?? source.max?.y ?? Number.POSITIVE_INFINITY;

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ) {
    throw new TypeError("Collider must contain finite min/max X and Z values with positive size.");
  }

  if (Number.isNaN(minY) || Number.isNaN(maxY) || minY >= maxY) {
    throw new TypeError("Collider minY must be lower than maxY when vertical limits are supplied.");
  }

  return {
    id: source.id ?? fallbackId,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    enabled: source.enabled !== false,
    source,
  };
}

/**
 * Lightweight collision world for a mostly orthogonal, static interior.
 *
 * Colliders may use either `{ min: {x,y,z}, max: {x,y,z} }` (including
 * THREE.Box3) or `{ minX, maxX, minY, maxY, minZ, maxZ }`. Movement treats
 * the player as a vertical capsule whose XZ footprint is a circle.
 */
export class AABBCollisionWorld {
  constructor({ bounds = null } = {}) {
    this.bounds = normalizeBounds(bounds);
    this.colliders = [];
    this._nextColliderId = 1;
  }

  setBounds(bounds) {
    this.bounds = normalizeBounds(bounds);
    return this;
  }

  addBox(box, id) {
    const collider = normalizeCollider(box, id ?? `collider-${this._nextColliderId++}`);
    this.colliders.push(collider);
    return collider;
  }

  addBoxes(boxes) {
    return boxes.map((box) => this.addBox(box));
  }

  remove(colliderOrId) {
    const index = this.colliders.findIndex(
      (collider) => collider === colliderOrId || collider.id === colliderOrId,
    );
    if (index < 0) return false;
    this.colliders.splice(index, 1);
    return true;
  }

  clear() {
    this.colliders.length = 0;
    return this;
  }

  setEnabled(colliderOrId, enabled) {
    const collider = this.colliders.find(
      (candidate) => candidate === colliderOrId || candidate.id === colliderOrId,
    );
    if (!collider) return false;
    collider.enabled = Boolean(enabled);
    return true;
  }

  _overlapsVertically(collider, feetY, height) {
    return feetY + height > collider.minY + EPSILON && feetY < collider.maxY - EPSILON;
  }

  _resolveX(position, radius, direction, feetY, height, previousX = null) {
    let collided = false;

    for (const box of this.colliders) {
      if (!box.enabled || !this._overlapsVertically(box, feetY, height)) continue;

      const nearestZ = clamp(position.z, box.minZ, box.maxZ);
      const zDistance = position.z - nearestZ;
      const zDistanceSquared = zDistance * zDistance;
      if (zDistanceSquared >= radius * radius) continue;

      const xPadding = Math.sqrt(Math.max(0, radius * radius - zDistanceSquared));
      const leftLimit = box.minX - xPadding;
      const rightLimit = box.maxX + xPadding;
      if (position.x <= leftLimit || position.x >= rightLimit) continue;

      if (direction > 0) {
        // Only the X movement that crossed the collider's left boundary may
        // resolve to that boundary. If the capsule was already overlapping
        // on another axis, treating its movement direction as the collision
        // normal can eject it across the entire width of a long wall.
        if (previousX !== null && previousX > leftLimit + EPSILON) continue;
        position.x = leftLimit;
      } else if (direction < 0) {
        if (previousX !== null && previousX < rightLimit - EPSILON) continue;
        position.x = rightLimit;
      } else {
        position.x = position.x - leftLimit < rightLimit - position.x ? leftLimit : rightLimit;
      }
      collided = true;
    }

    return collided;
  }

  _resolveZ(position, radius, direction, feetY, height, previousZ = null) {
    let collided = false;

    for (const box of this.colliders) {
      if (!box.enabled || !this._overlapsVertically(box, feetY, height)) continue;

      const nearestX = clamp(position.x, box.minX, box.maxX);
      const xDistance = position.x - nearestX;
      const xDistanceSquared = xDistance * xDistance;
      if (xDistanceSquared >= radius * radius) continue;

      const zPadding = Math.sqrt(Math.max(0, radius * radius - xDistanceSquared));
      const nearLimit = box.minZ - zPadding;
      const farLimit = box.maxZ + zPadding;
      if (position.z <= nearLimit || position.z >= farLimit) continue;

      if (direction > 0) {
        if (previousZ !== null && previousZ > nearLimit + EPSILON) continue;
        position.z = nearLimit;
      } else if (direction < 0) {
        if (previousZ !== null && previousZ < farLimit - EPSILON) continue;
        position.z = farLimit;
      } else {
        position.z = position.z - nearLimit < farLimit - position.z ? nearLimit : farLimit;
      }
      collided = true;
    }

    return collided;
  }

  _applyBounds(position, radius) {
    if (!this.bounds) return { x: false, z: false };

    const oldX = position.x;
    const oldZ = position.z;
    position.x = clamp(position.x, this.bounds.minX + radius, this.bounds.maxX - radius);
    position.z = clamp(position.z, this.bounds.minZ + radius, this.bounds.maxZ - radius);
    return { x: oldX !== position.x, z: oldZ !== position.z };
  }

  /**
   * Returns true when the player's circular XZ footprint penetrates an
   * enabled collider (or the configured world bounds) at the supplied
   * vertical span. Merely touching a surface is not treated as overlap.
   */
  isOverlapping(position, radius, feetY = position?.y ?? 0, height = 1.8) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
      throw new TypeError("isOverlapping requires a position with finite x and z values.");
    }
    if (!(radius > 0) || !(height > 0)) throw new RangeError("Player radius and height must be positive.");

    if (this.bounds) {
      if (
        position.x < this.bounds.minX + radius - EPSILON
        || position.x > this.bounds.maxX - radius + EPSILON
        || position.z < this.bounds.minZ + radius - EPSILON
        || position.z > this.bounds.maxZ - radius + EPSILON
      ) {
        return true;
      }
    }

    const radiusSquared = radius * radius;
    for (const box of this.colliders) {
      if (!box.enabled || !this._overlapsVertically(box, feetY, height)) continue;
      const nearestX = clamp(position.x, box.minX, box.maxX);
      const nearestZ = clamp(position.z, box.minZ, box.maxZ);
      const deltaX = position.x - nearestX;
      const deltaZ = position.z - nearestZ;
      if (deltaX * deltaX + deltaZ * deltaZ < radiusSquared - EPSILON) return true;
    }

    return false;
  }

  /**
   * Mutates `position` and returns collision flags. Long movements are
   * subdivided so a low frame rate cannot tunnel through a thin wall.
   */
  moveCircle(position, deltaX, deltaZ, radius, feetY = position.y ?? 0, height = 1.8) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
      throw new TypeError("moveCircle requires a mutable position with finite x and z values.");
    }
    if (!(radius > 0) || !(height > 0)) throw new RangeError("Player radius and height must be positive.");

    const distance = Math.hypot(deltaX, deltaZ);
    const steps = Math.max(1, Math.min(64, Math.ceil(distance / Math.max(radius * 0.45, 0.05))));
    const stepX = deltaX / steps;
    const stepZ = deltaZ / steps;
    let collidedX = false;
    let collidedZ = false;

    // Repair a shallow seam penetration locally before applying input. This
    // uses the shortest escape path and never falls back to a stored position.
    if (this.isOverlapping(position, radius, feetY, height)) {
      const beforeX = position.x;
      const beforeZ = position.z;
      this.depenetrate(position, radius, feetY, height);
      collidedX = Math.abs(position.x - beforeX) > EPSILON;
      collidedZ = Math.abs(position.z - beforeZ) > EPSILON;
    }

    for (let step = 0; step < steps; step += 1) {
      const previousX = position.x;
      position.x += stepX;
      if (Math.abs(stepX) > EPSILON) {
        collidedX = this._resolveX(
          position,
          radius,
          Math.sign(stepX),
          feetY,
          height,
          previousX,
        ) || collidedX;
      }
      const xBounds = this._applyBounds(position, radius);
      collidedX = xBounds.x || collidedX;

      const previousZ = position.z;
      position.z += stepZ;
      if (Math.abs(stepZ) > EPSILON) {
        collidedZ = this._resolveZ(
          position,
          radius,
          Math.sign(stepZ),
          feetY,
          height,
          previousZ,
        ) || collidedZ;
      }
      const zBounds = this._applyBounds(position, radius);
      collidedX = zBounds.x || collidedX;
      collidedZ = zBounds.z || collidedZ;
    }

    return { collidedX, collidedZ, position };
  }

  /** Attempts to move a player that was spawned inside a collider to safety. */
  depenetrate(position, radius, feetY = position.y ?? 0, height = 1.8, iterations = 4) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const beforeX = position.x;
      const beforeZ = position.z;

      for (const box of this.colliders) {
        if (!box.enabled || !this._overlapsVertically(box, feetY, height)) continue;

        const nearestX = clamp(position.x, box.minX, box.maxX);
        const nearestZ = clamp(position.z, box.minZ, box.maxZ);
        const deltaX = position.x - nearestX;
        const deltaZ = position.z - nearestZ;
        const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
        if (distanceSquared >= radius * radius - EPSILON) continue;

        if (distanceSquared > EPSILON * EPSILON) {
          const distance = Math.sqrt(distanceSquared);
          const correction = radius - distance + EPSILON;
          position.x += (deltaX / distance) * correction;
          position.z += (deltaZ / distance) * correction;
          continue;
        }

        // The center is inside the box (or exactly on one of its faces).
        // Escape through the closest expanded face, rather than resolving X
        // first and potentially jumping the length of a horizontal wall.
        const escapes = [
          { axis: "x", value: box.minX - radius, distance: Math.abs(position.x - (box.minX - radius)) },
          { axis: "x", value: box.maxX + radius, distance: Math.abs(position.x - (box.maxX + radius)) },
          { axis: "z", value: box.minZ - radius, distance: Math.abs(position.z - (box.minZ - radius)) },
          { axis: "z", value: box.maxZ + radius, distance: Math.abs(position.z - (box.maxZ + radius)) },
        ];
        const escape = escapes.reduce((closest, candidate) => (
          candidate.distance < closest.distance ? candidate : closest
        ));
        position[escape.axis] = escape.value;
      }
      this._applyBounds(position, radius);
      if (Math.abs(beforeX - position.x) < EPSILON && Math.abs(beforeZ - position.z) < EPSILON) break;
    }
    return position;
  }
}

/**
 * First-person character motor with desktop pointer-lock and mobile controls.
 * The camera is only a view of player state; `position` is the player's feet.
 */
export class FirstPersonController {
  constructor({
    camera,
    domElement,
    collisionWorld = new AABBCollisionWorld(),
    bounds = null,
    spawn = null,
    groundHeight = 0,
    groundSampler = null,
    ceilingSampler = null,
    eyeHeight = 1.68,
    bodyHeight = 1.78,
    radius = 0.34,
    walkSpeed = 5.46,
    runSpeed = 9.23,
    acceleration = 24,
    deceleration = 30,
    gravity = 24,
    jumpSpeed = 5.9,
    coyoteTime = 0.08,
    jumpBufferTime = 0.1,
    maxStepHeight = 0.34,
    groundSnapDistance = 0.42,
    mouseSensitivity = 0.0021,
    touchLookSensitivity = 0.0043,
    initialYaw = null,
    initialPitch = null,
    touchMode = null,
    touchControls = null,
    moveStick = null,
    moveKnob = null,
    runButton = null,
    touchJumpButton = null,
    onLockChange = null,
    onLockError = null,
    onStuckRecovered = null,
  } = {}) {
    if (!camera?.isCamera) throw new TypeError("FirstPersonController requires a Three.js camera.");
    if (!domElement?.addEventListener) throw new TypeError("FirstPersonController requires a DOM element.");
    if (!(collisionWorld instanceof AABBCollisionWorld)) {
      throw new TypeError("collisionWorld must be an AABBCollisionWorld.");
    }
    if (!Number.isFinite(jumpSpeed) || jumpSpeed < 0) {
      throw new RangeError("jumpSpeed must be a finite non-negative number.");
    }
    if (!Number.isFinite(coyoteTime) || coyoteTime < 0) {
      throw new RangeError("coyoteTime must be a finite non-negative number.");
    }
    if (!Number.isFinite(jumpBufferTime) || jumpBufferTime < 0) {
      throw new RangeError("jumpBufferTime must be a finite non-negative number.");
    }
    if (ceilingSampler !== null && typeof ceilingSampler !== "function") {
      throw new TypeError("Ceiling sampler must be a function or null.");
    }
    this.camera = camera;
    this.domElement = domElement;
    this.collisionWorld = collisionWorld;
    if (bounds) this.collisionWorld.setBounds(bounds);

    this.eyeHeight = eyeHeight;
    this.bodyHeight = bodyHeight;
    this.radius = radius;
    this.walkSpeed = walkSpeed;
    this.runSpeed = runSpeed;
    this.acceleration = acceleration;
    this.deceleration = deceleration;
    this.gravity = gravity;
    this.jumpSpeed = jumpSpeed;
    this.coyoteTime = Math.max(0, coyoteTime);
    this.jumpBufferTime = Math.max(0, jumpBufferTime);
    this.maxStepHeight = maxStepHeight;
    this.groundSnapDistance = groundSnapDistance;
    this.mouseSensitivity = mouseSensitivity;
    this.touchLookSensitivity = touchLookSensitivity;
    this.groundHeight = groundHeight;
    this.groundSampler = groundSampler;
    this.ceilingSampler = ceilingSampler;
    this.onLockChange = onLockChange;
    this.onLockError = onLockError;
    this.onStuckRecovered = onStuckRecovered;

    const fallbackSpawn = { x: camera.position.x, y: groundHeight, z: camera.position.z };
    this.position = vectorFrom(spawn, fallbackSpawn);
    this.velocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.grounded = true;
    this.yaw = initialYaw ?? camera.rotation.y ?? 0;
    this.pitch = initialPitch ?? camera.rotation.x ?? 0;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.015, Math.PI / 2 - 0.015);

    const coarsePointer =
      typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches === true;
    this.isTouchMode = touchMode ?? coarsePointer;

    const documentRef = domElement.ownerDocument ?? (typeof document !== "undefined" ? document : null);
    this.document = documentRef;
    this.window = documentRef?.defaultView ?? (typeof window !== "undefined" ? window : null);
    this.touchControls = touchControls ?? documentRef?.getElementById("touch-controls") ?? null;
    this.moveStick = moveStick ?? documentRef?.getElementById("move-stick") ?? null;
    this.moveKnob = moveKnob ?? documentRef?.getElementById("move-knob") ?? null;
    this.runButton = runButton ?? documentRef?.getElementById("touch-run") ?? null;
    this.touchJumpButton = touchJumpButton ?? documentRef?.getElementById("touch-jump") ?? null;

    this.started = false;
    this.active = false;
    this._listeners = [];
    this._keys = new Set();
    this._touchMove = new THREE.Vector2();
    this._touchRunning = false;
    this._movePointerId = null;
    this._lookPointerId = null;
    this._lastLookX = 0;
    this._lastLookY = 0;
    this._simulationTime = 0;
    this._lastGroundedTime = Number.NEGATIVE_INFINITY;
    this._jumpQueuedUntil = Number.NEGATIVE_INFINITY;
    this._lastSafePosition = null;
    this._safePositionHistory = [];

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onPointerLockError = this._onPointerLockError.bind(this);
    this._onMovePointerDown = this._onMovePointerDown.bind(this);
    this._onMovePointerMove = this._onMovePointerMove.bind(this);
    this._onMovePointerEnd = this._onMovePointerEnd.bind(this);
    this._onLookPointerDown = this._onLookPointerDown.bind(this);
    this._onLookPointerMove = this._onLookPointerMove.bind(this);
    this._onLookPointerEnd = this._onLookPointerEnd.bind(this);
    this._onRunPointerDown = this._onRunPointerDown.bind(this);
    this._onRunPointerEnd = this._onRunPointerEnd.bind(this);
    this._onJumpPointerDown = this._onJumpPointerDown.bind(this);
    this._onJumpPointerEnd = this._onJumpPointerEnd.bind(this);
    this._onBlur = this._onBlur.bind(this);

    this.collisionWorld.depenetrate(this.position, this.radius, this.position.y, this.bodyHeight);
    const initialGroundY = this._sampleGround(this.position.x, this.position.z, this.position.y);
    if (initialGroundY !== null && Math.abs(this.position.y - initialGroundY) <= this.groundSnapDistance) {
      this.position.y = initialGroundY;
      this.grounded = true;
      this._lastGroundedTime = this._simulationTime;
    } else {
      this.grounded = false;
    }
    this._rememberSafePosition(true);
    this._syncCamera();
  }

  get isLocked() {
    return this.document?.pointerLockElement === this.domElement;
  }

  get isRunning() {
    return this._touchRunning || this._keys.has("ShiftLeft") || this._keys.has("ShiftRight");
  }

  _listen(target, type, listener, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener, options);
    this._listeners.push(() => target.removeEventListener(type, listener, options));
  }

  _attachListeners() {
    this._listen(this.document, "keydown", this._onKeyDown);
    this._listen(this.document, "keyup", this._onKeyUp);
    this._listen(this.document, "mousemove", this._onMouseMove);
    this._listen(this.document, "pointerlockchange", this._onPointerLockChange);
    this._listen(this.document, "pointerlockerror", this._onPointerLockError);
    this._listen(this.window, "blur", this._onBlur);

    this._listen(this.moveStick, "pointerdown", this._onMovePointerDown);
    this._listen(this.moveStick, "pointermove", this._onMovePointerMove);
    this._listen(this.moveStick, "pointerup", this._onMovePointerEnd);
    this._listen(this.moveStick, "pointercancel", this._onMovePointerEnd);
    this._listen(this.moveStick, "lostpointercapture", this._onMovePointerEnd);

    this._listen(this.domElement, "pointerdown", this._onLookPointerDown);
    this._listen(this.domElement, "pointermove", this._onLookPointerMove);
    this._listen(this.domElement, "pointerup", this._onLookPointerEnd);
    this._listen(this.domElement, "pointercancel", this._onLookPointerEnd);
    this._listen(this.domElement, "lostpointercapture", this._onLookPointerEnd);

    this._listen(this.runButton, "pointerdown", this._onRunPointerDown);
    this._listen(this.runButton, "pointerup", this._onRunPointerEnd);
    this._listen(this.runButton, "pointercancel", this._onRunPointerEnd);
    this._listen(this.runButton, "lostpointercapture", this._onRunPointerEnd);

    this._listen(this.touchJumpButton, "pointerdown", this._onJumpPointerDown);
    this._listen(this.touchJumpButton, "pointerup", this._onJumpPointerEnd);
    this._listen(this.touchJumpButton, "pointercancel", this._onJumpPointerEnd);
    this._listen(this.touchJumpButton, "lostpointercapture", this._onJumpPointerEnd);
  }

  start({ requestPointerLock = !this.isTouchMode } = {}) {
    if (!this.started) {
      this.started = true;
      this._attachListeners();
    }

    if (this.isTouchMode) {
      this._setActive(true);
      this._showTouchControls(true);
    } else if (requestPointerLock) {
      this.resume();
    }
    return this;
  }

  resume() {
    if (!this.started) this.start({ requestPointerLock: false });

    if (this.isTouchMode) {
      this._setActive(true);
      this._showTouchControls(true);
      return this;
    }

    if (this.isLocked) {
      this._setActive(true);
      return this;
    }

    if (typeof this.domElement.requestPointerLock !== "function") {
      this._setActive(true);
      this.onLockError?.(new Error("Pointer Lock is unavailable in this browser."));
      return this;
    }

    try {
      const maybePromise = this.domElement.requestPointerLock();
      maybePromise?.catch?.((error) => this.onLockError?.(error));
    } catch (error) {
      this.onLockError?.(error);
    }
    return this;
  }

  pause({ exitPointerLock = true } = {}) {
    this._setActive(false);
    this._resetInput();
    this._showTouchControls(false);

    if (exitPointerLock && this.isLocked) this.document?.exitPointerLock?.();
    return this;
  }

  dispose() {
    this.pause();
    for (const removeListener of this._listeners.splice(0)) removeListener();
    this.started = false;
  }

  _setActive(active) {
    const changed = this.active !== active;
    this.active = active;
    if (changed) this.onLockChange?.(active);
  }

  _showTouchControls(show) {
    if (this.touchControls && this.isTouchMode) this.touchControls.hidden = !show;
  }

  _onPointerLockChange() {
    if (this.isTouchMode) return;
    this._setActive(this.isLocked);
    if (!this.isLocked) this._resetInput();
  }

  _onPointerLockError(event) {
    this._setActive(false);
    this.onLockError?.(event);
  }

  _onBlur() {
    this._resetInput();
  }

  _onKeyDown(event) {
    const target = event.target;
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) return;
    if (event.code === "Space") {
      if (this.active) {
        event.preventDefault?.();
        if (!event.repeat) this._queueJump();
      }
      return;
    }
    this._keys.add(event.code);
  }

  _onKeyUp(event) {
    this._keys.delete(event.code);
  }

  _applyLook(deltaX, deltaY, sensitivity) {
    if (!this.active) return;
    this.yaw -= deltaX * sensitivity;
    this.pitch = clamp(
      this.pitch - deltaY * sensitivity,
      -Math.PI / 2 + 0.015,
      Math.PI / 2 - 0.015,
    );
    this._syncCamera();
  }

  _onMouseMove(event) {
    if (!this.active || !this.isLocked || this.isTouchMode) return;
    this._applyLook(event.movementX ?? 0, event.movementY ?? 0, this.mouseSensitivity);
  }

  _onMovePointerDown(event) {
    if (!this.isTouchMode || !this.active || this._movePointerId !== null) return;
    event.preventDefault();
    this._movePointerId = event.pointerId;
    this.moveStick?.setPointerCapture?.(event.pointerId);
    this._updateMoveStick(event);
  }

  _onMovePointerMove(event) {
    if (event.pointerId !== this._movePointerId) return;
    event.preventDefault();
    this._updateMoveStick(event);
  }

  _onMovePointerEnd(event) {
    if (event.pointerId !== this._movePointerId) return;
    this._movePointerId = null;
    this._touchMove.set(0, 0);
    this._resetMoveKnob();
  }

  _updateMoveStick(event) {
    const bounds = this.moveStick?.getBoundingClientRect?.();
    if (!bounds) return;

    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const maxDistance = Math.max(1, Math.min(bounds.width, bounds.height) * 0.36);
    let deltaX = event.clientX - centerX;
    let deltaY = event.clientY - centerY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > maxDistance) {
      const scale = maxDistance / distance;
      deltaX *= scale;
      deltaY *= scale;
    }

    const rawX = deltaX / maxDistance;
    const rawY = -deltaY / maxDistance;
    const magnitude = Math.hypot(rawX, rawY);
    const deadZone = 0.12;
    if (magnitude <= deadZone) {
      this._touchMove.set(0, 0);
    } else {
      const scaledMagnitude = (magnitude - deadZone) / (1 - deadZone);
      this._touchMove.set((rawX / magnitude) * scaledMagnitude, (rawY / magnitude) * scaledMagnitude);
    }

    if (this.moveKnob) {
      this.moveKnob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    }
  }

  _resetMoveKnob() {
    if (this.moveKnob) this.moveKnob.style.transform = "translate(-50%, -50%)";
  }

  _onLookPointerDown(event) {
    if (!this.isTouchMode || !this.active || this._lookPointerId !== null) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    event.preventDefault();
    this._lookPointerId = event.pointerId;
    this._lastLookX = event.clientX;
    this._lastLookY = event.clientY;
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  _onLookPointerMove(event) {
    if (event.pointerId !== this._lookPointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - this._lastLookX;
    const deltaY = event.clientY - this._lastLookY;
    this._lastLookX = event.clientX;
    this._lastLookY = event.clientY;
    this._applyLook(deltaX, deltaY, this.touchLookSensitivity);
  }

  _onLookPointerEnd(event) {
    if (event.pointerId === this._lookPointerId) this._lookPointerId = null;
  }

  _onRunPointerDown(event) {
    if (!this.isTouchMode || !this.active) return;
    event.preventDefault();
    this._touchRunning = true;
    this.runButton?.setPointerCapture?.(event.pointerId);
  }

  _onRunPointerEnd(event) {
    if (!this.isTouchMode) return;
    event.preventDefault();
    this._touchRunning = false;
  }

  _queueJump() {
    this._jumpQueuedUntil = this._simulationTime + this.jumpBufferTime;
  }

  _onJumpPointerDown(event) {
    if (!this.isTouchMode || !this.active) return;
    event.preventDefault();
    this._queueJump();
    this.touchJumpButton?.setPointerCapture?.(event.pointerId);
  }

  _onJumpPointerEnd(event) {
    if (!this.isTouchMode) return;
    event.preventDefault();
  }

  _resetInput() {
    this._keys.clear();
    this._touchMove.set(0, 0);
    this._touchRunning = false;
    this._movePointerId = null;
    this._lookPointerId = null;
    this._jumpQueuedUntil = Number.NEGATIVE_INFINITY;
    this._resetMoveKnob();
  }

  _sampleGround(x, z, feetY = this.position.y) {
    if (typeof this.groundSampler !== "function") return this.groundHeight;

    const sample = this.groundSampler(x, z, feetY);
    if (Number.isFinite(sample)) return sample;
    if (sample && Number.isFinite(sample.height) && sample.walkable !== false) return sample.height;
    return null;
  }

  _sampleCeiling(x, z, feetY = this.position.y) {
    if (typeof this.ceilingSampler !== "function") return null;

    const underside = this.ceilingSampler(x, z, feetY);
    return Number.isFinite(underside) ? underside : null;
  }

  _isPlayerOverlapping(position = this.position) {
    return this.collisionWorld.isOverlapping(
      position,
      this.radius,
      position.y,
      this.bodyHeight,
    );
  }

  _rememberSafePosition(force = false) {
    if (!this.grounded || this._isPlayerOverlapping()) return false;

    if (!this._lastSafePosition) this._lastSafePosition = this.position.clone();
    else this._lastSafePosition.copy(this.position);

    const previous = this._safePositionHistory.at(-1);
    const horizontalDistance = previous
      ? Math.hypot(this.position.x - previous.x, this.position.z - previous.z)
      : Number.POSITIVE_INFINITY;
    const verticalDistance = previous ? Math.abs(this.position.y - previous.y) : Number.POSITIVE_INFINITY;
    if (force || horizontalDistance >= 0.6 || verticalDistance >= 0.3) {
      this._safePositionHistory.push(this.position.clone());
      if (this._safePositionHistory.length > 12) this._safePositionHistory.shift();
    }
    return true;
  }

  /**
   * Explicitly attempts collision depenetration, then optionally falls back
   * to a recent grounded position. Normal wall contact never calls this
   * automatically; callers can invoke it for a genuine stuck state.
   */
  unstick({ fallback = true, reason = "manual" } = {}) {
    const before = this.position.clone();
    const wasGrounded = this.grounded;
    const wasOverlapping = this._isPlayerOverlapping();
    this.collisionWorld.depenetrate(
      this.position,
      this.radius,
      this.position.y,
      this.bodyHeight,
      8,
    );

    let overlapping = this._isPlayerOverlapping();
    let usedFallback = false;
    if (fallback && (overlapping || !wasOverlapping)) {
      const minimumDistance = wasOverlapping ? 0 : Math.max(0.5, this.radius * 1.5);
      const candidates = [
        this._lastSafePosition,
        ...this._safePositionHistory.slice().reverse(),
      ].filter(Boolean);
      for (const candidate of candidates) {
        const candidateDistance = Math.hypot(candidate.x - before.x, candidate.z - before.z);
        if (candidateDistance < minimumDistance) continue;
        if (this._isPlayerOverlapping(candidate)) continue;
        this.position.copy(candidate);
        overlapping = false;
        usedFallback = true;
        break;
      }
    }

    const groundY = this._sampleGround(this.position.x, this.position.z, this.position.y);
    if (
      groundY !== null
      && (wasGrounded || Math.abs(this.position.y - groundY) <= this.groundSnapDistance)
    ) {
      this.position.y = groundY;
      this.grounded = true;
      this._lastGroundedTime = this._simulationTime;
    } else {
      this.grounded = false;
    }

    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this._jumpQueuedUntil = Number.NEGATIVE_INFINITY;

    const moved = before.distanceToSquared(this.position) > EPSILON * EPSILON;
    const recovered = (wasOverlapping && !overlapping) || (!wasOverlapping && moved);
    if (recovered) {
      this._rememberSafePosition(usedFallback);
      this.onStuckRecovered?.({
        reason,
        usedFallback,
        position: this.position.clone(),
      });
    }
    this._syncCamera();
    return recovered;
  }

  setGroundSampler(sampler) {
    if (sampler !== null && typeof sampler !== "function") {
      throw new TypeError("Ground sampler must be a function or null.");
    }
    this.groundSampler = sampler;
    return this;
  }

  setCeilingSampler(sampler) {
    if (sampler !== null && typeof sampler !== "function") {
      throw new TypeError("Ceiling sampler must be a function or null.");
    }
    this.ceilingSampler = sampler;
    return this;
  }

  setPosition(position, { resetVelocity = true, depenetrate = true } = {}) {
    this.position.copy(vectorFrom(position, this.position));
    if (resetVelocity) {
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
    }
    if (depenetrate) {
      this.collisionWorld.depenetrate(this.position, this.radius, this.position.y, this.bodyHeight);
    }
    this._jumpQueuedUntil = Number.NEGATIVE_INFINITY;
    if (resetVelocity) {
      const groundY = this._sampleGround(this.position.x, this.position.z, this.position.y);
      if (groundY !== null && Math.abs(this.position.y - groundY) <= this.groundSnapDistance) {
        this.position.y = groundY;
        this.grounded = true;
        this._lastGroundedTime = this._simulationTime;
      } else {
        this.grounded = false;
      }
    }
    if (this.grounded && !this._isPlayerOverlapping()) {
      this._safePositionHistory.length = 0;
      this._rememberSafePosition(true);
    }
    this._syncCamera();
    return this;
  }

  setLook(yaw, pitch = this.pitch) {
    if (Number.isFinite(yaw)) this.yaw = yaw;
    if (Number.isFinite(pitch)) {
      this.pitch = clamp(pitch, -Math.PI / 2 + 0.015, Math.PI / 2 - 0.015);
    }
    this._syncCamera();
    return this;
  }

  getPosition(target = new THREE.Vector3()) {
    return target.copy(this.position);
  }

  getState() {
    return {
      position: this.position,
      velocity: this.velocity,
      verticalVelocity: this.verticalVelocity,
      yaw: this.yaw,
      pitch: this.pitch,
      grounded: this.grounded,
      active: this.active,
      running: this.isRunning,
      touchMode: this.isTouchMode,
    };
  }

  _movementInput() {
    let strafe = this._touchMove.x;
    let forward = this._touchMove.y;
    if (this._keys.has("KeyA")) strafe -= 1;
    if (this._keys.has("KeyD")) strafe += 1;
    if (this._keys.has("KeyS")) forward -= 1;
    if (this._keys.has("KeyW")) forward += 1;

    const length = Math.hypot(strafe, forward);
    if (length > 1) {
      strafe /= length;
      forward /= length;
    }
    return { strafe, forward, magnitude: Math.min(1, length) };
  }

  _step(deltaSeconds) {
    this._simulationTime += deltaSeconds;
    if (this.grounded) this._lastGroundedTime = this._simulationTime;

    const queuedJump = this._jumpQueuedUntil >= this._simulationTime;
    const canUseCoyoteTime = this._simulationTime - this._lastGroundedTime <= this.coyoteTime;
    if (this.active && queuedJump && (this.grounded || canUseCoyoteTime)) {
      this.verticalVelocity = this.jumpSpeed;
      this.grounded = false;
      this._jumpQueuedUntil = Number.NEGATIVE_INFINITY;
    } else if (this._jumpQueuedUntil < this._simulationTime) {
      this._jumpQueuedUntil = Number.NEGATIVE_INFINITY;
    }

    const input = this.active ? this._movementInput() : { strafe: 0, forward: 0, magnitude: 0 };
    const speed = this.isRunning ? this.runSpeed : this.walkSpeed;
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    // Rotate local input `(strafe, 0, -forward)` by the camera's Y-axis yaw.
    const targetX = (input.strafe * cosYaw - input.forward * sinYaw) * speed;
    const targetZ = (-input.strafe * sinYaw - input.forward * cosYaw) * speed;
    const rate = input.magnitude > 0 ? this.acceleration : this.deceleration;

    this.velocity.x = moveToward(this.velocity.x, targetX, rate * deltaSeconds);
    this.velocity.z = moveToward(this.velocity.z, targetZ, rate * deltaSeconds);

    const oldX = this.position.x;
    const oldZ = this.position.z;
    const oldY = this.position.y;
    const collision = this.collisionWorld.moveCircle(
      this.position,
      this.velocity.x * deltaSeconds,
      this.velocity.z * deltaSeconds,
      this.radius,
      this.position.y,
      this.bodyHeight,
    );
    if (collision.collidedX) this.velocity.x = 0;
    if (collision.collidedZ) this.velocity.z = 0;

    const sampledGround = this._sampleGround(this.position.x, this.position.z, oldY);
    if (sampledGround !== null && this.grounded && sampledGround > oldY + this.maxStepHeight) {
      this.position.x = oldX;
      this.position.z = oldZ;
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    const verticalStartY = this.position.y;
    const startedMovingUpward = this.verticalVelocity > 0;
    const groundY = this._sampleGround(this.position.x, this.position.z, this.position.y);
    if (groundY !== null) {
      const groundDelta = groundY - this.position.y;
      if (this.grounded && groundDelta >= -this.groundSnapDistance && groundDelta <= this.maxStepHeight) {
        this.position.y = groundY;
        this.verticalVelocity = 0;
        this.grounded = true;
      } else {
        this.verticalVelocity -= this.gravity * deltaSeconds;
        this.position.y += this.verticalVelocity * deltaSeconds;
        if (this.position.y <= groundY) {
          this.position.y = groundY;
          this.verticalVelocity = 0;
          this.grounded = true;
        } else {
          this.grounded = false;
        }
      }
    } else {
      this.verticalVelocity -= this.gravity * deltaSeconds;
      this.position.y += this.verticalVelocity * deltaSeconds;
      this.grounded = false;
    }

    if (startedMovingUpward && this.position.y > verticalStartY) {
      const ceilingUnderside = this._sampleCeiling(
        this.position.x,
        this.position.z,
        verticalStartY,
      );
      const maximumFeetY = ceilingUnderside === null
        ? Number.POSITIVE_INFINITY
        : ceilingUnderside - this.bodyHeight;
      if (this.position.y > maximumFeetY) {
        this.position.y = maximumFeetY;
        this.verticalVelocity = 0;
        this.grounded = false;
      }
    }

    if (this.grounded) this._lastGroundedTime = this._simulationTime;
    // A blocked movement direction is ordinary wall contact, not evidence
    // that the player should be moved to a stored position. Recovery remains
    // explicit through `unstick()`.
    if (this.grounded && !this._isPlayerOverlapping()) {
      this._rememberSafePosition();
    }
  }

  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      this._syncCamera();
      return this.getState();
    }

    // Fixed-size substeps keep collision and ramp following stable after a slow frame.
    let remaining = Math.min(deltaSeconds, 0.1);
    const maxStep = 1 / 60;
    while (remaining > EPSILON) {
      const step = Math.min(maxStep, remaining);
      this._step(step);
      remaining -= step;
    }

    this._syncCamera();
    return this.getState();
  }

  _syncCamera() {
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.up.copy(DEFAULT_UP);
    this.camera.updateMatrixWorld();
  }
}
