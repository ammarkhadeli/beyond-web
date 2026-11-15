import { chromium } from '@playwright/test';
const mode = process.argv[2] || 'pad';
const isPad = mode === 'pad' || mode === 'apollo';
const browser = await chromium.launch(process.platform === 'win32'
  ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--use-angle=d3d11'] }
  : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  let reported=0; page.on('console', m => { if(m.type()==='error' && reported++<5) console.log('RENDER ERROR',m.text().slice(0,200)); });
  page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await page.addInitScript(() => localStorage.setItem('beyond-v2-settings', JSON.stringify({ quality: 'high', voice: false, sound: false, sensitivity: 1, beginnerPauses: false })));
  await page.clock.install();
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Start flight', exact: true }).or(page.getByRole('alert')).first().waitFor({ timeout: 120000 });
  if (await page.getByRole('alert').count()) throw new Error(await page.getByRole('alert').innerText());
  const shot = async name => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `.local/review-${mode}-${name}.png` });
    console.log('CAPTURE', mode, name);
  };
  await shot('setup');
  await page.getByLabel('Difficulty').selectOption('commander');
  if (mode === 'apollo') await page.getByRole('button',{name:'Moon',exact:true}).click();
  if (isPad) await page.getByLabel('Start location').selectOption('pad');
  if (!isPad) {
    await page.getByRole('button', { name: mode === 'moon' ? 'Moon' : 'ISS', exact: true }).click();
    await page.getByLabel('Start location').selectOption('approach');
  }
  await page.getByRole('button', { name: 'Start flight', exact: true }).click();
  await shot('entry'); // Check the neutral view before using recenter.
  await page.keyboard.press('v');
  await shot('cockpit');
  await page.mouse.wheel(0,-650); await shot('instrument-zoom'); await page.mouse.wheel(0,650);
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 420, movementY: 0 })));
  await shot('look-right');
  await page.keyboard.press('v');
  await page.keyboard.press('c');
  await shot('external');
  await page.keyboard.press('Tab');
  const advance = async frames => { for (let i = 0; i < frames; i++) await page.clock.fastForward(200); };
  const speed = async n => { const options = await page.getByLabel('Time speed').locator('option').evaluateAll(xs => xs.map(x => Number(x.value))); return page.getByLabel('Time speed').selectOption(String(Math.max(...options.filter(v => v <= n)))); };
  if (process.argv.includes('--cockpit-only')) { console.log('Cockpit review complete'); process.exitCode=0; } else {
  if (isPad) {
    await page.getByRole('button', { name: /Start countdown/ }).click();
    await speed(10); await advance(6);
    await speed(100); await advance(3);
    await shot('ascent-external');
    await page.keyboard.press('c'); await advance(1);
    await shot('ascent-cockpit');
    await speed(100); await advance(10);
    await shot('upper-ascent');
  } else {
    await page.getByRole('button', { name: 'Enable approach assistance' }).click();
    await speed(10);
    for (let i = 0; i < 450; i++) {
      if ((await page.locator('.flight-status > span').first().innerText()) === 'Science') break;
      await advance(1);
    }
    await shot(mode === 'moon' ? 'surface-external' : 'docked-external');
    await page.keyboard.press('c'); await advance(1);
    await shot(mode === 'moon' ? 'surface-cockpit' : 'docked-cockpit');
  }
  }
  console.log('DONE', mode, (await page.locator('.flight-status').textContent()));
} finally { await browser.close(); }
