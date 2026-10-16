import { expect, test } from '@playwright/test';

/**
 * 视觉方向静态稿：每页在深浅两套主题下截图（截图保存在 test-results/，供人工检查），
 * 并断言没有控制台错误、没有横向溢出。
 */

const pages = [
  '/design/',
  '/design/a/',
  '/design/a/builder/',
  '/design/b/',
  '/design/b/builder/',
  '/design/c/',
  '/design/c/builder/',
];
const themes = ['light', 'dark'] as const;

for (const path of pages) {
  for (const theme of themes) {
    test(`${path} · ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
      expect(errors, '不应有控制台错误').toEqual([]);

      const name = `${path.replaceAll('/', '_').replace(/^_|_$/g, '') || 'root'}-${theme}-${info.project.name}.png`;
      await page.screenshot({ path: info.outputPath(name), fullPage: true });
    });
  }
}

test('主题切换：三态按钮写入偏好并平滑切换', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/design/a/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.theme-toggle [data-theme-value="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.theme-toggle [data-theme-value="dark"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('选择器：:target 打开，Esc 关闭', async ({ page }) => {
  await page.goto('/design/b/builder/');
  const picker = page.locator('#picker');
  await expect(picker).toBeHidden();
  await page.locator('a[href="#picker"]').first().click();
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
});
