/**
 * 测试用：独立于搜索实现，按 id 回查原始索引，复核一个方案是否真的满足查询。
 * 只在单元测试里用，不进生产包。
 */
import { ARMOR_SLOTS, type SearchIndex, type SearchQuery, type SearchResult } from './search';

export function verifyResult(index: SearchIndex, query: SearchQuery, r: SearchResult): string | null {
  const skills = new Map(index.skills.map((s) => [s.id, s]));
  const decos = new Map(index.decorations.map((d) => [d.id, d]));
  const points = new Map<number, number>();
  const sets = new Map<number, number>();
  const add = (id: number, n: number) => points.set(id, (points.get(id) ?? 0) + n);

  const placeDecos = (slots: number[], placed: Array<number | null>, where: string): string | null => {
    if (placed.length > slots.length) return `${where}：饰品数多于槽数`;
    for (let i = 0; i < placed.length; i++) {
      const id = placed[i];
      if (id == null) continue;
      const d = decos.get(id);
      if (!d) return `${where}：未知饰品 ${id}`;
      if (d.size > slots[i]!) return `${where}：${d.size} 级饰品放进了 ${slots[i]} 级槽`;
      if (query.excludeDecorations && [...query.excludeDecorations].includes(id))
        return `用了被排除的饰品 ${id}`;
      for (const s of d.skills) add(s.id, s.level);
    }
    return null;
  };

  let err = placeDecos(query.weaponSlots, r.decorations.weapon, '武器');
  if (err) return err;
  let defense = 0;
  for (const slot of ARMOR_SLOTS) {
    const id = r.armor[slot];
    if (id == null) {
      if (r.decorations.armor[slot].some((d) => d != null)) return `${slot}：没装备却有饰品`;
      continue;
    }
    const a = index.armor[slot].find((p) => p.id === id);
    if (!a) return `${slot}：未知防具 ${id}`;
    if (a.rarity < (query.minRarity ?? 0)) return `${slot}：稀有度不够`;
    if (query.excludeArmor && [...query.excludeArmor].includes(id)) return `用了被排除的防具 ${id}`;
    const limit = query.limitArmor?.[slot];
    if (limit?.length && !limit.includes(id)) return `${slot}：不在限定范围内`;
    defense += a.defense;
    for (const s of a.skills) add(s.id, s.level);
    if (a.setSkill) sets.set(a.setSkill.id, (sets.get(a.setSkill.id) ?? 0) + a.setSkill.points);
    err = placeDecos(a.slots, r.decorations.armor[slot], slot);
    if (err) return err;
  }
  if (defense !== r.defense) return `防御合计不符：${defense} ≠ ${r.defense}`;
  if (r.charm != null) {
    const c = index.charms.find((x) => x.id === r.charm);
    if (!c) return `未知护石 ${r.charm}`;
    if (query.excludeCharms && [...query.excludeCharms].includes(c.id)) return `用了被排除的护石 ${c.id}`;
    for (const s of c.skills) add(s.id, s.level);
  }

  const setLevel = (id: number) => {
    const n = sets.get(id) ?? 0;
    let lv = 0;
    for (const t of skills.get(id)?.setBonusLevels ?? []) if (t <= n && t > lv) lv = t;
    return lv;
  };
  for (const { id, level } of query.setSkills ?? []) {
    if (setLevel(id) < level) return `套装技能 ${id} 只有 ${setLevel(id)} 档，要求 ${level}`;
  }
  for (const { id, level } of query.skills) {
    const info = skills.get(id);
    const unlocked = !info?.unlockedBy?.length || info.unlockedBy.some((c) => setLevel(c.skill) >= c.level);
    const cap = unlocked ? (info?.maxLevel ?? 99) : (info?.baseMaxLevel ?? 99);
    const got = Math.min(points.get(id) ?? 0, cap);
    if (got < level)
      return `技能 ${id} 只有 ${got} 级（点数 ${points.get(id) ?? 0}，上限 ${cap}），要求 ${level}`;
    if (r.levels[id] !== got) return `技能 ${id} 结果写 ${r.levels[id]}，实际 ${got}`;
  }
  return null;
}
