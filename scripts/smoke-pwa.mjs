import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { Window } from "happy-dom";
import { theaterPwa, FEATURE_FILM_PATHS, FEATURE_FILM_CACHE } from "./pwa-build.js";
import { setupInstallApp } from "../src/install-app.js";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url)));
assert.equal(manifest.display, "standalone"); assert.equal(manifest.scope, "./"); assert.equal(manifest.start_url, "./");
assert.equal(manifest.id, "./");
for (const icon of manifest.icons) {
  const data = readFileSync(new URL(`../public/${icon.src}`, import.meta.url));
  assert.equal(data.subarray(1, 4).toString(), "PNG");
  const [w, h] = icon.sizes.split("x").map(Number);
  assert.equal(data.readUInt32BE(16), w); assert.equal(data.readUInt32BE(20), h);
}
assert.ok(existsSync(new URL("../public/icons/apple-touch-icon.png", import.meta.url)));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(html.includes('name="apple-mobile-web-app-capable" content="yes"'));
assert.ok(html.includes('rel="manifest" href="./manifest.webmanifest"'));
assert.ok(html.includes("Add to Home Screen"));

const build = (body = "<html>app one</html>") => {
  let asset;
  assert.equal(theaterPwa().enforce, "post", "Offline cache hook runs after Vite emits HTML");
  theaterPwa().generateBundle.call({ emitFile(value) { asset = value; } }, {}, {
    "index.html": { type: "asset", source: body },
    "assets/app-a1.js": { type: "chunk", code: "window.appReady=true" },
    "assets/app-b2.css": { type: "asset", source: "body{margin:0}" },
    "assets/app-a1.js.map": { type: "asset", source: "{}" },
  });
  assert.equal(asset.fileName, "sw.js"); return asset.source;
};
const code = build(), nextCode = build("<html>app two</html>");
assert.throws(() => theaterPwa().generateBundle.call({ emitFile() {} }, {}, {}), /emitted index.html/,
  "A hook-order regression must fail the build rather than silently ship a broken offline app");
const cacheName = source => /const CACHE="([^"]+)"/.exec(source)[1];
assert.notEqual(cacheName(code), cacheName(nextCode), "HTML-only change must invalidate the offline cache");
assert.equal(cacheName(code), cacheName(build()), "Same build produces stable cache version");
if (process.argv.includes("--built")) {
  const shipped = readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8");
  const files = JSON.parse(/FILES=(\[[^\n]+\]);/.exec(shipped)[1]);
  assert.ok(files.includes("index.html"), "Real Vite output must cache its transformed entry HTML");
  for (const file of FEATURE_FILM_PATHS) {
    assert.ok(!files.includes(file), "Large movies are not part of the automatic install download");
    assert.ok(shipped.includes(file) && existsSync(new URL(`../dist/${file}`, import.meta.url)), `Optional movie exists in the build: ${file}`);
  }
  for (const file of files) assert.ok(existsSync(new URL(`../dist/${file}`, import.meta.url)), `Offline cache references a real emitted file: ${file}`);
  const shippedHtml = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  for (const [, asset] of shippedHtml.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g))
    assert.ok(files.includes(asset), `Transformed entry dependency is cached: ${asset}`);
}

const scope = "https://example.github.io/theater-simulator/";
const listeners = new Map(), stores = new Map(), fetched = [], networkRequests = [];
let claimed = 0, skipped = 0, offline = false, failDownload = null, failFilmWrites = false, failFilmOpen = false;
let activeRequests = 0, maxActiveRequests = 0;
const mediaBytes = Uint8Array.from({ length: 32 }, (_, i) => i);
const network = async request => {
  if (offline) throw new Error("offline");
  const url = typeof request === "string" ? request : request.url; fetched.push(url);
  networkRequests.push(request);
  activeRequests++; maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
  await Promise.resolve(); activeRequests--;
  if (url.endsWith(failDownload ?? "no-failure")) return new Response(null, { status: 503 });
  if (typeof request !== "string" && request.headers.has("Range")) return new Response(mediaBytes.slice(0, 2), {
    status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-1/32" },
  });
  return new Response(url.endsWith(".mp4") || url.endsWith(".m4a") ? mediaBytes : `cached:${url}`, {
    headers: { "Content-Type": url.endsWith(".m4a") ? "audio/mp4" : url.endsWith(".mp4") ? "video/mp4" : "text/plain" },
  });
};
const caches = {
  async open(name) {
    if (name === FEATURE_FILM_CACHE && failFilmOpen) throw new Error("Movie cache unavailable");
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return { async addAll(urls) { for (const url of urls) map.set(url, await network(url)); },
      async put(key, response) { if (name === FEATURE_FILM_CACHE && failFilmWrites) throw new Error("QuotaExceededError"); map.set(typeof key === "string" ? key : key.url, response.clone()); },
      async match(key) { return map.get(typeof key === "string" ? key : key.url)?.clone(); } };
  },
  async keys() { return [...stores.keys()]; },
  async delete(key) { return stores.delete(key); },
};
const self = { registration: { scope }, clients: { async claim() { claimed++; } },
  skipWaiting() { skipped++; }, addEventListener(name, callback) { listeners.set(name, callback); } };
vm.runInNewContext(code, { self, caches, fetch: network, URL, Response });
let pending;
listeners.get("install")({ waitUntil(promise) { pending = promise; } }); await pending;
assert.equal(skipped, 0, "Installation cannot interrupt a running shift without user action");
for (const path of ["index.html", "manifest.webmanifest", "models/theater-props.glb", "models/theater-npcs.glb", "models/mililani-ticket-kiosk.glb", "media/hula-start.mp4", "media/hula-start.m4a"])
  assert.ok(fetched.includes(scope + path), `${path} is available offline after installation`);
for (const path of FEATURE_FILM_PATHS) assert.ok(!fetched.includes(scope + path), `${path} is never fetched during core installation`);
assert.ok(!fetched.some(url => url.endsWith(".map")));
assert.ok(fetched.every(url => url.startsWith(scope)), "All cache paths honor the GitHub Pages subdirectory");

const get = async (path, range, mode = "cors", method = "GET") => {
  let result; const background = [];
  listeners.get("fetch")({ request: { url: path.startsWith("http") ? path : scope + path, method, mode,
    headers: new Headers(range ? { Range: range } : {}) }, respondWith(promise) { result = promise; }, waitUntil(promise) { background.push(promise); } });
  const response = result ? await result : undefined; await Promise.all(background); return response;
};
offline = true;
assert.ok((await (await get("?launch=home", null, "navigate")).text()).includes("index.html"), "Offline home-screen navigation resolves to cached app shell");
assert.ok((await (await get("assets/app-a1.js?refresh=1")).text()).includes("app-a1.js"), "Cache-busting query does not break the immutable cached resource");
for (const [range, start, end] of [["bytes=4-9", 4, 9], ["bytes=28-", 28, 31], ["bytes=-5", 27, 31], ["bytes=30-100", 30, 31], ["bytes=0-0", 0, 0]]) {
  const response = await get("media/hula-start.mp4", range);
  assert.equal(response.status, 206); assert.equal(response.headers.get("Content-Range"), `bytes ${start}-${end}/32`);
  assert.equal(response.headers.get("Content-Length"), String(end - start + 1));
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), mediaBytes.slice(start, end + 1), `Correct Safari media range ${range}`);
}
const audioRange = await get("media/hula-start.m4a", "bytes=0-3");
assert.equal(audioRange.headers.get("Content-Type"), "audio/mp4");
for (const range of ["bytes=32-", "bytes=10-2", "bytes=-0"]) {
  const response = await get("media/hula-start.mp4", range);
  assert.equal(response.status, 416); assert.equal(response.headers.get("Content-Range"), "bytes */32");
}
assert.equal((await get("media/hula-start.mp4")).status, 200, "Range request did not consume or damage complete cached response");
assert.equal(await get("https://example.github.io/another-project/"), undefined);
assert.equal(await get("index.html", null, "cors", "POST"), undefined);
offline = false; await get("new-uncached-resource.json"); assert.ok(fetched.at(-1).endsWith("new-uncached-resource.json"));
const rangeBefore = fetched.length;
assert.equal((await get(FEATURE_FILM_PATHS[0], "bytes=0-1")).status, 206);
assert.equal(fetched.length - rangeBefore, 1, "A movie range request performs one streaming request, not a background full download");
assert.equal(networkRequests.at(-1).headers.get("Range"), "bytes=0-1", "Safari's network Range header passes through unchanged");
assert.equal(stores.get(FEATURE_FILM_CACHE).size, 0, "Partial movie responses cannot pollute the full film cache");
await get(FEATURE_FILM_PATHS[0]);
assert.ok(stores.get(FEATURE_FILM_CACHE).has(scope + FEATURE_FILM_PATHS[0]), "A successful full movie response may be saved opportunistically");
const progress = [], movieClient = { postMessage(data) { progress.push(data); } };
const message = async type => { let work; listeners.get("message")({ data: { type }, source: movieClient, waitUntil(p) { work = p; } }); await work; };
await message("CACHE_MOVIES_STATUS"); assert.equal(progress.at(-1).completed, 1);
failDownload = FEATURE_FILM_PATHS[2]; await message("CACHE_MOVIES");
assert.equal(progress.at(-1).state, "error"); assert.equal(progress.at(-1).completed, 2, "Failed optional movie retains previous completed downloads");
assert.equal((await get("index.html")).status, 200, "Optional download failure cannot break the app shell");
failDownload = null; const retryStart = fetched.length; maxActiveRequests = 0; await message("CACHE_MOVIES");
assert.equal(progress.at(-1).state, "complete"); assert.equal(progress.at(-1).completed, FEATURE_FILM_PATHS.length);
assert.equal(fetched.length - retryStart, 2, "Retry only downloads the missing movies");
assert.equal(maxActiveRequests, 1, "Optional movie downloads run one at a time instead of saturating all network slots");
assert.ok(progress.some(p => p.state === "downloading" && p.completed === 3), "Explicit downloads report per-movie progress");
assert.ok(!code.includes("cached.arrayBuffer()"), "Offline ranges slice a Blob rather than copying the complete movie into a JS ArrayBuffer");
offline = true;
for (const path of FEATURE_FILM_PATHS) {
  const response = await get(path, "bytes=4-9");
  assert.equal(response.status, 206); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), mediaBytes.slice(4, 10));
}
assert.equal((await get(FEATURE_FILM_PATHS[1], "bytes=32-")).status, 416);
offline = false;
stores.set("mililani-obsolete", new Map()); stores.set("other-app-cache", new Map());
listeners.get("message")({ data: { type: "ACTIVATE_UPDATE" } }); assert.equal(skipped, 1);
listeners.get("activate")({ waitUntil(promise) { pending = promise; } }); await pending;
assert.equal(claimed, 1); assert.ok(!stores.has("mililani-obsolete"));
assert.ok(stores.has("other-app-cache") && stores.has(cacheName(code)), "Updates remove only obsolete caches belonging to this app");
// Upgrade to a distinct app shell while preserving the stable optional cache.
vm.runInNewContext(nextCode, { self, caches, fetch: network, URL, Response });
const beforeUpgrade = fetched.length;
listeners.get("install")({ waitUntil(promise) { pending = promise; } }); await pending;
assert.ok(!fetched.slice(beforeUpgrade).some(url => FEATURE_FILM_PATHS.some(path => url.endsWith(path))), "Updates also avoid downloading movies");
listeners.get("activate")({ waitUntil(promise) { pending = promise; } }); await pending;
assert.ok(stores.has(FEATURE_FILM_CACHE)); assert.equal(stores.get(FEATURE_FILM_CACHE).size, 4);
assert.ok(!stores.has(cacheName(code)) && stores.has(cacheName(nextCode)), "New shell replaces old shell without deleting movie downloads");
// Disk quota failure affects the optional download only, including activation
// with a legacy movie to migrate from an obsolete app cache.
stores.get(FEATURE_FILM_CACHE).delete(scope + FEATURE_FILM_PATHS[0]);
failFilmWrites = true; await message("CACHE_MOVIES"); assert.equal(progress.at(-1).state, "error");
stores.set("mililani-legacy-film", new Map([[scope + FEATURE_FILM_PATHS[0], new Response(mediaBytes)]]));
listeners.get("activate")({ waitUntil(promise) { pending = promise; } }); await pending;
assert.equal(claimed, 3, "Core activation proceeds despite a failed optional legacy movie copy");
assert.equal((await get("index.html")).status, 200);
failFilmWrites = false; await message("CACHE_MOVIES"); assert.equal(progress.at(-1).state, "complete");
failFilmOpen = true; await message("CACHE_MOVIES_STATUS"); assert.equal(progress.at(-1).state, "error");
await message("CACHE_MOVIES"); assert.equal(progress.at(-1).state, "error");
listeners.get("activate")({ waitUntil(promise) { pending = promise; } }); await pending;
assert.equal(claimed, 4, "Unavailable optional storage cannot block the core worker from activating");
assert.equal((await get(FEATURE_FILM_PATHS[0], "bytes=0-1")).status, 206, "Streaming playback remains available without optional movie storage");
assert.equal((await get("index.html")).status, 200);
failFilmOpen = false;

const window = new Window({ url: scope });
window.document.body.innerHTML = '<button id="install-button">INSTALL</button><p id="install-help" hidden>Help</p><section id="pause-card"><button id="update-button" hidden>UPDATE</button></section>';
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.matchMedia = () => ({ matches: false });
let reloads = 0, registrations = 0, updateChecks = 0, activateMessages = 0;
const clientMessages = [];
globalThis.location = { reload() { reloads++; } };
const registration = new EventTarget(), workerApi = new EventTarget();
registration.installing = new EventTarget(); registration.waiting = null;
registration.active = { postMessage(data) { clientMessages.push(data.type); } };
registration.update = async () => { updateChecks++; };
workerApi.register = async (path, options) => {
  registrations++; assert.equal(path, "/theater-simulator/sw.js"); assert.equal(options.updateViaCache, "none"); return registration;
};
Object.defineProperty(navigator, "serviceWorker", { value: workerApi });
const oldNow = Date.now; let now = oldNow(); Date.now = () => now;
setupInstallApp({ production: true, baseUrl: "/theater-simulator/" }); await new Promise(resolve => setImmediate(resolve));
assert.equal(registrations, 1);
assert.ok(document.querySelector("#pause-card #offline-movies-button"), "Optional movie saving remains available in the installed app's pause card");
assert.ok(document.querySelector("#offline-movies-button").textContent.includes("88 MB"));
assert.deepEqual(clientMessages, ["CACHE_MOVIES_STATUS"], "Opening the app only queries movie status; it never starts a download");
document.querySelector("#offline-movies-button").click(); assert.equal(clientMessages.at(-1), "CACHE_MOVIES");
assert.equal(document.querySelector("#offline-movies-button").disabled, true);
const movieEvent = data => workerApi.dispatchEvent(new MessageEvent("message", { data: { type: "MOVIES_CACHE_STATUS", ...data } }));
movieEvent({ state: "downloading", completed: 1, total: 4 });
assert.ok(document.querySelector("#offline-movies-status").textContent.includes("resume your shift"));
movieEvent({ state: "error", completed: 2, total: 4 });
assert.equal(document.querySelector("#offline-movies-button").disabled, false);
assert.ok(document.querySelector("#offline-movies-button").textContent.includes("RETRY"));
document.querySelector("#offline-movies-button").click(); assert.equal(clientMessages.filter(x => x === "CACHE_MOVIES").length, 2);
movieEvent({ state: "complete", completed: 4, total: 4 });
assert.equal(document.querySelector("#offline-movies-button").disabled, true);
assert.ok(document.querySelector("#offline-movies-status").textContent.includes("updates keep"));
// A terminated background worker forgets its active Promise but retains
// completed files. Returning must query it even if this page still believes
// the download is running, independently of the 60-second update throttle.
movieEvent({ state: "downloading", completed: 2, total: 4 });
const beforeReturn = clientMessages.length;
window.dispatchEvent(new window.Event("focus"));
assert.equal(clientMessages.length, beforeReturn + 1);
assert.equal(clientMessages.at(-1), "CACHE_MOVIES_STATUS", "Foreground return reconciles a potentially stale active download");
assert.equal(updateChecks, 0, "Movie status recovery does not force an app update check");
assert.equal(document.querySelector("#offline-movies-button").disabled, true, "An active transfer stays disabled until the worker replies");
movieEvent({ state: "ready", completed: 2, total: 4 });
assert.equal(document.querySelector("#offline-movies-button").disabled, false, "Interrupted background download becomes retryable");
assert.ok(document.querySelector("#offline-movies-status").textContent.includes("2 / 4 saved"));
document.querySelector("#offline-movies-button").click();
assert.equal(clientMessages.filter(x => x === "CACHE_MOVIES").length, 3, "Resume explicitly downloads only the remaining files");
movieEvent({ state: "complete", completed: 4, total: 4 });
document.querySelector("#install-button").click(); assert.equal(document.querySelector("#install-help").hidden, false);
workerApi.dispatchEvent(new Event("controllerchange")); assert.equal(reloads, 0, "First installation never reloads the running game");
registration.waiting = { postMessage(data) { if (data.type === "ACTIVATE_UPDATE") activateMessages++; else assert.equal(data.type, "CACHE_MOVIES_STATUS"); } };
registration.dispatchEvent(new Event("updatefound")); registration.installing.dispatchEvent(new Event("statechange"));
assert.equal(document.querySelector("#update-button").hidden, false);
document.querySelector("#update-button").click(); assert.equal(activateMessages, 1);
workerApi.dispatchEvent(new Event("controllerchange")); workerApi.dispatchEvent(new Event("controllerchange"));
assert.equal(reloads, 1, "Approved update reloads exactly once");
now += 60_001; window.dispatchEvent(new window.Event("focus"));
window.dispatchEvent(new window.Event("focus")); assert.equal(updateChecks, 1, "Returning to the app checks for updates without repeated requests");
Date.now = oldNow; await window.happyDOM.close();
console.log("PWA valid: core/model/Hula offline cache without movie startup downloads, streaming Range passthrough, optional sequential movie downloads/progress/retry, persistent movie cache across upgrades, quota-safe activation, Blob-sliced Safari 206/416 ranges and pause-card controls.");
