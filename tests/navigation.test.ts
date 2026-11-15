import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { TrajectoryView } from '../src/scene/TrajectoryView';
import { createMission, stepMission, type Plan } from '../src/game/simulation';
import { navigationReadout,formatNavigationRange } from '../src/game/navigationDisplay';
import { EARTH_RADIUS, sub,length } from '../src/game/orbital';
const plan:Plan={destination:'iss',difficulty:'cadet',payload:'biology',extraFuel:true,extraBattery:true,shielding:false,startMode:'approach'};
test('navigation target uses physical separation, including cross-track offsets',()=>{
 const s=createMission(plan);s.trajectory.position=s.trajectory.targetPosition.map((n,i)=>n+[3,4,12][i]) as [number,number,number];
 assert.equal(navigationReadout(s).rangeMeters,13);assert.equal(navigationReadout(s).label,'Station range');
 const moon=createMission({...plan,destination:'moon',payload:'geology'});assert.equal(navigationReadout(moon).rangeMeters,length(sub(moon.trajectory.position,moon.trajectory.landingSitePosition)));assert.equal(navigationReadout(moon).label,'Landing-site range');
 s.phase='return';s.trajectory.position=[EARTH_RADIUS+20000,0,0];assert.equal(navigationReadout(s).rangeMeters,20000);assert.equal(navigationReadout(s).label,'Earth surface range');
 assert.equal(formatNavigationRange(450),'450 m');assert.equal(formatNavigationRange(384400000),'384,400 km');
});
test('map displays moving ISS target and orbit; lunar missions display their landing site',()=>{
 const engine=new NullEngine();engine.createCanvas=(width:number,height:number)=>({width,height,getContext:()=>({clearRect(){},fillText(){}}),remove(){}} as unknown as HTMLCanvasElement);
 const scene=new Scene(engine),camera=new FreeCamera('map test',Vector3.Zero(),scene),view=new TrajectoryView(scene);view.root.setEnabled(true);
 try{
  let s=createMission(plan);view.update(s,camera,0,.35);
  const station=scene.getMeshByName('ISS target position')!,label=scene.getMeshByName('ISS target label')!,orbit=scene.getMeshByName('ISS target orbit')!;
  assert.ok(station.isEnabled());assert.ok(label.isEnabled());assert.ok(orbit.isEnabled());
  const before=station.position.clone();assert.ok(Vector3.Distance(before,new Vector3(s.trajectory.targetPosition[0]*1e-6,s.trajectory.targetPosition[1]*1e-6,-s.trajectory.targetPosition[2]*1e-6))<1e-12);
  s=stepMission(s,{forward:0,lateral:0,vertical:0,brake:false},10);view.update(s,camera,0,.35);assert.ok(Vector3.Distance(before,station.position)>0);
  s=createMission({...plan,destination:'moon',payload:'geology'});view.update(s,camera,0,.35);assert.equal(station.isEnabled(),false);assert.equal(label.isEnabled(),false);assert.equal(orbit.isEnabled(),false);assert.ok(scene.getMeshByName('lunar landing-site position')!.isEnabled());assert.ok(scene.getMeshByName('Landing site label')!.isEnabled());
 }finally{scene.dispose();engine.dispose();}
});
