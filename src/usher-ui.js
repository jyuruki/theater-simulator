/** Input bindings for tools in the world. Work state stays on the clipboard. */
export function createUsherUI({ gameplay, controller, canvas, isBlocked = () => false,
  document: doc = document, window: win = window }) {
  const prompt = doc.querySelector("#interact-button");
  const status = doc.querySelector("#visit-status");
  const actionButton = doc.querySelector("#tool-action-button");
  const returnButton = doc.querySelector("#tool-return-button");
  const heldInputs = new Set();
  let toolPointerId = null;
  const listeners = [];
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  };
  const available = () => controller.started && controller.active && !doc.hidden && !isBlocked();
  const clear = () => { heldInputs.clear(); toolPointerId = null; };
  const interact = () => { if (available()) gameplay.interact(); };
  const returnTool = () => { if (available()) gameplay.returnTool(); };
  listen(win, "keydown", (event) => {
    if (!available() || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? "")) return;
    if (event.code === "KeyF") { event.preventDefault(); heldInputs.add("keyboard"); }
    if (event.repeat) return;
    if (event.code === "KeyE") { event.preventDefault(); interact(); }
    if (event.code === "KeyQ") { event.preventDefault(); returnTool(); }
  });
  listen(win, "keyup", (event) => { if (event.code === "KeyF") heldInputs.delete("keyboard"); });
  listen(canvas, "pointerdown", (event) => {
    if (event.button === 0 && event.pointerType !== "touch" && available()) heldInputs.add("mouse");
  });
  const releasePointer = (event) => {
    if (event.pointerType !== "touch") heldInputs.delete("mouse");
    if (event.pointerId === toolPointerId) { heldInputs.delete("touch"); toolPointerId = null; }
  };
  listen(win, "pointerup", releasePointer);
  listen(win, "pointercancel", releasePointer);
  listen(win, "blur", clear);
  listen(doc, "visibilitychange", () => { if (doc.hidden) clear(); });
  listen(prompt, "click", interact);
  listen(returnButton, "click", returnTool);
  listen(actionButton, "pointerdown", (event) => {
    event.preventDefault();
    if (!available()) return;
    if (toolPointerId !== null) return;
    toolPointerId = event.pointerId;
    actionButton.setPointerCapture?.(event.pointerId);
    heldInputs.add("touch");
  });
  listen(actionButton, "pointerup", releasePointer);
  listen(actionButton, "pointercancel", releasePointer);
  listen(actionButton, "lostpointercapture", releasePointer);

  return {
    update(delta) {
      const active = available();
      if (!active) clear();
      gameplay.update(delta, { active, action: active && heldInputs.size > 0 });
      const label = active ? gameplay.focusedPrompt : "";
      prompt.hidden = !label;
      if (label) prompt.textContent = `${controller.isTouchMode ? "Tap" : "E"} · ${label}`;
      const hasTool = Boolean(gameplay.heldTool);
      actionButton.hidden = !(active && controller.isTouchMode && hasTool);
      returnButton.hidden = actionButton.hidden;
      actionButton.textContent = gameplay.heldTool === "cloth" ? "HOLD TO WIPE" : "HOLD TO SWEEP";
      const hint = controller.started ? gameplay.hint : "";
      if (status.textContent !== hint) status.textContent = hint;
    },
    dispose() { clear(); listeners.forEach(remove => remove()); },
  };
}
