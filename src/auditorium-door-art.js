import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Each moving leaf is three material batches, despite the closer, window and
// handles. Detail should not multiply the draw calls of all fourteen entrances.
export function createAuditoriumDoorArt() {
  const materials = {
    burgundy: new THREE.MeshStandardMaterial({ color: 0x642836, roughness: .69 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xaeb1ad, metalness: .72, roughness: .32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: .26, metalness: .18 }),
  };
  const geometries = [];
  function build(parent, { width, height, direction, small }) {
    const parts = { burgundy: [], metal: [], dark: [] };
    function box(material, x, y, z, sx, sy, sz, rz = 0) {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.rotateZ(rz); g.translate(x, y, z); parts[material].push(g);
    }
    const center = direction * width / 2;
    const windowSize = Math.min(small ? .33 : .285, width * .34);
    const wy = height * .66, bottom = .05, top = height - .05;
    const below = wy - windowSize / 2, above = wy + windowSize / 2;
    box("burgundy", center, (bottom + below) / 2, 0, width, below - bottom, .056);
    box("burgundy", center, (above + top) / 2, 0, width, top - above, .056);
    for (const side of [-1, 1]) {
      const edgeWidth = (width - windowSize) / 2;
      box("burgundy", center + side * (windowSize + edgeWidth) / 2, wy, 0, edgeWidth, windowSize, .056);
      // The dark window is inset into an actual opening in the leaf.
      box("dark", center, wy, side * .014, windowSize, windowSize, .014);
      for (const edge of [-1, 1]) {
        box("metal", center + edge * (windowSize / 2 + .012), wy, side * .036, .024, windowSize + .048, .018);
        box("metal", center, wy + edge * (windowSize / 2 + .012), side * .036, windowSize, .024, .018);
      }
      box("metal", center, .205, side * .034, width - .018, .30, .012);
    }
    if (small) {
      const latch = direction * (width - .105);
      for (const side of [-1, 1]) box("metal", latch, 1.06, side * .034, .102, .41, .014);
      box("metal", direction * .21, height - .155, .065, .30, .083, .073);
      box("metal", direction * .25, height - .076, .095, .032, .055, .20);
      box("metal", direction * .39, height - .046, .17, .30, .024, .025);
    } else {
      // Bent stainless pull handles match the broad auditorium pairs: short
      // mounting ends, angled shoulders and a vertical grip by the center seam.
      const latch = direction * (width - .105);
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          box("metal", latch, 1.08 + end * .22, side * .062, .037, .06, .08);
          box("metal", latch - direction * .035, 1.08 + end * .16, side * .10, .04, .135, .04, direction * end * .48);
        }
        box("metal", latch - direction * .066, 1.08, side * .10, .043, .235, .043);
      }
    }
    for (const [material, group] of Object.entries(parts)) {
      const geometry = mergeGeometries(group); group.forEach(g => g.dispose()); geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, materials[material]);
      mesh.name = `${parent.name}-${material}-details`; parent.add(mesh);
    }
    parent.userData.doorArt = { style: small ? "single-pushplate" : "double-pull", windowSize, windowHeight: wy, finish: "burgundy", kickplate: true, closer: small };
  }
  return { build, dispose() { geometries.forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); } };
}
