import {chromium} from '@playwright/test';
const browser=await chromium.launch(process.platform==='win32'?{executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=d3d11']}:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
const p=await browser.newPage({viewport:{width:1280,height:800}});
p.on('pageerror',e=>console.log('ERROR',e.message));
await p.addInitScript(()=>localStorage.setItem('beyond-v2-settings',JSON.stringify({quality:'high',voice:false,sound:false,sensitivity:1,beginnerPauses:false})));
await p.route('**/api/health',r=>r.fulfill({contentType:'application/json',body:'{"aiConfigured":false}'}));
await p.goto('http://127.0.0.1:5174');
await p.getByRole('button',{name:'Start flight',exact:true}).waitFor({timeout:90000});
await p.screenshot({path:`.local/v2-${process.platform}-setup.png`});console.log('SETUP');
await p.getByLabel('Difficulty').selectOption('commander');
await p.getByRole('button',{name:'Start flight',exact:true}).click();await p.waitForTimeout(700);
await p.keyboard.press('v');await p.waitForTimeout(500);
await p.screenshot({path:`.local/v2-${process.platform}-cockpit.png`});console.log('CENTERED');
await p.keyboard.press('c');await p.waitForTimeout(500);await p.screenshot({path:`.local/v2-${process.platform}-external.png`});console.log('EXTERNAL');
}finally{await browser.close();}
