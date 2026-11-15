/** Reproduces the observed docked-cabin browser failure using the actual
 * ModernCockpit meshes and normal triangle-picking interaction path. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { Ray } from '@babylonjs/core/Culling/ray';
import { ModernCockpit } from '../src/scene/ModernCockpit';
import { SceneInteractions, type InteractionZone } from '../src/scene/SceneInteractions';

function fixture(){
  const engine=new NullEngine();
  engine.createCanvas=(width:number,height:number)=>({width,height,getContext:()=>({fillRect(){},fillText(){},clearRect(){}}),remove(){}} as unknown as HTMLCanvasElement);
  const scene=new Scene(engine),camera=new FreeCamera('observed docked crew eye',Vector3.Zero(),scene);
  class Registry extends SceneInteractions{readonly captured:InteractionZone[]=[];override register(zone:InteractionZone){this.captured.push(zone);super.register(zone);}}
  const interactions=new Registry(scene,camera),cockpit=new ModernCockpit(scene,interactions);
  cockpit.root.position.y=-3.69;
  camera.position.set(-.55,1.65-3.69,-.68);camera.minZ=.04;camera.maxZ=100;
  const world=(point:Vector3)=>Vector3.TransformCoordinates(point,cockpit.root.computeWorldMatrix(true));
  const aim=(point:Vector3)=>{camera.setTarget(point);camera.getViewMatrix(true);camera.getProjectionMatrix(true);camera.computeWorldMatrix();for(const mesh of scene.meshes)mesh.computeWorldMatrix(true);};
  const rayTo=(point:Vector3)=>{const delta=point.subtract(camera.position);return new Ray(camera.position,delta.normalizeToNew(),delta.length());};
  return{engine,scene,camera,interactions,cockpit,world,aim,rayTo};
}

test('modern transfer hatch latch is usable from the released commander seat while the old center remains occluded',()=>{
  const f=fixture();
  try{
    const oldCenter=f.world(new Vector3(0,1.6,-1.72));f.aim(oldCenter);
    const blocker=f.scene.pickWithRay(f.rayTo(oldCenter),mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.isPickable);
    assert.equal(blocker?.hit,true,'must reproduce the physical occlusion seen in the browser');
    assert.match(blocker!.pickedMesh!.name,/head restraint|pressure suit back support/);
    const hatch=f.interactions.captured.find(zone=>zone.id==='modern-hatch')!;
    const target=f.world(hatch.position);f.aim(target);
    assert.equal(f.interactions.query()?.action,'exit-worksite','the normal interaction ray must reach the visible latch');
    assert.equal(f.interactions.activate()?.id,'modern-hatch');
    const obstacle=MeshBuilder.CreateBox('solid obstruction before latch',{size:.2},f.scene);
    obstacle.material=new StandardMaterial('opaque test barrier',f.scene);obstacle.position=Vector3.Lerp(f.camera.position,target,.45);obstacle.computeWorldMatrix(true);
    assert.notEqual(f.interactions.query()?.action,'exit-worksite','fix must not allow interaction through opaque objects');
  }finally{f.scene.dispose();f.engine.dispose();}
});
