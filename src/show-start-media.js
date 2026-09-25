import * as THREE from "three";
import { AUDITORIUMS } from "./layout-data.js";
import { AUDITORIUM_SCREEN_SPEC } from "./layout-geometry.js";
import { auditoriumAcoustics } from "./auditorium-acoustics.js";

export const HULA_DURATION = 82.04;
export const HULA_ASPECT = 960 / 520;

/** Muted inline video plus a shared decoded soundtrack avoids fourteen audio
 * elements fighting mobile autoplay. Both clocks are tied to video.currentTime. */
export function createShowStartMedia({ camera, world, audio, getDoor = () => null,
  baseUrl = import.meta.env?.BASE_URL ?? "./", fetchFile = globalThis.fetch,
  makeVideo = () => document.createElement("video"), onError = () => {} }) {
  const playing = new Map(), seen = new Set();
  let buffer = null, loading = null, disposed = false, active = false, retryAt = 0;
  const direction = new THREE.Vector3(), up = new THREE.Vector3();
  function prepare() {
    if (!audio.context || loading || buffer || disposed || Date.now() < retryAt) return;
    loading = fetchFile(`${baseUrl}media/hula-start.m4a`).then(r => {
      if (!r.ok) throw new Error(`Trailer audio: HTTP ${r.status}`); return r.arrayBuffer();
    }).then(bytes => audio.context.decodeAudioData(bytes)).then(result => { if (!disposed) buffer = result; })
      .catch(error => { loading = null; retryAt = Date.now() + 15000; onError(error); });
  }
  function stopSound(item) { if (item.source) { item.source.stop(); item.source.disconnect(); item.source = null; } }
  function release(item) {
    if (item.released) return;
    item.released = true;
    stopSound(item); item.video.pause(); item.video.removeAttribute("src"); item.video.load();
    item.panner?.disconnect(); item.gain?.disconnect(); item.filter?.disconnect();
    if (playing.get(item.id) === item) {
      item.screen.material = item.original;
      playing.delete(item.id);
    }
    item.material.dispose(); item.texture.dispose();
  }
  function ensureSound(item) {
    const context = audio.context;
    if (!active || !buffer || !context || item.video.paused || item.video.readyState < 3 || item.source || item.released) return;
    if (!item.panner) {
      item.panner = context.createPanner(); item.panner.panningModel = "HRTF";
      item.panner.distanceModel = "inverse"; item.panner.refDistance = 5; item.panner.maxDistance = 42; item.panner.rolloffFactor = 0;
      item.gain = context.createGain(); item.filter = context.createBiquadFilter(); item.filter.type = "lowpass";
      item.panner.connect(item.filter); item.filter.connect(item.gain); item.gain.connect(audio.output);
    }
    const offset = Math.min(buffer.duration - .001, item.video.currentTime);
    if (offset >= buffer.duration - .02) return;
    item.source = context.createBufferSource(); item.source.buffer = buffer; item.source.connect(item.panner);
    item.source.start(0, Math.max(0, offset)); item.soundOffset = offset; item.soundStarted = context.currentTime;
  }
  function playVideo(item) {
    if (item.pending || item.failed || item.released || !active) return;
    item.pending = true;
    Promise.resolve(item.video.play()).then(() => { item.pending = false; if (!active || disposed || item.released) item.video.pause(); })
      .catch(error => { item.pending = false; item.failed = true; onError(error); });
  }
  return {
    prepare,
    retry() { retryAt = 0; for (const item of playing.values()) { item.failed = false; playVideo(item); } prepare(); },
    onStart(event, offsetSeconds = 0) {
      if (disposed || seen.has(event.id)) return; seen.add(event.id);
      const screen = world.root.getObjectByName(`${event.theaterId}-screen`); if (!screen) return;
      if (playing.has(event.theaterId)) release(playing.get(event.theaterId));
      const video = makeVideo(); video.src = `${baseUrl}media/hula-start.mp4`;
      video.muted = true; video.playsInline = true; video.preload = "auto";
      video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
      if (offsetSeconds > 0) video.addEventListener("loadedmetadata", () => { video.currentTime = Math.min(offsetSeconds, HULA_DURATION - .02); }, { once: true });
      const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
      const fit = AUDITORIUM_SCREEN_SPEC.aspect / HULA_ASPECT;
      material.onBeforeCompile = shader => {
        const chunk = THREE.ShaderChunk.map_fragment.replaceAll("vMapUv", "clipUv");
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
          `vec2 clipUv=vec2(vMapUv.x,(vMapUv.y-0.5)/${fit.toFixed(8)}+0.5);\n${chunk}\nif(clipUv.y<0.0||clipUv.y>1.0)diffuseColor.rgb=vec3(0.0);`);
      };
      material.customProgramCacheKey = () => "hula-letterbox-v23";
      const item = { id: event.theaterId, screen, video, texture, material, original: screen.material, pending: false, source: null };
      playing.set(item.id, item); screen.material = material;
      video.addEventListener("ended", () => release(item), { once: true });
      video.addEventListener("error", () => { onError(new Error("Trailer video could not load.")); release(item); }, { once: true });
      prepare(); playVideo(item);
    },
    update(_delta, isActive) {
      active = Boolean(isActive); if (disposed) return;
      if (active && playing.size) prepare();
      const context = audio.context;
      if (context) {
        camera.getWorldDirection(direction); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        const l = context.listener;
        if (l.positionX) {
          for (const [key, value] of Object.entries({ positionX: camera.position.x, positionY: camera.position.y, positionZ: camera.position.z,
            forwardX: direction.x, forwardY: direction.y, forwardZ: direction.z, upX: up.x, upY: up.y, upZ: up.z })) l[key].value = value;
        } else { l.setPosition(...camera.position.toArray()); l.setOrientation(...direction.toArray(), ...up.toArray()); }
      }
      for (const item of [...playing.values()]) {
        if (!active) { item.video.pause(); stopSound(item); continue; }
        if (item.video.paused) playVideo(item);
        // Buffering or mobile suspension must not let audio run ahead of picture.
        if (item.source && (item.video.readyState < 3 || Math.abs(item.video.currentTime - item.soundOffset - (context.currentTime - item.soundStarted)) > .3)) stopSound(item);
        ensureSound(item);
        if (!item.panner) continue;
        const room = AUDITORIUMS.find(r => r.id === item.id), door = getDoor(item.id);
        const sound = auditoriumAcoustics(room, camera.position, item.screen.position, door);
        item.panner.setPosition(...sound.position);
        item.gain.gain.setTargetAtTime(sound.gain, context.currentTime, .12);
        item.filter.frequency.setTargetAtTime(sound.cutoff, context.currentTime, .12);
      }
    },
    isPlaying(id) { return playing.has(id); },
    getSnapshot() { return { audioReady: Boolean(buffer), active, playing: [...playing.values()].map(i => ({ theaterId: i.id, time: i.video.currentTime, paused: i.video.paused, audio: Boolean(i.source), failed: Boolean(i.failed) })) }; },
    dispose() { disposed = true; [...playing.values()].forEach(release); },
  };
}
