import * as THREE from "three";

/** A quick look at the usher's wrist, without stopping the shift. */
export function createUsherWatch({ scene, camera, schedule }) {
  const root = new THREE.Group(); root.name = "usher-wristwatch"; root.visible = false; scene.add(root);
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(512, 256)
    : Object.assign(document.createElement("canvas"), { width: 512, height: 256 });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const ctx = canvas.getContext("2d"), resources = [];
  function part(w, h, z, color, map) {
    const geometry = new THREE.PlaneGeometry(w, h), material = new THREE.MeshBasicMaterial({ color,
      ...(map ? { map } : {}), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material); mesh.position.z = z; mesh.renderOrder = 1100 + resources.length;
    resources.push(geometry, material); root.add(mesh); return mesh;
  }
  part(.41, .125, 0, 0xb98a6c); part(.16, .19, .001, 0x24282a);
  part(.23, .135, .002, 0x778185); part(.202, .108, .003, 0xffffff, texture);
  let last = "", remaining = 0;
  return {
    root,
    get visible() { return root.visible; },
    toggle() { root.visible = !root.visible; remaining = 5; return root.visible; },
    hide() { root.visible = false; },
    update(delta = 0) {
      if (!root.visible) return;
      remaining -= delta; if (remaining <= 0) { root.visible = false; return; }
      if (last !== schedule.time) {
        last = schedule.time; ctx.fillStyle = "#c0cdb8"; ctx.fillRect(0, 0, 512, 256);
        ctx.fillStyle = "#263228"; ctx.textAlign = "center";
        ctx.font = "bold 122px monospace"; ctx.fillText(last, 256, 154);
        ctx.font = "25px Arial"; ctx.fillText("MILILANI 14 · SHIFT TIME", 256, 210); texture.needsUpdate = true;
      }
      camera.updateMatrixWorld(); root.position.copy(new THREE.Vector3(0, -.19, -.55).applyMatrix4(camera.matrixWorld));
      root.quaternion.copy(camera.quaternion);
    },
    dispose() { root.removeFromParent(); resources.forEach(r => r.dispose()); texture.dispose(); },
  };
}
