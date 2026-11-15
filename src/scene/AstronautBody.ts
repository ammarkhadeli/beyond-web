import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Matrix,Quaternion,Vector3 } from '@babylonjs/core/Maths/math';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { Scene } from '@babylonjs/core/scene';
import type { AstronautRig } from './AstronautRig';

/** NASA textured suit with lightweight procedural skinning. The original static
 * meshes receive blended hip/shoulder weights; this is authored motion, not mocap. */
export class AstronautBody {
 readonly ready:Promise<void>;
 private standing:TransformNode;private seated:TransformNode;private full:TransformNode;
 private gait=0;private breathing=0;private reaching=0;
 private rigs=new Map<TransformNode,Bone[]>();
 constructor(scene:Scene){
  this.standing=new TransformNode('suited standing body',scene);this.seated=new TransformNode('suited restrained body',scene);this.full=new TransformNode('suited external astronaut',scene);
  this.ready=Promise.all([['astronaut-standing.glb',this.standing],['astronaut-seated.glb',this.seated],['astronaut-full.glb',this.full]].map(async([file,parent])=>{
   if(file==='astronaut-full.glb'){const response=await fetch('/assets/'+file,{method:'HEAD'});if(!response.ok||response.headers.get('content-type')?.includes('text/html'))return;}
   const imported=await SceneLoader.ImportMeshAsync('','/assets/',file as string,scene),root=imported.meshes[0];root.parent=parent as TransformNode;root.rotationQuaternion=Quaternion.RotationAxis(Vector3.Up(),Math.PI);
   const seated=parent===this.seated;
   // Bones retain the imported model's metre-scale bind pose.
   const skeleton=new Skeleton('suited joints '+file,'suited joints '+file,scene);
   const pelvis=new Bone('body',skeleton,null,Matrix.Identity());
   const bones=[new Bone('left hip',skeleton,pelvis,Matrix.Translation(-.14,seated?.5:.76,.03)),new Bone('right hip',skeleton,pelvis,Matrix.Translation(.14,seated?.5:.76,.03)),new Bone('left shoulder',skeleton,pelvis,Matrix.Translation(-.25,seated?1.01:1.24,.02)),new Bone('right shoulder',skeleton,pelvis,Matrix.Translation(.25,seated?1.01:1.24,.02))];
   this.rigs.set(parent as TransformNode,bones);
   for(const mesh of imported.meshes){mesh.isPickable=false;mesh.metadata={astronautBody:true};mesh.receiveShadows=true;if(mesh.material instanceof PBRMaterial){mesh.material.useLogarithmicDepth=true;mesh.material.backFaceCulling=true;mesh.material.directIntensity=.45;mesh.material.environmentIntensity=.55;mesh.material.roughness=Math.max(mesh.material.roughness??.7,.65);}
    if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind);if(!positions)continue;
    const ids:number[]=[],weights:number[]=[];
    for(let i=0;i<positions.length;i+=3){const x=positions[i],y=positions[i+1];let bone=0,weight=0;
      if(y<(seated?.48:.8)){bone=x<0?1:2;weight=Math.min(1,Math.max(0,((seated?.58:.85)-y)/.2));}
      if(Math.abs(x)>.23&&y>(seated?.58:.72)){bone=x<0?3:4;weight=Math.min(1,Math.max(0,(Math.abs(x)-.23)/.12));}
      ids.push(0,bone,0,0);weights.push(1-weight,weight,0,0);
    }
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,ids,false,4);mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,weights,false,4);mesh.skeleton=skeleton;mesh.numBoneInfluencers=4;
   }
  })).then(()=>{});
 }
 reach(){this.reaching=.7;}
 update(rig:AstronautRig,enabled:boolean,external:boolean,dt:number){
  const seated=rig.mode==='seated'&&rig.environment!=='lunar';this.standing.setEnabled(enabled&&!seated&&!external);this.seated.setEnabled(enabled&&seated&&!external);this.full.setEnabled(enabled&&!seated&&external);
  if(!enabled)return;const root=external?this.full:seated?this.seated:this.standing,orientation=rig.getBodyOrientation(),matrix=Matrix.Identity();orientation.toRotationMatrix(matrix);
  const seconds=Math.min(.1,Math.max(0,dt)),speed=rig.velocity.length();this.gait+=speed*seconds;this.breathing+=seconds;this.reaching=Math.max(0,this.reaching-seconds);
  const pose=rig.getPose(),eye=seated?new Vector3(0,1.30,.315):new Vector3(0,1.65,.315);root.position.copyFrom(pose.position.subtract(Vector3.TransformCoordinates(eye,matrix)));root.rotationQuaternion=orientation;
  const walking=!seated&&rig.environment==='lunar',stride=Math.min(1,speed/1.1),phase=this.gait*4.1;
  const bones=this.rigs.get(root);if(bones){const swing=walking?Math.sin(phase)*.22*stride:Math.sin(this.breathing*.9)*.018;
   bones[0].setRotationQuaternion(Quaternion.RotationAxis(Vector3.Right(),swing));bones[1].setRotationQuaternion(Quaternion.RotationAxis(Vector3.Right(),-swing));
   const reach=this.reaching>0?Math.sin(Math.PI*this.reaching/.7)*.28:0;
   bones[2].setRotationQuaternion(Quaternion.RotationYawPitchRoll(0,-swing*.45,.025+Math.sin(this.breathing*1.1)*.01));
   bones[3].setRotationQuaternion(Quaternion.RotationYawPitchRoll(0,swing*.45-reach,-.025-Math.sin(this.breathing*1.1)*.01));
  }
  if(walking)root.position.y+=Math.sin(phase*2)*.012*stride;
 }
}
