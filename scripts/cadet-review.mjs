import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=d3d11']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'high',voice:false,sound:false,sensitivity:1,beginnerPauses:false})));
 await page.clock.install();await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Start flight',exact:true}).waitFor({timeout:120000});
 await page.getByRole('button',{name:'Moon',exact:true}).click();await page.getByLabel('Start location').selectOption('approach');await page.getByLabel('Difficulty').selectOption('cadet');await page.getByRole('button',{name:'Start flight',exact:true}).click();
 await page.keyboard.press('n');await page.keyboard.press('Tab');await page.getByLabel('Time speed').selectOption('10');
 for(let i=0;i<1200;i++){await page.clock.fastForward(200);if(await page.locator('.flight-status').textContent().then(t=>t.startsWith('Science')))break;}
 await page.keyboard.press('Tab');await page.keyboard.press('f');await page.clock.fastForward(200);
 await page.screenshot({path:'.local/cadet-lunar-hatch-guide.png'});
 // Follow only the visible screen marker, without reading 3D hotspot coordinates.
 async function follow(label){
  for(let i=0;i<70;i++){
   const marker=page.locator('.objective-marker');await marker.waitFor();const box=await marker.boundingBox();
   assert.ok(box.x>=0&&box.x+box.width<=1440,'Objective label remains inside the screen');
   if(await page.locator('.interaction-prompt').count() && (await page.locator('.interaction-prompt').innerText()).includes(label)){await page.keyboard.press('e');await page.clock.fastForward(250);return;}
   const offscreen=(await marker.getAttribute('class')).includes('offscreen');
   const dx=box.x+box.width/2-720,dy=box.y+box.height/2-450;
   await page.evaluate(({x,y})=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:x,movementY:y})),{x:Math.max(-140,Math.min(140,dx*.40)),y:Math.max(-100,Math.min(100,dy*.40))});
   await page.clock.fastForward(200);
   if(!offscreen&&Math.abs(dx)<90&&Math.abs(dy)<120&&label==='Seismometer'){await page.keyboard.down('w');await page.clock.fastForward(200);await page.keyboard.up('w');}
  }
  throw new Error('Could not reach '+label+' using the visible marker');
 }
 await follow('Forward hatch');await page.screenshot({path:'.local/cadet-lunar-first-task.png'});
 await follow('Seismometer');await page.screenshot({path:'.local/cadet-lunar-next-task.png'});
 assert.match(await page.locator('.current-objective').innerText(),/sample/i);
 console.log('Cadet hatch and first experiment reached using only screen guidance.');
}finally{await browser.close();}
