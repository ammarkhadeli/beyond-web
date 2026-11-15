import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Color3, Vector3 } from '@babylonjs/core/Maths/math';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { SceneInteractions } from './SceneInteractions';

/** An original training interior, not a claimed replica of an operational vehicle.
 * The same numerical mission powers its displays and physical control surfaces. */
export class ModernCockpit {
  readonly root:TransformNode;
  readonly screens:DynamicTexture[]=[];
  readonly seat=new Vector3(-.55,1.65,-.68);
  private trim:PBRMaterial;
  constructor(scene:Scene, interactions:SceneInteractions){
    const root=this.root=new TransformNode('Beyond modern training cabin',scene);
    const material=(name:string,color:string,metal=0,rough=.5)=>{const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromHexString(color).toLinearSpace();m.metallic=metal;m.roughness=rough;m.environmentIntensity=.7;m.directIntensity=1;m.useLogarithmicDepth=true;return m;};
    const shell=material('ceramic cabin panels','#e5e6df',.06,.48),rim=material('satin anodized graphite','#26343d',.38,.43),soft=material('pressure seat textile','#343e47',.08,.85),metal=material('machined interior alloy','#7e8c97',.82,.28),dark=material('cabin panel seams','#141e26',.06,.61);
    this.trim=material('cabin blue light guides','#324e58',.2,.35);this.trim.emissiveColor=Color3.FromHexString('#73c8dd').scale(.4);
    // The repeating stitch normal gives padding a woven, non-plastic finish.
    const fabric=new DynamicTexture('seat micro weave',{width:256,height:256},scene,false);const fc=fabric.getContext();fc.fillStyle='#8080ff';fc.fillRect(0,0,256,256);for(let i=0;i<256;i+=4){fc.fillStyle=i%8?'#8880fb':'#7880fb';fc.fillRect(i,0,1,256);fc.fillStyle='#8078fb';fc.fillRect(0,i,256,1);}fabric.update();fabric.uScale=8;fabric.vScale=8;fabric.level=.12;soft.bumpTexture=fabric;
    const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:PBRMaterial)=>{
      const mesh=new Mesh(name,scene),data=new VertexData(),positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
      const half=[w/2,h/2,d/2],r=Math.min(.035,...half.map(v=>v*.28));
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3,base=positions.length/3;
        const edge=(a:number)=>[-a,-a+r,0,a-r,a];
        for(let j=0;j<5;j++)for(let i=0;i<5;i++){const p=[0,0,0];p[axis]=half[axis]*sign;p[u]=edge(half[u])[i];p[v]=edge(half[v])[j];const inner=p.map((n,k)=>Math.max(-half[k]+r,Math.min(half[k]-r,n))),delta=p.map((n,k)=>n-inner[k]),length=Math.hypot(...delta)||1,normal=delta.map(n=>n/length);positions.push(...inner.map((n,k)=>n+normal[k]*r));normals.push(...normal);uvs.push(i/4,j/4);}
        for(let j=0;j<4;j++)for(let i=0;i<4;i++){const a=base+j*5+i,b=a+1,c=a+6,d=a+5;if(sign>0)indices.push(a,c,b,a,d,c);else indices.push(a,b,c,a,c,d);}
      }
      data.positions=positions;data.normals=normals;data.uvs=uvs;data.indices=indices;data.applyToMesh(mesh);mesh.position.set(x,y,z);mesh.material=m;mesh.parent=root;mesh.receiveShadows=true;return mesh;
    };
    const rounded=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:PBRMaterial)=>{const mesh=MeshBuilder.CreateSphere(name,{diameter:1,segments:20},scene);mesh.scaling.set(w,h,d);mesh.position.set(x,y,z);mesh.material=m;mesh.parent=root;return mesh;};
    box('cabin floor',0,.22,0,3.75,.16,3.5,dark);
    for(let i=0;i<8;i++)box('ribbed nonslip floor',0,.31,-1.4+i*.4,3.5,.025,.025,metal);
    // A segmented cylindrical pressure shell keeps windows true openings.
    for(let i=0;i<40;i++){
      const a=(i+.5)*Math.PI*2/40,front=Math.cos(a)>.58,x=Math.sin(a)*1.88,z=Math.cos(a)*1.88;
      if(front)continue;
      const panel=box('curved pressure shell',x,1.65,z,.305,2.82,.12,shell);panel.rotation.y=a;
      for(const yy of [.91,2.2]){const seam=box('horizontal pressure panel joint',x*.963,yy,z*.963,.29,.008,.012,dark);seam.rotation.y=a;}
      if(i%4===0){const seam=box('pressure shell seam',x*.963,1.65,z*.963,.008,2.75,.012,dark);seam.rotation.y=a;}
    }
    const cap=MeshBuilder.CreateSphere('insulated overhead dome',{diameter:3.8,segments:48,slice:.5,sideOrientation:Mesh.BACKSIDE},scene);cap.position.y=2.85;cap.scaling.y=.42;cap.material=shell;cap.parent=root;
    for(const x of [-1.3,1.3]){box('overhead light strip',x,2.92,-.1,.035,.035,2.2,this.trim);box('window structural post',x,2.12,1.5,.12,1.45,.18,rim);}
    // Front window mullions; no fake glass sheet hiding the Earth outside.
    box('window upper sill',0,2.84,1.5,2.72,.11,.19,rim);box('window lower sill',0,1.88,1.5,2.72,.12,.24,rim);box('window center mullion',0,2.37,1.52,.08,.9,.16,metal);
    // These pressure-wall infills connect the cylindrical shell to the window
    // frame. The original gaps here showed launch terrain through the cabin.
    for(const sign of [-1,1]){box('sealed front corner',sign*1.51,1.66,1.38,.46,2.85,.62,shell);box('window side gasket',sign*1.29,2.36,1.39,.025,.88,.08,dark);}
    box('forward pressure bulkhead',0,.94,1.51,3.18,1.82,.18,shell);
    box('upper pressure infill',0,3.04,1.51,3.18,.32,.28,shell);
    box('lower equipment bay',0,.68,1.29,2.34,.62,.12,rim);
    for(const x of [-.78,0,.78]){box('equipment bay access panel',x,.69,1.214,.72,.49,.022,soft);for(const yy of [.48,.9])for(const xx of [-.31,.31]){const bolt=MeshBuilder.CreateCylinder('bay captive bolt',{diameter:.012,height:.006,tessellation:10},scene);bolt.rotation.x=Math.PI/2;bolt.position.set(x+xx,yy,1.198);bolt.parent=root;bolt.material=metal;}}
    box('floating instrument deck',0,1.35,1.12,2.62,.78,.25,rim);
    box('instrument deck top lip',0,1.78,1.15,2.72,.045,.4,metal);
    box('instrument accent rail',0,1.02,.96,2.5,.018,.025,this.trim);
    // Low-glare triple MFD display. UI updates textures at eight Hz.
    for(let i=0;i<3;i++){
      const x=(i-1)*.835;box('display bezel '+i,x,1.46,.962,.81,.54,.035,dark);
      const screen=MeshBuilder.CreatePlane('Modern Display '+i,{width:.758,height:.426},scene);screen.position.set(x,1.48,.938);screen.parent=root;screen.metadata={interactionSurface:true};
      const tex=new DynamicTexture('Modern MFD '+i,{width:1024,height:576},scene,true);tex.hasAlpha=false;this.screens.push(tex);
      const m=new StandardMaterial('modern display emission '+i,scene);m.disableLighting=true;m.emissiveTexture=tex;m.diffuseColor=Color3.Black();m.specularColor=Color3.Black();m.useLogarithmicDepth=true;screen.material=m;
      for(const sign of [-1,1])for(const yy of [1.24,1.71]){const screw=MeshBuilder.CreateCylinder('display captive screw',{diameter:.012,height:.005,tessellation:12},scene);screw.rotation.x=Math.PI/2;screw.position.set(x+sign*.386,yy,.938);screw.material=metal;screw.parent=root;}
    }
    const label=(name:string,text:string,x:number,y:number,z:number,w:number,h:number,color='#acbbc5')=>{const mesh=MeshBuilder.CreatePlane(name,{width:w,height:h},scene);mesh.position.set(x,y,z);mesh.parent=root;mesh.isPickable=false;const t=new DynamicTexture(name+' texture',{width:512,height:128},scene,true);const c=t.getContext() as CanvasRenderingContext2D;c.fillStyle='#111a21';c.fillRect(0,0,512,128);c.fillStyle=color;c.font='600 52px sans-serif';c.textAlign='center';c.fillText(text,256,83);t.update();const m=new StandardMaterial(name+' material',scene);m.disableLighting=true;m.emissiveTexture=t;m.diffuseColor=Color3.Black();m.specularColor=Color3.Black();m.useLogarithmicDepth=true;mesh.material=m;};
    const controls:[string,string,string,string,number,string][]=[
      ['launch','LAUNCH','Launch sequence','ignite',-1.04,'#8de1c5'],['assist','GUIDANCE','Guidance mode','autopilot',-.63,'#8dcbe1'],['return','RETURN','Return guidance','return',-.22,'#8dcbe1'],['reset','RESET','Equipment reset','resolve',.19,'#efc986'],['thrust-up','THRUST +','Thrust controller','throttle-up',.6,'#a6bac5'],['thrust-down','THRUST −','Thrust controller','throttle-down',1.01,'#a6bac5']
    ];
    for(const [id,text,title,action,x,color]of controls){box('touch key '+id,x,1.12,.925,.36,.09,.035,dark);label('key legend '+id,text,x,1.12,.903,.34,.085,color);interactions.register({id:'modern-'+id,label:title,description:title+'. This control uses the mission flight computer.',action,parent:root,position:new Vector3(x,1.12,.89),radius:.12,reach:2.8,kind:'control',enabled:()=>root.isEnabled()});}
    const abort=material('guarded abort red','#ac4438',.1,.6);box('abort switch bezel',-1.49,1.28,.56,.2,.3,.08,rim);const abortButton=MeshBuilder.CreateCylinder('recessed abort actuator',{diameter:.106,height:.055,tessellation:48},scene);abortButton.rotation.x=Math.PI/2;abortButton.position.set(-1.49,1.3,.505);abortButton.material=abort;abortButton.parent=root;
    for(const side of [-1,1]){const guard=MeshBuilder.CreateCapsule('abort safety guard rail',{height:.15,radius:.009,tessellation:12},scene);guard.position.set(-1.49+side*.077,1.34,.484);guard.parent=root;guard.material=metal;}
    label('abort legend','ABORT',-1.49,1.17,.50,.18,.05,'#ffac92');interactions.register({id:'modern-abort',label:'Guarded abort control',description:'Request an emergency return. Science completion is not required for an abort.',action:'abort',parent:root,position:new Vector3(-1.49,1.3,.47),radius:.12,reach:2.8,kind:'control',enabled:()=>root.isEnabled()});
    for(const x of [-.55,.55]){
      rounded('contoured flight seat',x,.65,-.56,.75,.16,1.05,soft);rounded('pressure suit back support',x,1.15,-1.08,.76,1.22,.2,soft);rounded('head restraint',x,1.69,-1.14,.46,.36,.19,soft);
      for(const sign of [-1,1]){box('seat side rail',x+sign*.39,.75,-.43,.04,.25,.95,rim);rounded('padded arm rest',x+sign*.37,.94,-.26,.11,.11,.65,soft);box('restraint mounting',x+sign*.26,1.45,-.96,.065,.32,.035,metal);}
      box('seat harness buckle',x,.79,-.34,.12,.06,.08,metal);box('seat support',x,.4,-.7,.4,.2,.4,metal);
    }
    // Rear hatch and rails supply spatial landmarks when unstrapped.
    const hatch=MeshBuilder.CreateTorus('rear circular pressure hatch',{diameter:1.25,thickness:.09,tessellation:64},scene);hatch.rotation.x=Math.PI/2;hatch.position.set(0,1.6,-1.79);hatch.material=metal;hatch.parent=root;
    box('pressure hatch inner panel',0,1.6,-1.82,1.05,1.05,.05,rim);box('pressure hatch latch',.38,1.58,-1.75,.06,.28,.06,metal);
    for(const x of [-1.62,1.62]){const rail=MeshBuilder.CreateCapsule('cabin grab rail',{height:.7,radius:.025,tessellation:16},scene);rail.position.set(x,1.8,-.55);rail.material=metal;rail.parent=root;}
    label('cabin identity','BEYOND',0,.7,1.196,.35,.065);
    const overhead=new PointLight('modern cabin ceiling diffuser',new Vector3(0,2.68,.15),scene);overhead.parent=root;overhead.diffuse=Color3.FromHexString('#f4eee1');overhead.intensity=1.35;overhead.range=3.8;
    // Interior illumination comes from the cabin fixtures. Direct Sun cannot
    // pass through the opaque pressure shell and flatten the panel shading.
    const sun=scene.getLightByName('sun');if(sun)sun.excludedMeshes.push(...root.getChildMeshes());
    // Operate the visible latch, not the hatch center hidden behind the left
    // seat's head restraint when the commander first releases the harness.
    // All seat and pressure-shell geometry remains opaque to interaction rays.
    interactions.register({id:'modern-hatch',label:'Transfer hatch',description:'Use the hatch latch beside the seat to enter the destination worksite after docking.',action:'exit-worksite',parent:root,position:new Vector3(.38,1.58,-1.70),radius:.14,reach:3.2,kind:'hatch',enabled:()=>root.isEnabled()});
    interactions.register({id:'modern-seat',label:'Commander seat',description:'Secure your restraints before a maneuver.',action:'sit',parent:root,position:new Vector3(-.55,.85,-.5),radius:.3,reach:2.5,kind:'control',enabled:()=>root.isEnabled()});
    for(const [i,title]of ['Propulsion display','Flight director','Power and science'].entries())interactions.register({id:'modern-screen-'+i,label:title,description:'Live mission telemetry. Press I for the current flight explanation.',action:'guide',parent:root,position:new Vector3((i-1)*.835,1.48,.92),radius:.26,reach:2.8,kind:'control',enabled:()=>root.isEnabled()});
  }
}
