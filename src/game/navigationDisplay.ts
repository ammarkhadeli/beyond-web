import type { State } from './simulation';
import { EARTH_RADIUS, length, sub } from './orbital';
/** Instantaneous geometric separation, never a promised travel distance/ETA. */
export function navigationReadout(state:State) {
  const t=state.trajectory;
  if(state.phase==='return'||state.phase==='debrief')return {label:'Earth surface range',rangeMeters:Math.max(0,length(t.position)-EARTH_RADIUS),relativeSpeed:null};
  const station=state.plan.destination==='iss';
  const target=station?t.targetPosition:t.landingSitePosition;
  const velocity=station?t.targetVelocity:t.landingSiteVelocity;
  return {label:station?'Station range':'Landing-site range',rangeMeters:length(sub(t.position,target)),relativeSpeed:length(sub(t.velocity,velocity))};
}
export function formatNavigationRange(meters:number){return meters>=10000?`${(meters/1000).toLocaleString('en-US',{maximumFractionDigits:1})} km`:`${meters.toLocaleString('en-US',{maximumFractionDigits:1})} m`;}
