import { expect, test, type Page } from '@playwright/test';

/**
 * 地图 v0：列表页、大地图页能加载；纸片与区域号都画出来；楼层切换与区域跳转可用。
 * 纸片图片由管线本机生成（不入库），缺图时测试会报 404 控制台错误。
 */

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

test('地图列表', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/world/maps/', { waitUntil: 'networkidle' });
  const cards = page.locator('.map-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByRole('link', { name: /古代树森林/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`古代树森林 · ${theme}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/world/maps/ancient-forest/', { waitUntil: 'networkidle' });
    // 17 块纸片、17 个区域号
    await expect(page.locator('img.mv-patch')).toHaveCount(17);
    await expect(page.locator('.mv-area')).toHaveCount(17);
    // 地面层显示 12 个区域号，上层的隐藏
    await expect(page.locator(".mv-area[data-state='current']")).toHaveCount(12);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
    expect(errors, '不应有控制台错误').toEqual([]);
    await page.screenshot({ path: `test-results/maps-af-${theme}-${info.project.name}.png` });
  });
}

test('楼层切换与区域跳转', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/world/maps/ancient-forest/', { waitUntil: 'networkidle' });
  const layers = page.getByRole('radiogroup', { name: '楼层' });
  await layers.getByRole('radio', { name: '3' }).click();
  await expect(layers.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
  // 顶层只有 16、17 区
  await expect(page.locator(".mv-area[data-state='current']")).toHaveCount(2);
  await expect(page.locator("img.mv-patch[data-state='below']")).toHaveCount(15);
  // 点区域列表里的 13 区：切到它所在的层
  await page.getByRole('button', { name: '13 区' }).click();
  await expect(layers.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(".mv-area[data-state='current']")).toHaveCount(3);
});
