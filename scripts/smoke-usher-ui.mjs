import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import * as THREE from "three";
import { createUsherUI, createShiftSetupUI } from "../src/usher-ui.js";
import { createVisitUI } from "../src/visit-ui.js";
import { createUsherShift } from "../src/usher-shift.js";
import { createTheaterWorld } from "../src/world.js";
import { createMaterialLibrary } from "../src/materials.js";
import { AABBCollisionWorld, FirstPersonController } from "../src/player.js";
import { createUsherSchedule, NEW_DAY_REQUEST_KEY } from "../src/usher-schedule.js";

const dom = new Window({ url: "https://example.test/", settings: {
  disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true,
} });
globalThis.window = dom;
globalThis.document = dom.document;
document.write(readFileSync(new URL("../index.html", import.meta.url), "utf8"));
const controller = { started: true, active: true, isTouchMode: false,
  pause() { this.active = false; }, resume() { this.active = true; } };
const camera = new THREE.PerspectiveCamera();
const legacy = createVisitUI({ controller, camera, employeeMode: true,
  collisionWorld: { colliders: [] }, showToast() {}, onSound() {},
  audio: { enabled: true, volume: .5 }, crowd: { enabled: true }, toggleMap() {},
});
const inputs = [], calls = [];
const gameplay = { time: "17:28", tool: "broom", sheetVisible: false, denySelection: false, focusedPrompt: "Read the shift sheet", hint: "USHER · Cleaning tools",
  get heldTool() { return this.sheetVisible ? null : this.tool; },
  update(delta, input) { inputs.push(input); }, interact() { calls.push("interact"); }, returnTool() { calls.push("return"); },
  selectTool(kind) { calls.push(`select:${kind}`); if (this.denySelection) return false; this.tool = kind; this.sheetVisible = false; return true; },
  toggleSheet() { calls.push("sheet"); this.sheetVisible = !this.sheetVisible; },
  canPlace: false, placementActive: false,
  togglePlacement() { calls.push("place"); this.placementActive = !this.placementActive; },
  confirmPlacement() { calls.push("confirm"); this.placementActive = false; },
};
const canvas = document.querySelector("#game-canvas");
const ui = createUsherUI({ gameplay, controller, canvas, isBlocked: () => legacy.isOpen,
  document, window: dom });
ui.update(0);
assert.equal(document.querySelector("#shift-clock").textContent, "17:28");
const key = (type, code, repeat = false) => dom.dispatchEvent(new dom.KeyboardEvent(type, { code, repeat }));
const pointer = (target, type, pointerType = "mouse") => target.dispatchEvent(new dom.PointerEvent(type, {
  button: 0, pointerId: 1, pointerType, bubbles: true,
}));

key("keydown", "KeyE");
key("keydown", "KeyE", true);
assert.deepEqual(calls, ["interact"], "E invokes the physical target once and does not trigger visitor menus");
key("keydown", "KeyI");
assert.equal(legacy.isOpen, false, "The usher cannot open the visitor ticket wallet");
assert.equal(document.querySelector("#ticket-button").hidden, true);
key("keydown", "KeyF"); ui.update(.016);
assert.equal(inputs.at(-1).action, true, "Keyboard alternative holds the tool action");
pointer(canvas, "pointerdown"); key("keyup", "KeyF"); ui.update(.016);
assert.equal(inputs.at(-1).action, true, "Releasing one input preserves an independently held mouse button");
pointer(dom, "pointerup"); ui.update(.016);
assert.equal(inputs.at(-1).action, false);

key("keydown", "KeyF"); controller.active = false; ui.update(.016);
assert.equal(inputs.at(-1).active, false, "Paused shifts cannot clean");
assert.equal(inputs.at(-1).action, false);
key("keydown", "KeyE"); key("keydown", "KeyQ");
assert.equal(calls.length, 1, "Paused input cannot pick up or return tools");
controller.active = true; ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Resuming cannot leave a stuck tool action");

// Tool hotkeys and the physical pocket sheet are edge-triggered, and switching
// modes clears an in-progress cleaning/throw gesture instead of carrying it on.
let commandStart = calls.length;
key("keydown", "KeyF"); ui.update(.016); assert.equal(inputs.at(-1).action, true);
key("keydown", "Digit1"); key("keydown", "Digit1", true); ui.update(.016);
assert.deepEqual(calls.slice(commandStart), ["select:broom"], "1 selects once, even when the key repeats");
assert.equal(inputs.at(-1).action, false, "Tool switching clears the held action");
assert.equal(inputs.at(-1).cancelAction, true, "Tool switching cancels a charged throw rather than releasing it");
ui.update(.016); assert.equal(inputs.at(-1).cancelAction, false, "Cancellation is delivered once");
key("keydown", "Digit2"); assert.equal(calls.at(-1), "select:cloth"); assert.equal(gameplay.heldTool, "cloth");
key("keydown", "KeyB"); key("keydown", "KeyB", true); ui.update(.016);
assert.equal(inputs.at(-1).cancelAction, true, "Opening the sheet cancels the current work gesture");
assert.equal(gameplay.sheetVisible, true); assert.equal(calls.filter(c => c === "sheet").length, 1, "B cannot flicker the sheet on key repeat");
assert.equal(document.querySelector("#interact-button").hidden, true, "Floating interaction prompt never covers paper text");
assert.equal(document.querySelector("#sheet-controls").hidden, false, "Reading has dedicated page/fold controls below the paper");
assert.equal(document.body.classList.contains("reading-sheet"), true);
key("keydown", "Digit1"); assert.equal(gameplay.sheetVisible, false, "Selecting the cleaning tool folds the paper");
const input = document.createElement("input"); document.body.append(input);
commandStart = calls.length;
for (const code of ["Digit1", "Digit2", "KeyB"]) input.dispatchEvent(new dom.KeyboardEvent("keydown", { code, bubbles: true }));
assert.equal(calls.length, commandStart, "Typing in a form cannot change tools or the break sheet"); input.remove();
controller.active = false;
for (const code of ["Digit1", "Digit2", "KeyB"]) key("keydown", code);
assert.equal(calls.length, commandStart, "Paused hotkeys cannot change equipment or paper");
controller.active = true; controller.started = false;
for (const code of ["Digit1", "Digit2", "KeyB"]) key("keydown", code);
assert.equal(calls.length, commandStart, "Shift controls stay inactive before entry");
controller.started = true; ui.update(.016);

controller.isTouchMode = true;
pointer(canvas, "pointerdown", "touch"); ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Touch look gestures cannot accidentally clean");
const action = document.querySelector("#tool-action-button");
action.setPointerCapture = () => {};
assert.equal(action.hidden, false);
pointer(action, "pointerdown", "touch"); ui.update(.016);
assert.equal(inputs.at(-1).action, true);
dom.dispatchEvent(new dom.PointerEvent("pointerup", { pointerType: "touch", pointerId: 2 })); ui.update(.016);
assert.equal(inputs.at(-1).action, true, "Releasing the separate look finger keeps the cleaning finger active");
dom.dispatchEvent(new dom.PointerEvent("pointercancel", { pointerType: "touch", pointerId: 2 })); ui.update(.016);
assert.equal(inputs.at(-1).action, true); assert.equal(inputs.at(-1).cancelAction, false, "Cancelling a look gesture must not cancel another finger's action");
pointer(action, "pointercancel", "touch"); ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Cancelled touch releases the tool");
assert.equal(inputs.at(-1).cancelAction, true, "Cancelled action capture cannot throw a charged bag");
pointer(action, "pointerdown", "touch"); ui.update(.016);
pointer(action, "lostpointercapture", "touch"); ui.update(.016);
assert.equal(inputs.at(-1).action, false); assert.equal(inputs.at(-1).cancelAction, true, "Lost action capture cancels safely");
pointer(action, "pointerdown", "touch"); ui.update(.016);
pointer(action, "pointerup", "touch"); ui.update(.016);
assert.equal(inputs.at(-1).action, false); assert.equal(inputs.at(-1).cancelAction, false, "An intentional release remains eligible to throw");
key("keydown", "KeyQ"); assert.equal(calls.at(-1), "return");

const broomButton = document.querySelector("#broom-button"), clothButton = document.querySelector("#cloth-button"), sheetButton = document.querySelector("#breaksheet-button");
assert.ok(broomButton && clothButton && sheetButton, "Touch users need physical-sheet and both tool shortcuts");
pointer(action, "pointerdown", "touch"); ui.update(.016); assert.equal(inputs.at(-1).action, true);
clothButton.click(); ui.update(.016); assert.equal(calls.at(-1), "select:cloth"); assert.equal(inputs.at(-1).action, false);
assert.equal(inputs.at(-1).cancelAction, true, "Touch tool shortcuts cancel charged actions too");
assert.equal(action.textContent, "HOLD TO WIPE", "Touch control follows the newly selected tool");
broomButton.click(); ui.update(.016); assert.equal(calls.at(-1), "select:broom"); assert.equal(action.textContent, "HOLD TO SWEEP");
sheetButton.click(); ui.update(.016); assert.equal(gameplay.sheetVisible, true); assert.equal(action.hidden, true, "Pocket-sheet view hides physical work controls");
sheetButton.click(); ui.update(.016); assert.equal(action.hidden, false);
gameplay.tool = "tied trash bag"; gameplay.actionLabel = "HOLD / RELEASE TO THROW"; gameplay.denySelection = true;
ui.update(.016); assert.equal(action.textContent, "HOLD / RELEASE TO THROW", "Waste and supply owners provide their own action instructions");
clothButton.click(); ui.update(.016); assert.equal(gameplay.heldTool, "tied trash bag", "UI cannot steal ownership when the module rejects a tool change");
gameplay.denySelection = false; delete gameplay.actionLabel; gameplay.tool = "broom";

gameplay.canPlace = true; key("keydown", "KeyG"); ui.update(.016);
assert.equal(gameplay.placementActive, true); assert.equal(action.textContent, "CONFIRM PLACEMENT");
pointer(action, "pointerdown", "touch"); ui.update(.016);
assert.equal(gameplay.placementActive, false); assert.equal(calls.at(-1), "confirm");
assert.equal(inputs.at(-1).action, false, "Confirming a placement must not also start pouring or throwing");
key("keydown", "KeyG"); pointer(canvas, "pointerdown"); ui.update(.016);
assert.equal(calls.at(-1), "confirm"); assert.equal(inputs.at(-1).action, false);
key("keydown", "KeyG"); key("keydown", "KeyF"); key("keydown", "KeyF", true); ui.update(.016);
assert.equal(calls.at(-1), "confirm"); key("keyup", "KeyF");
const callout = new dom.Event("contextmenu", { cancelable: true }); action.dispatchEvent(callout);
assert.equal(callout.defaultPrevented, true, "Holding the touch tool cannot open the browser callout");
gameplay.canPlace = false;

key("keydown", "KeyF"); ui.update(.016); assert.equal(inputs.at(-1).action, true);
key("keydown", "KeyE"); ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Picking up or operating a new item cannot inherit a held F gesture");
assert.equal(inputs.at(-1).cancelAction, true, "Discrete interactions cancel the previous charged action");
pointer(canvas, "pointerdown"); ui.update(.016); key("keydown", "KeyQ"); ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Q placement/cancel transitions clear a held mouse action");
key("keydown", "KeyB"); ui.update(.016);
key("keydown", "KeyF"); pointer(canvas, "pointerdown"); ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Reading the sheet cannot arm a future work gesture");
key("keydown", "KeyB"); ui.update(.016); assert.equal(inputs.at(-1).action, false);
gameplay.tool = null; key("keydown", "KeyF"); pointer(canvas, "pointerdown"); ui.update(.016);
gameplay.tool = "cloth"; ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Empty-handed button holds do not spill into a later pickup");

key("keydown", "KeyO"); ui.update(.016);
assert.equal(legacy.isOpen, true, "Minimal settings remain available");
assert.equal(inputs.at(-1).active, false);
assert.equal(document.querySelector("#interact-button").hidden, true);
commandStart = calls.length;
for (const button of [broomButton, clothButton, sheetButton]) button.click();
for (const code of ["Digit1", "Digit2", "KeyB"]) key("keydown", code);
assert.equal(calls.length, commandStart, "The settings dialog isolates both keyboard and touch shift shortcuts");
ui.dispose(); controller.active = true; document.querySelector("#visit-dialog").close();
const before = calls.length; key("keydown", "KeyE");
for (const button of [broomButton, clothButton, sheetButton]) button.click();
for (const code of ["Digit1", "Digit2", "KeyB"]) key("keydown", code);
assert.equal(calls.length, before, "Disposed tool bindings do not remain active");

// Exercise the real coordinator too: a held bag owns both hands and a charged
// throw cannot be triggered by folding paper, a rejected tool shortcut, or pause.
class CanvasStub {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { const gradient = { addColorStop() {} }; return new Proxy({ canvas: this,
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: t => ({ width: String(t).length * 12 }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, { get: (o, k) => o[k] ?? (() => {}) }); }
}
globalThis.OffscreenCanvas = CanvasStub;
const shiftScene = new THREE.Scene(), shiftMaterials = createMaterialLibrary();
const world = createTheaterWorld({ scene: shiftScene, materials: shiftMaterials });
const collisionWorld = new AABBCollisionWorld({ bounds: world.worldBounds }); collisionWorld.addBoxes(world.colliders);
const shiftCamera = new THREE.PerspectiveCamera();
const shift = createUsherShift({ scene: shiftScene, world, camera: shiftCamera, collisionWorld });
const runShift = (seconds, action = false) => { for (let i = 0; i < seconds * 120; i++) shift.update(1 / 120, { active: true, action }); };
runShift(.02);
const can = shift.waste.getSnapshot().bins[0]; shift.waste.depositTrash(can.id, 1000); runShift(1.8);
shiftCamera.position.set(can.x, 1.68, can.z + 1.4); shiftCamera.lookAt(can.x, 1.02, can.z); shiftCamera.updateMatrixWorld(true);
runShift(.02); assert.match(shift.focusedPrompt, /Lift full/); shift.interact();
runShift(1.7); runShift(.02, false); runShift(1.2, true);
assert.equal(shift.heldTool, "tied trash bag"); assert.equal(shift.hands.owner, "waste");
runShift(.04, false); runShift(.35, true); shift.toggleSheet(); runShift(.04, false);
assert.equal(shift.sheet.visible, true); assert.equal(shift.waste.heldTool, "tied trash bag", "Opening paper must not throw the held bag");
assert.equal(shift.waste.getSnapshot().bags[0].phase, "held");
assert.equal(shift.heldTool, null, "Paper hides work controls without lending the occupied hands to another module");
shift.returnTool(); assert.equal(shift.sheet.visible, false); assert.equal(shift.hands.owner, "waste", "First Q folds the paper, preserving the physical bag");
runShift(.04, false); runShift(.35, true);
assert.equal(shift.selectTool("broom"), false, "Cleaning cannot take hands occupied by a trash bag");
runShift(.04, false); assert.equal(shift.waste.getSnapshot().bags[0].phase, "held", "Rejected 1/2 shortcut also cancels a pending throw");
const beforePause = shift.getSnapshot(); shift.update(10, { active: false, action: true });
assert.equal(shift.schedule.minute, beforePause.schedule.minute, "Pause freezes the shift clock");
assert.deepEqual(shift.waste.getSnapshot().bags, beforePause.waste.bags, "Pause freezes held/ballistic waste state");
runShift(.02, false); shift.returnTool();
assert.equal(shift.placementActive, true); assert.equal(shift.hands.owner, "waste", "Q previews without losing the bag");
shiftCamera.lookAt(can.x + 1.4, 0, can.z + 1.4); shiftCamera.updateMatrixWorld(true); runShift(.02);
assert.equal(shift.confirmPlacement(), true);
assert.equal(shift.hands.owner, null); assert.equal(shift.waste.getSnapshot().bags[0].phase, "ground", "Confirmation physically places the bag and frees both hands");
shift.dispose(); world.dispose(); shiftMaterials.dispose();
dom.happyDOM.abort();
// A real touch controller reaches all shift settings without a keyboard.
const touchDom = new Window({ url: "https://example.test/", settings: {
  disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true,
} });
globalThis.window = touchDom; globalThis.document = touchDom.document;
document.write(readFileSync(new URL("../index.html", import.meta.url), "utf8"));
const touchCamera = new THREE.PerspectiveCamera(), pauseCard = document.querySelector("#pause-card");
let touchVisit;
const touchController = new FirstPersonController({ camera: touchCamera, domElement: document.querySelector("#game-canvas"),
  collisionWorld: new AABBCollisionWorld(), touchMode: true,
  onLockChange(active) { pauseCard.hidden = active || Boolean(touchVisit?.isOpen); },
});
touchVisit = createVisitUI({ controller: touchController, camera: touchCamera, employeeMode: true,
  collisionWorld: { colliders: [] }, showToast() {}, onSound() {}, audio: { enabled: true, volume: .5 }, crowd: { enabled: true }, toggleMap() {} });
const shiftValues = new Map(), shiftStorage = { getItem: key => shiftValues.get(key), setItem: (key, value) => shiftValues.set(key, value) };
const touchSchedule = createUsherSchedule({ storage: shiftStorage }); let newDayReloads = 0;
const touchSetup = createShiftSetupUI({ schedule: touchSchedule, storage: shiftStorage, document, restart: () => newDayReloads++ });
document.querySelector("#resume-button").addEventListener("click", () => touchController.resume());
touchController.start();
assert.equal(touchController.active, true); assert.equal(pauseCard.hidden, true);
assert.equal(document.querySelector("#settings-button").getAttribute("aria-label"), "Pause and shift options");
document.querySelector("#settings-button").click();
assert.equal(touchController.active, false); assert.equal(pauseCard.hidden, false, "Touch Options opens the common shift pause card");
assert.equal(touchVisit.isOpen, false, "Sound settings no longer intercept the touch pause entry point");
const touchSpeed = document.querySelector("#shift-speed-pause");
assert.ok(pauseCard.contains(touchSpeed) && pauseCard.contains(document.querySelector("#new-day-pause")));
touchSpeed.value = "5"; touchSpeed.dispatchEvent(new touchDom.Event("change")); assert.equal(touchSchedule.timeScale, 5);
document.querySelector("#pause-settings-button").click();
assert.equal(touchVisit.isOpen, true, "Sound & atmosphere remains available from the pause card");
assert.ok(document.querySelector("#visit-dialog input[type=range]"));
document.querySelector("#visit-dialog").close();
assert.equal(touchController.active, true, "Closing sound settings returns to the theater");
document.querySelector("#settings-button").click(); document.querySelector("#resume-button").click();
assert.equal(touchController.active, true); assert.equal(pauseCard.hidden, true, "Touch Resume closes the pause card and restores controls");
document.querySelector("#settings-button").click(); document.querySelector("#new-day-pause").click();
assert.equal(newDayReloads, 1); assert.equal(JSON.parse(shiftValues.get(NEW_DAY_REQUEST_KEY)).timeScale, 5);
touchSetup.dispose(); touchController.dispose(); touchDom.happyDOM.abort();
console.log("Usher controls valid: physical E, 1/2/B and touch shortcuts, multitouch cancellation, shared hands, real charged-bag sheet/tool/pause isolation, owner labels and complete listener cleanup.");
