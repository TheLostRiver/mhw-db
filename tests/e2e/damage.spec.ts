import { expect, test, type Page } from '@playwright/test';

/**
 * 伤害计算：默认大剑显示攻击 1104（真实 230）、白锐利度、纵斩（动作值 48）打雌火龙头部。
 * 大师级头部斩 60：230 × 0.48 × 1.32 × 0.60 = 87.4；上位头部斩 70：102.0；弱点特效 3 级（+30%）：期望 102.0 × 1.075 = 109.7。
 */

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

const total = (page: Page) => page.locator('.dc-result .dc-table__total td');

for (const theme of ['light', 'dark'] as const) {
  test(`伤害计算 · ${theme}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/world/damage/', { waitUntil: 'networkidle' });
    await expect(page.locator('.dc-result h2')).toContainText('纵斩');
    await expect(page.locator('.dc-result h2')).toContainText('雌火龙');
    await expect(total(page).first()).toHaveText('87.4');

    await page.getByRole('radio', { name: '上位及以下' }).click();
    await expect(total(page).first()).toHaveText('102.0');
    await expect(total(page).nth(1)).toHaveText('127.5');

    await page.getByRole('radiogroup', { name: '弱点特效' }).getByRole('radio', { name: 'Lv3' }).click();
    await expect(page.locator('.dc-result__meta').first()).toContainText('会心率 30%');
    await expect(total(page).nth(2)).toHaveText('109.7');

    // 换颈部（斩 40，弱点特效不触发）
    await page.getByRole('radiogroup', { name: '部位' }).getByRole('radio', { name: /颈部/ }).click();
    await expect(page.locator('.dc-result__meta').first()).toContainText('会心率 0%');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/damage-${theme}-${info.project.name}.png`, fullPage: true });
  });
}

test('招式筛选与切换武器', async ({ page }) => {
  await page.goto('/world/damage/', { waitUntil: 'networkidle' });
  await page.getByRole('searchbox', { name: '按招式名筛选' }).fill('真蓄力');
  const items = page.getByRole('list', { name: '招式' }).getByRole('button');
  expect(await items.count()).toBeGreaterThan(0);
  for (const t of await items.allTextContents()) expect(t).toContain('真蓄力');
  await page.getByRole('radio', { name: '双剑' }).click();
  await expect(page.locator('.dc-result h2')).not.toContainText('纵斩');
});

test('没有配装时导入给出提示', async ({ page }) => {
  await page.goto('/world/damage/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '从配装器导入' }).click();
  await expect(page.getByRole('status')).toContainText('配装器');
});

test('从配装器导入武器数值', async ({ page }) => {
  // 辉剑火龙（编号 180）：真实攻击 270（显示 1296）、会心 25%、火属性 39（显示 390）
  await page.addInitScript(() => {
    localStorage.setItem(
      'mhdb-builder-v0',
      JSON.stringify({ weaponType: 'great-sword', weapon: { id: 180, decos: [] } }),
    );
  });
  await page.goto('/world/damage/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '从配装器导入' }).click();
  await expect(page.getByRole('status')).toContainText('辉剑火龙');
  await expect(page.getByLabel('攻击力（显示值）')).toHaveValue('1296');
  await expect(page.getByLabel('会心率 %')).toHaveValue('25');
  await expect(page.locator('.dc-fields select')).toHaveValue('fire');
  await expect(page.getByLabel('属性值（显示值）')).toHaveValue('390');
});
