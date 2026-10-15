import { describe, expect, it } from 'vitest';
import {
  searchBuilds,
  type ArmorPiece,
  type CharmPiece,
  type DecorationPiece,
  type SearchIndex,
  type SearchQuery,
  type SearchResult,
  type SkillInfo,
} from './search';

/** 第二个参数只是让测试读起来清楚（部位由放进哪个数组决定） */
function armor(
  id: number,
  _slot: 'head' | 'chest' | 'arms' | 'waist' | 'legs',
  rarity: number,
  defense: number,
  skills: Array<{ id: number; level: number }>,
  slots: number[] = [],
  setSkill?: { id: number; points: number },
): ArmorPiece {
  return { id, name: `Armor${id}`, rarity, defense, skills, slots, setSkill: setSkill ?? null };
}

function charm(id: number, rarity: number, skills: Array<{ id: number; level: number }>): CharmPiece {
  return { id, name: `Charm${id}`, rarity, skills };
}

function deco(id: number, size: number, skills: Array<{ id: number; level: number }>): DecorationPiece {
  return { id, name: `Deco${id}`, size, skills };
}

function skill(
  id: number,
  maxLevel: number,
  setBonus = false,
  baseMaxLevel?: number,
  setBonusLevels?: number[],
  unlockedBy?: Array<{ skill: number; level: number }>,
): SkillInfo {
  return {
    id,
    name: `Skill${id}`,
    maxLevel,
    baseMaxLevel: baseMaxLevel ?? maxLevel,
    setBonus,
    ...(setBonusLevels ? { setBonusLevels } : {}),
    ...(unlockedBy ? { unlockedBy } : {}),
  };
}

describe('searchBuilds', () => {
  it('找到简单的防具 + 护石 + 饰品组合', () => {
    const index: SearchIndex = {
      armor: {
        head: [armor(1, 'head', 12, 100, [{ id: 19, level: 2 }], [4])],
        chest: [armor(2, 'chest', 12, 100, [{ id: 48, level: 1 }], [4])],
        arms: [armor(3, 'arms', 12, 100, [], [])],
        waist: [armor(4, 'waist', 12, 100, [], [])],
        legs: [armor(5, 'legs', 12, 100, [], [])],
      },
      charms: [charm(10, 12, [{ id: 19, level: 1 }])],
      decorations: [deco(100, 2, [{ id: 48, level: 1 }])],
      skills: [skill(19, 7), skill(48, 7)],
    };
    const query: SearchQuery = {
      skills: [
        { id: 19, level: 3 },
        { id: 48, level: 2 },
      ],
      weaponSlots: [4],
    };
    const results: SearchResult[] = [];
    searchBuilds(index, query, (r) => {
      results.push(r);
    });
    expect(results.length).toBeGreaterThan(0);
    const first = results[0]!;
    expect(first.armor.head).toBe(1);
    expect(first.charm).toBe(10);
    expect(first.levels[19]).toBe(3);
    expect(first.levels[48]).toBe(2);
  });

  it('套装技能按件数映射档位：黑龙的传说 [2, 4]，3 件算 2、4 件算 4', () => {
    const dragon = (id: number, slot: 'head' | 'chest' | 'arms' | 'waist' | 'legs') =>
      armor(id, slot, 12, 180, [], [4], { id: 222, points: 1 });
    const plain = (id: number, slot: 'head' | 'chest' | 'arms' | 'waist' | 'legs') =>
      armor(id, slot, 12, 150, [], [4, 4]);
    const index: SearchIndex = {
      armor: {
        head: [dragon(1, 'head'), plain(11, 'head')],
        chest: [dragon(2, 'chest'), plain(12, 'chest')],
        arms: [dragon(3, 'arms'), plain(13, 'arms')],
        waist: [dragon(4, 'waist'), plain(14, 'waist')],
        legs: [plain(15, 'legs')],
      },
      charms: [],
      decorations: [],
      skills: [skill(222, 4, true, 4, [2, 4])],
    };
    const run = (level: number, limitArmor?: SearchQuery['limitArmor']) => {
      const out: SearchResult[] = [];
      searchBuilds(
        index,
        {
          skills: [],
          setSkills: [{ id: 222, level }],
          weaponSlots: [],
          ...(limitArmor ? { limitArmor } : {}),
        },
        (r) => {
          out.push(r);
        },
      );
      return out;
    };
    const count = (r: SearchResult) => Object.values(r.armor).filter((id) => id != null && id < 10).length;
    const lv4 = run(4);
    expect(lv4.length).toBeGreaterThan(0);
    for (const r of lv4) {
      expect(count(r)).toBe(4);
      expect(r.setLevels[222]).toBe(4);
    }
    // 腰部限定为普通防具：只剩 3 件黑龙 → 2 档成立、4 档不成立
    const three = run(2, { waist: [14] });
    expect(three.length).toBeGreaterThan(0);
    for (const r of three) {
      expect(count(r)).toBe(3);
      expect(r.setLevels[222]).toBe(2);
    }
    expect(run(4, { waist: [14] })).toHaveLength(0);
  });

  it('极意技能的解锁条件', () => {
    // 挑战者 6 / 7 需要黑龙的传说 2
    const index: SearchIndex = {
      armor: {
        head: [armor(1, 'head', 12, 180, [{ id: 62, level: 3 }], [4, 2], { id: 222, points: 1 })],
        chest: [armor(2, 'chest', 12, 180, [{ id: 62, level: 3 }], [4], { id: 222, points: 1 })],
        arms: [armor(3, 'arms', 12, 180, [{ id: 62, level: 1 }], [4], { id: 222, points: 1 })],
        waist: [armor(4, 'waist', 12, 180, [], [4, 4], { id: 222, points: 1 })],
        legs: [armor(5, 'legs', 12, 180, [], [4, 2])],
      },
      charms: [],
      decorations: [deco(900, 2, [{ id: 62, level: 1 }])],
      skills: [
        skill(62, 7, false, 5, undefined, [
          { skill: 222, level: 2 },
          { skill: 222, level: 4 },
        ]),
        skill(222, 4, true, 4, [2, 4]),
      ],
    };
    const query: SearchQuery = {
      setSkills: [{ id: 222, level: 2 }],
      skills: [{ id: 62, level: 7 }],
      weaponSlots: [],
    };
    const results: SearchResult[] = [];
    searchBuilds(index, query, (r) => {
      results.push(r);
    });
    expect(results.length).toBeGreaterThan(0);
    const first = results[0]!;
    expect(first.setLevels[222]).toBeGreaterThanOrEqual(2);
    expect(first.levels[62]).toBe(7);
  });

  it('武器固定提供的技能点与套装件数计入', () => {
    const dragon = (id: number) =>
      armor(id, 'head', 12, 180, [{ id: 62, level: 2 }], [], { id: 222, points: 1 });
    const index: SearchIndex = {
      armor: {
        head: [dragon(1)],
        chest: [dragon(2)],
        arms: [dragon(3)],
        waist: [armor(4, 'waist', 12, 150, [])],
        legs: [armor(5, 'legs', 12, 150, [])],
      },
      charms: [],
      decorations: [],
      skills: [skill(62, 7, false, 5, undefined, [{ skill: 222, level: 4 }]), skill(222, 4, true, 4, [2, 4])],
    };
    const query: SearchQuery = { skills: [{ id: 62, level: 7 }], weaponSlots: [] };
    const run = (q: SearchQuery) => {
      const out: SearchResult[] = [];
      searchBuilds(index, q, (r) => {
        out.push(r);
      });
      return out;
    };
    // 3 件黑龙只有 2 档，挑战者被卡在 5；点数也只有 6
    expect(run(query)).toHaveLength(0);
    // 武器提供挑战者 +1、黑龙 +1 件 → 4 件解锁、点数 7
    const out = run({ ...query, fixedSkills: [{ id: 62, level: 1 }], fixedSets: [{ id: 222, points: 1 }] });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.levels[62]).toBe(7);
    expect(out[0]!.setLevels[222]).toBe(4);
  });

  it('maxResults 限制返回数量', () => {
    const index: SearchIndex = {
      armor: {
        head: [
          armor(1, 'head', 12, 100, [{ id: 19, level: 1 }]),
          armor(2, 'head', 12, 100, [{ id: 19, level: 1 }]),
        ],
        chest: [armor(3, 'chest', 12, 100, [])],
        arms: [armor(4, 'arms', 12, 100, [])],
        waist: [armor(5, 'waist', 12, 100, [])],
        legs: [armor(6, 'legs', 12, 100, [])],
      },
      charms: [],
      decorations: [],
      skills: [skill(19, 7)],
    };
    const query: SearchQuery = {
      skills: [{ id: 19, level: 1 }],
      weaponSlots: [],
      maxResults: 1,
    };
    const results: SearchResult[] = [];
    searchBuilds(index, query, (r) => {
      results.push(r);
    });
    expect(results.length).toBe(1);
  });

  it('排除指定的防具 / 护石 / 饰品', () => {
    const index: SearchIndex = {
      armor: {
        head: [armor(1, 'head', 12, 100, [{ id: 19, level: 2 }], [4])],
        chest: [armor(2, 'chest', 12, 100, [{ id: 19, level: 1 }], [4])],
        arms: [armor(3, 'arms', 12, 100, [], [])],
        waist: [armor(4, 'waist', 12, 100, [], [])],
        legs: [armor(5, 'legs', 12, 100, [], [])],
      },
      charms: [charm(10, 12, [{ id: 19, level: 1 }])],
      decorations: [deco(100, 4, [{ id: 19, level: 1 }])],
      skills: [skill(19, 7)],
    };
    const query: SearchQuery = {
      skills: [{ id: 19, level: 3 }],
      weaponSlots: [],
      excludeArmor: [1],
      excludeCharms: [10],
      excludeDecorations: [100],
    };
    const results: SearchResult[] = [];
    searchBuilds(index, query, (r) => {
      results.push(r);
    });
    // 只能用 id=2 的防具（2 点）+ 护石被排除 + 饰品被排除 → 凑不齐 3 点
    expect(results.length).toBe(0);
  });

  it('限制稀有度', () => {
    const index: SearchIndex = {
      armor: {
        head: [
          armor(1, 'head', 9, 100, [{ id: 19, level: 2 }]),
          armor(2, 'head', 12, 150, [{ id: 19, level: 2 }]),
        ],
        chest: [armor(3, 'chest', 12, 100, [])],
        arms: [armor(4, 'arms', 12, 100, [])],
        waist: [armor(5, 'waist', 12, 100, [])],
        legs: [armor(6, 'legs', 12, 100, [])],
      },
      charms: [],
      decorations: [],
      skills: [skill(19, 7)],
    };
    const query: SearchQuery = {
      skills: [{ id: 19, level: 2 }],
      weaponSlots: [],
      minRarity: 12,
    };
    const results: SearchResult[] = [];
    searchBuilds(index, query, (r) => {
      results.push(r);
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.armor.head).toBe(2);
    }
  });

  it('指定部位只能用某些防具', () => {
    const index: SearchIndex = {
      armor: {
        head: [
          armor(1, 'head', 12, 100, [{ id: 19, level: 1 }]),
          armor(2, 'head', 12, 150, [{ id: 19, level: 2 }]),
        ],
        chest: [armor(3, 'chest', 12, 100, [])],
        arms: [armor(4, 'arms', 12, 100, [])],
        waist: [armor(5, 'waist', 12, 100, [])],
        legs: [armor(6, 'legs', 12, 100, [])],
      },
      charms: [],
      decorations: [],
      skills: [skill(19, 7)],
    };
    const query: SearchQuery = {
      skills: [{ id: 19, level: 2 }],
      weaponSlots: [],
      limitArmor: { head: [2] },
    };
    const results: SearchResult[] = [];
    searchBuilds(index, query, (r) => {
      results.push(r);
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.armor.head).toBe(2);
    }
  });
});
