import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const destination=process.argv[2]||'moon';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/unable to compile|error compiling|INVALID_OPERATION/i.test(m.text()))errors.push(m.text().slice(0,200));});
 await page.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'high',voice:false,sound:false,sensitivity:1,beginnerPauses:false})));
 await page.clock.install();await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Start flight',exact:true}).waitFor({timeout:120000});
 await page.getByRole('button',{name:destination==='moon'?'Moon':'ISS',exact:true}).click();await page.getByLabel('Start location').selectOption('pad');await page.getByLabel('Difficulty').selectOption('commander');await page.getByRole('button',{name:'Start flight',exact:true}).click();
 await page.keyboard.press('c');await page.keyboard.press('Tab');await page.getByRole('button',{name:/Start countdown/}).click();
 const state=()=>page.evaluate(()=>{const r=window.spaceScene,s=r.lastState;return{mode:s.flightMode,phase:s.phase,stage:s.launchStage,t:s.elapsed,alt:s.altitude,ended:s.ended,failure:s.failureReason,throttle:s.throttle,auto:s.autoPilot,earthRange:r.earth.position.length(),moonRange:r.moonGlobe.mesh.position.length()};});
 const capture=async name=>{await page.screenshot({path:`.local/trajectory-${destination}-${name}.png`});console.log(name,await state());};
 let previous='',stage=0;
 for(let i=0;i<6000;i++){
  const s=await state();if(s.ended)throw new Error(s.failure||'Unexpected flight termination');
  if(s.phase==='science'){await capture('arrived');break;}
  if(s.mode!==previous){previous=s.mode;await capture(s.mode);if(['parking','translunar','lunar-orbit'].includes(s.mode)){await page.keyboard.press('m');await page.clock.fastForward(200);await capture(s.mode+'-map');await page.keyboard.press('m');await page.keyboard.press('c');}}
  if(s.stage!==stage&&s.t>30){stage=s.stage;await capture('stage-'+s.stage);}
  if(s.phase==='approach'&&!s.auto)await page.getByLabel('Enable approach assistance').click();
  const values=await page.getByLabel('Time speed').locator('option').evaluateAll(xs=>xs.map(o=>Number(o.value)));await page.getByLabel('Time speed').selectOption(String(Math.max(...values)));await page.clock.fastForward(200);
 }
 assert.equal((await state()).phase,'science');assert.deepEqual(errors,[]);console.log('CONTINUOUS ROUTE PASSED',destination);
}finally{await browser.close();}
