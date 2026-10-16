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
  ['/world/combinations/', '调和列表'],
  ['/world/augments/', '客制强化'],
  ['/world/custom-parts/', '零件强化'],
  ['/world/custom-parts/long-sword/', '太刀'],
  ['/world/awakening/', '冥赤觉醒'],
  ['/world/kinsects/', '猎虫'],
  ['/world/melodies/', '狩猎笛旋律'],
  ['/world/pendants/', '武器饰物'],
  ['/world/layered-weapons/', '武器外观'],
  ['/world/layered-weapons/heavy-bowgun/', '重弩'],
  ['/world/weapons/hunting-horn/', '狩猎笛'],
] as const;

for (const [path, heading] of PAGES) {
  test(`打开 ${path}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
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

test('调和列表按素材筛选，点成品跳到道具页对应行', async ({ page }) => {
  await page.goto('/world/combinations/', { waitUntil: 'networkidle' });
  await page.getByRole('searchbox', { name: '按素材或成品筛选' }).fill('蓝蘑菇');
  const rows = page.locator('[data-filter-row]:not([hidden])');
  expect(await rows.count()).toBeGreaterThan(1);
  for (const t of await rows.allTextContents()) expect(t).toContain('蓝蘑菇');
  const herbal = rows.filter({ hasText: '汉方药' }).first();
  await expect(herbal).toContainText('解毒药');
  await herbal.locator('.cb-result a').click();
  await expect(page).toHaveURL(/\/world\/items\/consumables\/#item-\d+$/);
  await expect(page.locator('tr:target')).toContainText('汉方药');
});

test('技能说明里的强调色标记被渲染而不是原样显示', async ({ page }) => {
  await page.goto('/world/awakening/', { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toContainText('[yellow]');
  await expect(page.locator('.s-gt--yellow').first()).toBeVisible();
});

test('百科目录的搜索跨章节筛选', async ({ page }) => {
  await page.goto('/world/encyclopedia/', { waitUntil: 'networkidle' });
  await page.keyboard.press('/');
  await page.keyboard.type('觉醒');
  const shown = page.locator('[data-ec-entry]:not([hidden])');
  await expect(shown).toHaveCount(1);
  await expect(shown.first()).toContainText('冥赤觉醒');
  await shown.first().locator('a').click();
  await expect(page).toHaveURL(/\/world\/awakening\/$/);
});

test('狩猎笛旋律按音色筛选，从武器页跳转时带上音色', async ({ page }) => {
  await page.goto('/world/weapons/hunting-horn/', { waitUntil: 'networkidle' });
  const link = page.locator('a[href^="/world/melodies/#"]').first();
  const href = (await link.getAttribute('href'))!;
  await link.click();
  await expect.poll(() => page.url().endsWith(href)).toBe(true);
  const key = href.split('#')[1]!;
  await expect(page.locator(`[data-horn="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
  const shown = page.locator('[data-ml-row]:not([hidden])');
  expect(await shown.count()).toBeLessThan(await page.locator('[data-ml-row]').count());
  await page.getByRole('button', { name: '全部旋律' }).click();
  await expect(page.locator('[data-ml-row][hidden]')).toHaveCount(0);
});
