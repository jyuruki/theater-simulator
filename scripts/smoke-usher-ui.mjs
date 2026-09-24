import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import * as THREE from "three";
import { createUsherUI } from "../src/usher-ui.js";
import { createVisitUI } from "../src/visit-ui.js";

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
const gameplay = { heldTool: "broom", focusedPrompt: "Read the shift sheet", hint: "USHER · Cleaning tools",
  update(delta, input) { inputs.push(input); }, interact() { calls.push("interact"); }, returnTool() { calls.push("return"); } };
const canvas = document.querySelector("#game-canvas");
const ui = createUsherUI({ gameplay, controller, canvas, isBlocked: () => legacy.isOpen,
  document, window: dom });
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
assert.deepEqual(inputs.at(-1), { active: false, action: false }, "Paused shifts cannot clean");
key("keydown", "KeyE"); key("keydown", "KeyQ");
assert.equal(calls.length, 1, "Paused input cannot pick up or return tools");
controller.active = true; ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Resuming cannot leave a stuck tool action");

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
pointer(action, "pointercancel", "touch"); ui.update(.016);
assert.equal(inputs.at(-1).action, false, "Cancelled touch releases the tool");
key("keydown", "KeyQ"); assert.equal(calls.at(-1), "return");

key("keydown", "KeyO"); ui.update(.016);
assert.equal(legacy.isOpen, true, "Minimal settings remain available");
assert.equal(inputs.at(-1).active, false);
assert.equal(document.querySelector("#interact-button").hidden, true);
ui.dispose(); controller.active = true; document.querySelector("#visit-dialog").close();
const before = calls.length; key("keydown", "KeyE");
assert.equal(calls.length, before, "Disposed tool bindings do not remain active");
dom.happyDOM.abort();
console.log("Usher controls valid: physical E interaction, held mouse/keyboard/touch actions, pause cancellation, settings isolation and listener cleanup.");
