import assert from "node:assert/strict";
import * as THREE from "three";
import { createUsherState, beginCleaningBreak, stepUsherState, seatStage, closeCleaningTray,
  theaterSummary, beginUsherPour, restoreUsherState, serializeUsherState } from "../src/usher-state.js";
import { createCleaningPlans } from "../src/usher-cleaning-layout.js";
import { createUsherGameplay, USHER_SPAWN } from "../src/usher-gameplay.js";
import { createMaterialLibrary } from "../src/materials.js";
import { createTheaterWorld } from "../src/world.js";
import { AABBCollisionWorld } from "../src/player.js";
class CanvasStub {
  constructor(w,h) { this.width=w;this.height=h; }
  getContext() { const gradient={addColorStop(){}};return new Proxy({canvas:this,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:t=>({width:String(t).length*12}),getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]??(()=>{})}); }
}
globalThis.OffscreenCanvas=CanvasStub;
const scene=new THREE.Scene();
const world=createTheaterWorld({scene,materials:createMaterialLibrary({capabilities:{getMaxAnisotropy:()=>4}})});
const collisionWorld=new AABBCollisionWorld({bounds:world.worldBounds});collisionWorld.addBoxes(world.colliders);
const plans=createCleaningPlans(world), state=createUsherState();
assert.equal(plans.length,14);
for(const plan of plans) beginCleaningBreak(state,plan,1234);
assert.ok(state.jobs.every(j=>j.seats.length>=3&&j.seats.length<=6));
const twin=createUsherState();for(const plan of plans) beginCleaningBreak(twin,plan,1234);
assert.equal(serializeUsherState(state),serializeUsherState(twin),"Seeded layouts reproduce exactly");
const varied=createUsherState();for(const plan of plans) beginCleaningBreak(varied,plan,9876);
assert.notDeepEqual(state.jobs.map(j=>j.seats.map(s=>s.id)),varied.jobs.map(j=>j.seats.map(s=>s.id)),"New seeds vary used seats across all rooms");
assert.ok(state.jobs.some(j=>j.seats.some(s=>s.column>0&&s.column<3)),"Interior seat columns are eligible");
scene.updateMatrixWorld(true);const ray=new THREE.Raycaster();
let standingChecks=0;
for(const job of state.jobs) for(const s of job.seats) {
  assert.ok(Math.abs(world.groundHeight(s.stand[0],s.stand[2],s.floorY)-s.floorY)<.035,`${s.id} standing strip follows deck height`);
  const p={x:s.stand[0],y:s.floorY,z:s.stand[2]};
  assert.equal(collisionWorld.isOverlapping(p,.28,s.floorY,1.8),false,`${s.id} has full player capsule clearance`);
  const before={...p};collisionWorld.moveCircle(p,0,0,.26,s.floorY,1.8);
  assert.ok(Math.hypot(p.x-before.x,p.z-before.z)<.01,`${s.id} standing strip is capsule-clear`);
  ray.set(new THREE.Vector3(s.stand[0],s.floorY+.2,s.stand[2]),new THREE.Vector3(0,-1,0));ray.far=.4;
  const hits=ray.intersectObject(world.root,true);
  assert.ok(hits.some(h=>Math.abs(h.point.y-s.floorY)<.035),`${s.id} has rendered floor under its standing pose`);standingChecks++;
}
for(const plan of plans)for(const patch of plan.patches){
  const standing={x:patch.x-.75,y:patch.y,z:patch.z};
  assert.equal(collisionWorld.isOverlapping(standing,.28,patch.y,1.8),false,`${plan.id} floor mess has a reachable side approach`);
  assert.ok(Math.abs(world.groundHeight(patch.x,patch.z,patch.y)-patch.y)<.025,`${plan.id} floor mess follows its actual lowered/front deck`);
  ray.set(new THREE.Vector3(patch.x,patch.y+.2,patch.z),new THREE.Vector3(0,-1,0));ray.far=.4;
  assert.ok(ray.intersectObject(world.root,true).some(h=>Math.abs(h.point.y-patch.y)<.025),`${plan.id} rendered floor supports debris`);
}
const job=state.jobs.find(j=>j.id==="theater-2"), seat=job.seats[0];
assert.equal(closeCleaningTray(job,seat),false,"Used tray cannot close before cleaning");
state.heldTool="cloth";
function wipe(surface) {
  for(let pass=0;pass<4;pass++) for(let row=-3;row<=3;row++) {
    let prev={x:-surface.width*.47,z:row*surface.depth/8};
    for(let i=1;i<=60;i++) {const next={x:-surface.width*.47+i*surface.width*.94/60,z:prev.z};stepUsherState(state,1/120,{cloth:{surfaceId:surface.id,from:prev,to:next}});prev=next;}
  }
}
const cushion=job.surfaces.find(s=>s.id===`${seat.id}-seat`), tray=job.surfaces.find(s=>s.id===`${seat.id}-tray`);
wipe(cushion);assert.ok(cushion.cells.every(c=>c.dirt===1),"Tray must be wiped before its seat");
wipe(tray);assert.equal(seatStage(job,seat),"wipe seat");wipe(cushion);assert.equal(seatStage(job,seat),"sweep seat");
state.heldTool="broom";
let prev=null;
for(let i=0;i<480;i++) {
  const phase=(i/120)%1.1, p={x:seat.x,y:seat.floorY+.625,z:seat.z+seat.forward*(-.075+phase/.72*.525)};
  stepUsherState(state,1/120,{brush:phase<.72&&prev?{from:prev,to:p,y:p.y,right:{x:1,z:0},seatId:seat.id}:null});prev=phase<.72?p:null;
}
assert.ok(job.particles.filter(p=>p.seatId===seat.id).every(p=>p.mode==="floor"),"Chair kernels physically fall onto row floor before pan collection");
assert.equal(closeCleaningTray(job,seat),true);for(let i=0;i<100;i++)stepUsherState(state,1/120);
assert.equal(seatStage(job,seat),"ready");
assert.equal(theaterSummary(job).floorUnlocked,false,"Floor work waits for all used seats");
assert.equal(beginCleaningBreak(state,plans.find(p=>p.id===job.id),"next-show"),false,"Next break cannot discard unfinished mess or pan contents");
const saved=serializeUsherState(state), restored=restoreUsherState(saved,plans);
assert.equal(serializeUsherState(restored),saved,"Partial seat workflow and per-theater seed survive reload");

const camera=new THREE.PerspectiveCamera(70,1.5,.05,200), hands={owner:null};let deposited=0;
const game=createUsherGameplay({scene,world,camera,collisionWorld,hands,depositTrash:(_id,count)=>{const n=Math.min(2,count);deposited+=n;return n;}});
for(const plan of plans) game.beginBreak(plan.id,1234);
function aim(position,target,action=false,delta=1/60) {camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld(true);game.update(delta,{active:true,action});}
aim([24.3,1.68,52.8],[24.3,1.4,54.4]);assert.equal(game.interact(),true);assert.equal(game.heldTool,"broom");assert.equal(hands.owner,"cleaning");
assert.equal(game.returnTool(),true);assert.equal(hands.owner,null,"Holstering frees hands anywhere");
hands.owner="waste";assert.equal(game.selectTool("cloth"),false,"Carried bags/bins prevent tool pickup");hands.owner=null;assert.equal(game.selectTool("cloth"),true);
for(const a of game.getSnapshot().anchors.seats){
  const position=[a.stand[0],a.stand[1]+1.68,a.stand[2]];
  aim(position,a.tray);assert.equal(game.getSnapshot().target?.surfaceId,`${a.id}-tray`,`${a.id} open tray is physically reachable`);
  aim(position,a.seat);assert.equal(game.getSnapshot().target?.surfaceId,`${a.id}-seat`,`${a.id} cushion is physically reachable`);
}
const anchor=game.getSnapshot().anchors.seats.find(a=>a.theaterId==="theater-2");
const realSeat=game.getSnapshot().state.jobs.find(j=>j.id==="theater-2").seats.find(s=>s.id===anchor.id);
const standing=[anchor.stand[0],anchor.stand[1]+1.68,anchor.stand[2]];
aim(standing,anchor.tray);
assert.equal(game.getSnapshot().target?.surfaceId,`${anchor.id}-tray`,"Opened tray can be targeted from the actual front row aisle");
function dragWorldSurface(id) {
  const group=game.root.getObjectByName(id);group.updateWorldMatrix(true,true);
  for(let pass=0;pass<5;pass++) for(let row=-3;row<=3;row++) for(let i=0;i<=50;i++) {
    const local=new THREE.Vector3(-.13+i*.0052,0,row*.027);
    const target=group.localToWorld(local);aim(standing,target.toArray(),true);
  }
}
dragWorldSurface(`${anchor.id}-tray`);dragWorldSurface(`${anchor.id}-seat`);
let js=game.getSnapshot().state.jobs.find(j=>j.id==="theater-2");
assert.ok(js.surfaces.filter(s=>s.seatId===anchor.id).every(s=>s.cells.every(c=>c.dirt<=.001)),"Real cloth drag wipes tray and cushion");
game.selectTool("broom");
for(let i=0;i<300;i++)aim(standing,anchor.seat,true);
js=game.getSnapshot().state.jobs.find(j=>j.id==="theater-2");
assert.ok(js.particles.filter(p=>p.seatId===anchor.id).every(p=>p.mode==="floor"),`Actual chair sweep drops kernels: ${JSON.stringify(js.particles.filter(p=>p.seatId===anchor.id))}`);
assert.ok(js.particles.filter(p=>p.seatId===anchor.id).every(p=>(p.z-realSeat.z)*realSeat.forward>=.449),"Landed kernels resolve fully outside the chair collision margin");
aim(standing,anchor.tray);assert.equal(game.interact(),true);
for(let i=0;i<80;i++)game.update(1/60,{active:true});
assert.equal(game.getTheaterSummary("theater-2").seatsReady,1);
const paused=JSON.stringify(game.getSnapshot().state);game.update(60,{active:false,action:true});assert.equal(JSON.stringify(game.getSnapshot().state),paused,"Pause has no catch-up work");
// Room culling and instancing bound the 14-room visual cost.
let visibleMeshes=0;game.root.traverseVisible(o=>{if(o.isMesh)visibleMeshes++;});
assert.ok(visibleMeshes<160,`Only nearby room messes draw (${visibleMeshes})`);
assert.equal(game.root.getObjectByName("usher-popcorn").isInstancedMesh,true);
game.dispose();
// Restore a late-break fixture: seats have been physically completed above;
// three floor kernels and the two floor spills remain. Exercise the actual
// reversed stroke and capacity-limited rolling-bin handshake to completion.
const late=createUsherState();const lateJob=beginCleaningBreak(late,plans[1],1234);late.kit=true;
for(const s of lateJob.surfaces)if(s.kind!=="floor")for(const c of s.cells)c.dirt=0;
for(const p of lateJob.particles)p.mode="trash";
for(const s of lateJob.seats){s.trayOpen=false;s.trayAngle=s.trayTarget=0;}
const patch=plans[1].patches[0];
// Use authored floor kernels so restoration retains their surface bounds.
const testKernels=lateJob.particles.filter(p=>!p.seatId).slice(-3);
for(const [i,p] of testKernels.entries())Object.assign(p,{mode:"floor",x:patch.x+(i-1)*.08,y:patch.y+.035,z:patch.z,floorY:patch.y,bounds:patch.bounds});
const memory={value:serializeUsherState(late),getItem(){return this.value;},setItem(_k,v){this.value=v;}};
let accepts=2;
const floorGame=createUsherGameplay({scene,world,camera,collisionWorld,storage:memory,hands:{owner:null},
  getBinTargets:()=>[{id:"test-rolling",position:[patch.x-.8,patch.y+1.12,patch.z+.8],radius:.4,ignoreColliderId:"test-rolling"}],
  depositTrash:(_id,count)=>{const n=Math.min(accepts,count);deposited+=n;return n;}});
function floorAim(pos,target,action=false){camera.position.set(...pos);camera.lookAt(...target);camera.updateMatrixWorld(true);floorGame.update(1/60,{active:true,action});}
const fp=[patch.x-.85,patch.y+1.68,patch.z];floorAim(fp,[patch.x,patch.y,patch.z]);floorGame.selectTool("broom");
for(let i=0;i<300;i++)floorAim(fp,[patch.x,patch.y,patch.z],true);
assert.equal(floorGame.getSnapshot().summary.pan,3,`Pulling stroke collects floor kernels: ${JSON.stringify(floorGame.getSnapshot().state.jobs[0].particles.filter(p=>p.mode==="floor"))}`);
const pose=floorGame.getSnapshot().contactPose;
assert.ok(pose.pan[0]<patch.x,"Pan stays nearer the player than the dirty patch");
assert.ok(pose.pan[2]<patch.z,"Facing +X places pan on the player's left");
floorAim(fp,[patch.x-.8,patch.y+1.12,patch.z+.8]);assert.equal(floorGame.interact(),true);
for(let i=0;i<80;i++)floorGame.update(1/60,{active:true});
assert.equal(floorGame.getSnapshot().summary.pan,1,"Partial acceptance leaves unaccepted debris physically in pan");
accepts=0;floorGame.interact();assert.equal(floorGame.getSnapshot().summary.pan,1,"Full bin cannot destroy pan contents");
accepts=10;floorGame.interact();for(let i=0;i<80;i++)floorGame.update(1/60,{active:true});
assert.equal(floorGame.getSnapshot().summary.pan,0);
floorGame.selectTool("cloth");
for(const surface of floorGame.getSnapshot().state.jobs[0].surfaces.filter(s=>s.kind==="floor")) {
  const pos=[surface.x-.75,surface.y+1.68,surface.z];
  for(let pass=0;pass<4;pass++)for(let row=-4;row<=4;row++)for(let i=0;i<=60;i++)floorAim(pos,[surface.x-.26+i*.0087,surface.y,surface.z+row*.055],true);
}
assert.equal(floorGame.isTheaterReady("theater-2"),true,"Disposal plus both physically wiped floor patches complete the room");
assert.equal(floorGame.beginBreak("theater-2","new-show"),true,"Completed theater can receive a fresh seeded show mess");
assert.equal(floorGame.isTheaterReady("theater-2"),false);
floorGame.dispose();
// A real chair-swept kernel must remain collectable after it lands beside the
// row collider; testing only its 'floor' state missed a trapped edge contact.
const chairFloor=createUsherState();const chairJob=beginCleaningBreak(chairFloor,plans[1],1234);chairFloor.kit=true;
for(const s of chairJob.surfaces)for(const c of s.cells)c.dirt=0;
for(const s of chairJob.seats){s.trayOpen=false;s.trayAngle=s.trayTarget=0;}
for(const p of chairJob.particles)p.mode="trash";
const actualDrop=js.particles.find(p=>p.seatId===anchor.id);
const dropped=chairJob.particles.find(p=>p.id===actualDrop.id);Object.assign(dropped,actualDrop,{mode:"floor",vx:0,vz:0});
const chairMemory={getItem:()=>serializeUsherState(chairFloor),setItem(){}};
const pickup=createUsherGameplay({scene,world,camera,collisionWorld,storage:chairMemory,hands:{owner:null}});
camera.position.set(...standing);camera.lookAt(dropped.x,dropped.floorY,dropped.z);camera.updateMatrixWorld(true);
pickup.update(1/60,{active:true});pickup.selectTool("broom");
for(let i=0;i<300;i++)pickup.update(1/60,{active:true,action:true});
assert.equal(pickup.getSnapshot().summary.pan,1,"Actual chair-fallen kernel can be swept from the row edge into the pan");
pickup.dispose();world.dispose();
console.log(`Usher v22 smoke passed: 14 seeded theaters, ${standingChecks} reachable rendered seat/deck positions, ordered tray/seat/sweep/close workflow, hands, persistence, pause, and bounded visuals.`);
