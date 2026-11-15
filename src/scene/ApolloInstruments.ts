import { Color3, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { State } from '../game/simulation';

/** Live inserts follow Smithsonian's measured FDAI and DSKY annotations. The
 * displayed training values are game telemetry, not an Apollo AGC emulator. */
export class ApolloInstruments {
  private dsky:DynamicTexture;
  private attitude:DynamicTexture;
  private clock=0;
  constructor(scene:Scene,parent:TransformNode){
    const normal=new Vector3(0,-.9562,-.2927).normalize();
    const surface=(name:string,position:Vector3,width:number,height:number,circular=false)=>{
      const mesh=circular?MeshBuilder.CreateDisc(name,{radius:width/2,tessellation:96},scene):MeshBuilder.CreatePlane(name,{width,height},scene);
      mesh.parent=parent;mesh.position=position.add(normal.scale(circular?.015:.008));mesh.rotationQuaternion=Quaternion.Identity();
      Quaternion.FromUnitVectorsToRef(new Vector3(0,0,-1),normal,mesh.rotationQuaternion);
      const texture=new DynamicTexture(name+'-readout',{width:512,height:circular?512:1024},scene,false);texture.vScale=-1;texture.vOffset=1;
      const material=new StandardMaterial(name+'-glass',scene);material.disableLighting=true;material.emissiveTexture=texture;material.diffuseColor=Color3.Black();material.specularColor=Color3.Black();material.useLogarithmicDepth=true;material.backFaceCulling=false;mesh.material=material;
      mesh.metadata={interactionSurface:true};return texture;
    };
    this.attitude=surface('live-FDAI',new Vector3(-.327168,2.183194,-.714560),.085,.085,true);
    this.dsky=surface('live-DSKY-registers',new Vector3(-.286647,2.125038,-.569882),.046,.100);this.dsky.vScale=1;this.dsky.vOffset=0;
    const display=scene.getMeshByName('live-DSKY-registers') as Mesh;display.position.setAll(0);display.rotationQuaternion=Quaternion.Identity();
    const corners=[new Vector3(-.311272,2.135935,-.618166),new Vector3(-.268039,2.135870,-.618203),new Vector3(-.307446,2.109963,-.520595),new Vector3(-.258973,2.109922,-.520633)];
    const data=new VertexData();data.positions=corners.flatMap(p=>p.add(normal.scale(.008)).asArray());data.uvs=[0,1,1,1,0,0,1,0];data.indices=[0,1,2,1,3,2];data.normals=corners.flatMap(()=>normal.asArray());data.applyToMesh(display);
  }
  description(state:State){const scale=state.altitude<99999?1:state.altitude<9999999?100:10000;return `R1 altitude: ${scale} m per count. R2 vertical speed: 0.1 m/s per count. R3 horizontal speed in the ${state.trajectory.referenceBody === 'moon' ? 'Moon' : 'Earth'}-centered inertial frame: 1 m/s per count. A rotating launchpad has nonzero inertial speed. Training telemetry, not original AGC software.`;}
  update(state:State,dt:number){
    this.clock+=Math.max(0,dt);if(this.clock<.1&&dt!==0)return;this.clock=0;
    const d=this.dsky.getContext() as CanvasRenderingContext2D;
    d.fillStyle='#151b15';d.fillRect(0,0,512,1024);d.textAlign='center';d.textBaseline='middle';
    d.font='44px monospace';d.fillStyle='#acb3a0';d.fillText('PROG',390,65);d.fillText('VERB',135,65);d.fillText('NOUN',135,206);
    d.fillStyle='#c7e8b2';d.font='88px monospace';d.fillText(state.phase==='launch'?'11':state.phase==='approach'?'64':state.phase==='science'?'00':'40',390,150);d.fillText('16',135,145);d.fillText('62',135,290);
    const signed=(n:number)=>`${n<0?'−':'+'}${String(Math.min(99999,Math.round(Math.abs(n)))).padStart(5,'0')}`;
    d.font='91px monospace';d.textAlign='center';
    [state.altitude/(state.altitude<99999?1:state.altitude<9999999?100:10000),state.verticalSpeed*10,(state.horizontalSpeed||state.speed)].forEach((n,i)=>{d.fillStyle='#080e09';d.fillRect(18,392+i*195,476,146);d.fillStyle='#c7e8b2';d.fillText(signed(n),256,469+i*195);});this.dsky.update();
    const a=this.attitude.getContext() as CanvasRenderingContext2D;a.clearRect(0,0,512,512);a.save();a.beginPath();a.arc(256,256,254,0,Math.PI*2);a.clip();
    const t=state.trajectory,origin=t.referenceBody==='moon'?t.moonPosition:[0,0,0],radial=new Vector3(t.position[0]-origin[0],t.position[1]-origin[1],t.position[2]-origin[2]).normalize(),right=Vector3.Cross(radial,new Vector3(0,0,1)).normalize(),north=Vector3.Cross(right,radial).normalize(),reference=Quaternion.RotationQuaternionFromAxis(right,radial,north),attitude=new Quaternion(...t.attitudeQuaternion),angles=reference.conjugate().multiply(attitude).toEulerAngles();
    const pitch=angles.z,shift=Math.sin(pitch)*110;a.translate(256,256);a.rotate(angles.y);a.translate(-256,-256);a.fillStyle='#b3b7aa';a.fillRect(0,0,512,256+shift);a.fillStyle='#303b38';a.fillRect(0,256+shift,512,512);a.strokeStyle='#111a17';a.lineWidth=3;
    for(let line=-80;line<=80;line+=20){const y=256+shift+line*2.4;a.beginPath();a.moveTo(120,y);a.lineTo(392,y);a.stroke();a.font='24px monospace';a.fillStyle=line<0?'#27332d':'#bbc4b5';a.fillText(String(Math.abs(line)),85,y+8);a.fillText(String(Math.abs(line)),406,y+8);}
    for(let x=0;x<512;x+=64){a.beginPath();a.ellipse(256+Math.sin(angles.x)*35,256,x||1,252,0,0,Math.PI*2);a.stroke();}
    a.restore();a.strokeStyle='#f4cf76';a.lineWidth=8;a.beginPath();a.moveTo(119,256);a.lineTo(218,256);a.lineTo(256,284);a.lineTo(294,256);a.lineTo(393,256);a.stroke();this.attitude.update();
  }
}
