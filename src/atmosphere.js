import * as THREE from "three";
import { planToWorldX } from "./coordinates.js";

export const VISITOR_ROUTES = Object.freeze([
  [
    [2, 3],
    [8, 3],
    [8, 16],
    [3, 16],
  ],
  [
    [1.5, 26],
    [9, 28],
    [9, 49],
    [2, 49],
  ],
  [
    [-5, 3],
    [-5, 7],
    [0, 11],
    [0, 3],
  ],
]);
export const STAFF_POSITIONS = Object.freeze([
  [-11.1, 13.5],
  [12, 8.7],
  [5.8, 55.1],
]);

export function createTheaterCrowd({ scene, collisionWorld, world }) {
  const root = new THREE.Group();
  root.name = "V18 staff and visitors";
  scene.add(root);
  const geometries = [
    new THREE.SphereGeometry(1, 12, 10),
    new THREE.CylinderGeometry(1, 1, 1, 10),
    new THREE.BoxGeometry(1, 1, 1),
  ];
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
      );
    return materials.get(color);
  };
  const actors = [];
  let enabled = true;
  const collisionAt = (x, z, radius = 0.3) =>
    collisionWorld.isOverlapping(
      { x: planToWorldX(x), y: 0, z },
      radius,
      0,
      1.76,
    );
  VISITOR_ROUTES.forEach((route, index) =>
    route.forEach(([x, z], segment) => {
      const end = route[(segment + 1) % route.length],
        distance = Math.hypot(end[0] - x, end[1] - z);
      for (let d = 0; d <= distance; d += 0.12) {
        const px = x + ((end[0] - x) * d) / distance,
          pz = z + ((end[1] - z) * d) / distance;
        if (
          collisionAt(px, pz) ||
          Math.abs(world.groundHeight(planToWorldX(px), pz, 0)) > 0.05
        ) {
          throw new Error(
            `Visitor ${index + 1} route meets occupied space near ${px.toFixed(2)}, ${pz.toFixed(2)}.`,
          );
        }
      }
    }),
  );
  STAFF_POSITIONS.forEach(([x, z], index) => {
    if (collisionAt(x, z, 0.25))
      throw new Error(`Staff ${index + 1} position intersects a fixture.`);
  });

  function person(index, points, staff) {
    const group = new THREE.Group();
    group.name = `${staff ? "staff" : "visitor"}-${index + 1}`;
    const skin = [0xc59172, 0x84563c, 0xb98161, 0xd2aa87, 0x9c6c50, 0xbc865e][
      index
    ];
    const shirt = staff ? 0x234d65 : [0x8d6158, 0x65746a, 0xc4b38d][index];
    const mesh = (geometry, color, x, y, z, sx, sy, sz, parent = group) => {
      const part = new THREE.Mesh(geometries[geometry], material(color));
      part.position.set(x, y, z);
      part.scale.set(sx, sy, sz);
      parent.add(part);
      return part;
    };
    const limbs = [];
    mesh(0, shirt, 0, 1.13, 0, 0.195, 0.34, 0.115);
    mesh(1, skin, 0, 1.455, 0, 0.048, 0.085, 0.048);
    mesh(0, skin, 0, 1.61, 0, 0.115, 0.145, 0.105);
    mesh(0, 0x2d2520, 0, 1.688, -0.017, 0.116, 0.077, 0.104);
    mesh(0, skin, 0, 1.598, 0.104, 0.025, 0.027, 0.034);
    for (const side of [-1, 1]) {
      mesh(0, 0x25221f, side * 0.041, 1.637, 0.096, 0.01, 0.009, 0.006);
      const arm = new THREE.Group();
      arm.position.set(side * 0.198, 1.35, 0);
      group.add(arm);
      mesh(1, shirt, 0, -0.105, 0, 0.058, 0.24, 0.058, arm);
      mesh(1, skin, 0, -0.295, 0, 0.038, 0.18, 0.038, arm);
      mesh(0, skin, 0, -0.4, 0, 0.041, 0.061, 0.033, arm);
      const leg = new THREE.Group();
      leg.position.set(side * 0.094, 0.83, 0);
      group.add(leg);
      mesh(1, 0x30343a, 0, -0.34, 0, 0.078, 0.69, 0.069, leg);
      mesh(0, 0x212529, 0, -0.75, 0.042, 0.085, 0.079, 0.139, leg);
      limbs.push({ arm, leg, side });
    }
    if (staff) {
      mesh(2, 0xf0efdc, -0.07, 1.28, 0.111, 0.072, 0.033, 0.012);
      mesh(1, 0x1f3b4e, 0, 1.728, 0, 0.121, 0.042, 0.115);
    }
    const route = points.map(
      ([x, z]) => new THREE.Vector3(planToWorldX(x), 0, z),
    );
    group.position.copy(route[0]);
    root.add(group);
    const box = collisionWorld.addBox({
      id: `${group.name}-personal-space`,
      minX: group.position.x - 0.21,
      maxX: group.position.x + 0.21,
      minY: 0,
      maxY: 1.78,
      minZ: group.position.z - 0.21,
      maxZ: group.position.z + 0.21,
    });
    actors.push({
      group,
      route,
      target: 1,
      box,
      limbs,
      staff,
      phase: index * 1.7,
      speed: 0.62 + index * 0.055,
      distance: 0,
    });
  }
  VISITOR_ROUTES.forEach((route, index) => person(index, route, false));
  STAFF_POSITIONS.forEach((point, index) => person(index + 3, [point], true));

  return {
    actors,
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = Boolean(value);
      root.visible = enabled;
      actors.forEach((actor) => {
        actor.box.enabled = enabled;
      });
    },
    update(delta, player, active = true) {
      if (!enabled || !active) return;
      const dt = Math.min(delta, 0.1);
      for (const actor of actors) {
        actor.phase += dt;
        const position = actor.group.position;
        const nearbyPlayer =
          Math.hypot(position.x - player.x, position.z - player.z) < 1.25 &&
          player.y < 2;
        let moving = false;
        if (!actor.staff && !nearbyPlayer) {
          const target = actor.route[actor.target],
            dx = target.x - position.x,
            dz = target.z - position.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.02)
            actor.target = (actor.target + 1) % actor.route.length;
          else {
            const step = Math.min(distance, actor.speed * dt);
            const nextX = position.x + (dx / distance) * step,
              nextZ = position.z + (dz / distance) * step;
            const crowded = actors.some(
              (other) =>
                other !== actor &&
                Math.hypot(
                  nextX - other.group.position.x,
                  nextZ - other.group.position.z,
                ) < 0.68,
            );
            if (!crowded) {
              position.x = nextX;
              position.z = nextZ;
              actor.group.rotation.y = Math.atan2(dx, dz);
              actor.distance += step;
              moving = true;
            }
          }
        } else if (
          actor.staff &&
          Math.hypot(player.x - position.x, player.z - position.z) < 3.5
        ) {
          actor.group.rotation.y = Math.atan2(
            player.x - position.x,
            player.z - position.z,
          );
        }
        actor.limbs.forEach(({ arm, leg, side }) => {
          const swing = moving ? Math.sin(actor.distance * 9) * 0.3 * side : 0;
          leg.rotation.x = swing;
          arm.rotation.x = -swing + Math.sin(actor.phase) * 0.025;
        });
        Object.assign(actor.box, {
          minX: position.x - 0.21,
          maxX: position.x + 0.21,
          minZ: position.z - 0.21,
          maxZ: position.z + 0.21,
        });
      }
    },
    dispose() {
      actors.forEach((actor) => collisionWorld.remove(actor.box));
      root.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

/** All audio is synthesized locally, starts on a gesture, and can be muted. */
export function createTheaterAudio() {
  let context, master, ambience, noiseBuffer;
  let enabled = true,
    volume = 0.25,
    walked = 0,
    lastPosition = null;
  const sources = [];
  function start() {
    if (!enabled) return;
    if (!context) {
      const AudioContext =
        globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AudioContext) return;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
      ambience = context.createGain();
      ambience.gain.value = 0.032;
      ambience.connect(master);
      noiseBuffer = context.createBuffer(
        1,
        context.sampleRate * 2,
        context.sampleRate,
      );
      const samples = noiseBuffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < samples.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.02;
        samples[i] = brown * 3;
      }
      const ventilation = context.createBufferSource();
      ventilation.buffer = noiseBuffer;
      ventilation.loop = true;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 280;
      ventilation.connect(lowpass);
      lowpass.connect(ambience);
      ventilation.start();
      sources.push(ventilation);
      for (const frequency of [58, 97]) {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.018;
        oscillator.connect(gain);
        gain.connect(ambience);
        oscillator.start();
        sources.push(oscillator);
      }
    }
    context.resume().catch(() => {});
  }
  function tone(frequency, offset, duration, gainValue) {
    if (!context || !enabled) return;
    const oscillator = context.createOscillator(),
      gain = context.createGain(),
      time = context.currentTime + offset;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  function noise(duration, frequency, gainValue) {
    if (!context || !enabled) return;
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + duration,
    );
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(0, Math.random());
    source.stop(context.currentTime + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  return {
    start,
    get enabled() {
      return enabled;
    },
    get volume() {
      return volume;
    },
    setEnabled(value) {
      enabled = Boolean(value);
      if (enabled) start();
      if (master)
        master.gain.setTargetAtTime(
          enabled ? volume : 0,
          context.currentTime,
          0.04,
        );
    },
    setVolume(value) {
      volume = THREE.MathUtils.clamp(value, 0, 1);
      if (master)
        master.gain.setTargetAtTime(
          enabled ? volume : 0,
          context.currentTime,
          0.04,
        );
    },
    play(kind) {
      if (kind === "pour") noise(0.85, 1600, 0.45);
      else
        [660, 880, kind === "pickup" ? 1175 : 990].forEach((f, i) =>
          tone(f, i * 0.075, 0.16, 0.065),
        );
    },
    update(position, zone, active, grounded) {
      if (context) {
        const audible = active && !document.hidden && enabled;
        master.gain.setTargetAtTime(
          audible ? volume : 0,
          context.currentTime,
          0.15,
        );
        ambience.gain.setTargetAtTime(
          zone.startsWith("theater-") ? 0.012 : 0.045,
          context.currentTime,
          0.8,
        );
      }
      if (lastPosition && active && grounded) {
        const distance = Math.hypot(
          position.x - lastPosition.x,
          position.z - lastPosition.z,
        );
        if (distance < 1.5) walked += distance;
        if (walked > 0.78) {
          walked = 0;
          const carpet = /theater|hall|ticket|alcove/.test(zone);
          noise(carpet ? 0.08 : 0.12, carpet ? 450 : 1700, carpet ? 0.2 : 0.42);
          tone(carpet ? 78 : 115, 0, 0.08, carpet ? 0.02 : 0.04);
        }
      }
      lastPosition = { x: position.x, z: position.z };
    },
    dispose() {
      sources.forEach((source) => source.stop());
      context?.close();
    },
  };
}
