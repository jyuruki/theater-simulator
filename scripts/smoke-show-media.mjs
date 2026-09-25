import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as THREE from "three";
import { AUDITORIUMS } from "../src/layout-data.js";
import { auditoriumDoorLayout } from "../src/auditorium-door-layout.js";
import { createShowStartMedia, HULA_ASPECT, HULA_DURATION } from "../src/show-start-media.js";
import { createUsherSchedule } from "../src/usher-schedule.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
class Video extends EventTarget {
  constructor() { super(); this.readyState = 3; this.paused = true; this.currentTime = 0; this.playCalls = 0; this.attributes = new Map(); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); if (key === "src") this.src = ""; }
  load() { this.loads = (this.loads ?? 0) + 1; }
  play() { this.playCalls++; if (this.fail) return Promise.reject(new Error("gesture required")); this.paused = false; return this.deferred ?? Promise.resolve(); }
  pause() { this.paused = true; }
}
const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
const node = () => ({ connect(target) { this.target = target; }, disconnect() { this.disconnected = true; } });
function audioContext() {
  const panners = [], sources = [], gains = [], filters = [];
  return { currentTime: 0, panners, sources, gains, filters,
    listener: Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map(key => [key, param()])),
    decodeAudioData: async () => ({ duration: HULA_DURATION }),
    createPanner() { const value = { ...node(), setPosition(...position) { this.position = position; } }; panners.push(value); return value; },
    createGain() { const value = { ...node(), gain: param() }; gains.push(value); return value; },
    createBiquadFilter() { const value = { ...node(), frequency: param() }; filters.push(value); return value; },
    createBufferSource() { const value = { ...node(), start(when, offset) { this.offset = offset; }, stop() { this.stopped = true; } }; sources.push(value); return value; },
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
  makeVideo: () => { const video = new Video(); videos.push(video); return video; },
  fetchFile: async url => { requested.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(32) }; },
  onError: error => errors.push(error),
  getDoor: id => { const door = auditoriumDoorLayout(AUDITORIUMS.find(room => room.id === id)); return { center: [door.x, 1, door.z], angle: closed ? 0 : Math.PI / 2 }; },
});
const near = id => { const door = auditoriumDoorLayout(AUDITORIUMS.find(room => room.id === id)); camera.position.set(door.route.outside[0], 1.68, door.route.outside[2]); return door; };
function step(seconds, active = true) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= .1) {
    const dt = Math.min(.1, remaining);
    if (active) { context.currentTime += dt; for (const video of videos) if (!video.paused && video.readyState >= 3) video.currentTime += dt; }
    media.update(dt, active);
  }
}

// Intro/remote shows must not make a decoder or inflate the large shared audio
// buffer; their logical clock is enough until the usher approaches.
camera.position.set(300, 1.68, 300); media.prepare(); media.update(0, true);
camera.position.set(310, 1.75, 290); camera.lookAt(320, 1.75, 290); media.update(0, true);
assert.equal(media.decoderCount, 0);
assert.deepEqual([context.listener.positionX.value, context.listener.positionY.value, context.listener.positionZ.value], [310, 1.75, 290],
  "The shared feature-film listener follows the camera with no Hula decoders");
assert.ok(Math.abs(context.listener.forwardX.value - 1) < 1e-8, "Feature-film direction follows the camera after Hula has ended");
const clampCue = createShowStartMedia({ camera, world: { root }, audio: { context: null } });
const clampSchedule = createUsherSchedule({ seed: 9 }), clampStart = clampSchedule.minute;
clampCue.onStart({ id: "frame-clamp", theaterId: "theater-1" }); clampSchedule.begin();
clampCue.update(2, true); clampSchedule.update(2, true);
assert.equal(clampCue.getSnapshot().playing[0].time, .1);
assert.ok(Math.abs(clampCue.getSnapshot().playing[0].time - clampSchedule.secondsSince(clampStart)) < 1e-7,
  "Oversized frame delta is clamped identically for cue and shift clocks");
clampCue.dispose(); clampSchedule.dispose();
const event = { id: "test-2-start", theaterId: "theater-2" };
media.onStart(event); media.update(0, true); await settle(); step(10);
assert.equal(videos.length, 0); assert.equal(requested.length, 0); assert.equal(media.decoderCount, 0);
assert.equal(media.isPlaying("theater-2"), true, "Feature exclusion follows the cue even without a decoder");
assert.ok(Math.abs(media.getSnapshot().playing[0].time - 10) < 1e-8);
const door = near("theater-2"); step(.3); await settle(); media.update(0, true);
assert.equal(videos.length, 1); assert.equal(media.decoderCount, 1);
assert.equal(videos[0].src, "/theater-simulator/media/hula-start.mp4");
assert.ok(videos[0].currentTime >= 10 && videos[0].currentTime < 10.4, "Approaching mid-cue seeks to its current timeline");
assert.ok(videos[0].muted && videos[0].playsInline && videos[0].attributes.has("webkit-playsinline"));
assert.deepEqual(requested, ["/theater-simulator/media/hula-start.m4a"]);
assert.equal(context.gains[0].target, audio.output);
const doorwayGain = context.gains[0].gain.value;
assert.ok(doorwayGain > .58 && doorwayGain <= .62);
assert.deepEqual(context.panners[0].position, [door.x, 1.8, door.z]);
assert.equal(context.panners[0].panningModel, "HRTF");
closed = true; media.update(0, true);
assert.ok(context.gains[0].gain.value < .045 && context.gains[0].gain.value > .04);
assert.equal(context.filters[0].frequency.value, 550);
camera.position.set(...door.route.inside); camera.position.y = 1.68; media.update(0, true);
assert.ok(context.gains[0].gain.value >= doorwayGain, "Crossing the entrance retains soundtrack level");
assert.equal(context.panners[0].rolloffFactor, 0);
const shader = { fragmentShader: "#include <map_fragment>" };
root.getObjectByName("theater-2-screen").material.onBeforeCompile(shader);
assert.ok(shader.fragmentShader.includes((1.6 / HULA_ASPECT).toFixed(8)));
assert.ok(shader.fragmentShader.includes("clipUv.y<0.0||clipUv.y>1.0"));
media.onStart(event); assert.equal(videos.length, 1, "An event cannot restart the same cue");

const beforePause = media.getSnapshot().playing[0].time;
media.update(0, false); step(3, false);
assert.ok(videos[0].paused && context.sources.at(-1).stopped);
assert.equal(media.getSnapshot().playing[0].time, beforePause, "Pause freezes the logical cue, too");
media.update(0, true); await settle(); media.update(0, true);
assert.equal(context.sources.at(-1).offset, videos[0].currentTime);
const beforeBuffering = context.sources.length;
videos[0].readyState = 2; media.update(.1, true); media.update(.1, true);
assert.ok(context.sources.at(-1).stopped); assert.equal(context.sources.length, beforeBuffering);
videos[0].readyState = 3; media.update(0, true); assert.equal(context.sources.length, beforeBuffering + 1);

// Use the production background listeners, including cached pagehide, instead
// of relying on another animation frame after the browser has suspended it.
const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const lifecycleSource = mainSource.slice(mainSource.indexOf('  document.addEventListener("visibilitychange", () => {'),
  mainSource.indexOf('  Object.defineProperty(window, "__THEATER_DEBUG__",'));
const lifecycleDocument = Object.assign(new EventTarget(), { hidden: false }), lifecycleWindow = new EventTarget();
const lifecycleController = { pauses: 0, pause() { this.pauses++; } }, lifecycleInteractions = { isOpen: false };
runInNewContext(lifecycleSource, { document: lifecycleDocument, window: lifecycleWindow, entered: true,
  interactions: lifecycleInteractions, controller: lifecycleController, startMedia: media, features: { update() {} } });
lifecycleDocument.hidden = true; lifecycleDocument.dispatchEvent(new Event("visibilitychange"));
assert.ok(videos[0].paused && context.sources.at(-1).stopped); assert.equal(lifecycleController.pauses, 1);
media.update(0, true); await settle(); media.update(0, true);
lifecycleInteractions.isOpen = true; lifecycleDocument.dispatchEvent(new Event("visibilitychange"));
assert.ok(videos[0].paused && context.sources.at(-1).stopped); assert.equal(lifecycleController.pauses, 1);
media.update(0, true); await settle(); media.update(0, true);
const pageHide = new Event("pagehide"); Object.defineProperty(pageHide, "persisted", { value: true }); lifecycleWindow.dispatchEvent(pageHide);
assert.ok(videos[0].paused); assert.equal(media.isPlaying("theater-2"), true);
media.update(0, true); await settle(); media.update(0, true);

let gpuDisposals = 0;
const firstMaterial = root.getObjectByName("theater-2-screen").material;
firstMaterial.addEventListener("dispose", () => gpuDisposals++); firstMaterial.map.addEventListener("dispose", () => gpuDisposals++);
camera.position.set(300, 1.68, 300); step(.3);
assert.equal(media.decoderCount, 0); assert.equal(videos[0].src, ""); assert.ok(videos[0].paused && videos[0].loads);
assert.equal(gpuDisposals, 2); assert.ok(context.panners[0].disconnected && context.sources[0].disconnected);
assert.equal(root.getObjectByName("theater-2-screen").material, originals.get("theater-2"));
const releasedTime = media.getSnapshot().playing[0].time; step(4);
assert.ok(media.getSnapshot().playing[0].time > releasedTime + 3.99);
near("theater-2"); step(.3); await settle(); media.update(0, true);
assert.equal(media.decoderCount, 1); assert.equal(videos.length, 2);
assert.ok(videos[1].currentTime > releasedTime + 4);
videos[0].dispatchEvent(new Event("ended")); videos[0].dispatchEvent(new Event("error"));
assert.equal(media.isPlaying("theater-2"), true, "Events from a released decoder cannot kill its replacement");
assert.equal(errors.length, 0);

for (const room of AUDITORIUMS) media.onStart({ id: `all-${room.id}`, theaterId: room.id });
media.update(0, true); await settle();
assert.equal(media.getSnapshot().playing.length, 14); assert.ok(media.decoderCount <= 2);
for (const room of AUDITORIUMS) { near(room.id); step(.3); assert.ok(media.decoderCount <= 2); }
camera.position.set(300, 1.68, 300); step(.3); assert.equal(media.decoderCount, 0);
step(HULA_DURATION + .1); assert.equal(media.getSnapshot().playing.length, 0, "Remote trailers finish without waiting for a video ended event");
camera.position.set(305, 1.7, 310); media.update(.1, true);
assert.equal(context.listener.positionX.value, 305, "Listener keeps moving after the final logical trailer finishes");
const allocated = videos.length; media.dispose(); media.onStart({ id: "disposed", theaterId: "theater-4" }); media.update(.1, true);
assert.equal(videos.length, allocated);

// A loading frame must not turn the screen white, and stale play/metadata
// callbacks must never install disposed material or revive a decoder.
near("theater-3"); let resolvePlay;
const pendingVideo = new Video(); pendingVideo.readyState = 0; pendingVideo.deferred = new Promise(resolve => { resolvePlay = resolve; });
const loading = createShowStartMedia({ camera, world: { root }, audio: { context: null }, makeVideo: () => pendingVideo });
loading.onStart({ id: "loading", theaterId: "theater-3" }, 14); loading.update(0, true);
assert.equal(root.getObjectByName("theater-3-screen").material, originals.get("theater-3"));
pendingVideo.readyState = 1; pendingVideo.dispatchEvent(new Event("loadedmetadata")); assert.equal(pendingVideo.currentTime, 14);
assert.equal(root.getObjectByName("theater-3-screen").material, originals.get("theater-3"));
pendingVideo.readyState = 2; pendingVideo.dispatchEvent(new Event("loadeddata"));
assert.notEqual(root.getObjectByName("theater-3-screen").material, originals.get("theater-3"));
loading.dispose(); resolvePlay(); await settle(); pendingVideo.dispatchEvent(new Event("loadeddata"));
assert.ok(pendingVideo.paused); assert.equal(root.getObjectByName("theater-3-screen").material, originals.get("theater-3"));

// Enabling sound late joins the current cue; network failures retry only on
// request/backoff, and loading failure does not end its logical timeline early.
near("theater-1"); let attempts = 0, failFetch = true;
const lateAudio = { context: null, output: node() }, lateVideos = [];
const late = createShowStartMedia({ camera, world: { root }, audio: lateAudio,
  makeVideo: () => { const video = new Video(); lateVideos.push(video); return video; },
  fetchFile: async () => { attempts++; if (failFetch) throw new Error("offline"); return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; },
});
late.onStart({ id: "late-audio", theaterId: "theater-1" }); late.update(0, true); await settle();
assert.equal(attempts, 0); lateAudio.context = audioContext(); late.update(.1, true); await settle();
for (let i = 0; i < 50; i++) late.update(.016, true);
assert.equal(attempts, 1);
failFetch = false; late.retry(); await settle(); late.update(0, true);
assert.ok(late.getSnapshot().audioReady && late.getSnapshot().playing[0].audio);
lateVideos[0].dispatchEvent(new Event("error"));
assert.equal(late.decoderCount, 0); assert.equal(late.isPlaying("theater-1"), true);
late.retry(); late.update(0, true); await settle(); assert.equal(late.decoderCount, 1);
lateVideos[1].dispatchEvent(new Event("ended")); assert.equal(late.isPlaying("theater-1"), false);
late.dispose();
for (const screen of root.children) { screen.geometry.dispose(); screen.material.dispose(); }
console.log("Show media valid: logical remote clocks, two nearby decoders, on-demand shared audio, mid-cue seek, ready-frame handoff, spatial sound, pause/background isolation, bounded retry and complete decoder/GPU lifecycle.");
