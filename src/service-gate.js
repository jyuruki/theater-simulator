import * as THREE from "three";
import { planToWorldX } from "./coordinates.js";

/** Waist-height double-action service gate; both leaves swing away on approach. */
export function createServiceGate({ root, materials, plan }) {
  const group = new THREE.Group();
  group.name = plan.id;
  group.position.set(planToWorldX(plan.wall.x), 0, plan.wall.z);
  const end = new THREE.Vector3(planToWorldX(plan.counter.x), 0, plan.counter.z);
  const direction = end.clone().sub(group.position);
  const width = direction.length();
  group.rotation.y = Math.atan2(-direction.z, direction.x);
  root.add(group);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const leafWidth = (width - .15) / 2;
  const leaves = [];
  const colliders = [];
  const posts = [];
  const height = plan.height;
  const piece = (parent, name, position, size, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${plan.id}-${name}`;
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  for (const [index, x, sign] of [[0, .055, 1], [1, width - .055, -1]]) {
    piece(group, `anchored-post-${index}`, [x, height / 2, 0], [.055, height, .08], materials.stainless);
    piece(group, `post-foot-${index}`, [x, .018, 0], [.085, .036, .1], materials.stainless);
    const postBox = { id: `${plan.id}-post-${index}`, enabled: true, minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: height };
    posts.push({ x, box: postBox });
    colliders.push(postBox);
    const hinge = new THREE.Group();
    hinge.name = `${plan.id}-hinge-${index}`;
    hinge.position.x = x;
    group.add(hinge);
    piece(hinge, `panel-${index}`, [sign * leafWidth / 2, (height + .12) / 2, 0], [leafWidth, height - .12, .045], materials.counterWhite ?? materials.wall);
    for (const y of [.16, height - .04]) piece(hinge, `edge-${index}-${y}`, [sign * leafWidth / 2, y, 0], [leafWidth, .06, .052], materials.stainless);
    for (const z of [-.037, .037]) piece(hinge, `pushplate-${index}-${z}`, [sign * leafWidth * .72, .87, z], [.17, .24, .021], materials.stainless);
    for (const y of [.24, 1.04]) piece(group, `hinge-barrel-${index}-${y}`, [x, y, 0], [.038, .13, .09], materials.stainless);
    const boxes = Array.from({ length: 6 }, (_, part) => ({ id: `${plan.id}-leaf-${index}-${part}`, enabled: true,
      minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: .12, maxY: height }));
    colliders.push(...boxes);
    leaves.push({ hinge, sign, boxes, angle: 0 });
  }
  let swingDirection = 1;
  let holdOpen = 0;
  let disposed = false;
  const localPlayer = new THREE.Vector3();
  function update(delta, player) {
    if (disposed) return;
    group.updateMatrixWorld(true);
    for (const { x, box } of posts) {
      const center = group.localToWorld(new THREE.Vector3(x, 0, 0));
      const halfX = Math.abs(Math.cos(group.rotation.y)) * .0425 + Math.abs(Math.sin(group.rotation.y)) * .05;
      const halfZ = Math.abs(Math.sin(group.rotation.y)) * .0425 + Math.abs(Math.cos(group.rotation.y)) * .05;
      Object.assign(box, { minX: center.x - halfX, maxX: center.x + halfX, minZ: center.z - halfZ, maxZ: center.z + halfZ });
    }
    if (player) localPlayer.copy(player).applyMatrix4(group.matrixWorld.clone().invert());
    const near = player && player.y < height + .3 && localPlayer.x > -.45 && localPlayer.x < width + .45 && Math.abs(localPlayer.z) < 1.65;
    if (near) {
      if (holdOpen === 0 && Math.abs(leaves[0].angle) < .12) swingDirection = localPlayer.z >= 0 ? 1 : -1;
      holdOpen = .7;
    } else holdOpen = Math.max(0, holdOpen - Math.max(0, delta));
    const target = holdOpen > 0 ? swingDirection * Math.PI / 2 : 0;
    for (const leaf of leaves) {
      leaf.angle += THREE.MathUtils.clamp(target - leaf.angle, -Math.min(.1, Math.max(0, delta)) * 3.4, Math.min(.1, Math.max(0, delta)) * 3.4);
      leaf.hinge.rotation.y = leaf.sign * leaf.angle;
      leaf.hinge.updateWorldMatrix(true, false);
      leaf.boxes.forEach((box, index) => {
        const center = new THREE.Vector3(leaf.sign * leafWidth * (index + .5) / leaf.boxes.length, .6, 0).applyMatrix4(leaf.hinge.matrixWorld);
        const quaternion = leaf.hinge.getWorldQuaternion(new THREE.Quaternion());
        const along = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
        const cross = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
        const halfX = Math.abs(along.x) * leafWidth / leaf.boxes.length / 2 + Math.abs(cross.x) * .029;
        const halfZ = Math.abs(along.z) * leafWidth / leaf.boxes.length / 2 + Math.abs(cross.z) * .029;
        Object.assign(box, { minX: center.x - halfX, maxX: center.x + halfX, minZ: center.z - halfZ, maxZ: center.z + halfZ });
      });
    }
  }
  update(0, null);
  return { group, leaves, colliders, width, update,
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); group.removeFromParent(); } };
}
