import { describe, expect, it } from 'vitest';
import {
  augmentCost,
  awakeningConflict,
  capFor,
  chosenAwakening,
  computeSkills,
  computeStats,
  emptyBuild,
  fitDecos,
  makeIndex,
  partTotals,
  chosenParts,
  setAugment,
  weaponSlots,
  type AugmentLevel,
  type AwakeningData,
  type BuilderData,
  type SkillData,
  type WeaponData,
} from './builder';

function aug(id: number, category: AugmentLevel['category'], level: number, slotCost: number): AugmentLevel {
  return { id, category, level, slotCost, name: `${category}${level}`, desc: '' };
}

const awk = (id: number, extra: Partial<AwakeningData>): AwakeningData => ({
  id,
  category: 'attack',
  rank: 1,
  name: `能力${id}`,
  desc: '',
  stackable: true,
  onePerCategory: false,
  setSkill: null,
  ...extra,
});

const lv = (
  level: number,
  params: number[] = [0, 0, 0, 0],
  unlockedBy?: { skill: number; level: number }[],
) => ({
  level,
  desc: '',
  params,
  ...(unlockedBy ? { unlockedBy } : {}),
});

const skill = (
  id: number,
  name: string,
  levels: ReturnType<typeof lv>[],
  extra: Partial<SkillData> = {},
): SkillData => ({
  id,
  name,
  setBonus: false,
  iconColor: 0,
  maxLevel: Math.max(...levels.map((l) => l.level)),
  baseMaxLevel: Math.max(...levels.filter((l) => !l.unlockedBy).map((l) => l.level)),
  levels,
  ...extra,
});

// 数值取自真实数据（攻击、看破、挑战者、黑龙的传说），结构简化
const data: BuilderData = {
  meta: { steamBuildId: null, builtAt: '' },
  colors: { rarity: [], icon: [] },
  skills: [
    skill(19, '攻击', [lv(1, [3, 0]), lv(2, [6, 0]), lv(3, [9, 0]), lv(4, [12, 5])]),
    skill(48, '看破', [lv(1, [5]), lv(2, [10])]),
    skill(62, '挑战者', [
      lv(1),
      lv(2),
      lv(3),
      lv(4),
      lv(5),
      lv(6, undefined, [{ skill: 222, level: 2 }]),
      lv(7, undefined, [{ skill: 222, level: 2 }]),
    ]),
    skill(222, '黑龙的传说', [lv(2), lv(4)], { setBonus: true }),
  ],
  decorations: [
    { id: 900, name: '挑战珠【2】', size: 2, rarity: 6, skills: [{ id: 62, level: 1 }], iconColor: 0 },
    { id: 901, name: '攻击珠2【4】', size: 4, rarity: 9, skills: [{ id: 19, level: 2 }], iconColor: 0 },
  ],
  armor: [
    {
      id: 1,
      name: '龙头头盔',
      slot: 'head',
      rarity: 12,
      defense: 180,
      resist: [-1, 2, 2, 0, -4],
      slots: [4, 2],
      skills: [{ id: 62, level: 3 }],
      setSkill: { id: 222, points: 1 },
      series: '龙',
    },
    {
      id: 2,
      name: '龙皮',
      slot: 'chest',
      rarity: 12,
      defense: 180,
      resist: [-1, 2, 2, 0, -4],
      slots: [4],
      skills: [{ id: 62, level: 3 }],
      setSkill: { id: 222, points: 1 },
      series: '龙',
    },
  ],
  charms: [{ id: 5, name: '攻击护石', rarity: 10, skills: [{ id: 19, level: 1 }] }],
  mantles: [{ id: 1, name: '隐身衣装', slots: [3, 3], icon: { id: 112, color: 0 } }],
  // 栏位占用与效果取自 weapon-custom.json（new_lb 与 pl_param）
  augments: {
    levels: [
      aug(4, 'attack', 1, 3),
      aug(5, 'attack', 2, 5),
      aug(8, 'affinity', 1, 2),
      aug(12, 'defense', 1, 1),
      aug(16, 'slot', 1, 3),
      aug(17, 'slot', 2, 6),
    ],
    effects: {
      attack: [5, 10, 15, 25],
      affinity: [10, 15, 20, 25],
      defense: [15, 25, 35, 50],
      element: [3, 6, 9, 12],
      elementMultiplier: { 'great-sword': 1.2 },
    },
  },
};
const weapons: WeaponData[] = [
  {
    id: 239,
    name: '黑龙玄刃',
    rarity: 12,
    attack: 340,
    affinity: -30,
    defense: 0,
    element: { type: 'dragon', value: 18 },
    hiddenElement: null,
    elderseal: 3,
    slots: [4, 4],
    skill: null,
  },
];
weapons.push(
  { ...weapons[0]!, id: 300, name: '赤龙断绝剑·火', attack: 270, affinity: 5, slots: [4], awakened: true },
  { ...weapons[0]!, id: 301, name: '上位大剑', rarity: 8, slots: [1] },
);
const awakening = [
  awk(1, { effect: { kind: 'attack', amount: 2 } }),
  awk(6, { rank: 6, stackable: false, effect: { kind: 'attack', amount: 14 } }),
  awk(24, { category: 'element', rank: 6, stackable: false, effect: { kind: 'element', amount: 15 } }),
  awk(37, { category: 'slot', rank: 3, stackable: false, effect: { kind: 'slotLevel', amount: 1 } }),
  awk(97, { category: 'setBonus', rank: 3, stackable: false, onePerCategory: true, setSkill: 222 }),
  awk(98, { category: 'setBonus', rank: 3, stackable: false, onePerCategory: true, setSkill: 62 }),
];
const parts = [
  { id: 1, stage: 1, name: '大贼龙零件', desc: '', effect: { attack: 1 } },
  { id: 2, stage: 2, name: '冰鱼龙零件', desc: '', effect: { defense: 10 } },
  { id: 3, stage: 2, name: '猛牛龙零件', desc: '', effect: { attack: 1 } },
];
const idx = makeIndex(data, { weapons, parts, awakening });

describe('computeSkills', () => {
  it('合计点数并受基础上限约束', () => {
    const b = emptyBuild();
    b.armor.head = { id: 1, decos: [900, null] };
    b.armor.chest = { id: 2, decos: [] };
    // 挑战者 3 + 3 + 1 = 7，但只有 2 件黑龙 → 黑龙的传说 2 发动 → 上限 7
    const s = computeSkills(b, idx).find((x) => x.skill.id === 62)!;
    expect(s.counted).toBe(7);
    expect(s.cap).toBe(7);
    expect(s.level).toBe(7);
    const set = computeSkills(b, idx).find((x) => x.skill.id === 222)!;
    expect(set.activeSetLevels).toEqual([2]);
  });

  it('套装件数不足时极意不解锁', () => {
    const b = emptyBuild();
    b.armor.head = { id: 1, decos: [900, null] };
    const s = computeSkills(b, idx).find((x) => x.skill.id === 62)!;
    expect(s.counted).toBe(4);
    expect(s.cap).toBe(5);
    b.armor.head.decos = [900, 900];
    b.charm = null;
    const s2 = computeSkills({ ...b, armor: { ...b.armor, chest: { id: 2, decos: [] } } }, idx).find(
      (x) => x.skill.id === 62,
    )!;
    expect(s2.cap).toBe(7);
  });

  it('衣装上的饰品只在衣装生效时计入', () => {
    const b = emptyBuild();
    b.mantles[0] = { id: 1, decos: [900, 900] };
    let s = computeSkills(b, idx).find((x) => x.skill.id === 62)!;
    expect([s.points, s.mantlePoints, s.level]).toEqual([0, 2, 0]);
    b.mantleActive = true;
    s = computeSkills(b, idx).find((x) => x.skill.id === 62)!;
    expect(s.level).toBe(2);
  });

  it('超出上限的点数记为浪费', () => {
    const b = emptyBuild();
    b.armor.head = { id: 1, decos: [901, 900] };
    b.charm = 5;
    b.weapon = { id: 239, decos: [901, 901] };
    const atk = computeSkills(b, idx).find((x) => x.skill.id === 19)!;
    expect(atk.counted).toBe(7); // 2 + 2 + 2 + 1
    expect(atk.cap).toBe(4);
    expect(atk.over).toBe(3);
  });
});

describe('capFor', () => {
  it('逐级解锁，中间断开则停止', () => {
    const s = data.skills.find((x) => x.id === 62)!;
    expect(capFor(s, new Map())).toBe(5);
    expect(capFor(s, new Map([[222, 2]]))).toBe(7);
    expect(capFor(s, new Map([[222, 1]]))).toBe(5);
  });
});

describe('computeStats', () => {
  it('黑龙玄刃：显示攻击力 1632、龙 180（与游戏截图一致）', () => {
    const b = emptyBuild('great-sword');
    b.weapon = { id: 239, decos: [] };
    const st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.attackDisplay).toBe(1632);
    expect(st.element).toEqual({ type: 'dragon', value: 180 });
    expect(st.affinity).toBe(-30);
  });

  it('攻击 4 级：真实攻击 +12、会心 +5；未核对倍率的武器种不给显示值', () => {
    const b = emptyBuild('long-sword');
    b.weapon = { id: 239, decos: [901, 901] };
    const st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.attack).toBe(352);
    expect(st.affinity).toBe(-25);
    expect(st.attackDisplay).toBeNull();
  });

  it('防御与耐性合计', () => {
    const b = emptyBuild();
    b.armor.head = { id: 1, decos: [] };
    b.armor.chest = { id: 2, decos: [] };
    const st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.defense).toBe(360);
    expect(st.resist).toEqual([-2, 4, 4, 0, -8]);
  });
});

describe('fitDecos', () => {
  it('换装备后只保留放得下的饰品', () => {
    expect(fitDecos([2, 1], [901, 900, 900], idx)).toEqual([null, null]);
    expect(fitDecos([4, 2], [901, 900], idx)).toEqual([901, 900]);
  });
});

describe('自定义强化', () => {
  it('每种只保留一个等级；攻击 / 会心 / 防御计入状态', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [] };
    b.custom = setAugment(b.custom, idx, 'attack', 1);
    b.custom = setAugment(b.custom, idx, 'attack', 2);
    b.custom = setAugment(b.custom, idx, 'affinity', 1);
    expect(b.custom.augments).toEqual([5, 8]);
    expect(augmentCost(b, idx)).toBe(7);
    const st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.attack).toBe(350);
    expect(st.affinity).toBe(-20);
    b.custom = setAugment(b.custom, idx, 'attack', 0);
    expect(b.custom.augments).toEqual([8]);
  });

  it('镶嵌槽强化追加一个槽；未满 10 稀有度与冥赤龙武器不能自定义强化', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [] };
    b.custom = setAugment(b.custom, idx, 'slot', 2);
    expect(weaponSlots(b, idx)).toEqual([4, 4, 2]);
    b.weapon = { id: 301, decos: [] };
    expect(weaponSlots(b, idx)).toEqual([1]);
    expect(augmentCost(b, idx)).toBe(0);
    b.weapon = { id: 300, decos: [] };
    expect(weaponSlots(b, idx)).toEqual([4]);
  });

  it('换成槽更少的设定时，多出来的饰品不再计入', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [901, 901, 900] };
    expect(computeSkills(b, idx).find((x) => x.skill.id === 62)).toBeUndefined();
    b.custom = setAugment(b.custom, idx, 'slot', 1);
    expect(computeSkills(b, idx).find((x) => x.skill.id === 62)?.counted).toBe(1);
  });
});

describe('零件强化', () => {
  it('按阶段取零件并合计效果；阶段对不上的忽略', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [] };
    b.custom.parts = [1, 3];
    expect(partTotals(chosenParts(b, idx))).toEqual({ attack: 2 });
    b.custom.parts = [2, 2];
    expect(partTotals(chosenParts(b, idx))).toEqual({ defense: 10 });
  });
});

describe('冥赤龙觉醒', () => {
  it('不可重复的能力、同种类限一个的能力会被拒绝', () => {
    const [atk1, atk6, , , set1, set2] = awakening;
    const chosen = [atk6!, set1!, null, null, null];
    expect(awakeningConflict(chosen, 2, atk1!)).toBeNull();
    expect(awakeningConflict(chosen, 2, atk6!)).toBe('此能力不能重复设定');
    expect(awakeningConflict(chosen, 0, atk6!)).toBeNull();
    expect(awakeningConflict(chosen, 2, set2!)).toBe('无法设定复数系列技能');
    expect(awakeningConflict(chosen, 1, set2!)).toBeNull();
  });

  it('系列技能能力计 1 件，只对冥赤龙武器生效', () => {
    const b = emptyBuild();
    b.weapon = { id: 300, decos: [] };
    b.custom.awakening = [97, 1];
    b.armor.head = { id: 1, decos: [] };
    expect(chosenAwakening(b, idx).map((a) => a?.id ?? null)).toEqual([97, 1, null, null, null]);
    const set = computeSkills(b, idx).find((x) => x.skill.id === 222)!;
    expect(set.counted).toBe(2);
    expect(set.activeSetLevels).toEqual([2]);
    b.weapon = { id: 239, decos: [] };
    expect(computeSkills(b, idx).find((x) => x.skill.id === 222)?.counted).toBe(1);
  });

  it('攻击、属性、镶嵌槽按 em104lbr 的值计入', () => {
    const b = emptyBuild();
    b.weapon = { id: 300, decos: [] };
    b.custom.awakening = [6, 1, 24, 37];
    const st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.attack).toBe(270 + 14 + 2);
    expect(st.element).toEqual({ type: 'dragon', value: (18 + 15) * 10 });
    expect(weaponSlots(b, idx)).toEqual([4, 1]);
  });
});
