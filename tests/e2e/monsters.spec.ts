import { expect, test, type Page } from '@playwright/test';

/**
 * 怪物：列表与筛选、详情页的肉质（等级切换）、部位、异常耐性；数值与 Kiranico 的雌火龙数据一致。
 */

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

test('怪物列表与筛选', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/world/monsters/', { waitUntil: 'networkidle' });
  const cards = page.locator('[data-monster]:not([hidden])');
  expect(await cards.count()).toBeGreaterThan(60);
  await page.getByRole('searchbox', { name: '按名字筛选怪物' }).fill('火龙');
  await expect(cards.first()).toContainText('火龙');
  for (const t of await cards.allTextContents()) expect(t).toContain('火龙');
  await page.getByRole('link', { name: /雌火龙/ }).click();
  await expect(page).toHaveURL(/\/world\/monsters\/em001_00\/$/);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`雌火龙详情 · ${theme}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/world/monsters/em001_00/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('雌火龙');
    // 默认大师级：头 60 / 65 / 45
    const mr = page.locator('[data-rank-panel="mr"]');
    await expect(mr.locator('tr', { hasText: '头部' }).first()).toContainText('60');
    // 切到上位：头 70 / 75 / 65
    await page.getByRole('tab', { name: '上位及以下' }).click();
    const hr = page.locator('[data-rank-panel="hr"]');
    await expect(hr).toBeVisible();
    await expect(mr).toBeHidden();
    const head = hr.locator('tr', { hasText: '头部' }).first();
    for (const v of ['70', '75', '65']) await expect(head).toContainText(v);
    // 部位：尾巴怯缩 200、切断 300
    await expect(page.locator('tr', { hasText: '尾巴' }).filter({ hasText: '300' }).first()).toContainText(
      '200',
    );
    // 毒：250 / +150 / 700
    const poison = page.locator('tr', { hasText: '毒' }).filter({ hasText: '+150' });
    await expect(poison).toContainText('250');
    await expect(poison).toContainText('700');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `test-results/monster-rathian-${theme}-${info.project.name}.png`,
      fullPage: true,
    });
  });
}

test('窄屏导航可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/world/monsters/', { waitUntil: 'networkidle' });
  const nav = page.getByRole('navigation', { name: '主导航' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: '伤害计算' })).toBeAttached();
});
