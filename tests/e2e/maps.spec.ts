import { expect, test, type Page } from '@playwright/test';

/**
 * 地图：列表页、大地图页能加载；纸片、区域号、采集节点都画出来；楼层切换、区域跳转、
 * 节点筛选、环境状态、节点检视可用。
 * 纸片与物品图标由管线本机生成（不入库），缺图时测试会报 404 控制台错误。
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
  await page.getByRole('tab', { name: '区域' }).click();
  await page.getByRole('button', { name: '13 区' }).click();
  await expect(layers.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(".mv-area[data-state='current']")).toHaveCount(3);
});

test('采集节点：筛选、环境状态、节点检视', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/world/maps/ancient-forest/', { waitUntil: 'networkidle' });
  const markers = page.locator('.mv-node');
  const all = await markers.count();
  expect(all, '地面层应画出采集节点').toBeGreaterThan(100);

  // 只看矿脉：清空后勾选「矿脉」种类
  await page.getByRole('button', { name: '清空' }).click();
  await expect(markers).toHaveCount(0);
  await page.getByRole('radio', { name: '矿脉' }).click();
  await page
    .getByRole('button', { name: /^矿脉.*铁矿石|^矿脉.*绯鸢石/ })
    .first()
    .click();
  const mining = await markers.count();
  expect(mining).toBeGreaterThan(5);
  expect(mining).toBeLessThan(all);

  // 矿脉增殖中：地图上多出带绿圈的节点
  await page.getByRole('tab', { name: '环境状态' }).click();
  await page.getByRole('radio', { name: /矿脉增殖中/ }).click();
  await expect(page.locator('.mv-node__icon[data-extra]').first()).toBeAttached();
  expect(await markers.count()).toBeGreaterThan(mining);
  await expect(page.locator('.mv__env')).toHaveText(/矿脉增殖中/);

  // 点一个节点：右栏显示抽选表；切到下位，表里换成下位矿石
  // 标记互相叠着、也可能在可视范围外：直接给 Leaflet 的标记元素派发点击
  await page.locator('.mv-node').first().dispatchEvent('click');
  const detail = page.getByRole('article', { name: '所选节点' });
  await expect(detail.getByRole('heading', { name: '矿脉' })).toBeVisible();
  await page.getByRole('radio', { name: '下位' }).click();
  await expect(detail.getByRole('table')).toContainText('铁矿石');
  await detail.getByRole('button', { name: '同类的下一处' }).click();
  await expect(detail).toContainText(/同类 2 \/ \d+/);
  expect(errors, '不应有控制台错误').toEqual([]);
});

test('采集节点：按素材搜索', async ({ page }) => {
  await page.goto('/world/maps/ancient-forest/', { waitUntil: 'networkidle' });
  // 默认大师级：大师的矿脉出绯鸢石
  await page.getByRole('searchbox', { name: '搜索采集物' }).fill('绯鸢石');
  const rows = page.locator('.mv-kind');
  await expect(rows.first()).toContainText('矿脉');
  for (const text of await rows.allTextContents()) expect(text).toContain('绯鸢石');
  // 下位、上位才有的素材：提示切换等级
  await page.getByRole('searchbox', { name: '搜索采集物' }).fill('燕雀石');
  await expect(page.locator('.mv-empty')).toContainText('下位、上位的抽选表里有');
});

test('营地与地区徽章', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/world/maps/', { waitUntil: 'networkidle' });
  await expect(page.locator('.map-card__emblem')).toHaveCount(6);
  await page.goto('/world/maps/ancient-forest/', { waitUntil: 'networkidle' });
  // 地面层 3 个营地（南西、北西、北东），古代树营地在最上层
  const camps = page.locator(".mv-node__icon[data-cat='camp']");
  await expect(camps).toHaveCount(3);
  await page.getByRole('radiogroup', { name: '楼层' }).getByRole('radio', { name: '3' }).click();
  await expect(camps).toHaveCount(1);
  await page.locator('.mv-node:has(.mv-node__icon[data-cat="camp"])').dispatchEvent('click');
  await expect(page.getByRole('article', { name: '所选节点' })).toContainText('古代树营地(17)');
});

test('交互环境生物', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/world/maps/ancient-forest/', { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: '交互环境生物' }).click();
  const row = page.getByRole('button', { name: /回复蜜虫/ }).first();
  await expect(row).toBeVisible();
  await expect(page.locator(".mv-node__icon[data-cat='creature']").first()).toBeAttached();
  await page.locator('.mv-node:has(.mv-node__icon[data-cat="creature"])').first().dispatchEvent('click');
  await expect(page.getByRole('article', { name: '所选节点' })).toContainText('生物');
});
