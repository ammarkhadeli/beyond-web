/** Dependency-free SI orbital core. JS numbers are IEEE-754 doubles.
 * Earth-centred right-handed inertial coordinates: launch radial +X, east +Y,
 * orbit normal +Z. Circular coplanar lunar ephemeris; spherical point masses.
 * The lunar indirect term accounts for acceleration of the Earth-centred frame.
 * No Sun, oblateness, lunar mascons, ephemeris fitting or mission certification.
 * Constants: https://ssd.jpl.nasa.gov/astro_par.html and NASA Moon fact sheet.
 */
export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export const EARTH_MU = 3.986004418e14;
export const EARTH_RADIUS = 6_371_000;
export const MOON_MU = 4.902800118e12;
export const MOON_RADIUS = 1_737_400;
export const MOON_DISTANCE = 384_400_000;
export const MOON_PERIOD = 27.321661 * 86400;
export const MOON_RATE = Math.PI * 2 / MOON_PERIOD;
export const EARTH_ROTATION = 7.2921150e-5;
export const STANDARD_GRAVITY = 9.80665;
export const ISS_ALTITUDE = 408_000;
export const INITIAL_MOON_ANGLE = 3.05;
export const LANDING_LATITUDE = .674 * Math.PI / 180;
export const LANDING_LONGITUDE = 23.47 * Math.PI / 180;
/** LROC NAC DTM sample at the fixed Apollo 11 scenario coordinate, 2 m/pixel. */
export const LANDING_ELEVATION = -1924.406494140625;
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0]*k,a[1]*k,a[2]*k];
export const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a: Vec3,b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 => scale(a,1/Math.max(1e-30,length(a)));
export const tangent = (radial: Vec3): Vec3 => unit(cross([0,0,1],radial));
export const clamp = (x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
export interface OrbitState { position: Vec3; velocity: Vec3; epochSeconds: number }
export interface Trajectory extends OrbitState {
  moonPosition: Vec3; moonVelocity: Vec3; attitude: Vec3; attitudeQuaternion: Quaternion;
  referenceBody: 'earth'|'moon'; landed: boolean; moonRotation: number;
  landingSitePosition: Vec3; landingSiteVelocity: Vec3; landingSiteNormal: Vec3;
  targetPosition: Vec3; targetVelocity: Vec3; sunDirection: Vec3;
}
export interface Separation extends OrbitState { id:string; kind:'booster'|'upper-stage'|'service-module'|'descent-stage'; mass:number; active:boolean }
export function moonState(epochSeconds:number):OrbitState {
  const a=INITIAL_MOON_ANGLE+MOON_RATE*epochSeconds;
  return {position:[MOON_DISTANCE*Math.cos(a),MOON_DISTANCE*Math.sin(a),0],velocity:[-MOON_DISTANCE*MOON_RATE*Math.sin(a),MOON_DISTANCE*MOON_RATE*Math.cos(a),0],epochSeconds};
}
export function stationState(epochSeconds:number,initialAngle=0):OrbitState {
  const r=EARTH_RADIUS+ISS_ALTITUDE,w=Math.sqrt(EARTH_MU/r**3),a=initialAngle+w*epochSeconds;
  return {position:[r*Math.cos(a),r*Math.sin(a),0],velocity:[-r*w*Math.sin(a),r*w*Math.cos(a),0],epochSeconds};
}
export function landingSite(epochSeconds:number) {
  const moon=moonState(epochSeconds),angle=INITIAL_MOON_ANGLE+MOON_RATE*epochSeconds+Math.PI+LANDING_LONGITUDE;
  const normal:Vec3=[Math.cos(LANDING_LATITUDE)*Math.cos(angle),Math.cos(LANDING_LATITUDE)*Math.sin(angle),Math.sin(LANDING_LATITUDE)],offset=scale(normal,MOON_RADIUS+LANDING_ELEVATION);
  return {position:add(moon.position,offset),velocity:add(moon.velocity,cross([0,0,MOON_RATE],offset)),normal};
}
/** Quaternion whose local +Y is engine/body axis and +Z is orbit-normal. */
export function attitudeQuaternion(direction:Vec3):Quaternion {
  const y=unit(direction), x=unit(cross(y,Math.abs(y[2])<.99?[0,0,1]:[1,0,0])),z=cross(x,y);
  const m00=x[0],m01=y[0],m02=z[0],m10=x[1],m11=y[1],m12=z[1],m20=x[2],m21=y[2],m22=z[2],tr=m00+m11+m22;
  if(tr>0){const q=Math.sqrt(tr+1)*2;return[(m21-m12)/q,(m02-m20)/q,(m10-m01)/q,q/4];}
  if(m00>m11&&m00>m22){const q=Math.sqrt(1+m00-m11-m22)*2;return[q/4,(m01+m10)/q,(m02+m20)/q,(m21-m12)/q];}
  if(m11>m22){const q=Math.sqrt(1+m11-m00-m22)*2;return[(m01+m10)/q,q/4,(m12+m21)/q,(m02-m20)/q];}
  const q=Math.sqrt(1+m22-m00-m11)*2;return[(m02+m20)/q,(m12+m21)/q,q/4,(m10-m01)/q];
}
export function makeTrajectory(state:OrbitState, destination:'iss'|'moon', stationAngle=0):Trajectory {
  const moon=moonState(state.epochSeconds),site=landingSite(state.epochSeconds),target=destination==='iss'?stationState(state.epochSeconds,stationAngle):site;
  return {...state,position:[...state.position],velocity:[...state.velocity],moonPosition:moon.position,moonVelocity:moon.velocity,attitude:unit(state.position),attitudeQuaternion:attitudeQuaternion(unit(state.position)),referenceBody:length(sub(state.position,moon.position))<66_000_000?'moon':'earth',landed:false,moonRotation:INITIAL_MOON_ANGLE+MOON_RATE*state.epochSeconds,landingSitePosition:site.position,landingSiteVelocity:site.velocity,landingSiteNormal:site.normal,targetPosition:target.position,targetVelocity:target.velocity,sunDirection:unit([.55,.8,.24])};
}
export function gravity(position:Vec3,time:number,includeMoon=true):Vec3 {
  const r=Math.max(1,length(position));let g=scale(position,-EARTH_MU/r**3);
  if(includeMoon){const m=moonState(time).position,d=sub(m,position);g=add(g,sub(scale(d,MOON_MU/Math.max(1,length(d))**3),scale(m,MOON_MU/MOON_DISTANCE**3)));}
  return g;
}
export const atmosphericDensity=(height:number)=>1.225*Math.exp(-Math.max(0,height)/8500);
export interface Forces { thrust?:Vec3; mass?:number; dragArea?:number; dragCoefficient?:number; wind?:number; includeMoon?:boolean }
export function acceleration(position:Vec3,velocity:Vec3,time:number,f:Forces={}):Vec3 {
  let a=gravity(position,time,f.includeMoon!==false);
  if(f.thrust&&f.mass)a=add(a,scale(f.thrust,1/f.mass));
  if(f.dragArea&&f.mass){const altitude=length(position)-EARTH_RADIUS;if(altitude<200000){
    const air=add(cross([0,0,EARTH_ROTATION],position),scale(tangent(position),f.wind??0));
    const relative=sub(velocity,air),speed=length(relative),drag=.5*atmosphericDensity(altitude)*speed*(f.dragCoefficient??.32)*f.dragArea/f.mass;
    a=sub(a,scale(relative,drag));
  }}return a;
}
/** Classical RK4; thrust/mass held for each caller-bounded integration step. */
export function integrateOrbit(s:OrbitState,dt:number,f:Forces={}):OrbitState {
  if(!(dt>0)||!Number.isFinite(dt))return {...s,position:[...s.position],velocity:[...s.velocity]};
  const a1=acceleration(s.position,s.velocity,s.epochSeconds,f),v1=s.velocity;
  const p2=add(s.position,scale(v1,dt/2)),v2=add(s.velocity,scale(a1,dt/2)),a2=acceleration(p2,v2,s.epochSeconds+dt/2,f);
  const p3=add(s.position,scale(v2,dt/2)),v3=add(s.velocity,scale(a2,dt/2)),a3=acceleration(p3,v3,s.epochSeconds+dt/2,f);
  const p4=add(s.position,scale(v3,dt)),v4=add(s.velocity,scale(a3,dt)),a4=acceleration(p4,v4,s.epochSeconds+dt,f);
  return {position:add(s.position,scale(add(add(v1,scale(v2,2)),add(scale(v3,2),v4)),dt/6)),velocity:add(s.velocity,scale(add(add(a1,scale(a2,2)),add(scale(a3,2),a4)),dt/6)),epochSeconds:s.epochSeconds+dt};
}
export function stableStep(s:OrbitState,maximum=300):number {
  const re=length(s.position),rm=length(sub(s.position,moonState(s.epochSeconds).position));
  return Math.max(.02,Math.min(maximum,.018*Math.sqrt(re**3/EARTH_MU),.018*Math.sqrt(rm**3/MOON_MU)));
}
export function propagateOrbit(s:OrbitState,dt:number,f:Forces={}):OrbitState {
  let out={...s,position:[...s.position] as Vec3,velocity:[...s.velocity] as Vec3},left=dt;
  if(!Number.isFinite(dt)||dt<=0)return out;
  while(left>1e-8){const h=Math.min(left,stableStep(out,f.thrust?1:300));out=integrateOrbit(out,h,f);left-=h;}return out;
}
export function sampleTrajectory(s:OrbitState,seconds:number,samples=96):Vec3[] {
  const count=Math.max(2,Math.min(256,Math.floor(samples))),points:Vec3[]=[[...s.position]];let p=s;
  for(let i=1;i<count;i++){p=propagateOrbit(p,seconds/(count-1));points.push([...p.position]);if(length(p.position)<EARTH_RADIUS||length(sub(p.position,moonState(p.epochSeconds).position))<MOON_RADIUS)break;}return points;
}
export function orbitalElements(position:Vec3,velocity:Vec3,mu=EARTH_MU) {
  const r=length(position),v2=dot(velocity,velocity),h=cross(position,velocity),energy=v2/2-mu/r,evec=sub(scale(cross(velocity,h),1/mu),scale(position,1/r)),eccentricity=length(evec),semimajorAxis=-mu/(2*energy);
  return {energy,angularMomentum:h,eccentricity,semimajorAxis,periapsis:dot(h,h)/(mu*(1+eccentricity)),apoapsis:energy<0?semimajorAxis*(1+eccentricity):Infinity};
}
function stumpff(z:number):[number,number]{if(z>1e-8){const q=Math.sqrt(z);return[(1-Math.cos(q))/z,(q-Math.sin(q))/(q*q*q)];}if(z< -1e-8){const q=Math.sqrt(-z);return[(1-Math.cosh(q))/z,(Math.sinh(q)-q)/(q*q*q)];}return[.5-z/24+z*z/720,1/6-z/120+z*z/5040];}
/** Zero-revolution prograde Lambert solution used to command finite burns.
 * It targets point-mass Earth ballistic motion; numerical midcourse corrections
 * account for lunar perturbation. Returns a requested velocity, never sets one.
 */
export function lambertVelocity(from:Vec3,to:Vec3,seconds:number,mu=EARTH_MU):Vec3|null {
  const r1=length(from),r2=length(to),cos=clamp(dot(from,to)/r1/r2,-1,1);let sin=Math.sqrt(Math.max(0,1-cos*cos));if(cross(from,to)[2]<0)sin=-sin;
  const A=sin*Math.sqrt(r1*r2/Math.max(1e-12,1-cos));if(Math.abs(A)<1e-8||seconds<=0)return null;
  const evalZ=(z:number)=>{const[C,S]=stumpff(z);if(C<=0)return {f:Infinity,y:-1};const y=r1+r2+A*(z*S-1)/Math.sqrt(C);return{f:y<0?-Infinity:(y/C)**1.5*S+A*Math.sqrt(y)-Math.sqrt(mu)*seconds,y};};
  let lo=-4*Math.PI*Math.PI,hi=4*Math.PI*Math.PI-1e-6;
  for(let i=0;i<90;i++){const mid=(lo+hi)/2;if(evalZ(mid).f>0)hi=mid;else lo=mid;}
  const {y}=evalZ((lo+hi)/2);if(!(y>0))return null;const f=1-y/r1,g=A*Math.sqrt(y/mu);if(Math.abs(g)<1e-9)return null;return scale(sub(to,scale(from,f)),1/g);
}
