import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const destination=process.argv[2]||'iss';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('ERROR',e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text().slice(0,200));console.log(m.text().slice(0,140));}});
 await page.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'high',voice:false,sound:false,sensitivity:1,beginnerPauses:false})));
 await page.clock.install();await page.goto('http://127.0.0.1:5174');
 await page.getByRole('button',{name:'Start flight',exact:true}).waitFor({timeout:120000});
 await page.getByRole('button',{name:destination==='moon'?'Moon':'ISS',exact:true}).click();await page.getByLabel('Start location').selectOption('approach');await page.getByLabel('Difficulty').selectOption('commander');
 await page.getByRole('button',{name:'Start flight',exact:true}).click();
 const advance=async(n=1)=>{for(let i=0;i<n;i++)await page.clock.fastForward(200);};
 const status=()=>page.evaluate(()=>{const s=window.spaceScene;return{mode:s.astronaut.mode,phase:s.lastState.phase,flightMode:s.lastState.flightMode,science:s.lastState.science,event:s.lastState.event,resolved:s.lastState.eventResolved,ended:s.lastState.ended,reason:s.lastState.failureReason,success:s.lastState.success,pos:s.astronaut.localPosition.asArray(),focus:s.getInteraction()};});
 const shot=async name=>{await advance(2);await page.waitForTimeout(250);await page.screenshot({path:`.local/v3-${destination}-${name}.png`});console.log(name,await status());};
 await advance(3);await page.keyboard.press('n');await page.keyboard.press('Tab');await page.getByLabel('Time speed').selectOption('10');
 for(let i=0;i<1800;i++){await advance();const s=await status();if(s.phase==='science'||s.ended)break;}
 await shot('arrived');await page.keyboard.press('Tab');await page.keyboard.press('f');await advance(3);await shot('unstrapped');
 const target=async action=>page.evaluate(action=>{const s=window.spaceScene,zone=[...s.interactions.zones.values()].find(z=>z.action===action&&z.parent.isEnabled());if(!zone)return null;const V=s.camera.position.constructor,p=V.TransformCoordinates(zone.position,zone.parent.computeWorldMatrix(true));const d=V.TransformNormal(p.subtract(s.camera.position),s.camera.getViewMatrix());return{id:zone.id,distance:p.subtract(s.camera.position).length(),yaw:Math.atan2(d.x,d.z),pitch:Math.atan2(-d.y,Math.hypot(d.x,d.z)),reach:zone.reach,enabled:zone.enabled(),world:p.asArray()};},action);
 const aim=async action=>{
  for(let i=0;i<10;i++){const t=await target(action);if(!t)throw new Error('Missing target '+action);if(Math.abs(t.yaw)+Math.abs(t.pitch)<.025)break;await page.evaluate(({yaw,pitch})=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:yaw/.0018,movementY:pitch/.0018})),t);await advance(2);}
  return target(action);
 };
 const operate=async action=>{
   let t=await aim(action);console.log('target',action,t);
   const s=await status();
   if(['eva','station'].includes(s.mode)){
    for(let i=0;t&&t.distance>Math.min(1.8,t.reach-.2)&&i<160;i++){
     await page.keyboard.down('w');await advance(2);await page.keyboard.up('w');
     t=await aim(action);
    }
    if(s.mode==='station'){await page.keyboard.down('x');await advance(8);await page.keyboard.up('x');}
   }
   await aim(action);await advance(2);console.log('focus',await status());
   await page.keyboard.press('e');await advance(3);
 };
 await operate('exit-worksite');await shot('worksite');assert.equal((await status()).mode,destination==='moon'?'eva':'station');
 await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:0,movementY:600})));await shot('suited-body');await page.keyboard.press('v');await page.keyboard.press('c');await shot('astronaut-external');await page.keyboard.press('c');await page.keyboard.press('v');
 if(process.argv.includes('--visual-only')){assert.deepEqual(errors,[]);console.log('Worksite visual capture passed',destination);} else {
 const tasks=destination==='moon'?['deploy-seismometer','collect-sample','record-panorama','stow-samples']:['install-sample','power-experiment','record-observation','stow-results'];
 for(const [i,task] of tasks.entries()){await operate('activity:'+task);await shot(task);const s=await status();assert.equal(s.science,(i+1)*25,task+' must physically complete');if(s.event&&!s.resolved){await operate('resolve');await shot('fault-resolved');assert.equal((await status()).resolved,true);}}
 await operate('board');await page.keyboard.press('f');await advance(3);await shot('back-in-seat');
 assert.equal((await status()).mode,'seated');
 await page.keyboard.press('Tab');await page.getByRole('button',{name:/Prepare return/}).click();
 for(let i=0;i<3000&&!(await status()).ended;i++){const values=await page.getByLabel('Time speed').locator('option').evaluateAll(xs=>xs.map(o=>Number(o.value)));await page.getByLabel('Time speed').selectOption(String(Math.max(...values)));await advance();}
 await shot('recovered');assert.equal((await status()).success,true);
 assert.deepEqual(errors,[],'No application or render errors');console.log('FINAL',await status());
 }
} catch(e){console.log('FAILED',e.message);throw e;} finally{await browser.close();}
