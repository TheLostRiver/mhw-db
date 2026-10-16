/**
 * 数据校验（pnpm data:check，pnpm verify 也会跑）：结构、id 唯一、引用完整、文本覆盖。
 * 任何一项失败都会让构建前的检查失败。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Colors,
  Combinations,
  Constants,
  FILES,
  LANGS,
  MapNodes,
  Maps,
  Meta,
  Monsters,
  Moves,
  WeaponCustom,
} from './schema';

const ROOT = new URL('../../../../data/world/', import.meta.url);
const read = (rel: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(rel, ROOT)), 'utf-8'));

type Row = { id: number; name: Record<string, string> } & Record<string, unknown>;
const rows: Record<string, Row[]> = {};
for (const [file, { key }] of Object.entries(FILES)) {
  rows[file] = (read(file) as Record<string, Row[]>)[key] ?? [];
}

describe('结构', () => {
  it('meta.json / colors.json / weapon-custom.json / maps.json / moves.json', () => {
    Meta.parse(read('meta.json'));
    Colors.parse(read('colors.json'));
    WeaponCustom.parse(read('weapon-custom.json'));
    Constants.parse(read('constants.json'));
    Maps.parse(read('maps.json'));
    MapNodes.parse(read('map-nodes.json'));
    Moves.parse(read('moves.json'));
    Monsters.parse(read('monsters.json'));
    Combinations.parse(read('combinations.json'));
  });

  for (const [file, { schema }] of Object.entries(FILES)) {
    it(file, () => {
      const list = rows[file] ?? [];
      expect(list.length, `${file} 不应为空`).toBeGreaterThan(0);
      list.forEach((r, i) => {
        const res = schema.safeParse(r);
        if (!res.success) throw new Error(`${file} 第 ${i} 条（id ${r.id}）：${res.error.message}`);
      });
    });
  }
});

describe('id 唯一', () => {
  for (const file of Object.keys(FILES)) {
    it(file, () => {
      const seen = new Map<number, number>();
      for (const r of rows[file] ?? []) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
      const dup = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
      expect(dup, `${file} 重复的 id`).toEqual([]);
    });
  }
});

describe('引用完整', () => {
  const skillIds = new Set((rows['skills.json'] ?? []).map((s) => s.id));
  const itemIds = new Set((rows['items.json'] ?? []).map((s) => s.id));
  const missing = (ids: number[]) => ids.filter((id) => !skillIds.has(id));
  const refs = (list: unknown) => ((list ?? []) as { id: number }[]).map((s) => s.id);

  it('饰品、防具、护石的技能都存在', () => {
    for (const file of ['decorations.json', 'armor.json', 'charms.json']) {
      for (const r of rows[file] ?? []) {
        const ids = [
          ...refs(r.skills),
          ...['setSkill', 'hiddenSkill'].flatMap((k) => (r[k] ? [(r[k] as { id: number }).id] : [])),
        ];
        expect(missing(ids), `${file} id ${r.id}「${r.name['zh-Hans']}」引用了不存在的技能`).toEqual([]);
      }
    }
  });

  it('极意解锁引用的套装技能存在', () => {
    for (const s of rows['skills.json'] ?? []) {
      for (const lv of s.levels as { unlockedBy?: { skill: number }[] }[]) {
        expect(missing((lv.unlockedBy ?? []).map((u) => u.skill))).toEqual([]);
      }
    }
  });

  it('地图标记的种类、物品、抽选表、区域都存在', () => {
    const maps = new Map(Maps.parse(read('maps.json')).stages.map((s) => [s.id, s]));
    for (const st of MapNodes.parse(read('map-nodes.json')).stages) {
      const map = maps.get(st.id);
      expect(map, `st${st.id} 不在 maps.json 里`).toBeDefined();
      const kinds = new Map(st.kinds.map((k) => [k.key, k]));
      const areas = new Set(map!.patches.map((p) => `${p.layer}/${p.area}`));
      for (const n of st.nodes) {
        expect(kinds.has(n.kind), `st${st.id} 的点引用了不存在的种类 ${n.kind}`).toBe(true);
        if (n.layer !== null) expect(areas.has(`${n.layer}/${n.area}`), `st${st.id} ${n.kind}`).toBe(true);
      }
      for (const k of st.kinds) {
        if (k.item !== null) expect(itemIds.has(k.item), `st${st.id} ${k.key} 的物品 ${k.item}`).toBe(true);
        // 抽选表至少在一个等级里存在（只在上位起才有表的物件，下位不出现）
        for (const i of k.lots) {
          const found = st.ranks.some((rank) => st.lots[rank]?.[i] !== undefined);
          expect(found, `st${st.id} ${k.key} 的抽选表 ${i} 在各等级都不存在`).toBe(true);
        }
      }
      for (const rows of Object.values(st.lots)) {
        for (const e of Object.values(rows).flat()) expect(itemIds.has(e.item), `抽选表物品 ${e.item}`).toBe(true);
      }
    }
  });

  it('饰品、衣装对应的物品存在', () => {
    for (const d of rows['decorations.json'] ?? []) expect(itemIds.has(d.id), `饰品 ${d.id}`).toBe(true);
    for (const m of rows['mantles.json'] ?? []) expect(itemIds.has(m.itemId as number), `衣装 ${m.id}`).toBe(true);
  });

  it('调和的素材与成品都存在', () => {
    for (const c of Combinations.parse(read('combinations.json')).combinations) {
      for (const id of [...c.materials, c.result]) expect(itemIds.has(id), `调和 ${c.id} 的物品 ${id}`).toBe(true);
    }
  });

  it('觉醒能力的系列技能与升级链存在', () => {
    const custom = WeaponCustom.parse(read('weapon-custom.json'));
    const ids = new Set(custom.awakening.map((a) => a.id));
    for (const a of custom.awakening) {
      if (a.setSkill != null) expect(skillIds.has(a.setSkill), `觉醒 ${a.id} 的系列技能`).toBe(true);
      if (a.next != null) expect(ids.has(a.next), `觉醒 ${a.id} 的下一级`).toBe(true);
    }
  });
});

describe('文本覆盖', () => {
  it('名称四语覆盖率 ≥ 95%', () => {
    for (const [file, list] of Object.entries(rows)) {
      for (const lang of LANGS) {
        const n = list.filter((r) => r.name[lang]).length;
        expect(n / list.length, `${file} 的 ${lang} 名称覆盖率`).toBeGreaterThanOrEqual(0.95);
      }
    }
  });
});
