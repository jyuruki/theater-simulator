import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { Window } from "happy-dom";
import { theaterPwa } from "./pwa-build.js";
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
  assert.ok(files.includes("media/big-buck-bunny.mp4"), "The full feature program is available offline");
  for (const file of files) assert.ok(existsSync(new URL(`../dist/${file}`, import.meta.url)), `Offline cache references a real emitted file: ${file}`);
  const shippedHtml = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  for (const [, asset] of shippedHtml.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g))
    assert.ok(files.includes(asset), `Transformed entry dependency is cached: ${asset}`);
}

const scope = "https://example.github.io/theater-simulator/";
const listeners = new Map(), stores = new Map(), fetched = [];
let claimed = 0, skipped = 0, offline = false;
const mediaBytes = Uint8Array.from({ length: 32 }, (_, i) => i);
const network = async request => {
  if (offline) throw new Error("offline");
  const url = typeof request === "string" ? request : request.url; fetched.push(url);
  return new Response(url.endsWith(".mp4") || url.endsWith(".m4a") ? mediaBytes : `cached:${url}`, {
    headers: { "Content-Type": url.endsWith(".m4a") ? "audio/mp4" : url.endsWith(".mp4") ? "video/mp4" : "text/plain" },
  });
};
const caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return { async addAll(urls) { for (const url of urls) map.set(url, await network(url)); },
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
for (const path of ["index.html", "manifest.webmanifest", "models/theater-props.glb", "models/theater-npcs.glb", "models/mililani-ticket-kiosk.glb", "media/hula-start.mp4", "media/hula-start.m4a", "media/big-buck-bunny.mp4"])
  assert.ok(fetched.includes(scope + path), `${path} is available offline after installation`);
assert.ok(!fetched.some(url => url.endsWith(".map")));
assert.ok(fetched.every(url => url.startsWith(scope)), "All cache paths honor the GitHub Pages subdirectory");

const get = async (path, range, mode = "cors", method = "GET") => {
  let result;
  listeners.get("fetch")({ request: { url: path.startsWith("http") ? path : scope + path, method, mode,
    headers: new Headers(range ? { Range: range } : {}) }, respondWith(promise) { result = promise; } });
  return result ? await result : undefined;
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
stores.set("mililani-obsolete", new Map()); stores.set("other-app-cache", new Map());
listeners.get("message")({ data: { type: "ACTIVATE_UPDATE" } }); assert.equal(skipped, 1);
listeners.get("activate")({ waitUntil(promise) { pending = promise; } }); await pending;
assert.equal(claimed, 1); assert.ok(!stores.has("mililani-obsolete"));
assert.ok(stores.has("other-app-cache") && stores.has(cacheName(code)), "Updates remove only obsolete caches belonging to this app");

const window = new Window({ url: scope });
window.document.body.innerHTML = '<button id="install-button">INSTALL</button><p id="install-help" hidden>Help</p><button id="update-button" hidden>UPDATE</button>';
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.matchMedia = () => ({ matches: false });
let reloads = 0, registrations = 0, updateChecks = 0, activateMessages = 0;
globalThis.location = { reload() { reloads++; } };
const registration = new EventTarget(), workerApi = new EventTarget();
registration.installing = new EventTarget(); registration.waiting = null;
registration.update = async () => { updateChecks++; };
workerApi.register = async (path, options) => {
  registrations++; assert.equal(path, "/theater-simulator/sw.js"); assert.equal(options.updateViaCache, "none"); return registration;
};
Object.defineProperty(navigator, "serviceWorker", { value: workerApi });
const oldNow = Date.now; let now = oldNow(); Date.now = () => now;
setupInstallApp({ production: true, baseUrl: "/theater-simulator/" }); await new Promise(resolve => setImmediate(resolve));
assert.equal(registrations, 1);
document.querySelector("#install-button").click(); assert.equal(document.querySelector("#install-help").hidden, false);
workerApi.dispatchEvent(new Event("controllerchange")); assert.equal(reloads, 0, "First installation never reloads the running game");
registration.waiting = { postMessage(data) { assert.equal(data.type, "ACTIVATE_UPDATE"); activateMessages++; } };
registration.dispatchEvent(new Event("updatefound")); registration.installing.dispatchEvent(new Event("statechange"));
assert.equal(document.querySelector("#update-button").hidden, false);
document.querySelector("#update-button").click(); assert.equal(activateMessages, 1);
workerApi.dispatchEvent(new Event("controllerchange")); workerApi.dispatchEvent(new Event("controllerchange"));
assert.equal(reloads, 1, "Approved update reloads exactly once");
now += 60_001; window.dispatchEvent(new window.Event("focus"));
window.dispatchEvent(new window.Event("focus")); assert.equal(updateChecks, 1, "Returning to the app checks for updates without repeated requests");
Date.now = oldNow; await window.happyDOM.close();
console.log("PWA valid: relative standalone manifest/icons, complete app/model/trailer offline cache, HTML-sensitive build version, Safari byte ranges including suffix/416, scoped fetches/cache cleanup and explicit update activation with foreground refresh.");
