import { requestNewUsherDay } from "./usher-schedule.js";

/** Short startup/pause settings; the actual work remains in the world. */
export function createShiftSetupUI({ schedule, storage, restart = () => window.location.reload(),
  document: doc = document }) {
  const selects = [doc.querySelector("#shift-speed-intro"), doc.querySelector("#shift-speed-pause")].filter(Boolean);
  const buttons = [doc.querySelector("#new-day-intro"), doc.querySelector("#new-day-pause")].filter(Boolean);
  const listeners = [];
  const enter = doc.querySelector("#enter-button");
  if (enter) enter.textContent = schedule.restored && schedule.started ? "CONTINUE SAVED SHIFT" : "START YOUR SHIFT";
  const savedNote = doc.querySelector("#saved-shift-note");
  if (savedNote) { savedNote.hidden = !(schedule.restored && schedule.started); savedNote.textContent = `Continue at ${schedule.time}, or start a fresh day below.`; }
  for (const select of selects) {
    select.value = String(schedule.timeScale);
    const change = () => { if (schedule.setTimeScale(Number(select.value))) for (const sibling of selects) sibling.value = String(schedule.timeScale); };
    select.addEventListener("change", change); listeners.push(() => select.removeEventListener("change", change));
  }
  for (const button of buttons) {
    const click = () => {
      if (requestNewUsherDay(storage, { timeScale: schedule.timeScale })) { button.disabled = true; restart(); }
      else { button.textContent = "Storage unavailable — your current shift is safe"; }
    };
    button.addEventListener("click", click); listeners.push(() => button.removeEventListener("click", click));
  }
  return { dispose() { listeners.forEach(remove => remove()); } };
}

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
  const clock = doc.querySelector("#shift-clock");
  const placeButton = doc.querySelector("#tool-place-button");
  const sheetControls = doc.querySelector("#sheet-controls");
  const sheetPrevious = doc.querySelector("#sheet-previous");
  const sheetNext = doc.querySelector("#sheet-next");
  const sheetFold = doc.querySelector("#sheet-fold");
  const sheetPage = doc.querySelector("#sheet-page");
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
    if (gameplay.sheetVisible && ["ArrowLeft", "ArrowRight"].includes(event.code)) { event.preventDefault(); clear(); gameplay.turnSheetPage?.(event.code === "ArrowLeft" ? -1 : 1); }
    if (event.code === "KeyE") { event.preventDefault(); interact(); }
    if (event.code === "KeyQ") { event.preventDefault(); returnTool(); }
    if (event.code === "KeyB") { event.preventDefault(); clear(); gameplay.toggleSheet?.(); }
    if (event.code === "KeyG") { event.preventDefault(); clear(); gameplay.togglePlacement?.(); }
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
  if (placeButton) listen(placeButton, "click", () => { if (available()) { clear(); gameplay.togglePlacement?.(); } });
  if (sheetFold) listen(sheetFold, "click", () => { if (available() && gameplay.sheetVisible) { clear(); gameplay.toggleSheet?.(); } });
  for (const [button, direction] of [[sheetPrevious, -1], [sheetNext, 1]]) if (button) listen(button, "click", () => { if (available() && gameplay.sheetVisible) { clear(); gameplay.turnSheetPage?.(direction); } });
  for (const target of [canvas, prompt, actionButton, returnButton, placeButton, sheetButton, broomButton, clothButton, sheetFold, sheetPrevious, sheetNext].filter(Boolean)) {
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
      const reading = active && Boolean(gameplay.sheetVisible);
      doc.body.classList.toggle("reading-sheet", reading);
      if (sheetControls) sheetControls.hidden = !reading;
      if (reading) {
        if (sheetPrevious) sheetPrevious.disabled = !(gameplay.sheetPage > 0);
        if (sheetNext) sheetNext.disabled = gameplay.sheetPage >= gameplay.sheetPageCount - 1;
        const label = `${(gameplay.sheetPage ?? 0) + 1} / ${gameplay.sheetPageCount ?? 1}`;
        if (sheetPage && sheetPage.textContent !== label) sheetPage.textContent = label;
      }
      prompt.hidden = !label || reading;
      if (label) prompt.textContent = `${controller.isTouchMode ? "Tap" : "E"} · ${label}`;
      const hasTool = Boolean(gameplay.heldTool);
      actionButton.hidden = !(active && controller.isTouchMode && hasTool);
      returnButton.hidden = actionButton.hidden;
      actionButton.textContent = gameplay.placementActive ? "CONFIRM PLACEMENT" : gameplay.actionLabel ?? (gameplay.heldTool === "cloth" ? "HOLD TO WIPE" : "HOLD TO SWEEP");
      returnButton.textContent = gameplay.placementActive ? "CANCEL PLACEMENT" : gameplay.canPlace ? "PLACE ITEM" : "STOW / RELEASE";
      if (placeButton) { placeButton.hidden = !(active && gameplay.canPlace); placeButton.textContent = gameplay.placementActive ? "CANCEL · G" : "PLACE · G"; }
      if (clock && clock.textContent !== gameplay.time) clock.textContent = gameplay.time;
      const hint = controller.started ? gameplay.hint : "";
      if (status.textContent !== hint) status.textContent = hint;
    },
    dispose() { clear(); doc.body.classList.remove("reading-sheet"); listeners.forEach(remove => remove()); },
  };
}
