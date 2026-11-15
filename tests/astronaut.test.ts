import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math';
import {AstronautRig} from '../src/scene/AstronautRig';
const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100,minY:-100,maxY:100};
function axes(rig:AstronautRig){const m=Matrix.Identity();rig.getPose().orientation.toRotationMatrix(m);return {right:Vector3.TransformNormal(Vector3.Right(),m),up:Vector3.TransformNormal(Vector3.Up(),m),forward:Vector3.TransformNormal(Vector3.Forward(),m)};}
function tick(rig:AstronautRig,seconds:number){for(let i=0;i<seconds*100;i++)rig.step(.01);}

test('reclined head turns keep the camera level against the reclined instrument panel',()=>{
  const rig=new AstronautRig();rig.setSeat(new Vector3(-.55,1.62,-.95),Quaternion.RotationAxis(Vector3.Right(),-1.079));
  const panelUp=axes(rig).up;
  for(const yaw of [-2.4,-1.2,0,1.2,2.4]){rig.setLook(yaw,.15);assert.ok(Math.abs(Vector3.Dot(axes(rig).right,panelUp))<1e-6,`head yaw ${yaw} rolled against the seated reference`);}
  const body=rig.getBodyOrientation().asArray();
  for(let i=0;i<10000;i++)rig.setLook(Math.sin(i)*2,Math.cos(i));
  rig.setLook(0,0);const before=rig.getPose().orientation.asArray();rig.setLook(0,0);
  assert.deepEqual(rig.getPose().orientation.asArray(),before);assert.deepEqual(rig.getBodyOrientation().asArray(),body);
});

test('unstrapping preserves the seat position and coasting cabin motion remains inertial',()=>{
  const rig=new AstronautRig();rig.setWalkableRegion(bounds);rig.setSeat(new Vector3(.4,1.3,-.8));
  const seat=rig.localPosition.asArray();rig.setMode('cabin','capsule');assert.deepEqual(rig.localPosition.asArray(),seat);
  rig.setInput({forward:1});tick(rig,1);rig.setInput({forward:0});
  const velocity=rig.velocity.asArray(),position=rig.localPosition.clone();tick(rig,1);
  assert.deepEqual(rig.velocity.asArray(),velocity);assert.ok(rig.localPosition.z>position.z+.5);
  assert.equal(rig.localPosition.y,seat[1]);
});

test('station movement persists after release and a handrail brake stops drift',()=>{
  const rig=new AstronautRig();rig.setWalkableRegion(bounds);rig.setMode('station');rig.setInput({strafe:1});tick(rig,1);
  rig.setInput({strafe:0});const speed=rig.velocity.length();tick(rig,1);assert.ok(Math.abs(rig.velocity.length()-speed)<1e-9);
  rig.setInput({brake:true});tick(rig,1);assert.ok(rig.velocity.length()<.002);
});

test('a lunar hop follows lunar gravity and holding jump does not cause repeated bouncing',()=>{
  const rig=new AstronautRig();rig.setWalkableRegion(bounds,()=>0);rig.setMode('eva','lunar');rig.setInput({vertical:1});tick(rig,.5);
  assert.ok(Math.abs(rig.velocity.y-(2.15-1.62*.5))<1e-9);assert.ok(rig.localPosition.y>2.4);
  tick(rig,4);assert.equal(rig.localPosition.y,1.67);assert.equal(rig.velocity.y,0);
  tick(rig,1);assert.equal(rig.localPosition.y,1.67);
  rig.setInput({vertical:0});rig.step(.01);rig.setInput({vertical:1});rig.step(.01);assert.ok(rig.localPosition.y>1.67);
});

test('paused movement changes neither pose nor velocity and station walls stop penetration',()=>{
  const rig=new AstronautRig();rig.setWalkableRegion({...bounds,maxZ:3});rig.setMode('station');rig.setInput({forward:1});tick(rig,.5);
  const position=rig.localPosition.asArray(),velocity=rig.velocity.asArray();rig.setInput({forward:0});rig.step(0);
  assert.deepEqual(rig.localPosition.asArray(),position);assert.deepEqual(rig.velocity.asArray(),velocity);
  rig.setInput({forward:1});tick(rig,10);assert.equal(rig.localPosition.z,3);assert.equal(rig.velocity.z,0);
});
