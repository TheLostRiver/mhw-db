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
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
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
  const first = dialog.locator('.gb-picker__list [role="option"]').first();
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
  const cards = dialog.locator('.gb-picker__list [role="option"]');
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
  const levels = (name: string) => page.getByRole('radiogroup', { name: `${name}等级` });
  const cost = page.locator('.gb-custom__cost');
  // 稀有度 12 基础 3 格：攻击Ⅱ（5 格）放不下，先选定，扩充后再试
  await levels('攻击力强化').getByRole('radio', { name: 'Ⅰ 级' }).click();
  await expect(cost).toContainText('3 / 3');
  // (340 + 5) × 4.8 = 1656
  await expect(page.locator('section[aria-labelledby="gb-stats-h"]')).toContainText('1656');
  await expect(levels('攻击力强化').getByRole('radio', { name: 'Ⅱ 级' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '攻击力强化：升一级' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '攻击力强化：升一级' })).toHaveAttribute('title', /格数不足/);
  await expect(levels('镶嵌槽强化').getByRole('radio', { name: 'Ⅰ 级' })).toBeDisabled();
  // 格子栏：3 格都被攻击占用
  await expect(page.locator('.gb-exbar__cell[data-used]')).toHaveCount(3);
  // 扩充自定义栏：三级各 +1 格，上限 3 → 6
  await levels('扩充自定义栏').getByRole('radio', { name: 'Ⅲ 级' }).click();
  await expect(cost).toContainText('3 / 6');
  await expect(levels('攻击力强化').getByRole('radio', { name: 'Ⅱ 级' })).toBeEnabled();
  await levels('镶嵌槽强化').getByRole('radio', { name: 'Ⅰ 级' }).click();
  await expect(cost).toContainText('6 / 6');
  await expect(page.locator('.gb-row').first().locator('.gb-slot')).toHaveCount(3);
  await expect(levels('攻击力强化').getByRole('radio', { name: 'Ⅱ 级' })).toBeDisabled();
  // 取消扩充后退回基础 3 格，放不下的强化会被裁掉
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '扩充自定义栏：降一级' }).click();
  await expect(cost).toContainText('3 / 3');
  await expect(page.locator('.gb-row').first().locator('.gb-slot')).toHaveCount(2);
});

test('零件强化：只有支援的武器才有零件强化页；没强化到头的武器没有客制', async ({ page }) => {
  await open(page);
  // 黑龙玄刃是专属外形，不支援零件强化：没有翻页箭头，显示游戏原文
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  const custom = page.locator('.gb-detail .gb-custom');
  await expect(custom).toContainText('此武器不支援零件强化。');
  await expect(custom.locator('.gb-cus-head__nav')).toHaveCount(0);
  // 皇金武器（稀有度 12）是拼装外形，可以翻到零件强化页
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '皇金大剑·王');
  await expect(custom).not.toContainText('此武器不支援零件强化');
  await custom.getByRole('button', { name: '下一页：零件强化' }).click();
  await expect(custom.locator('.gb-cus-head__title')).toContainText('零件强化');
  await expect(custom.locator('.gb-parts li')).toHaveCount(7);
  // 迅雷断裂斧1 还能强化成 2：游戏里不能自定义强化
  await page.locator('.gb-row__piece[aria-label^="武器"]').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox').fill('迅雷断裂斧1');
  await page.keyboard.press('Enter');
  await expect(custom).toContainText('还能继续强化');
  await expect(custom.locator('.gb-aug')).toHaveCount(0);
});

test('武器选择器：卡片列出数值与斩味，按类别、属性筛选，键盘可选', async ({ page }) => {
  await open(page);
  await page.locator('.gb-row__piece[aria-label^="武器"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  const cards = dialog.locator('.gb-wcard');
  await expect(cards.first()).toBeVisible();
  // 默认大师、按攻击力降序：每张卡都是稀有度 9 以上，带斩味条
  const rares = await cards.locator('.gb-wcard__rare').allInnerTexts();
  expect(rares.every((r) => Number(r.replace('RARE ', '')) >= 9)).toBe(true);
  await expect(cards.first().locator('.gb-wcard__blade i').first()).toBeVisible();
  // 冥赤龙：全是赤龙系列
  await dialog.getByRole('radio', { name: '冥赤龙' }).click();
  const names = await cards.locator('.gb-wcard__name').allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((n) => n.startsWith('赤龙'))).toBe(true);
  // 绚辉龙 + 雷属性：只剩皇金 / 铠罗炎 / 金色的雷属性武器
  await dialog.getByRole('radio', { name: '绚辉龙' }).click();
  await dialog.getByRole('radio', { name: '雷' }).click();
  for (const n of await cards.locator('.gb-wcard__name').allInnerTexts()) expect(n).toMatch(/雷$/);
  // 方向键移动、回车选择
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.gb-detail__name')).toContainText('雷');
});

test('自动配装：可以直接选武器并设定自定义强化', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: /自动配装/ }).click();
  const form = page.locator('.gb-as__form');
  await form.locator('.gb-as__wpick').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox').fill('黑龙玄刃');
  await page.keyboard.press('Enter');
  await expect(form.locator('.gb-as__wcard')).toContainText('黑龙玄刃');
  await expect(form.getByRole('radio', { name: /用这把武器/ })).toBeChecked();
  // 客制与武器在同一张卡里：镶嵌槽强化Ⅰ（3 格）追加一个 1 级槽
  const custom = form.locator('.gb-as__card--weapon .gb-as__cside');
  await expect(custom).toContainText('自定义强化');
  await custom
    .getByRole('radiogroup', { name: '镶嵌槽强化等级' })
    .getByRole('radio', { name: 'Ⅰ 级' })
    .click();
  await expect(custom.locator('.gb-exbar__cell[data-used]')).toHaveCount(3);
  await expect(form.locator('.gb-as__wcard .gb-slot-plus')).toHaveCount(1);
  // 武器面板的数值含客制：镶嵌槽强化不加数值，没有金色「+N」
  await expect(form.locator('.gb-as__wplus')).toHaveCount(0);
  // 有零件强化的武器在面板里是两个页签（黑龙玄刃不支援零件强化，只有标题）
  await expect(custom.getByRole('tab')).toHaveCount(0);
  // 不指定武器：整块变淡，改为指定镶嵌槽
  await form.getByRole('radio', { name: '不指定武器' }).check();
  await expect(form.locator('.gb-as__wpanel')).toHaveAttribute('data-off', '');
  await expect(form.getByRole('combobox', { name: '第 1 个槽' })).toBeVisible();
  await form.getByRole('radio', { name: '用这把武器' }).check();
  await expect(form.getByRole('combobox', { name: '第 1 个槽' })).toHaveCount(0);
  // 手动配装里是同一把武器、同样的强化
  await page.getByRole('tab', { name: '手动配装' }).click();
  await expect(page.locator('.gb-row').first().locator('.gb-slot')).toHaveCount(3);
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
  await expect(dialog.locator('.gb-picker__list [role="option"]').first()).toHaveAttribute(
    'aria-disabled',
    'true',
  );
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

test('自动配装：按技能搜索，应用方案后写回手动配装', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  await page.getByRole('tab', { name: /自动配装/ }).click();
  const form = page.locator('.gb-as__form');
  await expect(form).toBeVisible();

  // 内联搜索连续添加：输入、回车，焦点留在框里接着输入
  const search = form.getByRole('combobox', { name: '添加技能' });
  for (const [name, level] of [
    ['攻击', 7],
    ['弱点特效', 3],
  ] as const) {
    await search.fill(name);
    await expect(form.getByRole('listbox', { name: '添加技能' }).getByRole('option').first()).toContainText(
      name,
    );
    await page.keyboard.press('Enter');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await form
      .getByRole('radiogroup', { name: `${name} 等级` })
      .getByRole('radio', { name: `${level} 级` })
      .click();
  }
  // 指令条上有条件摘要；Ctrl + Enter 直接搜索
  const bar = page.locator('.gb-as__bar');
  await expect(bar).toContainText('攻击7');
  await page.keyboard.press('Control+Enter');
  const plans = page.locator('.gb-plan');
  await expect(plans.first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.gb-as__head')).toContainText('搜到');
  await expect(bar).not.toHaveAttribute('data-stale');

  // 从方案卡片排除一件防具，排除列表里出现它
  const firstArmor = plans.first().locator('.gb-plan__equip li').nth(1);
  const armorName = (await firstArmor.locator('.gb-plan__name').innerText()).trim();
  await firstArmor.hover();
  await firstArmor.getByRole('button', { name: `排除 ${armorName}` }).click();
  await expect(form.locator('.gb-as__chip', { hasText: armorName })).toBeVisible();
  // 条件变了：指令条提示，按钮变成「重新搜索」
  await expect(bar).toHaveAttribute('data-stale', '');
  await expect(bar).toContainText('条件已更改');

  // 重新搜索后应用第一个方案
  await bar.getByRole('button', { name: '重新搜索' }).click();
  await expect(plans.first()).toBeVisible({ timeout: 15_000 });
  await plans.first().getByRole('button', { name: '应用此方案' }).click();
  await expect(page.getByRole('tab', { name: '手动配装' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.gb-row').first()).toContainText('黑龙玄刃');
  const attack = page.locator('.gb-skills li', { hasText: /^攻击/ }).first();
  await expect(attack.locator('.gb-skills__lv b')).toHaveText('7');
  const weakness = page.locator('.gb-skills li', { hasText: '弱点特效' });
  await expect(weakness.locator('.gb-skills__lv b')).toHaveText('3');
  await expect(page.locator('.gb-equip')).not.toContainText(armorName);
  expect(errors).toEqual([]);
});

test('下拉框：键盘与鼠标都能选择，Esc 关闭不改值', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: /自动配装/ }).click();
  const rarity = page.getByRole('combobox', { name: '防具 / 护石稀有度' });
  await rarity.focus();
  await page.keyboard.press('ArrowDown'); // 打开，停在当前值「不限」
  await expect(rarity).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(rarity).toHaveAttribute('aria-expanded', 'false');
  await expect(rarity).toContainText('R9 以上');

  const limit = page.getByRole('combobox', { name: '最多列出' });
  await limit.click();
  await page.getByRole('listbox', { name: '最多列出' }).getByRole('option', { name: '5000 个方案' }).click();
  await expect(limit).toContainText('5000 个方案');

  await limit.click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(limit).toContainText('5000 个方案');
});

test('撤销 / 重做与快捷键', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const undo = page.getByRole('button', { name: '撤销' });
  const redo = page.getByRole('button', { name: '重做' });
  await expect(undo).toBeDisabled();
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  const weaponRow = page.locator('.gb-row').first();
  await expect(weaponRow).toContainText('黑龙玄刃');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await expect(weaponRow).not.toContainText('黑龙玄刃');
  await undo.click();
  await expect(weaponRow).toContainText('黑龙玄刃');
  await redo.click();
  await expect(weaponRow).not.toContainText('黑龙玄刃');
  // Ctrl+Z 撤销
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(weaponRow).toContainText('黑龙玄刃');
});

test('分享链接：复制的地址打开后还原配装', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', '剪贴板权限只在 Chromium 里授予');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await pick(page, '.gb-row__piece[aria-label^="武器"]', '黑龙玄刃');
  await pick(page, '.gb-slot[aria-label^="4 级镶嵌槽"]', '攻击珠2');
  await page.getByRole('button', { name: '分享' }).click();
  await expect(page.getByRole('status').filter({ hasText: '分享链接已复制' })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/world\/builder\/#b=[A-Za-z0-9_-]+$/);

  // 新的浏览器页（没有本机存档）打开分享链接
  const other = await context.newPage();
  await other.addInitScript(() => localStorage.clear());
  await other.goto(url, { waitUntil: 'networkidle' });
  await expect(other.locator('.gb-row').first()).toContainText('黑龙玄刃');
  await expect(other.locator('.gb-skills')).toContainText('攻击');
  // 地址栏里的片段读完后去掉
  expect(new URL(other.url()).hash).toBe('');
});
