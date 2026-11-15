import '@babylonjs/core/Culling/ray';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3,Matrix } from '@babylonjs/core/Maths/math';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { Scene } from '@babylonjs/core/scene';

export interface SceneInteraction {
  id:string;
  label:string;
  description:string;
  action:string;
  distance:number;
  enabled:boolean;
  kind:'control'|'hatch'|'equipment';
}
export interface SceneObjective {x:number;y:number;angle:number;offscreen:boolean;label:string;distance:number}
export interface InteractionZone extends Omit<SceneInteraction,'distance'|'enabled'> {
  parent:TransformNode;
  position:Vector3;
  radius:number;
  reach:number;
  enabled:()=>boolean;
  activate?:()=>void;
}

/** Hotspots refer to physical surfaces in a model. They add no screen-space menu
 * and do not execute mission actions; the application owns action validation. */
export class SceneInteractions {
  private zones=new Map<string,InteractionZone>();
  constructor(private scene:Scene,private camera:FreeCamera){}
  register(zone:InteractionZone){this.zones.set(zone.id,zone);}
  remove(id:string){this.zones.delete(id);}
  clear(){this.zones.clear();}
  describe(id:string,description:string){const zone=this.zones.get(id);if(zone)zone.description=description;}
  objective(action:string):SceneObjective|null {
    let selected:{zone:InteractionZone;world:Vector3;distance:number}|null=null;
    for(const zone of this.zones.values()){
      if(zone.action!==action||!zone.parent.isEnabled()||!zone.enabled())continue;
      const world=Vector3.TransformCoordinates(zone.position,zone.parent.computeWorldMatrix(true)),distance=Vector3.Distance(world,this.camera.globalPosition);
      if(!selected||distance<selected.distance)selected={zone,world,distance};
    }
    if(!selected)return null;
    const engine=this.scene.getEngine(),canvas=engine.getRenderingCanvas();if(!canvas)return null;
    const width=canvas.clientWidth,height=canvas.clientHeight,viewport=this.camera.viewport.toGlobal(width,height);
    const projected=Vector3.Project(selected.world,Matrix.Identity(),this.scene.getTransformMatrix(),viewport),viewPoint=Vector3.TransformCoordinates(selected.world,this.camera.getViewMatrix());
    let dx=projected.x-width/2,dy=projected.y-height/2;if(viewPoint.z<0){dx=-dx;dy=-dy;}
    const angle=Math.atan2(dy,dx),offscreen=viewPoint.z<0||projected.x<110||projected.x>width-110||projected.y<75||projected.y>height-85;
    if(offscreen){const scale=Math.min((width/2-110)/Math.max(.001,Math.abs(dx)),(height/2-90)/Math.max(.001,Math.abs(dy)));dx*=scale;dy*=scale;}
    return{x:width/2+dx,y:height/2+dy,angle,offscreen,label:selected.zone.label,distance:selected.distance};
  }
  query(pointer?:{x:number;y:number}):SceneInteraction|null {
    let ray:Ray;
    if(pointer){const engine=this.scene.getEngine();const scale=engine.getHardwareScalingLevel();ray=this.scene.createPickingRay(pointer.x/scale,pointer.y/scale,null,this.camera,false);}
    else ray=this.camera.getForwardRay(100);
    let closest:{zone:InteractionZone;distance:number;score:number}|null=null;
    for(const zone of this.zones.values()){
      if(!zone.parent.isEnabled()||(zone.kind==='equipment'&&!zone.enabled()))continue;
      const world=Vector3.TransformCoordinates(zone.position,zone.parent.computeWorldMatrix(true));
      const delta=world.subtract(ray.origin),along=Vector3.Dot(delta,ray.direction);
      if(along<0||along>zone.reach)continue;
      const separation=delta.subtract(ray.direction.scale(along)).length();
      if(separation>zone.radius)continue;
      // Test against actual opaque scene geometry, leaving a small tolerance
      // for the hotspot's surface and the scanner's centimetre-scale noise.
      const distance=delta.length();
      const sight=new Ray(ray.origin,delta.scale(1/Math.max(distance,.001)),Math.max(0,distance-Math.max(.025,zone.radius*.6)));
      const obstruction=this.scene.pickWithRay(sight,mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.isPickable&&mesh.metadata?.astronautBody!==true&&mesh.metadata?.interactionSurface!==true,false);
      if(obstruction?.hit&&obstruction.distance<sight.length)continue;
      const score=separation/zone.radius+along*.035;
      if(!closest||score<closest.score)closest={zone,distance:delta.length(),score};
    }
    if(!closest)return null;
    const {zone,distance}=closest;
    return{id:zone.id,label:zone.label,description:zone.description,action:zone.action,distance,enabled:zone.enabled(),kind:zone.kind};
  }
  activate(pointer?:{x:number;y:number}){
    const selected=this.query(pointer);if(selected?.enabled)this.zones.get(selected.id)?.activate?.();return selected;
  }
}
