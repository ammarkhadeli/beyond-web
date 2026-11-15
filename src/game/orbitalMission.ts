import { PAYLOADS, evaluatePlan, type State, type Plan, type Input, type Phase } from './simulation';
import { type OrbitState,type Vec3,type Trajectory,type Separation,EARTH_RADIUS,EARTH_MU,MOON_RADIUS,MOON_MU,MOON_RATE,EARTH_ROTATION,STANDARD_GRAVITY,ISS_ALTITUDE,LANDING_ELEVATION,add,sub,scale,dot,cross,length,unit,tangent,clamp,gravity,atmosphericDensity,integrateOrbit,propagateOrbit,stableStep,orbitalElements,moonState,stationState,landingSite,makeTrajectory,attitudeQuaternion,lambertVelocity } from './orbital';
import { SATURN_V,ORBITAL_LAUNCHER,APOLLO,ESCAPE,GUIDANCE } from './orbitalVehicle';
import { targetVelocity } from './orbitalGuidance';
import { DEFAULT_LAUNCH_TIME, localSunDirection } from './environment';
export type FlightMode='pad'|'ascent'|'escape'|'parking'|'rendezvous'|'tli'|'translunar'|'lunar-capture'|'lunar-orbit'|'lunar-descent'|'surface'|'launch-window'|'docked'|'lunar-ascent'|'carrier-rendezvous'|'tei-wait'|'tei'|'lunar-escape'|'earth-return'|'deorbit'|'entry'|'recovered';
export interface Navigation {stationAngle:number;arrivalEpoch:number;nextCorrection:number;desiredVelocity:Vec3|null;desiredOrbit:OrbitState|null;rendezvousTarget:OrbitState|null;earthEntryTarget:Vec3|null;modeStarted:number;descentEnd:number;carrier:OrbitState|null;carrierMass:number;carrierFuel:number;surfaceOffset:Vec3|null;dockedOffset:Vec3|null;returnStart:number;returnRequested:boolean}
export interface OrbitalFields {trajectory:Trajectory;separations:Separation[];flightMode:FlightMode;navigation:Navigation;engineFuel:number;engineDryMass:number;deltaV:number;parachuteDeployed:boolean;completedActivities:string[];groundSpeed:number;airSpeed:number;crewSeated:boolean;awaitingCrewSeat:boolean;canUnstrap:boolean}
const safeAxis=(v:number)=>Number.isFinite(v)?clamp(v,-1,1):0;
const note=(s:State,message:string)=>{s.log=[...s.log,message].slice(-60);};
const stages=(s:State)=>s.plan.destination==='moon'?SATURN_V:ORBITAL_LAUNCHER;
/** Reference wet masses include the baseline science package and backup battery.
 * Reconfiguration applies physical kg deltas; fuel option fills 95% or 100% of
 * the modeled tanks. These configurable packages are scenario choices.
 */
const reserveFraction=(s:State)=>s.plan.extraFuel?1:.95;
export const equipmentMassDelta=(plan:Plan)=>({biology:160,geology:230,imaging:120}[plan.payload]-(plan.destination==='moon'?230:160))+(plan.extraBattery?0:-130)+(plan.shielding?210:0)+(plan.communications==='redundant'?90:0);
const lunarModuleMass=(s:State)=>APOLLO.lmMass+equipmentMassDelta(s.plan)-(1-reserveFraction(s))*(APOLLO.descentPropellant+APOLLO.ascentPropellant);
const lunarStackMass=(s:State)=>APOLLO.csmMass-(1-reserveFraction(s))*APOLLO.spsPropellant+lunarModuleMass(s);
const orbitalCapsuleMass=(s:State)=>12000+equipmentMassDelta(s.plan)-(1-reserveFraction(s))*2500;
export function vehicleConfiguration(plan:Plan){
  const fraction=plan.extraFuel?1:.95,delta=equipmentMassDelta(plan),list=plan.destination==='moon'?SATURN_V:ORBITAL_LAUNCHER;
  const spacecraftMass=plan.destination==='moon'?APOLLO.csmMass+APOLLO.lmMass+delta-(1-fraction)*(APOLLO.spsPropellant+APOLLO.descentPropellant+APOLLO.ascentPropellant):12000+delta-(1-fraction)*2500;
  return {spacecraftMass,launchMass:spacecraftMass+list.reduce((n,e)=>n+e.dryMass+e.propellant,0),fuelLoadFraction:fraction};
}
const phase=(s:State,p:Phase)=>{if(s.phase!==p){s.phase=p;s.phaseTime=0;}};
const mode=(s:State,m:FlightMode)=>{s.flightMode=m;s.navigation.modeStarted=s.elapsed;s.navigation.desiredVelocity=null;s.navigation.desiredOrbit=null;};
export function requiredActivities(plan:Plan):string[]{return plan.destination==='moon'?['deploy-seismometer','collect-sample','record-panorama','stow-samples']:['install-sample','power-experiment','record-observation','stow-results'];}
function clone(state:State):State{return{...state,plan:{...state.plan},log:[...state.log],completedActivities:[...state.completedActivities],navigation:{...state.navigation,desiredVelocity:state.navigation.desiredVelocity?[...state.navigation.desiredVelocity]:null},trajectory:{...state.trajectory,position:[...state.trajectory.position],velocity:[...state.trajectory.velocity]},separations:state.separations.map(d=>({...d,position:[...d.position],velocity:[...d.velocity]}))};}
function sync(s:State){
  const old=s.trajectory,t=makeTrajectory(old,s.plan.destination,s.navigation.stationAngle);t.attitude=old.attitude;t.attitudeQuaternion=attitudeQuaternion(t.attitude);t.landed=old.landed;s.trajectory=t;
  // Map geographic local sunlight into the renderer's simplified launch plane.
  // All bodies share this direction. Planet rotation is still driven by SI time.
  const sun=localSunDirection(s.plan.launchTime??DEFAULT_LAUNCH_TIME,t.epochSeconds,s.plan.launchSite??'lc39a'),a=EARTH_ROTATION*t.epochSeconds;
  t.sunDirection=[sun.up*Math.cos(a)-sun.east*Math.sin(a),sun.up*Math.sin(a)+sun.east*Math.cos(a),sun.north];
  const lunar=t.referenceBody==='moon',r=sub(t.position,lunar?t.moonPosition:[0,0,0]),v=sub(t.velocity,lunar?t.moonVelocity:[0,0,0]),up=unit(r);
  const siteDistance=length(sub(t.position,t.landingSitePosition)),surfaceRadius=MOON_RADIUS+(siteDistance<200000?LANDING_ELEVATION:0);
  s.altitude=length(r)-(lunar?surfaceRadius:EARTH_RADIUS);s.verticalSpeed=dot(v,up);s.horizontalSpeed=length(sub(v,scale(up,s.verticalSpeed)));s.orbitalSpeed=Math.sqrt((lunar?MOON_MU:EARTH_MU)/length(r));s.speed=length(v);s.pitch=Math.acos(clamp(dot(up,t.attitude),-1,1));
  if(s.plan.destination==='iss'&&(s.phase==='approach'||s.phase==='science'||s.flightMode==='rendezvous')){const radial=unit(t.targetPosition),forward=tangent(radial),rel=sub(t.position,t.targetPosition),relV=sub(t.velocity,t.targetVelocity);s.distance=-dot(rel,forward);s.x=dot(rel,radial);s.y=rel[2];s.speed=dot(relV,forward);s.vx=dot(relV,radial);s.vy=relV[2];}
  else if(lunar){const rel=sub(t.position,t.landingSitePosition),east=tangent(t.landingSiteNormal),north=cross(t.landingSiteNormal,east);s.distance=length(rel);s.x=dot(rel,east);s.y=dot(rel,north);s.vx=dot(sub(t.velocity,t.landingSiteVelocity),east);s.vy=dot(sub(t.velocity,t.landingSiteVelocity),north);}
  s.groundSpeed=length(sub(v,cross([0,0,lunar?MOON_RATE:EARTH_ROTATION],r)));const air=sub(t.velocity,cross([0,0,EARTH_ROTATION],t.position));s.airSpeed=length(air);s.canUnstrap=(s.phase==='science'||s.phase==='transfer'&&s.throttle<.01)&&!s.awaitingCrewSeat;s.dynamicPressure=length(t.position)<EARTH_RADIUS+200000?.5*atmosphericDensity(length(t.position)-EARTH_RADIUS)*dot(air,air):0;s.maxQ=s.dynamicPressure>18000;
  const launchModes=['pad','ascent'];
  if(launchModes.includes(s.flightMode))s.fuel=100*reserveFraction(s);
  else if(s.plan.destination==='moon'&&['parking','tli'].includes(s.flightMode))s.fuel=100*s.stageFuel/SATURN_V[2].propellant;
  else {const capacity=s.flightMode==='escape'?ESCAPE.propellant:s.plan.destination==='iss'?2500:['lunar-descent','surface','launch-window'].includes(s.flightMode)?APOLLO.descentPropellant:['lunar-ascent','carrier-rendezvous'].includes(s.flightMode)?APOLLO.ascentPropellant:APOLLO.spsPropellant;s.fuel=100*s.engineFuel/capacity;}

}
export function initializeTrajectory(s:State):State{
  const list=stages(s),position:Vec3=[EARTH_RADIUS,0,0],velocity:Vec3=[0,EARTH_RADIUS*EARTH_ROTATION,0];
  Object.assign(s,{trajectory:makeTrajectory({position,velocity,epochSeconds:0},s.plan.destination),separations:[],flightMode:'pad',navigation:{stationAngle:s.plan.startMode==='approach'?0:-.28,arrivalEpoch:0,nextCorrection:0,desiredVelocity:null,desiredOrbit:null,rendezvousTarget:null,earthEntryTarget:null,modeStarted:0,descentEnd:0,carrier:null,carrierMass:0,carrierFuel:0,surfaceOffset:null,dockedOffset:null,returnStart:0,returnRequested:false},engineFuel:0,engineDryMass:0,deltaV:0,parachuteDeployed:false,completedActivities:[],groundSpeed:0,airSpeed:0,crewSeated:true,awaitingCrewSeat:false,canUnstrap:false,fuel:100,stageFuel:list[0].propellant,vehicleMass:list.reduce((n,e)=>n+e.dryMass+e.propellant,0)+(s.plan.destination==='moon'?lunarStackMass(s):orbitalCapsuleMass(s))} satisfies Partial<State>);
  if(s.plan.startMode==='approach'){
    s.phase='approach';s.launchStage=list.length+1;s.ignited=true;s.countdown=0;s.flightMode=s.plan.destination==='moon'?'lunar-descent':'rendezvous';
    if(s.plan.destination==='iss'){const target=stationState(0),forward=tangent(target.position),radial=unit(target.position);s.trajectory=makeTrajectory({position:add(add(target.position,scale(forward,-180)),add(scale(radial,8),[0,0,-5])),velocity:add(target.velocity,scale(forward,.8)),epochSeconds:0},'iss');s.vehicleMass=orbitalCapsuleMass(s);s.engineFuel=2500*reserveFraction(s);s.engineDryMass=s.vehicleMass-s.engineFuel;}
    else{const site=landingSite(0),east=tangent(site.normal);s.trajectory=makeTrajectory({position:add(site.position,add(scale(site.normal,160),scale(east,16))),velocity:add(site.velocity,scale(site.normal,-3)),epochSeconds:0},'moon');s.vehicleMass=lunarModuleMass(s);s.engineFuel=APOLLO.descentPropellant*reserveFraction(s);s.engineDryMass=s.vehicleMass-s.engineFuel;s.throttle=.55;s.navigation.descentEnd=70;const r=MOON_RADIUS+GUIDANCE.lunarOrbitAltitude;s.navigation.carrier={position:add(s.trajectory.moonPosition,scale(site.normal,r)),velocity:add(s.trajectory.moonVelocity,scale(tangent(site.normal),Math.sqrt(MOON_MU/r))),epochSeconds:0};s.navigation.carrierMass=20000;s.navigation.carrierFuel=8500;}
  }sync(s);return s;
}
function finish(s:State,reason:string|null){s.success=!reason&&s.science>=100;s.failureReason=reason??(s.success?null:'Crew recovered. The science objective was not completed.');s.ended=true;s.scienceActive=false;s.autoPilot=false;s.throttle=0;s.score=s.success?Math.round(400+s.fuel*2+s.power+s.hull):s.science*2;phase(s,'debrief');note(s,s.success?'Recovery confirmed.':s.failureReason!);}
function separate(s:State,kind:Separation['kind'],mass:number){s.separations.push({id:`${kind}-${s.separations.length+1}`,kind,mass,position:[...s.trajectory.position],velocity:[...s.trajectory.velocity],epochSeconds:s.elapsed,active:true});note(s,`${kind} separated.`);}
function detachToEntry(s:State){separate(s,'service-module',Math.max(0,s.vehicleMass-ESCAPE.capsuleMass));s.vehicleMass=ESCAPE.capsuleMass;s.engineFuel=0;s.engineDryMass=s.vehicleMass;mode(s,'entry');}
function beginLunarAscent(s:State){
  const mass=4700-(1-reserveFraction(s))*APOLLO.ascentPropellant;separate(s,'descent-stage',Math.max(0,s.vehicleMass-mass));s.vehicleMass=mass;s.engineFuel=APOLLO.ascentPropellant*reserveFraction(s);s.engineDryMass=s.vehicleMass-s.engineFuel;s.trajectory.landed=false;s.navigation.surfaceOffset=null;mode(s,'lunar-ascent');
}
function beginReturn(s:State){
  const previous=s.flightMode;s.navigation.returnRequested=true;s.navigation.returnStart=s.elapsed;s.scienceActive=false;s.autoPilot=true;s.awaitingCrewSeat=!s.crewSeated;phase(s,'return');
  if(previous==='pad'||s.countdown>0||previous==='ascent'&&s.altitude<.1&&s.groundSpeed<.1){s.countdown=0;mode(s,'recovered');s.trajectory.landed=true;finish(s,null);return;}
  if(previous==='ascent'&&s.launchStage===1&&s.altitude<45000){
    const mass=ESCAPE.capsuleMass+ESCAPE.towerMass;separate(s,'booster',s.vehicleMass-mass);s.vehicleMass=mass;s.engineFuel=ESCAPE.propellant;s.engineDryMass=mass-s.engineFuel;s.launchStage=stages(s).length+1;mode(s,'escape');note(s,'Launch escape motor firing.');return;
  }
  if(previous==='ascent'||previous==='parking'&&s.plan.destination==='moon'){
    const mass=s.plan.destination==='moon'?APOLLO.csmMass-(1-reserveFraction(s))*APOLLO.spsPropellant:orbitalCapsuleMass(s);separate(s,'upper-stage',s.vehicleMass-mass);s.vehicleMass=mass;s.engineFuel=(s.plan.destination==='moon'?APOLLO.spsPropellant:2500)*reserveFraction(s);s.engineDryMass=mass-s.engineFuel;s.launchStage=stages(s).length+1;
    if(orbitalElements(s.trajectory.position,s.trajectory.velocity).periapsis<EARTH_RADIUS+80000){detachToEntry(s);}else mode(s,'deorbit');
  }else if(['tli','translunar','lunar-capture','lunar-ascent','carrier-rendezvous'].includes(previous)){
    // Once committed to the lunar corridor, finish the controlled encounter
    // and return from lunar orbit. No instantaneous reversal or elapsed jump.
  }else if(previous==='lunar-descent')beginLunarAscent(s);
  else if(s.trajectory.referenceBody==='moon'){if(s.trajectory.landed)mode(s,'launch-window');else if(previous!=='lunar-orbit')mode(s,'tei-wait');}
  else mode(s,'deorbit');note(s,'Return guidance engaged.');
}
export function missionAction(state:State,action:string):State{
  if(state.ended)return state;const s=clone(state);
  if(action==='crew:seated'){s.crewSeated=true;s.awaitingCrewSeat=false;}else if(action==='crew:unstrapped'&&s.canUnstrap){s.crewSeated=false;}else if(action==='ignite'&&s.phase==='launch'&&!s.ignited){s.ignited=true;s.countdown=10;mode(s,'ascent');note(s,'Launch sequence started. T minus ten.');}
  else if(action==='autopilot'&&s.phase==='approach'){s.autoPilot=!s.autoPilot;if(s.autoPilot)s.assisted=true;}
  else if(action==='dock'&&s.phase==='approach'&&s.plan.destination==='iss'){if(canDock(s))dock(s);else note(s,'Docking inhibited. Check range, alignment and relative speed.');}
  else if(action.startsWith('activity:')&&s.phase==='science'){
    const id=action.slice(9),required=requiredActivities(s.plan);
    const readiness=evaluatePlan(s.plan);
    if(readiness.power>readiness.powerCapacity){note(s,'Science inhibited. The experiment exceeds power-bus capacity. Return and reconfigure with a backup battery.');return s;}
    if(s.event&&!s.eventResolved)return s;
    if(id===required[s.completedActivities.length]){
      s.completedActivities.push(id);s.science=s.completedActivities.length*25;s.power-=PAYLOADS[s.plan.payload].actionEnergy;
      if(s.science===50&&!s.eventTriggered){
        s.eventTriggered=true;
        s.eventKind=s.plan.destination==='moon'?(s.plan.payload==='imaging'?'radiation':'communications'):s.plan.payload==='imaging'?'communications':'power';
        s.event=s.eventKind==='radiation'?'Radiation-triggered instrument reset':s.eventKind==='power'?'Experiment power fault':s.plan.destination==='moon'?'Surface communications fault':'Science downlink fault';
        note(s,s.event);
      }
      if(s.science===100){s.dataStoredMb=PAYLOADS[s.plan.payload].dataMb;note(s,`${PAYLOADS[s.plan.payload].result}: ${s.dataStoredMb} MB archived. Return available.`);}
    }
  }
  else if(action==='resolve'&&s.event&&!s.eventResolved){
    const redundant=s.eventKind==='communications'&&s.plan.communications==='redundant',cost=redundant?1:s.eventKind==='radiation'?(s.plan.shielding?4:8):4;
    if(s.power>cost){s.power-=cost;s.eventResolved=true;note(s,redundant?'Backup radio selected. Fault cleared; 3 reserve points saved.':'Fault resolved.');}
  }
  else if(action==='return'&&s.phase==='science'&&s.science>=100)beginReturn(s);else if(action==='abort'&&s.phase!=='return')beginReturn(s);sync(s);return s;
}
export function missionMaxTimeWarp(s:State){if(s.ended||s.phase==='launch'&&!s.ignited)return 1;if(s.countdown>0)return 10;if(s.phase==='launch')return 100;if(s.phase==='approach')return s.altitude<30||s.plan.destination==='iss'&&s.distance<30?1:10;if(s.throttle>.01||s.flightMode==='entry')return 100;return s.phase==='science'?100:10000;}
function canDock(s:State){return length(sub(s.trajectory.position,s.trajectory.targetPosition))<3&&length(sub(s.trajectory.velocity,s.trajectory.targetVelocity))<.5;}
function dock(s:State){s.trajectory.attitude=tangent(s.trajectory.targetPosition);s.navigation.dockedOffset=sub(s.trajectory.position,s.trajectory.targetPosition);phase(s,'science');mode(s,'docked');s.autoPilot=false;note(s,'Docking confirmed.');}
function useEngine(s:State,force:Vec3,dt:number,isp:number,available:number){const used=Math.min(available,length(force)*dt/(isp*STANDARD_GRAVITY));if(used>0){s.deltaV+=isp*STANDARD_GRAVITY*Math.log(s.vehicleMass/Math.max(1,s.vehicleMass-used));s.vehicleMass-=used;}return used;}
function tickAuxiliary(s:State,dt:number){if(s.navigation.desiredOrbit){s.navigation.desiredOrbit=propagateOrbit(s.navigation.desiredOrbit,dt);s.navigation.desiredVelocity=s.navigation.desiredOrbit.velocity;}if(s.navigation.carrier)s.navigation.carrier=propagateOrbit(s.navigation.carrier,dt);for(const d of s.separations){if(!d.active)continue;const p=integrateOrbit(d,dt,{mass:d.mass,dragArea:d.kind==='booster'?80:12,dragCoefficient:.6});Object.assign(d,p);if(length(d.position)<EARTH_RADIUS||length(sub(d.position,moonState(d.epochSeconds).position))<MOON_RADIUS)d.active=false;}}
function integrate(s:State,force:Vec3,dt:number,dragArea=0,dragCoefficient=.32){const p=integrateOrbit(s.trajectory,dt,{thrust:force,mass:s.vehicleMass,dragArea,dragCoefficient,wind:s.wind});Object.assign(s.trajectory,p);if(s.phase==='approach'&&s.plan.destination==='iss')s.trajectory.attitude=unit(sub(s.trajectory.targetPosition,s.trajectory.position));else if(length(force)>1e-8)s.trajectory.attitude=unit(force);s.gForce=length(force)/Math.max(1,s.vehicleMass)/STANDARD_GRAVITY;s.elapsed=p.epochSeconds;s.phaseTime+=dt;tickAuxiliary(s,dt);sync(s);}
function launchTick(s:State,input:Input,dt:number){
  if(s.countdown>0){s.countdown=Math.max(0,s.countdown-dt);s.elapsed+=dt;s.phaseTime+=dt;const a=EARTH_ROTATION*s.elapsed;s.trajectory.position=[EARTH_RADIUS*Math.cos(a),EARTH_RADIUS*Math.sin(a),0];s.trajectory.velocity=cross([0,0,EARTH_ROTATION],s.trajectory.position);s.trajectory.epochSeconds=s.elapsed;if(s.countdown<1e-7){s.countdown=0;note(s,'Ignition. Liftoff.');}sync(s);return;}
  const list=stages(s),index=s.launchStage-1,engine=list[index],up=unit(s.trajectory.position),east=tangent(up),r=length(s.trajectory.position),vr=dot(s.trajectory.velocity,up),vt=dot(s.trajectory.velocity,east);
  if(input.brake){s.commandThrottle=1;s.attitudeOffset=0;}s.commandThrottle=clamp(s.commandThrottle+safeAxis(input.forward)*dt*.15,0,1);s.attitudeOffset=clamp(s.attitudeOffset+safeAxis(input.lateral)*dt*.008,-.15,.15);
  const effectiveIsp=engine.vacuumIsp?engine.isp+(engine.vacuumIsp-engine.isp)*(1-Math.exp(-Math.max(0,s.altitude)/7000)):engine.isp;const effectiveThrust=engine.thrust*effectiveIsp/engine.isp;const requested=s.plan.destination==='moon'?(s.commandThrottle>.1?1:0):s.commandThrottle,throttle=s.plan.destination==='moon'?requested:Math.min(requested,3.8*STANDARD_GRAVITY*s.vehicleMass/effectiveThrust),thrust=effectiveThrust*throttle;
  const pitch=(index===0?65*Math.PI/180*clamp((s.elapsed-20)/140,0,1):Math.acos(clamp(((clamp(((s.plan.destination==='moon'?GUIDANCE.parkingAltitude:200000)-s.altitude)/(s.plan.destination==='moon'?180:110),-120,s.plan.destination==='moon'?650:1000)-vr)*.025+EARTH_MU/r**2-vt**2/r)/Math.max(.01,thrust/s.vehicleMass),-.2,.995)))+s.attitudeOffset;
  const snapshot=s.plan.weatherSnapshot,reportedWind=snapshot?.status==='live'&&snapshot.site===(s.plan.launchSite??'lc39a')&&Number.isFinite(snapshot.windMs)?clamp(snapshot.windMs,0,60):null;
  const force=scale(add(scale(up,Math.cos(pitch)),scale(east,Math.sin(pitch))),thrust);s.throttle=throttle;s.wind=((reportedWind??(s.plan.weather==='crosswind'?18:s.plan.weather==='overcast'?6:2))+(s.plan.weather==='crosswind'?5*Math.sin(s.elapsed*.7):0))*Math.exp(-Math.max(0,s.altitude)/15000);
  s.stageFuel-=useEngine(s,force,dt,effectiveIsp,s.stageFuel);integrate(s,force,dt,s.plan.destination==='moon'?80:11);s.downrange+=vt*EARTH_RADIUS/r*dt;s.launchFuel=(s.stageFuel+list.slice(index+1).reduce((n,e)=>n+e.propellant,0))/list.reduce((n,e)=>n+e.propellant,0)*100;
  if(s.altitude<-.1){if(s.elapsed>12&&s.speed>500){finish(s,'Launch vehicle ground impact.');return;}s.trajectory.position=scale(unit(s.trajectory.position),EARTH_RADIUS);s.trajectory.velocity=cross([0,0,EARTH_ROTATION],s.trajectory.position);sync(s);}
  if(index===list.length-1&&(s.plan.destination==='iss'?(()=>{const e=orbitalElements(s.trajectory.position,s.trajectory.velocity);return e.periapsis>EARTH_RADIUS+160000&&e.apoapsis<EARTH_RADIUS+300000;})():s.altitude>175000&&Math.abs(s.verticalSpeed)<45&&s.horizontalSpeed>=s.orbitalSpeed*.999)){phase(s,'transfer');mode(s,'parking');s.throttle=0;note(s,'Parking orbit established.');if(s.plan.destination==='iss'){separate(s,'upper-stage',engine.dryMass+s.stageFuel);s.launchStage++;s.vehicleMass=orbitalCapsuleMass(s);s.engineFuel=2500*reserveFraction(s);s.engineDryMass=s.vehicleMass-s.engineFuel;}return;}
  if(s.stageFuel<1e-6){if(index<list.length-1){separate(s,index===0?'booster':'upper-stage',engine.dryMass);s.vehicleMass-=engine.dryMass;s.launchStage++;s.stageFuel=list[index+1].propellant;}else finish(s,'Propellant exhausted before parking orbit.');}
}
function limitForce(a:Vec3,mass:number,maximum:number){const force=scale(a,mass),n=length(force);return n>maximum?scale(force,maximum/n):force;}
function velocityBurn(s:State,desired:Vec3,maximum:number,dt:number):Vec3{const dv=sub(desired,s.trajectory.velocity);return scale(unit(dv),Math.min(maximum,length(dv)*s.vehicleMass/Math.max(dt,.1)));}
function lunarTarget(epoch:number,radius=18_000_000){const moon=moonState(epoch);const a=Math.atan2(moon.position[1],moon.position[0])+Math.PI-.7;return add(moon.position,[radius*Math.cos(a),radius*Math.sin(a),0]);}
function relative(s:State){const p=sub(s.trajectory.position,s.trajectory.moonPosition),v=sub(s.trajectory.velocity,s.trajectory.moonVelocity),r=length(p),up=unit(p),east=tangent(up);return{p,v,r,up,east,vr:dot(v,up),vt:dot(v,east)};}
function planStationRendezvous(s:State){
  let best=Infinity,arrival=s.elapsed+5400;
  for(let seconds=600;seconds<=10800;seconds+=100){const target=stationState(s.elapsed+seconds,s.navigation.stationAngle),desired=lambertVelocity(s.trajectory.position,target.position,seconds);if(!desired)continue;const e=orbitalElements(s.trajectory.position,desired),dv=length(sub(desired,s.trajectory.velocity));if(e.periapsis>EARTH_RADIUS+140000&&dv<best){best=dv;arrival=s.elapsed+seconds;}}
  return arrival;
}
function planCarrierRendezvous(s:State){
  if(!s.navigation.carrier)return s.elapsed+1800;
  const from=sub(s.trajectory.position,s.trajectory.moonPosition),v=sub(s.trajectory.velocity,s.trajectory.moonVelocity);
  let future=s.navigation.carrier,best=Infinity,arrival=s.elapsed+7200;
  for(let seconds=600;seconds<=28800;seconds+=600){future=propagateOrbit(future,600);const target=sub(future.position,moonState(s.elapsed+seconds).position),desired=lambertVelocity(from,target,seconds,MOON_MU);if(!desired)continue;const e=orbitalElements(from,desired,MOON_MU),dv=length(sub(desired,v));if(e.periapsis>MOON_RADIUS+8000&&dv<best){best=dv;arrival=s.elapsed+seconds;s.navigation.rendezvousTarget=future;}}
  return arrival;
}
function changeToLander(s:State){s.navigation.carrier={position:[...s.trajectory.position],velocity:[...s.trajectory.velocity],epochSeconds:s.elapsed};s.navigation.carrierMass=s.vehicleMass-lunarModuleMass(s);s.navigation.carrierFuel=s.engineFuel;s.vehicleMass=lunarModuleMass(s);s.engineFuel=APOLLO.descentPropellant*reserveFraction(s);s.engineDryMass=s.vehicleMass-s.engineFuel;s.navigation.descentEnd=s.elapsed+900;mode(s,'lunar-descent');note(s,'Lunar module undocked.');}

// Guidance and propagation are separate: guidance computes finite force only.
function missionForce(s:State,input:Input,dt:number){
  let force:Vec3=[0,0,0],thrust=s.plan.destination==='moon'?APOLLO.spsThrust:18000,isp=s.plan.destination==='moon'?APOLLO.spsIsp:320,area=0,cd=.32;const t=s.trajectory,n=s.navigation;
  if(s.flightMode==='escape'){
    thrust=ESCAPE.thrust;isp=ESCAPE.thrust*ESCAPE.duration/(ESCAPE.propellant*STANDARD_GRAVITY);area=12;cd=1.3;
    if(s.elapsed-n.modeStarted>=ESCAPE.duration-1e-7)detachToEntry(s);else force=scale(unit(t.position),thrust);
  }
  if(s.flightMode==='parking'&&s.elapsed-n.modeStarted>60){if(s.plan.destination==='moon'){n.arrivalEpoch=s.elapsed+GUIDANCE.lunarFlightTime;mode(s,'tli');}else{n.arrivalEpoch=planStationRendezvous(s);mode(s,'rendezvous');}}
  if(s.flightMode==='tli'){const engine=SATURN_V[2];thrust=engine.thrust;isp=engine.isp;const desired=lambertVelocity(t.position,lunarTarget(n.arrivalEpoch),n.arrivalEpoch-s.elapsed);if(desired){if(length(sub(desired,t.velocity))<2){separate(s,'upper-stage',engine.dryMass+s.stageFuel);s.launchStage=4;s.vehicleMass=lunarStackMass(s);s.engineFuel=APOLLO.spsPropellant*reserveFraction(s);s.engineDryMass=s.vehicleMass-s.engineFuel;mode(s,'translunar');n.nextCorrection=s.elapsed+600;}else force=velocityBurn(s,desired,thrust,dt);}}
  if(s.flightMode==='translunar'){if(length(sub(t.position,t.moonPosition))<20_000_000)mode(s,'lunar-capture');else if(s.elapsed>=n.nextCorrection&&n.arrivalEpoch-s.elapsed>10000){n.desiredVelocity=targetVelocity(t,lunarTarget(n.arrivalEpoch),n.arrivalEpoch,t.velocity);n.desiredOrbit=n.desiredVelocity?{position:[...t.position],velocity:[...n.desiredVelocity],epochSeconds:s.elapsed}:null;n.nextCorrection=s.elapsed+GUIDANCE.correctionInterval;}if(n.desiredVelocity){if(length(sub(n.desiredVelocity,t.velocity))<.5)n.desiredVelocity=null,n.desiredOrbit=null;else force=velocityBurn(s,n.desiredVelocity,thrust,dt);}}
  if(s.flightMode==='rendezvous'||s.flightMode==='carrier-rendezvous'){
    const carrier=s.flightMode==='carrier-rendezvous';if(carrier){thrust=800;isp=289;}const target=carrier?n.carrier!:stationState(s.elapsed,n.stationAngle),range=length(sub(target.position,t.position)),speed=length(sub(target.velocity,t.velocity));
    if(range<1000&&s.phase!=='approach'&&!carrier){phase(s,'approach');s.autoPilot=s.plan.difficulty==='cadet';}
    if(range<3&&speed<.5){if(carrier){s.vehicleMass=n.carrierMass;s.engineFuel=n.carrierFuel;s.engineDryMass=s.vehicleMass-s.engineFuel;n.carrier=null;mode(s,'tei-wait');}else dock(s);}
    else if(s.phase==='approach'&&!s.autoPilot&&!carrier){force=add(add(scale(tangent(target.position),safeAxis(input.forward)*.7*s.vehicleMass),scale(unit(target.position),safeAxis(input.lateral)*.5*s.vehicleMass)),[0,0,safeAxis(input.vertical)*.5*s.vehicleMass]);if(input.brake)force=limitForce(scale(sub(target.velocity,t.velocity),2),s.vehicleMass,thrust);}
    else if(range<5000){const desired=add(target.velocity,scale(unit(sub(target.position,t.position)),Math.min(3.5,Math.sqrt(Math.max(0,range-1.2)*.22))));force=limitForce(add(scale(sub(desired,t.velocity),.6),sub(gravity(target.position,s.elapsed),gravity(t.position,s.elapsed))),s.vehicleMass,thrust);}
    else{if(n.arrivalEpoch<s.elapsed+300)n.arrivalEpoch=carrier?planCarrierRendezvous(s):planStationRendezvous(s);const future=carrier?(n.rendezvousTarget??propagateOrbit(target,n.arrivalEpoch-s.elapsed)):stationState(n.arrivalEpoch,n.stationAngle),desired=carrier?(()=>{const rel=lambertVelocity(sub(t.position,t.moonPosition),sub(future.position,moonState(n.arrivalEpoch).position),n.arrivalEpoch-s.elapsed,MOON_MU);return rel?add(t.moonVelocity,rel):null;})():lambertVelocity(t.position,future.position,n.arrivalEpoch-s.elapsed);if(desired)force=velocityBurn(s,desired,thrust,dt);}
  }
  if(s.flightMode==='lunar-capture'){const q=relative(s),goal=MOON_RADIUS+GUIDANCE.lunarOrbitAltitude;if(q.r>goal+150000){const energy=dot(q.v,q.v)/2-MOON_MU/q.r,h=Math.sqrt(Math.max(0,2*goal*goal*(energy+MOON_MU/goal)));force=limitForce(scale(q.east,(h/q.r-q.vt)/150),s.vehicleMass,thrust);}else{const desiredVr=clamp((goal-q.r)/180,-300,180),desiredVt=Math.sqrt(MOON_MU/q.r);force=limitForce(add(scale(q.up,(desiredVr-q.vr)/70+MOON_MU/q.r**2-q.vt*q.vt/q.r),scale(q.east,(desiredVt-q.vt)/70+q.vr*q.vt/q.r)),s.vehicleMass,thrust);if(Math.abs(q.r-goal)<1500&&Math.abs(q.vr)<3&&Math.abs(q.vt-desiredVt)<4)mode(s,'lunar-orbit');}}
  if(s.flightMode==='lunar-orbit'){if(n.returnRequested){const mass=lunarModuleMass(s);separate(s,'descent-stage',mass);s.vehicleMass-=mass;s.engineDryMass=s.vehicleMass-s.engineFuel;mode(s,'tei-wait');}else{const q=relative(s),site=landingSite(s.elapsed),angle=Math.atan2(cross(q.up,site.normal)[2],dot(q.up,site.normal));if(angle>.34&&angle<.41)changeToLander(s);}}
  if(s.flightMode==='lunar-descent'){
    thrust=APOLLO.descentThrust;isp=APOLLO.descentIsp;const site=landingSite(s.elapsed),q=relative(s),height=s.altitude;
    if(height<1500&&s.phase!=='approach'){phase(s,'approach');s.autoPilot=true;}
    if(s.phase==='approach'&&!s.autoPilot){s.throttle=clamp(s.throttle+safeAxis(input.forward)*dt*.2,0,1);let a=add(scale(q.up,thrust/s.vehicleMass*s.throttle),scale(tangent(site.normal),safeAxis(input.lateral)*.65));if(input.brake)a=add(scale(q.up,MOON_MU/q.r**2-q.vr*1.2),scale(tangent(site.normal),-s.vx*.7));force=limitForce(a,s.vehicleMass,thrust);}
    else if(height<300){const vr=dot(sub(t.velocity,site.velocity),site.normal),wanted=-clamp(Math.sqrt(Math.max(0,height)*.7),.65,5),error=sub(site.position,t.position),lateral=sub(error,scale(site.normal,dot(error,site.normal))),lv=sub(sub(t.velocity,site.velocity),scale(site.normal,vr));force=limitForce(add(scale(site.normal,MOON_MU/q.r**2+(wanted-vr)*1.3),add(scale(lateral,.012),scale(lv,-.3))),s.vehicleMass,thrust);}
    else{const remaining=Math.max(60,n.descentEnd-s.elapsed),future=landingSite(s.elapsed+remaining),rError=sub(future.position,t.position),vError=sub(future.velocity,t.velocity),a=add(add(scale(rError,6/remaining**2),scale(t.velocity,-6/remaining)),scale(vError,-2/remaining));force=limitForce(sub(a,gravity(t.position,s.elapsed)),s.vehicleMass,thrust);}
  }
  if(s.flightMode==='lunar-ascent'){thrust=APOLLO.ascentThrust;isp=APOLLO.ascentIsp;const q=relative(s),goal=MOON_RADIUS+30000,targetVr=clamp((goal-q.r)/120,-30,120),needed=(targetVr-q.vr)/60+MOON_MU/q.r**2-q.vt*q.vt/q.r,pitch=Math.acos(clamp(needed/(thrust/s.vehicleMass),.02,.999));force=scale(add(scale(q.up,Math.cos(pitch)),scale(q.east,Math.sin(pitch))),thrust);if(q.r>MOON_RADIUS+15000&&orbitalElements(q.p,q.v,MOON_MU).periapsis>MOON_RADIUS+10000){mode(s,'carrier-rendezvous');n.arrivalEpoch=planCarrierRendezvous(s);}}
  if(s.flightMode==='tei-wait'||s.flightMode==='tei'){
    const q=relative(s),earthTarget=scale(tangent(t.position),EARTH_RADIUS+120000),earth=lambertVelocity(t.position,earthTarget,GUIDANCE.lunarFlightTime),vinf=earth?sub(earth,t.moonVelocity):scale(unit(t.moonPosition),-1000),desiredRelative=lambertVelocity(q.p,scale(unit(vinf),20_000_000),14000,MOON_MU);
    if(desiredRelative){const desired=add(t.moonVelocity,desiredRelative),error=length(sub(desired,t.velocity));if(s.flightMode==='tei-wait'&&error<900){mode(s,'tei');n.arrivalEpoch=s.elapsed+GUIDANCE.lunarFlightTime;}if(s.flightMode==='tei'){if(error<2)mode(s,'lunar-escape');else force=velocityBurn(s,desired,thrust,dt);}}
  }
  if(s.flightMode==='lunar-escape'&&length(sub(t.position,t.moonPosition))>12_000_000){mode(s,'earth-return');n.nextCorrection=s.elapsed;n.arrivalEpoch=s.elapsed+GUIDANCE.lunarFlightTime;}
  if(s.flightMode==='earth-return'){if(length(t.position)<40_000_000){mode(s,'deorbit');}else if(s.elapsed>=n.nextCorrection&&n.arrivalEpoch-s.elapsed>1000){const angle=Math.atan2(t.position[1],t.position[0])+.82;if(!n.earthEntryTarget)n.earthEntryTarget=[30_000_000*Math.cos(angle),30_000_000*Math.sin(angle),0];n.desiredVelocity=targetVelocity(t,n.earthEntryTarget,n.arrivalEpoch,t.velocity);n.desiredOrbit=n.desiredVelocity?{position:[...t.position],velocity:[...n.desiredVelocity],epochSeconds:s.elapsed}:null;n.nextCorrection=s.elapsed+GUIDANCE.correctionInterval;}if(n.desiredVelocity){if(length(sub(n.desiredVelocity,t.velocity))<1)n.desiredVelocity=null,n.desiredOrbit=null;else force=velocityBurn(s,n.desiredVelocity,thrust,dt);}}
  if(s.flightMode==='deorbit'){const elements=orbitalElements(t.position,t.velocity),rp=EARTH_RADIUS+50000,radial=unit(t.position),vt=sub(t.velocity,scale(radial,dot(radial,t.velocity))),wanted=rp*Math.sqrt(Math.max(0,2*(elements.energy+EARTH_MU/rp)))/length(t.position);if(Math.abs(elements.periapsis-rp)>1000)force=scale(unit(vt),clamp((wanted-length(vt))*s.vehicleMass/Math.max(dt,.1),-thrust,thrust));if(s.altitude<180000&&s.verticalSpeed<0)detachToEntry(s);}
  if(s.flightMode==='entry'){area=12;cd=1.3;force=[0,0,0];if(s.altitude<8000&&s.groundSpeed<500&&s.verticalSpeed<0)s.parachuteDeployed=true;if(s.parachuteDeployed){area=1400;cd=1.4;}}
  return{force,thrust,isp,area,cd};
}
function flightTick(s:State,input:Input,dt:number){
  if(s.flightMode==='launch-window'&&s.navigation.carrier&&s.crewSeated){const cp=unit(sub(s.navigation.carrier.position,s.trajectory.moonPosition)),site=s.trajectory.landingSiteNormal,angle=Math.atan2(cross(site,cp)[2],dot(site,cp));if(angle>-.10&&angle<-.07){beginLunarAscent(s);return;}}

  if(s.flightMode==='docked'||s.flightMode==='surface'||s.flightMode==='launch-window'){
    const lunar=s.flightMode!=='docked',target=lunar?moonState(s.elapsed+dt):stationState(s.elapsed+dt,s.navigation.stationAngle),offset=(lunar?s.navigation.surfaceOffset:s.navigation.dockedOffset)??[0,0,0],w=lunar?MOON_RATE:Math.sqrt(EARTH_MU/(EARTH_RADIUS+ISS_ALTITUDE)**3),a=w*dt,c=Math.cos(a),sn=Math.sin(a),rotated:Vec3=[offset[0]*c-offset[1]*sn,offset[0]*sn+offset[1]*c,offset[2]];
    if(lunar)s.navigation.surfaceOffset=rotated;else s.navigation.dockedOffset=rotated;s.trajectory.position=add(target.position,rotated);s.trajectory.velocity=add(target.velocity,cross([0,0,w],rotated));s.trajectory.epochSeconds=target.epochSeconds;s.elapsed+=dt;s.phaseTime+=dt;tickAuxiliary(s,dt);sync(s);return;
  }
  const beforeMode=s.flightMode;const {force,thrust,isp,area,cd}=missionForce(s,input,dt);if(s.ended||s.flightMode!==beforeMode)return;
  if(length(force)>.01&&!s.crewSeated){s.awaitingCrewSeat=true;s.throttle=0;integrate(s,[0,0,0],dt,area,cd);return;}s.awaitingCrewSeat=false;const usesStage=s.flightMode==='tli',available=usesStage?s.stageFuel:s.engineFuel,required=length(force)*dt/(isp*STANDARD_GRAVITY),actual=required>available?scale(force,available/required):force;
  if(length(actual)>0){const used=useEngine(s,actual,dt,isp,available);if(usesStage)s.stageFuel-=used;else s.engineFuel-=used;}s.throttle=length(actual)/Math.max(1,thrust);integrate(s,actual,dt,area,cd);
  const initial=s.plan.destination==='moon'?(s.flightMode==='lunar-descent'?APOLLO.descentPropellant:s.flightMode==='lunar-ascent'||s.flightMode==='carrier-rendezvous'?APOLLO.ascentPropellant:APOLLO.spsPropellant):2500;s.fuel=100*s.engineFuel/initial;
  if(required>0&&available<=0&&s.flightMode!=='entry'){finish(s,'Propellant exhausted before the maneuver was complete.');return;}
  if(s.trajectory.referenceBody==='moon'&&s.altitude<=0&&!s.trajectory.landed){const v=sub(s.trajectory.velocity,s.trajectory.landingSiteVelocity);if(s.flightMode==='lunar-descent'&&length(v)<3&&length(sub(s.trajectory.position,s.trajectory.landingSitePosition))<150){s.trajectory.position=add(s.trajectory.moonPosition,scale(unit(sub(s.trajectory.position,s.trajectory.moonPosition)),MOON_RADIUS+LANDING_ELEVATION));s.trajectory.velocity=add(s.trajectory.moonVelocity,cross([0,0,MOON_RATE],sub(s.trajectory.position,s.trajectory.moonPosition)));s.trajectory.landed=true;s.navigation.surfaceOffset=sub(s.trajectory.position,s.trajectory.moonPosition);phase(s,'science');mode(s,'surface');s.throttle=0;s.autoPilot=false;note(s,'Touchdown confirmed.');}else finish(s,'Lunar surface impact.');}
  else if(s.trajectory.referenceBody==='earth'&&s.altitude<=0){if(s.flightMode==='entry'&&length(sub(s.trajectory.velocity,cross([0,0,EARTH_ROTATION],s.trajectory.position)))<15){mode(s,'recovered');s.trajectory.landed=true;finish(s,null);}else finish(s,'Earth surface impact.');}
}
export function advanceMission(state:State,input:Input,dt:number):State{
  if(state.ended||!Number.isFinite(dt)||dt<=0||state.phase==='launch'&&!state.ignited)return state;
  const s=clone(state),p=s.phase,m=s.flightMode,stage=s.launchStage,countdown=s.countdown;let remaining=Math.min(dt,86400*8),steps=0;
  while(remaining>1e-8&&!s.ended&&steps++<200000){
    let maximum=s.phase==='launch'?.1:s.flightMode==='entry'||s.flightMode==='escape'?.1:s.phase==='approach'?.05:s.phase==='science'?60:s.throttle>.001||['tli','lunar-capture','lunar-descent','lunar-ascent','tei','rendezvous','carrier-rendezvous','deorbit'].includes(s.flightMode)?1:300;
    if(s.phase==='launch'&&s.countdown>0)maximum=Math.min(maximum,s.countdown);
    if(s.flightMode==='escape')maximum=Math.min(maximum,Math.max(.000001,ESCAPE.duration-(s.elapsed-s.navigation.modeStarted)));
    const h=Math.min(remaining,maximum,stableStep(s.trajectory,maximum)),before=s.elapsed;
    if(s.phase==='launch')launchTick(s,input,h);else flightTick(s,input,h);
    // An operation boundary may consume no time. Resource use follows actual
    // propagation, not the requested step that was held at that boundary.
    const elapsed=s.elapsed-before;s.power-=elapsed*(.000005+(s.plan.communications==='redundant'?.0000002:0));
    if(s.event&&!s.eventResolved)s.power-=elapsed*.001;
    if(s.power<=0&&!s.ended)finish(s,'Electrical power exhausted.');
    remaining-=elapsed;
    if(s.phase!==p||s.flightMode!==m||s.launchStage!==stage||countdown>0&&s.countdown===0)break;
  }
  sync(s);return s;
}
