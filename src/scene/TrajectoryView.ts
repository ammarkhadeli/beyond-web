import { Vector3,Color3 } from '@babylonjs/core/Maths/math';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { State } from '../game/simulation';
import { sampleTrajectory,EARTH_RADIUS,MOON_RADIUS,MOON_DISTANCE,ISS_ALTITUDE,type Vec3 } from '../game/orbital';
const SCALE=1e-6;
const map=(p:Vec3)=>new Vector3(p[0]*SCALE,p[1]*SCALE,-p[2]*SCALE);

/** Navigation diagram: every position and body radius uses one SI scale. Planet
 * textures are brightly drawn for legibility; markers identify subpixel craft. */
export class TrajectoryView {
 readonly root:TransformNode;
 private earth:Mesh;private moon:Mesh;private sun:Mesh;private craft:Mesh;private station:Mesh;private stationOrbit:Mesh;private landing:Mesh;
 private line:Mesh|null=null;private lastSample=-Infinity;private lastSampleWall=-Infinity;private radius=22;private lastMode='';
 private labels:{mesh:Mesh;body:Mesh;radius:number;side:number}[]=[];
 constructor(private scene:Scene){
  this.root=new TransformNode('continuous trajectory map',scene);this.root.setEnabled(false);
  Effect.ShadersStore['navigationPlanetVertexShader']=`precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 tex;void main(){tex=uv;gl_Position=worldViewProjection*vec4(position,1.);}`;
  Effect.ShadersStore['navigationPlanetFragmentShader']=`precision highp float;varying vec2 tex;uniform sampler2D surfaceMap;uniform sampler2D cloudMap;uniform float terrestrial;void main(){vec3 color=texture2D(surfaceMap,tex).rgb;if(terrestrial>.5){float water=1.-smoothstep(.035,.13,max(color.r,color.g));color=mix(color,vec3(.035,.22,.43),water);color=mix(color,vec3(.88,.92,.95),texture2D(cloudMap,tex).a*.9);}gl_FragColor=vec4(color*1.25,1.);}`;
  const planet=(name:string,radius:number,path:string)=>{
   const mesh=MeshBuilder.CreateSphere(name,{diameter:radius*SCALE*2,segments:96},scene);mesh.parent=this.root;
   const material=new ShaderMaterial(name+' navigation surface',scene,{vertex:'navigationPlanet',fragment:'navigationPlanet'},{attributes:['position','uv'],uniforms:['worldViewProjection','terrestrial'],samplers:['surfaceMap','cloudMap']});material.setTexture('surfaceMap',new Texture(path,scene,false,false));material.setTexture('cloudMap',new Texture('/assets/earth-clouds.png',scene,false,false));material.setFloat('terrestrial',name==='Earth'?1:0);mesh.material=material;this.addLabel(name,mesh,radius*SCALE);return mesh;
  };
  this.earth=planet('Earth',EARTH_RADIUS,'/assets/earth-blue-marble.jpg');this.moon=planet('Moon',MOON_RADIUS,'/assets/lunar/moon-lroc-8k.jpg');
  this.sun=MeshBuilder.CreateSphere('Sun',{diameter:696340000*SCALE*2,segments:64},scene);this.sun.parent=this.root;const glow=new StandardMaterial('solar photosphere',scene);glow.disableLighting=true;glow.emissiveColor=new Color3(1,.88,.65);this.sun.material=glow;this.addLabel('Sun',this.sun,696340000*SCALE);
  this.craft=MeshBuilder.CreateSphere('spacecraft position',{diameter:.7,segments:12},scene);this.craft.parent=this.root;const mark=new StandardMaterial('spacecraft marker',scene);mark.disableLighting=true;mark.emissiveColor=new Color3(.55,.9,1);this.craft.material=mark;this.addLabel('Spacecraft',this.craft,0);
  // Markers are intentionally exaggerated; their positions retain SI scale.
  this.station=MeshBuilder.CreateBox('ISS target position',{width:.8,height:.3,depth:.3},scene);this.station.parent=this.root;
  const targetMaterial=new StandardMaterial('destination marker',scene);targetMaterial.disableLighting=true;targetMaterial.emissiveColor=new Color3(1,.74,.35);this.station.material=targetMaterial;this.addLabel('ISS target',this.station,0,-1);
  this.landing=MeshBuilder.CreateSphere('lunar landing-site position',{diameter:.4,segments:12},scene);this.landing.parent=this.root;this.landing.material=targetMaterial;this.addLabel('Landing site',this.landing,0,-1);
  const stationOrbit=MeshBuilder.CreateLines('ISS target orbit',{points:Array.from({length:193},(_,i)=>new Vector3(Math.cos(i/192*Math.PI*2)*(EARTH_RADIUS+ISS_ALTITUDE)*SCALE,Math.sin(i/192*Math.PI*2)*(EARTH_RADIUS+ISS_ALTITUDE)*SCALE,0))},scene);stationOrbit.color=new Color3(.55,.39,.18);stationOrbit.parent=this.root;this.stationOrbit=stationOrbit;
  const orbit=MeshBuilder.CreateLines('lunar ephemeris',{points:Array.from({length:193},(_,i)=>new Vector3(Math.cos(i/192*Math.PI*2)*MOON_DISTANCE*SCALE,Math.sin(i/192*Math.PI*2)*MOON_DISTANCE*SCALE,0))},scene);orbit.color=new Color3(.18,.26,.32);orbit.parent=this.root;
 }
 private addLabel(name:string,body:Mesh,radius:number,side=1){
  const texture=new DynamicTexture(name+' navigation label',{width:512,height:128},this.scene,false);texture.hasAlpha=true;const context=texture.getContext() as CanvasRenderingContext2D;context.clearRect(0,0,512,128);context.font='48px sans-serif';context.fillStyle='#dfe8ed';context.textAlign='center';context.fillText(name,256,82);texture.update();
  const material=new StandardMaterial(name+' label material',this.scene);material.diffuseTexture=texture;material.opacityTexture=texture;material.emissiveTexture=texture;material.disableLighting=true;material.backFaceCulling=false;material.disableDepthWrite=true;
  const label=MeshBuilder.CreatePlane(name+' label',{width:4,height:1},this.scene);label.material=material;label.parent=this.root;label.billboardMode=Mesh.BILLBOARDMODE_ALL;label.isPickable=false;this.labels.push({mesh:label,body,radius,side});
 }
 resetFrame(){this.lastMode='';}
 zoom(factor:number){this.radius=Math.max(this.lastMode==='moon'?3:9,Math.min(300000,this.radius*factor));this.lastSample=-Infinity;}
 update(state:State,camera:FreeCamera,yaw:number,pitch:number){
  const t=state.trajectory;
  const closeMoon=t.referenceBody==='moon',overview=!closeMoon&&['translunar','lunar-escape','earth-return'].includes(state.flightMode),mode=closeMoon?'moon':overview?'transfer':'earth';
  if(this.lastMode!==mode){this.radius=mode==='moon'?8:mode==='transfer'?560:22;this.lastMode=mode;this.lastSample=-Infinity;}
  this.moon.position.copyFrom(map(t.moonPosition));this.sun.position.copyFrom(map(t.sunDirection).normalize().scale(149597870700*SCALE));this.craft.position.copyFrom(map(t.position));
  const center=this.radius>10000?Vector3.Zero():this.radius>120?this.moon.position.scale(.5):closeMoon?this.moon.position:Vector3.Zero(),p=Math.max(-1.3,Math.min(1.3,pitch));
  camera.position.set(center.x+Math.sin(yaw)*this.radius*Math.cos(p),center.y+Math.sin(p)*this.radius,center.z-this.radius*Math.cos(yaw)*Math.cos(p));camera.setTarget(center);camera.fov=.9;camera.minZ=.001;camera.maxZ=800000;
  this.craft.scaling.setAll(Math.max(.012,this.radius/320));
  this.station.position.copyFrom(map(t.targetPosition));this.station.setEnabled(state.plan.destination==='iss');this.stationOrbit.setEnabled(state.plan.destination==='iss');
  this.landing.position.copyFrom(map(t.landingSitePosition));this.landing.setEnabled(state.plan.destination==='moon');
  for(const marker of [this.station,this.landing])marker.scaling.setAll(Math.max(.012,this.radius/320));
  for(const label of this.labels){const size=this.radius*.031;label.mesh.setEnabled(label.body.isEnabled());label.mesh.scaling.setAll(size);label.mesh.position.copyFrom(label.body.position.add(new Vector3(0,(label.radius+size*.7)*label.side,0)));}
  if(Math.abs(t.epochSeconds-this.lastSample)>60&&performance.now()-this.lastSampleWall>500){
   this.lastSample=t.epochSeconds;this.lastSampleWall=performance.now();this.line?.dispose(false,true);const duration=closeMoon?10000:overview?Math.max(10000,Math.min(350000,state.navigation.arrivalEpoch-t.epochSeconds||250000)):7200;
   const points=sampleTrajectory(t,duration,112).map(map);if(points.length>1){this.line=MeshBuilder.CreateTube('ballistic trajectory prediction',{path:points,radius:this.radius*.0012,tessellation:5},this.scene);const material=new StandardMaterial('trajectory line material',this.scene);material.disableLighting=true;material.emissiveColor=new Color3(.2,.72,.89);this.line.material=material;this.line.parent=this.root;}
  }
 }
}
