import test from 'node:test';
import assert from 'node:assert/strict';
import { createMission, stepMission, act, requiredActivities, evaluatePlan, getMaxTimeWarp, type Plan, type State } from '../src/game/simulation';
import { EARTH_RADIUS, EARTH_MU, EARTH_ROTATION, MOON_MU, MOON_RADIUS, LANDING_ELEVATION, LANDING_LATITUDE, LANDING_LONGITUDE, STANDARD_GRAVITY, add, sub, scale, dot, cross, length, unit, moonState, landingSite, makeTrajectory, integrateOrbit, propagateOrbit, orbitalElements, lambertVelocity, gravity, sampleTrajectory, type Vec3 } from '../src/game/orbital';
import { ESCAPE } from '../src/game/orbitalVehicle';
const idle={forward:0,lateral:0,vertical:0,brake:false};
const plan=(destination:Plan['destination']='iss',difficulty:Plan['difficulty']='cadet',startMode:Plan['startMode']='pad'):Plan=>({destination,difficulty,startMode,payload:destination==='moon'?'geology':'biology',extraBattery:true,extraFuel:true,shielding:false,weather:'clear'});
function advanceTo(s:State,predicate:(s:State)=>boolean,maxElapsed=900000){
  let count=0;
  while(!s.ended&&!predicate(s)&&s.elapsed<maxElapsed&&count++<70000){
    if(s.phase==='approach'&&!s.autoPilot)s=act(s,'autopilot');
    const before=s,coast=['translunar','earth-return','launch-window','tei-wait','lunar-escape'].includes(s.flightMode);
    s=stepMission(s,idle,coast?2000:20);
    const elapsed=s.elapsed-before.elapsed;
    assert.ok(elapsed>=0,'time cannot reverse');
    if(elapsed<1e-9){assert.deepEqual(s.trajectory.position,before.trajectory.position,'an operation boundary cannot move the spacecraft');assert.deepEqual(s.trajectory.velocity,before.trajectory.velocity,'an operation boundary cannot assign a velocity');}
    else{
      const bound=Math.max(length(before.trajectory.velocity),length(s.trajectory.velocity))*elapsed+80*elapsed*elapsed+1;
      assert.ok(length(sub(s.trajectory.position,before.trajectory.position))<=bound,'bounded motion through each phase');
    }
  }
  assert.ok(count<70000,'guidance must make progress');return s;
}
function science(s:State){for(const id of requiredActivities(s.plan)){if(s.event&&!s.eventResolved)s=act(s,'resolve');s=act(s,'activity:'+id);}assert.equal(s.science,100);return s;}
function complete(p:Plan){let s=createMission(p);if(p.startMode!=='approach')s=act(s,'ignite');s=advanceTo(s,s=>s.phase==='science');assert.equal(s.phase,'science',s.failureReason??s.flightMode);const landed=s;s=science(s);const before=s;s=act(s,'return');assert.deepEqual(s.trajectory.position,before.trajectory.position);assert.deepEqual(s.trajectory.velocity,before.trajectory.velocity);s=advanceTo(s,s=>s.ended);assert.equal(s.success,true,s.failureReason??s.flightMode);return{landed,recovered:s};}

for(const destination of ['iss','moon'] as const)for(const difficulty of ['cadet','commander','expert'] as const)test(`${destination} ${difficulty}: continuous launch, mission work, and physical recovery`,()=>{
  const {landed,recovered}=complete(plan(destination,difficulty));
  assert.equal(recovered.completedActivities.length,4);assert.equal(recovered.flightMode,'recovered');assert.ok(recovered.groundSpeed<15);assert.ok(recovered.parachuteDeployed);
  if(destination==='moon'){assert.ok(landed.elapsed>2*86400);assert.ok(recovered.elapsed>6*86400);assert.ok(length(sub(landed.trajectory.position,landed.trajectory.landingSitePosition))<150);assert.ok(recovered.separations.some(d=>d.kind==='descent-stage'));}
  else assert.ok(landed.elapsed>1000);
  assert.ok(recovered.separations.some(d=>d.kind==='service-module'));
});
for(const destination of ['iss','moon'] as const)test(`${destination} practice is an explicit initial condition with a complete return`,()=>{const result=complete(plan(destination,'commander','approach'));assert.ok(result.landed.elapsed<150);assert.equal(result.recovered.success,true);});
for(const dwell of [30,120,300,600])test(`Moon return after ${dwell}s of surface work survives browser-sized operation boundaries`,()=>{
  let s=act(createMission(plan('moon','cadet','approach')),'autopilot');
  while(!s.ended&&s.phase==='approach')s=stepMission(s,idle,.2*getMaxTimeWarp(s));
  assert.equal(s.phase,'science');assert.ok(s.altitude>-.00001,'contact is resolved onto the measured terrain');assert.ok(s.groundSpeed<.0001);
  s=stepMission(s,idle,dwell);s=science(s);s=act(s,'return');let count=0;
  while(!s.ended&&count++<2000){const before=s.flightMode;s=stepMission(s,idle,.2*getMaxTimeWarp(s));if(s.flightMode!==before)s=stepMission(s,idle,1/60);}
  assert.equal(s.success,true,s.failureReason??s.flightMode);assert.ok(count<2000);
});

test('twenty two-body orbits conserve specific energy and angular momentum',()=>{
  const r=EARTH_RADIUS+400000,v=Math.sqrt(EARTH_MU/r),start={position:[r,0,0] as Vec3,velocity:[0,v,0] as Vec3,epochSeconds:0};
  const period=2*Math.PI*Math.sqrt(r**3/EARTH_MU),end=propagateOrbit(start,20*period,{includeMoon:false}),a=orbitalElements(start.position,start.velocity),b=orbitalElements(end.position,end.velocity);
  assert.ok(Math.abs((b.energy-a.energy)/a.energy)<1e-7);assert.ok(length(sub(a.angularMomentum,b.angularMomentum))/length(a.angularMomentum)<1e-7);assert.ok(length(sub(end.position,start.position))<25);
});
test('RK4 converges with smaller steps and time acceleration does not change gravity',()=>{
  const r=EARTH_RADIUS+200000,start={position:[r,0,0] as Vec3,velocity:[0,Math.sqrt(EARTH_MU/r),0] as Vec3,epochSeconds:0};
  let coarse=start,fine=start;for(let i=0;i<600;i++)coarse=integrateOrbit(coarse,1,{includeMoon:false});for(let i=0;i<6000;i++)fine=integrateOrbit(fine,.1,{includeMoon:false});const warped=propagateOrbit(start,600,{includeMoon:false});
  assert.ok(length(sub(coarse.position,fine.position))<.02);assert.ok(length(sub(warped.position,fine.position))<.1);
});
test('Earth-centred lunar force includes the indirect acceleration and varies continuously',()=>{
  const m=moonState(0),p:Vec3=[EARTH_RADIUS+400000,0,0],direct=scale(p,-EARTH_MU/length(p)**3),d=sub(m.position,p),expected=add(direct,sub(scale(d,MOON_MU/length(d)**3),scale(m.position,MOON_MU/length(m.position)**3)));
  assert.ok(length(sub(gravity(p,0),expected))<1e-12);assert.ok(length(sub(gravity(p,1),gravity(p,0)))<1e-7);
});
test('Lambert guidance requests a velocity that reaches its two-body target',()=>{
  const r=EARTH_RADIUS+200000,from:Vec3=[r,0,0],to:Vec3=[0,r,0],duration=Math.PI/2*Math.sqrt(r**3/EARTH_MU),v=lambertVelocity(from,to,duration)!;
  const arrived=propagateOrbit({position:from,velocity:v,epochSeconds:0},duration,{includeMoon:false});assert.ok(length(sub(arrived.position,to))<1);assert.ok(Math.abs(length(v)-Math.sqrt(EARTH_MU/r))<.01);
});
test('trajectory prediction is deterministic and never mutates the flight',()=>{const s=createMission(plan('iss','cadet','approach')),before=JSON.stringify(s),a=sampleTrajectory(s.trajectory,600,20),b=sampleTrajectory(s.trajectory,600,20);assert.deepEqual(a,b);assert.equal(a.length,20);assert.equal(JSON.stringify(s),before);});
test('Apollo landing anchor uses the measured LROC height and fixed latitude/longitude',()=>{
  const t=90000,site=landingSite(t),m=moonState(t),p=sub(site.position,m.position),normal=unit(p);
  assert.ok(Math.abs(length(p)-(MOON_RADIUS+LANDING_ELEVATION))<1e-6);assert.ok(Math.abs(Math.asin(normal[2])-LANDING_LATITUDE)<1e-12);
  const longitude=Math.atan2(cross(scale(unit(m.position),-1),normal)[2],dot(scale(unit(m.position),-1),normal));assert.ok(Math.abs(longitude-LANDING_LONGITUDE)<1e-12);
  const next=landingSite(t+1);assert.ok(length(sub(sub(next.position,site.position),site.velocity))<.01);
});
test('pad ground speed is zero despite inertial Earth rotation; countdown is real seconds',()=>{
  let s=createMission(plan());assert.ok(s.groundSpeed<1e-8);assert.ok(length(s.trajectory.velocity)>460);assert.equal(stepMission(s,idle,100),s);
  s=stepMission(act(s,'ignite'),idle,1);assert.ok(Math.abs(s.elapsed-1)<1e-8);assert.ok(Math.abs(s.countdown-9)<1e-8);assert.ok(s.groundSpeed<1e-7);
  s=stepMission(s,idle,100);assert.equal(s.countdown,0);assert.ok(Math.abs(s.elapsed-10)<1e-7);assert.ok(Math.abs(s.altitude)<1e-6);
});
test('engine mass flow and finite acceleration obey SI thrust and specific impulse',()=>{
  let s=stepMission(act(createMission(plan()),'ignite'),idle,10),mass=s.vehicleMass;s=stepMission(s,idle,10);
  assert.ok(Math.abs((mass-s.vehicleMass)-7600000/(295*STANDARD_GRAVITY)*10)<1e-5);assert.ok(s.groundSpeed>40);assert.ok(s.deltaV>s.groundSpeed);assert.ok(s.vehicleMass>0);
});
test('discarded stages inherit position and velocity exactly at physical separation',()=>{
  let s=act(createMission(plan('moon')),'ignite');s=advanceTo(s,s=>s.separations.length>0);const d=s.separations.at(-1)!;
  assert.equal(d.epochSeconds,s.elapsed);assert.deepEqual(d.position,s.trajectory.position);assert.deepEqual(d.velocity,s.trajectory.velocity);assert.ok(d.mass>100000);
  const next=stepMission(s,idle,10);assert.ok(length(sub(next.separations[0].position,next.trajectory.position))>10);assert.ok(next.separations[0].epochSeconds>s.elapsed);
});
test('equipment and actual tank loading change wet mass and acceleration',()=>{
  const baseline=createMission(plan('moon')),shielded=createMission({...plan('moon'),shielding:true}),standard=createMission({...plan('moon'),extraFuel:false}),withoutBattery=createMission({...plan('moon'),extraBattery:false});
  assert.equal(shielded.vehicleMass-baseline.vehicleMass,210);assert.equal(baseline.vehicleMass-withoutBattery.vehicleMass,130);assert.ok(standard.vehicleMass<baseline.vehicleMass-1000);assert.ok(withoutBattery.power<baseline.power);
  let a=stepMission(act(baseline,'ignite'),idle,10),b=stepMission(act(shielded,'ignite'),idle,10);a=stepMission(a,idle,80);b=stepMission(b,idle,80);assert.ok(a.altitude>b.altitude);assert.equal(evaluatePlan({...plan(),payload:'geology',shielding:true}).valid,false);
  const full=createMission(plan('moon','cadet','approach')),reduced=createMission({...plan('moon','cadet','approach'),extraFuel:false});assert.ok(full.engineFuel>reduced.engineFuel);assert.ok(full.vehicleMass>reduced.vehicleMass);
});
test('difficulty does not change physical constants, initial trajectory or main propellant',()=>{const a=createMission(plan('moon','cadet')),b=createMission(plan('moon','expert'));assert.deepEqual(a.trajectory,b.trajectory);assert.equal(a.vehicleMass,b.vehicleMass);assert.equal(a.stageFuel,b.stageFuel);});
test('crosswind changes aerodynamic acceleration without changing gravity',()=>{
  const go=(weather:Plan['weather'])=>{let s=stepMission(act(createMission({...plan(),weather}),'ignite'),idle,10);return stepMission(s,idle,60);};const a=go('clear'),b=go('crosswind');assert.ok(length(sub(a.trajectory.velocity,b.trajectory.velocity))>.001);assert.ok(b.wind>a.wind);
});
test('automatic burns wait for the crew seat while the coast keeps evolving',()=>{
  let s=advanceTo(act(createMission(plan()),'ignite'),s=>s.flightMode==='parking');assert.equal(s.canUnstrap,true);s=act(s,'crew:unstrapped');assert.equal(s.crewSeated,false);
  s=advanceTo(s,s=>s.awaitingCrewSeat,s.elapsed+1000);assert.equal(s.awaitingCrewSeat,true);const before=s;s=stepMission(s,idle,10);assert.equal(s.throttle,0);assert.equal(s.engineFuel,before.engineFuel);assert.ok(s.elapsed>before.elapsed);assert.ok(length(sub(s.trajectory.position,before.trajectory.position))>10000);
  s=act(s,'crew:seated');s=stepMission(s,idle,1);assert.equal(s.awaitingCrewSeat,false);assert.ok(s.throttle>0);
});
test('science is ordered physical work; faults block progress and duplicate actions do nothing',()=>{
  let s=advanceTo(createMission(plan('iss','cadet','approach')),s=>s.phase==='science');const ids=requiredActivities(s.plan);
  assert.equal(stepMission(s,idle,1000).science,0);assert.equal(act(s,'science').science,0);assert.equal(act(s,'activity:'+ids[1]).science,0);
  s=act(s,'activity:'+ids[0]);assert.equal(s.science,25);assert.equal(act(s,'activity:'+ids[0]).science,25);s=act(s,'activity:'+ids[1]);assert.equal(s.science,50);assert.ok(s.event);assert.equal(act(s,'activity:'+ids[2]).science,50);s=act(s,'resolve');s=act(s,'activity:'+ids[2]);s=act(s,'activity:'+ids[3]);assert.equal(s.science,100);assert.deepEqual(s.completedActivities,ids);
});
test('abort and return actions preserve position, velocity and real timeline',()=>{
  const s=createMission(plan('iss','cadet','approach')),aborted=act(s,'abort');assert.deepEqual(aborted.trajectory.position,s.trajectory.position);assert.deepEqual(aborted.trajectory.velocity,s.trajectory.velocity);assert.equal(aborted.elapsed,s.elapsed);
  const recovered=advanceTo(aborted,s=>s.ended);assert.equal(recovered.success,false);assert.match(recovered.failureReason!,/science objective/);assert.ok(recovered.elapsed>1000);
});
test('aborting before liftoff safely ends on the pad without an artificial flight',()=>{
  for(const countdown of [false,true]){let s=createMission(plan('moon'));if(countdown)s=stepMission(act(s,'ignite'),idle,4);const before=s;s=act(s,'abort');assert.equal(s.flightMode,'recovered');assert.equal(s.ended,true);assert.equal(s.success,false);assert.equal(s.elapsed,before.elapsed);assert.deepEqual(s.trajectory.position,before.trajectory.position);assert.deepEqual(s.trajectory.velocity,before.trajectory.velocity);assert.equal(s.separations.length,0);}
});
for(const destination of ['iss','moon'] as const)test(`${destination} early abort uses finite escape thrust followed by atmospheric recovery`,()=>{
  let s=stepMission(act(createMission(plan(destination)),'ignite'),idle,10);s=stepMission(s,idle,1);const before=s;s=act(s,'abort');assert.equal(s.flightMode,'escape');assert.deepEqual(s.trajectory.position,before.trajectory.position);assert.deepEqual(s.trajectory.velocity,before.trajectory.velocity);assert.equal(s.elapsed,before.elapsed);
  const mass=s.vehicleMass,fuel=s.engineFuel,start=s.elapsed;s=stepMission(s,idle,1);assert.equal(s.flightMode,'escape');assert.ok(Math.abs(mass-s.vehicleMass-ESCAPE.propellant/ESCAPE.duration)<1e-6);assert.ok(s.engineFuel<fuel);assert.ok(s.verticalSpeed>before.verticalSpeed+30);assert.equal(s.parachuteDeployed,false,'no parachute deployment while rising');
  s=advanceTo(s,s=>s.flightMode==='entry');assert.ok(Math.abs(s.elapsed-start-ESCAPE.duration)<1e-6);assert.equal(s.vehicleMass,ESCAPE.capsuleMass);assert.equal(s.engineFuel,0);
  s=advanceTo(s,s=>s.ended);assert.equal(s.flightMode,'recovered',s.failureReason!);assert.equal(s.success,false);assert.match(s.failureReason!,/science objective/);assert.ok(s.elapsed>start+30);assert.ok(s.parachuteDeployed);assert.ok(s.groundSpeed<15);
});
test('later ascent abort keeps its ballistic momentum and returns using the capsule',()=>{
  let s=advanceTo(act(createMission(plan('moon')),'ignite'),s=>s.launchStage===2);const before=s;s=act(s,'abort');assert.deepEqual(s.trajectory.position,before.trajectory.position);assert.deepEqual(s.trajectory.velocity,before.trajectory.velocity);assert.equal(s.flightMode,'entry');s=advanceTo(s,s=>s.ended);assert.equal(s.flightMode,'recovered',s.failureReason!);assert.equal(s.success,false);
});
for(const mode of ['translunar','lunar-descent'] as const)test(`Moon abort from ${mode} follows a continuous physical return`,()=>{
  let s=advanceTo(act(createMission(plan('moon')),'ignite'),s=>s.flightMode===mode);const before=s;s=act(s,'abort');assert.deepEqual(s.trajectory.position,before.trajectory.position);assert.deepEqual(s.trajectory.velocity,before.trajectory.velocity);assert.equal(s.elapsed,before.elapsed);assert.equal(s.navigation.returnRequested,true);s=advanceTo(s,s=>s.ended);assert.equal(s.flightMode,'recovered',s.failureReason!);assert.equal(s.success,false);assert.match(s.failureReason!,/science objective/);
});
test('unsafe lunar descent produces a physical contact failure and restart resets state',()=>{
  let s=createMission(plan('moon','expert','approach'));s.throttle=0;s=advanceToManual(s,100);assert.equal(s.ended,true);assert.match(s.failureReason!,/surface impact/);const fresh=createMission(plan('moon'));assert.equal(fresh.elapsed,0);assert.equal(fresh.ended,false);assert.deepEqual(fresh.completedActivities,[]);
});
function advanceToManual(s:State,seconds:number){for(let i=0;i<seconds*10&&!s.ended;i++)s=stepMission(s,{...idle,forward:-1},.1);return s;}
test('time warp is bounded for contact, countdown and active burns; invalid dt is inert',()=>{
  let s=createMission(plan());assert.equal(getMaxTimeWarp(s),1);s=act(s,'ignite');assert.equal(getMaxTimeWarp(s),10);s=stepMission(s,idle,10);assert.equal(getMaxTimeWarp(s),100);
  const moon=createMission(plan('moon','cadet','approach'));assert.equal(getMaxTimeWarp(moon),10);assert.deepEqual(stepMission(moon,idle,NaN),moon);assert.deepEqual(stepMission(moon,idle,-1),moon);assert.deepEqual(stepMission(moon,idle,Infinity),moon);
});
test('resource use at a maneuver boundary follows elapsed time rather than requested warp',()=>{
  const s=advanceTo(act(createMission(plan()),'ignite'),s=>s.flightMode==='parking');const next=stepMission(s,idle,10000);
  assert.equal(next.flightMode,'rendezvous');assert.ok(next.elapsed-s.elapsed<1000);assert.ok(Math.abs(s.power-next.power-(next.elapsed-s.elapsed)*.000005)<1e-10);
});
