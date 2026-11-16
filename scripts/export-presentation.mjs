import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.local/presentation-review');
await mkdir(output, { recursive: true });
const html = await readFile(resolve(root, 'public/presentation.html'), 'utf8');
await writeFile(resolve(root, 'docs/presentation.html'), html.replaceAll('./presentation-assets/', '../public/presentation-assets/'));
const browser = await chromium.launch({ channel: 'chromium', headless: true, chromiumSandbox: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve(root, 'public/presentation.html')).href);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => Promise.all(Array.from(document.images).map(image => image.decode())));
  const slides = page.locator('.slide');
  if (await slides.count() !== 7) throw Error('Expected exactly seven slides, including title.');
  const layout = await slides.evaluateAll(nodes => nodes.map((slide, index) => {
    const bounds = slide.getBoundingClientRect();
    const overflow = Array.from(slide.querySelectorAll('h1,h2,h3,p,figure,table,li,.footer,.project-link')).filter(element => {
      const r = element.getBoundingClientRect();
      return r.left < bounds.left || r.right > bounds.right + 1 || r.bottom > bounds.bottom + 1 || r.top < bounds.top;
    }).map(element => element.textContent?.trim().slice(0, 100));
    return { slide: index + 1, words: (slide.textContent ?? '').trim().split(/\s+/).length, width: bounds.width, height: bounds.height, overflow };
  }));
  if (layout.some(slide => slide.overflow.length || slide.width !== 1280 || slide.height !== 720)) throw Error(JSON.stringify(layout));
  for (let i = 0; i < 7; i++) await slides.nth(i).screenshot({ path: resolve(output, `slide-${i + 1}.png`) });
  await page.pdf({ path: resolve(root, 'public/presentation.pdf'), printBackground: true, preferCSSPageSize: true, tagged: true });
  await writeFile(resolve(output, 'layout.json'), JSON.stringify(layout, null, 2) + '\n');
  console.log(JSON.stringify(layout));
  console.log('Exported seven-slide PDF and synchronized editable HTML.');
} finally {
  await browser.close();
}
