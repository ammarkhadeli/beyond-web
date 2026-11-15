/** Structural geometry tests. NullEngine does not render pixels or compile GPU
 * shaders; the deliberately empty canvas supplies only material construction. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { ModernCockpit } from '../src/scene/ModernCockpit';
import { SceneInteractions, type InteractionZone } from '../src/scene/SceneInteractions';
import { AstronautRig } from '../src/scene/AstronautRig';
import { stationApproachCamera } from '../src/scene/approachCamera';

test('ISS chase framing retains hull and target through the observed rotating approach bearings',()=>{
 const engine=new NullEngine({renderWidth:1600,renderHeight:900,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:4});
 const scene=new Scene(engine),camera=new FreeCamera('approach frustum',Vector3.Zero(),scene);camera.minZ=.04;camera.maxZ=100000;camera.fov=1.05;
 const inFrame=(point:Vector3)=>{const clip=Vector3.TransformCoordinates(point,camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)));return clip.z>0&&clip.z<1&&Math.abs(clip.x)<1&&Math.abs(clip.y)<1;};
 try{
  // This is the actual browser failure: attitude changed the target bearing,
  // while the old chase position stayed fixed and aimed away from the hull.
  const observed=new Vector3(14,-180,-5);camera.position.set(40.57,-26,-29.7);camera.setTarget(observed.scale(48/180).add(new Vector3(0,1,0)));
  assert.equal(inFrame(new Vector3(0,-3,0)),false,'fixture must reproduce old offscreen craft');
  for(const target of [new Vector3(-180,-8,-5),observed,new Vector3(0,180,0),new Vector3(180,0,0),new Vector3(0,0,180),new Vector3(0,0,-180)]){
   const frame=stationApproachCamera(target);camera.position.copyFrom(frame.position);camera.setTarget(frame.target);
   assert.ok(inFrame(target),'station target outside frustum at '+target.toString());
   for(const x of [-2.1,2.1])for(const y of [-10.2,.5])for(const z of [-2.1,2.1])assert.ok(inFrame(new Vector3(x,y,z)),'capsule/service envelope outside frustum at '+target.toString());
  }
  for(const target of [new Vector3(0,-3,0),new Vector3(0,-3,-.00001),observed])for(const yaw of [-Math.PI,0,Math.PI])for(const pitch of [-.6,0,1.1]){
   const frame=stationApproachCamera(target,yaw,pitch);assert.ok([...frame.position.asArray(),...frame.target.asArray()].every(Number.isFinite));assert.ok(Vector3.Distance(frame.position,frame.target)>20,'camera entered vehicle');
  }
 }finally{scene.dispose();engine.dispose();}
});

function fixture(){
 const engine=new NullEngine();
 engine.createCanvas=(width:number,height:number)=>({width,height,getContext:()=>({fillRect(){},fillText(){},clearRect(){}}),remove(){}} as unknown as HTMLCanvasElement);
 const scene=new Scene(engine),camera=new FreeCamera('test eye',Vector3.Zero(),scene);
 class Registry extends SceneInteractions{readonly zonesForTest:InteractionZone[]=[];override register(zone:InteractionZone){this.zonesForTest.push(zone);super.register(zone);}}
 const interactions=new Registry(scene,camera),cockpit=new ModernCockpit(scene,interactions);
 camera.position.copyFrom(cockpit.seat);camera.minZ=.04;camera.maxZ=100;camera.fov=1.25;
 const aim=(point:Vector3)=>{camera.setTarget(point);camera.getViewMatrix(true);camera.getProjectionMatrix(true);camera.computeWorldMatrix();for(const mesh of scene.meshes)mesh.computeWorldMatrix(true);};
 aim(cockpit.seat.add(Vector3.Forward()));
 return{engine,scene,camera,interactions,cockpit,aim};
}

test('modern cabin has finite geometry and three live telemetry texture surfaces',()=>{
 const f=fixture();try{
  assert.equal(f.cockpit.screens.length,3);
  assert.ok(f.scene.meshes.length>80);
  for(const mesh of f.scene.meshes){const positions=mesh.getVerticesData(VertexBuffer.PositionKind);if(positions)assert.ok(positions.every(Number.isFinite),mesh.name+' has invalid geometry');assert.ok(mesh.getWorldMatrix().asArray().every(Number.isFinite),mesh.name+' has invalid placement');}
 }finally{f.scene.dispose();f.engine.dispose();}
});

test('all primary panel controls can actually be aimed at and activated from commander seat',()=>{
 const f=fixture();try{
  for(const action of ['ignite','autopilot','return','resolve','throttle-up','throttle-down','abort']){
   const zone=f.interactions.zonesForTest.find(z=>z.action===action);assert.ok(zone,action+' missing');
   const target=Vector3.TransformCoordinates(zone.position,zone.parent.computeWorldMatrix(true));f.aim(target);
   const focus=f.interactions.query();assert.equal(focus?.action,action,`${action} blocked by scene geometry or overlapping hotspot; found ${focus?.id??'none'}`);assert.equal(focus?.enabled,true);
   assert.equal(f.interactions.activate()?.action,action);
  }
 }finally{f.scene.dispose();f.engine.dispose();}
});

test('forward windows open onto the world and bulkhead still blocks a ray below the deck',()=>{
 const f=fixture();try{
  const through=new Vector3(-.55,2.4,4),direction=through.subtract(f.camera.position).normalize();
  const opening=f.scene.pickWithRay(new Ray(f.camera.position,direction,6),mesh=>mesh.isPickable);
  assert.equal(opening?.hit,false,'forward window opening is covered by cabin geometry');
  const below=new Vector3(-.55,1.25,4).subtract(f.camera.position).normalize();
  assert.equal(f.scene.pickWithRay(new Ray(f.camera.position,below,6),mesh=>mesh.isPickable)?.hit,true,'lower pressure bulkhead must remain physical');
 }finally{f.scene.dispose();f.engine.dispose();}
});

test('switching cabins removes hidden controls from interaction queries',()=>{
 const f=fixture();try{
  const heritage=new TransformNode('test heritage cabin',f.scene),control=MeshBuilder.CreateBox('heritage control',{size:.08},f.scene);control.parent=heritage;control.position.set(0,1.65,.4);control.metadata={interactionSurface:true};
  f.interactions.register({id:'heritage-ignite',label:'Heritage launch',description:'',action:'ignite',parent:heritage,position:control.position.clone(),radius:.1,reach:3,kind:'control',enabled:()=>true});
  heritage.setEnabled(false);const modern=f.interactions.zonesForTest.find(z=>z.id==='modern-launch')!;f.aim(modern.position);assert.equal(f.interactions.query()?.id,'modern-launch');
  f.cockpit.root.setEnabled(false);heritage.setEnabled(true);f.aim(control.position);assert.equal(f.interactions.query()?.id,'heritage-ignite');
  heritage.setEnabled(false);assert.equal(f.interactions.query(),null);
 }finally{f.scene.dispose();f.engine.dispose();}
});

test('modern seat starts upright, can look through window, and release restraints without a jump',()=>{
 const rig=new AstronautRig();const seat=new Vector3(-.55,1.65,-.68);rig.setSeat(seat);
 assert.ok(Vector3.Distance(rig.getPose().position,seat)<1e-9);
 const matrix=Matrix.Identity();rig.getPose().orientation.toRotationMatrix(matrix);assert.ok(Vector3.Dot(Vector3.TransformNormal(Vector3.Up(),matrix),Vector3.Up())>.9999);
 rig.setMode('cabin','capsule');assert.ok(Vector3.Distance(rig.getPose().position,seat)<1e-9);
 rig.setWalkableRegion({minX:-1.48,maxX:1.48,minZ:-1.36,maxZ:.62,minY:1.1,maxY:2.65});rig.setInput({strafe:1});for(let i=0;i<100;i++)rig.step(.01);assert.ok(rig.localPosition.x>seat.x+.2);
});

test('actual suit vertex buffers retain bind pose and deform finitely under hip/shoulder motion',async()=>{
 const {readFileSync}=await import('node:fs');
 const {SceneLoader}=await import('@babylonjs/core/Loading/sceneLoader');
 const {Mesh}=await import('@babylonjs/core/Meshes/mesh');
 const {Quaternion}=await import('@babylonjs/core/Maths/math');
 const {AstronautBody}=await import('../src/scene/AstronautBody');
 const engine=new NullEngine(),scene=new Scene(engine),originalImport=SceneLoader.ImportMeshAsync,originalFetch=globalThis.fetch;
 new FreeCamera('suit geometry camera',new Vector3(0,1,-3),scene);
 // Substitute only file/image loading. Geometry comes from the shipped GLB,
 // and AstronautBody's real constructor creates all weights and live bones.
 SceneLoader.ImportMeshAsync=(async(_names,_root,filename)=>{
  const data=readFileSync(new URL('../public/assets/'+filename,import.meta.url)),jsonSize=data.readUInt32LE(12),json=JSON.parse(data.subarray(20,20+jsonSize).toString()),bin=28+jsonSize;
  const read=(index:number)=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView],size=a.type==='VEC3'?3:a.type==='VEC2'?2:1,bytes=a.componentType===5123?2:4,values:number[]=[];for(let n=0;n<a.count;n++)for(let c=0;c<size;c++){const offset=bin+(v.byteOffset??0)+(a.byteOffset??0)+n*(v.byteStride??size*bytes)+c*bytes;values.push(a.componentType===5126?data.readFloatLE(offset):bytes===2?data.readUInt16LE(offset):data.readUInt32LE(offset));}return values;};
  const root=new Mesh('asset transform '+filename,scene),meshes=[root];
  for(const primitive of json.meshes[0].primitives){const mesh=new Mesh(String(filename),scene);mesh.parent=root;mesh.setVerticesData(VertexBuffer.PositionKind,read(primitive.attributes.POSITION));mesh.setVerticesData(VertexBuffer.NormalKind,read(primitive.attributes.NORMAL));mesh.setIndices(read(primitive.indices));meshes.push(mesh);}
  return{meshes,particleSystems:[],skeletons:[],animationGroups:[],transformNodes:[],geometries:[],lights:[],spriteManagers:[]};
 }) as typeof SceneLoader.ImportMeshAsync;
 globalThis.fetch=async()=>new Response(null,{status:200});
 try{
  const body=new AstronautBody(scene);await body.ready;const meshes=scene.meshes.filter(m=>m.getTotalVertices()>0);
  assert.ok(meshes.length>=3);
  for(const mesh of meshes){
   assert.ok(mesh.skeleton);const weights=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!,ids=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
   for(let i=0;i<weights.length;i+=4){assert.ok(Math.abs(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]-1)<1e-6);for(let j=0;j<4;j++){assert.ok(Number.isFinite(weights[i+j])&&weights[i+j]>=0&&weights[i+j]<=1);assert.ok(ids[i+j]>=0&&ids[i+j]<mesh.skeleton!.bones.length);}}
   const before=Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!);mesh.skeleton!.prepare(true);(mesh as InstanceType<typeof Mesh>).applySkeleton(mesh.skeleton!);
   const bind=mesh.getVerticesData(VertexBuffer.PositionKind)!;assert.ok(before.every((v,i)=>Math.abs(v-bind[i])<1e-5),'skinning must not collapse or shift bind pose');
   mesh.skeleton!.bones[1].setRotationQuaternion(Quaternion.RotationAxis(Vector3.Right(),.22));mesh.skeleton!.bones[4].setRotationQuaternion(Quaternion.RotationAxis(Vector3.Right(),-.28));scene.render(false,false);mesh.skeleton!.prepare(true);(mesh as InstanceType<typeof Mesh>).applySkeleton(mesh.skeleton!);
   const after=mesh.getVerticesData(VertexBuffer.PositionKind)!;assert.ok(after.every(Number.isFinite));
   if(mesh.name!=='astronaut-full.glb')assert.ok(before.some((v,i)=>Math.abs(v-after[i])>.002),'limb animation must change actual geometry');
  }
 }finally{SceneLoader.ImportMeshAsync=originalImport;globalThis.fetch=originalFetch;scene.dispose();engine.dispose();}
});

test('trainer exterior details respect capsule envelope and separate service hardware from recovery capsule',async()=>{
 const {VehicleDetail}=await import('../src/scene/VehicleDetail');
 const engine=new NullEngine(),scene=new Scene(engine),launch=new TransformNode('launcher',scene),capsule=new TransformNode('capsule',scene);
 try{
  const detail=new VehicleDetail(scene,launch,capsule);assert.ok(detail.launcherMeshes.length>30);assert.ok(detail.capsuleMeshes.length>30);
  for(const mesh of [...detail.launcherMeshes,...detail.capsuleMeshes]){
   mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;
   for(const point of box.vectorsWorld){assert.ok(point.asArray().every(Number.isFinite));assert.ok(Math.abs(point.x)<=2.03&&Math.abs(point.z)<=2.03,'added surface detail must remain near the existing two-metre vehicle radius');assert.ok(point.y>=0&&point.y<=65.95,'details must retain the existing stage coordinate system');}
   assert.ok(['booster','service','capsule'].includes(mesh.metadata.vehiclePart));
  }
  // Entry drops the service hardware but retains the thermal protection and
  // capture system. The renderer uses this exact vehiclePart classification.
  for(const mesh of detail.capsuleMeshes)mesh.setEnabled(mesh.metadata.vehiclePart!=='service');
  assert.ok(detail.capsuleMeshes.some(mesh=>mesh.name.includes('heat shield')&&mesh.isEnabled()));
  assert.ok(detail.capsuleMeshes.filter(mesh=>mesh.name.includes('radiator')).every(mesh=>!mesh.isEnabled()));
  detail.setEnabled(false);assert.ok([...detail.launcherMeshes,...detail.capsuleMeshes].every(mesh=>!mesh.isEnabled()));
 }finally{scene.dispose();engine.dispose();}
});

test('discarded upper-stage visuals exclude the combined capsule and leave source geometry intact',async()=>{
 const {discardedUpperStageIndices}=await import('../src/scene/VehicleDetail');const {Mesh}=await import('@babylonjs/core/Meshes/mesh');
 const engine=new NullEngine(),scene=new Scene(engine),launcher=new TransformNode('launcher reference',scene);launcher.position.y=7.5;
 try{
  const shell=new Mesh('consolidated stage and capsule',scene);shell.parent=launcher;shell.setVerticesData(VertexBuffer.PositionKind,[-1,44,0,1,44,0,0,55,0,-1,59,0,1,59,0,0,65,0]);shell.setIndices([0,1,2,3,4,5]);
  assert.deepEqual(discardedUpperStageIndices(shell,launcher),[0,1,2]);assert.deepEqual(Array.from(shell.getIndices()!),[0,1,2,3,4,5]);
  // A glTF node whose local geometry is near zero but translated to the nose
  // must be classified using the launcher frame, not its raw vertex coordinates.
  shell.position.y=60;assert.deepEqual(discardedUpperStageIndices(shell,launcher),[]);
 }finally{scene.dispose();engine.dispose();}
});

test('finite solar disc enters and leaves Earth eclipse smoothly at orbital altitude',async()=>{
 const {solarVisibility,SOLAR_ANGULAR_RADIUS}=await import('../src/scene/SolarVisibility');
 const {EARTH_RADIUS}=await import('../src/game/orbital');
 const radius=EARTH_RADIUS,orbit=radius+408000,body={center:[0,0,0] as const,radius};
 assert.equal(solarVisibility([orbit,0,0],[1,0,0],[body]),1);
 assert.equal(solarVisibility([-orbit,0,0],[1,0,0],[body]),0);
 const edge=Math.asin(radius/orbit),samples:number[]=[];
 for(let i=0;i<=100;i++){const angle=edge-SOLAR_ANGULAR_RADIUS+i/100*SOLAR_ANGULAR_RADIUS*2;samples.push(solarVisibility([orbit,0,0],[-Math.cos(angle),Math.sin(angle),0],[body]));}
 assert.ok(samples[0]<1e-6&&samples[100]>1-1e-6);
 assert.ok(samples[50]>.49&&samples[50]<.51,'half the Sun is visible at the limb');
 for(let i=1;i<samples.length;i++){assert.ok(samples[i]>=samples[i-1]-1e-8,'penumbra must be monotonic');assert.ok(samples[i]-samples[i-1]<.02,'a finite solar disc must avoid an abrupt light switch');}
});

test('lunar landing datum is illuminated correctly below mean reference radius',async()=>{
 const {solarVisibility,lunarShadowRadius}=await import('../src/scene/SolarVisibility');const {MOON_RADIUS,LANDING_ELEVATION}=await import('../src/game/orbital');
 const moon=[384400000,0,0] as const,radius=MOON_RADIUS+LANDING_ELEVATION;
 assert.equal(lunarShadowRadius(0),radius);assert.equal(lunarShadowRadius(200001),MOON_RADIUS);
 assert.equal(solarVisibility([moon[0]+radius,0,0],[1,0,0],[{center:moon,radius:lunarShadowRadius(0)}]),1,'the sun-facing measured site must not be treated as inside the Moon');
 assert.equal(solarVisibility([moon[0]-radius,0,0],[1,0,0],[{center:moon,radius:lunarShadowRadius(0)}]),0);
});

test('eclipse calculation is frame independent and finite at exact horizon and tiny apparent bodies',async()=>{
 const {solarVisibility}=await import('../src/scene/SolarVisibility');
 const a=solarVisibility([20,0,0],[-.9,.4,0],[{center:[0,0,0],radius:10}]);
 const b=solarVisibility([120,200,300],[-9,4,0],[{center:[100,200,300],radius:10}]);assert.ok(Math.abs(a-b)<1e-12);
 const horizon=solarVisibility([10,0,0],[0,1,0],[{center:[0,0,0],radius:10}]);assert.ok(horizon>.49&&horizon<.51);
 const annular=solarVisibility([1000000,0,0],[-1,0,0],[{center:[0,0,0],radius:100}]);assert.ok(annular>0&&annular<1);
 assert.equal(solarVisibility([0,0,0],[1,0,0],[{center:[0,0,0],radius:10}]),0);
});

test('worksite objective prioritizes boarding after abort over unfinished science and faults',async()=>{
 const {SpaceScene}=await import('../src/scene/SpaceScene');const {createMission}=await import('../src/game/simulation');
 for(const mode of ['eva','station']){
  const state=createMission({destination:mode==='eva'?'moon':'iss',difficulty:'cadet',payload:'biology',extraFuel:true,extraBattery:true,shielding:false});
  state.phase='return';state.awaitingCrewSeat=true;state.navigation.returnRequested=true;state.event='Power fault';state.eventResolved=false;state.completedActivities=[];
  // Exercise the actual objective method without constructing a renderer. The
  // interaction registry records which physical target it is asked to locate.
  const renderer=Object.assign(Object.create(SpaceScene.prototype),{lastState:state,flightActive:true,view:'cockpit',astronaut:{mode},interactions:{objective:(action:string)=>({action})}});
  assert.equal(renderer.getObjective().action,'board');
  state.phase='science';state.awaitingCrewSeat=false;assert.equal(renderer.getObjective().action,'board','return request still takes priority while crew secures the cabin');
  state.navigation.returnRequested=false;assert.equal(renderer.getObjective().action,'resolve');
 }
});

test('modern cabin seals forward side gaps while leaving designated windows open',()=>{
 const f=fixture();try{
  for(const sign of [-1,1]){
   const eye=new Vector3(sign*1.4,1.9,.55),ray=new Ray(eye,Vector3.Forward(),2);
   const hit=f.scene.pickWithRay(ray,mesh=>mesh.isEnabled()&&mesh.isPickable);
   assert.equal(hit?.hit,true,'pressure-shell corner must block the former outside-terrain gap');
   assert.ok(hit?.pickedPoint,'must intersect actual triangles, not just material-less bounding boxes');
  }
  const eye=f.cockpit.seat,through=new Vector3(-.55,2.4,4);
  assert.equal(f.scene.pickWithRay(new Ray(eye,through.subtract(eye).normalize(),6),mesh=>mesh.isPickable)?.hit,false);
 }finally{f.scene.dispose();f.engine.dispose();}
});
