import { defineConfig, passthroughImageService } from 'astro/config';
import react from '@astrojs/react';
import { cjkLineBreaks } from './src/build/cjk-line-breaks';

export default defineConfig({
  site: 'https://mhdb.helsincy.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // 游戏图片由 Python 管线预先转换成 WebP/AVIF，不在 Astro 构建时处理
  image: { service: passthroughImageService() },
  integrations: [react()],
  devToolbar: { enabled: false },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  // 中文段落折行渲染成空格的问题，见 src/build/cjk-line-breaks.ts
  vite: { plugins: [cjkLineBreaks()] },
});
