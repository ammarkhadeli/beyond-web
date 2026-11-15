import { test, expect, type Page, type TestInfo } from '@playwright/test';

// Manual review artifacts from real browser rendering. Practice starts are
// labeled explicitly; these captures do not prove complete mission journeys.
test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

const scenarios = [
  { name: 'launchpad', destination: 'ISS', start: 'pad' },
  { name: 'iss-practice-approach', destination: 'ISS', start: 'approach' },
  { name: 'moon-practice-descent', destination: 'Moon', start: 'approach' },
] as const;

async function settleFrame(page: Page) {
  await page.bringToFront();
  await page.waitForFunction(() => (window as any).spaceScene?.scene.isReady(), undefined, { timeout: 120_000 });
  const frame = await page.evaluate(() => (window as any).spaceScene.scene.getFrameId());
  await page.waitForFunction(previous => (window as any).spaceScene.scene.getFrameId() >= previous + 2, frame, { polling: 100, timeout: 20_000 });
}

async function capture(page: Page, info: TestInfo, name: string) {
  await settleFrame(page);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}

for (const scenario of scenarios) {
  test(`review ${scenario.name}: planner, cockpit, exterior and map`, async ({ page, browser }, info) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/unable to compile effect|error compiling shader|INVALID_OPERATION|cannot merge meshes|WebGPU uncaptured error|validation error/i.test(message.text())) errors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).hostname === '127.0.0.1') {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('requestfailed', request => failedRequests.push(`${request.failure()?.errorText} ${request.url()}`));

    await page.addInitScript(() => {
      localStorage.setItem('beyond-v2-settings', JSON.stringify({
        quality: 'high', sensitivity: 1, voice: false, sound: false, beginnerPauses: false,
      }));
    });

    try {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Start flight', exact: true })).toBeEnabled({ timeout: 120_000 });
      await page.getByRole('button', { name: scenario.destination, exact: true }).click();
      await page.getByLabel('Start location').selectOption(scenario.start);
      await page.getByLabel('Difficulty').selectOption('commander');
      await capture(page, info, `${scenario.name}-planner`);
      await page.getByRole('button', { name: 'Start flight', exact: true }).click();
      await expect(page.locator('.flight-status')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await capture(page, info, `${scenario.name}-cockpit`);

      await page.keyboard.press('c');
      await expect(page.getByLabel('Switch camera')).toContainText('External');
      await capture(page, info, `${scenario.name}-exterior`);
      await page.keyboard.press('m');
      await expect(page.getByLabel('Switch camera')).toContainText('Trajectory');
      await capture(page, info, `${scenario.name}-map`);

      const renderer = await page.evaluate(() => {
        const scene = (window as any).spaceScene;
        const engine = scene.scene.getEngine();
        const gl = typeof engine.getGlInfo === 'function' ? engine.getGlInfo() : null;
        const adapter = engine._adapter?.info;
        const canvas = document.querySelector('canvas');
        return {
          userAgent: navigator.userAgent,
          graphics: scene.graphicsInfo,
          webgl: gl ? { vendor: gl.vendor, renderer: gl.renderer, version: gl.version } : null,
          webgpu: adapter ? { vendor: adapter.vendor, architecture: adapter.architecture, device: adapter.device, description: adapter.description } : null,
          canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
          phase: document.querySelector('.flight-status > span')?.textContent,
        };
      });
      await info.attach('rendering-context', {
        body: JSON.stringify({ scenario, browserVersion: browser.version(), quality: 'high', ...renderer,
          limitations: 'Captures only. No full journey, audio output, hardware acceleration or performance acceptance is implied.' }, null, 2),
        contentType: 'application/json',
      });
      expect(errors, 'Browser/rendering errors').toEqual([]);
      expect(failedRequests, 'Failed resource requests').toEqual([]);
    } finally {
      await info.attach('browser-diagnostics', {
        body: JSON.stringify({ errors, failedRequests }, null, 2), contentType: 'application/json',
      });
    }
  });
}
