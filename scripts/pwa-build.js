import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// These large optional programs must never delay installing/updating the app.
// Keep the film cache independent of the app-shell hash across releases.
export const FEATURE_FILM_PATHS = Object.freeze([
  "media/big-buck-bunny.mp4", "media/sintel.mp4", "media/tears-of-steel.mp4", "media/caminandes-gran-dillama.mp4",
]);
export const FEATURE_FILM_CACHE = "mililani-feature-movies-v1";

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
    const files = [...shell, ...publicFiles.map(p => p.replaceAll("\\", "/")).filter(p => !FEATURE_FILM_PATHS.includes(p))];
    const code = `const CACHE=${JSON.stringify(cache)}, FILES=${JSON.stringify(files)};
const FILM_CACHE=${JSON.stringify(FEATURE_FILM_CACHE)}, FILMS=${JSON.stringify(FEATURE_FILM_PATHS)};
const url=p=>new URL(p,self.registration.scope).href;
const filmUrls=new Set(FILMS.map(url)), movieListeners=new Set();
let movieDownload=null, movieProgress=null;
const send=(client,data)=>{try{client?.postMessage(data);}catch{}};
const publish=data=>{movieProgress={type:'MOVIES_CACHE_STATUS',...data};for(const client of movieListeners)send(client,movieProgress);};
async function movieStatus(client){
 if(movieDownload){movieListeners.add(client);send(client,movieProgress);return;}
 let completed=0;
 try{
  const cache=await caches.open(FILM_CACHE);
  for(const path of FILMS)if(await cache.match(url(path)))completed++;
  send(client,{type:'MOVIES_CACHE_STATUS',state:completed===FILMS.length?'complete':'ready',completed,total:FILMS.length});
 }catch{send(client,{type:'MOVIES_CACHE_STATUS',state:'error',completed,total:FILMS.length});}
}
function cacheMovies(client){
 if(client)movieListeners.add(client);
 if(movieDownload){send(client,movieProgress);return movieDownload;}
 movieDownload=(async()=>{
  let completed=0;
  try{
   const cache=await caches.open(FILM_CACHE);
   for(const path of FILMS)if(await cache.match(url(path)))completed++;
   publish({state:'downloading',completed,total:FILMS.length});
   for(const path of FILMS){
    if(await cache.match(url(path)))continue;
    const response=await fetch(url(path),{cache:'reload'});
    if(!response.ok||response.status!==200)throw new Error('Movie download failed. Check your connection and try again.');
    await cache.put(url(path),response);completed++;
    publish({state:'downloading',completed,total:FILMS.length});
   }
   publish({state:'complete',completed,total:FILMS.length});
  }catch(error){publish({state:'error',completed,total:FILMS.length,error:'Download paused. Check your connection and free storage, then retry.'});}
 })().finally(()=>{movieDownload=null;movieListeners.clear();});
 return movieDownload;
}
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(url)))));
self.addEventListener('message',e=>{
 if(e.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();
 if(e.data?.type==='CACHE_MOVIES')e.waitUntil(cacheMovies(e.source));
 if(e.data?.type==='CACHE_MOVIES_STATUS')e.waitUntil(movieStatus(e.source));
});
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const films=await caches.open(FILM_CACHE).catch(()=>null);
 for(const key of await caches.keys())if(key.startsWith('mililani-')&&key!==CACHE&&key!==FILM_CACHE){
  // Preserve films already downloaded by an older all-in-one app cache.
  const old=await caches.open(key);
  if(films)for(const path of FILMS)if(!await films.match(url(path))){const response=await old.match(url(path));if(response)try{await films.put(url(path),response);}catch{}}
  await caches.delete(key);
 }
 await self.clients.claim();
})()));
async function cachedResponse(cached,request){
 const range=request.headers.get('Range');
 if(!range)return cached;
 const match=/^bytes=(\\d*)-(\\d*)$/.exec(range);
 if(!match||(!match[1]&&!match[2]))return fetch(request);
 const bytes=await cached.blob(), size=bytes.size;
 const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
 const end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
 return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':cached.headers.get('Content-Type')||'video/mp4','Content-Range':'bytes '+start+'-'+end+'/'+size,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
 e.respondWith((async()=>{
  const requestUrl=new URL(e.request.url);
  const key=e.request.mode==='navigate'?url('index.html'):requestUrl.origin+requestUrl.pathname;
  const film=filmUrls.has(key), c=film?await caches.open(FILM_CACHE).catch(()=>null):await caches.open(CACHE);
  const cached=await c?.match(key);
  if(cached)return cachedResponse(cached,e.request);
  // Network ranges stream directly: never turn a tiny initial Safari probe
  // into a full-movie download. Full responses may be saved opportunistically.
  const response=await fetch(e.request);
  if(film&&c&&!e.request.headers.has('Range')&&response.ok&&response.status===200)
   e.waitUntil(c.put(key,response.clone()).catch(()=>{}));
  return response;
 })());
});`;
    this.emitFile({ type: "asset", fileName: "sw.js", source: code });
  } };
}
