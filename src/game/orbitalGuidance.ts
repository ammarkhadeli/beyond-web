import { type OrbitState,type Vec3,EARTH_MU,add,sub,scale,length,propagateOrbit,lambertVelocity,clamp } from './orbital';

/** Differential-correction shooting. Guidance returns a desired burn velocity;
 * propagation never substitutes it for actual velocity. Planar solves preserve
 * the deliberate coplanar transfer approximation. Finite thrust executes later.
 */
export function targetVelocity(state:OrbitState,target:Vec3,arrival:number,guess?:Vec3):Vec3|null {
  const dt=arrival-state.epochSeconds;if(dt<10)return null;
  let v=guess??lambertVelocity(state.position,target,dt,EARTH_MU);if(!v)return null;
  for(let iteration=0;iteration<6;iteration++){
    const final=propagateOrbit({...state,velocity:v},dt),error=sub(final.position,target);
    if(length(error)<1000)break;
    const eps=.2,columns:Vec3[]=[];
    for(let axis=0;axis<2;axis++){
      const bumped:Vec3=[...v];bumped[axis]+=eps;
      columns.push(scale(sub(propagateOrbit({...state,velocity:bumped},dt).position,final.position),1/eps));
    }
    const a=columns[0][0],b=columns[1][0],c=columns[0][1],d=columns[1][1],det=a*d-b*c;
    if(!Number.isFinite(det)||Math.abs(det)<1e-8)break;
    const correction:Vec3=[clamp((-d*error[0]+b*error[1])/det,-200,200),clamp((c*error[0]-a*error[1])/det,-200,200),0];
    v=add(v,correction);
  }return v;
}
