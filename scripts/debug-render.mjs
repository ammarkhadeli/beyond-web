import { chromium } from '@playwright/test';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=d3d11']});
try {
 const p=await browser.newPage({viewport:{width:1280,height:800}});
 let logged=0; p.on('console',m=>{if((m.type()==='error'||m.type()==='warning')&&logged++<8)console.log(m.type(),m.text().slice(0,250));});
 p.on('pageerror',e=>console.log('ERROR',e.message));
 await p.goto('http://127.0.0.1:5174');
 await p.waitForTimeout(7000);
 console.log('BODY',(await p.locator('body').innerText()).slice(0,700));
 console.log('DIAGNOSTIC',await p.evaluate(()=>{
 const s=window.spaceScene?.scene;
 return s ? {ready:s.isReady(),pending:s._pendingData.map(x=>x.url||x.name||x.constructor.name),errors:s.materials.map(m=>({name:m.name,error:m.getEffect()?.getCompilationError()})).filter(x=>x.error)} : 'no scene';
 }));
 await p.screenshot({path:'.local/render-diagnostic.png'});
}finally{await browser.close();}
