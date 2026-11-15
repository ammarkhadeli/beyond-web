import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3,Quaternion,Vector3,Matrix } from '@babylonjs/core/Maths/math';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

/** Surface treatment for the original fictional orbital trainer only. These are
 * visual construction details, not added hardware capabilities or NASA specs. */
export function refineTrainerMaterials(scene:Scene,meshes:AbstractMesh[]){
 const normal=new DynamicTexture('trainer coating microtexture',{width:256,height:256},scene,false),ctx=normal.getContext();ctx.fillStyle='#8080ff';ctx.fillRect(0,0,256,256);
 for(let y=0;y<256;y+=2)for(let x=0;x<256;x+=2){const value=(x*13+y*29)%7;ctx.fillStyle=`rgb(${126+value},${126+(value*3)%7},254)`;ctx.fillRect(x,y,1,1);}normal.update();normal.uScale=24;normal.vScale=48;normal.level=.08;
 const glass=new PBRMaterial('trainer optical window coating',scene);glass.albedoColor=new Color3(.018,.047,.065);glass.metallic=.45;glass.roughness=.09;glass.clearCoat.isEnabled=true;glass.clearCoat.intensity=1;glass.clearCoat.roughness=.035;glass.environmentIntensity=1.1;glass.useLogarithmicDepth=true;
 const updated=new Set<PBRMaterial>();
 for(const mesh of meshes){
  if((mesh.name.includes('Capsule window')||mesh.name==='Rocket_Stage2_Elastomer seals')){mesh.material=glass;continue;}
  const mat=mesh.material;if(!(mat instanceof PBRMaterial))continue;
  if(!updated.has(mat)){
   updated.add(mat);mat.environmentIntensity=.65;
   if(mat.name.includes('white thermal')){mat.metallic=.035;mat.roughness=.43;mat.bumpTexture=normal;}
   if(mat.name.includes('Carbon fiber')){mat.metallic=.28;mat.roughness=.5;}
   if(mat.name.includes('Engine nickel')){mat.albedoColor=new Color3(.24,.22,.19);mat.roughness=.38;}
   if(mat.name.includes('Machined')){mat.roughness=.3;mat.metallic=.88;}
  }
  if(mat.bumpTexture&&mesh instanceof Mesh&&!mesh.isVerticesDataPresent(VertexBuffer.UVKind)){
   const p=mesh.getVerticesData(VertexBuffer.PositionKind);if(!p)continue;const uv:number[]=[];let lo=Infinity,hi=-Infinity;for(let i=1;i<p.length;i+=3){lo=Math.min(lo,p[i]);hi=Math.max(hi,p[i]);}
   for(let i=0;i<p.length;i+=3)uv.push(Math.atan2(p[i],p[i+2])/(Math.PI*2)+.5,(p[i+1]-lo)/Math.max(.01,hi-lo));mesh.setVerticesData(VertexBuffer.UVKind,uv);
  }
 }
}

export class VehicleDetail {
 readonly launcher:TransformNode;
 readonly capsule:TransformNode;
 readonly launcherMeshes:Mesh[]=[];
 readonly capsuleMeshes:Mesh[]=[];
 constructor(scene:Scene,launcherParent:TransformNode,capsuleParent:TransformNode){
  this.launcher=new TransformNode('modern launcher detail',scene);this.launcher.parent=launcherParent;
  this.capsule=new TransformNode('modern capsule detail',scene);this.capsule.parent=capsuleParent;
  const mat=(name:string,color:string,metal:number,rough:number)=>{const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromHexString(color).toLinearSpace();m.metallic=metal;m.roughness=rough;m.environmentIntensity=.6;m.useLogarithmicDepth=true;return m;};
  const white=mat('trainer raceway coating','#cdd2ce',.05,.5),alloy=mat('trainer fastener alloy','#829094',.85,.35),black=mat('trainer heatshield carbon','#292a2a',.05,.92),vent=mat('trainer vent recess','#131c22',.15,.7),radiator=mat('trainer radiator coating','#c3cbc9',.22,.65);
  const add=(mesh:Mesh,parent:TransformNode,part:'booster'|'service'|'capsule',material:PBRMaterial)=>{mesh.parent=parent;mesh.material=material;mesh.metadata={vehiclePart:part,modernDetail:true};mesh.receiveShadows=true;(parent===this.launcher?this.launcherMeshes:this.capsuleMeshes).push(mesh);return mesh;};
  const box=(name:string,p:Vector3,size:Vector3,parent:TransformNode,part:'booster'|'service'|'capsule',material:PBRMaterial)=>{const mesh=add(MeshBuilder.CreateBox(name,{width:size.x,height:size.y,depth:size.z},scene),parent,part,material);mesh.position=p;return mesh;};
  const ring=(name:string,y:number,diameter:number,thickness:number,parent:TransformNode,part:'booster'|'service'|'capsule',material:PBRMaterial)=>{const mesh=add(MeshBuilder.CreateTorus(name,{diameter,thickness,tessellation:96},scene),parent,part,material);mesh.position.y=y;return mesh;};
  for(const angle of [Math.PI*.25,Math.PI*1.25]){
   const pipe=add(MeshBuilder.CreateCylinder('Rocket_Stage1 insulated cable raceway',{height:35.5,diameter:.065,tessellation:12},scene),this.launcher,'booster',white);pipe.position.set(Math.sin(angle)*1.866,21.5,Math.cos(angle)*1.866);
  }
  for(let i=0;i<16;i++){const a=i*Math.PI/8;const panel=box('Rocket_Stage1 interstage vent',new Vector3(Math.sin(a)*1.86,43.1,Math.cos(a)*1.86),new Vector3(.12,.5,.016),this.launcher,'booster',vent);panel.rotation.y=a;}
  for(const parent of [this.launcher,this.capsule]){
   // Keep original 58.4 m capsule base and 65.9 m docking plane untouched.
   ring('Rocket_Stage2 capsule thermal seal',58.43,3.99,.036,parent,'capsule',black);
   const shield=add(MeshBuilder.CreateCylinder('Rocket_Stage2 heat shield',{diameter:3.985,height:.07,tessellation:96},scene),parent,'capsule',black);shield.position.y=58.415;
   ring('Rocket_Stage2 capture ring',65.9,.944,.025,parent,'capsule',alloy);
   for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    const latch=box('Rocket_Stage2 capture latch',new Vector3(Math.sin(a)*.41,65.925,Math.cos(a)*.41),new Vector3(.045,.025,.105),parent,'capsule',alloy);latch.rotation.y=a;
    const nozzle=add(MeshBuilder.CreateCylinder('Rocket_Stage2 RCS nozzle',{height:.105,diameterBottom:.10,diameterTop:.06,tessellation:16,cap:Mesh.NO_CAP},scene),parent,'capsule',alloy);const axis=new Vector3(Math.sin(a),0,Math.cos(a));nozzle.position=axis.scale(1.865);nozzle.position.y=60;nozzle.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Up(),axis,new Quaternion());
    const inset=add(MeshBuilder.CreateCylinder('Rocket_Stage2 RCS recess',{height:.008,diameter:.05,tessellation:16},scene),parent,'capsule',vent);inset.position=axis.scale(1.918);inset.position.y=60;inset.rotationQuaternion=nozzle.rotationQuaternion.clone();
   }
   for(let i=0;i<20;i++){
    const a=i*Math.PI/10,slat=box('Rocket_Stage2 service radiator',new Vector3(Math.sin(a)*1.958,56.85,Math.cos(a)*1.958),new Vector3(.19,2.25,.016),parent,'service',radiator);slat.rotation.y=a;
   }
   ring('Rocket_Stage2 service separation flange',58.33,3.91,.035,parent,'service',alloy);
  }
 }
 setEnabled(enabled:boolean){this.launcher.setEnabled(enabled);this.capsule.setEnabled(enabled);}
}

/** Extract the actual upper-stage shell from the consolidated trainer asset.
 * The source also contains the crew capsule; a discarded clone must not carry it. */
export function discardedUpperStageIndices(mesh:Mesh,launcher:TransformNode):number[]{
 const positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();if(!positions||!indices)return[];
 const relative=mesh.computeWorldMatrix(true).multiply(Matrix.Invert(launcher.computeWorldMatrix(true))),out:number[]=[];
 for(let i=0;i<indices.length;i+=3){let y=0;for(let j=0;j<3;j++){const v=indices[i+j]*3;y+=Vector3.TransformCoordinates(new Vector3(positions[v],positions[v+1],positions[v+2]),relative).y;}if(y/3<=55.5)out.push(indices[i],indices[i+1],indices[i+2]);}
 return out;
}
