import { chromium } from '@playwright/test';
const browser = await chromium.launch(process.platform === 'win32'
  ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--use-angle=d3d11'] }
  : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('beyond-v2-settings', JSON.stringify({ quality: 'low', voice: false, sound: false, sensitivity: 1, beginnerPauses: false })));
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Start flight', exact: true }).waitFor({ timeout: 120000 });
  await page.screenshot({ path: '.local/v3-mobile-setup.png' });
  await page.getByRole('button', { name: 'Moon', exact: true }).click();
  await page.getByLabel('Start location').selectOption('approach');
  await page.getByLabel('Difficulty').selectOption('commander');
  await page.getByRole('button', { name: 'Start flight', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.local/v3-mobile-flight.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const controls = await page.locator('.touch-flight').isVisible();
  const overlaps = await page.evaluate(() => {
    const a = document.querySelector('.flight-toolbar').getBoundingClientRect();
    const b = document.querySelector('.touch-flight').getBoundingClientRect();
    return a.top < b.bottom && a.bottom > b.top;
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: '.local/v3-mobile-settings.png' });
  console.log(JSON.stringify({ overflow, controls, overlaps, errors }));
  if (overflow || !controls || overlaps || errors.length) process.exitCode = 1;
} finally { await browser.close(); }
