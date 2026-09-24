import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createTheaterWorld } from "./world.js";
import { createMaterialLibrary } from "./materials.js";
import { createTheaterCrowd } from "./atmosphere.js";
import { AABBCollisionWorld } from "./player.js";
import { AUDITORIUMS, HALL_PLAN, TICKET_APPROACH_PLAN } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";
import { createTheaterLighting } from "./lighting.js";
import { createUsherGameplay } from "./usher-gameplay.js";
const renderer = new THREE.WebGLRenderer({canvas:document.querySelector("canvas"),antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x88a4b5);
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment(),environmentTarget=pmrem.fromScene(environment,.04);
scene.environment=environmentTarget.texture;scene.environmentIntensity=.22;environment.dispose();pmrem.dispose();
const lighting=createTheaterLighting({scene});
const materials=createMaterialLibrary(renderer),world=createTheaterWorld({scene,materials});
const collisions=new AABBCollisionWorld({bounds:world.worldBounds});collisions.addBoxes(world.colliders);
const crowd=createTheaterCrowd({scene,collisionWorld:collisions,world});
const camera=new THREE.PerspectiveCamera(67,1,.04,260),controls=new OrbitControls(camera,renderer.domElement);
const usher=createUsherGameplay({scene,world,camera,collisionWorld:collisions});
let toolAction=false;
const plan=(x,y,z)=>[planToWorldX(x),y,z],views=[];
const add=(id,label,position,target,caption="")=>views.push({id,label,position,target,caption});
add("lobby","Lobby and concessions",plan(1,1.68,7),plan(-10,1.4,11));
add("facade-glass","Tall lobby glazing",plan(1,1.68,11),plan(1,5.8,-2.5),"Transparent upper storefront from the door heads to the lobby roof");
add("office-jamb","Office / storefront join",plan(-14.8,1.68,1.2),plan(-16.2,2.3,-2.3),"Closed return between the office wall and storefront");
add("kitchen-roof","Kitchen service ceiling",plan(-18.5,1.68,9),plan(-18.5,4.6,11.4),"Continuous low ceiling over the full service strip");
add("box-office-join","Continuous box-office counter",plan(5.4,1.68,3),plan(10.5,1.1,5),"One joined L-shaped countertop without overlapping corner faces");
add("front-service-gap","Counter service gate",plan(-13.8,1.68,1.5),plan(-14.5,1.1,4.4),"Narrow two-leaf service opening at the end of the counter");
add("t3-storage-entry","Theater 3 storage entrance",plan(-8.6,1.68,70.1),plan(-10.4,3.2,70.1),"Full-height anteroom header; low inner storage retained behind its doors");
add("t3-anteroom","Theater 3 full-height anteroom",plan(-11.3,1.68,70),plan(-18.2,3.8,70.1));
add("t6-entry-hall","Theater 6 raised entrance ceiling",plan(25.3,1.68,66.9),plan(35,3,66.9),"Entrance passage ceiling raised by 50% to 3.48 m");
add("usher-station","Usher · shift sheet",[24.3,1.68,52.8],[24.3,1.48,54.415]);
add("usher-broom","Usher · broom and dustpan",[23.6,1.68,53.25],[23.87,1.16,54.56]);
add("usher-popcorn-left","Usher · first popcorn patch",[24.95,1.68,51.4],[24.95,0,52.18]);
add("usher-popcorn-right","Usher · second popcorn patch",[27.1,1.68,51.4],[27.1,0,52.18]);
add("usher-bin","Usher · empty dustpan",[20.9,1.68,54.135],[20.106,1.01,53.32]);
add("usher-cloth","Usher · take cloth",[24.8,1.68,53.25],[24.72,.86,54.58]);
add("usher-spill-left","Usher · first spill",[23.75,1.68,51.22],[23.75,0,52.04]);
add("usher-spill-right","Usher · second spill",[27.65,1.68,52.42],[27.65,0,53.24]);
for(const id of ["concession-candy-1","concession-candy-2","concession-popper-1","soda-fountain-1","soda-icee-left","ticket-podium-center","manager-desk","kiosk-bank-sanitizer"]){
 const p=world.propPlacements.find(p=>p.id===id);if(!p)continue;
 const distance=id.includes("candy")?1.7:id.includes("popper")?3:2.4;
 const target=new THREE.Vector3(...p.position);target.y+=id.includes("candy")?.64:(p.size?.[1]??1)*.6;
 const eye=target.clone().add(new THREE.Vector3(.4,.25,distance).applyAxisAngle(new THREE.Vector3(0,1,0),p.rotationY));
 add(id,id.replaceAll("-"," "),eye.toArray(),target.toArray());
}
for(const room of AUDITORIUMS){
 const l=world.auditoriumLayouts.get(room.id);
 const screen=l.presentation.screen;
 add(`${room.id}-screen`,`Theater ${room.number} · raised screen`,plan(l.centerX,l.backElevation+1.25,l.backRowZ),plan(screen.centerX,(screen.bottomY+screen.topY)/2,screen.z),"Seated eye height - image starts 1.8 m above front floor - fitted screen and raised roof");
 add(`${room.id}-screen-front`,`Theater ${room.number} · screen floor clearance`,plan(l.sideAisles.east.centerX,l.frontElevation+1.68,l.frontRowZ-l.direction*.8),plan(screen.centerX,screen.bottomY,screen.z),"Player-height view of the clear wall below the screen");
 if(room.stadium.access==="top")add(`${room.id}-cubby`,`Theater ${room.number} · wider cubby clearance`,plan(l.sideAisles.east.centerX,1.68,l.backRowZ+1.7),plan(l.centerX,.9,l.backRowZ+.6));
 add(`${room.id}-overview`,`Theater ${room.number} · seating`,plan(l.centerX,l.frontElevation+2.1,l.frontRowZ-l.direction*(l.seatingProfile?1.9:1.1)),plan(l.centerX,l.backElevation*.5+1,(l.frontRowZ+l.backRowZ)/2),l.seatingProfile?"A/B in front · B–C walkway · C at ground level · D–H rise":"Established small-room arrangement retained");
 if(l.entryCross){
  const side=l.routeReserve.side,aisle=l.sideAisles[side];
  add(`${room.id}-crosswalk`,`Theater ${room.number} · B/C walkway`,plan(aisle.centerX,1.68,l.entryCross.centerZ),plan(l.centerX,1.3,l.entryCross.centerZ));
  add(`${room.id}-front-steps`,`Theater ${room.number} · A/B descending steps`,plan(aisle.centerX,1.68,l.entryCross.centerZ),plan(aisle.centerX,l.frontElevation+.3,l.frontRowZ),"C and the crosswalk stay at ground level; B and A step down toward the screen");
  add(`${room.id}-rear`,`Theater ${room.number} · top-row wall`,plan(aisle.centerX,l.backElevation+1.68,l.backRowZ+.6),plan(l.centerX,l.backElevation+1.1,l.rearWallZ));
  add(`${room.id}-stairs`,`Theater ${room.number} · C to H side stairs`,plan(aisle.centerX,1.68,l.rows[2].z-l.direction*.7),plan(aisle.centerX,l.backElevation+.4,l.backRowZ),"Level row C; three 22 cm treads per row from D upward");
 }
}
add("west-hall","Shortened theater 1/2 hall",plan(-5,1.68,57.6),plan(HALL_PLAN.narrow.xMin+1,1.68,57.6),"West wing shortened by 30%; whole rooms translated");
add("east-hall","Shortened theater 6–14 hall",plan(19,1.68,58.85),plan(100,1.68,58.85),"9.7 meters removed; room footprints and order retained");
add("ticket-nooks","Smaller podium nooks",plan(5.8,1.68,49),plan(5.8,1.68,56),"Both nooks reduced to 25% of their former floor area");
add("mens-fixtures","Men’s restroom fixtures",plan(-15.5,1.68,65.8),plan(-13,1.2,68));
add("womens-fixtures","Women’s restroom fixtures",plan(48.9,1.68,69.7),plan(44.6,1.2,73.8));
add("womens-stalls","Women’s restroom stalls",plan(49,1.68,69.5),plan(55,1.2,73.8));
add("kitchen-equipment","Kitchen equipment",plan(-18,1.68,17.4),plan(-17,1.1,20.2));
add("kitchen-stock","Kitchen storage racks",plan(-25,1.68,10),plan(-28.1,1.1,12.8));
for(const actor of crowd.actors){const p=actor.group.position;add(actor.group.name,actor.group.name.replaceAll("-"," "),[p.x+.55,1.45,p.z+2],[p.x,1.03,p.z]);}
const select=document.querySelector("#view");views.forEach((view,i)=>select.add(new Option(view.label,String(i))));
const workerTools=document.createElement("div");workerTools.style.cssText="position:fixed;bottom:45px;left:14px;background:#0d141de8;padding:10px;border:1px solid #556;border-radius:8px;display:none;gap:8px;align-items:center";
workerTools.innerHTML='<button id="use-tool">Use focused target</button><button id="work-tool">Hold tool action</button><button id="capture-worker">Capture worker view</button><span id="worker-state" style="font-size:12px"></span>';
document.body.append(workerTools);
document.querySelector("#use-tool").onclick=()=>{usher.update(0,{active:true,action:false});usher.interact();};
document.querySelector("#work-tool").onclick=()=>{toolAction=!toolAction;document.querySelector("#work-tool").textContent=toolAction?"Release tool action":"Hold tool action";};
document.querySelector("#capture-worker").onclick=async()=>{renderer.render(scene,camera);await fetch("http://127.0.0.1:5182/shot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:`${views[+select.value].id}-active`,image:renderer.domElement.toDataURL("image/png")})});};
const setView=i=>{const view=views[i];controls.mouseButtons.LEFT=view.id.startsWith("usher-")?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;camera.position.fromArray(view.position);controls.target.fromArray(view.target);controls.update();lighting.update(camera.position);document.querySelector("#caption").textContent=view.caption||view.label;select.value=String(i);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);};
select.addEventListener("change",()=>setView(+select.value));
const resize=()=>{const stage=document.querySelector("#stage");camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight,false);};
new ResizeObserver(resize).observe(document.querySelector("#stage"));resize();setView(0);
let lastTime=performance.now();
renderer.setAnimationLoop(()=>{const now=performance.now(),delta=Math.min(.05,(now-lastTime)/1000);lastTime=now;
 const active=views[+select.value].id.startsWith("usher-");workerTools.style.display=active?"flex":"none";
 usher.update(delta,{active,action:active&&toolAction});
 if(active){const s=usher.getSnapshot();document.querySelector("#worker-state").textContent=`${usher.focusedPrompt||usher.hint} · floor ${s.summary.floor} · pan ${s.summary.pan} · bin ${s.summary.trash} · spills ${s.summary.spills}/2`;}
 lighting.update(camera.position);renderer.render(scene,camera);});
const loaded=await Promise.all([world.loadKioskAssets({url:"./models/mililani-ticket-kiosk.glb"}),world.loadPropAssets({url:"./models/theater-props.glb"}),crowd.loadAssets({url:"./models/theater-npcs.glb"})]);
document.querySelector("#status").textContent=`Models loaded: ${loaded[0]&&loaded[1]?"props ready":"CHECK FALLBACK"} · ${crowd.actors.length} NPCs · ${world.propPlacements.length} placements`;
renderer.shadowMap.needsUpdate=true;
document.querySelector("#capture").addEventListener("click",async()=>{
 const button=document.querySelector("#capture");button.disabled=true;
 try{for(let i=0;i<views.length;i++){setView(i);await new Promise(resolve=>requestAnimationFrame(resolve));renderer.render(scene,camera);const r=await fetch("http://127.0.0.1:5182/shot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:views[i].id,image:renderer.domElement.toDataURL("image/png")})});if(!r.ok)throw Error(await r.text());document.querySelector("#status").textContent=`Captured ${i+1}/${views.length}`;}
 await fetch("http://127.0.0.1:5182/index",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(views)});document.querySelector("#status").textContent=`Capture complete · ${views.length} views`;}
 catch(error){document.querySelector("#status").textContent=String(error);}finally{button.disabled=false;setView(0);}
});
