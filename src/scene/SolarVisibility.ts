import { MOON_RADIUS, LANDING_ELEVATION } from '../game/orbital';

type Point = readonly [number,number,number];
export interface SolarOccluder { center:Point; radius:number }
/** Mean apparent solar radius, used for a smooth finite-disc penumbra. The
 * astronomical year-dependent solar size and atmospheric refraction are omitted. */
export const SOLAR_ANGULAR_RADIUS = .2666*Math.PI/180;
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));

/** Match the mission's surveyed landing-site datum. The landing position is
 * 1,924 m below the reference lunar radius and is not underground in the scene. */
export function lunarShadowRadius(distanceToLandingSite:number){
 return MOON_RADIUS+(distanceToLandingSite<200_000?LANDING_ELEVATION:0);
}

/** Analytic angular-disc overlap. All positions/radii use metres in one common
 * frame, and direction points toward the Sun. This controls rendering only.
 * Independent partial occultations are combined multiplicatively; this small
 * approximation is relevant only if both apparent body discs overlap the Sun. */
export function solarVisibility(observer:Point,direction:Point,bodies:readonly SolarOccluder[]):number{
 const sunLength=Math.hypot(...direction);if(!Number.isFinite(sunLength)||sunLength<1e-12)return 0;
 const sun=direction.map(x=>x/sunLength),solarRadius=SOLAR_ANGULAR_RADIUS,solarArea=Math.PI*solarRadius*solarRadius;
 let transmission=1;
 for(const body of bodies){
  if(!(body.radius>0))continue;
  const delta=[body.center[0]-observer[0],body.center[1]-observer[1],body.center[2]-observer[2]],distance=Math.hypot(...delta);
  if(!Number.isFinite(distance)||distance<body.radius-.001)return 0;
  const angle=Math.acos(clamp((delta[0]*sun[0]+delta[1]*sun[1]+delta[2]*sun[2])/Math.max(distance,1e-12),-1,1));
  const radius=Math.asin(clamp(body.radius/Math.max(distance,body.radius),0,1));
  if(angle>=radius+solarRadius)continue;
  if(angle<=Math.abs(radius-solarRadius)){
   transmission*=1-Math.min(1,radius*radius/(solarRadius*solarRadius));continue;
  }
  const s2=solarRadius*solarRadius,r2=radius*radius,a2=angle*angle;
  const solarSector=s2*Math.acos(clamp((a2+s2-r2)/(2*angle*solarRadius),-1,1));
  const bodySector=r2*Math.acos(clamp((a2+r2-s2)/(2*angle*radius),-1,1));
  const triangle=.5*Math.sqrt(Math.max(0,(-angle+solarRadius+radius)*(angle+solarRadius-radius)*(angle-solarRadius+radius)*(angle+solarRadius+radius)));
  transmission*=1-clamp((solarSector+bodySector-triangle)/solarArea,0,1);
 }
 return clamp(transmission,0,1);
}
