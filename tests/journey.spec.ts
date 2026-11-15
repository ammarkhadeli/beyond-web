import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Full launchpad journeys through the public UI and physical raycast controls.
 * Scene telemetry and target geometry are READ ONLY. This is assisted scripted
 * operation, not an unaided usability test or real-time performance benchmark.
 * No mission, avatar, camera, resource or physics state is assigned by the test.
 */
// Functional journeys use the application's low graphics mode at a compact
// desktop viewport. High-resolution visual review is a separate capture suite.
test.use({ viewport:{width:800,height:600}, deviceScaleFactor:1, reducedMotion:'reduce' });
type Snapshot={
  phase:string;flightMode:string;elapsed:number;launchStage:number;mode:string;
  science:number;dataStoredMb:number;event:string|null;eventResolved:boolean;
  ended:boolean;success:boolean;failureReason:string|null;autoPilot:boolean;
  crewSeated:boolean;canUnstrap:boolean;parachuteDeployed:boolean;groundSpeed:number;
  fuel:number;power:number;altitude:number;completedActivities:string[];log:string[];
  position:number[];velocity:number[];avatarPosition:number[];allowedWarp:number[];warp:number;
};
type Target={id:string;label:string;distance:number;reach:number;yaw:number;pitch:number;world:number[]};
const actions={iss:['install-sample','power-experiment','record-observation','stow-results'],moon:['deploy-seismometer','collect-sample','record-panorama','stow-samples']} as const;

async function state(page:Page):Promise<Snapshot>{
  return page.evaluate(()=>{
    const world=(window as any).spaceScene,s=world?.lastState;
    if(!s)throw new Error('Flight telemetry unavailable');
    const select=document.querySelector<HTMLSelectElement>('select[aria-label="Time speed"]');
    return {phase:s.phase,flightMode:s.flightMode,elapsed:s.elapsed,launchStage:s.launchStage,mode:world.astronaut.mode,
      science:s.science,dataStoredMb:s.dataStoredMb,event:s.event,eventResolved:s.eventResolved,ended:s.ended,success:s.success,failureReason:s.failureReason,autoPilot:s.autoPilot,
      crewSeated:s.crewSeated,canUnstrap:s.canUnstrap,parachuteDeployed:s.parachuteDeployed,groundSpeed:s.groundSpeed,fuel:s.fuel,power:s.power,altitude:s.altitude,
      completedActivities:[...s.completedActivities],log:[...s.log],position:[...s.trajectory.position],velocity:[...s.trajectory.velocity],avatarPosition:world.astronaut.localPosition.asArray(),
      allowedWarp:select?Array.from(select.options).map(o=>Number(o.value)):[],warp:select?Number(select.value):1};
  });
}
async function advance(page:Page,ticks=1){for(let i=0;i<ticks;i++)await page.clock.fastForward(200);}
async function blurField(page:Page){await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});}
async function cursor(page:Page,free:boolean){
  const hint=page.locator('.cursor-hint');
  if((await hint.innerText()).includes('Look')!==free){await blurField(page);await page.keyboard.press('Tab');await advance(page,2);}
  await expect(hint).toContainText(free?'Look':'Cursor');
}
async function target(page:Page,action:string):Promise<Target|null>{
  return page.evaluate(action=>{
    const world=(window as any).spaceScene,camera=world.camera,V=camera.position.constructor;
    const choices=Array.from(world.interactions.zones.values() as Iterable<any>)
      .filter((zone:any)=>zone.action===action&&zone.parent.isEnabled()&&zone.enabled())
      .map((zone:any)=>{const point=V.TransformCoordinates(zone.position,zone.parent.computeWorldMatrix(true));return{zone,point,distance:point.subtract(camera.globalPosition).length()};})
      .sort((a,b)=>a.distance-b.distance);
    const selected=choices[0];if(!selected)return null;
    const d=V.TransformNormal(selected.point.subtract(camera.globalPosition),camera.getViewMatrix(true));
    return{id:selected.zone.id,label:selected.zone.label,distance:selected.distance,reach:selected.zone.reach,yaw:Math.atan2(d.x,d.z),pitch:Math.atan2(-d.y,Math.hypot(d.x,d.z)),world:selected.point.asArray()};
  },action);
}
async function aim(page:Page,action:string,beforeLook:()=>Promise<unknown>){
  for(let i=0;i<16;i++){
    await beforeLook();
    const point=await target(page,action);expect(point,`Enabled physical target ${action}`).not.toBeNull();
    if(Math.abs(point!.yaw)+Math.abs(point!.pitch)<.008)return point!;
    await page.locator('#space-canvas').evaluate((canvas,offset)=>{
      canvas.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,movementX:Math.max(-.7,Math.min(.7,offset.yaw))/.0025,movementY:Math.max(-.5,Math.min(.5,offset.pitch))/.0025}));
    },point!);
    await advance(page,2);
  }
  const point=await target(page,action);
  expect(point,`Target ${action} still exists after aiming`).not.toBeNull();
  expect(Math.abs(point!.yaw)+Math.abs(point!.pitch),`Aim converges on ${action}`).toBeLessThan(.04);
  return point!;
}

for(const destination of ['iss','moon'] as const)test(`full ${destination} journey: launch, physical science, recovery, report and restart`,async({page,browser},info)=>{
  test.setTimeout(1_080_000);
  page.setDefaultTimeout(12_000);
  const timeline:{label:string;state:Snapshot}[]=[],modes=new Set<string>(),errors:string[]=[],resourceFailures:string[]=[],interactions:unknown[]=[];
  const artifactLimitations:{label:string;reason:string}[]=[];
  const focusPauses:{elapsed:number;mode:string;visibility:string;focused:boolean}[]=[];
  let shotIndex=0,clockAdvances=0;
  const tick=async(n=1)=>{clockAdvances+=n;await advance(page,n);};
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/unable to compile effect|error compiling shader|INVALID_OPERATION|cannot merge meshes|WebGPU uncaptured error|validation error/i.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).hostname==='127.0.0.1')resourceFailures.push(`${response.status()} ${response.url()}`);});
  page.on('requestfailed',request=>resourceFailures.push(`${request.failure()?.errorText} ${request.url()}`));
  page.on('request',request=>{if(/\/api\/assistant|openai|cognitiveservices|azure\.com/i.test(request.url()))errors.push(`Unexpected model request: ${request.url()}`);});

  async function resumeFocusPause(){
    const pause=page.getByRole('dialog',{name:'pause',exact:true});
    if(!await pause.isVisible())return false;
    const current=await state(page),documentState=await page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus()}));
    focusPauses.push({elapsed:current.elapsed,mode:current.mode,...documentState});
    console.log(`[journey ${destination}] Browser focus pause at t=${current.elapsed.toFixed(1)}s; bringing the page forward and selecting Resume.`);
    expect(focusPauses.length,'Repeated browser focus loss prevents a stable journey').toBeLessThanOrEqual(12);
    await page.bringToFront();
    await pause.getByRole('button',{name:'Resume',exact:true}).click();
    await tick(2);
    await expect(pause).not.toBeVisible();
    return true;
  }

  async function record(label:string,snapshot?:Snapshot,capture=false){
    const current=snapshot??await state(page);timeline.push({label,state:current});
    console.log(`[journey ${destination}] ${label} | t=${current.elapsed.toFixed(1)}s | ${current.flightMode} | crew=${current.mode} | science=${current.science}%`);
    const name=`${String(++shotIndex).padStart(2,'0')}-${destination}-${label.replace(/[^a-z0-9-]/gi,'-')}`;
    await info.attach(name+'-telemetry',{body:JSON.stringify(current,null,2),contentType:'application/json'});
    if(!capture)return;
    const path=info.outputPath(name+'.png');
    // Screenshot compositing can wait for a frame while the test clock is
    // paused. Supply two ordinary application frames at these stable journey
    // milestones; do not change mission state or substitute rendered pixels.
    const pending=page.screenshot({path,timeout:12_000}).then(()=>({ok:true as const}),error=>({ok:false as const,error}));
    await tick(2);
    const result=await pending;
    if(result.ok){await info.attach(name,{path,contentType:'image/png'});return;}
    // Only capture timeout is an artifact limitation. Browser termination,
    // application errors, shader errors and functional assertions still fail.
    const error:unknown=result.error;
    if(!(error instanceof Error)||error.name!=='TimeoutError'||!error.message.includes('page.screenshot'))throw error;
    const limitation={label,reason:error.message};artifactLimitations.push(limitation);
    info.annotations.push({type:'artifact-limitation',description:`Screenshot timed out at ${label}; telemetry and remaining functional journey continue.`});
    console.log(`[journey ${destination}] SCREENSHOT UNAVAILABLE at ${label}: timed out; continuing functional checks.`);
    await info.attach(name+'-screenshot-unavailable',{body:JSON.stringify(limitation,null,2),contentType:'application/json'});
  }
  async function observe(snapshot:Snapshot){
    const key=`${snapshot.flightMode}-stage${snapshot.launchStage}-${snapshot.phase}`;
    if(!modes.has(key)){modes.add(key);await record(key,snapshot,snapshot.flightMode==='recovered');}
  }
  async function flyUntil(done:(snapshot:Snapshot)=>boolean,label:string,maxTicks=6500){
    await resumeFocusPause();
    await cursor(page,true);
    let previous=-1,stalled=0;
    for(let i=0;i<maxTicks;i++){
      if(await resumeFocusPause())await cursor(page,true);
      const snapshot=await state(page);await observe(snapshot);
      if(done(snapshot))return snapshot;
      expect(snapshot.ended,`${label}: ${snapshot.failureReason??snapshot.flightMode}`).toBe(false);
      expect(snapshot.elapsed,`${label}: finite elapsed time`).toBeLessThan(1_200_000);
      stalled=snapshot.elapsed===previous?stalled+1:0;previous=snapshot.elapsed;
      expect(stalled,`${label}: flight must progress, current mode ${snapshot.flightMode}`).toBeLessThan(150);
      if(snapshot.phase==='approach'&&!snapshot.autoPilot){await page.getByLabel('Enable approach assistance',{exact:true}).click();await tick();continue;}
      const fastest=Math.max(1,...snapshot.allowedWarp);
      if(fastest!==snapshot.warp){
        try{await page.getByLabel('Time speed',{exact:true}).selectOption(String(fastest),{timeout:1500});}
        catch(error){const current=await state(page);if(current.flightMode===snapshot.flightMode&&current.phase===snapshot.phase&&!current.ended)throw error;}
      }
      await tick();
    }
    throw new Error(`${label} exceeded ${maxTicks} clock advances: ${JSON.stringify(await state(page))}`);
  }
  async function operate(action:string){
    await resumeFocusPause();
    await cursor(page,false);await blurField(page);await tick(2);
    let point=await aim(page,action,resumeFocusPause),bestDistance=point.distance,stalled=0;
    async function approachEvidence(stage:string,attempt:number){
      const current=await state(page),focus=await page.evaluate(()=>(window as any).spaceScene.getInteraction());
      const evidence={action,stage,attempt,target:point,focus,current};
      interactions.push(evidence);
      console.log(`[journey ${destination}] ${action} ${stage} #${attempt}: target=${point.id}, distance=${point.distance.toFixed(3)}m / reach=${point.reach}m, avatar=${JSON.stringify(current.avatarPosition)}, t=${current.elapsed.toFixed(1)}s, focus=${focus?.action??'none'}`);
      await info.attach(`${destination}-${action.replace(/[^a-z0-9-]/gi,'-')}-${stage}-${attempt}`,{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
    }
    await approachEvidence('initial-target',0);
    for(let i=0;i<140&&point.distance>Math.min(1.75,point.reach-.2);i++){
      await resumeFocusPause();
      const reachable=await page.evaluate(()=>(window as any).spaceScene.getInteraction());
      if(point.distance<=point.reach&&reachable?.action===action&&reachable.enabled)break;
      const current=await state(page);expect(current.mode,`Must be unrestrained to walk to ${action}`).not.toBe('seated');
      await page.keyboard.down('w');try{await tick(current.mode==='station'?5:3);}finally{await page.keyboard.up('w');}
      if(current.mode==='station'){await page.keyboard.down('x');try{await tick(4);}finally{await page.keyboard.up('x');}}
      point=await aim(page,action,resumeFocusPause);
      if(point.distance<bestDistance-.01){bestDistance=point.distance;stalled=0;}else stalled++;
      if(stalled>=12){
        await approachEvidence('stalled',i+1);
        throw new Error(`Physical approach to ${action} made less than 1 cm progress over 12 movement attempts; current target and crew telemetry are attached.`);
      }
      if((i+1)%10===0)await approachEvidence('approaching',i+1);
    }
    point=await aim(page,action,resumeFocusPause);
    // A visible/reachable target may still be obstructed. Do not bypass the
    // normal picking ray, collision checks or application action validation.
    const focus=await page.evaluate(()=>(window as any).spaceScene.getInteraction());
    interactions.push({action,target:point,focus,before:await state(page)});
    expect(point.distance,`Reach ${action}`).toBeLessThanOrEqual(point.reach);
    expect(focus?.action,`Unobstructed physical focus for ${action}`).toBe(action);
    expect(focus?.enabled,`${action} must be enabled`).toBe(true);
    await expect(page.locator('.interaction-prompt')).toContainText(point.label);
    await page.keyboard.press('e');await tick(3);await record(action,undefined,action==='exit-worksite');
  }

  try{
    await page.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'low',sensitivity:1,voice:false,sound:false,beginnerPauses:false})));
    await page.clock.install();await page.goto('/');
    await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeEnabled({timeout:120_000});
    // Stop unrequested background frames while the harness inspects telemetry
    // or saves screenshots. All subsequent flight/avatar motion still runs in
    // the normal application callbacks, advanced in explicit 200 ms chunks.
    // A near-future instant avoids a timestamp race with the running clock.
    await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60_000));
    await page.getByRole('button',{name:destination==='iss'?'ISS':'Moon',exact:true}).click();
    await page.getByLabel('Start location',{exact:true}).selectOption('pad');
    await page.getByLabel('Difficulty',{exact:true}).selectOption('commander');
    await page.getByRole('button',{name:'Start flight',exact:true}).click();await expect(page.locator('.flight-status')).toBeVisible();await tick(3);
    const initial=await state(page);expect(initial.elapsed).toBe(0);expect(initial.flightMode).toBe('pad');await record('initial-launchpad',initial,true);
    await cursor(page,true);await page.getByRole('button',{name:/Start countdown/}).click();
    const arrived=await flyUntil(s=>s.phase==='science','Outbound journey');
    expect(arrived.flightMode).toBe(destination==='iss'?'docked':'surface');expect(arrived.canUnstrap).toBe(true);
    expect(arrived.elapsed).toBeGreaterThan(destination==='moon'?2*86400:1000);
    expect(arrived.science).toBe(0);expect(arrived.completedActivities).toEqual([]);

    await cursor(page,false);await blurField(page);await page.keyboard.press('f');await tick(3);expect((await state(page)).mode).toBe('cabin');
    await operate('exit-worksite');expect((await state(page)).mode).toBe(destination==='moon'?'eva':'station');
    for(const [index,action]of actions[destination].entries()){
      await operate('activity:'+action);const completed=await state(page);
      expect(completed.science,`Physical task ${action}`).toBe((index+1)*25);expect(completed.completedActivities).toContain(action);
      if(completed.event&&!completed.eventResolved){await operate('resolve');expect((await state(page)).eventResolved).toBe(true);}
    }
    expect((await state(page)).dataStoredMb).toBe(destination==='iss'?48:32);
    await operate('board');expect((await state(page)).mode).toBe('cabin');
    await blurField(page);await page.keyboard.press('f');await tick(3);const seated=await state(page);expect(seated.mode).toBe('seated');expect(seated.crewSeated).toBe(true);await record('crew-secured-for-return',seated,true);
    await cursor(page,true);await page.getByRole('button',{name:/Prepare return/}).click();
    const recovered=await flyUntil(s=>s.ended,'Return journey');
    expect(recovered.success,recovered.failureReason??'Mission must succeed').toBe(true);expect(recovered.flightMode).toBe('recovered');expect(recovered.parachuteDeployed).toBe(true);expect(recovered.groundSpeed).toBeLessThan(15);
    expect(recovered.completedActivities).toEqual([...actions[destination]]);expect(recovered.science).toBe(100);
    expect([...modes].some(mode=>mode.startsWith('entry-'))).toBe(true);
    await expect(page.getByRole('dialog',{name:'Flight result'})).toBeVisible();await expect(page.getByRole('heading',{name:'Mission complete',exact:true})).toBeVisible();
    const downloadPromise=page.waitForEvent('download',{timeout:12_000});await page.getByRole('button',{name:'Export flight report',exact:true}).click();const download=await downloadPromise;
    const reportPath=info.outputPath(`${destination}-completed-flight-report.json`);await download.saveAs(reportPath);await info.attach('completed-flight-report',{path:reportPath,contentType:'application/json'});
    const report=JSON.parse(await readFile(reportPath,'utf8'));expect(report.mission.destination).toBe(destination);expect(report.mission.startMode).toBe('pad');expect(report.success).toBe(true);expect(report.science).toBe(100);expect(report.dataRecoveredMb).toBe(destination==='iss'?48:32);expect(report.elapsedSeconds).toBe(recovered.elapsed);expect(report.flightRecord).toContain('Recovery confirmed.');
    await page.getByRole('button',{name:'Fly again',exact:true}).click();await expect(page.locator('.flight-status')).toBeVisible();await tick(3);
    const restarted=await state(page);expect(restarted.elapsed).toBe(0);expect(restarted.flightMode).toBe('pad');expect(restarted.science).toBe(0);expect(restarted.dataStoredMb).toBe(0);expect(restarted.completedActivities).toEqual([]);expect(restarted.ended).toBe(false);await record('restart-confirmed',restarted,true);
    expect(errors,'Application and rendering errors').toEqual([]);expect(resourceFailures,'Failed runtime resources').toEqual([]);
  }finally{
    await info.attach('journey-evidence',{body:JSON.stringify({destination,start:'pad',browser:browser.version(),quality:'low',viewport:{width:800,height:600},reducedMotion:'CSS animation preference only',clock:'Paused between explicit Playwright clock advances in 200 ms chunks, plus user-visible simulation time acceleration. Selected milestone captures permit two ordinary 200 ms application frames while compositing.',recordedFlightLoopClockAdvances:clockAdvances,screenshotPolicy:'Initial launchpad, physical worksite entry, crew secured, recovery and restart only. Screenshot timeouts are explicitly recorded and do not stand in for visual acceptance.',artifactLimitations,focusPauses,limitations:'Assisted scripted UI operation at low graphics; high graphics captures are separate. Target geometry and telemetry read only. No direct state injection. Visible focus-loss pauses are resumed through the actual Resume button. No FPS, audible-output, hardware-acceleration or unaided-usability claim.',timeline,interactions,errors,resourceFailures},null,2),contentType:'application/json'});
  }
});
