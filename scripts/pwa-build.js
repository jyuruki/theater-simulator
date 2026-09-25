import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export function theaterPwa() {
  // Vite's build-html hook emits index.html after normal user plugins. Run
  // after that hook so the actual transformed document is cached and hashed.
  return { name: "theater-offline-build", apply: "build", enforce: "post", generateBundle(_options, bundle) {
    if (!bundle["index.html"]) throw new Error("Offline build requires Vite's emitted index.html before generating its cache.");
    const publicFiles = readdirSync("public", { recursive: true }).filter(p => /\.(png|glb|mp4|m4a|webmanifest)$/.test(p)).sort();
    const shell = Object.keys(bundle).filter(p => !p.endsWith(".map")).sort();
    const hash = createHash("sha256");
    for (const file of shell) { hash.update(file); hash.update(bundle[file].code ?? bundle[file].source); }
    for (const file of publicFiles) { hash.update(file.replaceAll("\\", "/")); hash.update(readFileSync(join("public", file))); }
    const cache = `mililani-${hash.digest("hex").slice(0, 16)}`;
    const files = [...shell, ...publicFiles.map(p => p.replaceAll("\\", "/"))];
    const code = `const CACHE=${JSON.stringify(cache)}, FILES=${JSON.stringify(files)};
const url=p=>new URL(p,self.registration.scope).href;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(url)))));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('mililani-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
 e.respondWith((async()=>{
  const c=await caches.open(CACHE), requestUrl=new URL(e.request.url);
  const key=e.request.mode==='navigate'?url('index.html'):requestUrl.origin+requestUrl.pathname;
  const cached=await c.match(key);
  if(!cached)return fetch(e.request);
  const range=e.request.headers.get('Range');
  if(!range)return cached;
  const bytes=await cached.arrayBuffer(), match=/^bytes=(\\d*)-(\\d*)$/.exec(range);
  if(!match)return fetch(e.request);
  let start=match[1]?Number(match[1]):Math.max(0,bytes.byteLength-Number(match[2]));
  let end=match[1]&&match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;
  if(start>end||start>=bytes.byteLength)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.byteLength}});
  return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':cached.headers.get('Content-Type')||'video/mp4','Content-Range':'bytes '+start+'-'+end+'/'+bytes.byteLength,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
 })());
});`;
    this.emitFile({ type: "asset", fileName: "sw.js", source: code });
  } };
}
