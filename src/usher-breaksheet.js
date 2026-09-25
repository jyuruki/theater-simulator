import * as THREE from "three";

/** The employee's pocket sheet: physical paper, no job-selection overlay. */
export function createUsherBreaksheet({ scene, camera, schedule }) {
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(800, 1600)
    : Object.assign(document.createElement("canvas"), { width: 800, height: 1600 });
  const ctx = canvas.getContext("2d");
  let texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Transparent queue runs after every opaque world sign. renderOrder alone
  // cannot move an opaque handheld into that later queue.
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(.40, .80), paper = new THREE.Mesh(geometry, material);
  paper.name = "handheld-usher-break-sheet"; paper.renderOrder = 1000; paper.visible = false; scene.add(paper);
  const position = new THREE.Vector3();
  let signature = "", visible = false, page = schedule.sheetPage ?? 0, rowsPerPage = 24;
  const pageCount = () => Math.ceil((schedule.events?.length ?? 24) / rowsPerPage);
  function fitPage() {
    const count = (globalThis.window?.innerHeight ?? 800) < 600 ? 8 : 24;
    if (count !== rowsPerPage) { page = Math.floor(page * rowsPerPage / count); rowsPerPage = count; signature = ""; }
    const height = count === 8 ? 720 : 1600;
    if (canvas.height !== height) {
      // WebGL's allocated texture storage keeps its original dimensions.
      // Re-uploading a resized canvas into that texture can leave old rows
      // visible, so orientation changes need a fresh GPU allocation.
      texture.dispose();
      canvas.height = height;
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
    }
  }
  function draw() {
    fitPage();
    const rows = schedule.sheetRows(page, rowsPerPage); const key = `${rows[0]?.id}/${page}/${rowsPerPage}`;
    if (key === signature) return; signature = key;
    ctx.fillStyle = "#fffefa"; ctx.fillRect(0, 0, 800, canvas.height);
    ctx.fillStyle = "#171717"; ctx.textAlign = "left";
    ctx.font = "bold 27px Arial"; ctx.fillText("MILILANI 14 · DAILY BREAK SHEET", 47, 64);
    const tableBottom = 94 + rowsPerPage * 55;
    ctx.strokeStyle = "#111"; ctx.lineWidth = 4; ctx.strokeRect(42, 94, 716, rowsPerPage * 55);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], y = 94 + i * 55;
      if (i) { ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(758, y); ctx.stroke(); }
      // Reference: time first, with starts flush left and breaks indented.
      // Starts keep the entire row bold; theater/title columns stay aligned.
      ctx.font = `${row.bold ? "bold " : ""}29px Arial`;
      ctx.fillText(row.textTime, row.bold ? 52 : 151, y + 37, row.bold ? 198 : 188);
      ctx.fillText(String(row.number), 358, y + 37);
      ctx.fillText(row.title.toUpperCase(), 416, y + 37, 326);
    }
    for (const x of [345, 404]) { ctx.beginPath(); ctx.moveTo(x, 94); ctx.lineTo(x, tableBottom); ctx.stroke(); }
    ctx.font = "bold 23px Arial"; ctx.fillText("BOLD = START / CLOSE DOORS", 48, tableBottom + 48);
    ctx.font = "23px Arial"; ctx.fillText("Regular = break / clean theater", 48, tableBottom + 90);
    ctx.font = "20px Arial"; ctx.fillText(`PAGE ${page + 1} / ${pageCount()}    ← → turn    B fold`, 48, tableBottom + 142);
    texture.needsUpdate = true;
  }
  return {
    root: paper,
    get visible() { return visible; },
    get page() { return page; },
    get pageCount() { return pageCount(); },
    toggle() { visible = !visible; paper.visible = visible; if (visible) { fitPage(); page = Math.floor((schedule.sheetPage ?? 0) * 24 / rowsPerPage); draw(); } return visible; },
    turnPage(direction) { const next = Math.max(0, Math.min(pageCount() - 1, page + Math.sign(direction))); if (next === page) return false; page = next; draw(); return true; },
    hide() { visible = false; paper.visible = false; },
    update() {
      if (!visible) return;
      draw(); camera.updateMatrixWorld();
      // Fit inside a reserved central reading area. The bottom toolbar sits
      // below 92% of screen height; HUD/phone controls cannot cover paper rows.
      const distance = .72, viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const viewportHeight = globalThis.window?.innerHeight ?? 800;
      const short = viewportHeight < 600;
      const paperFraction = Math.max(.2, Math.min(short ? .88 : .68, (viewportHeight - (short ? 90 : 200)) / viewportHeight));
      const ratio = 800 / canvas.height, height = Math.min(viewHeight * paperFraction, viewHeight * camera.aspect * .94 / ratio);
      paper.scale.set(height * ratio / .40, height / .80, 1);
      paper.position.copy(position.set(0, viewHeight * (short ? 25 : -20) / viewportHeight, -distance).applyMatrix4(camera.matrixWorld));
      paper.quaternion.copy(camera.quaternion);
    },
    dispose() { paper.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
