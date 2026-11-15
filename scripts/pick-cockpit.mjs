import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=d3d11']});
try {
const page=await browser.newPage({viewport:{width:1440,height:900}});
await page.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'high',voice:false,sound:false,sensitivity:1,beginnerPauses:false})));
await page.clock.install();await page.goto('http://127.0.0.1:5174');
await page.getByRole('button',{name:'Start flight',exact:true}).waitFor({timeout:120000});
await page.getByLabel('Start location').selectOption('pad');await page.getByRole('button',{name:'Start flight',exact:true}).click();
await page.clock.fastForward(200);
await page.evaluate(()=>{const s=window.spaceScene,a=s.astronaut;a.setSeat(a.seatPosition.clone().set(-.55,1.78,-.82),a.seatOrientation.clone());for(const m of s.scene.meshes)if(m.name.startsWith('live-'))m.setEnabled(false);});
await page.keyboard.press('v');await page.clock.fastForward(200);await page.waitForTimeout(300);
await page.screenshot({path:'.local/v3-instrument-picking.png'});await page.screenshot({path:'.local/v3-dsky-picking.png',clip:{x:895,y:420,width:320,height:240}});
const points=[['FDAI',1063,300],['DSKY-center',1109,535],['DSKY-TL',1084,465],['DSKY-TR',1150,465],['DSKY-BL',1070,606],['DSKY-BR',1140,606],['FDAI-L',998,300],['FDAI-R',1128,300],['FDAI-T',1063,232],['FDAI-B',1063,368]];
console.log(JSON.stringify(await page.evaluate(points=>{const s=window.spaceScene,inv=s.cockpit.getWorldMatrix().clone().invert(),scale=s.engine.getHardwareScalingLevel();return points.map(([name,x,y])=>{const hit=s.scene.pick(x/scale,y/scale,m=>m.isDescendantOf(s.cockpit)&&!m.name.startsWith('live-'),false,s.camera);if(!hit?.pickedPoint)return {name,hit:false};const V=hit.pickedPoint.constructor;return{name,point:V.TransformCoordinates(hit.pickedPoint,inv).asArray(),normal:V.TransformNormal(hit.getNormal(true,true),inv).normalize().asArray(),mesh:hit.pickedMesh.name};});},points),null,2));
}finally{await browser.close();}
