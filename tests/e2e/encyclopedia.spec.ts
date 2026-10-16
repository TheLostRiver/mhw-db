import { expect, test, type Page } from '@playwright/test';

/**
 * 百科：目录页与各列表页能打开、没有控制台错误、不横向溢出；筛选可用。
 */

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

const PAGES = [
  ['/world/encyclopedia/', '百科'],
  ['/world/weapons/', '武器'],
  ['/world/weapons/long-sword/', '太刀'],
  ['/world/weapons/bow/', '弓'],
  ['/world/armor/', '防具'],
  ['/world/armor/12/', '稀有度 12'],
  ['/world/charms/', '护石'],
  ['/world/decorations/', '饰品'],
  ['/world/skills/', '技能'],
  ['/world/mantles/', '衣装'],
  ['/world/items/materials/', '素材'],
  ['/world/items/consumables/', '道具'],
] as const;

for (const [path, heading] of PAGES) {
  test(`打开 ${path}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test('技能页按名字筛选', async ({ page }) => {
  await page.goto('/world/skills/', { waitUntil: 'networkidle' });
  const cards = page.locator('[data-filter-row]:not([hidden])');
  const all = await cards.count();
  await page.getByRole('searchbox', { name: '按技能名或效果筛选' }).fill('弱点特效');
  await expect(cards).not.toHaveCount(all);
  await expect(cards.first()).toContainText('弱点特效');
});

test('防具页按技能筛选，整组不匹配的系列隐藏', async ({ page }) => {
  await page.goto('/world/armor/12/', { waitUntil: 'networkidle' });
  await page.getByRole('searchbox', { name: '按防具名或技能筛选' }).fill('攻击');
  const rows = page.locator('[data-filter-row]:not([hidden])');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const t of await rows.allTextContents()) expect(t).toContain('攻击');
  const visibleSections = page.locator('[data-filter-section]:not([hidden])');
  expect(await visibleSections.count()).toBeLessThan(await page.locator('[data-filter-section]').count());
});

test('武器页显示攻击力为显示值', async ({ page }) => {
  await page.goto('/world/weapons/long-sword/', { waitUntil: 'networkidle' });
  // 铁刀1：真实攻击 80 × 3.3 = 264
  await expect(page.locator('tr', { hasText: '铁刀1' }).first()).toContainText('264');
});
