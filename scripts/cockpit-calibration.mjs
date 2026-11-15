import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=d3d11']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>console.log('ERROR',e.message));
 await page.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'high',voice:false,sound:false,sensitivity:1,beginnerPauses:false})));
 await page.clock.install();await page.goto('http://127.0.0.1:5174');
 await page.getByRole('button',{name:'Start flight',exact:true}).waitFor({timeout:120000});
 await page.getByLabel('Start location').selectOption('pad');await page.getByRole('button',{name:'Start flight',exact:true}).click();
 await page.clock.fastForward(200);await page.clock.fastForward(200);
 for(const [name,pos] of [['base',null],['eye-forward',[-.55,1.78,-.82]],['eye-upper',[-.55,1.86,-.75]]]){
   if(pos)await page.evaluate(p=>{const a=window.spaceScene.astronaut;a.setSeat(a.seatPosition.clone().set(...p),a.seatOrientation.clone());},pos);
   await page.keyboard.press('v');await page.clock.fastForward(200);await page.waitForTimeout(300);
   await page.screenshot({path:`.local/v3-cabin-${name}.png`});
   await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:420,movementY:0})));
   await page.clock.fastForward(200);await page.waitForTimeout(300);await page.screenshot({path:`.local/v3-cabin-${name}-right.png`});
   console.log(name);
 }
} finally {await browser.close();}
