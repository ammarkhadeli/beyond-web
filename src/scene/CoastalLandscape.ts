import '@babylonjs/core/Meshes/thinInstanceMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3,Matrix,Quaternion,Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import { LAUNCH_SITES, type LaunchSite } from '../game/environment';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

/** USGS/USDA orthophotography and 3DEP elevations at LC39A. Contemporary
 * roads/coast are real; structures and close vegetation are reconstructions. */
export class CoastalLandscape {
 readonly ready:Promise<void>;
 private root:TransformNode;
 setSite(site:LaunchSite){const a=LAUNCH_SITES.lc39a,b=LAUNCH_SITES[site];this.root.position.x=-(b.longitude-a.longitude)*Math.PI/180*6371000*Math.cos(a.latitude*Math.PI/180);this.root.position.z=-(b.latitude-a.latitude)*Math.PI/180*6371000;}
 constructor(scene:Scene,parent:TransformNode){
  this.root=new TransformNode('Kennedy measured landscape',scene);this.root.parent=parent;parent=this.root;
  this.ready=fetch('/assets/earth/lc39a-heights.f32').then(r=>{if(!r.ok)throw new Error('Launch terrain unavailable');return r.arrayBuffer();}).then(async buffer=>{
   const heights=new Float32Array(buffer);if(heights.length!==1024*1024)throw new Error('Launch terrain has invalid dimensions');
   const material=new PBRMaterial('USGS LC39A coastal imagery',scene);material.albedoTexture=new Texture('/assets/earth/lc39a-region.jpg',scene);material.albedoTexture.anisotropicFilteringLevel=16;material.albedoColor=new Color3(.91,.91,.91);material.metallic=0;material.roughness=.98;material.environmentIntensity=.35;material.useLogarithmicDepth=true;
   const sample=(x:number,z:number)=>{const ix=Math.max(0,Math.min(1022.999,(x+6000)/12000*1023)),iy=Math.max(0,Math.min(1022.999,(6000-z)/12000*1023)),a=Math.floor(ix),b=Math.floor(iy),u=ix-a,v=iy-b;return heights[b*1024+a]*(1-u)*(1-v)+heights[b*1024+a+1]*u*(1-v)+heights[(b+1)*1024+a]*(1-u)*v+heights[(b+1)*1024+a+1]*u*v;};
   const height=(x:number,z:number)=>Math.hypot(x,z)<120?2:x>4200?-5:sample(x,z);
   const make=(name:string,width:number,segments:number,mat:PBRMaterial)=>{
    const mesh=MeshBuilder.CreateGround(name,{width,height:width,subdivisions:segments,updatable:true},scene),positions=mesh.getVerticesData('position')!;
    for(let i=0;i<positions.length;i+=3)positions[i+1]=height(positions[i],positions[i+2]);
    mesh.updateVerticesData('position',positions,true);const normals:number[]=[];VertexData.ComputeNormals(positions,mesh.getIndices()!,normals);mesh.updateVerticesData('normal',normals);mesh.parent=parent;mesh.material=mat;mesh.receiveShadows=true;return mesh;
   };
   make('NASA launch coast, USGS measured terrain',12000,256,material);
   const detail=material.clone('USGS LC39A detailed orthophoto');detail.albedoTexture=new Texture('/assets/earth/lc39a-detail.jpg',scene);detail.albedoTexture.anisotropicFilteringLevel=16;
   detail.bumpTexture=new Texture('/assets/earth-normal.jpg',scene);detail.bumpTexture.level=.13;detail.bumpTexture.anisotropicFilteringLevel=16;(detail.bumpTexture as Texture).uScale=1500;(detail.bumpTexture as Texture).vScale=1500;
   const patch=make('LC39A 4km photographic detail',4000,320,detail);patch.position.y=.1;
   // Vegetation placement is masked by green pixels in the local orthophoto.
   // Thin instances keep thousands of close grass clumps in a single draw call.
   try{
    const img=new Image();img.src='/assets/earth/lc39a-detail.jpg';await img.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;ctx.drawImage(img,0,0,512,512);const pixels=ctx.getImageData(0,0,512,512).data;
    const grass=new Mesh('reconstructed coastal vegetation',scene),data=new VertexData(),positions:number[]=[],indices:number[]=[],normals:number[]=[];
    for(let blade=0;blade<6;blade++){const a=blade*Math.PI/3,r=.13+blade%3*.1,x=Math.cos(a)*r,z=Math.sin(a)*r,o=positions.length/3;positions.push(x-.065,0,z,x+.065,0,z,x+.12*Math.sin(a),.38+(blade%3)*.18,z+.15*Math.cos(a));indices.push(o,o+1,o+2);normals.push(0,.5,-.86,0,.5,-.86,0,.5,-.86);}
    data.positions=positions;data.indices=indices;data.normals=normals;data.applyToMesh(grass);grass.parent=parent;grass.isPickable=false;grass.receiveShadows=true;
    const gm=new PBRMaterial('coastal grass',scene);gm.albedoColor=new Color3(.31,.36,.17);gm.roughness=.97;gm.metallic=0;gm.backFaceCulling=false;gm.useLogarithmicDepth=true;grass.material=gm;
    let seed=62219;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};const matrices:number[]=[];
    for(let i=0;i<16000;i++){const x=(rand()-.5)*1300,z=(rand()-.5)*1300,rad=Math.hypot(x,z);if(rad<130)continue;const px=Math.floor((x/4000+.5)*512),py=Math.floor((.5-z/4000)*512),off=(py*512+px)*4,r=pixels[off],g=pixels[off+1],b=pixels[off+2];if(g<r*1.04||g<b*1.08||g<42||r+g+b>480)continue;const y=height(x,z);if(y<.7)continue;const size=.75+rand()*.7;matrices.push(...Matrix.Compose(new Vector3(size,size,size),Quaternion.RotationAxis(Vector3.Up(),rand()*Math.PI*2),new Vector3(x,y+.11,z)).toArray());}
    if(matrices.length)grass.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);else grass.dispose();
   }catch{/* Close vegetation is optional; measured terrain remains available. */}
  });
 }
}
