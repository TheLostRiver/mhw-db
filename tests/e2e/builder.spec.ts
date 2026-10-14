import { expect, test, type Page } from '@playwright/test';

/**
 * 配装器 v0：页面能加载、选择器可用、数值与游戏截图一致、配装能保存、衣装开关生效。
 */

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

const open = async (page: Page) => {
  await page.goto('/world/builder/', { waitUntil: 'networkidle' });
  await expect(page.locator('.gb-equip')).toBeVisible();
};

/** 点栏位 → 搜索 → 回车 */
const pick = async (page: Page, trigger: string, query: string) => {
  await page.locator(trigger).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill(query);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
};

for (const theme of ['light', 'dark'] as const) {
  test(`空配装加载 · ${theme}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await open(page);
    await page.evaluate(() => document.fonts.ready);
    // 武器、5 件防具、护石、2 件衣装
    await expect(page.locator('.gb-row')).toHaveCount(9);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, '页面不应横向溢出').toBeLessThanOrEqual(1);
    expect(errors, '不应有控制台错误').toEqual([]);
    await page.screenshot({
      path: info.outputPath(`builder-${theme}-${info.project.name}.png`),
      fullPage: true,
    });
  });
}

test('选武器与饰品：黑龙玄刃 1632、龙 180；饰品技能计入', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);

  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  const detail = page.locator('.gb-detail');
  await expect(detail.locator('.gb-detail__name')).toHaveText('黑龙玄刃');
  await expect(detail).toContainText('1632');
  await expect(detail).toContainText('180');

  await pick(page, '.gb-slot[aria-label^="4 级镶嵌槽"]', '攻击珠2');
  const attack = page.locator('.gb-skills li', { hasText: '攻击' }).first();
  await expect(attack.locator('.gb-skills__lv b')).toHaveText('2');

  // 刷新后配装仍在
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.gb-row').first()).toContainText('黑龙玄刃');
  await expect(page.locator('.gb-skills')).toContainText('攻击');
  expect(errors).toEqual([]);
});

test('选择器：Esc 关闭，方向键移动选中项', async ({ page }) => {
  await open(page);
  await page.locator('.gb-row__piece[aria-label^="头部"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  const first = dialog.getByRole('option').first();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('衣装上的饰品只在衣装生效时计入', async ({ page }) => {
  await open(page);
  await pick(page, '.gb-row__piece[aria-label^="衣装 1"]', '隐身衣装');
  await pick(page, '.gb-row:has([aria-label^="衣装 1"]) .gb-slot', '挑战珠');
  const challenger = page.locator('.gb-skills li', { hasText: '挑战者' });
  await expect(challenger).toContainText('衣装生效时');
  await expect(challenger.locator('.gb-skills__lv b')).toHaveText('0');

  await page.locator('.gb-switch').click();
  await expect(challenger.locator('.gb-skills__lv b')).toHaveText('1');
  await expect(challenger).toContainText('生效中');
});

test('饰品选择器：卡片网格，按单技能 / 复合珠筛选', async ({ page }) => {
  await open(page);
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  await page.locator('.gb-slot').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.gb-picker__list--grid')).toBeVisible();
  await dialog.getByRole('radio', { name: '复合珠' }).click();
  const cards = dialog.getByRole('option');
  await expect(cards.first()).toBeVisible();
  for (const n of await cards
    .locator('.gb-picker__meta')
    .evaluateAll((els) => els.map((e) => e.querySelectorAll('.gb-skillrow').length)))
    expect(n).toBeGreaterThanOrEqual(2);
  await dialog.getByRole('radio', { name: '单技能' }).click();
  await expect(cards.first().locator('.gb-skillrow')).toHaveCount(1);
});

test('自定义强化：攻击力强化计入状态，镶嵌槽强化追加槽，超出格数上限的选项不可选', async ({ page }) => {
  await open(page);
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  await page.getByRole('radio', { name: '攻击力强化2' }).click();
  await expect(page.locator('.gb-custom__cost')).toContainText('5 / 6');
  // (340 + 10) × 4.8 = 1680
  await expect(page.locator('section[aria-labelledby="gb-stats-h"]')).toContainText('1680');
  // 稀有度 12 上限 6 格：攻击Ⅱ（5）+ 镶嵌槽Ⅰ（3）超出
  await expect(page.getByRole('radio', { name: '镶嵌槽强化1' })).toBeDisabled();
  await page.getByRole('radio', { name: '攻击力强化1' }).click();
  await page.getByRole('radio', { name: '镶嵌槽强化1' }).click();
  await expect(page.locator('.gb-custom__cost')).toContainText('6 / 6');
  await expect(page.locator('.gb-row').first().locator('.gb-slot')).toHaveCount(3);
  await expect(page.getByRole('radio', { name: '攻击力强化2' })).toBeDisabled();
});

test('冥赤龙觉醒：不可重复的能力在选择器里禁用', async ({ page }) => {
  await open(page);
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '赤龙断绝剑·火');
  await pick(page, '.gb-awk__slot >> nth=0', '攻击力强化6');
  await expect(page.locator('.gb-awk li').first()).toContainText('攻击力强化6');
  // 赤龙断绝剑 270 + 攻击力强化6（大剑 +14）= 284 → ×4.8 = 1363
  await expect(page.locator('section[aria-labelledby="gb-stats-h"]')).toContainText('1363');
  await page.locator('.gb-awk__slot').nth(1).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox').fill('攻击力强化6');
  await expect(dialog.getByRole('option').first()).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog).toContainText('此能力不能重复设定');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
});

test('发动条件：打开「怪物发怒」后挑战者计入状态', async ({ page }) => {
  await open(page);
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  await pick(page, '.gb-slot >> nth=0', '挑战珠2');
  const stats = page.locator('section[aria-labelledby="gb-stats-h"]');
  await expect(stats).toContainText('1632');
  const cond = page.getByRole('button', { name: /挑战者.*怪物发怒/ });
  await expect(cond).toHaveAttribute('aria-pressed', 'false');
  await cond.click();
  await expect(cond).toHaveAttribute('aria-pressed', 'true');
  // 挑战者 2：基础攻击力 +8 → (340 + 8) × 4.8 = 1670
  await expect(stats).toContainText('1670');
});
