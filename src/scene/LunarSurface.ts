import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3,Matrix,Quaternion,Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import { TerrainLogDepthClipping } from './TerrainLogDepthClipping';

interface TerrainMetadata {width:number;height:number;spacingMeters:number;datumElevationMeters:number;imagePixelAtAnchor:[number,number]}
/** Fixed Apollo11-area site from NASA LROC NAC stereo terrain and orthophotography.
 * Local X=east,Y=up,Z=north. Coordinates are metres from the specified anchor. */
export class LunarSurface {
  readonly root:TransformNode;
  readonly material:PBRMaterial;
  readonly ready:Promise<void>;
  private data=new Float32Array();
  private metadata:TerrainMetadata|null=null;
  private anchorCorrection=0;
  constructor(private scene:Scene){
    this.root=new TransformNode('Apollo11 LROC landing terrain',scene);
    this.material=new PBRMaterial('NASA LROC orthophotography',scene);this.material.albedoColor=new Color3(.74,.74,.74);this.material.metallic=0;this.material.roughness=.96;this.material.useLogarithmicDepth=true;this.material.environmentIntensity=.2;
    if(scene.getEngine().isWebGPU)new TerrainLogDepthClipping(this.material);
    this.material.albedoTexture=new Texture('/assets/lunar/apollo11-surface.png',scene);this.material.albedoTexture.anisotropicFilteringLevel=16;
    this.material.bumpTexture=new Texture('/assets/moon-normal.jpg',scene);(this.material.bumpTexture as Texture).uScale=1024;(this.material.bumpTexture as Texture).vScale=1024;this.material.bumpTexture.level=.10;this.material.bumpTexture.anisotropicFilteringLevel=16;(this.material.bumpTexture as Texture).uScale=680;(this.material.bumpTexture as Texture).vScale=680;
    this.material.detailMap.isEnabled=false;this.material.detailMap.texture=new Texture('/assets/moon-albedo.jpg',scene);(this.material.detailMap.texture as Texture).uScale=2048;(this.material.detailMap.texture as Texture).vScale=2048;this.material.detailMap.diffuseBlendLevel=.08;this.material.detailMap.bumpLevel=0;this.material.detailMap.roughnessBlendLevel=0;
    this.ready=this.load();
  }
  private sample(east:number,north:number){
    const m=this.metadata;if(!m||!this.data.length)return 0;
    const u=Math.max(0,Math.min(m.width-1.001,m.imagePixelAtAnchor[0]+east/m.spacingMeters));
    const v=Math.max(0,Math.min(m.height-1.001,m.imagePixelAtAnchor[1]-north/m.spacingMeters));
    const x=Math.floor(u),y=Math.floor(v),a=u-x,b=v-y;
    const h=(xx:number,yy:number)=>this.data[yy*m.width+xx];
    return (h(x,y)*(1-a)+h(x+1,y)*a)*(1-b)+(h(x,y+1)*(1-a)+h(x+1,y+1)*a)*b;
  }
  heightAt=(east:number,north:number)=>this.sample(east,north)-this.anchorCorrection-(east*east+north*north)/(2*1737400);
  private async load(){
    const [metadata,buffer]=await Promise.all([fetch('/assets/lunar/apollo11-terrain.json').then(r=>{if(!r.ok)throw new Error('Lunar terrain metadata unavailable');return r.json() as Promise<TerrainMetadata>;}),fetch('/assets/lunar/apollo11-heights.f32').then(r=>{if(!r.ok)throw new Error('Lunar elevation data unavailable');return r.arrayBuffer();})]);
    this.metadata=metadata;this.data=new Float32Array(buffer);this.anchorCorrection=this.sample(0,0);
    const ground=MeshBuilder.CreateGround('LROC measured surface',{width:2048,height:2048,subdivisions:512,updatable:true},this.scene);
    const vertices=ground.getVerticesData('position')!,uvs=ground.getVerticesData('uv')!;
    for(let i=0;i<vertices.length;i+=3){vertices[i+1]=this.heightAt(vertices[i],vertices[i+2]);uvs[i/3*2]=(metadata.imagePixelAtAnchor[0]+vertices[i]/2)/(metadata.width-1);uvs[i/3*2+1]=1-(metadata.imagePixelAtAnchor[1]-vertices[i+2]/2)/(metadata.height-1);}
    ground.updateVerticesData('position',vertices,true);ground.updateVerticesData('uv',uvs);
    const normals:number[]=[];VertexData.ComputeNormals(vertices,ground.getIndices()!,normals);ground.updateVerticesData('normal',normals);ground.material=this.material;ground.parent=this.root;ground.receiveShadows=true;
    await this.outerTerrain();this.scatterRocks();
  }
  private async outerTerrain(){
    const buffer=await fetch('/assets/lunar/moon-global-heights.u16').then(r=>r.arrayBuffer());const heights=new Uint16Array(buffer as ArrayBuffer);
    const datum=this.metadata!.datumElevationMeters,latitude=.674*Math.PI/180,longitude=23.47*Math.PI/180;
    const globalHeight=(x:number,z:number)=>{const lat=latitude+z/1737400,lon=longitude+x/(1737400*Math.cos(latitude)),u=(lon/Math.PI/2+.5)*1440,w=(.5-lat/Math.PI)*720,ix=Math.floor(u),iy=Math.floor(w),a=u-ix,b=w-iy;const at=(xx:number,yy:number)=>(heights[Math.max(0,Math.min(719,yy))*1440+((xx%1440)+1440)%1440]-20000)*.5;return (at(ix,iy)*(1-a)+at(ix+1,iy)*a)*(1-b)+(at(ix,iy+1)*(1-a)+at(ix+1,iy+1)*a)*b;};
    const h0=globalHeight(0,0),axis=Array.from({length:257},(_,i)=>{const d=i-128,a=Math.abs(d);return Math.sign(d)*(a<=32?a*32:1024*Math.exp((a-32)/96*Math.log(64000/1024)));});
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let j=0;j<257;j++)for(let i=0;i<257;i++){
      const x=axis[i],z=axis[256-j],edge=Math.max(Math.abs(x),Math.abs(z)),blend=Math.max(0,Math.min(1,(edge-1024)/2000));
      const global=globalHeight(x,z)-datum+(datum-h0)*(1-Math.max(0,Math.min(1,(edge-2000)/8000)));
      const local=this.sample(Math.max(-1024,Math.min(1024,x)),Math.max(-1024,Math.min(1024,z)))-this.anchorCorrection;
      positions.push(x,local*(1-blend)+global*blend-(x*x+z*z)/(2*1737400),z);uvs.push((longitude+x/(1737400*Math.cos(latitude)))/Math.PI/2+.5,(latitude+z/1737400)/Math.PI+.5);
      if(i<256&&j<256&&!(Math.max(Math.abs(axis[i]),Math.abs(axis[i+1]))<=1024&&Math.max(Math.abs(axis[256-j]),Math.abs(axis[255-j]))<=1024)){const a=j*257+i;indices.push(a,a+1,a+257,a+1,a+258,a+257);}
    }
    const ring=new Mesh('LOLA measured terrain to lunar horizon',this.scene),data=new VertexData(),normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);data.positions=positions;data.normals=normals;data.uvs=uvs;data.indices=indices;data.applyToMesh(ring);ring.parent=this.root;ring.receiveShadows=true;ring.refreshBoundingInfo();
    const mat=new PBRMaterial('LROC orbital reflectance at the horizon',this.scene);mat.albedoTexture=new Texture('/assets/lunar/moon-lroc-8k.jpg',this.scene);mat.albedoTexture.anisotropicFilteringLevel=16;mat.albedoColor=new Color3(.58,.58,.58);mat.roughness=.98;mat.metallic=0;mat.environmentIntensity=.2;mat.useLogarithmicDepth=true;ring.material=mat;
  }
  private scatterRocks(){
    let seed=714;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    const mat=new PBRMaterial('small regolith fragments',this.scene);mat.albedoTexture=new Texture('/assets/moon-albedo.jpg',this.scene);mat.bumpTexture=new Texture('/assets/moon-normal.jpg',this.scene);mat.bumpTexture.level=.45;mat.albedoColor=new Color3(.42,.43,.41);mat.roughness=.98;mat.metallic=0;mat.useLogarithmicDepth=true;
    for(let shape=0;shape<3;shape++){
      const rock=MeshBuilder.CreateIcoSphere('scattered lunar fragments '+shape,{radius:1,subdivisions:2,flat:false},this.scene),vertices=rock.getVerticesData('position')!;
      for(let i=0;i<vertices.length;i+=3){const x=vertices[i],y=vertices[i+1],z=vertices[i+2],r=.8+.15*Math.sin(x*5+z*4)+.08*Math.cos(y*8-x*3);vertices[i]*=r;vertices[i+1]*=r*.65;vertices[i+2]*=r;}
      rock.updateVerticesData('position',vertices,true);const normals:number[]=[];VertexData.ComputeNormals(vertices,rock.getIndices()!,normals);rock.updateVerticesData('normal',normals);rock.parent=this.root;rock.material=mat;rock.receiveShadows=true;
      const matrices:Float32Array=new Float32Array(80*16);let count=0;
      for(let i=0;i<100&&count<80;i++){const a=random()*Math.PI*2,r=6+Math.sqrt(random())*95,x=Math.cos(a)*r,z=Math.sin(a)*r,size=.035+random()**4*.28;const m=Matrix.Compose(new Vector3(size,size,size),Quaternion.RotationYawPitchRoll(random()*6,random()*.5,random()*.5),new Vector3(x,this.heightAt(x,z)+size*.28,z));m.copyToArray(matrices,count*16);count++;}
      rock.thinInstanceSetBuffer('matrix',matrices,16,true);rock.thinInstanceRefreshBoundingInfo(true);
    }
  }

}
