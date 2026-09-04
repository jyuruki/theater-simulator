import * as THREE from "three";
import { planToWorldX } from "./coordinates.js";

export function createEntranceDoors({ root, materials, entrance }) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const leaves = [];
  const colliders = [];
  const width = (entrance.doorWidth - 0.18) / 2;
  const parts = 8;
  const closedHeight = entrance.doorHeight - 0.12;
  for (const door of entrance.doors)
    for (const [side, direction] of [
      ["left", -1],
      ["right", 1],
    ]) {
      const planHinge =
        door.center + direction * (entrance.doorWidth / 2 - 0.06);
      // Plan X is reflected: a lower-plan-X hinge has a negative local-X leaf.
      const group = new THREE.Group();
      group.name = `lobby-front-${door.id}-${side}-hinge`;
      group.position.set(planToWorldX(planHinge), 0, entrance.facadeZ);
      root.add(group);
      const piece = (name, x, y, z, w, h, d, material) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `lobby-front-${door.id}-${name}-${side}`;
        mesh.position.set(x, y, z);
        mesh.scale.set(w, h, d);
        group.add(mesh);
        return mesh;
      };
      piece(
        "leaf",
        (direction * width) / 2,
        entrance.doorHeight / 2,
        0,
        width,
        closedHeight,
        0.045,
        materials.glass,
      );
      for (const x of [direction * 0.023, direction * (width - 0.023)]) {
        piece(
          `stile-${x.toFixed(2)}`,
          x,
          entrance.doorHeight / 2,
          0,
          0.046,
          closedHeight,
          0.06,
          materials.black,
        );
      }
      for (const y of [0.085, entrance.doorHeight - 0.085]) {
        piece(
          `rail-${y}`,
          (direction * width) / 2,
          y,
          0,
          width - 0.09,
          0.05,
          0.06,
          materials.black,
        );
      }
      for (const z of [-0.065, 0.065]) {
        piece(
          `push-bar-${z}`,
          (direction * width) / 2,
          1.02,
          z,
          width * 0.72,
          0.035,
          0.035,
          materials.stainless,
        );
      }
      const boxes = Array.from({ length: parts }, (_, index) => ({
        id: `${group.name}-collision-${index}`,
        minX: 0,
        maxX: 1,
        minY: 0.06,
        maxY: entrance.doorHeight - 0.06,
        minZ: 0,
        maxZ: 1,
        enabled: true,
      }));
      colliders.push(...boxes);
      leaves.push({
        group,
        boxes,
        direction,
        centerX: planToWorldX(door.center),
        angle: 0,
      });
    }

  function update(delta, player = null) {
    for (const leaf of leaves) {
      const near =
        player &&
        player.y < entrance.doorHeight &&
        Math.abs(player.z - entrance.facadeZ) < 4.4 &&
        Math.abs(player.x - leaf.centerX) < entrance.doorWidth / 2 + 0.85;
      const target = near ? 1.42 : 0;
      const change = Math.min(Math.max(delta, 0), 0.1) * 2.4;
      leaf.angle += THREE.MathUtils.clamp(target - leaf.angle, -change, change);
      // Open toward the front walk: the kiosk bank is immediately inside.
      const angle = leaf.direction * leaf.angle;
      leaf.group.rotation.y = angle;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      const halfX = (Math.abs(cos) * width) / parts / 2 + Math.abs(sin) * 0.03;
      const halfZ = (Math.abs(sin) * width) / parts / 2 + Math.abs(cos) * 0.03;
      leaf.boxes.forEach((box, index) => {
        const localX = (leaf.direction * width * (index + 0.5)) / parts;
        const x = leaf.group.position.x + localX * cos;
        const z = entrance.facadeZ - localX * sin;
        Object.assign(box, {
          minX: x - halfX,
          maxX: x + halfX,
          minZ: z - halfZ,
          maxZ: z + halfZ,
        });
      });
    }
  }
  update(0);
  return { colliders, leaves, update, dispose: () => geometry.dispose() };
}
