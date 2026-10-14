// node montage.mjs out.png a.png b.png ...  横向拼图（缩放到统一高度）
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [, , out, ...files] = process.argv;
const imgs = files
  .map((f) => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}">`)
  .join('');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400 * files.length + 20 * (files.length + 1), height: 900 } });
await p.setContent(
  `<body style="margin:0;padding:20px;display:flex;gap:20px;background:#777">${imgs}</body><style>img{width:390px;border-radius:12px}</style>`,
);
await p.screenshot({ path: out, fullPage: true });
await b.close();
