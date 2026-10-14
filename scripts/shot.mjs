// 临时截图脚本：node scripts-shot.mjs <path> <name> [theme] [w] [h] [full]
import { chromium } from '@playwright/test';
const [, , path, name, theme = 'light', w = '1440', h = '900', full = '1', clip = ''] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: 1,
  colorScheme: theme,
});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4321/' + path.replace(/^[/]+/, ''), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1600);
const [cx, cy, cw, ch] = clip.split(',').map(Number);
if (full === 'tall') {
  // 视口拉到整页高度：fixed 背景铺满整页，避免整页截图在第一屏底部出现断层
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: +w, height: total });
  await page.waitForTimeout(800);
}
await page.screenshot({
  path: `.cache/shots/${name}.png`,
  fullPage: full === '1',
  ...(clip ? { clip: { x: cx, y: cy, width: cw, height: ch } } : {}),
});
if (errors.length) console.log('ERRORS:', errors.join('\n'));
await browser.close();
