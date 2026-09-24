import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createTheaterWorld } from "./world.js";
import { createMaterialLibrary } from "./materials.js";
import { AABBCollisionWorld } from "./player.js";
import { createTheaterLighting } from "./lighting.js";
import { createUsherShift } from "./usher-shift.js";
import { planToWorldX } from "./coordinates.js";
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector("canvas"),antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x88a4b5);
const pmrem=new THREE.PMREMGenerator(renderer),env=new RoomEnvironment(),envTarget=pmrem.fromScene(env,.04);
scene.environment=envTarget.texture;scene.environmentIntensity=.22;env.dispose();pmrem.dispose();
const lighting=createTheaterLighting({scene}),materials=createMaterialLibrary(renderer),world=createTheaterWorld({scene,materials});
const collisionWorld=new AABBCollisionWorld({bounds:world.worldBounds});collisionWorld.addBoxes(world.colliders);
const camera=new THREE.PerspectiveCamera(67,1,.04,260),controls=new OrbitControls(camera,renderer.domElement);
const status=document.querySelector("#status"),select=document.querySelector("#view");
const shift=createUsherShift({scene,world,camera,collisionWorld,storage:null,seed:22,showToast:message=>{status.textContent=message;}});
let action=false,capturing=false;const views=[];
const add=(id,label,position,target)=>{if(views.some(v=>v.id===id))return;views.push({id,label,position,target});select.add(new Option(label,String(views.length-1)));};
add("cart","Portable cleaning kit",[24.3,1.68,52.8],[24.3,1.1,54.4]);
shift.update(0,{active:true});
function refreshViews(){
 const snap=shift.getSnapshot();
 for(const bin of snap.waste.bins){
  add(bin.id,`Rolling can · ${bin.room}`,[bin.x+1.1,1.68,bin.z+1.1],[bin.x,.68,bin.z]);
 }
 const g=snap.waste.gondola;add("gondola","Trash-room gondola",[20.45,1.68,60.4],[g.x,.8,g.z]);
 for(const anchor of snap.supplies.anchors){
  add(`supply-${anchor.id.replaceAll(":","-")}`,anchor.id,[anchor.stand[0],anchor.stand[1]+1.68,anchor.stand[2]],anchor.position);
 }
 const b=snap.supplies.room;
 add("bib-room","BIB and tray wash room",[planToWorldX((b.xMin+b.xMax)/2),1.68,b.zMin+1.2],[planToWorldX((b.xMin+b.xMax)/2),1.3,b.zMax-1]);
 for(const seat of snap.cleaning.anchors.seats){
  const eye=[seat.stand[0],seat.stand[1]+1.68,seat.stand[2]];
  add(`${seat.id}-tray`,`${seat.theaterId} · used tray ${seat.id.split("-").slice(-2).join("/")}`,eye,seat.tray);
  add(`${seat.id}-seat`,`${seat.theaterId} · cushion`,eye,seat.seat);
 }
 for(const job of snap.cleaning.state.jobs) for(const surface of job.surfaces.filter(s=>s.kind==="floor")){
  add(surface.id,`${job.id} · floor spill`,[surface.x-.85,surface.y+1.68,surface.z],[surface.x,surface.y,surface.z]);
 }
 for(const door of snap.doors) add(`${door.id}-door`,`${door.id} · hall doors`,[door.center[0],1.68,door.center[2]+(door.center[2]<57?1.8:-1.8)],door.handles[0]);
}
refreshViews();
function setView(i){
 const v=views[i];select.value=String(i);controls.mouseButtons.LEFT=v.id.includes("recliner")?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
 camera.position.fromArray(v.position);controls.target.fromArray(v.target);controls.update();lighting.update(camera.position);
 world.update(0,camera.position);shift.update(0,{active:true});renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);
}
select.onchange=()=>{action=false;document.querySelector("#work").textContent="Hold action";setView(+select.value);};
const resize=()=>{const stage=document.querySelector("#stage");camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight,false);};
new ResizeObserver(resize).observe(document.querySelector("#stage"));resize();setView(0);
document.querySelector("#use").onclick=()=>shift.interact();
document.querySelector("#broom").onclick=()=>shift.selectTool("broom");
document.querySelector("#cloth").onclick=()=>shift.selectTool("cloth");
document.querySelector("#stow").onclick=()=>shift.returnTool();
document.querySelector("#sheet").onclick=()=>shift.toggleSheet();
document.querySelector("#work").onclick=e=>{action=!action;e.target.textContent=action?"Release action":"Hold action";};
document.querySelector("#advance").onclick=()=>{for(let i=0;i<960;i++)shift.update(.1,{active:true,action:false});refreshViews();};
async function post(endpoint,body){const r=await fetch(`http://127.0.0.1:5183/${endpoint}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());}
async function shot(name){renderer.render(scene,camera);await post("shot",{name,image:renderer.domElement.toDataURL("image/png")});}
document.querySelector("#shot").onclick=async()=>{try{await shot(`${views[+select.value].id}${shift.sheet.visible?"-sheet":"-active"}`);status.textContent="View captured";}catch(e){status.textContent=String(e);}};
document.querySelector("#capture").onclick=async e=>{e.target.disabled=true;capturing=true;action=false;shift.sheet.hide();try{
 for(let i=0;i<views.length;i++){setView(i);await new Promise(r=>requestAnimationFrame(r));await shot(views[i].id);status.textContent=`Captured ${i+1}/${views.length}`;}
 setView(0);shift.toggleSheet();shift.sheet.update();await shot("handheld-break-sheet");shift.sheet.hide();
 await post("index",{views,snapshot:shift.getSnapshot()});status.textContent=`Capture complete · ${views.length+1} views`;
}catch(error){status.textContent=String(error);}finally{e.target.disabled=false;capturing=false;setView(0);}};
let last=performance.now();renderer.setAnimationLoop(()=>{const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
 if(!capturing)shift.update(dt,{active:true,action});world.update(dt,camera.position);lighting.update(camera.position);renderer.render(scene,camera);
 const s=shift.getSnapshot();document.querySelector("#state").textContent=`${shift.focusedPrompt||shift.hint} · ${s.schedule.minute.toFixed(2)} min · ${renderer.info.render.calls} draw calls · ${s.cleaning.summary.floor} floor / ${s.cleaning.summary.pan} pan`;
});
const loaded=await Promise.all([world.loadKioskAssets({url:"./models/mililani-ticket-kiosk.glb"}),world.loadPropAssets({url:"./models/theater-props.glb"})]);
renderer.shadowMap.needsUpdate=true;status.textContent=`Assets ${loaded.every(Boolean)?"ready":"CHECK FALLBACK"}`;
