import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import * as THREE from "three";
import { createBreakEvents, createUsherSchedule, consumeNewUsherDay, requestNewUsherDay,
  SHIFT_START_MINUTE, SCHEDULE_STORAGE_KEY, NEW_DAY_REQUEST_KEY } from "../src/usher-schedule.js";
import { createShiftSetupUI } from "../src/usher-ui.js";
import { createUsherBreaksheet } from "../src/usher-breaksheet.js";

const events = createBreakEvents();
assert.equal(events.length, 14 * 4 * 2);
assert.ok(events.every(event => event.time % 5 === 0), "Every printed start and break rounds to five minutes");
assert.ok(events.slice(0, 14).every(event => event.kind === "start"), "The entire initial wave is bold starts");
assert.equal(new Set(events.slice(0, 14).map(event => event.theaterId)).size, 14);
const breaks = events.filter(event => event.kind === "break");
for (let i = 1; i < breaks.length; i++) assert.ok(breaks[i].time - breaks[i - 1].time >= 10, "One usher never receives simultaneous scheduled breaks");
for (let number = 1; number <= 14; number++) {
  const room = events.filter(event => event.number === number);
  assert.equal(room.length, 8);
  for (let cycle = 0; cycle < 4; cycle++) {
    const start = room.find(event => event.kind === "start" && event.cycle === cycle);
    const end = room.find(event => event.kind === "break" && event.cycle === cycle);
    assert.ok(end.time - start.time >= 90);
    assert.equal(start.audienceCycle, end.cycle, "Visible patrons and used-seat cleanup share an audience");
    const previous = room.find(event => event.kind === "break" && event.cycle === cycle - 1);
    if (previous) assert.ok(start.time - previous.time >= 30, "Minimum cleaning turnaround stays intact");
  }
}
const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
const startsSeen = [], breaksSeen = [];
let schedule = createUsherSchedule({ storage, seed: 53, onStart: event => startsSeen.push(event), onBreak: event => breaksSeen.push(event) });
assert.equal(schedule.minute, SHIFT_START_MINUTE);
assert.equal(schedule.mode, "day");
assert.equal(schedule.started, false);
schedule.update(.1, false); assert.equal(schedule.minute, SHIFT_START_MINUTE);
schedule.begin(); schedule.update(0, true);
assert.equal(startsSeen.length, 0); assert.equal(breaksSeen.length, 0, "Opening is quiet and every room is clean");
assert.equal(schedule.getSnapshot().done.length, 0);
assert.equal(new Set(schedule.getNextBreaks().map(event => event.number)).size, 14);
const allSheetRows = Array.from({ length: schedule.pageCount }, (_, page) => schedule.sheetRows(page)).flat();
assert.deepEqual(allSheetRows.map(row => row.id), events.map(event => event.id), "Page turning exposes the entire program without omissions or duplicates");
assert.ok(allSheetRows.every(row => row.bold === (row.kind === "start")));
assert.ok(schedule.sheetRows(0).slice(0, 14).every(row => row.bold));
const initialMinute = schedule.minute;
for (let i = 0; i < 600; i++) schedule.update(.1, true);
assert.ok(Math.abs(schedule.minute - initialMinute - 2) < 1e-7);
assert.ok(Math.abs(schedule.secondsSince(initialMinute) - 60) < 1e-6);
assert.equal(schedule.setTimeScale(3), true);
for (let i = 0; i < 600; i++) schedule.update(.1, true);
assert.ok(Math.abs(schedule.minute - initialMinute - 5) < 1e-7);
assert.ok(Math.abs(schedule.secondsSince(initialMinute) - 120) < 1e-6, "Changing speed does not jump ongoing media elapsed time");
assert.equal(schedule.setTimeScale(99), false);
const paused = schedule.minute;
schedule.update(.1, false); assert.equal(schedule.minute, paused);
schedule.dispose(); schedule = createUsherSchedule({ storage });
assert.equal(schedule.restored, true); assert.equal(schedule.timeScale, 3);
assert.ok(Math.abs(schedule.secondsSince(initialMinute) - 120) < 1e-6, "Media time segments survive reload");

// Old progress is preserved verbatim until the explicit new-day action.
values.set(SCHEDULE_STORAGE_KEY, JSON.stringify({ version: 1, seed: 82, minute: 1070, started: true, done: ["theater-2-0-break"], clean: ["theater-2-0-break"] }));
const legacy = createUsherSchedule({ storage });
assert.equal(legacy.mode, "legacy"); assert.equal(legacy.minute, 1070);
assert.ok(legacy.getSnapshot().clean.includes("theater-2-0-break"));
for (const key of ["v22-cleaning", "v22-waste", "mililani-v22-supplies", "mililani-doors-v22"]) values.set(key, "saved work");
assert.equal(requestNewUsherDay(storage, { timeScale: 5 }), true);
legacy.dispose(); // Simulates pagehide saving the old live modules.
assert.ok(values.get("v22-cleaning"), "Click only records intent; an old pagehide cannot overwrite the new day");
assert.deepEqual(consumeNewUsherDay(storage), { timeScale: 5 });
assert.equal(values.has(NEW_DAY_REQUEST_KEY), false);
assert.equal(values.has("v22-cleaning"), false);
assert.equal(values.has(SCHEDULE_STORAGE_KEY), false);
const fresh = createUsherSchedule({ storage, timeScale: 5 });
assert.equal(fresh.minute, SHIFT_START_MINUTE); assert.equal(fresh.timeScale, 5); assert.equal(fresh.getSnapshot().done.length, 0);

// Check projected paper bounds rather than just CSS strings. In landscape the
// same complete schedule gets eight legible rows per page instead of shrinking
// a long sheet to unreadable type; the fold/page controls have their own strip.
globalThis.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; }
  getContext() { return new Proxy({}, { get: (object, key) => object[key] ?? (() => {}) }); }
};
for (const [width, height] of [[390, 844], [375, 667], [844, 390], [667, 375]]) {
  globalThis.window = { innerHeight: height };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(67, width / height, .06, 260);
  const paper = createUsherBreaksheet({ scene, camera, schedule: fresh });
  paper.toggle(); paper.update(); scene.updateMatrixWorld(true);
  const corners = [new THREE.Vector3(-.2, -.4, 0), new THREE.Vector3(.2, .4, 0)]
    .map(point => point.applyMatrix4(paper.root.matrixWorld).project(camera))
    .map(point => ({ x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 }));
  assert.ok(Math.min(...corners.map(point => point.x)) >= width * .02);
  assert.ok(Math.max(...corners.map(point => point.x)) <= width * .98);
  assert.ok(Math.min(...corners.map(point => point.y)) >= (height < 600 ? 18 : 110));
  assert.ok(Math.max(...corners.map(point => point.y)) <= height - 69, `${width}×${height}: no paper row is under the fold toolbar`);
  assert.equal(paper.pageCount, Math.ceil(events.length / (height < 600 ? 8 : 24)));
  let turns = 0; while (paper.turnPage(1)) turns++;
  assert.equal(turns, paper.pageCount - 1); assert.equal(paper.turnPage(1), false);
  paper.dispose();
}
// Reuse one live paper across orientation changes: fresh instances cannot
// expose stale GPU storage from uploading a differently sized canvas.
globalThis.window = { innerHeight: 844 };
const rotatingScene = new THREE.Scene(), rotatingCamera = new THREE.PerspectiveCamera(67, 390 / 844, .06, 260);
const rotatingPaper = createUsherBreaksheet({ scene: rotatingScene, camera: rotatingCamera, schedule: fresh });
rotatingPaper.toggle(); rotatingPaper.update();
const releasedTextures = [];
for (const height of [390, 844, 375, 667]) {
  const previous = rotatingPaper.root.material.map;
  let releases = 0;
  previous.addEventListener("dispose", () => { releases++; releasedTextures.push(previous); });
  globalThis.window.innerHeight = height;
  rotatingCamera.aspect = height < 600 ? 844 / height : 390 / height;
  rotatingCamera.updateProjectionMatrix(); rotatingPaper.update();
  const current = rotatingPaper.root.material.map;
  assert.notEqual(current, previous, "Changing portrait/landscape allocates a new texture instead of reusing incompatible GPU dimensions");
  assert.equal(releases, 1, "Each superseded GPU texture is disposed exactly once");
  assert.equal(current.colorSpace, THREE.SRGBColorSpace);
  assert.equal(current.image.height, height < 600 ? 720 : 1600);
  assert.ok(current.version > 0, "The replacement paper has a newly drawn image ready to upload");
  rotatingPaper.update();
  assert.equal(rotatingPaper.root.material.map, current, "Stable orientation reuses its texture");
}
let finalTextureDisposals = 0;
rotatingPaper.root.material.map.addEventListener("dispose", () => finalTextureDisposals++);
rotatingPaper.dispose(); assert.equal(finalTextureDisposals, 1); assert.equal(releasedTextures.length, 4);
delete globalThis.window;

// Real buttons/selects behave identically before entry and while paused.
const dom = new Window({ settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
dom.document.write(readFileSync(new URL("../index.html", import.meta.url), "utf8"));
let restarts = 0;
const setup = createShiftSetupUI({ schedule: legacy, storage, restart: () => restarts++, document: dom.document });
assert.equal(dom.document.querySelector("#enter-button").textContent, "CONTINUE SAVED SHIFT");
const introSpeed = dom.document.querySelector("#shift-speed-intro"), pauseSpeed = dom.document.querySelector("#shift-speed-pause");
introSpeed.value = "3"; introSpeed.dispatchEvent(new dom.Event("change"));
assert.equal(legacy.timeScale, 3); assert.equal(pauseSpeed.value, "3");
pauseSpeed.value = "5"; pauseSpeed.dispatchEvent(new dom.Event("change"));
assert.equal(legacy.timeScale, 5); assert.equal(introSpeed.value, "5");
dom.document.querySelector("#new-day-pause").click(); assert.equal(restarts, 1);
assert.equal(JSON.parse(values.get(NEW_DAY_REQUEST_KEY)).timeScale, 5);
setup.dispose(); dom.happyDOM.abort();
console.log("Opening-day schedule passed: all fourteen screens, five-minute times, staggered breaks, complete sheet pages, legacy continuation, deliberate reset and persistent 1/2/3/5x clock with continuous media time.");
