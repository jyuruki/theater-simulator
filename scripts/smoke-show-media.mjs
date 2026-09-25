import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as THREE from "three";
import { AUDITORIUMS } from "../src/layout-data.js";
import { auditoriumDoorLayout } from "../src/auditorium-door-layout.js";
import { createShowStartMedia, HULA_ASPECT, HULA_DURATION } from "../src/show-start-media.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
class Video extends EventTarget {
  constructor() { super(); this.readyState = 3; this.paused = true; this.currentTime = 0; this.playCalls = 0; this.attributes = new Map(); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); if (key === "src") this.src = ""; }
  load() {}
  play() { this.playCalls++; if (this.fail) return Promise.reject(new Error("gesture required")); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
const node = () => ({ connect(target) { this.target = target; }, disconnect() { this.disconnected = true; } });
function audioContext() {
  const panners = [], sources = [], gains = [], filters = [];
  return { currentTime: 0, panners, sources, gains, filters,
    listener: Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map(key => [key, param()])),
    decodeAudioData: async () => ({ duration: HULA_DURATION }),
    createPanner() { const n = { ...node(), setPosition(...p) { this.position = p; } }; panners.push(n); return n; },
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    createBiquadFilter() { const n = { ...node(), frequency: param() }; filters.push(n); return n; },
    createBufferSource() { const n = { ...node(), start(when, offset) { this.offset = offset; }, stop() { this.stopped = true; } }; sources.push(n); return n; },
  };
}
const root = new THREE.Group(), originals = new Map();
for (const room of AUDITORIUMS) {
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshBasicMaterial());
  screen.name = `${room.id}-screen`; screen.position.set(3 - (room.bounds.xMin + room.bounds.xMax) / 2, 5, room.bounds.zMin + .2);
  root.add(screen); originals.set(room.id, screen.material);
}
const camera = new THREE.PerspectiveCamera(), context = audioContext(), audio = { context, output: node() };
const videos = [], errors = [], requested = [];
let closed = false;
const media = createShowStartMedia({ camera, world: { root }, audio, baseUrl: "/theater-simulator/",
  makeVideo: () => { const v = new Video(); videos.push(v); return v; },
  fetchFile: async url => { requested.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(32) }; },
  onError: error => errors.push(error),
  getDoor: id => { const d = auditoriumDoorLayout(AUDITORIUMS.find(r => r.id === id)); return { center: [d.x, 1, d.z], angle: closed ? 0 : Math.PI / 2 }; },
});
const event = { id: "test-2-start", theaterId: "theater-2" };
const door = auditoriumDoorLayout(AUDITORIUMS.find(r => r.id === event.theaterId));
camera.position.set(door.route.outside[0], 1.68, door.route.outside[2]);
media.update(0, true); media.onStart(event); await settle(); media.update(.016, true);
assert.equal(videos.length, 1); assert.equal(videos[0].src, "/theater-simulator/media/hula-start.mp4");
assert.ok(videos[0].muted && videos[0].playsInline && videos[0].attributes.has("webkit-playsinline"), "Inline muted picture never duplicates positional audio");
assert.deepEqual(requested, ["/theater-simulator/media/hula-start.m4a"]);
assert.equal(context.sources.length, 1); assert.equal(context.sources[0].offset, 0);
assert.equal(context.gains[0].target, audio.output, "Sound obeys the shared game volume output");
const doorwayGain = context.gains[0].gain.value;
assert.ok(doorwayGain > .58 && doorwayGain <= .62, "Open doorway source can be heard from the cubby");
assert.deepEqual(context.panners[0].position, [door.x, 1.8, door.z]);
assert.equal(context.panners[0].panningModel, "HRTF");
closed = true; media.update(.016, true);
assert.ok(context.gains[0].gain.value < .045 && context.gains[0].gain.value > .04, "Closed inner door muffles listeners in the small-room cubby");
assert.equal(context.filters[0].frequency.value, 550);
camera.position.set(...door.route.inside); camera.position.y = 1.68; media.update(.016, true);
assert.ok(context.gains[0].gain.value >= doorwayGain, "Entering cannot suddenly make the soundtrack quieter");
assert.equal(context.panners[0].rolloffFactor, 0, "Screen distance no longer doubles the auditorium attenuation");
assert.ok(context.filters[0].frequency.value > 4800);
camera.position.set(300, 1.68, 300); media.update(.016, true); assert.equal(context.gains[0].gain.value, 0, "Distant auditoriums are silent");
assert.equal(context.listener.positionX.value, 300);

const shader = { fragmentShader: "#include <map_fragment>" };
root.getObjectByName("theater-2-screen").material.onBeforeCompile(shader);
assert.ok(shader.fragmentShader.includes((1.6 / HULA_ASPECT).toFixed(8)), "Correct source-to-screen aspect fit");
assert.ok(shader.fragmentShader.includes("clipUv.y<0.0||clipUv.y>1.0"), "Letterbox regions are black instead of stretched video");
assert.ok(!shader.fragmentShader.includes("#include <map_fragment>"));
media.onStart(event); assert.equal(videos.length, 1, "Same schedule event cannot replay");
videos[0].currentTime = 12; context.currentTime = 12;
media.update(.016, false); assert.ok(videos[0].paused && context.sources[0].stopped, "Pause stops both clocks");
media.update(.016, true); await settle(); media.update(.016, true);
assert.equal(context.sources.at(-1).offset, 12, "Resume begins soundtrack at picture time");
const beforeBuffering = context.sources.length;
videos[0].readyState = 2; media.update(.016, true); media.update(.016, true);
assert.ok(context.sources.at(-1).stopped); assert.equal(context.sources.length, beforeBuffering, "Buffering does not repeatedly restart audio");
videos[0].readyState = 3; media.update(.016, true); assert.equal(context.sources.length, beforeBuffering + 1);
videos[0].currentTime = 20; media.update(.016, true);
assert.equal(context.sources.at(-1).offset, 20, "Seek/drift resynchronizes soundtrack to picture");

// Run the production lifecycle listeners against real media state, without
// scheduling another render frame: background tabs can suspend rAF instantly.
const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const lifecycleSource = mainSource.slice(mainSource.indexOf('  document.addEventListener("visibilitychange", () => {'),
  mainSource.indexOf('  Object.defineProperty(window, "__THEATER_DEBUG__",'));
const lifecycleDocument = Object.assign(new EventTarget(), { hidden: false });
const lifecycleWindow = new EventTarget();
const lifecycleController = { pauses: 0, pause() { this.pauses++; } };
const lifecycleInteractions = { isOpen: false };
runInNewContext(lifecycleSource, { document: lifecycleDocument, window: lifecycleWindow, entered: true,
  interactions: lifecycleInteractions, controller: lifecycleController, startMedia: media, features: { update() {} } });
lifecycleDocument.hidden = true;
lifecycleDocument.dispatchEvent(new Event("visibilitychange"));
assert.ok(videos[0].paused && context.sources.at(-1).stopped, "Backgrounding synchronously pauses picture and sound without a render frame");
assert.equal(lifecycleController.pauses, 1);
media.update(0, true); await settle(); media.update(0, true);
lifecycleInteractions.isOpen = true;
lifecycleDocument.dispatchEvent(new Event("visibilitychange"));
assert.ok(videos[0].paused && context.sources.at(-1).stopped, "An open options dialog does not bypass background media pause");
assert.equal(lifecycleController.pauses, 1);
media.update(0, true); await settle(); media.update(0, true);
const pageHide = new Event("pagehide"); Object.defineProperty(pageHide, "persisted", { value: true });
lifecycleWindow.dispatchEvent(pageHide);
assert.ok(videos[0].paused && context.sources.at(-1).stopped, "Back-forward cache entry also pauses media synchronously");
assert.equal(media.getSnapshot().playing.length, 1, "Cached pages retain the paused cue for later resume");
media.update(0, true); await settle(); media.update(0, true);

media.onStart({ id: "next-2-start", theaterId: "theater-2" }); await settle();
const replacement = root.getObjectByName("theater-2-screen").material;
videos[0].dispatchEvent(new Event("ended"));
assert.equal(root.getObjectByName("theater-2-screen").material, replacement, "Late old-video event cannot remove its replacement");
assert.equal(media.getSnapshot().playing.length, 1);
videos[1].dispatchEvent(new Event("ended"));
assert.equal(root.getObjectByName("theater-2-screen").material, originals.get("theater-2"));
assert.equal(media.getSnapshot().playing.length, 0);
media.onStart({ id: "restore-3-start", theaterId: "theater-3" }, 14);
videos[2].dispatchEvent(new Event("loadedmetadata")); assert.equal(videos[2].currentTime, 14);
videos[2].dispatchEvent(new Event("error")); assert.equal(media.getSnapshot().playing.length, 0);
media.dispose(); media.onStart({ id: "disposed", theaterId: "theater-4" }); assert.equal(videos.length, 3);

// Audio enabled after the shift began must join the current trailer. Failed
// media loads are throttled and an explicit user retry can recover immediately.
let attempts = 0, failFetch = true;
const lateAudio = { context: null, output: node() }, lateVideos = [];
const late = createShowStartMedia({ camera, world: { root }, audio: lateAudio,
  makeVideo: () => { const v = new Video(); lateVideos.push(v); return v; },
  fetchFile: async () => { attempts++; if (failFetch) throw new Error("offline"); return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; },
});
late.update(0, true); late.onStart({ id: "late-audio", theaterId: "theater-1" }); await settle();
assert.equal(attempts, 0); lateAudio.context = audioContext();
late.update(.016, true); await settle();
for (let i = 0; i < 50; i++) late.update(.016, true);
assert.equal(attempts, 1, "Fetch failure does not hammer network each frame");
failFetch = false; late.retry(); await settle(); late.update(.016, true);
assert.ok(late.getSnapshot().audioReady && late.getSnapshot().playing[0].audio);
late.dispose();
for (const screen of root.children) { screen.geometry.dispose(); screen.material.dispose(); }
console.log("Show media valid: inline letterboxed picture, one shared decoded soundtrack, positional doorway audio, closed-inner-door attenuation, volume routing, pause/buffering/seek sync, stale-event safety and late audio recovery.");
