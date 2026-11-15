import { Ray } from '@babylonjs/core/Culling/ray';
import { AstronautBody } from './AstronautBody';
import { ModernCockpit } from './ModernCockpit';
import { stationApproachCamera } from './approachCamera';
import { solarVisibility, lunarShadowRadius } from './SolarVisibility';
import { VehicleDetail, refineTrainerMaterials, discardedUpperStageIndices } from './VehicleDetail';
import { LunarInstruments } from './LunarInstruments';
import { LUNAR_CONTROLS } from './lunarControls';
import { Worksites } from './Worksites';
import { MoonGlobe } from './MoonGlobe';
import { TrajectoryView } from './TrajectoryView';
import { EARTH_ROTATION,EARTH_RADIUS,MOON_RADIUS,type Vec3 } from '../game/orbital';
import { CoastalLandscape } from './CoastalLandscape';
import { ApolloInstruments } from './ApolloInstruments';
import { LunarSurface } from './LunarSurface';
import { AstronautRig, type AstronautMode, type AstronautEnvironment, type AstronautInput } from './AstronautRig';
import { SceneInteractions, type SceneInteraction } from './SceneInteractions';
import { DracoCompression } from '@babylonjs/core/Meshes/Compression/dracoCompression';
export type { AstronautMode, AstronautEnvironment, AstronautInput } from './AstronautRig';
export type { SceneInteraction,SceneObjective } from './SceneInteractions';
import { Engine } from '@babylonjs/core/Engines/engine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { GraphicsInfo } from './createGraphicsEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Color3, Color4, Quaternion, Matrix } from '@babylonjs/core/Maths/math';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Shaders/ShadersInclude/logDepthDeclaration';
import '@babylonjs/core/Shaders/ShadersInclude/logDepthVertex';
import '@babylonjs/core/Shaders/ShadersInclude/logDepthFragment';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import '@babylonjs/loaders/glTF';
import { createMission, type State } from '../game/simulation';

type Quality = 'low' | 'high';
export type View = 'cockpit' | 'external' | 'trajectory';
const v = (x:number,y:number,z:number) => new Vector3(x,y,z);
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(a:number,b:number,n:number)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
const R=6_371_000;
const noise=(x:number,z:number)=>Math.sin(x*.61+Math.cos(z*.43)*2.1)*.45+Math.sin(z*.83+x*.29)*.32+Math.sin(x*1.77-z*1.21)*.16;
function seeded(seed=19){return()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};}

/** Local rendered environments use camera-relative coordinates. The numerical flight
 * model owns all mission outcomes; meshes only visualize its state. */
export class SpaceScene {
  readonly ready:Promise<void>;
  private engine:AbstractEngine;
  readonly graphicsInfo:GraphicsInfo;
  private scene:Scene;
  private camera:FreeCamera;
  private astronaut=new AstronautRig();
  private astronautBody:AstronautBody;
  private interactions:SceneInteractions;
  private lunarSurface:LunarSurface;
  private moonGlobe:MoonGlobe;
  private trajectoryView:TrajectoryView;
  private saturn:TransformNode;
  private saturnMeshes:Mesh[]=[];
  private separatedMeshes=new Map<string,TransformNode>();
  private coast:CoastalLandscape;
  private lunarGroundHeight:(x:number,z:number)=>number=()=>0;
  private cockpit:TransformNode;
  private modernCockpit:ModernCockpit;
  private vehicleDetail:VehicleDetail|null=null;
  private lunarCabin:TransformNode;
  private lunarInstruments:LunarInstruments|null=null;
  private worldFrame:TransformNode;
  private earthSurface:ShaderMaterial;
  private earthOrientation=Quaternion.Identity();
  private rocket:TransformNode;
  private lander:TransformNode;
  private spacecraft:TransformNode;
  private apollo:TransformNode;
  private transitLander:TransformNode;
  private carrier:TransformNode;
  private carrierOrientation:Quaternion|null=null;
  private site:TransformNode;
  private moon:TransformNode;
  private station:TransformNode;
  private stationInterior:TransformNode;
  private worksites:Worksites|null=null;
  private earth:Mesh;
  private earthAir:Mesh;
  private stars:Mesh;
  private sky:ShaderMaterial;
  private sun:DirectionalLight;
  private fill:HemisphericLight;
  private cabinLight:PointLight;
  private shadows:ShadowGenerator;
  private pipeline:DefaultRenderingPipeline;
  private gauges:DynamicTexture[]=[];
  private apolloInstruments:ApolloInstruments|null=null;
  private rocketMeshes:Mesh[]=[];
  private cockpitMeshes:Mesh[]=[];
  private flame:Mesh;
  private flameOuter:Mesh;
  private vapor:Mesh[]=[];
  private ocean:Mesh;
  private waterMaterial:PBRMaterial;
  private moonMaterial:PBRMaterial;
  private lookX=0;
  private lookY=0;
  private view:View='cockpit';
  private inspectionFov=1.25;
  private flightActive=false;
  private quality:Quality='high';
  private disposed=false;
  private gaugeClock=0;
  private lastRender=0;
  private sceneTime=0;
  private lastState:State|null=null;
  private resize=()=>this.engine.resize();

  constructor(canvas:HTMLCanvasElement,engine?:AbstractEngine,graphicsInfo?:GraphicsInfo){
    this.engine=engine??new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance',adaptToDeviceRatio:true});
    this.graphicsInfo=graphicsInfo??{backend:'WebGL 2',requested:'webgl',fallbackReason:null};
    this.scene=new Scene(this.engine);this.worldFrame=new TransformNode('vehicle-reference-frame',this.scene);this.scene.clearColor=new Color4(.008,.013,.021,1);
    this.scene.environmentTexture=CubeTexture.CreateFromPrefilteredData('/assets/studio-light.env',this.scene);
    this.scene.environmentIntensity=.5;
    this.scene.imageProcessingConfiguration.toneMappingEnabled=true;
    this.scene.imageProcessingConfiguration.toneMappingType=1;
    this.scene.imageProcessingConfiguration.exposure=1.15;
    this.scene.imageProcessingConfiguration.contrast=1.08;
    this.camera=new FreeCamera('astronaut-eye',v(0,0,0),this.scene);
    this.camera.minZ=.07;this.camera.maxZ=30_000_000;this.camera.fov=1.15;this.camera.inputs.clear();
    this.camera.setTarget(v(0,0,10));this.interactions=new SceneInteractions(this.scene,this.camera);
    DracoCompression.Configuration={decoder:{wasmUrl:'/assets/decoders/draco_wasm_wrapper_gltf.js',wasmBinaryUrl:'/assets/decoders/draco_decoder_gltf.wasm',fallbackUrl:'/assets/decoders/draco_decoder_gltf.js'}};
    this.sun=new DirectionalLight('sun',v(-.55,-.65,.38).normalize(),this.scene);this.sun.intensity=3.2;this.sun.diffuse=Color3.FromHexString('#fff1d7');
    this.sun.position=v(250,450,-200);this.sun.shadowFrustumSize=220;this.sun.autoUpdateExtends=false;this.sun.shadowMinZ=1;this.sun.shadowMaxZ=1100;this.sun.orthoLeft=-180;this.sun.orthoRight=180;this.sun.orthoTop=180;this.sun.orthoBottom=-180;
    this.fill=new HemisphericLight('sky-irradiance',v(0,1,0),this.scene);this.fill.intensity=.65;this.fill.diffuse=Color3.FromHexString('#aec7dc');this.fill.groundColor=Color3.FromHexString('#30352f');
    this.shadows=new ShadowGenerator(2048,this.sun);this.shadows.usePercentageCloserFiltering=true;this.shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;this.shadows.bias=.00015;this.shadows.normalBias=.035;
    this.cabinLight=new PointLight('cabin-fill',v(0,.7,-.3),this.scene);this.cabinLight.diffuse=Color3.FromHexString('#bdccd4');this.cabinLight.intensity=4;this.cabinLight.range=4;
    this.pipeline=new DefaultRenderingPipeline('optics',true,this.scene,[this.camera]);this.pipeline.fxaaEnabled=true;this.pipeline.samples=1;this.pipeline.bloomEnabled=true;this.pipeline.bloomThreshold=1.1;this.pipeline.bloomWeight=.12;this.pipeline.bloomKernel=32;
    this.sky=this.createSky();this.stars=this.createStars();
    const planet=this.createEarth();this.earth=planet.earth;this.earthAir=planet.air;this.earthSurface=planet.surface;
    this.site=new TransformNode('coastal-launch-site',this.scene);
    this.coast=new CoastalLandscape(this.scene,this.site);
    const siteData=this.createLaunchSite();this.ocean=siteData.ocean;this.waterMaterial=siteData.water;
    this.lunarSurface=new LunarSurface(this.scene);this.moon=this.lunarSurface.root;this.moonMaterial=this.lunarSurface.material;this.lunarGroundHeight=this.lunarSurface.heightAt;
    this.moonGlobe=new MoonGlobe(this.scene);this.moonGlobe.mesh.parent=this.worldFrame;
    this.trajectoryView=new TrajectoryView(this.scene);
    this.station=this.createStation();this.stationInterior=new TransformNode('NASA Destiny interior',this.scene);this.stationInterior.parent=this.worldFrame;
    this.cockpit=new TransformNode('crew-capsule-interior',this.scene);this.lunarCabin=new TransformNode('LM crew compartment',this.scene);this.lunarCabin.rotation.y=Math.PI;
    this.modernCockpit=new ModernCockpit(this.scene,this.interactions);this.gauges=this.modernCockpit.screens;
    this.rocket=new TransformNode('launch-vehicle',this.scene);
    this.saturn=new TransformNode('NASA Saturn V',this.scene);
    this.lander=new TransformNode('lunar-vehicle',this.scene);this.spacecraft=new TransformNode('orbital-crew-vehicle',this.scene);this.apollo=new TransformNode('Apollo command and service module',this.scene);this.transitLander=new TransformNode('docked lunar module',this.scene);this.carrier=new TransformNode('orbiting Apollo carrier',this.scene);this.carrier.parent=this.worldFrame;
    for(const object of [this.site,this.moon,this.station,this.earth,this.earthAir,this.stars])object.parent=this.worldFrame;
    const exhaust=this.createExhaust();this.flame=exhaust.inner;this.flameOuter=exhaust.outer;
    this.astronautBody=new AstronautBody(this.scene);
    this.ready=this.loadAssets();
    this.engine.runRenderLoop(()=>{
      if(this.disposed)return;
      const now=performance.now();if(this.quality==='low'&&now-this.lastRender<45)return;this.lastRender=now;
      this.scene.render();
    });
    window.addEventListener('resize',this.resize);if(location.hostname==='localhost'||location.hostname==='127.0.0.1')(window as unknown as {spaceScene:SpaceScene}).spaceScene=this;
  }

  private mat(name:string,color:string,metallic=0,roughness=.7,emission?:string){
    const m=new PBRMaterial(name,this.scene);m.albedoColor=Color3.FromHexString(color).toLinearSpace();m.metallic=metallic;m.roughness=roughness;m.useLogarithmicDepth=true;
    if(emission){m.emissiveColor=Color3.FromHexString(emission);m.emissiveIntensity=1.3;}
    return m;
  }
  private box(name:string,p:Vector3,size:Vector3,mat:PBRMaterial,parent?:TransformNode){const o=MeshBuilder.CreateBox(name,{width:size.x,height:size.y,depth:size.z},this.scene);o.position=p;o.material=mat;if(parent)o.parent=parent;o.receiveShadows=true;return o;}
  private beam(name:string,a:Vector3,b:Vector3,r:number,mat:PBRMaterial,parent:TransformNode){const d=b.subtract(a);const o=MeshBuilder.CreateCylinder(name,{height:d.length(),diameter:r,tessellation:12},this.scene);o.position=a.add(b).scale(.5);o.rotationQuaternion=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(Vector3.Up(),d.normalize(),o.rotationQuaternion);o.parent=parent;o.material=mat;o.receiveShadows=true;return o;}
  private cylinder(name:string,p:Vector3,r:number,height:number,mat:PBRMaterial,parent:TransformNode){const o=MeshBuilder.CreateCylinder(name,{diameter:r*2,height,tessellation:48},this.scene);o.position=p;o.material=mat;o.parent=parent;o.receiveShadows=true;return o;}
  private mergeStatic(root:TransformNode,bakeAll=false){
    const groups=new Map<string,Mesh[]>();
    for(const child of root.getChildMeshes(false)){
      if(!(child instanceof Mesh)||child.getTotalVertices()===0||child.name.startsWith('keep-'))continue;
      const key=(child.metadata?.vehiclePart??'structure')+'-'+(child.material?.uniqueId.toString()||'none')+'-'+child.getVerticesDataKinds().sort().join(',');
      if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(child);
    }
    const retired:Mesh[]=[];
    // Keep every source alive until all groups are baked: NASA mesh nodes can be
    // parents of nodes using another material, so early disposal loses geometry.
    for(const [key,meshes]of groups){
      if(meshes.length<2&&!bakeAll)continue;
      const merged=Mesh.MergeMeshes(meshes,false,true,undefined,false,false);
      if(merged){merged.name='structure-'+key;merged.metadata={vehiclePart:meshes[0].metadata?.vehiclePart};merged.parent=root;merged.receiveShadows=true;retired.push(...meshes);}
    }
    for(const mesh of retired)if(!mesh.isDisposed())mesh.dispose();
  }

  private async loadAssets(){
    const [crew,launcher,lander,spacecraft,station,saturn,interior,lunarCabin,apollo]=await Promise.all([
      this.loadAuthenticCockpit(),
      SceneLoader.ImportMeshAsync('', '/assets/', 'orbital-launcher.glb',this.scene),
      SceneLoader.ImportMeshAsync('', '/assets/', 'nasa-lunar-module.glb',this.scene),
      SceneLoader.ImportMeshAsync('', '/assets/', 'orbital-capsule.glb',this.scene),
      SceneLoader.ImportMeshAsync('', '/assets/', 'nasa-iss.glb',this.scene),
      SceneLoader.ImportMeshAsync('', '/assets/', 'nasa-saturn-v.glb',this.scene),
      SceneLoader.ImportMeshAsync('', '/assets/', 'iss-interior.glb',this.scene),
      SceneLoader.ImportMeshAsync('', '/assets/', 'lunar-cabin.glb',this.scene),
      SceneLoader.ImportMeshAsync('', '/assets/', 'apollo-csm.glb',this.scene),
    ]);
    if(this.disposed)return;
    apollo.meshes[0].parent=this.apollo;lunarCabin.meshes[0].parent=this.lunarCabin;crew.meshes[0].parent=this.cockpit;launcher.meshes[0].parent=this.rocket;lander.meshes[0].parent=this.lander;
    const interiorPlacement=new TransformNode('Destiny navigation alignment',this.scene);interiorPlacement.parent=this.stationInterior;interiorPlacement.position.set(.3635,.1905,3.993);interiorPlacement.rotation.y=-Math.PI/2;interior.meshes[0].parent=interiorPlacement;
    spacecraft.meshes[0].parent=this.spacecraft;saturn.meshes[0].parent=this.saturn;this.saturnMeshes=saturn.meshes.filter(m=>m instanceof Mesh) as Mesh[];
    for(const mesh of this.saturnMeshes){const material=mesh.material;if(material instanceof PBRMaterial&&material.name.startsWith('blinn8SG'))material.albedoTexture=new Texture('/assets/earth/saturn-flag-decal.png',this.scene,false,false);}
    for(const mesh of this.station.getChildMeshes())mesh.dispose();station.meshes[0].parent=this.station;
    for(const imported of [crew,launcher,lander,spacecraft,station,saturn,interior,lunarCabin,apollo]){imported.meshes[0].rotationQuaternion=Quaternion.Identity();for(const mesh of imported.meshes){if(mesh.material)mesh.material.useLogarithmicDepth=true;}}
    refineTrainerMaterials(this.scene,[...launcher.meshes,...spacecraft.meshes]);
    // Imported static meshes have many material primitives. Bake transforms once,
    // consolidate identical materials, then restore the model's placement.
    for(const root of [this.lander,this.spacecraft,this.station]){
      const parent=root.parent,quaternion=root.rotationQuaternion;root.parent=null;root.rotationQuaternion=null;const position=root.position.clone(),rotation=root.rotation.clone(),scale=root.scaling.clone();root.position.setAll(0);root.rotation.setAll(0);root.scaling.setAll(1);root.computeWorldMatrix(true);
      if(root===this.lander||root===this.spacecraft)for(const mesh of root.getChildMeshes()){mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;mesh.metadata={...mesh.metadata,vehiclePart:root===this.lander?(box.centerWorld.y>2.55?'ascent':'descent'):(box.centerWorld.y>58.3?'capsule':'service')};}
      this.mergeStatic(root,true);root.position.copyFrom(position);root.rotation.copyFrom(rotation);root.scaling.copyFrom(scale);root.parent=parent;root.rotationQuaternion=quaternion;
      for(const mesh of root.getChildMeshes()){mesh.receiveShadows=true;if(mesh instanceof Mesh&&mesh.getTotalVertices()>0)this.shadows.addShadowCaster(mesh);}
    }
    for(const mesh of this.lander.getChildMeshes())if(mesh instanceof Mesh){const clone=mesh.clone('docked LM '+mesh.name,this.transitLander,true);clone?.setEnabled(true);}
    const carrierConversion=new TransformNode('carrier glTF conversion',this.scene);carrierConversion.parent=this.carrier;carrierConversion.scaling.z=-1;
    for(const mesh of apollo.meshes)if(mesh instanceof Mesh&&mesh.getTotalVertices()>0){const clone=mesh.clone('carrier '+mesh.name,carrierConversion,true);if(clone){clone.receiveShadows=true;this.shadows.addShadowCaster(clone);}}
    const foil=new DynamicTexture('thermal blanket crease normal',{width:512,height:512},this.scene,false);const foilContext=foil.getContext() as CanvasRenderingContext2D,foilPixels=foilContext.createImageData(512,512);
    const fold=(x:number,y:number)=>Math.sin(x*.095+Math.cos(y*.057)*5)+Math.cos(y*.14+Math.sin(x*.049)*6)*.65+Math.sin((x+y)*.39)*.2;
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){const dx=(fold(x+1,y)-fold(x-1,y))*2.3,dy=(fold(x,y+1)-fold(x,y-1))*2.3,normal=v(-dx,-dy,1).normalize(),i=(y*512+x)*4;foilPixels.data[i]=(normal.x*.5+.5)*255;foilPixels.data[i+1]=(normal.y*.5+.5)*255;foilPixels.data[i+2]=(normal.z*.5+.5)*255;foilPixels.data[i+3]=255;}foilContext.putImageData(foilPixels,0,0);foil.update();foil.uScale=5;foil.vScale=5;foil.level=.65;
    for(const mesh of this.lander.getChildMeshes()){const mat=mesh.material;if(mat instanceof PBRMaterial&&mat.albedoColor.r>.3&&mat.albedoColor.g>.12&&mat.albedoColor.b<mat.albedoColor.g*.65){mat.metallic=.9;mat.roughness=.46;mat.bumpTexture=foil;mat.environmentIntensity=.8;}}
    this.cockpitMeshes=crew.meshes.filter(m=>m instanceof Mesh) as Mesh[];this.rocketMeshes=launcher.meshes.filter(m=>m instanceof Mesh) as Mesh[];
    this.vehicleDetail=new VehicleDetail(this.scene,this.rocket,this.spacecraft);this.rocketMeshes.push(...this.vehicleDetail.launcherMeshes);
    for(const mesh of this.vehicleDetail.capsuleMeshes)this.shadows.addShadowCaster(mesh);
    // Blender +Y is forward. glTF importer converts right-handed assets for Babylon.
    for(const mesh of this.cockpitMeshes){mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;const m=mesh.material;if(m instanceof PBRMaterial){m.environmentIntensity=.8;m.directIntensity=.18;m.backFaceCulling=false;}}
    for(const mesh of [...this.rocketMeshes,...this.saturnMeshes,...apollo.meshes]){mesh.receiveShadows=true;if(mesh.getTotalVertices()>0)this.shadows.addShadowCaster(mesh);}
    for(const [i,name]of ['DisplayLeft','DisplayCenter','DisplayRight'].entries()){
      const screen=crew.meshes.find(m=>m.name===name);
      if(!screen)continue;
      const tex=new DynamicTexture('MFD-'+i,{width:1024,height:576},this.scene,false);tex.hasAlpha=false;tex.vScale=-1;tex.vOffset=1;this.gauges[i]=tex;
      if(screen){const material=new StandardMaterial('illuminated-'+name,this.scene);material.diffuseColor=Color3.Black();material.emissiveTexture=tex;material.disableLighting=true;material.useLogarithmicDepth=true;material.backFaceCulling=false;material.specularColor=Color3.Black();screen.material=material;}
    }
    this.astronaut.setSeat(v(-.55,1.67,-.90),Quaternion.RotationAxis(Vector3.Right(),-1.079));
    this.apolloInstruments=new ApolloInstruments(this.scene,this.cockpit);this.lunarInstruments=new LunarInstruments(this.scene,lunarCabin.meshes);
    for(const [id,label,action,point,radius]of LUNAR_CONTROLS)this.interactions.register({id,label,description:label,action,parent:this.lunarCabin,position:v(...point),radius,reach:2.4,kind:id==='LM-hatch'?'hatch':'control',enabled:()=>true});
    for(const [name,label,description]of [
      ['LMAltitude','Altitude / range','Height above the landing-site datum, in meters.'],
      ['LMVelocity','Altitude rate','Vertical speed in meters per second. Negative values mean descent.'],
      ['LMAttitude','Attitude indicator','Simplified pitch relative to local vertical.'],
      ['LMAttitudeRight','Pilot attitude indicator','Duplicate simplified pitch indicator.'],
      ['LMFuel','Propellant quantity','Remaining propellant in the active engine tank, percent.'],
      ['LMPower','DC bus','The training electrical bus shows nominal 28 volts while battery power remains.']
    ]){const mesh=lunarCabin.meshes.find(m=>m.name===name);if(mesh)this.interactions.register({id:name,label,description,action:'guide',parent:mesh,position:mesh.getBoundingInfo().boundingBox.center.clone(),radius:.11,reach:2.4,kind:'control',enabled:()=>true});}
    this.registerCockpitInteractions();
    await this.lunarSurface.ready;
    this.worksites=new Worksites(this.scene,this.interactions,this.moon,this.stationInterior,this.lunarGroundHeight);
    for(const mesh of this.worksites.lunar.getChildMeshes()){mesh.receiveShadows=true;this.shadows.addShadowCaster(mesh);}
    for(const z of [-2.8,0,2.8]){const light=new PointLight('Destiny work light',v(0,1.2,z),this.scene);light.parent=this.stationInterior;light.intensity=3;light.range=4.5;}
    if(this.lastState)this.drawGauges(this.lastState);
    await Promise.all([this.lunarSurface.ready,this.coast.ready,this.moonGlobe.ready,this.astronautBody.ready]);await this.scene.whenReadyAsync();
  }

  private async loadAuthenticCockpit(){
    const files=['x3d-cm-interior-hull-uvs-150k-4096-high.glb','x3d-cm-interior-seats-uvs-150k-4096-high.glb','x3d-cm-interior-panel-uvs-150k-4096-high.glb','x3d-cm-interior-graffiti-uvs-150k-2048-high.glb'];
    const results=await Promise.all(files.map(file=>SceneLoader.ImportMeshAsync('','/assets/columbia/',file,this.scene)));
    for(const result of results){const root=result.meshes[0];root.parent=this.cockpit;root.rotationQuaternion=Quaternion.Identity();root.scaling.scaleInPlace(.01);}
    return{meshes:results.flatMap(result=>result.meshes)};
  }
  private registerCockpitInteractions(){
    const controls:[string,string,string,string,number[],number][]=[
      ['dsky','Guidance computer','Toggle guidance assistance.','autopilot',[-28.665,212.504,56.988],.060],
      ['fdai','Attitude indicator','Shows spacecraft orientation relative to the reference frame.','guide',[-32.717,218.319,71.456],.05],
      ['entry-monitor','Entry monitor','Monitor acceleration and velocity during a maneuver.','guide',[-61.683,218.753,78.035],.05],
      ['abort','Abort','Request an emergency abort.','abort',[-51.04,204.85,34.72],.035],
      ['launch-sequence','Launch sequence','Authorize the launch countdown.','ignite',[-76.388,206.327,37.474],.055],
      ['return-guidance','Return guidance','Engage the return program after securing science.','return',[-32.0,207.5,36.0],.045],
      ['cabin-reset','Equipment reset','Isolate and reset the affected circuit.','resolve',[-106.219,148.027,-45.752],.1],
      ['thrust-up','Thrust controller','Increase commanded thrust.','throttle-up',[-32.068,187.5,33.464],.055],
      ['thrust-down','Thrust controller','Decrease commanded thrust.','throttle-down',[-32.068,180.0,33.464],.055],
      ['flight-seat','Commander couch','Restrain yourself at the flight station.','sit',[-55,105,60],.25],
      ['hatch','Side hatch','Leave the spacecraft when it is safe.','exit-worksite',[-40.374,178.735,123.778],.22],
    ];
    for(const [id,label,description,action,point,radius]of controls)this.interactions.register({id,label,description,action,position:v(point[0]*.01,point[1]*.01,-point[2]*.01),radius,reach:2.2,parent:this.cockpit,kind:id==='hatch'?'hatch':'control',enabled:()=>this.astronaut.mode==='seated'||this.astronaut.mode==='cabin'});
  }

  private createSky(){
    Effect.ShadersStore['flightSkyVertexShader']=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 direction;void main(){direction=position;vec4 p=worldViewProjection*vec4(position,1.);gl_Position=p.xyww;}`;
    Effect.ShadersStore['flightSkyFragmentShader']=`precision highp float;varying vec3 direction;uniform float daylight;uniform float weather;uniform float time;uniform float bodyPitch;uniform float solarElevation;uniform float sunVisibility;uniform vec3 sunDirection;uniform vec3 radialUp;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}float fb(vec2 p){float f=0.;f+=.5*n(p);p=p*2.02+17.;f+=.25*n(p);p=p*2.03+9.;f+=.125*n(p);p=p*2.01+11.;f+=.0625*n(p);return f;}
void main(){vec3 d=normalize(direction);d.yz=mat2(cos(bodyPitch),sin(bodyPitch),-sin(bodyPitch),cos(bodyPitch))*d.yz;float elevation=dot(d,normalize(radialUp));float h=max(0.,elevation);vec3 horizon=vec3(.64,.74,.78);vec3 zenith=vec3(.12,.30,.51);vec3 sky=mix(horizon,zenith,pow(h,.35));sky=mix(sky,vec3(.30,.36,.40),weather*.65);float sun=max(0.,dot(d,normalize(sunDirection)));sky+=vec3(1.,.85,.61)*pow(sun,550.)*6.*sunVisibility;sky+=vec3(1.,.75,.49)*pow(sun,18.)*.15*sunVisibility;vec3 east=normalize(cross(abs(radialUp.z)<.9?vec3(0.,0.,1.):vec3(1.,0.,0.),radialUp));vec3 north=cross(radialUp,east);vec2 uv=vec2(dot(d,east),dot(d,north))/max(.065,elevation+.15)*1.9+vec2(time*.001,0.);float clouds=smoothstep(.51-weather*.13,.68-weather*.07,fb(uv*2.));clouds*=smoothstep(-.03,.12,elevation)*(1.-smoothstep(.7,.97,elevation))*.75;sky=mix(sky,mix(vec3(.91,.92,.89),vec3(.46,.50,.53),weather),clouds);float day=smoothstep(-.12,.12,solarElevation);sky=mix(vec3(.003,.008,.022)+vec3(.045,.065,.11)*pow(1.-h,3.),sky,day);float twilight=exp(-pow((solarElevation+.02)*10.,2.))*(1.-h)*(1.-h);sky+=vec3(.32,.10,.028)*twilight*pow(max(0.,sun),4.);vec3 space=vec3(.001,.002,.006);float disk=smoothstep(.9999878,.9999900,sun);gl_FragColor=vec4(mix(space,sky,daylight)+vec3(8.,7.,5.)*disk*(1.-daylight)*sunVisibility,1.);}`;
    const material=new ShaderMaterial('atmospheric-sky',this.scene,{vertex:'flightSky',fragment:'flightSky'},{attributes:['position'],uniforms:['worldViewProjection','daylight','weather','time','bodyPitch','solarElevation','sunVisibility','sunDirection','radialUp']});material.backFaceCulling=false;material.disableDepthWrite=true;material.setVector3('radialUp',Vector3.Up());material.setFloat('bodyPitch',0);material.setFloat('sunVisibility',1);material.setFloat('solarElevation',.65);material.setFloat('daylight',1);material.setFloat('weather',0);material.setFloat('time',0);material.setVector3('sunDirection',v(.55,.65,-.38));
    const sky=MeshBuilder.CreateSphere('sky-vault',{diameter:28_000_000,segments:32},this.scene);sky.material=material;sky.isPickable=false;sky.infiniteDistance=true;sky.renderingGroupId=0;return material;
  }

  private createStars(){
    const rand=seeded(17221),positions:number[]=[],indices:number[]=[],colors:number[]=[];
    for(let i=0;i<1700;i++){const z=rand()*2-1,a=rand()*Math.PI*2,r=9_000_000;const p=v(Math.cos(a)*Math.sqrt(1-z*z)*r,z*r,Math.sin(a)*Math.sqrt(1-z*z)*r);const normal=p.normalizeToNew();const size=900+rand()*2400;const right=Vector3.Cross(normal,Vector3.Up()).normalize().scale(size);const up=Vector3.Cross(right,normal).normalize().scale(size);const base=positions.length/3;for(const q of [p.add(up),p.subtract(up).subtract(right),p.subtract(up).add(right)])positions.push(q.x,q.y,q.z);indices.push(base,base+1,base+2);const light=.2+rand()*.55;for(let j=0;j<3;j++)colors.push(light*.9,light*.94,light,1);}
    const mesh=new Mesh('distant-stars',this.scene);const data=new VertexData();data.positions=positions;data.indices=indices;data.colors=colors;data.applyToMesh(mesh);const mat=new StandardMaterial('starlight',this.scene);mat.useLogarithmicDepth=true;mat.emissiveColor=Color3.White();mat.disableLighting=true;mat.backFaceCulling=false;mat.disableDepthWrite=true;mesh.material=mat;mesh.infiniteDistance=true;mesh.isPickable=false;return mesh;
  }
  private createEarth(){
    const planetDefines=this.graphicsInfo.backend==='WebGPU'?['#define WEBGPU_LINEAR_CLIP']:[];
    const earth=MeshBuilder.CreateSphere('Earth',{diameter:R*2,segments:384},this.scene);
    // NASA land and cloud observations, lit in the planet's own scale rather than a
    // local-cabin PBR environment. Ocean color includes atmospheric blue scattering.
    Effect.ShadersStore['earthSurfaceVertexShader']=`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 worldNormal;varying vec3 worldPosition;varying vec2 surfaceUV;
#include<logDepthDeclaration>
void main(){worldPosition=(world*vec4(position,1.)).xyz;worldNormal=normalize(mat3(world)*normal);surfaceUV=uv;gl_Position=worldViewProjection*vec4(position,1.);float clipZ=gl_Position.z;
#include<logDepthVertex>
#ifdef WEBGPU_LINEAR_CLIP
gl_Position.z=clipZ;
#endif
}`;
    Effect.ShadersStore['earthSurfaceFragmentShader']=`precision highp float;varying vec3 worldNormal;varying vec3 worldPosition;varying vec2 surfaceUV;uniform sampler2D surfaceMap;uniform sampler2D cloudMap;uniform vec3 sunDirection;uniform vec3 cameraPosition;
#include<logDepthDeclaration>
float eh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float en(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(eh(i),eh(i+vec2(1.,0.)),f.x),mix(eh(i+vec2(0.,1.)),eh(i+vec2(1.)),f.x),f.y);}float ef(vec2 p){return en(p)*.55+en(p*2.03+17.)*.28+en(p*4.07+8.)*.17;}
void main(){vec3 land=texture2D(surfaceMap,surfaceUV).rgb;float cloud=texture2D(cloudMap,surfaceUV).a;float detail=ef(surfaceUV*vec2(2600.,1300.));float wisps=ef(surfaceUV*vec2(710.,355.)+vec2(detail*.35));cloud=clamp(cloud*(.65+detail*.55)+smoothstep(.60,.76,wisps)*.55-.10,0.,1.);float ocean=1.-smoothstep(.035,.14,max(land.r,land.g));vec3 base=mix(land*(.95+detail*.18),vec3(.018,.095,.21),ocean);base=mix(base,vec3(.84,.88,.91),cloud*.94);vec3 n=normalize(worldNormal);float day=smoothstep(-.12,.38,dot(n,normalize(sunDirection)));float diffuse=.15+.85*max(0.,dot(n,normalize(sunDirection)));vec3 view=normalize(cameraPosition-worldPosition);float rim=pow(1.-max(0.,dot(n,view)),3.);vec3 color=base*(.025+day*diffuse);vec3 halfVector=normalize(view+normalize(sunDirection));float glint=pow(max(0.,dot(n,halfVector)),100.)*ocean*(1.-cloud)*day;color+=vec3(.44,.49,.52)*glint;color=mix(color,vec3(.13,.37,.65)*(.3+.7*day),rim*.53);gl_FragColor=vec4(color,1.);
#include<logDepthFragment>
}`;
    const surface=new ShaderMaterial('NASA Earth surface',this.scene,{vertex:'earthSurface',fragment:'earthSurface'},{attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','sunDirection','cameraPosition'],samplers:['surfaceMap','cloudMap'],defines:planetDefines});surface.useLogarithmicDepth=true;
    const landMap=new Texture('/assets/earth-blue-marble.jpg',this.scene,false,false);const cloudMap=new Texture('/assets/earth-clouds.png',this.scene,false,false);landMap.anisotropicFilteringLevel=16;cloudMap.anisotropicFilteringLevel=16;surface.setTexture('surfaceMap',landMap);surface.setTexture('cloudMap',cloudMap);surface.setVector3('sunDirection',v(-.45,.82,-.35));surface.setVector3('cameraPosition',Vector3.Zero());earth.material=surface;
    // Align the LC39A texture coordinate with the launch radial reference.
    this.earthOrientation=Quaternion.FromUnitVectorsToRef(v(Math.sin(1.07149)*Math.cos(1.73478),Math.cos(1.07149),-Math.sin(1.07149)*Math.sin(1.73478)),Vector3.Right(),new Quaternion());earth.rotationQuaternion=this.earthOrientation.clone();
    Effect.ShadersStore['earthLimbVertexShader']=`precision highp float;attribute vec3 position;attribute vec3 normal;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 p;varying vec3 n;
#include<logDepthDeclaration>
void main(){p=(world*vec4(position,1.)).xyz;n=normalize(mat3(world)*normal);gl_Position=worldViewProjection*vec4(position,1.);float clipZ=gl_Position.z;
#include<logDepthVertex>
#ifdef WEBGPU_LINEAR_CLIP
gl_Position.z=clipZ;
#endif
}`;
    Effect.ShadersStore['earthLimbFragmentShader']=`precision highp float;varying vec3 p;varying vec3 n;uniform vec3 cameraPosition;uniform float strength;uniform vec3 sunDirection;
#include<logDepthDeclaration>
void main(){vec3 view=normalize(cameraPosition-p);float rim=pow(1.-abs(dot(view,n)),4.);float lit=.3+.7*max(0.,dot(n,normalize(sunDirection)));gl_FragColor=vec4(.12,.39,.78,rim*lit*.25*strength);
#include<logDepthFragment>
}`;
    const limb=new ShaderMaterial('earth-atmospheric-limb',this.scene,{vertex:'earthLimb',fragment:'earthLimb'},{attributes:['position','normal'],uniforms:['world','worldViewProjection','cameraPosition','strength','sunDirection'],needAlphaBlending:true,defines:planetDefines});limb.useLogarithmicDepth=true;limb.backFaceCulling=false;limb.disableDepthWrite=true;limb.setFloat('strength',1);limb.setVector3('sunDirection',v(.55,.65,-.38));
    const air=MeshBuilder.CreateSphere('Earth atmosphere',{diameter:(R+45000)*2,segments:256},this.scene);air.material=limb;air.isPickable=false;air.alphaIndex=1;return{earth,air,surface};
  }

  private terrainMaterial(name:string,asset:'moon'|'earth',repeat:number){
    const mat=this.mat(name,'#ffffff',0,.95);mat.albedoTexture=new Texture(`/assets/${asset}-albedo.jpg`,this.scene);mat.bumpTexture=new Texture(`/assets/${asset}-normal.jpg`,this.scene);mat.bumpTexture.level=.48;mat.invertNormalMapX=true;mat.metallicTexture=new Texture(`/assets/${asset}-arm.jpg`,this.scene);mat.useRoughnessFromMetallicTextureGreen=true;mat.useMetallnessFromMetallicTextureBlue=true;mat.useAmbientOcclusionFromMetallicTextureRed=true;mat.useRoughnessFromMetallicTextureAlpha=false;
    for(const texture of [mat.albedoTexture,mat.bumpTexture,mat.metallicTexture] as Texture[]){texture.uScale=repeat;texture.vScale=repeat;texture.anisotropicFilteringLevel=8;}
    return mat;
  }
  private createLaunchSite(){
    const root=this.site;
    const water=this.mat('Atlantic ocean','#345b69',.15,.23);water.environmentIntensity=.75;water.alpha=.98;const ocean=MeshBuilder.CreateGround('Atlantic water',{width:160000,height:160000,subdivisions:2},this.scene);ocean.material=water;ocean.position.y=0;ocean.parent=root;
    const concrete=this.mat('weathered pad concrete','#9b9c95',.02,.96);concrete.albedoTexture=new Texture('/assets/concrete-albedo.jpg',this.scene);concrete.bumpTexture=new Texture('/assets/concrete-normal.jpg',this.scene);concrete.bumpTexture.level=.25;for(const t of [concrete.albedoTexture,concrete.bumpTexture] as Texture[]){t.uScale=20;t.vScale=20;} const steel=this.mat('galvanized tower steel','#a5aaab',.75,.43);const dark=this.mat('truss shadow coating','#4b5255',.65,.52);const red=this.mat('gantry neutral structural coating','#859296',.45,.48);const asphalt=this.mat('service roads','#3f4443',.02,.96);const white=this.mat('painted safety lines','#c4c1af',0,.8);const glazing=this.mat('facility glazing','#294654',.65,.17);
    const pad=this.box('launch mount platform',v(0,2.45,0),v(82,.55,102),concrete,root);this.shadows.addShadowCaster(pad);
    const scorch=this.mat('scorched refractory concrete','#262b29',0,.99);this.box('flame trench',v(0,2.76,8),v(11,.13,49),scorch,root);for(const x of [-6.2,6.2])this.box('trench retaining wall',v(x,3.05,8),v(.7,.65,49),concrete,root);
    for(const x of [-13,13])this.box('launch mount abutment',v(x,5,0),v(4,4,10),concrete,root);
    this.box('mobile launcher steel deck',v(-3,6.45,4),v(42,1.1,28),steel,root);
    const deck=this.cylinder('launch mount ring',v(0,5.2,0),7,.8,steel,root);this.shadows.addShadowCaster(deck);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;this.beam('hold down strut',v(Math.sin(a)*5,5.6,Math.cos(a)*5),v(Math.sin(a)*2,7.4,Math.cos(a)*2),.4,dark,root);}
    for(const z of [162,183])this.box('crawlerway gravel track',v(-300,2.28,z),v(1300,.22,13),concrete,root);this.box('pad access ramp',v(0,2.35,106),v(44,.35,170),concrete,root);
    for(const x of [-46,46]){this.beam('pad perimeter rail',v(x,3.5,-53),v(x,3.5,54),.065,steel,root);for(let z=-53;z<=54;z+=7)this.beam('perimeter post',v(x,2.4,z),v(x,3.5,z),.065,steel,root);}
    this.box('service road north',v(-260,2.3,-150),v(1400,.2,10),asphalt,root);
    this.box('service road turn',v(-880,2.3,450),v(10,.2,1200),asphalt,root);
    for(let i=0;i<50;i++)this.box('road center dash',v(-950+i*28,2.45,-150),v(13,.03,.18),white,root);
    // Training launch tower: Apollo-era LUT proportions with a neutral refit finish.
    const tx=-19,tz=12;
    for(const x of [tx-5,tx+5])for(const z of [tz-5,tz+5])this.beam('tower main leg',v(x,3,z),v(x,121,z),.65,red,root);
    for(let level=0;level<15;level++){
      const y=4+level*8;this.box('tower open deck',v(tx,y,tz),v(11,.2,11),dark,root);
      for(const z of [tz-5,tz+5]){this.beam('tower diagonal',v(tx-5,y,z),v(tx+5,y+8,z),.18,red,root);this.beam('tower diagonal',v(tx+5,y,z),v(tx-5,y+8,z),.18,red,root);this.beam('tower guard rail',v(tx-5,y+1.1,z),v(tx+5,y+1.1,z),.07,red,root);}
      for(const x of [tx-5,tx+5])this.beam('tower side brace',v(x,y,tz-5),v(x,y+8,tz+5),.19,red,root);
      this.box('tower elevator guide',v(tx-3,y+4,tz+3),v(1.2,8,1.2),dark,root);
    }
    for(const y of [18,34,49,62,77,88,100]){this.box('umbilical access arm',v(-10,y,10),v(19,.7,2.3),red,root);for(const z of [8.8,11.2])this.beam('access arm railing',v(-19,y+1.2,z),v(-1,y+1.2,z),.07,red,root);}
    for(const [x,z]of [[-100,-100],[115,45],[-35,140]]){this.beam('lightning mast',v(x,2,z),v(x,130,z),.45,steel,root);this.beam('mast safety cable',v(x,130,z),v(0,102,0),.035,dark,root);}
    // Ground service pipework, deluge tanks, support buildings with glazed bands.
    for(let i=0;i<5;i++){this.beam('deluge pipe',v(-70+i*3,3,-62),v(48,3,-62+i*3),.45,steel,root);this.beam('pad feed pipe',v(48,3,-62+i*3),v(48,3,30),.45,steel,root);}
    const tankPaint=this.mat('painted steel tank','#c1c6c3',.48,.44);
    for(const [x,z,r,h]of [[-160,120,15,20],[-200,130,10,14],[-145,180,9,12]]){this.cylinder('water storage tank',v(x,2+h/2,z),r,h,tankPaint,root);this.cylinder('tank lid',v(x,2+h,z),r+.2,.4,steel,root);for(let y=4;y<h+2;y+=3.5){const ring=MeshBuilder.CreateTorus('tank seam',{diameter:r*2+.07,thickness:.06,tessellation:64},this.scene);ring.position=v(x,y,z);ring.material=steel;ring.parent=root;}for(const xx of [x-.32,x+.32])this.beam('tank ladder rail',v(xx,2,z-r-.15),v(xx,h+3,z-r-.15),.05,steel,root);for(let y=2.3;y<h+3;y+=.65)this.beam('tank ladder rung',v(x-.32,y,z-r-.15),v(x+.32,y,z-r-.15),.045,steel,root);}
    const siding=this.mat('facility metal siding','#99a3a6',.4,.56);const sidingTex=new DynamicTexture('corrugated wall finish',{width:256,height:256},this.scene,false);const sc=sidingTex.getContext();sc.fillStyle='#bcc2c1';sc.fillRect(0,0,256,256);for(let x=0;x<256;x+=16){sc.fillStyle='#89918f';sc.fillRect(x,0,1,256);sc.fillStyle='#d2d5d2';sc.fillRect(x+2,0,1,256);}sidingTex.update();sidingTex.uScale=5;siding.albedoTexture=sidingTex;

    const buildings=[[-380,260,80,14,50],[-440,350,110,18,60],[-920,540,120,40,100],[-350,-290,48,9,36]];
    for(const [x,z,w,h,d]of buildings){const building=this.box('support facility',v(x,2+h/2,z),v(w,h,d),siding,root);this.box('facility sloped roof',v(x,h+2,z),v(w+1,.7,d+1),steel,root);this.box('facility window band',v(x,h*.7,z-d/2-.08),v(w*.86,2,.1),glazing,root);this.shadows.addShadowCaster(building);this.box('facility service door',v(x-w*.28,6,z-d/2-.12),v(12,8,.15),dark,root);for(let yy=3;yy<h;yy+=3)this.box('wall horizontal course',v(x,yy,z-d/2-.15),v(w,.05,.08),steel,root);for(let j=0;j<4;j++)this.box('rooftop ventilation',v(x-w*.3+j*w*.2,h+3.2,z),v(4,2,4),steel,root);}
    // Local vapor puffs use soft transparency sprites, moved by wind during ignition.
    const vaporTex=this.softParticleTexture();const vaporMat=new StandardMaterial('water deluge vapor',this.scene);vaporMat.useLogarithmicDepth=true;vaporMat.diffuseTexture=vaporTex;vaporMat.opacityTexture=vaporTex;vaporMat.emissiveColor=new Color3(.4,.45,.48);vaporMat.diffuseColor=new Color3(.8,.83,.82);vaporMat.disableLighting=false;vaporMat.backFaceCulling=false;vaporMat.alpha=.3;
    for(let i=0;i<22;i++){const p=MeshBuilder.CreatePlane('keep-deluge-vapor',{size:1},this.scene);p.material=vaporMat;p.billboardMode=Mesh.BILLBOARDMODE_ALL;p.parent=root;p.setEnabled(false);this.vapor.push(p);}
    // Consolidating structures keeps the detailed launch complex affordable to render.
    this.mergeStatic(root);
    for(const mesh of root.getChildMeshes())if(mesh instanceof Mesh&&mesh.name.startsWith('structure-'))this.shadows.addShadowCaster(mesh);
    return{ocean,water};
  }

  private softParticleTexture(){
    const tex=new DynamicTexture('soft-exhaust-vapor',{width:128,height:128},this.scene,false);const c=tex.getContext();const g=c.createRadialGradient(64,64,1,64,64,64);g.addColorStop(0,'rgba(255,255,255,.6)');g.addColorStop(.35,'rgba(255,255,255,.3)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,128,128);tex.hasAlpha=true;tex.update();return tex;
  }
  private createExhaust(){
    Effect.ShadersStore['plumeVertexShader']=`precision highp float;attribute vec3 position;attribute vec3 normal;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 wp;varying vec3 wn;varying vec3 localPosition;
#include<logDepthDeclaration>
void main(){wp=(world*vec4(position,1.)).xyz;wn=normalize(mat3(world)*normal);localPosition=position;gl_Position=worldViewProjection*vec4(position,1.);
#include<logDepthVertex>
}`;
    Effect.ShadersStore['plumeFragmentShader']=`precision highp float;varying vec3 wp;varying vec3 wn;varying vec3 localPosition;uniform vec3 eye;uniform float time;uniform float plumeLength;uniform float core;
#include<logDepthDeclaration>
void main(){float t=clamp(.5-localPosition.y/plumeLength,0.,1.);float facing=pow(abs(dot(normalize(wn),normalize(eye-wp))),1.3);float turbulence=.78+.22*sin(t*65.-time*35.+sin(localPosition.x*17.+time*12.));float tail=pow(1.-t,1.45)*smoothstep(0.,.035,t);float alpha=facing*tail*turbulence*mix(.27,.83,core);vec3 heat=mix(vec3(3.8,2.8,1.5),vec3(1.7,.25,.025),smoothstep(.03,.85,t));gl_FragColor=vec4(heat,alpha);
#include<logDepthFragment>
}`;
    const plume=(name:string,length:number,top:number,bottom:number,core:number)=>{
      const mesh=MeshBuilder.CreateCylinder(name,{diameterTop:top,diameterBottom:bottom,height:length,tessellation:48,cap:Mesh.NO_CAP},this.scene);
      const material=new ShaderMaterial(name+' translucent gas',this.scene,{vertex:'plume',fragment:'plume'},{attributes:['position','normal'],uniforms:['world','worldViewProjection','eye','time','plumeLength','core'],needAlphaBlending:true});material.useLogarithmicDepth=true;material.backFaceCulling=false;material.disableDepthWrite=true;material.setFloat('plumeLength',length);material.setFloat('core',core);material.setFloat('time',0);material.setVector3('eye',Vector3.Zero());mesh.material=material;mesh.parent=this.rocket;mesh.position.y=-length/2;mesh.setEnabled(false);return mesh;
    };
    return{inner:plume('exhaust core',18,1.7,.4,1),outer:plume('exhaust expanding gas',25,2.2,5.5,0)};
  }

  private createMoon(){
    const root=new TransformNode('lunar-landing-region',this.scene);const material=this.terrainMaterial('lunar regolith','moon',110);material.albedoColor=new Color3(.58,.58,.57);material.environmentIntensity=.12;material.bumpTexture!.level=.8;
    const rand=seeded(25031);const craters:{x:number;z:number;r:number;depth:number}[]=[];
    for(let i=0;i<125;i++){const x=(rand()-.5)*6500,z=(rand()-.5)*6500;if(Math.hypot(x,z)<55)continue;const r=18+rand()**2*330;craters.push({x,z,r,depth:r*(.11+rand()*.08)});}
    // Impact depressions are part of the terrain mesh; nothing floats above the ground.
    const height=(x:number,z:number)=>{
      let h=noise(x*.0011,z*.0011)*35+noise(x*.0037,z*.0037)*11+noise(x*.013,z*.013)*2.3;
      for(const c of craters){const d=Math.hypot(x-c.x,z-c.z)/c.r;if(d>1.5)continue;const bowl=-c.depth*Math.pow(Math.max(0,1-d*d),1.3);const rim=c.depth*.21*Math.exp(-(((d-.98)/.15)**2));h+=bowl+rim;}
      const d=Math.hypot(x,z);return h*smooth(65,145,d);
    };
    this.lunarGroundHeight=height;
    const ground=MeshBuilder.CreateGround('continuous-lunar-terrain',{width:2,height:2,subdivisions:400,updatable:true},this.scene);const pos=ground.getVerticesData('position')!;
    const stretch=(n:number)=>Math.sign(n)*3750*Math.abs(n)**2.15;
    for(let i=0;i<pos.length;i+=3){pos[i]=stretch(pos[i]);pos[i+2]=stretch(pos[i+2]);pos[i+1]=height(pos[i],pos[i+2]);}
    ground.updateVerticesData('position',pos,true);const normals:number[]=[];VertexData.ComputeNormals(pos,ground.getIndices()!,normals);ground.updateVerticesData('normal',normals);const uv=ground.getVerticesData('uv')!;for(let i=0;i<pos.length/3;i++){uv[i*2]=(pos[i*3]+3750)/7500;uv[i*2+1]=(pos[i*3+2]+3750)/7500;}ground.updateVerticesData('uv',uv);material.albedoColor=new Color3(.9,.9,.88);material.environmentIntensity=.18;ground.material=material;ground.parent=root;ground.receiveShadows=true;
    const rockmat=this.terrainMaterial('lunar basalt rocks','moon',2);rockmat.albedoColor=new Color3(.39,.39,.38);rockmat.environmentIntensity=.08;
    const rocks:Mesh[]=[];
    for(let i=0;i<180;i++){const a=rand()*Math.PI*2,d=85+rand()**1.3*1000;const x=Math.cos(a)*d,z=Math.sin(a)*d,r=.18+rand()**3*1.8;const rock=MeshBuilder.CreateSphere('basalt-boulder',{diameter:r*2,segments:12,updatable:true},this.scene);const rp=rock.getVerticesData('position')!;for(let j=0;j<rp.length;j+=3){const f=.84+.18*noise(rp[j]*1.7+i,rp[j+2]*2.1);rp[j]*=f;rp[j+1]*=.62*f;rp[j+2]*=f;}rock.updateVerticesData('position',rp,true);const rn:number[]=[];VertexData.ComputeNormals(rp,rock.getIndices()!,rn);rock.updateVerticesData('normal',rn);rock.position=v(x,height(x,z)+r*.23,z);rock.rotation.y=rand()*6.28;rock.material=rockmat;rock.parent=root;rock.receiveShadows=true;rocks.push(rock);}
    const merged=Mesh.MergeMeshes(rocks,true,true,undefined,false,false);if(merged){merged.name='scattered-lunar-boulders';merged.parent=root;merged.receiveShadows=true;this.shadows.addShadowCaster(merged);}
    // Only sparse survey beacons mark the chosen site. Lunar science equipment sits off-center.
    const metal=this.mat('lunar instrument alloy','#8e9290',.8,.42);const gold=this.mat('multilayer insulation','#b29457',.65,.58);const dark=this.mat('solar panel blue','#1b2c42',.5,.31);const beacon=this.mat('survey beacon','#aec9b9',.2,.45,'#579f78');
    for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;this.cylinder('survey stake',v(Math.sin(a)*13,.65,Math.cos(a)*13),.045,1.3,metal,root);const light=this.cylinder('survey stake light',v(Math.sin(a)*13,1.34,Math.cos(a)*13),.08,.13,beacon,root);}
    this.box('seismometer experiment',v(22,.55,6),v(1.5,1.05,1.3),gold,root);this.beam('experiment mast',v(22,.9,6),v(22,2.7,6),.06,metal,root);this.box('experiment solar wing',v(24,1,6),v(2.6,.06,1.6),dark,root);
    this.moonBounds();root.setEnabled(false);return{root,material};
  }
  private moonBounds(){/* Terrain extent is intentionally finite, with a distant low relief horizon. */}

  private createSolarTexture(){const tex=new DynamicTexture('silicon photovoltaic cells',{width:512,height:1024},this.scene,false);const c=tex.getContext();c.fillStyle='#122035';c.fillRect(0,0,512,1024);for(let x=0;x<512;x+=24)for(let y=0;y<1024;y+=42){c.fillStyle=`rgb(${18+(x%7)},${31+(y%13)},${47+(x+y)%24})`;c.fillRect(x+1,y+1,22,40);c.fillStyle='#a2a59d44';c.fillRect(x+6,y,1,42);c.fillRect(x+17,y,1,42);}tex.update();return tex;}
  private createStation(){
    const root=new TransformNode('orbital-station',this.scene);const white=this.mat('station thermal blankets','#c4c6bd',.35,.6);const metal=this.mat('station truss alloy','#91999c',.85,.36);const dark=this.mat('docking assembly metal','#3b4144',.75,.4);const gold=this.mat('station MLI insulation','#ad8844',.65,.48);const solar=this.mat('silicon solar arrays','#ffffff',.6,.36);solar.albedoTexture=this.createSolarTexture();const frame=this.mat('solar wing frame','#9b8662',.8,.4);const beacon=this.mat('station approach light','#7b9c8a',.15,.5,'#99bca9');
    // Actual truss depth and triangulation, paired modules and distinct articulated wings.
    for(const y of [-.9,.9])for(const z of [3.2,4.8])this.beam('truss longitudinal',v(-45,y,z),v(45,y,z),.15,metal,root);
    for(let x=-45;x<45;x+=3){this.beam('truss diagonal',v(x,-.9,3.2),v(x+3,.9,3.2),.09,metal,root);this.beam('truss depth cross',v(x,.9,3.2),v(x+3,-.9,4.8),.09,metal,root);}
    const module=(name:string,p:Vector3,length:number,diameter:number,axis:'z'|'x'='z')=>{
      const mesh=MeshBuilder.CreateCylinder(name,{height:length,diameter,tessellation:48},this.scene);mesh.material=white;mesh.position=p;mesh.parent=root;mesh.rotation.x=Math.PI/2;if(axis==='x'){mesh.rotation.x=0;mesh.rotation.z=Math.PI/2;}
      for(const sign of [-1,1]){const cap=MeshBuilder.CreateSphere(name+' end pressure dome',{diameter,segments:24},this.scene);cap.scaling.set(1,1,.28);cap.position=p.add(axis==='z'?v(0,0,sign*length/2):v(sign*length/2,0,0));if(axis==='x')cap.rotation.y=Math.PI/2;cap.material=white;cap.parent=root;}
      for(let k=0;k<6;k++){const ring=MeshBuilder.CreateTorus(name+' joint flange',{diameter:diameter+.03,thickness:.06,tessellation:48},this.scene);ring.rotation.x=Math.PI/2;ring.position=p.add(v(0,0,-length/2+(k+.5)*length/6));if(axis==='x'){ring.rotation.x=0;ring.rotation.z=Math.PI/2;ring.position=p.add(v(-length/2+(k+.5)*length/6,0,0));}ring.material=metal;ring.parent=root;}
      for(const sign of [-1,1])this.beam('module EVA handrail',p.add(v(sign*diameter*.55,.55,-length*.35)),p.add(v(sign*diameter*.55,.55,length*.35)),.045,metal,root);
      return mesh;
    };
    module('forward laboratory',v(0,-1.7,-5.5),7,4.1);module('forward node',v(0,-1.7,-11),3.4,4.4);module('connecting node',v(0,-1.7,1),4,4.3);module('service laboratory',v(0,-1.7,7.2),8,4.0);module('aft supply module',v(0,-1.7,14),5,3.8);
    module('port laboratory',v(-5.9,-1.7,-9.5),8.2,4,'x');module('starboard laboratory',v(6.3,-1.7,-9.5),8.8,4,'x');module('airlock',v(-4.3,-1.7,1.5),4.3,3,'x');
    for(const x of [-36,-24,24,36]){
      for(const sign of [-1,1]){
        const wing=new TransformNode('articulated solar wing',this.scene);wing.parent=root;wing.position=v(x,sign*12,4);wing.rotation.y=x<0?-.21:.17;wing.rotation.x=sign*.04;
        this.box('solar blanket frame',v(0,0,0),v(7.7,22,.13),frame,wing);this.box('cell blanket',v(0,0,-.09),v(7.48,21.8,.025),solar,wing);
        this.beam('folding solar mast',v(0,-11,0),v(0,11,0),.13,metal,wing);
        for(let j=-10;j<11;j+=2)this.beam('solar blanket rib',v(-3.8,j,-.13),v(3.8,j,-.13),.025,frame,wing);
        this.beam('array rotary axle',v(x,0,4),v(x,sign*23,4),.28,metal,root);
      }
    }
    for(const x of [-11,11])for(let i=0;i<3;i++){const radiator=this.box('ammonia radiator',v(x+(i-1)*2.9,1.6,8.5),v(2.6,.1,13),white,root);radiator.rotation.z=x<0?-.46:.46;for(let k=-5;k<6;k++)this.box('radiator channel',v(x+(i-1)*2.9,1.7,8.5+k),v(2.4,.025,.035),metal,root);}
    this.box('external payload platform',v(10,-4,-9),v(4,1.2,3),gold,root);
    this.beam('robotic arm segment',v(3,1,-7),v(9,5,-2),.35,white,root);this.beam('robotic arm segment',v(9,5,-2),v(3,7,5),.35,white,root);for(const p of [v(3,1,-7),v(9,5,-2),v(3,7,5)]){const joint=MeshBuilder.CreateSphere('robotic arm hinge',{diameter:.8,segments:20},this.scene);joint.position=p;joint.material=dark;joint.parent=root;}
    const dock=MeshBuilder.CreateCylinder('docking port',{diameter:2.8,height:1.8,tessellation:64},this.scene);dock.rotation.x=Math.PI/2;dock.position=v(0,-1.7,-14.2);dock.material=dark;dock.parent=root;
    for(const z of [-15.2,-14.5]){const ring=MeshBuilder.CreateTorus('capture mechanism',{diameter:2.9,thickness:.13,tessellation:64},this.scene);ring.rotation.x=Math.PI/2;ring.position=v(0,-1.7,z);ring.material=metal;ring.parent=root;}
    for(let i=0;i<12;i++){const a=i*Math.PI/6;this.box('capture latch',v(Math.sin(a)*1.42,-1.7+Math.cos(a)*1.42,-15.24),v(.15,.22,.14),metal,root);}
    for(const x of [-1.8,1.8])this.box('docking beacon',v(x,-1.7,-15.15),v(.09,.09,.06),beacon,root);
    this.box('port alignment horizontal',v(0,-1.7,-15.24),v(.5,.025,.02),beacon,root);this.box('port alignment vertical',v(0,-1.7,-15.24),v(.025,.5,.02),beacon,root);
    this.mergeStatic(root);root.setEnabled(false);return root;
  }

  setQuality(quality:Quality){this.quality=quality;this.engine.setHardwareScalingLevel(quality==='low'?1.6:Math.max(1,(window.devicePixelRatio||1)/1.5));this.pipeline.bloomEnabled=quality==='high';this.shadows.getShadowMap()!.resize(quality==='low'?1024:2048);}
  setLook(yaw:number,pitch:number){this.lookX=yaw;this.lookY=clamp(pitch,-1.48,1.48);this.astronaut.setLook(this.lookX,this.lookY);}
  setView(view:View){this.view=view;if(view==='trajectory')this.trajectoryView.resetFrame();this.inspectionFov=1.25;this.camera.fov=view==='cockpit'?this.inspectionFov:.8;}
  zoomCockpit(factor:number){this.inspectionFov=clamp(this.inspectionFov*factor,.4,1.25);}
  zoomTrajectory(factor:number){this.trajectoryView.zoom(factor);}
  setFlightActive(active:boolean){this.flightActive=active;}
  setAstronautMode(mode:AstronautMode,environment?:AstronautEnvironment){const lunarCabin=this.lastState?.plan.destination==='moon'&&this.lastState.trajectory.referenceBody==='moon'&&(this.lastState.trajectory.landed||this.lastState.flightMode==='lunar-descent');this.astronaut.setMode(mode,lunarCabin&&(mode==='cabin'||mode==='seated')?'lunar':environment??(mode==='station'?'station':mode==='eva'?'lunar':'capsule'));}
  setAstronautInput(input:Partial<AstronautInput>){this.astronaut.setInput(input);}
  getFocus(){return this.getInteraction();}
  getInteraction(pointer?:{x:number;y:number}):SceneInteraction|null{return this.flightActive&&this.view==='cockpit'?this.interactions.query(pointer):null;}
  interact(pointer?:{x:number;y:number}):SceneInteraction|null{const hit=this.flightActive&&this.view==='cockpit'?this.interactions.activate(pointer):null;if(hit?.enabled)this.astronautBody.reach();return hit;}
  stopAstronaut(){this.astronaut.stopMovement();}
  getObjective(){
    const state=this.lastState;if(!state||!this.flightActive||this.view!=='cockpit')return null;
    let action='';const mode=this.astronaut.mode;
    if(mode==='eva'||mode==='station'){
      const tasks=state.plan.destination==='moon'?['deploy-seismometer','collect-sample','record-panorama','stow-samples']:['install-sample','power-experiment','record-observation','stow-results'];
      action=state.awaitingCrewSeat||state.navigation.returnRequested||state.phase==='return'?'board':state.event&&!state.eventResolved?'resolve':state.completedActivities.length<tasks.length?'activity:'+tasks[state.completedActivities.length]:'board';
    }else if(mode==='cabin')action=state.phase==='science'&&state.science<100?'exit-worksite':'sit';
    else if(state.phase==='launch'&&!state.ignited)action='ignite';
    else if(state.phase==='science')action=state.science>=100?'return':'exit-worksite';
    return action?this.interactions.objective(action):null;
  }

  update(state:State,dt:number){
    if(this.disposed)return;this.lastState=state;this.sceneTime+=Math.max(0,dt);this.coast.setSite(state.plan.launchSite??'lc39a');
    const t=state.trajectory;if(!t)return;
    const rh=(p:Vec3)=>v(p[0],p[1],-p[2]);
    const relative=(p:Vec3)=>v(p[0]-t.position[0],p[1]-t.position[1],t.position[2]-p[2]);
    const [qx,qy,qz,qw]=t.attitudeQuaternion,body=new Quaternion(-qx,-qy,qz,qw).normalize(),inverse=body.conjugate();
    this.worldFrame.rotation.setAll(0);this.worldFrame.rotationQuaternion=inverse;
    const inverseMatrix=Matrix.Identity();inverse.toRotationMatrix(inverseMatrix);
    const local=(p:Vector3)=>Vector3.TransformCoordinates(p,inverseMatrix);
    const modern=(state.plan as State['plan']&{vehicle?:string}).vehicle!=='heritage';this.vehicleDetail?.setEnabled(modern);
    const lunar=state.plan.destination==='moon',launch=state.phase==='launch',mapView=this.flightActive&&this.view==='trajectory';
    const attachedUpper=lunar&&state.launchStage<=3&&['launch','transfer'].includes(state.phase)&&['pad','ascent','parking','tli'].includes(state.flightMode);
    const lunarVehicle=lunar&&['lunar-descent','surface','launch-window','lunar-ascent','carrier-rendezvous'].includes(state.flightMode);
    const external=!this.flightActive||this.view==='external';
    const outside=this.astronaut.mode==='eva',insideStation=this.astronaut.mode==='station';if(this.astronaut.mode==='seated'||this.astronaut.mode==='cabin')this.astronaut.environment=lunarVehicle?'lunar':'capsule';
    const earthAltitude=Math.max(0,Math.hypot(...t.position)-EARTH_RADIUS),atmosphere=Math.exp(-earthAltitude/15500);
    const weather=state.plan.weather==='overcast'?.85:state.plan.weather==='crosswind'?.4:0;
    const bodyUp=local(rh(t.referenceBody==='moon'?t.landingSiteNormal:[t.position[0]/(EARTH_RADIUS+earthAltitude),t.position[1]/(EARTH_RADIUS+earthAltitude),t.position[2]/(EARTH_RADIUS+earthAltitude)]));
    this.sky.setFloat('bodyPitch',0);this.sky.setFloat('daylight',mapView?0:atmosphere);this.sky.setFloat('weather',weather);this.sky.setFloat('time',this.sceneTime);this.sky.setVector3('radialUp',bodyUp);
    const sunElevation=Vector3.Dot(local(rh(t.sunDirection)).normalize(),bodyUp.normalizeToNew());
    const daytime=smooth(-.12,.12,sunElevation);this.sky.setFloat('solarElevation',sunElevation);
    const landingDistance=Math.hypot(t.position[0]-t.landingSitePosition[0],t.position[1]-t.landingSitePosition[1],t.position[2]-t.landingSitePosition[2]);
    const sunlight=solarVisibility(t.position,t.sunDirection,[{center:[0,0,0],radius:EARTH_RADIUS},{center:t.moonPosition,radius:lunarShadowRadius(landingDistance)}]);this.sky.setFloat('sunVisibility',sunlight);
    this.stars.visibility=(1-atmosphere*daytime)*.48;this.stars.setEnabled(!mapView);this.worldFrame.setEnabled(!mapView);this.trajectoryView.root.setEnabled(mapView);
    this.sun.direction=local(rh(t.sunDirection)).negate().normalize();this.sun.intensity=(3.8-weather*atmosphere*.6)*sunlight;
    this.fill.intensity=atmosphere*(.04+.31*daytime)+.07;this.fill.groundColor=new Color3(.04,.045,.045);this.scene.environmentIntensity=atmosphere*.2*daytime+.18;
    this.scene.fogMode=earthAltitude<18000&&!mapView?Scene.FOGMODE_EXP2:Scene.FOGMODE_NONE;this.scene.fogDensity=.000045*(1+weather*.7)*atmosphere;this.scene.fogColor=Color3.Lerp(new Color3(.016,.025,.045),new Color3(.64,.74,.78),daytime);
    this.camera.minZ=.04;this.camera.maxZ=220_000_000_000;
    // Every celestial position is the same SI state, relative to the vehicle. No
    // phase changes alter radii, distance, Moon orientation or the landing site.
    this.earth.position.copyFrom(relative([0,0,0]));this.earth.scaling.setAll(1);this.earth.rotationQuaternion=Quaternion.RotationAxis(Vector3.Forward(),EARTH_ROTATION*t.epochSeconds).multiply(this.earthOrientation);
    this.earthAir.position.copyFrom(this.earth.position);this.earthAir.scaling.setAll(1);
    this.earth.setEnabled(true);this.earthAir.setEnabled(earthAltitude>1500);
    this.moonGlobe.mesh.position.copyFrom(relative(t.moonPosition));this.moonGlobe.setRotation(t.moonRotation);
    const up=rh(t.landingSiteNormal).normalize(),east=rh([-t.landingSiteNormal[1],t.landingSiteNormal[0],0]).normalize(),north=Vector3.Cross(east,up).normalize();
    const siteOrientation=Quaternion.RotationQuaternionFromAxis(east,up,north);
    this.moon.position.copyFrom(relative(t.landingSitePosition));this.moon.rotationQuaternion=siteOrientation;
    const siteRange=this.moon.position.length();this.moon.setEnabled(siteRange<150000);
    // The global LOLA mesh is metres per sample; the measured 2m local DTM is
    // rendered over it only when the crew is in the landing-site neighbourhood.
    this.moonGlobe.mesh.setEnabled(true);this.moonGlobe.material.setFloat('localPatch',siteRange<150000?1:0);this.moonGlobe.material.setVector3('sunDirection',this.sun.direction.negate());
    const a=EARTH_ROTATION*t.epochSeconds,launchNormal=v(Math.cos(a),Math.sin(a),0),launchEast=v(-Math.sin(a),Math.cos(a),0),launchNorth=v(0,0,-1);
    this.site.position.copyFrom(relative([EARTH_RADIUS*Math.cos(a),EARTH_RADIUS*Math.sin(a),0]));this.site.rotationQuaternion=Quaternion.RotationQuaternionFromAxis(launchEast,launchNormal,launchNorth);
    const launchRange=this.site.position.length();this.site.setEnabled(launchRange<25000);for(const mesh of this.site.getChildMeshes())mesh.visibility=1-smooth(12000,25000,launchRange);
    this.rocket.position.set(0,7.5,0);this.rocket.rotation.setAll(0);this.rocket.scaling.setAll(1);this.rocket.rotationQuaternion=null;
    this.saturn.position.set(0,7.5,0);this.saturn.rotation.setAll(0);
    this.rocket.setEnabled(external&&launch&&!lunar&&!mapView);this.saturn.setEnabled(external&&attachedUpper&&!mapView);
    for(const mesh of this.rocketMeshes){if(mesh.name.includes('Stage1'))mesh.setEnabled(state.launchStage===1);if(mesh.name.includes('Stage2'))mesh.setEnabled(state.launchStage<=2);}
    for(const mesh of this.saturnMeshes){if(mesh.name.startsWith('SIC-'))mesh.setEnabled(state.launchStage===1);else if(mesh.name.startsWith('SII-'))mesh.setEnabled(state.launchStage<=2);else if(mesh.name.startsWith('SIVB-'))mesh.setEnabled(state.launchStage<=3);}
    this.spacecraft.setEnabled(external&&!lunar&&!launch&&!attachedUpper&&!lunarVehicle&&!mapView);
    this.apollo.setEnabled(external&&lunar&&!launch&&!attachedUpper&&!lunarVehicle&&!mapView);this.apollo.position.set(0,-3.69,0);
    this.transitLander.setEnabled(external&&lunar&&['translunar','lunar-capture','lunar-orbit'].includes(state.flightMode)&&!mapView);this.transitLander.position.set(0,4.75,0);this.transitLander.rotation.x=Math.PI;
    for(const mesh of this.apollo.getChildMeshes()){mesh.setEnabled(!['escape','entry','recovered'].includes(state.flightMode)||!mesh.name.startsWith('SM-'));}
    this.carrier.setEnabled(!!state.navigation.carrier&&lunarVehicle&&!mapView);if(state.navigation.carrier){if(!this.carrierOrientation)this.carrierOrientation=body.clone();const carrierMatrix=Matrix.Identity();this.carrierOrientation.toRotationMatrix(carrierMatrix);const dockingOffset=Vector3.TransformNormal(v(0,8.44,0),carrierMatrix);this.carrier.position.copyFrom(relative(state.navigation.carrier.position).add(dockingOffset));this.carrier.rotationQuaternion=this.carrierOrientation.multiply(Quaternion.RotationAxis(Vector3.Right(),Math.PI));}else this.carrierOrientation=null;
    this.spacecraft.position.set(0,-65.6,0);this.spacecraft.rotation.setAll(0);
    this.lander.setEnabled((external||outside)&&lunarVehicle&&!mapView);this.lander.position.set(0,-.10263,0);this.lander.rotation.setAll(0);
    for(const mesh of this.lander.getChildMeshes())mesh.setEnabled(!['lunar-ascent','carrier-rendezvous'].includes(state.flightMode)||mesh.metadata?.vehiclePart!=='descent');
    for(const mesh of this.spacecraft.getChildMeshes())mesh.setEnabled(!['escape','entry','recovered'].includes(state.flightMode)||mesh.metadata?.vehiclePart!=='service');
    const crewHeight=launch||attachedUpper?(lunar?98:63):-3.69;
    this.cockpit.position.set(0,crewHeight,0);this.cockpit.rotation.setAll(0);this.cockpit.setEnabled(!modern&&!external&&!mapView&&!outside&&!insideStation&&!lunarVehicle);this.modernCockpit.root.position.copyFrom(this.cockpit.position);this.modernCockpit.root.setEnabled(modern&&!external&&!mapView&&!outside&&!insideStation&&!lunarVehicle);this.lunarCabin.setEnabled(!external&&!mapView&&!outside&&!insideStation&&lunarVehicle);this.lunarCabin.position.set(0,2.3,0);
    this.astronaut.setSeat(lunarVehicle?v(-.45,1.65,-.45):modern?this.modernCockpit.seat:v(-.55,1.67,-.90),Quaternion.RotationAxis(Vector3.Right(),lunarVehicle?.16:modern?0:-1.079));
    this.cabinLight.position.copyFrom((lunarVehicle?this.lunarCabin.position:this.cockpit.position).add(v(0,1.8,-.65)));this.cabinLight.intensity=external||mapView?0:2.8;
    // Native NASA PMA2 ring centre is placed on the numerical ISS target point.
    this.station.setEnabled(!lunar&&!launch&&!mapView&&!insideStation);this.stationInterior.setEnabled(insideStation&&!mapView);
    if(!lunar){
      const radial=rh(t.targetPosition).normalize(),forward=rh([-t.targetPosition[1],t.targetPosition[0],0]).normalize(),right=Vector3.Cross(radial,forward).normalize();
      const rotation=Quaternion.RotationQuaternionFromAxis(right,radial,forward),matrix=Matrix.Identity();rotation.toRotationMatrix(matrix);
      this.station.rotationQuaternion=rotation;this.station.position.copyFrom(relative(t.targetPosition).subtract(Vector3.TransformCoordinates(v(.00494,-.67326,-21.00535),matrix)));
      this.stationInterior.rotationQuaternion=rotation.clone();this.stationInterior.position.copyFrom(this.station.position);
    }
    const activeThrust=state.ignited&&state.countdown<=0&&state.throttle>0&&!t.landed;
    const plumeParent=lunar&&(launch||attachedUpper)?this.saturn:this.rocket;this.flame.parent=plumeParent;this.flameOuter.parent=plumeParent;
    this.flame.setEnabled(activeThrust&&(launch||attachedUpper)&&external&&!mapView);this.flameOuter.setEnabled(activeThrust&&(launch||attachedUpper)&&external&&!mapView);
    const engineBase=lunar?(state.launchStage===1?0:state.launchStage===2?42:67):(state.launchStage===1?0:43.2),pulse=1+Math.sin(this.sceneTime*47)*.06;
    this.flame.position.y=engineBase-9*pulse;this.flameOuter.position.y=engineBase-12.5*pulse;this.flame.scaling.y=pulse;this.flameOuter.scaling.y=pulse;
    for(let i=0;i<this.vapor.length;i++){const puff=this.vapor[i],age=(this.sceneTime*.19+i/this.vapor.length)%1;puff.setEnabled(activeThrust&&launch&&earthAltitude<150);puff.position.set((i%2?1:-1)*(8+age*60)+state.wind*age,5+age*23,(i%3-1)*6+age*18);puff.scaling.setAll(8+age*40);puff.visibility=(1-age)*.55;}
    for(const event of state.separations){
      let separated=this.separatedMeshes.get(event.id);
      if(!separated){
        separated=new TransformNode('separated '+event.id,this.scene);separated.parent=this.worldFrame;separated.rotationQuaternion=body.clone();
        if(event.kind==='descent-stage'||event.kind==='service-module'){
          const source=event.kind==='descent-stage'?this.lander:lunar?this.apollo:this.spacecraft,part=event.kind==='descent-stage'?'descent':'service';
          for(const mesh of source.getChildMeshes())if(mesh instanceof Mesh&&(mesh.metadata?.vehiclePart===part||(lunar&&part==='service'&&mesh.name.startsWith('SM-')))){const clone=mesh.clone(event.id+' '+mesh.name,separated,true);if(clone){clone.setEnabled(true);clone.position.y+=part==='service'?(lunar?-3.69:-65.6):-.10263;}}
        }else{
          const stage=event.kind==='booster'?'SIC-':state.separations.filter(e=>e.kind==='upper-stage'&&e.epochSeconds<=event.epochSeconds).length===1?'SII-':'SIVB-';
          const meshes=lunar?this.saturnMeshes.filter(m=>m.name.startsWith(stage)):this.rocketMeshes.filter(m=>m.name.includes(event.kind==='booster'?'Stage1':'Stage2')&&m.metadata?.vehiclePart!=='capsule'&&(modern||!m.metadata?.modernDetail)&&(event.kind==='booster'||!m.metadata?.modernDetail));
          const conversion=new TransformNode('stage glTF conversion',this.scene);conversion.parent=separated;conversion.scaling.z=-1;
          for(const mesh of meshes)if(mesh.getTotalVertices()>0){const indices=!lunar&&event.kind==='upper-stage'?discardedUpperStageIndices(mesh,this.rocket):null;if(indices&&!indices.length)continue;const clone=mesh.clone(event.id+' '+mesh.name,conversion,true);if(clone&&indices){clone.makeGeometryUnique();clone.setIndices(indices);}clone?.setEnabled(true);}
        }
        this.separatedMeshes.set(event.id,separated);
      }
      separated.position.copyFrom(relative(event.position));separated.setEnabled(event.active&&!mapView);
    }
    for(const [id,mesh]of this.separatedMeshes)if(!state.separations.some(e=>e.id===id))mesh.setEnabled(false);
    this.sun.position=local(this.site.isEnabled()?this.site.position:this.moon.isEnabled()?this.moon.position:Vector3.Zero()).subtract(this.sun.direction.scale(450));
      if(outside){
        this.astronaut.setFrame(local(this.moon.position),inverse.multiply(siteOrientation));this.astronaut.setGravity(1.62);
        this.astronaut.setWalkableRegion({minX:-120,maxX:120,minZ:-120,maxZ:120,minY:0,maxY:30},this.lunarGroundHeight);
      }else if(insideStation){
        this.astronaut.setFrame(local(this.stationInterior.position),inverse.multiply(this.stationInterior.rotationQuaternion??Quaternion.Identity()));this.astronaut.setGravity(0);
        this.astronaut.setWalkableRegion({minX:-.68,maxX:.7,minZ:-2.65,maxZ:2.65,minY:-.50,maxY:.83});
      }else{
        this.astronaut.setFrame(lunarVehicle?this.lunarCabin.position:this.cockpit.position,lunarVehicle?Quaternion.RotationAxis(Vector3.Up(),Math.PI):Quaternion.Identity());this.astronaut.setGravity(t.landed&&lunar?1.62:0);
        this.astronaut.setWalkableRegion(lunarVehicle?{minX:-.96,maxX:.96,minZ:-.92,maxZ:.65,minY:1.2,maxY:1.9}:modern?{minX:-1.48,maxX:1.48,minZ:-1.36,maxZ:.62,minY:1.1,maxY:2.65}:{minX:-1.05,maxX:1.05,minZ:-1.15,maxZ:.65,minY:1.25,maxY:2.65},()=>lunarVehicle?0:modern?.3:.45);
      }
      this.astronaut.step(dt);
    this.astronautBody.update(this.astronaut,this.flightActive&&!mapView&&(!external||outside||insideStation),external,dt);
    if(mapView){this.trajectoryView.update(state,this.camera,this.lookX,this.lookY||.35);}
    else if(external){
      const yaw=-.85+this.lookX+(!this.flightActive?Math.sin(this.sceneTime*.025)*.16:0),pitch=clamp(this.lookY,-.6,1.1),radius=launch||attachedUpper?(lunar?180:135):lunarVehicle?25:Math.max(28,Math.min(180,state.distance*.65));
      const target=launch?v(0,lunar?53:33,0):attachedUpper?v(0,92,0):lunarVehicle?v(0,2.4,0):v(0,1,0);
      this.camera.position.set(Math.sin(yaw)*radius,target.y+radius*((lunarVehicle?.85:.33)+Math.sin(pitch)*.6),-Math.cos(yaw)*radius);this.camera.setTarget(target);this.camera.fov=.85;
      if(!lunar&&!launch){const framing=stationApproachCamera(local(relative(t.targetPosition)),this.lookX,pitch);this.camera.position.copyFrom(framing.position);this.camera.setTarget(framing.target);this.camera.fov=1.05;}
      if(!launch&&!attachedUpper&&!lunarVehicle&&(lunar||state.distance>5000)){
        const focus=local(relative(lunar?t.moonPosition:[0,0,0])).normalize();
        let right=Vector3.Cross(Math.abs(focus.y)<.95?Vector3.Up():Vector3.Right(),focus).normalize(),up=Vector3.Cross(focus,right).normalize();
        const orbitYaw=this.lookX,orbitPitch=clamp(this.lookY,-1.2,1.2),forward=focus.scale(Math.cos(orbitYaw)).add(right.scale(Math.sin(orbitYaw))),range=32;
        right=Vector3.Cross(up,forward).normalize();
        this.camera.position.copyFrom(forward.scale(-range*Math.cos(orbitPitch)).add(right.scale(10)).add(up.scale(8+range*Math.sin(orbitPitch))));
        this.camera.setTarget(forward.scale(5));this.camera.fov=.95;
      }
      if(outside||insideStation){
        const frame=this.astronaut.getBodyOrientation(),matrix=Matrix.Identity();frame.toRotationMatrix(matrix);
        const target=this.astronaut.getPose().position.add(Vector3.TransformNormal(v(0,-.6,0),matrix));
        if(insideStation){
          const offsets=[v(Math.sin(yaw)*.7,.1,-Math.cos(yaw)*2.2),v(0,.1,-2.2),v(0,.1,2.2),v(.7,.1,-1.8),v(.7,.1,1.8),v(-.7,.1,-1.8),v(-.7,.1,1.8)];
          let best:{direction:Vector3;distance:number}|null=null;
          for(let index=0;index<offsets.length;index++){
            const delta=Vector3.TransformNormal(offsets[index],matrix),length=delta.length(),direction=delta.normalize();
            const wall=this.scene.pickWithRay(new Ray(target,direction,length),mesh=>mesh.isDescendantOf(this.stationInterior)&&mesh.isPickable);
            const distance=wall?.hit?Math.max(0,Math.min(length,wall.distance-.14)):length;
            if(!best||distance>best.distance)best={direction,distance};if(index===0&&distance>1.5)break;
          }
          if(best&&best.distance>1.4){this.camera.position.copyFrom(target.add(best.direction.scale(best.distance)));const forward=target.subtract(this.camera.position).normalize(),up=Vector3.TransformNormal(Vector3.Up(),matrix).normalize(),right=Vector3.Cross(up,forward).normalize();this.camera.rotationQuaternion=Quaternion.RotationQuaternionFromAxis(right,Vector3.Cross(forward,right).normalize(),forward);this.camera.rotation.setAll(0);this.camera.fov=1.2;}
          else{this.astronaut.applyTo(this.camera);this.camera.fov=this.inspectionFov;this.astronautBody.update(this.astronaut,true,false,0);}
        }else{
          this.camera.position.copyFrom(target.add(Vector3.TransformNormal(v(Math.sin(yaw)*4,1.4+Math.sin(pitch)*2,-Math.cos(yaw)*4),matrix)));this.camera.setTarget(target);this.camera.fov=1.05;
        }
      }

    }else{
      this.astronaut.applyTo(this.camera);this.camera.fov=this.inspectionFov;

    }
    const sunDirection=this.sun.direction.negate();this.sky.setVector3('sunDirection',sunDirection);
    this.earthSurface.setVector3('sunDirection',sunDirection);this.earthSurface.setVector3('cameraPosition',this.camera.position);
    (this.earthAir.material as ShaderMaterial).setVector3('sunDirection',sunDirection);(this.earthAir.material as ShaderMaterial).setVector3('cameraPosition',this.camera.position);(this.earthAir.material as ShaderMaterial).setFloat('strength',1-atmosphere*.9);
    for(const mesh of [this.flame,this.flameOuter]){const material=mesh.material as ShaderMaterial;material.setFloat('time',this.sceneTime);material.setVector3('eye',this.camera.position);}
    this.worksites?.update(state);this.apolloInstruments?.update(state,dt);if(this.apolloInstruments)this.interactions.describe('dsky',this.apolloInstruments.description(state));this.lunarInstruments?.update(state,dt);this.gaugeClock+=Math.max(0,dt);if(this.gaugeClock>.12){this.gaugeClock=0;this.drawGauges(state);}
  }

  private drawGauges(state:State){
    if(this.gauges.length<3)return;
    const cap=createMission(state.plan),fuel=state.phase==='launch'?state.launchFuel:state.fuel/cap.fuel*100,power=state.power/cap.power*100;
    // At the normal cockpit distance these displays are roughly 300 CSS pixels
    // wide. Large glyphs and a small number of values survive that reduction.
    const text=(c:CanvasRenderingContext2D,value:string,x:number,y:number,size=40,color='#c9dedf',align:CanvasTextAlign='left')=>{c.fillStyle=color;c.font=`600 ${size}px "Segoe UI", sans-serif`;c.textAlign=align;c.fillText(value,x,y);};
    const white='#eff8f4',muted='#a8c8cc',mint='#98d5b3',amber='#efc889';
    this.gauges.forEach((tex,i)=>{
      const c=tex.getContext() as CanvasRenderingContext2D;c.fillStyle='#101d26';c.fillRect(0,0,1024,576);
      c.fillStyle='#233b48';c.fillRect(0,0,1024,83);text(c,['PROPULSION','FLIGHT DIRECTOR','SYSTEMS'][i],36,57,38,white);
      text(c,`0${i+1}`,982,55,32,muted,'right');c.fillStyle='#50727b';c.fillRect(36,92,952,2);
      if(i===0){
        text(c,state.phase==='launch'?'ASCENT FUEL':'MANEUVER FUEL',40,153,40,muted);
        text(c,`${Math.round(clamp(fuel,0,100))}%`,40,291,132,white);
        for(let j=0;j<24;j++){c.fillStyle=j<fuel/100*24?mint:'#2b414b';c.fillRect(42+j*39,326,30,20);}
        text(c,'THRUST',40,415,38,muted);text(c,`${Math.round(state.throttle*100)}%`,40,485,68,white);
        text(c,'G-LOAD',535,415,38,muted);text(c,`${state.gForce.toFixed(2)} g`,535,485,68,white);
        text(c,state.phase==='launch'?`STAGE ${state.launchStage}`:state.autoPilot?'GUIDANCE ACTIVE':'MANUAL CONTROL',40,548,36,amber);
      }else if(i===1){
        const rangeMode=state.plan.destination==='iss'&&(state.phase==='approach'||state.phase==='science'||state.flightMode==='rendezvous');
        const value=rangeMode?state.distance:state.altitude;
        text(c,rangeMode?'STATION RANGE':'ALTITUDE',40,153,40,muted);
        text(c,value>9999?`${(value/1000).toFixed(1)} km`:`${Math.max(0,value).toFixed(0)} m`,40,279,108,white);
        text(c,rangeMode?'CLOSING SPEED':'VERTICAL SPEED',40,362,38,muted);
        text(c,`${(rangeMode?state.speed:state.verticalSpeed).toFixed(1)} m/s`,40,439,68,white);
        if(rangeMode){const cx=814,cy=406;c.strokeStyle='#6d9ba4';c.lineWidth=3;c.beginPath();c.arc(cx,cy,90,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(cx-110,cy);c.lineTo(cx+110,cy);c.moveTo(cx,cy-110);c.lineTo(cx,cy+110);c.stroke();c.strokeStyle=amber;c.lineWidth=5;c.beginPath();c.arc(cx-clamp(state.x,-25,25)*3,cy+clamp(state.y,-25,25)*3,12,0,Math.PI*2);c.stroke();}
        text(c,rangeMode?`OFFSET ${state.x.toFixed(1)} / ${state.y.toFixed(1)} m`:`SURFACE SPEED ${state.groundSpeed.toFixed(0)} m/s`,40,548,36,amber);
      }else{
        const rows=[['BATTERY',power],['INTEGRITY',state.hull],['SCIENCE',state.science]] as const;
        rows.forEach(([name,value],j)=>{const y=159+j*126;text(c,name,40,y,40,muted);text(c,`${Math.round(value)}%`,974,y+14,72,white,'right');c.fillStyle='#2b414b';c.fillRect(40,y+39,934,10);c.fillStyle=name==='SCIENCE'?'#8bbbd9':value<20?amber:mint;c.fillRect(40,y+39,934*clamp(value/100,0,1),10);});
        text(c,state.event&&!state.eventResolved?'CAUTION · CHECK SYSTEMS':'SYSTEMS NOMINAL',40,548,36,state.event&&!state.eventResolved?amber:mint);
      }
      tex.update();
    });
  }

  dispose(){this.disposed=true;window.removeEventListener('resize',this.resize);this.scene.dispose();this.engine.dispose();}
}
