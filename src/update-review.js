import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createTheaterWorld } from "./world.js";
import { createMaterialLibrary } from "./materials.js";
import { createTheaterCrowd } from "./atmosphere.js";
import { AABBCollisionWorld } from "./player.js";
import { AUDITORIUMS, HALL_PLAN, TICKET_APPROACH_PLAN } from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";
const renderer = new THREE.WebGLRenderer({canvas:document.querySelector("canvas"),antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x08080b);
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment(),environmentTarget=pmrem.fromScene(environment,.04);
scene.environment=environmentTarget.texture;scene.environmentIntensity=.22;environment.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xdce8ff,0x241414,1.65));
const sun=new THREE.DirectionalLight(0xffead4,1.8);sun.position.set(-18,28,-16);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-33,right:33,top:36,bottom:-29,near:.5,far:100});sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;scene.add(sun);
const materials=createMaterialLibrary(renderer),world=createTheaterWorld({scene,materials});
const collisions=new AABBCollisionWorld({bounds:world.worldBounds});collisions.addBoxes(world.colliders);
const crowd=createTheaterCrowd({scene,collisionWorld:collisions,world});
const camera=new THREE.PerspectiveCamera(67,1,.04,260),controls=new OrbitControls(camera,renderer.domElement);
const plan=(x,y,z)=>[planToWorldX(x),y,z],views=[];
const add=(id,label,position,target,caption="")=>views.push({id,label,position,target,caption});
add("lobby","Lobby and concessions",plan(1,1.68,7),plan(-10,1.4,11));
for(const id of ["concession-candy-1","concession-candy-2","concession-popper-1","soda-fountain-1","soda-icee-left","ticket-podium-center","manager-desk","kiosk-bank-sanitizer"]){
 const p=world.propPlacements.find(p=>p.id===id);if(!p)continue;
 const distance=id.includes("candy")?1.7:id.includes("popper")?3:2.4;
 const target=new THREE.Vector3(...p.position);target.y+=id.includes("candy")?.64:(p.size?.[1]??1)*.6;
 const eye=target.clone().add(new THREE.Vector3(.4,.25,distance).applyAxisAngle(new THREE.Vector3(0,1,0),p.rotationY));
 add(id,id.replaceAll("-"," "),eye.toArray(),target.toArray());
}
for(const room of AUDITORIUMS){
 const l=world.auditoriumLayouts.get(room.id);
 add(`${room.id}-overview`,`Theater ${room.number} · seating`,plan(l.centerX,l.frontElevation+2.1,l.frontRowZ-l.direction*(l.seatingProfile?1.9:1.1)),plan(l.centerX,l.backElevation*.5+1,(l.frontRowZ+l.backRowZ)/2),l.seatingProfile?"A/B in front · B–C walkway · C at ground level · D–H rise":"Established small-room arrangement retained");
 if(l.entryCross){
  const side=l.routeReserve.side,aisle=l.sideAisles[side];
  add(`${room.id}-crosswalk`,`Theater ${room.number} · B/C walkway`,plan(aisle.centerX,1.68,l.entryCross.centerZ),plan(l.centerX,1.3,l.entryCross.centerZ));
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
const setView=i=>{const view=views[i];camera.position.fromArray(view.position);controls.target.fromArray(view.target);controls.update();document.querySelector("#caption").textContent=view.caption||view.label;select.value=String(i);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);};
select.addEventListener("change",()=>setView(+select.value));
const resize=()=>{const stage=document.querySelector("#stage");camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight,false);};
new ResizeObserver(resize).observe(document.querySelector("#stage"));resize();setView(0);
renderer.setAnimationLoop(()=>{renderer.render(scene,camera);});
const loaded=await Promise.all([world.loadKioskAssets({url:"./models/mililani-ticket-kiosk.glb"}),world.loadPropAssets({url:"./models/theater-props.glb"}),crowd.loadAssets({url:"./models/theater-npcs.glb"})]);
document.querySelector("#status").textContent=`Models loaded: ${loaded[0]&&loaded[1]?"props ready":"CHECK FALLBACK"} · ${crowd.actors.length} NPCs · ${world.propPlacements.length} placements`;
renderer.shadowMap.needsUpdate=true;
document.querySelector("#capture").addEventListener("click",async()=>{
 const button=document.querySelector("#capture");button.disabled=true;
 try{for(let i=0;i<views.length;i++){setView(i);await new Promise(resolve=>requestAnimationFrame(resolve));renderer.render(scene,camera);const r=await fetch("http://127.0.0.1:5180/shot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:views[i].id,image:renderer.domElement.toDataURL("image/png")})});if(!r.ok)throw Error(await r.text());document.querySelector("#status").textContent=`Captured ${i+1}/${views.length}`;}
 await fetch("http://127.0.0.1:5180/index",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(views)});document.querySelector("#status").textContent=`Capture complete · ${views.length} views`;}
 catch(error){document.querySelector("#status").textContent=String(error);}finally{button.disabled=false;setView(0);}
});
