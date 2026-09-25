import * as THREE from "three";

/** The employee's pocket sheet: physical paper, no job-selection overlay. */
export function createUsherBreaksheet({ scene, camera, schedule }) {
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(800, 1600)
    : Object.assign(document.createElement("canvas"), { width: 800, height: 1600 });
  const ctx = canvas.getContext("2d"), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Transparent queue runs after every opaque world sign. renderOrder alone
  // cannot move an opaque handheld into that later queue.
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(.40, .80), paper = new THREE.Mesh(geometry, material);
  paper.name = "handheld-usher-break-sheet"; paper.renderOrder = 1000; paper.visible = false; scene.add(paper);
  let signature = "", visible = false;
  function draw() {
    const rows = schedule.sheetRows(); const key = `${rows[0]?.id}/${schedule.time}`;
    if (key === signature) return; signature = key;
    ctx.fillStyle = "#fffefa"; ctx.fillRect(0, 0, 800, 1600);
    ctx.fillStyle = "#171717"; ctx.textAlign = "left";
    ctx.font = "22px Arial"; ctx.fillText(`MILILANI 14     ${schedule.time}`, 47, 64);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 4; ctx.strokeRect(42, 94, 716, 1320);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], y = 94 + i * 55;
      if (i) { ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(758, y); ctx.stroke(); }
      ctx.font = `${row.bold ? "bold " : ""}27px Arial`;
      ctx.fillText(String(row.number), 67, y + 37);
      ctx.fillText(row.title, 143, y + 37, 456);
      ctx.fillText(row.textTime, 642, y + 37);
    }
    ctx.font = "bold 23px Arial"; ctx.fillText("BOLD = START / CLOSE DOORS", 48, 1462);
    ctx.font = "23px Arial"; ctx.fillText("Regular = break / clean theater", 48, 1504);
    ctx.font = "20px Arial"; ctx.fillText("B: fold sheet    1: broom    2: cloth", 48, 1556);
    texture.needsUpdate = true;
  }
  return {
    root: paper,
    get visible() { return visible; },
    toggle() { visible = !visible; paper.visible = visible; if (visible) draw(); return visible; },
    hide() { visible = false; paper.visible = false; },
    update() {
      if (!visible) return;
      draw(); camera.updateMatrixWorld();
      paper.position.copy(new THREE.Vector3(0, -.015, -.72).applyMatrix4(camera.matrixWorld));
      paper.quaternion.copy(camera.quaternion);
    },
    dispose() { paper.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
