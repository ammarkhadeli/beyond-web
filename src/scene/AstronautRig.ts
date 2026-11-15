import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';

export type AstronautMode = 'seated' | 'cabin' | 'eva' | 'station';
export type AstronautEnvironment = 'capsule' | 'station' | 'lunar';
export interface AstronautInput { forward: number; strafe: number; vertical: number; sprint: boolean; brake?:boolean; }
export interface AstronautPose { position: Vector3; orientation: Quaternion; mode: AstronautMode; environment: AstronautEnvironment; }

const rotationMatrix=(q:Quaternion)=>{const m=Matrix.Identity();q.toRotationMatrix(m);return m;};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** The body, seat and head have separate frames. Mouse yaw/pitch never modifies
 * body roll and never feeds Euler angles back into the next frame. */
export class AstronautRig {
  mode:AstronautMode='seated';
  environment:AstronautEnvironment='capsule';
  readonly localPosition=new Vector3(0,0,-.7);
  readonly seatPosition=new Vector3(0,0,-.7);
  readonly seatOrientation=Quaternion.Identity();
  private framePosition=Vector3.Zero();
  private frameOrientation=Quaternion.Identity();
  private cabinOrientation=Quaternion.Identity();
  readonly velocity=Vector3.Zero();
  private bodyHeading=0;
  private previousJump=false;
  private gravity=0;
  private yaw=0;
  private pitch=0;
  private input:AstronautInput={forward:0,strafe:0,vertical:0,sprint:false};
  private floor:(x:number,z:number)=>number=()=>-1.67;
  private bounds={minX:-1.15,maxX:1.15,minZ:-1.2,maxZ:1.2,minY:-.8,maxY:1};

  setSeat(position:Vector3,orientation=Quaternion.Identity()) {
    this.seatPosition.copyFrom(position);this.seatOrientation.copyFrom(orientation).normalize();
    if(this.mode==='seated')this.localPosition.copyFrom(position);
  }
  setFrame(position:Vector3,orientation:Quaternion) {
    this.framePosition.copyFrom(position);this.frameOrientation.copyFrom(orientation).normalize();
  }
  setLook(yaw:number,pitch:number) {
    this.yaw=Number.isFinite(yaw)?yaw:0;this.pitch=clamp(Number.isFinite(pitch)?pitch:0,-1.48,1.48);
  }
  setGravity(acceleration:number){this.gravity=Math.max(0,acceleration);}
  setInput(input:Partial<AstronautInput>) {
    this.input={...this.input,...input};
    for(const axis of ['forward','strafe','vertical'] as const)this.input[axis]=clamp(this.input[axis],-1,1);
  }
  setMode(mode:AstronautMode,environment:AstronautEnvironment=this.environment) {
    if(mode===this.mode&&environment===this.environment)return;
    this.velocity.setAll(0);this.previousJump=false;this.mode=mode;this.environment=mode==='station'?'station':environment;environment=this.environment;this.setInput({forward:0,strafe:0,vertical:0});
    if(mode==='seated')this.localPosition.copyFrom(this.seatPosition);
    else if(mode==='eva'&&environment==='lunar')this.localPosition.set(2,1.67,-7);
    else if(environment==='station')this.localPosition.set(0,0,-2.2);
    else this.localPosition.copyFrom(this.seatPosition);
    this.gravity=environment==='lunar'?1.62:0;
    this.cabinOrientation=mode==='cabin'&&environment==='capsule'?this.seatOrientation.clone():Quaternion.Identity();
  }
  setWalkableRegion(bounds:typeof this.bounds,floor?:(x:number,z:number)=>number) {
    this.bounds={...bounds};if(floor)this.floor=floor;
  }
  stopMovement(){this.velocity.setAll(0);}
  getBodyOrientation(){return this.frameOrientation.multiply(this.mode==='seated'?this.seatOrientation:this.cabinOrientation.multiply(Quaternion.RotationAxis(Vector3.Up(),this.bodyHeading)));}
  step(dt:number) {
    if(this.mode==='seated'){this.localPosition.copyFrom(this.seatPosition);this.velocity.setAll(0);return;}
    const seconds=clamp(dt,0,.1);
    const floating=this.gravity<.01;
    const orientation=this.cabinOrientation.multiply(Quaternion.RotationYawPitchRoll(this.yaw,floating?this.pitch:0,0));
    const direction=new Vector3(this.input.strafe,floating?this.input.vertical:0,this.input.forward);
    if(direction.lengthSquared()>1)direction.normalize();
    const worldDirection=Vector3.TransformNormal(direction,rotationMatrix(orientation));
    if(floating){
      this.velocity.addInPlace(worldDirection.scale(seconds*(this.input.sprint?1.1:.55)));
      if(this.input.brake)this.velocity.scaleInPlace(Math.exp(-seconds*7));
      const limit=this.input.sprint?2:1.2;if(this.velocity.length()>limit)this.velocity.normalize().scaleInPlace(limit);
      this.localPosition.addInPlace(this.velocity.scale(seconds));
    }else{
      const speed=this.environment==='lunar'?(this.input.sprint?2.1:1.15):(this.input.sprint?1.8:1);
      this.velocity.x=worldDirection.x*speed;this.velocity.z=worldDirection.z*speed;
      const floor=this.floor(this.localPosition.x,this.localPosition.z)+1.67;
      const grounded=this.localPosition.y<=floor+.015;
      const jump=this.input.vertical>.5;
      if(this.environment==='lunar'&&grounded&&jump&&!this.previousJump)this.velocity.y=2.15;
      this.previousJump=jump;
      if(!grounded||this.velocity.y>0)this.velocity.y-=this.gravity*seconds;
      this.localPosition.addInPlace(this.velocity.scale(seconds));
      const newFloor=this.floor(this.localPosition.x,this.localPosition.z)+1.67;
      if(this.localPosition.y<newFloor){this.localPosition.y=newFloor;this.velocity.y=0;}
    }
    if(this.velocity.x*this.velocity.x+this.velocity.z*this.velocity.z>.015)this.bodyHeading=Math.atan2(this.velocity.x,this.velocity.z);
    for(const [axis,min,max] of [['x',this.bounds.minX,this.bounds.maxX],['z',this.bounds.minZ,this.bounds.maxZ],...(floating?[['y',this.bounds.minY,this.bounds.maxY]]:[])] as ['x'|'y'|'z',number,number][]){
      if(this.localPosition[axis]<min||this.localPosition[axis]>max){this.localPosition[axis]=clamp(this.localPosition[axis],min,max);this.velocity[axis]=0;}
    }
  }
  getPose():AstronautPose {
    const base=this.frameOrientation;
    const seat=this.mode==='seated'?this.seatOrientation:this.cabinOrientation;
    const headYaw=Quaternion.RotationAxis(Vector3.Up(),this.yaw);
    const headPitch=Quaternion.RotationAxis(Vector3.Right(),this.pitch);
    const orientation=base.multiply(seat).multiply(headYaw).multiply(headPitch).normalize();
    const position=Vector3.TransformCoordinates(this.localPosition,rotationMatrix(this.frameOrientation)).add(this.framePosition);
    return{position,orientation,mode:this.mode,environment:this.environment};
  }
  applyTo(camera:FreeCamera) {
    const pose=this.getPose();camera.position.copyFrom(pose.position);
    if(!camera.rotationQuaternion)camera.rotationQuaternion=Quaternion.Identity();
    camera.rotationQuaternion.copyFrom(pose.orientation);camera.rotation.setAll(0);
    return pose;
  }
}
