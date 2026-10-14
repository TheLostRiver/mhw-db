// 本机临时工具：把若干截图拼成网格对比图。
// node scripts/grid.mjs <输出.png> <列数> <标题> <图1> [<图2> ...]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [, , out, cols, title, ...files] = process.argv;
const cells = files
  .map((f) => {
    const label = f.split(/[\\/]/).pop().replace('.png', '');
    return `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${label}</figcaption></figure>`;
  })
  .join('');
const width = Number(cols) * 960 + (Number(cols) + 1) * 24;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 800 } });
await page.setContent(`
  <style>
    body { margin: 0; padding: 24px; background: #5f6368; font: 600 20px system-ui, sans-serif; color: #fff; }
    h1 { margin: 0 0 16px; font-size: 28px; }
    main { display: grid; grid-template-columns: repeat(${cols}, 960px); gap: 24px; }
    figure { margin: 0; }
    img { width: 960px; display: block; border-radius: 10px; box-shadow: 0 10px 30px rgb(0 0 0 / .35); }
    figcaption { margin-top: 8px; opacity: .85; font-size: 16px; }
  </style>
  <h1>${title}</h1><main>${cells}</main>`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
