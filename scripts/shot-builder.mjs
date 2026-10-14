// 本机临时工具：带预设配装截图配装器。
// node scripts/shot-builder.mjs <名字> [light|dark] [宽] [高] [预设.json] [click-selector]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [, , name, theme = 'dark', w = '1440', h = '900', preset = '.cache/sample-build.json', click = ''] =
  process.argv;
const build = preset && preset !== '-' ? readFileSync(preset, 'utf-8') : null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: theme });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
if (build) await page.addInitScript((b) => localStorage.setItem('mhdb-builder-v0', b), build);
await page.goto('http://localhost:4321/world/builder/', { waitUntil: 'networkidle' });
await page.waitForSelector('.gb-equip');
await page.evaluate(() => document.fonts.ready);
if (click) {
  await page.locator(click).first().click();
  await page.waitForTimeout(500);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `.cache/shots/${name}.png`, fullPage: !click });
if (errors.length) console.log('ERRORS:', errors.join('\n'));
await browser.close();
