import {test, expect, type Page, type Route} from '@playwright/test';

// Browser regression suite. Collection can run without a GPU; execution requires
// a running preview and Chromium OS dependencies. Never treat collection as a pass.
test.use({viewport:{width:1120,height:700},reducedMotion:'reduce',screenshot:'only-on-failure'});

const settings = {quality:'low', sensitivity:1, voice:false, sound:false, beginnerPauses:false};
const errors = new WeakMap<Page,string[]>();
const requests = new WeakMap<Page,string[]>();
test.beforeEach(async ({page}) => {
  errors.set(page,[]); requests.set(page,[]);
  page.on('pageerror', e => errors.get(page)!.push(e.message));
  page.on('console', m => {if (/unable to compile effect|error compiling shader|INVALID_OPERATION|cannot merge meshes|WebGPU uncaptured error|validation error/i.test(m.text())) errors.get(page)!.push(m.text());});
  page.on('request', r => {if (/\/api\/assistant|openai|cognitiveservices|azure\.com/i.test(r.url())) requests.get(page)!.push(r.url());});
});
test.afterEach(async ({page}) => {
  expect(errors.get(page), 'Render and application errors').toEqual([]);
  expect(requests.get(page), 'Gameplay never calls an AI service').toEqual([]);
});
async function open(page:Page, beginnerPauses=false, path='/') {
  await page.addInitScript(s => { if (!localStorage.getItem('beyond-v2-settings')) localStorage.setItem('beyond-v2-settings',JSON.stringify(s)); },{...settings,beginnerPauses});
  await page.clock.install();
  await page.goto(path);
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeEnabled({timeout:120_000});
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Keep rendering deterministic between explicit clock advances. This avoids
  // spending software-renderer time on idle frames during UI assertions.
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+60_000));
}
async function plannerTab(page:Page, name:'Mission'|'Vehicle'|'Launch') {
  await page.getByRole('navigation',{name:'Mission planning'}).getByRole('button',{name:new RegExp(name)}).click();
}
async function begin(page:Page,destination:'ISS'|'Moon'='ISS',start='pad',difficulty='commander') {
  await plannerTab(page,'Mission');
  await page.getByRole('button',{name:destination,exact:true}).click();
  await page.getByLabel('Start location').selectOption(start);
  await page.getByLabel('Difficulty').selectOption(difficulty);
  await page.getByRole('button',{name:'Start flight',exact:true}).click();
  await expect(page.locator('.flight-status')).toBeVisible();
}
async function advance(page:Page,seconds:number) {for(let n=0;n<Math.ceil(seconds*5);n++)await page.clock.fastForward(200);}
async function cursor(page:Page) {
  if ((await page.locator('.cursor-hint').innerText()).includes('Look')) return;
  await page.keyboard.press('Tab');
}
const phase=(page:Page)=>page.locator('.flight-status > span').first();
const clock=(page:Page)=>page.locator('.mission-clock');

test('selected cabin loads; mouse head turn, recenter and both camera views remain live',async({page})=>{
  await open(page);await begin(page);
  await advance(page,.8);
  const pose=()=>page.evaluate(()=>{const c=(window as any).spaceScene.camera;return {q:c.rotationQuaternion?.asArray(),p:c.position.asArray()};});
  const initial=await pose();
  await page.locator('#space-canvas').dispatchEvent('mousemove',{movementX:350,movementY:80});
  await advance(page,.4);const looked=await pose();
  expect(looked.q).not.toEqual(initial.q);
  await page.keyboard.press('v');await advance(page,.4);const centered=await pose();
  expect(centered.q).toEqual(initial.q);
  await page.keyboard.press('c');await advance(page,.4);
  await expect(page.getByLabel('Switch camera')).toContainText('External');
  expect((await pose()).p).not.toEqual(initial.p);
  await expect(page.locator('.external-readouts')).toContainText('0.0 m/s');
  await page.keyboard.press('m');await advance(page,.4);
  await expect(page.getByLabel('Switch camera')).toContainText('Trajectory');
  await expect(page.locator('.navigation-range')).toContainText('Station range');
  expect(await page.evaluate(()=>(window as any).spaceScene.scene.getMeshByName('ISS target position').isEnabled())).toBe(true);
  await page.keyboard.press('m');await advance(page,.4);
  await expect(page.getByLabel('Switch camera')).toContainText('Cockpit');
  await expect(page.getByLabel('Flight controls')).toBeVisible();
  await expect(page.locator('input,textarea')).toHaveCount(0);
});

test('launch runs at one second per second; countdown and pause preserve state',async({page})=>{
  await open(page);await begin(page);await cursor(page);
  await page.getByRole('button',{name:/Start countdown/}).click();
  await advance(page,1);
  expect(await page.evaluate(()=>(window as any).spaceScene.lastState.elapsed)).toBeCloseTo(1,1);
  // The HUD publishes at 10 Hz and floors whole seconds. Allow one update
  // after the exact boundary, without weakening the elapsed-time assertion.
  await advance(page,.2);
  await expect(clock(page)).toHaveText('00:00:01');
  await expect(page.getByLabel('Time speed')).toHaveValue('1');
  await page.getByLabel('Pause',{exact:true}).click();
  const frozen=await clock(page).innerText();
  await advance(page,4);await expect(clock(page)).toHaveText(frozen);
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  await advance(page,11);await cursor(page);
  await expect(phase(page)).toHaveText('Launch');
  await page.keyboard.press('c');await advance(page,1);
  await expect(page.locator('.external-readouts')).not.toContainText('SURF0.0 m/s');
  await page.keyboard.press('f');
  await expect(page.locator('.radio-caption')).toContainText('Remain strapped');
});

test('beginner guidance teaches the current operation and pauses without a model',async({page})=>{
  await open(page,true);await begin(page,'Moon','approach','cadet');
  await expect(page.getByRole('dialog',{name:'Flight guidance'})).toBeVisible();
  const frozen=await clock(page).innerText();await advance(page,2);await expect(clock(page)).toHaveText(frozen);
  await page.getByRole('button',{name:'Explain',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Flight guide',exact:true})).toBeVisible();
  await expect(page.locator('.guide-copy')).toContainText('Moon');
  await expect(page.getByRole('link',{name:/Reference/})).toBeVisible();
  await page.getByRole('button',{name:'Procedure',exact:true}).click();
  await expect(page.locator('.guide-copy')).toContainText('thrust');
  await expect(page.locator('textarea,input')).toHaveCount(0);
  await advance(page,2);await expect(clock(page)).toHaveText(frozen);
  await page.getByLabel('Close menu').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('physical instrument inspection is contextual and cannot start a second unrelated action',async({page})=>{
  await open(page);await begin(page);await advance(page,.6);
  await page.keyboard.press('i');
  await expect(page.getByRole('heading',{name:'Flight guide',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Physics',exact:true})).toHaveClass('selected');
  await expect(page.locator('.guide-copy')).toContainText('guidance');
  await page.getByLabel('Close menu').click();
  await expect(clock(page)).toHaveText('00:00:00');
  await page.keyboard.press('f');
  await expect(page.locator('.radio-caption')).toContainText('Remain strapped');
});

test('settings persist; setup contains mission choices without assistant or promotional text',async({page})=>{
  await open(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Graphics',{exact:true}).selectOption('high');
  await page.getByLabel('Mouse sensitivity',{exact:true}).press('End');
  await page.getByLabel('Mission control voice',{exact:true}).check();
  await page.getByLabel('Close menu').click();await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByLabel('Graphics',{exact:true})).toHaveValue('high');
  await expect(page.getByLabel('Mouse sensitivity',{exact:true})).toHaveValue('4');
  await expect(page.getByLabel('Mission control voice',{exact:true})).toBeChecked();
  await page.getByLabel('Close menu').click();
  for(const text of ['Azure','NO MUSIC','giant leap','Ask mission control'])await expect(page.locator('body')).not.toContainText(text);
  await expect(page.getByRole('button',{name:'ISS',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Moon',exact:true})).toBeVisible();
  // This is a static app: there is no health/API server contract. Assert the
  // user-facing disclosure and monitor real browser requests in afterEach.
  await page.getByRole('button',{name:'Sources & credits',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sources & credits',exact:true})).toBeVisible();
  await expect(page.locator('.credits-copy')).toContainText('No LLM or Azure service is used');
  await expect(page.getByRole('link',{name:/Asset credits/})).toHaveAttribute('href','/assets/credits.json');
});


test('explicit WebGL mode runs without loading WebGPU compiler resources',async({page})=>{
  const compilers:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/shaders/'))compilers.push(r.url());});
  await open(page,false,'/?renderer=webgl');await begin(page);await advance(page,.5);
  const graphics=await page.evaluate(()=>(window as any).spaceScene.graphicsInfo);
  expect(graphics.backend).toMatch(/^WebGL/);expect(graphics.requested).toBe('webgl');expect(graphics.fallbackReason).toBeNull();expect(compilers).toEqual([]);
});

test('automatic renderer falls back cleanly when WebGPU is unavailable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{get:()=>undefined,configurable:true}));
  await open(page);await begin(page,'Moon','approach');await advance(page,.5);
  const graphics=await page.evaluate(()=>(window as any).spaceScene.graphicsInfo);
  expect(graphics.backend).toMatch(/^WebGL/);expect(graphics.fallbackReason).toContain('unavailable');
  await page.keyboard.press('c');await advance(page,.3);await expect(page.getByLabel('Switch camera')).toContainText('External');
});

test('strict WebGPU requests fail clearly instead of silently claiming a fallback renderer',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{get:()=>undefined,configurable:true}));
  await page.goto('/?renderer=webgpu');await expect(page.getByRole('alert')).toContainText('WebGPU is unavailable');
  await expect(page.getByRole('button',{name:'Graphics unavailable',exact:true})).toBeDisabled();
});


test('automatic renderer recovers when a WebGPU adapter cannot create its device',async({page})=>{
  await page.addInitScript(()=>{
    const listeners={focus:new Set<EventListenerOrEventListenerObject>(),blur:new Set<EventListenerOrEventListenerObject>()};
    (window as any).__gpuListeners=listeners;
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener=function(type,listener,options){if(this===window&&listener&&(type==='focus'||type==='blur'))listeners[type].add(listener);return add.call(this,type,listener,options);};
    EventTarget.prototype.removeEventListener=function(type,listener,options){if(this===window&&listener&&(type==='focus'||type==='blur'))listeners[type].delete(listener);return remove.call(this,type,listener,options);};
  });
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{configurable:true,value:{getPreferredCanvasFormat:()=> 'bgra8unorm',requestAdapter:async()=>({features:new Set(),limits:{},info:{},requestDevice:async()=>{throw new Error('Simulated GPU device creation failure');}})}}));
  await open(page);await begin(page);await advance(page,.5);
  const graphics=await page.evaluate(()=>(window as any).spaceScene.graphicsInfo);
  expect(graphics.backend).toMatch(/^WebGL/);expect(graphics.fallbackReason).toContain('device creation failure');
  expect(await page.evaluate(()=>(window as any).spaceScene.engine.constructor.Instances.length)).toBe(1);
  expect(await page.evaluate(()=>({focus:(window as any).__gpuListeners.focus.size,blur:(window as any).__gpuListeners.blur.size}))).toEqual({focus:1,blur:1});
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('automatic renderer replaces a canvas already acquired by WebGPU after initialization fails',async({page})=>{
  await page.addInitScript(()=>{
    const context=(window as any).GPUCanvasContext;
    if(context)context.prototype.configure=function(){(window as any).__failedGPUCanvas=this.canvas;throw new Error('Simulated swapchain configuration failure');};
  });
  await open(page);await begin(page);await advance(page,.5);
  const graphics=await page.evaluate(()=>(window as any).spaceScene.graphicsInfo);
  test.skip(graphics.fallbackReason?.includes('unavailable'), 'Swapchain recovery needs a browser with a real WebGPU adapter.');
  expect(graphics.backend).toMatch(/^WebGL/);expect(graphics.fallbackReason).toContain('swapchain configuration failure');
  expect(await page.evaluate(()=>{const failed=(window as any).__failedGPUCanvas;return !!failed&&!failed.isConnected&&failed!==document.getElementById('space-canvas');})).toBe(true);
  expect(await page.evaluate(()=>(window as any).spaceScene.engine.constructor.Instances.length)).toBe(1);
});

for(const resource of ['twgsl.js','glslang.wasm'])test(`automatic renderer recovers when the local ${resource} compiler resource fails`,async({page})=>{
  let blockedRequests=0;
  await page.route('**/assets/shaders/'+resource,route=>{blockedRequests++;return route.abort('failed');});
  await open(page);await begin(page);await advance(page,.5);
  const graphics=await page.evaluate(()=>(window as any).spaceScene.graphicsInfo);
  test.skip(graphics.fallbackReason?.includes('unavailable'), 'Compiler recovery needs a browser with a real WebGPU adapter.');
  expect(blockedRequests, 'The requested compiler failure was actually injected').toBeGreaterThan(0);
  expect(graphics.backend).toMatch(/^WebGL/);expect(graphics.fallbackReason).toBeTruthy();
  await expect(page.getByRole('alert')).toHaveCount(0);
});


test('planning tabs reveal the relevant controls and preserve mission choices',async({page})=>{
  await open(page);
  await expect(page.getByLabel('Difficulty',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Payload',{exact:true})).toBeHidden();
  await expect(page.getByLabel('Weather',{exact:true})).toBeHidden();
  await page.getByRole('button',{name:'Moon',exact:true}).click();
  await expect(page.locator('.mission-brief')).toContainText('return to Earth');
  await page.getByRole('button',{name:'Configure vehicle'}).click();
  await expect(page.getByLabel('Payload',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Payload',{exact:true})).toHaveValue('geology');
  await page.getByLabel('Payload',{exact:true}).selectOption('imaging');
  await expect(page.getByLabel('Design constraints')).toContainText('160 MB');
  await page.getByRole('button',{name:'Set launch conditions'}).click();
  await expect(page.getByLabel('Launch site',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Payload',{exact:true})).toBeHidden();
  await page.getByLabel('Launch site',{exact:true}).selectOption('lc39b');
  await expect(page.locator('.launch-location')).toContainText('Launch complex 39B');
  await plannerTab(page,'Vehicle');
  await expect(page.getByLabel('Payload',{exact:true})).toHaveValue('imaging');
  await plannerTab(page,'Mission');
  await expect(page.getByRole('button',{name:'Moon',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('Design constraints')).toBeVisible();
});

test('over-budget equipment blocks flight across tabs and removing equipment restores readiness',async({page})=>{
  await open(page);await plannerTab(page,'Vehicle');
  await page.getByRole('checkbox',{name:/Redundant radio/}).check();
  await page.getByRole('checkbox',{name:/Instrument shielding/}).check();
  await expect(page.getByLabel('Design constraints')).toContainText('107');
  await expect(page.getByRole('alert')).toContainText('Budget exceeds 100 credits');
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeDisabled();
  await plannerTab(page,'Launch');
  await page.getByLabel('Launch time UTC',{exact:true}).press('Enter');
  await expect(page.locator('.flight-status')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Mission setup'})).toBeVisible();
  await plannerTab(page,'Vehicle');
  await page.getByRole('checkbox',{name:/Instrument shielding/}).uncheck();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Design constraints')).toContainText('94');
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeEnabled();
});

for(const cabin of ['modern','heritage'] as const)test(`${cabin} cabin selection reaches the renderer without changing the mission objective`,async({page})=>{
  await open(page);await plannerTab(page,'Vehicle');
  await page.getByLabel('Cabin',{exact:true}).selectOption(cabin);
  await expect(page.locator('.vehicle-model')).toContainText('original vehicle');
  await begin(page);await advance(page,.5);
  const rendered=await page.evaluate(()=>{
    const world=(window as any).spaceScene;
    const modern=world.scene.getTransformNodeByName('Beyond modern training cabin');
    return {modernExists:!!modern,modernEnabled:modern?.isEnabled(),storedPlan:JSON.parse(localStorage.getItem('beyond-v2-plan')||'{}')};
  });
  expect(rendered.modernExists).toBe(true);
  expect(rendered.modernEnabled).toBe(cabin==='modern');
  expect(rendered.storedPlan.vehicle).toBe(cabin);
  expect(rendered.storedPlan.destination).toBe('iss');
  await expect(page.locator('.current-objective')).toBeVisible();
});

test('weather failure is a labeled preset and never a live-weather claim',async({page})=>{
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({status:503,body:'Unavailable'}));
  await open(page);await plannerTab(page,'Launch');
  await page.getByLabel('Weather',{exact:true}).selectOption('overcast');
  await page.getByRole('button',{name:'Use current site weather',exact:true}).click();
  const status=page.locator('.planner-content:not([hidden]) [role="status"]');
  await expect(status).toHaveText('Weather unavailable. Clear preset selected.');
  await expect(page.getByLabel('Weather',{exact:true})).toHaveValue('clear');
  await expect(page.getByRole('button',{name:'Use current site weather',exact:true})).toBeEnabled();
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('beyond-v2-plan')||'{}').weatherSnapshot);
  expect(snapshot.status).toBe('fallback');expect(snapshot.observedAt).toBeNull();
});

test('fresh weather uses the selected coordinates and shows the model timestamp',async({page})=>{
  let requestedSite:URL|null=null;
  await page.route('https://api.open-meteo.com/**',async route=>{
    requestedSite=new URL(route.request().url());
    const time=await page.evaluate(()=>new Date().toISOString());
    await route.fulfill({json:{current:{temperature_2m:23,cloud_cover:85,wind_speed_10m:3,time}}});
  });
  await open(page);await plannerTab(page,'Launch');
  await page.getByLabel('Launch site',{exact:true}).selectOption('lc39b');
  await page.getByRole('button',{name:'Use current site weather',exact:true}).click();
  await expect(page.locator('.planner-content:not([hidden]) [role="status"]')).toContainText('Weather model · 23°C · 3.0 m/s · observed');
  await expect(page.getByLabel('Weather',{exact:true})).toHaveValue('overcast');
  expect(requestedSite).not.toBeNull();
  expect(requestedSite!.searchParams.get('latitude')).toBe('28.6272');
  expect(requestedSite!.searchParams.get('longitude')).toBe('-80.6208');
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('beyond-v2-plan')||'{}').weatherSnapshot);
  expect(snapshot.status).toBe('live');expect(snapshot.site).toBe('lc39b');
});

for(const cancelWith of ['site','preset'] as const)test(`late weather response cannot overwrite a newer ${cancelWith} choice`,async({page})=>{
  let heldRoute:Route|undefined;
  await page.route('https://api.open-meteo.com/**',route=>{heldRoute=route;});
  await open(page);await plannerTab(page,'Launch');
  const pending=page.waitForRequest('https://api.open-meteo.com/**');
  await page.getByRole('button',{name:'Use current site weather',exact:true}).click();await pending;
  await expect(page.getByRole('button',{name:'Checking weather…',exact:true})).toBeDisabled();
  if(cancelWith==='site')await page.getByLabel('Launch site',{exact:true}).selectOption('lc39b');
  await page.getByLabel('Weather',{exact:true}).selectOption('overcast');
  await expect(page.getByRole('button',{name:'Use current site weather',exact:true})).toBeEnabled();
  // The browser may already have canceled this request. Either outcome must
  // preserve the user's newer selection and omit the stale model's label.
  expect(heldRoute).toBeDefined();
  const time=await page.evaluate(()=>new Date().toISOString());
  await heldRoute!.fulfill({json:{current:{temperature_2m:25,cloud_cover:10,wind_speed_10m:20,time}}}).catch(()=>{});
  await advance(page,.5);
  await expect(page.getByLabel('Weather',{exact:true})).toHaveValue('overcast');
  await expect(page.getByLabel('Launch site',{exact:true})).toHaveValue(cancelWith==='site'?'lc39b':'lc39a');
  await expect(page.locator('.planner-content:not([hidden]) [role="status"]')).toHaveText('Weather presets are simulated. Current conditions require a connection.');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('beyond-v2-plan')||'{}'));
  expect(stored.weather).toBe('overcast');expect(stored.weatherSnapshot).toBeUndefined();
});

test('cadet launchpad guidance pauses before ignition and can continue to flight',async({page})=>{
  await open(page,true);await begin(page,'ISS','pad','cadet');
  await expect(page.getByRole('dialog',{name:'Flight guidance'})).toBeVisible();
  await expect(clock(page)).toHaveText('00:00:00');
  await advance(page,3);await expect(clock(page)).toHaveText('00:00:00');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Flight controls')).toBeVisible();
  await expect(page.getByRole('button',{name:/Start countdown/})).toBeVisible();
});

test('crew support stays authored and the public presentation contains seven slides with gameplay',async({page})=>{
  await open(page);
  await expect(page.getByRole('link',{name:/Presentation/})).toHaveAttribute('href','/presentation.html');
  const deck=await page.request.get('/presentation.html');expect(deck.ok()).toBe(true);
  const html=await deck.text();expect(html.match(/<section class="slide"/g)).toHaveLength(7);
  expect(html).toContain('presentation-assets/iss-approach.png');
  expect(html).toContain('presentation-assets/moon-descent.png');
  expect(html).not.toContain('Final-build gameplay image required');
  await begin(page);await cursor(page);
  await page.getByLabel('Crew support',{exact:true}).click();
  await page.getByRole('button',{name:'Engineer',exact:true}).click();
  await expect(page.locator('.guide-copy')).toContainText('Battery');
  await expect(page.getByRole('dialog',{name:'crew'})).toContainText('Authored crew guidance');
  await page.getByRole('button',{name:'Science officer',exact:true}).click();
  await expect(page.locator('.guide-copy')).not.toBeEmpty();
  await expect(page.locator('textarea')).toHaveCount(0);
});


test('imaging payload needs electrical capacity even when mass and budget fit',async({page})=>{
  await open(page);await plannerTab(page,'Vehicle');
  await page.getByLabel('Payload',{exact:true}).selectOption('imaging');
  await page.getByRole('checkbox',{name:/Backup battery/}).uncheck();
  await expect(page.getByLabel('Design constraints')).toContainText('1,140 / 1,100 W');
  await expect(page.getByRole('alert')).toContainText('Power demand exceeds 1,100 W');
  await expect(page.getByRole('alert')).not.toContainText('Mass exceeds');
  await expect(page.getByRole('alert')).not.toContainText('Budget exceeds');
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeDisabled();
  await page.getByRole('checkbox',{name:/Backup battery/}).check();
  await expect(page.getByLabel('Design constraints')).toContainText('1,140 / 1,250 W');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeEnabled();
});

test('launcher compatibility is enforced for both destination choices',async({page})=>{
  await open(page);await plannerTab(page,'Vehicle');
  await page.getByLabel('Launch vehicle',{exact:true}).selectOption('saturnv');
  await expect(page.getByRole('alert')).toContainText('ISS missions require the orbital trainer stack');
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeDisabled();
  await page.getByLabel('Launch vehicle',{exact:true}).selectOption('orbital');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeEnabled();
  await plannerTab(page,'Mission');await page.getByRole('button',{name:'Moon',exact:true}).click();
  await plannerTab(page,'Vehicle');
  await expect(page.getByLabel('Launch vehicle',{exact:true})).toHaveValue('saturnv');
  await page.getByLabel('Launch vehicle',{exact:true}).selectOption('orbital');
  await expect(page.getByRole('alert')).toContainText('Lunar missions require the Saturn V / Apollo stack');
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeDisabled();
  await page.getByLabel('Launch vehicle',{exact:true}).selectOption('saturnv');
  await expect(page.getByRole('button',{name:'Start flight',exact:true})).toBeEnabled();
});
