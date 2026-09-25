import * as THREE from "three";
import { AUDITORIUMS } from "./layout-data.js";
import { auditoriumDoorLayout } from "./auditorium-door-layout.js";
import { auditoriumAcoustics, auditoriumInteriorContains } from "./auditorium-acoustics.js";
import { AUDITORIUM_SCREEN_SPEC } from "./layout-geometry.js";
import { SHIFT_TIME_SCALE } from "./usher-schedule.js";
import { SHOWS } from "./showtimes.js";
import { HULA_DURATION } from "./show-start-media.js";

export const FEATURE_DURATION = 596.46;
export function featurePhase(events, room, minute) {
  const roomEvents = events.filter(e => e.theaterId === room.id);
  if (!roomEvents.length || !Number.isFinite(minute)) return null;
  const latest = roomEvents.filter(e => e.time <= minute).at(-1);
  if (latest?.kind === "break") return null;
  const seconds = latest ? (minute - latest.time) * 60 / SHIFT_TIME_SCALE - HULA_DURATION
    : (minute - (roomEvents[0].time - SHOWS[room.number - 1].minutes)) * 60 / SHIFT_TIME_SCALE;
  return seconds < 0 ? null : { offset: seconds % FEATURE_DURATION, show: latest?.id ?? `${room.id}-initial` };
}

/** Two nearby decoders at most; complete movie clocks continue logically in
 * other auditoriums. Video audio uses a streaming element, never a 10-minute
 * decoded PCM buffer. The original film and credits are preserved. */
export function createFeatureProgram({ world, camera, audio, schedule, getDoor = () => null, trailer,
  baseUrl = import.meta.env?.BASE_URL ?? "./", makeVideo = () => document.createElement("video"), onError = () => {} }) {
  const items = new Map(), blocked = new Map(); let disposed = false, active = false, scan = 0;
  function showFrame(item) {
    if (!disposed && items.get(item.room.id) === item && item.video.readyState >= 2
      && item.screen.material === item.original) item.screen.material = item.material;
  }
  function release(id) {
    const item = items.get(id); if (!item) return;
    if (item.screen.material === item.material) item.screen.material = item.original;
    item.video.pause(); item.video.removeAttribute("src"); item.video.load();
    item.source?.disconnect(); item.panner?.disconnect(); item.gain?.disconnect(); item.filter?.disconnect();
    item.material.dispose(); item.texture.dispose(); items.delete(id);
  }
  function play(item) {
    if (item.pending || !active || item.failed) return;
    item.pending = true;
    Promise.resolve(item.video.play()).then(() => { item.pending = false; if (!active || disposed || items.get(item.room.id) !== item) item.video.pause(); })
      .catch(() => { item.pending = false; item.failed = true; });
  }
  function ensureAudio(item) {
    if (item.source || !audio.context?.createMediaElementSource) return;
    const context = audio.context;
    item.source = context.createMediaElementSource(item.video);
    item.panner = context.createPanner(); item.panner.panningModel = "HRTF"; item.panner.rolloffFactor = 0;
    item.filter = context.createBiquadFilter(); item.filter.type = "lowpass";
    item.gain = context.createGain(); item.gain.gain.value = 0;
    item.source.connect(item.panner); item.panner.connect(item.filter); item.filter.connect(item.gain); item.gain.connect(audio.output);
    item.video.muted = false;
  }
  function create(room, phase) {
    const screen = world.root.getObjectByName(`${room.id}-screen`); if (!screen) return;
    const video = makeVideo(); video.src = `${baseUrl}media/big-buck-bunny.mp4`;
    video.muted = true; video.playsInline = true; video.loop = true; video.preload = "auto";
    video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
    const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    const fit = AUDITORIUM_SCREEN_SPEC.aspect / (854 / 480);
    material.onBeforeCompile = shader => {
      const chunk = THREE.ShaderChunk.map_fragment.replaceAll("vMapUv", "filmUv");
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
        `vec2 filmUv=vec2(vMapUv.x,(vMapUv.y-0.5)/${fit.toFixed(8)}+0.5);\n${chunk}\nif(filmUv.y<0.0||filmUv.y>1.0)diffuseColor.rgb=vec3(0.0);`);
    };
    material.customProgramCacheKey = () => "feature-letterbox-v24";
    const item = { room, video, texture, material, screen, original: screen.material, show: phase.show };
    items.set(room.id, item);
    // A VideoTexture has no usable image while the first frame is decoding.
    // Keep the existing auditorium picture until that frame can be uploaded.
    video.addEventListener("loadeddata", () => showFrame(item));
    video.addEventListener("canplay", () => showFrame(item));
    showFrame(item);
    video.addEventListener("loadedmetadata", () => {
      const current = featurePhase(schedule.events, room, schedule.minute);
      if (items.get(room.id) === item && current?.show === item.show) video.currentTime = current.offset;
    }, { once: true });
    video.addEventListener("error", () => { if (items.get(room.id) !== item) return; blocked.set(room.id, Date.now() + 30000); release(room.id); onError(new Error("Feature movie unavailable")); }, { once: true });
    ensureAudio(item); play(item);
  }
  return {
    suspend: release,
    retry() { blocked.clear(); for (const item of items.values()) { item.failed = false; play(item); } },
    update(delta, isActive) {
      if (disposed) return; active = Boolean(isActive);
      if (!active) { for (const item of items.values()) item.video.pause(); return; }
      scan -= delta;
      if (scan <= 0) {
        scan = .25;
        const candidates = AUDITORIUMS.flatMap(room => {
          const phase = featurePhase(schedule.events, room, schedule.minute);
          if (!phase || trailer?.isPlaying(room.id) || Date.now() < (blocked.get(room.id) ?? 0)) return [];
          const door = auditoriumDoorLayout(room), distance = Math.hypot(camera.position.x - door.x, camera.position.z - door.z);
          const inside = auditoriumInteriorContains(room, camera.position);
          return inside || distance < 12 ? [{ room, phase, score: inside ? -1000 : distance }] : [];
        }).sort((a, b) => a.score - b.score).slice(0, 2);
        for (const [id, item] of items) if (!candidates.some(c => c.room.id === id && c.phase.show === item.show)) release(id);
        for (const candidate of candidates) if (!items.has(candidate.room.id)) create(candidate.room, candidate.phase);
      }
      for (const item of items.values()) {
        showFrame(item);
        ensureAudio(item); if (item.video.paused) play(item);
        if (!item.panner) continue;
        const sound = auditoriumAcoustics(item.room, camera.position, item.screen.position, getDoor(item.room.id));
        item.panner.setPosition(...sound.position); item.gain.gain.setTargetAtTime(sound.gain * .7, audio.context.currentTime, .12);
        item.filter.frequency.setTargetAtTime(sound.cutoff, audio.context.currentTime, .12);
      }
    },
    getSnapshot() { return { active, decoders: items.size, films: [...items.values()].map(i => ({ room: i.room.id, title: "Big Buck Bunny", time: i.video.currentTime, paused: i.video.paused, audio: Boolean(i.source) })) }; },
    dispose() { disposed = true; active = false; [...items.keys()].forEach(release); },
  };
}
