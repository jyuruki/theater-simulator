/** Input bindings for tools in the world. Work state stays on the clipboard. */
export function createUsherUI({ gameplay, controller, canvas, isBlocked = () => false,
  document: doc = document, window: win = window }) {
  const prompt = doc.querySelector("#interact-button");
  const status = doc.querySelector("#visit-status");
  const actionButton = doc.querySelector("#tool-action-button");
  const returnButton = doc.querySelector("#tool-return-button");
  const sheetButton = doc.querySelector("#breaksheet-button");
  const broomButton = doc.querySelector("#broom-button");
  const clothButton = doc.querySelector("#cloth-button");
  const watchButton = doc.querySelector("#watch-button");
  const placeButton = doc.querySelector("#tool-place-button");
  const heldInputs = new Set();
  let toolPointerId = null;
  let cancelled = false;
  const listeners = [];
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  };
  const available = () => controller.started && controller.active && !doc.hidden && !isBlocked();
  const clear = () => { heldInputs.clear(); toolPointerId = null; cancelled = true; };
  const interact = () => { if (available()) { clear(); gameplay.interact(); } };
  const returnTool = () => { if (available()) { clear(); gameplay.returnTool(); } };
  listen(win, "keydown", (event) => {
    if (!available() || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? "")) return;
    if (event.code === "KeyF") { event.preventDefault(); if (event.repeat || !gameplay.heldTool) return; if (gameplay.placementActive) { clear(); gameplay.confirmPlacement?.(); return; } heldInputs.add("keyboard"); }
    if (event.repeat) return;
    if (event.code === "KeyE") { event.preventDefault(); interact(); }
    if (event.code === "KeyQ") { event.preventDefault(); returnTool(); }
    if (event.code === "KeyB") { event.preventDefault(); clear(); gameplay.toggleSheet?.(); }
    if (event.code === "KeyT") { event.preventDefault(); clear(); gameplay.toggleWatch?.(); }
    if (event.code === "KeyP") { event.preventDefault(); clear(); gameplay.togglePlacement?.(); }
    if (event.code === "Digit1") { event.preventDefault(); clear(); gameplay.selectTool?.("broom"); }
    if (event.code === "Digit2") { event.preventDefault(); clear(); gameplay.selectTool?.("cloth"); }
  });
  listen(win, "keyup", (event) => { if (event.code === "KeyF") heldInputs.delete("keyboard"); });
  listen(canvas, "pointerdown", (event) => {
    if (event.button === 0 && event.pointerType !== "touch" && available() && gameplay.heldTool) {
      if (gameplay.placementActive) { clear(); gameplay.confirmPlacement?.(); }
      else heldInputs.add("mouse");
    }
  });
  const releasePointer = (event) => {
    if (event.type !== "pointerup" && ((event.pointerType !== "touch" && heldInputs.has("mouse")) || event.pointerId === toolPointerId)) cancelled = true;
    if (event.pointerType !== "touch") heldInputs.delete("mouse");
    if (event.pointerId === toolPointerId) { heldInputs.delete("touch"); toolPointerId = null; }
  };
  listen(win, "pointerup", releasePointer);
  listen(win, "pointercancel", releasePointer);
  listen(win, "blur", clear);
  listen(doc, "visibilitychange", () => { if (doc.hidden) clear(); });
  listen(prompt, "click", interact);
  listen(returnButton, "click", returnTool);
  if (sheetButton) listen(sheetButton, "click", () => { if (available()) { clear(); gameplay.toggleSheet?.(); } });
  if (broomButton) listen(broomButton, "click", () => { if (available()) { clear(); gameplay.selectTool?.("broom"); } });
  if (clothButton) listen(clothButton, "click", () => { if (available()) { clear(); gameplay.selectTool?.("cloth"); } });
  if (watchButton) listen(watchButton, "click", () => { if (available()) { clear(); gameplay.toggleWatch?.(); } });
  if (placeButton) listen(placeButton, "click", () => { if (available()) { clear(); gameplay.togglePlacement?.(); } });
  for (const target of [canvas, prompt, actionButton, returnButton, placeButton, sheetButton, broomButton, clothButton, watchButton].filter(Boolean)) {
    listen(target, "contextmenu", event => event.preventDefault());
    listen(target, "selectstart", event => event.preventDefault());
  }
  listen(actionButton, "pointerdown", (event) => {
    event.preventDefault();
    if (!available() || !gameplay.heldTool) return;
    if (gameplay.placementActive) { clear(); gameplay.confirmPlacement?.(); return; }
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
      gameplay.update(delta, { active, action: active && heldInputs.size > 0, cancelAction: cancelled });
      cancelled = false;
      const label = active ? gameplay.focusedPrompt : "";
      prompt.hidden = !label;
      if (label) prompt.textContent = `${controller.isTouchMode ? "Tap" : "E"} · ${label}`;
      const hasTool = Boolean(gameplay.heldTool);
      actionButton.hidden = !(active && controller.isTouchMode && hasTool);
      returnButton.hidden = actionButton.hidden;
      actionButton.textContent = gameplay.placementActive ? "CONFIRM PLACEMENT" : gameplay.actionLabel ?? (gameplay.heldTool === "cloth" ? "HOLD TO WIPE" : "HOLD TO SWEEP");
      returnButton.textContent = gameplay.placementActive ? "CANCEL PLACEMENT" : gameplay.canPlace ? "PLACE ITEM" : "STOW / RELEASE";
      if (placeButton) { placeButton.hidden = !(active && gameplay.canPlace); placeButton.textContent = gameplay.placementActive ? "CANCEL · P" : "PLACE · P"; }
      const hint = controller.started ? gameplay.hint : "";
      if (status.textContent !== hint) status.textContent = hint;
    },
    dispose() { clear(); listeners.forEach(remove => remove()); },
  };
}
