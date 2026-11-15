import { Ray } from '@babylonjs/core/Culling/ray';
import { Color3,Vector3,Matrix } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Curve3 } from '@babylonjs/core/Maths/math.path';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneInteractions } from './SceneInteractions';
import type { State } from '../game/simulation';

const vec=(x:number,y:number,z:number)=>new Vector3(x,y,z);
/** Compact, physical task stations. NASA environment assets retain their original
 * appearance; these additional training props are labelled reconstructions. */
export class Worksites {
 readonly lunar:TransformNode;readonly station:TransformNode;
 private state:State|null=null;
 private sample:Mesh|null=null;
 private sensorApron:Mesh|null=null;
 private returnLid:Mesh|null=null;
 constructor(private scene:Scene,private interactions:SceneInteractions,lunarParent:TransformNode,stationParent:TransformNode,height:(x:number,z:number)=>number){
  this.lunar=new TransformNode('surface science equipment',scene);this.lunar.parent=lunarParent;
  this.station=new TransformNode('station experiment worksite',scene);this.station.parent=stationParent;
  const gray=this.mat('equipment satin aluminium','#aeb5b6',.65),gold=this.mat('thermal blanket','#aca084',.72),black=this.mat('instrument polymer','#202728',.05),red=this.mat('isolator guard','#8a4937',.3);
  const ground=(x:number,z:number)=>height(x,z);
  gold.roughness=.39;const foil=new DynamicTexture('thermal blanket wrinkle normals',{width:256,height:256},scene,false);const fc=foil.getContext() as CanvasRenderingContext2D,fi=fc.createImageData(256,256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=Math.cos(x*.35+Math.sin(y*.09)*3)*.5+Math.sin(x*.09+y*.37)*.2,b=Math.cos(y*.31+Math.sin(x*.07)*4)*.6,n=Math.hypot(a,b,1),i=(y*256+x)*4;fi.data[i]=(a/n*.5+.5)*255;fi.data[i+1]=(b/n*.5+.5)*255;fi.data[i+2]=(1/n*.5+.5)*255;fi.data[i+3]=255;}fc.putImageData(fi,0,0);foil.update();gold.bumpTexture=foil;
  const unit=new TransformNode('passive seismometer package',scene);unit.parent=this.lunar;unit.position=vec(6,ground(6,-5),-5);
  const sensor=MeshBuilder.CreateCylinder('seismometer thermal shroud',{height:.31,diameter:.43,tessellation:64,subdivisions:10,updatable:true},scene);sensor.parent=unit;sensor.position.y=.22;sensor.material=gold;this.roughen(sensor,.012);
  for(const y of [.08,.36]){const rim=MeshBuilder.CreateTorus('thermal blanket retaining ring',{diameter:.43,thickness:.012,tessellation:48},scene);rim.parent=unit;rim.position.y=y;rim.material=gray;}
  const apron=this.sensorApron=MeshBuilder.CreateGround('deployed seismic thermal blanket',{width:1.0,height:1.08,subdivisions:32,updatable:true},scene);const ap=apron.getVerticesData('position')!;for(let i=0;i<ap.length;i+=3){ap[i+1]=.007+Math.sin(ap[i]*59+Math.sin(ap[i+2]*17))*Math.sin(ap[i+2]*49)*.009;ap[i]+=Math.sin(ap[i+2]*41)*.013;}const an:number[]=[];VertexData.ComputeNormals(ap,apron.getIndices()!,an);apron.updateVerticesData('position',ap,true);apron.updateVerticesData('normal',an);apron.parent=unit;apron.position.y=.018;apron.material=gold;
  for(const angle of [0,2.094,4.188]){const foot=MeshBuilder.CreateCylinder('adjustable instrument foot',{height:.12,diameter:.08,tessellation:16},scene);foot.parent=unit;foot.position=vec(Math.cos(angle)*.25,.06,Math.sin(angle)*.25);foot.material=gray;}
  this.box('experiment control case',vec(.72,.28,0),vec(.55,.5,.43),gray,unit);
  this.box('control case lid gasket',vec(.72,.501,0),vec(.558,.015,.438),black,unit);
  this.box('control case lid',vec(.72,.521,0),vec(.57,.03,.45),gray,unit);
  for(const x of [.49,.95])for(const z of [-.18,.18])this.fastener(unit,vec(x,.543,z),gray);
  for(const x of [.48,.96])this.box('case latch',vec(x,.44,-.226),vec(.04,.08,.02),black,unit);
  const wire=Curve3.CreateCatmullRomSpline([vec(.15,.14,0),vec(.28,.04,-.27),vec(.44,.035,-.39),vec(.65,.13,-.23)],24);const cable=MeshBuilder.CreateTube('sensor signal cable',{path:wire.getPoints(),radius:.008,tessellation:12},scene);cable.parent=unit;cable.material=black;
  this.box('communications reset switch',vec(.72,.56,-.02),vec(.1,.08,.13),red,unit);
  this.label('PSE / UPLINK',unit,vec(.72,.32,-.221),.36,.12).rotation.x=0;
  this.hotspot('lunar-seismometer','Seismometer','Deploy and level the seismic sensor.','activity:deploy-seismometer',unit,vec(0,.35,0),.3,2.4);
  this.hotspot('lunar-uplink','Surface equipment reset','Isolate and reset the surface equipment circuit.','resolve',unit,vec(.72,.56,-.02),.15,2.4,()=>!!this.state?.event&&!this.state.eventResolved);
  const rock=MeshBuilder.CreateSphere('sample basalt',{diameter:.27,segments:20},scene);rock.parent=this.lunar;rock.position=vec(9,ground(9,-2)+.12,-2);rock.scaling.set(1.4,.7,.9);rock.rotation.set(.2,.5,.1);const basalt=this.mat('sample rock','#72736b',.01);basalt.albedoTexture=new Texture('/assets/moon-albedo.jpg',scene);basalt.bumpTexture=new Texture('/assets/moon-normal.jpg',scene);basalt.roughness=.98;rock.material=basalt;this.roughen(rock,.16);this.sample=rock;
  this.hotspot('lunar-rock','Basalt sample','Collect a sample for return analysis.','activity:collect-sample',this.lunar,rock.position,.3,2.3);
  const tripod=new TransformNode('panorama camera tripod',scene);tripod.parent=this.lunar;tripod.position=vec(5,ground(5,4),4);
  for(const angle of [0,2.094,4.188]){const leg=MeshBuilder.CreateCylinder('tripod leg',{height:1.15,diameter:.025,tessellation:12},scene);leg.parent=tripod;leg.position=vec(Math.cos(angle)*.2,.55,Math.sin(angle)*.2);leg.rotation.z=Math.cos(angle)*.36;leg.rotation.x=Math.sin(angle)*.36;leg.material=gray;}
  this.box('panorama camera body',vec(0,1.15,0),vec(.2,.16,.16),black,tripod);const lens=MeshBuilder.CreateCylinder('camera optical lens',{height:.1,diameter:.08,tessellation:32},scene);lens.parent=tripod;lens.position=vec(0,1.15,.12);lens.rotation.x=Math.PI/2;lens.material=gray;
  const lensGlass=MeshBuilder.CreateCylinder('camera lens glass',{height:.006,diameter:.063,tessellation:48},scene);lensGlass.parent=tripod;lensGlass.position=vec(0,1.15,.173);lensGlass.rotation.x=Math.PI/2;lensGlass.material=this.mat('coated camera optic','#122b36',.55);
  this.label('SURVEY CAMERA',tripod,vec(0,1.17,-.084),.175,.055).rotation.x=0;
  for(const x of [-.11,.11])this.box('camera hand grip',vec(x,1.15,0),vec(.035,.17,.17),gray,tripod);
  this.hotspot('lunar-camera','Panorama camera','Record the landing-site panorama.','activity:record-panorama',tripod,vec(0,1.15,0),.3,2.3);
  const containerGround=ground(-2,-2);
  this.box('sample return container',vec(-2,containerGround+.18,-2),vec(.5,.32,.38),gray,this.lunar);
  this.box('sample case gasket',vec(-2,containerGround+.34,-2),vec(.506,.012,.386),black,this.lunar);
  this.returnLid=this.box('sample case pressure lid',vec(-2,containerGround+.36,-2),vec(.52,.026,.4),gray,this.lunar);
  for(const x of [-2.21,-1.79]){this.box('sample case latch',vec(x,containerGround+.27,-2.202),vec(.045,.1,.025),black,this.lunar);this.fastener(this.lunar,vec(x,containerGround+.379,-1.86),gray);}
  this.label('SAMPLE RETURN',this.lunar,vec(-2,containerGround+.198,-2.196),.36,.12).rotation.x=0;
  this.hotspot('lunar-stow','Sample return container','Seal the collected samples for return.','activity:stow-samples',this.lunar,vec(-2,ground(-2,-2)+.36,-2),.35,2.5);
  this.hotspot('lunar-board','Lunar module ladder','Climb aboard the lunar module.','board',this.lunar,vec(0,1.4,-3),.55,2.8);
  const wallAt=(y:number,z:number)=>{
   const matrix=stationParent.computeWorldMatrix(true),origin=Vector3.TransformCoordinates(vec(0,y,z),matrix),direction=Vector3.TransformNormal(vec(1,0,0),matrix).normalize();
   const hit=scene.pickWithRay(new Ray(origin,direction,2.2),mesh=>mesh.isDescendantOf(stationParent)&&!mesh.isDescendantOf(this.station));
   return hit?.pickedPoint?Vector3.TransformCoordinates(hit.pickedPoint,Matrix.Invert(matrix)).x:1.2;
  };
  const positions=[vec(wallAt(-.1,-1.8)-.012,-.1,-1.8),vec(wallAt(-.1,-.5)-.012,-.1,-.5),vec(wallAt(-.1,.8)-.012,-.1,.8),vec(wallAt(-.1,2.1)-.012,-.1,2.1)];
  const tasks=[['install-sample','Sample chamber','Install the sample cartridge.'],['power-experiment','Experiment power','Connect experiment power.'],['record-observation','Observation recorder','Record the experiment observations.'],['stow-results','Results container','Secure the experiment records.']];
  tasks.forEach(([id,name,description],i)=>{
   const p=positions[i];this.box(name+' rack front',p,vec(.012,.28,.36),gray,this.station);
   for(const z of [-.16,.16])this.box('recessed front edge',p.add(vec(-.01,0,z)),vec(.012,.28,.012),black,this.station);
   for(const y of [-.12,.12])this.box('front plate edge',p.add(vec(-.01,y,0)),vec(.012,.012,.33),black,this.station);
   const latch=MeshBuilder.CreateCylinder('rack rotary latch',{diameter:.046,height:.022,tessellation:24},scene);latch.rotation.z=Math.PI/2;latch.position=p.add(vec(-.026,-.07,.11));latch.parent=this.station;latch.material=black;
   const handle=MeshBuilder.CreateCylinder('cartridge retaining handle',{diameter:.018,height:.14,tessellation:16},scene);handle.position=p.add(vec(-.035,0,-.10));handle.parent=this.station;handle.material=gray;
   const lamp=MeshBuilder.CreateSphere('experiment status lamp',{diameter:.014,segments:12},scene);lamp.position=p.add(vec(-.025,.08,.1));lamp.parent=this.station;lamp.material=this.mat('green status indicator','#6e9c76',.1);
   const placard=this.label(name.toUpperCase(),this.station,p.add(vec(-.027,.065,-.005)),.24,.055);placard.rotation.set(0,Math.PI/2,0);
   this.hotspot('iss-'+id,name,description,'activity:'+id,this.station,p.add(vec(-.035,0,0)),.22,2.5);
  });
  const breaker=vec(wallAt(.6,-.5)-.025,.6,-.5);this.box('circuit breaker plate',breaker,vec(.012,.15,.14),gray,this.station);
  const reset=MeshBuilder.CreateCylinder('guarded breaker reset',{diameter:.042,height:.03,tessellation:24},scene);reset.rotation.z=Math.PI/2;reset.position=breaker.add(vec(-.025,0,0));reset.parent=this.station;reset.material=red;
  this.hotspot('iss-breaker','Experiment breaker','Isolate and reset the experiment circuit.','resolve',this.station,breaker.add(vec(-.045,0,0)),.13,2.4,()=>!!this.state?.event&&!this.state.eventResolved);
  this.hotspot('station-return','Spacecraft hatch','Return to the docked spacecraft.','board',this.station,vec(0,0,-2.65),.6,2.5);
 }
 private mat(name:string,color:string,metallic:number){const mat=new PBRMaterial(name,this.scene);mat.albedoColor=Color3.FromHexString(color);mat.roughness=.55;mat.metallic=metallic;mat.useLogarithmicDepth=true;return mat;}
 private box(name:string,position:Vector3,size:Vector3,material:PBRMaterial,parent:TransformNode){
  const mesh=new Mesh(name,this.scene),data=new VertexData(),positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
  const half=[size.x/2,size.y/2,size.z/2],r=Math.min(.018,...half.map(v=>v*.24));
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const u=(axis+1)%3,w=(axis+2)%3,base=positions.length/3;
   const values=(h:number)=>[-h,-h+r,0,h-r,h];
   for(let j=0;j<5;j++)for(let i=0;i<5;i++){
    const p=[0,0,0];p[axis]=half[axis]*sign;p[u]=values(half[u])[i];p[w]=values(half[w])[j];
    const q=p.map((v,k)=>Math.max(-half[k]+r,Math.min(half[k]-r,v))),delta=p.map((v,k)=>v-q[k]),length=Math.hypot(...delta)||1,n=delta.map(v=>v/length);
    positions.push(...q.map((v,k)=>v+n[k]*r));normals.push(...n);uvs.push(i/4,j/4);
   }
   for(let j=0;j<4;j++)for(let i=0;i<4;i++){const a=base+j*5+i,b=a+1,c=a+6,d=a+5;if(sign>0)indices.push(a,c,b,a,d,c);else indices.push(a,b,c,a,c,d);}
  }
  data.positions=positions;data.normals=normals;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);mesh.position=position;mesh.material=material;mesh.parent=parent;mesh.receiveShadows=true;return mesh;
 }
 private fastener(parent:TransformNode,p:Vector3,material:PBRMaterial){const screw=MeshBuilder.CreateCylinder('captive fastener',{height:.006,diameter:.013,tessellation:16},this.scene);screw.position=p;screw.parent=parent;screw.material=material;}
 private roughen(mesh:Mesh,amount:number){const p=mesh.getVerticesData('position');if(!p)return;for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2],f=1+amount*(Math.sin(x*37+y*51+z*21)*.5+Math.cos(x*71-z*43+y*27)*.5);p[i]*=f;p[i+1]*=f;p[i+2]*=f;}const normals:number[]=[];VertexData.ComputeNormals(p,mesh.getIndices()??[],normals);mesh.setVerticesData('position',p);mesh.setVerticesData('normal',normals);mesh.refreshBoundingInfo();}
 private label(text:string,parent:TransformNode,position:Vector3,width:number,height:number){const texture=new DynamicTexture(text,{width:512,height:256},this.scene,false);const c=texture.getContext();c.fillStyle='#c2c5bd';c.fillRect(0,0,512,256);c.fillStyle='#263133';c.font='bold 42px sans-serif';c.fillText(text,24,140);texture.update();const mat=this.mat(text+' placard','#ffffff',0);mat.albedoTexture=texture;const panel=MeshBuilder.CreatePlane(text+' equipment label',{width,height},this.scene);panel.rotation.x=Math.PI/2;panel.position=position;panel.parent=parent;panel.material=mat;panel.isPickable=false;panel.metadata={interactionSurface:true};return panel;}
 private hotspot(id:string,label:string,description:string,action:string,parent:TransformNode,position:Vector3,radius:number,reach:number,available=()=>true){this.interactions.register({id,label,description,action,parent,position,radius,reach,kind:action==='board'?'hatch':'equipment',enabled:()=>available()&&!this.state?.completedActivities.includes(action.replace('activity:',''))});}
 update(state:State){this.state=state;this.sample?.setEnabled(!state.completedActivities.includes('collect-sample'));this.sensorApron?.scaling.setAll(state.completedActivities.includes('deploy-seismometer')?1:.38);if(this.returnLid)this.returnLid.rotation.z=state.completedActivities.includes('stow-samples')?0:.04;}
}
