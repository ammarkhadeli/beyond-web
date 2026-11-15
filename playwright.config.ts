import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'game.spec.ts',
  timeout: 360_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 960, height: 700 },
    screenshot: 'only-on-failure',
    trace: 'off',
    launchOptions: process.platform === 'win32'
      ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--use-angle=d3d11'] }
      : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
});
