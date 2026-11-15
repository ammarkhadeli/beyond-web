import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Public planner, keyboard and debrief controls only. Telemetry is read only;
// no flight, physics, resource, avatar or camera state is assigned by these tests.
// ISS tests an intentional prelaunch abort, because the training simulation
// does not model station collision damage. Moon tests an unsafe manual descent.
test.use({viewport:{width:800,height:600},deviceScaleFactor:1,reducedMotion:'reduce',screenshot:'only-on-failure'});

async function telemetry(page:Page){
  return page.evaluate(()=>{
    const world=(window as any).spaceScene,s=world?.lastState;
    if(!s)throw new Error('Flight telemetry unavailable');
    return {destination:s.plan.destination,difficulty:s.plan.difficulty,startMode:s.plan.startMode,
      phase:s.phase,flightMode:s.flightMode,elapsed:s.elapsed,ended:s.ended,success:s.success,
      failureReason:s.failureReason,science:s.science,dataStoredMb:s.dataStoredMb,
      completedActivities:[...s.completedActivities],fuel:s.fuel,power:s.power,
      altitude:s.altitude,verticalSpeed:s.verticalSpeed,throttle:s.throttle,autoPilot:s.autoPilot,
      mode:world.astronaut.mode,log:[...s.log]};
  });
}

for(const destination of ['iss','moon'] as const){
  const scenario=destination==='iss'?'ISS prelaunch abort':'Moon expert manual descent impact';
  test(`${scenario}: explained failure, exported report and fresh restart`,async({page,browser},info)=>{
    test.setTimeout(240_000);
    page.setDefaultTimeout(12_000);
    const errors:string[]=[],resourceFailures:string[]=[],timeline:unknown[]=[],artifactLimitations:string[]=[];
    let focusResumes=0,clockAdvances=0;
    const advance=async(n=1)=>{for(let i=0;i<n;i++){clockAdvances++;await page.clock.fastForward(200);}};
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(/unable to compile effect|error compiling shader|INVALID_OPERATION|cannot merge meshes|WebGPU uncaptured error|validation error/i.test(message.text()))errors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).hostname==='127.0.0.1')resourceFailures.push(`${response.status()} ${response.url()}`);});
    page.on('requestfailed',request=>resourceFailures.push(`${request.failure()?.errorText} ${request.url()}`));
    page.on('request',request=>{if(/\/api\/assistant|openai|cognitiveservices|azure\.com/i.test(request.url()))errors.push(`Unexpected model request: ${request.url()}`);});
    async function resumeFocusPause(){
      const pause=page.getByRole('dialog',{name:'pause',exact:true});
      if(!await pause.isVisible())return;
      expect(++focusResumes,'Repeated browser focus loss prevents a stable failure check').toBeLessThanOrEqual(6);
      console.log(`[failure ${destination}] Browser focus pause; selecting the actual Resume button.`);
      await page.bringToFront();await pause.getByRole('button',{name:'Resume',exact:true}).click();await advance(2);
      await expect(pause).not.toBeVisible();
    }
    async function record(label:string){
      const state=await telemetry(page);timeline.push({label,state});
      console.log(`[failure ${destination}] ${label} | t=${state.elapsed.toFixed(2)}s | ${state.flightMode} | reason=${state.failureReason??'none'}`);
      await info.attach(`${destination}-${label}`,{body:JSON.stringify(state,null,2),contentType:'application/json'});
      return state;
    }
    try{
      await page.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'low',sensitivity:1,voice:false,sound:false,beginnerPauses:false})));
      await page.clock.install();await page.goto('/');
      await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeEnabled({timeout:120_000});
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60_000));
      await page.getByRole('navigation',{name:'Mission planning'}).getByRole('button',{name:/Mission/}).click();
      await page.getByRole('button',{name:destination==='iss'?'ISS':'Moon',exact:true}).click();
      await page.getByLabel('Start location',{exact:true}).selectOption(destination==='iss'?'pad':'approach');
      await page.getByLabel('Difficulty',{exact:true}).selectOption('expert');
      await page.getByRole('button',{name:'Start flight',exact:true}).click();await advance(2);
      const initial=await record('initial-condition');
      expect(initial.autoPilot).toBe(false);expect(initial.ended).toBe(false);expect(initial.science).toBe(0);
      if(destination==='iss'){
        // A safe pad abort is an unsuccessful science mission, with a clear
        // explanation. It does not pretend to demonstrate collision damage.
        await page.keyboard.press('Escape');
        const pause=page.getByRole('dialog',{name:'pause',exact:true});await expect(pause).toBeVisible();
        await pause.getByRole('button',{name:'Abort and return',exact:true}).click();await advance(2);
      }else{
        await resumeFocusPause();
        if(!(await page.locator('.cursor-hint').innerText()).includes('Look')){await page.keyboard.press('Tab');await advance(2);}
        await page.getByLabel('Time speed',{exact:true}).selectOption('10');
        await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
        // S is the documented throttle-decrease control. The engine reaches
        // zero thrust and lunar gravity causes the unsafe surface impact.
        try{
          for(let i=0;i<600;i++){
            const current=await telemetry(page);if(current.ended)break;
            expect(current.elapsed,'Unsafe descent must conclude within two simulated minutes').toBeLessThan(120);
            expect(current.autoPilot,'The failure must remain manually flown').toBe(false);
            await resumeFocusPause();await page.keyboard.down('s');await advance();
          }
        }finally{await page.keyboard.up('s');}
      }
      const failed=await record('explained-failure');
      const expectedReason=destination==='iss'?'Crew recovered. The science objective was not completed.':'Lunar surface impact.';
      expect(failed.ended).toBe(true);expect(failed.success).toBe(false);expect(failed.science).toBe(0);
      expect(failed.failureReason).toBe(expectedReason);expect(failed.elapsed).toBeLessThan(120);
      const debrief=page.getByRole('dialog',{name:'Flight result',exact:true});
      await expect(debrief).toBeVisible();await expect(debrief.getByRole('heading',{name:'Flight ended',exact:true})).toBeVisible();
      await expect(debrief.getByText(expectedReason,{exact:true}).first()).toBeVisible();
      const screenshotPath=info.outputPath(`${destination}-failure-debrief.png`);
      const capture=page.screenshot({path:screenshotPath,timeout:8_000}).then(()=>({ok:true as const}),error=>({ok:false as const,error}));
      await advance(2);const screenshot=await capture;
      if(screenshot.ok)await info.attach('failure-debrief',{path:screenshotPath,contentType:'image/png'});
      else{
        const error:unknown=screenshot.error;
        if(!(error instanceof Error)||error.name!=='TimeoutError'||!error.message.includes('page.screenshot'))throw error;
        artifactLimitations.push(error.message);info.annotations.push({type:'artifact-limitation',description:'Failure screenshot timed out; visible debrief assertions and telemetry remain available.'});
      }
      const pendingDownload=page.waitForEvent('download');
      await debrief.getByRole('button',{name:'Export flight report',exact:true}).click();const download=await pendingDownload;
      const reportPath=info.outputPath(`${destination}-failure-report.json`);await download.saveAs(reportPath);
      await info.attach('failure-report',{path:reportPath,contentType:'application/json'});
      const report=JSON.parse(await readFile(reportPath,'utf8'));
      expect(report.mission.destination).toBe(destination);expect(report.mission.startMode).toBe(initial.startMode);
      expect(report.success).toBe(false);expect(report.reason).toBe(expectedReason);expect(report.science).toBe(0);expect(report.dataRecoveredMb).toBe(0);
      await debrief.getByRole('button',{name:'Fly again',exact:true}).click();await advance(2);
      await expect(debrief).not.toBeVisible();await expect(page.locator('.flight-status')).toBeVisible();
      const restarted=await record('fresh-restart');
      expect(restarted.ended).toBe(false);expect(restarted.success).toBe(false);expect(restarted.failureReason).toBeNull();
      expect(restarted.elapsed).toBeLessThan(1);await expect(page.locator('.mission-clock')).toHaveText('00:00:00');
      expect(restarted.startMode).toBe(initial.startMode);expect(restarted.flightMode).toBe(initial.flightMode);
      expect(restarted.science).toBe(0);expect(restarted.dataStoredMb).toBe(0);expect(restarted.completedActivities).toEqual([]);
      expect(restarted.mode).toBe('seated');expect(restarted.autoPilot).toBe(false);
      if(destination==='moon'){expect(restarted.altitude).toBeGreaterThan(150);expect(restarted.throttle).toBeGreaterThan(.4);}
      expect(errors,'Application and rendering errors').toEqual([]);expect(resourceFailures,'Failed runtime resources').toEqual([]);
    }finally{
      await info.attach('failure-evidence',{body:JSON.stringify({scenario,destination,browser:browser.version(),quality:'low',viewport:{width:800,height:600},clock:'Playwright clock paused after menu assets are ready, then advanced by 200 ms through normal application callbacks. Moon uses the visible 10× time-speed control, automatically limited by the application near the surface.',clockAdvances,focusResumes,timeline,artifactLimitations,errors,resourceFailures,limitations:'Scripted UI failure and restart verification. No mission-state injection, station-collision claim, frame-rate claim or audio-output claim.'},null,2),contentType:'application/json'});
    }
  });
}
