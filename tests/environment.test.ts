import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LAUNCH_TIME, fetchLaunchWeather, localSunDirection, solarDirectionUTC } from '../src/game/environment';
import { createMission, act, stepMission, evaluatePlan, requiredActivities, normalizePlan, type Plan } from '../src/game/simulation';

const plan: Plan = { destination:'iss',difficulty:'cadet',payload:'biology',extraFuel:true,extraBattery:true,shielding:false,startMode:'approach' };
const idle = { forward:0,lateral:0,vertical:0,brake:false };
function science(p: Plan) { let state=act(createMission(p),'autopilot');for(let i=0;i<200&&!state.ended&&state.phase!=='science';i++)state=stepMission(state,idle,2);assert.equal(state.phase,'science');return state; }

test('corrupt saved plans safely normalize without retaining weather claims',()=>{
  for(const value of [null,[],false,'bad',{payload:'invalid',difficulty:17,launchTime:{},extraFuel:'no',launchSite:'unknown'}]){
    const result=normalizePlan(value);assert.equal(result.destination,'iss');assert.equal(result.payload,'biology');assert.equal(evaluatePlan(result).valid,true);assert.ok(Number.isFinite(Date.parse(result.launchTime!)));
  }
  const weatherSnapshot={status:'live' as const,site:'lc39a' as const,weather:'overcast' as const,windMs:5,cloudCover:80,temperatureC:20,observedAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),message:'fixture'};
  assert.equal(normalizePlan({...plan,weatherSnapshot}).weatherSnapshot,undefined);
  assert.equal(normalizePlan({...plan,weatherSnapshot},true).weatherSnapshot?.status,'live');
  assert.equal(normalizePlan({...plan,weatherSnapshot:{...weatherSnapshot,observedAt:'2000-01-01T00:00:00Z'}},true).weatherSnapshot,undefined);
  assert.equal(normalizePlan({...plan,launchSite:'lc39b',weatherSnapshot},true).weatherSnapshot,undefined);
});
test('imaging requires backup power output and cannot bypass the bus limit through launch or science actions',()=>{
  const overloaded={...plan,payload:'imaging' as const,extraBattery:false,startMode:'pad' as const};
  const r=evaluatePlan(overloaded);assert.equal(r.powerCapacity,1100);assert.ok(r.powerMargin<0);assert.equal(r.valid,false);
  assert.equal(act(createMission(overloaded),'ignite').ignited,false);
  const ready=evaluatePlan({...overloaded,extraBattery:true});assert.equal(ready.powerCapacity,1250);assert.equal(ready.valid,true);
  const state=science({...overloaded,startMode:'approach'}),blocked=act(state,'activity:'+requiredActivities(overloaded)[0]);
  assert.equal(blocked.science,0);assert.match(blocked.log.at(-1)!,/power-bus capacity/);
});
test('launcher compatibility is an explicit readiness constraint, not fabricated alternate performance',()=>{
  for(const destination of ['iss','moon'] as const){
    const compatible=destination==='moon'?'saturnv':'orbital',incompatible=destination==='moon'?'orbital':'saturnv';
    const p={...plan,destination,startMode:'pad' as const,launcher:compatible};
    assert.equal(normalizePlan({...p,launcher:undefined}).launcher,compatible);
    assert.equal(evaluatePlan(p).launcherCompatible,true);assert.equal(evaluatePlan(p).valid,true);
    const wrong={...p,launcher:incompatible};assert.equal(evaluatePlan(wrong).launcherCompatible,false);assert.equal(evaluatePlan(wrong).valid,false);assert.equal(act(createMission(wrong),'ignite').ignited,false);
  }
});

test('solar direction is normalized and Kennedy daylight/night follows UTC', () => {
  const noon=localSunDirection('2026-06-21T17:00:00Z',0,'lc39a');
  const midnight=localSunDirection('2026-06-21T05:00:00Z',0,'lc39a');
  assert.ok(noon.up>.95);assert.ok(midnight.up<-.55);
  for(const time of ['2026-03-20T12:00:00Z',DEFAULT_LAUNCH_TIME,'invalid'])assert.ok(Math.abs(Math.hypot(...solarDirectionUTC(time))-1)<1e-12);
  const elapsed=localSunDirection('2026-06-21T05:00:00Z',43200,'lc39a');assert.ok(Math.abs(elapsed.up-noon.up)<1e-12);
});
test('weather uses selected launch coordinate, explicit units, and observed timestamp',async()=>{
  const original=globalThis.fetch;let request='';
  globalThis.fetch=async(input)=>{request=String(input);return new Response(JSON.stringify({current:{temperature_2m:26,cloud_cover:88,wind_speed_10m:14,time:new Date().toISOString()}}));};
  try{const result=await fetchLaunchWeather('lc39b');const url=new URL(request);assert.equal(url.searchParams.get('latitude'),'28.6272');assert.equal(url.searchParams.get('wind_speed_unit'),'ms');assert.equal(result.status,'live');assert.equal(result.weather,'crosswind');assert.equal(result.windMs,14);assert.ok(result.observedAt);assert.equal(result.site,'lc39b');}finally{globalThis.fetch=original;}
});
test('offline, stale, missing and cancelled weather never reports live',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw new Error('offline');};assert.equal((await fetchLaunchWeather('lc39a')).status,'fallback');
    globalThis.fetch=async()=>new Response(JSON.stringify({current:{temperature_2m:26,cloud_cover:10,wind_speed_10m:2,time:'2001-01-01T00:00'}}));assert.equal((await fetchLaunchWeather('lc39a')).status,'fallback');
    globalThis.fetch=async()=>new Response('{}');assert.equal((await fetchLaunchWeather('lc39a')).status,'fallback');
    const abort=new AbortController();abort.abort();const result=await fetchLaunchWeather('lc39a',abort.signal);assert.equal(result.status,'fallback');assert.equal(result.observedAt,null);
  }finally{globalThis.fetch=original;}
});
test('radio redundancy changes real mass, budget, power draw and comm recovery',()=>{
  const standard={...plan,payload:'imaging' as const,communications:'standard' as const};
  const redundant={...standard,communications:'redundant' as const};
  const a=evaluatePlan(standard),b=evaluatePlan(redundant);assert.equal(b.mass-a.mass,90);assert.equal(b.cost-a.cost,8);assert.equal(b.power-a.power,25);assert.equal(b.spacecraftMass-a.spacecraftMass,90);
  let sa=science(standard),sb=science(redundant);
  for(const id of requiredActivities(plan).slice(0,2)){sa=act(sa,'activity:'+id);sb=act(sb,'activity:'+id);}
  assert.equal(sa.eventKind,'communications');assert.equal(sb.eventKind,'communications');
  const beforeA=sa.power,beforeB=sb.power;sa=act(sa,'resolve');sb=act(sb,'resolve');assert.equal(beforeA-sa.power,4);assert.equal(beforeB-sb.power,1);
  for(const id of requiredActivities(plan).slice(2)){sa=act(sa,'activity:'+id);sb=act(sb,'activity:'+id);}
  assert.equal(sa.dataStoredMb,160);assert.equal(sb.dataStoredMb,160);
});
test('primary payload changes experiment energy and archived data, independent of difficulty',()=>{
  const bio=science(plan),image=science({...plan,payload:'imaging'}),activity=requiredActivities(plan)[0];
  assert.ok(image.power-act(image,'activity:'+activity).power>bio.power-act(bio,'activity:'+activity).power);
  assert.equal(evaluatePlan(plan).dataMb,48);assert.equal(evaluatePlan({...plan,payload:'imaging'}).dataMb,160);
  assert.equal(bio.dataStoredMb,0);assert.equal(act(bio,'activity:stow-results').dataStoredMb,0);
});
test('lunar imaging creates a scenario radiation fault and shielding changes its recovery cost',()=>{
  const p={...plan,destination:'moon' as const,payload:'imaging' as const};let a=science(p),b=science({...p,shielding:true});
  for(const id of requiredActivities(p).slice(0,2)){a=act(a,'activity:'+id);b=act(b,'activity:'+id);}
  assert.equal(a.eventKind,'radiation');assert.equal(b.eventKind,'radiation');
  assert.equal(a.power-act(a,'resolve').power,8);assert.equal(b.power-act(b,'resolve').power,4);
});
test('weather snapshot affects launch aerodynamics only when it belongs to the selected site',()=>{
  const snapshot={status:'live' as const,site:'lc39b' as const,weather:'clear' as const,windMs:22,cloudCover:0,temperatureC:20,observedAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),message:'Test fixture'};
  const advance=(launchSite:'lc39a'|'lc39b')=>{let s=act(createMission({...plan,startMode:'pad',launchSite,weatherSnapshot:snapshot}),'ignite');s=stepMission(s,idle,10);return stepMission(s,idle,30);};
  assert.ok(advance('lc39b').wind>advance('lc39a').wind*5);
});
for(const destination of ['iss','moon'] as const)for(const payload of ['biology','geology','imaging'] as const)test(`${destination} with ${payload} and redundant radio completes launch, science and return`,()=>{
  const p:Plan={...plan,destination,payload,startMode:'pad',communications:'redundant',launchSite:'lc39b',weather:'crosswind'};
  assert.equal(evaluatePlan(p).valid,true);
  let s=act(createMission(p),'ignite'),count=0;
  while(!s.ended&&count++<70000){
    if(s.phase==='approach'&&!s.autoPilot)s=act(s,'autopilot');
    if(s.phase==='science'){
      if(s.event&&!s.eventResolved)s=act(s,'resolve');
      const next=requiredActivities(p)[s.completedActivities.length];
      s=act(s,next?'activity:'+next:'return');
    }
    const coast=['translunar','earth-return','launch-window','tei-wait','lunar-escape'].includes(s.flightMode);
    s=stepMission(s,idle,coast?2000:20);
  }
  assert.ok(count<70000,'flight must finish');assert.equal(s.success,true,s.failureReason??s.flightMode);assert.equal(s.dataStoredMb,evaluatePlan(p).dataMb);assert.equal(s.flightMode,'recovered');
});
