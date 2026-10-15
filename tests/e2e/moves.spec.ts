import { expect, test, type Page } from '@playwright/test';

/**
 * 武器招式：列表页、各武器的招式表；动作值等数值取自攻击参数文件，筛选可用。
 */

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

test('武器招式列表', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/world/moves/', { waitUntil: 'networkidle' });
  await expect(page.locator('.s-card')).toHaveCount(15);
  await page.getByRole('link', { name: /双剑/ }).first().click();
  await expect(page).toHaveURL(/\/world\/moves\/dual-blades\/$/);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`双剑招式表 · ${theme}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/world/moves/dual-blades/', { waitUntil: 'networkidle' });
    // 二连斩 L：动作值 8、属性补正 0.6、异常补正 0.4、卡肉 0.07
    const row = page
      .locator('tr', { hasText: '二連斬' })
      .or(page.locator('tr', { hasText: '二段斬りL' }))
      .first();
    await expect(row).toContainText('8');
    await expect(row).toContainText('0.6');
    await expect(row).toContainText('0.07');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, '页面不应横向溢出（表格在自己的滚动容器里）').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/moves-db-${theme}-${info.project.name}.png` });
  });
}

test('按招式名筛选', async ({ page }) => {
  await page.goto('/world/moves/long-sword/', { waitUntil: 'networkidle' });
  const rows = page.locator('[data-move-row]:not([hidden])');
  const all = await rows.count();
  await page.getByRole('searchbox', { name: '按招式名筛选' }).fill('居合');
  await expect(rows).not.toHaveCount(all);
  expect(await rows.count()).toBeGreaterThan(0);
  for (const text of await rows.allTextContents()) expect(text).toContain('居合');
});
