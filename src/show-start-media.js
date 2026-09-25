import * as THREE from "three";
import { AUDITORIUMS } from "./layout-data.js";
import { AUDITORIUM_SCREEN_SPEC } from "./layout-geometry.js";
import { auditoriumDoorLayout } from "./auditorium-door-layout.js";
import { auditoriumAcoustics, auditoriumInteriorContains } from "./auditorium-acoustics.js";

export const HULA_DURATION = 82.04;
export const HULA_ASPECT = 960 / 520;

/** Every start cue has a cheap logical clock. Only the two nearby cues can
 * allocate video decoders; leaving a room releases its picture and audio while
 * its timeline keeps advancing. A shared soundtrack is decoded only on demand. */
export function createShowStartMedia({ camera, world, audio, getDoor = () => null,
  baseUrl = import.meta.env?.BASE_URL ?? "./", fetchFile = globalThis.fetch,
  makeVideo = () => document.createElement("video"), onError = () => {} }) {
  const playing = new Map(), decoders = new Map(), seen = new Set();
  const rooms = new Map(AUDITORIUMS.map(room => [room.id, { room, door: auditoriumDoorLayout(room) }]));
  let buffer = null, loading = null, disposed = false, active = false, retryAt = 0, scan = 0;
  const direction = new THREE.Vector3(), up = new THREE.Vector3();
  function prepare() {
    if (!decoders.size || !audio.context || loading || buffer || disposed || Date.now() < retryAt) return;
    loading = fetchFile(`${baseUrl}media/hula-start.m4a`).then(response => {
      if (!response.ok) throw new Error(`Trailer audio: HTTP ${response.status}`); return response.arrayBuffer();
    }).then(bytes => audio.context.decodeAudioData(bytes)).then(result => { if (!disposed) buffer = result; })
      .catch(error => { loading = null; retryAt = Date.now() + 15000; if (!disposed) onError(error); });
  }
  const isCurrent = item => !disposed && !item.released && decoders.get(item.id) === item;
  function stopSound(item) {
    if (!item.source) return;
    item.source.stop(); item.source.disconnect(); item.source = null;
  }
  function releaseDecoder(id) {
    const item = decoders.get(id); if (!item) return;
    item.released = true; stopSound(item);
    item.video.pause(); item.video.removeAttribute("src"); item.video.load();
    item.panner?.disconnect(); item.gain?.disconnect(); item.filter?.disconnect();
    if (item.screen.material === item.material) item.screen.material = item.original;
    item.material.dispose(); item.texture.dispose(); decoders.delete(id);
  }
  function finish(cue) {
    if (playing.get(cue.id) !== cue) return;
    releaseDecoder(cue.id); playing.delete(cue.id);
  }
  function ensureSound(item) {
    const context = audio.context;
    if (!active || !buffer || !context || item.video.paused || item.video.seeking || item.video.readyState < 3 || item.source || !isCurrent(item)) return;
    if (!item.panner) {
      item.panner = context.createPanner(); item.panner.panningModel = "HRTF";
      item.panner.distanceModel = "inverse"; item.panner.refDistance = 5; item.panner.maxDistance = 42; item.panner.rolloffFactor = 0;
      item.gain = context.createGain(); item.gain.gain.value = 0;
      item.filter = context.createBiquadFilter(); item.filter.type = "lowpass";
      item.panner.connect(item.filter); item.filter.connect(item.gain); item.gain.connect(audio.output);
    }
    const offset = Math.min(buffer.duration - .001, item.video.currentTime);
    if (offset >= buffer.duration - .02) return;
    item.source = context.createBufferSource(); item.source.buffer = buffer; item.source.connect(item.panner);
    item.source.start(0, Math.max(0, offset)); item.soundOffset = offset; item.soundStarted = context.currentTime;
  }
  function showFrame(item) {
    if (isCurrent(item) && item.video.readyState >= 2 && !item.video.seeking
      && item.screen.material === item.original) item.screen.material = item.material;
  }
  function playVideo(item) {
    if (item.pending || item.failed || !isCurrent(item) || !active) return;
    item.pending = true;
    Promise.resolve(item.video.play()).then(() => { item.pending = false; if (!active || !isCurrent(item)) item.video.pause(); })
      .catch(error => { item.pending = false; if (isCurrent(item)) { item.failed = true; onError(error); } });
  }
  function createDecoder(cue) {
    const screen = world.root.getObjectByName(`${cue.id}-screen`); if (!screen) return;
    const video = makeVideo(); video.src = `${baseUrl}media/hula-start.mp4`;
    video.muted = true; video.playsInline = true; video.preload = "auto";
    video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
    const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    const fit = AUDITORIUM_SCREEN_SPEC.aspect / HULA_ASPECT;
    material.onBeforeCompile = shader => {
      const chunk = THREE.ShaderChunk.map_fragment.replaceAll("vMapUv", "clipUv");
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
        `vec2 clipUv=vec2(vMapUv.x,(vMapUv.y-0.5)/${fit.toFixed(8)}+0.5);\n${chunk}\nif(clipUv.y<0.0||clipUv.y>1.0)diffuseColor.rgb=vec3(0.0);`);
    };
    material.customProgramCacheKey = () => "hula-letterbox-v25";
    const item = { id: cue.id, cue, screen, video, texture, material, original: screen.material, pending: false, source: null };
    decoders.set(cue.id, item);
    const seek = () => { if (isCurrent(item)) { video.currentTime = Math.min(cue.elapsed, HULA_DURATION - .02); showFrame(item); } };
    video.addEventListener("loadedmetadata", seek, { once: true });
    video.addEventListener("loadeddata", () => showFrame(item));
    video.addEventListener("seeked", () => showFrame(item));
    video.addEventListener("canplay", () => showFrame(item));
    video.addEventListener("ended", () => { if (isCurrent(item)) finish(cue); }, { once: true });
    video.addEventListener("error", () => {
      if (!isCurrent(item)) return;
      cue.failed = true; releaseDecoder(cue.id); onError(new Error("Trailer video could not load."));
    }, { once: true });
    if (video.readyState >= 1) seek();
    showFrame(item); prepare(); playVideo(item);
  }
  function selectNearby() {
    const candidates = [...playing.values()].flatMap(cue => {
      if (cue.failed) return [];
      const { room, door } = rooms.get(cue.id);
      const inside = auditoriumInteriorContains(room, camera.position);
      const distance = Math.hypot(camera.position.x - door.x, camera.position.z - door.z);
      const current = decoders.has(cue.id);
      return inside || distance < (current ? 36 : 32) ? [{ cue, score: inside ? -1000 : distance - (current ? 2 : 0) }] : [];
    }).sort((a, b) => a.score - b.score).slice(0, 2);
    const selected = new Set(candidates.map(candidate => candidate.cue.id));
    for (const id of decoders.keys()) if (!selected.has(id)) releaseDecoder(id);
    for (const { cue } of candidates) if (!decoders.has(cue.id)) createDecoder(cue);
  }
  return {
    prepare,
    get decoderCount() { return decoders.size; },
    retry() {
      retryAt = 0; scan = 0;
      for (const cue of playing.values()) cue.failed = false;
      for (const item of decoders.values()) { item.failed = false; playVideo(item); }
      prepare();
    },
    onStart(event, offsetSeconds = 0) {
      if (disposed || seen.has(event.id)) return;
      seen.add(event.id);
      if (!rooms.has(event.theaterId) || !world.root.getObjectByName(`${event.theaterId}-screen`)) return;
      releaseDecoder(event.theaterId);
      const elapsed = Number.isFinite(offsetSeconds) ? Math.max(0, offsetSeconds) : 0;
      if (elapsed >= HULA_DURATION) { playing.delete(event.theaterId); return; }
      playing.set(event.theaterId, { id: event.theaterId, eventId: event.id, elapsed, failed: false }); scan = 0;
    },
    update(delta, isActive) {
      if (disposed) return;
      active = Boolean(isActive);
      if (!active) { for (const item of decoders.values()) { item.video.pause(); stopSound(item); } return; }
      const dt = Number.isFinite(delta) ? Math.min(.1, Math.max(0, delta)) : 0;
      for (const cue of playing.values()) { cue.elapsed += dt; if (cue.elapsed >= HULA_DURATION) finish(cue); }
      scan -= dt; if (scan <= 0) { scan = .25; selectNearby(); }
      if (decoders.size) prepare();
      const context = audio.context;
      // Feature films share this AudioContext after their Hula decoder has
      // finished. The listener must keep following the player even when this
      // module has no picture/audio sources of its own.
      if (context) {
        camera.getWorldDirection(direction); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        const listener = context.listener;
        if (listener.positionX) {
          listener.positionX.value = camera.position.x; listener.positionY.value = camera.position.y; listener.positionZ.value = camera.position.z;
          listener.forwardX.value = direction.x; listener.forwardY.value = direction.y; listener.forwardZ.value = direction.z;
          listener.upX.value = up.x; listener.upY.value = up.y; listener.upZ.value = up.z;
        } else {
          listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
          listener.setOrientation(direction.x, direction.y, direction.z, up.x, up.y, up.z);
        }
      }
      for (const item of decoders.values()) {
        if (item.video.readyState >= 1 && Math.abs(item.video.currentTime - item.cue.elapsed) > .75 && !item.video.seeking) {
          stopSound(item); item.video.currentTime = item.cue.elapsed;
        }
        showFrame(item);
        if (item.video.paused) playVideo(item);
        // Buffering or mobile suspension must not let audio run ahead of picture.
        if (item.source && (item.video.seeking || item.video.readyState < 3 || Math.abs(item.video.currentTime - item.soundOffset - (context.currentTime - item.soundStarted)) > .3)) stopSound(item);
        ensureSound(item);
        if (!item.panner) continue;
        const sound = auditoriumAcoustics(rooms.get(item.id).room, camera.position, item.screen.position, getDoor(item.id));
        item.panner.setPosition(...sound.position);
        item.gain.gain.setTargetAtTime(sound.gain, context.currentTime, .12);
        item.filter.frequency.setTargetAtTime(sound.cutoff, context.currentTime, .12);
      }
    },
    isPlaying(id) { return playing.has(id); },
    getSnapshot() { return { audioReady: Boolean(buffer), active, decoders: decoders.size, playing: [...playing.values()].map(cue => {
      const item = decoders.get(cue.id);
      return { theaterId: cue.id, time: cue.elapsed, videoTime: item?.video.currentTime ?? null,
        decoding: Boolean(item), paused: item ? item.video.paused : !active, audio: Boolean(item?.source), failed: Boolean(cue.failed || item?.failed) };
    }) }; },
    dispose() { disposed = true; active = false; for (const id of decoders.keys()) releaseDecoder(id); playing.clear(); buffer = null; },
  };
}
