import { expect, test, type Page } from '@playwright/test';

/**
 * 首页「导虫之径」：六个路标都在、今日猎物有数据、图鉴长卷有图标、不横向溢出、无控制台错误。
 */

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

for (const theme of ['light', 'dark'] as const) {
  test(`首页 · ${theme}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/', { waitUntil: 'networkidle' });
    const points = page.getByRole('navigation', { name: '主要入口' }).getByRole('link');
    await expect(points).toHaveCount(6);
    await expect(points.filter({ hasText: '伤害计算' })).toHaveAttribute('href', '/world/damage/');
    const today = page.locator('[data-today]');
    await expect(today.locator('h3')).not.toBeEmpty();
    await expect(today.locator('.td-el')).toHaveCount(5);
    expect(await page.locator('.mq-track img').count()).toBeGreaterThan(60);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/home-${theme}-${info.project.name}.png` });
  });
}

test('今日猎物随机抽取，「换一只」换成另一只且不与上次打开的重复', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const today = page.locator('[data-today]');
  const name = today.locator('[data-f="name"]');
  await expect(today).not.toHaveAttribute('data-pending');
  const first = await name.textContent();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(today).not.toHaveAttribute('data-pending');
  expect(await name.textContent()).not.toBe(first);
  const before = await name.textContent();
  await today.getByRole('button', { name: '换一只' }).click();
  await expect(name).not.toHaveText(before ?? '');
  await expect(today).not.toHaveAttribute('data-pending');
  await expect(today.locator('.td-el')).toHaveCount(5);
  await expect(today.locator('[data-f="more"]')).toHaveAttribute('href', /^\/world\/monsters\/em\d+_\d+\/$/);
});

test('减少动效时导虫只画静态一帧，长卷不滚动', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'networkidle' });
  const anim = await page
    .locator('.mq-track')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('none');
});
