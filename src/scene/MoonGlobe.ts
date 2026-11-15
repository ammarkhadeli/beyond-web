import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Quaternion,Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import { MOON_RADIUS } from '../game/orbital';

/** NASA LROC 8K reflectance over LOLA measured global elevation. Native model
 * axes: +X near-side prime meridian, +Y north, +Z east. */
export class MoonGlobe {
 readonly mesh:Mesh;readonly ready:Promise<void>;readonly material:ShaderMaterial;
 constructor(scene:Scene){
  this.mesh=new Mesh('Moon LROC LOLA globe',scene);
  Effect.ShadersStore['lrocSurfaceVertexShader']=`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 n;varying vec3 point;varying vec2 tex;
#include<logDepthDeclaration>
void main(){n=normalize(mat3(world)*normal);point=position;tex=uv;gl_Position=worldViewProjection*vec4(position,1.);
#include<logDepthVertex>
}`;
  Effect.ShadersStore['lrocSurfaceFragmentShader']=`precision highp float;varying vec3 n;varying vec3 point;varying vec2 tex;uniform sampler2D surfaceMap;uniform vec3 sunDirection;uniform float localPatch;
#include<logDepthDeclaration>
void main(){vec3 p=normalize(point)*1737400.;vec3 anchor=vec3(0.9172052679,0.0117632479,0.3982412868)*1737400.;vec3 east=vec3(-0.3982688428,0.0000000000,0.9172687332);vec3 north=vec3(-0.0107900595,0.9999308106,-0.0046849351);vec3 d=p-anchor;if(localPatch>.5&&abs(dot(d,east))<63900.&&abs(dot(d,north))<63900.)discard;vec3 albedo=texture2D(surfaceMap,tex).rgb;float light=max(0.,dot(normalize(n),normalize(sunDirection)));gl_FragColor=vec4(albedo*(.13+light*1.2),1.);
#include<logDepthFragment>
}`;
  const mat=new ShaderMaterial('NASA lunar orbital surface',scene,{vertex:'lrocSurface',fragment:'lrocSurface'},{attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','sunDirection','localPatch'],samplers:['surfaceMap']});const texture=new Texture('/assets/lunar/moon-lroc-8k.jpg',scene);texture.anisotropicFilteringLevel=16;mat.setTexture('surfaceMap',texture);mat.setFloat('localPatch',0);mat.setVector3('sunDirection',new Vector3(1,1,1));mat.useLogarithmicDepth=true;this.mesh.material=mat;this.material=mat;this.mesh.isPickable=false;
  this.ready=fetch('/assets/lunar/moon-global-heights.u16').then(r=>r.arrayBuffer()).then(buffer=>{
   const heights=new Uint16Array(buffer),positions:number[]=[],uvs:number[]=[],indices:number[]=[],normals:number[]=[];const longitudeSteps=512,latitudeSteps=256;
   for(let j=0;j<=latitudeSteps;j++)for(let i=0;i<=longitudeSteps;i++){
    const lon=i/longitudeSteps*Math.PI*2-Math.PI,lat=Math.PI/2-j/latitudeSteps*Math.PI;
    const index=Math.min(719,Math.floor(j/latitudeSteps*720))*1440+Math.min(1439,Math.floor(i/longitudeSteps*1440));const elevation=(heights[index]-20000)*.5;
    const x=Math.cos(lat)*Math.cos(lon),y=Math.sin(lat),z=Math.cos(lat)*Math.sin(lon);positions.push(x*(MOON_RADIUS+elevation),y*(MOON_RADIUS+elevation),z*(MOON_RADIUS+elevation));normals.push(x,y,z);uvs.push(i/longitudeSteps,1-j/latitudeSteps);
    if(j<latitudeSteps&&i<longitudeSteps){const a=j*(longitudeSteps+1)+i,b=a+longitudeSteps+1;indices.push(a,a+1,b,a+1,b+1,b);}
   }
   const data=new VertexData();data.positions=positions;data.normals=normals;data.uvs=uvs;data.indices=indices;data.applyToMesh(this.mesh);this.mesh.refreshBoundingInfo();
  });
 }
 setRotation(angle:number){this.mesh.rotationQuaternion=Quaternion.RotationAxis(Vector3.Forward(),angle+Math.PI).multiply(Quaternion.RotationAxis(Vector3.Right(),-Math.PI/2));}
}
