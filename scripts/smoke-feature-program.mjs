import assert from "node:assert/strict";
import * as THREE from "three";
import { AUDITORIUMS } from "../src/layout-data.js";
import { auditoriumDoorLayout } from "../src/auditorium-door-layout.js";
import { auditoriumAcoustics, auditoriumInteriorContains } from "../src/auditorium-acoustics.js";
import { createFeatureProgram, featurePhase, FEATURE_DURATION } from "../src/feature-program.js";
import { createBreakEvents, SHIFT_TIME_SCALE } from "../src/usher-schedule.js";
import { HULA_DURATION } from "../src/show-start-media.js";
import { planToWorldX } from "../src/coordinates.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
const near = (a, b, message, epsilon = .00001) => assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} vs ${b}`);
const events = createBreakEvents(2);
for (const room of AUDITORIUMS) {
  const roomEvents = events.filter(e => e.theaterId === room.id), first = roomEvents[0], start = roomEvents[1], nextBreak = roomEvents[2];
  assert.ok(featurePhase(events, room, first.time - .01), `${room.id}: preceding show is already running`);
  assert.equal(featurePhase(events, room, first.time), null, `${room.id}: break restores the idle screen`);
  assert.equal(featurePhase(events, room, start.time + (HULA_DURATION - .01) * SHIFT_TIME_SCALE / 60), null, `${room.id}: feature never overlaps Hula`);
  const phase = featurePhase(events, room, start.time + (HULA_DURATION + 10) * SHIFT_TIME_SCALE / 60);
  near(phase.offset, 10, "Real-time feature offset follows the accelerated schedule");
  assert.equal(phase.show, start.id);
  near(featurePhase(events, room, start.time + (HULA_DURATION + FEATURE_DURATION + 12) * SHIFT_TIME_SCALE / 60).offset, 12, "Full feature loops until scheduled break");
  assert.equal(featurePhase(events, room, nextBreak.time), null);
}
assert.equal(featurePhase([], AUDITORIUMS[0], 100), null);
assert.equal(featurePhase(events, AUDITORIUMS[0], NaN), null);

// Sample both sides of every real threshold, including closed-door muffling.
// The T3–5 approaches belong to their auditoriums before reaching the bowl.
let acousticSamples = 0;
for (const room of AUDITORIUMS) {
  const entry = auditoriumDoorLayout(room), screen = { x: planToWorldX((room.bounds.xMin + room.bounds.xMax) / 2), z: room.bounds.zMin + 1 };
  for (const angle of [0, Math.PI / 2]) {
    let previous;
    for (let depth = -.4; depth <= 1.601; depth += .005) {
      const listener = { x: entry.x + entry.normal[0] * depth, y: 1.68, z: entry.z + entry.normal[2] * depth };
      const sound = auditoriumAcoustics(room, listener, screen, { angle, center: [entry.x, 1.8, entry.z] });
      assert.ok(sound.gain >= 0 && sound.gain <= .77 && Number.isFinite(sound.cutoff));
      if (previous) {
        assert.ok(Math.abs(sound.gain - previous.gain) < .008, `${room.id}: no doorway volume discontinuity`);
        assert.ok(Math.hypot(...sound.position.map((n, i) => n - previous.position[i])) < .12, `${room.id}: directional anchor crosses smoothly`);
        assert.ok(Math.abs(sound.cutoff - previous.cutoff) < 180, `${room.id}: no doorway filter discontinuity`);
      }
      previous = sound; acousticSamples++;
    }
  }
  const outside = new THREE.Vector3(...entry.route.outside);
  assert.ok(auditoriumAcoustics(room, outside, screen, { angle: 0 }).gain < auditoriumAcoustics(room, outside, screen, { angle: 1.57 }).gain / 10);
  assert.equal(auditoriumAcoustics(room, { x: 1000, z: 1000 }, screen, null).gain, 0);
}
for (const number of [3, 4, 5]) {
  const room = AUDITORIUMS.find(r => r.number === number), bounds = room.entry.longRouteBounds ?? room.entry.routeBounds;
  const listener = { x: planToWorldX((bounds.xMin + bounds.xMax) / 2), z: bounds.zMax - .2 };
  assert.ok(auditoriumInteriorContains(room, listener), `${room.id}: long entrance retains its soundtrack`);
  near(auditoriumAcoustics(room, listener, { x: 0, z: 0 }, { angle: 1.57 }).gain, .77, "Distributed speakers maintain interior loudness");
}

class Video extends EventTarget {
  constructor() { super(); this.readyState = 3; this.paused = true; this.currentTime = 0; this.attributes = new Map(); this.playCalls = 0; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); if (key === "src") this.src = ""; }
  load() { this.loads = (this.loads ?? 0) + 1; }
  play() {
    this.playCalls++;
    if (this.fail) return Promise.reject(new Error("gesture required"));
    if (this.defer) return new Promise(resolve => { this.finishPlay = () => { this.paused = false; resolve(); }; });
    this.paused = false; return Promise.resolve();
  }
  pause() { this.paused = true; }
}
const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
const node = () => ({ connect(target) { this.target = target; }, disconnect() { this.disconnected = true; } });
function audioContext() {
  const sources = [], panners = [], filters = [], gains = [];
  return { currentTime: 0, sources, panners, filters, gains,
    createMediaElementSource(video) { const n = { ...node(), video }; sources.push(n); return n; },
    createPanner() { const n = { ...node(), setPosition(...p) { this.position = p; } }; panners.push(n); return n; },
    createBiquadFilter() { const n = { ...node(), frequency: param() }; filters.push(n); return n; },
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; },
    decodeAudioData() { assert.fail("A complete feature must stream, never decode to a large PCM buffer"); },
    createBufferSource() { assert.fail("Feature soundtrack is the video element's single streaming source"); },
  };
}
const root = new THREE.Group(), originals = new Map();
for (const room of AUDITORIUMS) {
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshBasicMaterial());
  screen.name = `${room.id}-screen`; screen.position.set(planToWorldX((room.bounds.xMin + room.bounds.xMax) / 2), 5, room.bounds.zMin + 1);
  root.add(screen); originals.set(room.id, screen.material);
}
const camera = new THREE.PerspectiveCamera(), context = audioContext(), audio = { context, output: node() };
const testEvents = AUDITORIUMS.flatMap(room => [{ theaterId: room.id, kind: "start", time: 100, id: `${room.id}-start` },
  { theaterId: room.id, kind: "break", time: 200, id: `${room.id}-break` }]).sort((a, b) => a.time - b.time);
const schedule = { minute: 104, events: testEvents }, videos = [], errors = [], trailers = new Set();
let deferNext = false;
const program = createFeatureProgram({ world: { root }, camera, audio, schedule,
  baseUrl: "/theater-simulator/", trailer: { isPlaying: id => trailers.has(id) }, onError: e => errors.push(e),
  makeVideo: () => { const video = new Video(); video.defer = deferNext; deferNext = false; videos.push(video); return video; },
});
const go = room => { const entry = auditoriumDoorLayout(room); camera.position.set(...entry.route.inside); camera.position.y = 1.68; };
go(AUDITORIUMS[1]); program.update(.3, true); await settle();
assert.ok(program.getSnapshot().decoders > 0 && program.getSnapshot().decoders <= 2);
assert.equal(videos[0].src, "/theater-simulator/media/big-buck-bunny.mp4");
assert.ok(videos[0].loop && videos[0].playsInline && videos[0].attributes.has("webkit-playsinline"));
schedule.minute += 4 * SHIFT_TIME_SCALE / 60;
videos[0].dispatchEvent(new Event("loadedmetadata")); near(videos[0].currentTime, 124 - HULA_DURATION, "Metadata delay joins the current clock, not a stale creation offset");
assert.equal(context.sources.length, videos.length, "Exactly one streaming audio source per decoder");
assert.ok(videos.every(video => !video.muted), "Only the connected Web Audio stream emits feature sound");
assert.ok(context.panners.every(p => p.rolloffFactor === 0 && p.panningModel === "HRTF"), "Position stays directional without applying distance attenuation twice");
assert.ok(context.gains.every(g => g.target === audio.output), "Every stream obeys shared volume");
const initialMaterial = root.getObjectByName("theater-2-screen").material;
const shader = { fragmentShader: "#include <map_fragment>" }; initialMaterial.onBeforeCompile(shader);
assert.ok(shader.fragmentShader.includes("filmUv.y<0.0||filmUv.y>1.0"), "Feature keeps full image with black letterboxing");
program.update(0, false); assert.ok(videos.every(video => video.paused), "Pause synchronously silences streaming elements");
program.update(0, true); await settle(); assert.ok(program.getSnapshot().films.every(f => !f.paused));
trailers.add("theater-2"); program.suspend("theater-2"); program.update(.3, true);
assert.equal(root.getObjectByName("theater-2-screen").material, originals.get("theater-2"));
assert.ok(!program.getSnapshot().films.some(f => f.room === "theater-2"), "Active Hula owns its screen exclusively");
trailers.clear();
for (const room of AUDITORIUMS) {
  go(room); program.update(.3, true); await settle();
  const snapshot = program.getSnapshot(); assert.ok(snapshot.films.some(f => f.room === room.id));
  assert.ok(snapshot.decoders <= 2 && videos.filter(v => v.src).length <= 2, "Traversal keeps at most two live decoders");
  for (const other of AUDITORIUMS.filter(r => !snapshot.films.some(f => f.room === r.id)))
    assert.equal(root.getObjectByName(`${other.id}-screen`).material, originals.get(other.id), "Unloaded screens restore original materials");
}
// A dogleg's far end is over 12 m from its door, but belongs to the active room.
const dogleg = AUDITORIUMS[3], bounds = dogleg.entry.longRouteBounds;
camera.position.set(planToWorldX((bounds.xMin + bounds.xMax) / 2), 1.68, bounds.zMax - .2);
program.update(.3, true); await settle(); assert.ok(program.getSnapshot().films.some(f => f.room === dogleg.id));
schedule.minute = 200; program.update(.3, true); assert.equal(program.getSnapshot().decoders, 0);
schedule.minute = 104; go(AUDITORIUMS[1]); program.update(.3, true); await settle();
const failing = videos.find(v => v.src); failing.dispatchEvent(new Event("error"));
assert.equal(errors.length, 1); const countBeforeRetry = videos.length;
program.update(.3, true); assert.equal(videos.length, countBeforeRetry, "A failed film does not reload every scan");
program.retry(); program.update(.3, true); await settle(); assert.ok(videos.length > countBeforeRetry);

// Resolve an old play promise only after that room already has a replacement.
program.suspend("theater-2"); deferNext = true; program.update(.3, true);
const pending = videos.findLast(v => v.defer); assert.ok(pending?.finishPlay);
program.suspend("theater-2"); program.update(.3, true); await settle();
pending.finishPlay(); await settle(); assert.ok(pending.paused, "Stale playback cannot revive a released decoder");
const live = program.getSnapshot().films.map(f => root.getObjectByName(`${f.room}-screen`).material);
let disposedMaterials = 0, disposedTextures = 0;
for (const material of live) { material.addEventListener("dispose", () => disposedMaterials++); material.map.addEventListener("dispose", () => disposedTextures++); }
program.dispose(); program.dispose(); await settle();
assert.equal(program.getSnapshot().decoders, 0);
assert.equal(disposedMaterials, live.length); assert.equal(disposedTextures, live.length);
assert.ok(videos.every(v => v.paused && !v.src));
assert.ok([...context.sources, ...context.panners, ...context.filters, ...context.gains].every(n => n.disconnected));
assert.ok(AUDITORIUMS.every(r => root.getObjectByName(`${r.id}-screen`).material === originals.get(r.id)));
const total = videos.length; program.update(.3, true); program.retry(); assert.equal(videos.length, total, "Disposal is terminal");
assert.equal(program.getSnapshot().active, false);

// Enabling audio after the feature began attaches one stream to that same
// element, instead of restarting picture or emitting duplicate sound.
const lateAudio = { context: null, output: node() }, lateVideos = [];
const late = createFeatureProgram({ world: { root }, camera, audio: lateAudio, schedule,
  makeVideo: () => { const v = new Video(); lateVideos.push(v); return v; } });
late.update(.3, true); await settle(); assert.ok(lateVideos.length && lateVideos.every(v => v.muted));
lateVideos[0].currentTime = 21; lateAudio.context = audioContext();
late.update(.3, true); await settle(); late.update(.3, true);
assert.equal(lateAudio.context.sources.length, lateVideos.length);
assert.equal(lateVideos[0].currentTime, 21, "Enabling streaming audio preserves picture position");
assert.ok(lateVideos.every(v => !v.muted)); late.dispose();

// Real browsers need time to decode their first frame. An empty VideoTexture
// must never replace the original picture with a white rectangle meanwhile.
const loadingVideos = [], loading = createFeatureProgram({ world: { root }, camera, audio, schedule,
  makeVideo: () => { const v = new Video(); v.readyState = 0; loadingVideos.push(v); return v; } });
loading.update(.3, true); await settle();
const loadingFilms = loading.getSnapshot().films;
assert.ok(loadingFilms.length);
assert.ok(loadingFilms.every(f => root.getObjectByName(`${f.room}-screen`).material === originals.get(f.room)), "Undecoded movies retain the original auditorium picture");
const loadingVideo = loadingVideos[0], loadingRoom = loadingFilms[0].room, loadingScreen = root.getObjectByName(`${loadingRoom}-screen`);
loadingVideo.dispatchEvent(new Event("loadeddata"));
assert.equal(loadingScreen.material, originals.get(loadingRoom), "An event without a decoded frame cannot show an empty texture");
loadingVideo.readyState = 2; loadingVideo.dispatchEvent(new Event("loadeddata"));
const readyMaterial = loadingScreen.material; assert.notEqual(readyMaterial, originals.get(loadingRoom));
loadingVideo.dispatchEvent(new Event("canplay")); loading.update(0, true);
assert.equal(loadingScreen.material, readyMaterial, "The ready movie material is applied idempotently");
loading.suspend(loadingRoom); assert.equal(loadingScreen.material, originals.get(loadingRoom));
const trailerMaterial = new THREE.MeshBasicMaterial(); loadingScreen.material = trailerMaterial;
loadingVideo.dispatchEvent(new Event("loadeddata")); loadingVideo.dispatchEvent(new Event("canplay"));
assert.equal(loadingScreen.material, trailerMaterial, "Late first-frame events cannot overwrite a replacement Hula screen");
loading.dispose(); assert.equal(loadingScreen.material, trailerMaterial, "Feature disposal leaves an independently-owned trailer intact");
loadingScreen.material = originals.get(loadingRoom); trailerMaterial.dispose();
for (const screen of root.children) { screen.geometry.dispose(); screen.material.dispose(); }
console.log(`Feature program valid: 14 schedules and ${acousticSamples} doorway audio samples; Hula exclusion, two streaming decoders, all-room traversal, dogleg continuity, pause/retry/stale-promise disposal and original-material restoration.`);
