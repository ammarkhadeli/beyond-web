import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const software=process.env.BEYOND_REVIEW_SOFTWARE==='1';
const headless=process.env.BEYOND_REVIEW_HEADLESS==='1';
const fullChromium=process.env.BEYOND_REVIEW_FULL_CHROMIUM==='1';
const port=Number(process.env.BEYOND_REVIEW_PORT??5183);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid review port');
const output=process.env.BEYOND_REVIEW_OUTPUT??'review-results';
// Playwright's webServer command runs through a shell. Quote executable paths
// rather than interpolating JSON or relying on a different Node in PATH.
const quote=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";

export default defineConfig({
  testDir:'./tests',
  testMatch:['game.spec.ts','capture.spec.ts','journey.spec.ts','failure.spec.ts'],
  outputDir:`${output}/artifacts`,
  timeout:360_000,
  expect:{timeout:12_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['line'],['json',{outputFile:`${output}/results.json`}]],
  metadata:{renderingRequest:software?'explicit SwiftShader software':'normal Chromium; inspect actual renderer diagnostics',browserDisplay:headless?'headless':'headed',browserDistribution:fullChromium?'full Chromium':'Playwright default'},
  use:{
    browserName:'chromium',
    channel:fullChromium?'chromium':undefined,
    baseURL:`http://127.0.0.1:${port}`,
    viewport:{width:960,height:700},
    headless,
    screenshot:'on',
    trace:'retain-on-failure',
    launchOptions:{
      chromiumSandbox:true,
      args:software?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[],
    },
  },
  webServer:{
    command:`${quote(process.execPath)} ${quote(fileURLToPath(new URL('./node_modules/vite/bin/vite.js',import.meta.url)))} preview --host 127.0.0.1 --port ${port} --strictPort`,
    cwd:root,
    url:`http://127.0.0.1:${port}`,
    reuseExistingServer:false,
    timeout:120_000,
    gracefulShutdown:{signal:'SIGTERM',timeout:5000},
    stdout:'pipe',
    stderr:'pipe',
  },
});
