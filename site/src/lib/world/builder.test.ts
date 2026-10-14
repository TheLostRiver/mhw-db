import { describe, expect, it } from 'vitest';
import {
  augmentCost,
  availableConditions,
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
  sharpnessBar,
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
      lv(1, [4, 5]),
      lv(2, [8, 5]),
      lv(3, [12, 7]),
      lv(4, [16, 7]),
      lv(5, [20, 10]),
      lv(6, [24, 15], [{ skill: 222, level: 2 }]),
      lv(7, [28, 20], [{ skill: 222, level: 2 }]),
    ]),
    skill(50, '弱点特效', [lv(1, [10, 15]), lv(2, [15, 30]), lv(3, [30, 50])]),
    skill(64, '火场怪力', [lv(1, [100, 50]), lv(2, [105, 50])]),
    skill(49, '超会心', [lv(1, [130]), lv(2, [135]), lv(3, [140])]),
    skill(34, '龙属性攻击强化', [lv(1, [3, 100]), lv(4, [10, 105])]),
    skill(54, '匠', [lv(1, [120]), lv(2, [140]), lv(3, [160]), lv(4, [180]), lv(5, [200])]),
    skill(222, '黑龙的传说', [lv(2), lv(4)], { setBonus: true }),
  ],
  decorations: [
    { id: 900, name: '挑战珠【2】', size: 2, rarity: 6, skills: [{ id: 62, level: 1 }], iconColor: 0 },
    { id: 901, name: '攻击珠2【4】', size: 4, rarity: 9, skills: [{ id: 19, level: 2 }], iconColor: 0 },
    {
      id: 902,
      name: '测试珠',
      size: 4,
      rarity: 9,
      skills: [
        { id: 50, level: 3 },
        { id: 49, level: 3 },
      ],
      iconColor: 0,
    },
    {
      id: 903,
      name: '火场珠',
      size: 4,
      rarity: 9,
      skills: [
        { id: 64, level: 2 },
        { id: 34, level: 4 },
      ],
      iconColor: 0,
    },
    { id: 904, name: '匠珠3', size: 4, rarity: 9, skills: [{ id: 54, level: 3 }], iconColor: 0 },
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
      hr: { attack: [5, 10, 15], affinity: [10, 15, 20], defense: [10, 20, 30] },
    },
  },
  bloat: { 'great-sword': 4.8, 'long-sword': 3.3 },
  crit: { good: 1.25, bad: 0.75 },
  sharpnessMultiplier: {
    raw: [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.39],
    element: [0.25, 0.5, 0.75, 1.0, 1.0625, 1.15, 1.25],
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

  it('攻击 4 级：真实攻击 +12、会心 +5；按武器种倍率换算显示值，缺倍率时不给显示值', () => {
    const b = emptyBuild('long-sword');
    b.weapon = { id: 239, decos: [901, 901] };
    const st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.attack).toBe(352);
    expect(st.affinity).toBe(-25);
    expect(st.attackDisplay).toBe(Math.round(352 * 3.3));
    b.weaponType = 'bow';
    expect(computeStats(b, idx, computeSkills(b, idx)).attackDisplay).toBeNull();
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
    // 零件的攻击是真实值加值（用户核对：重弩 390 → 392）
    b.custom.parts = [1, 3];
    expect(computeStats(b, idx, computeSkills(b, idx)).attack).toBe(342);
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

describe('发动条件', () => {
  it('挑战者只在打开「怪物发怒」后计入；条件只列出已发动的技能', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [] };
    b.armor.head = { id: 1, decos: [900, null] };
    b.armor.chest = { id: 2, decos: [] };
    let st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.attack).toBe(340);
    expect(availableConditions(computeSkills(b, idx)).map((c) => c.key)).toEqual(['agitator']);
    b.conditions = ['agitator'];
    st = computeStats(b, idx, computeSkills(b, idx));
    expect([st.attack, st.affinity]).toEqual([340 + 28, -30 + 20]);
  });

  it('弱点特效：有效部位 / 已受伤分开；超会心改变期望攻击', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [902, null] };
    b.conditions = ['weakness'];
    let st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.affinity).toBe(0); // −30 + 30
    b.conditions = ['weakness', 'wound'];
    st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.affinity).toBe(20); // −30 + 50
    expect(st.critMultiplier).toBe(1.4);
    expect(st.effectiveAttack).toBeCloseTo(340 * (1 + 0.2 * 0.4));
    b.conditions = ['wound']; // 只有「已受伤」不计入
    expect(computeStats(b, idx, computeSkills(b, idx)).affinity).toBe(-30);
  });

  it('负会心按 0.75 计期望攻击', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [] };
    const st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.effectiveAttack).toBeCloseTo(340 * (1 - 0.3 * 0.25));
  });

  it('火场怪力乘在武器攻击力上，防御加值；属性强化 = 属性 × 倍率 + 加值', () => {
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [903, null] };
    let st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.element).toEqual({ type: 'dragon', value: Math.round((18 * 1.05 + 10) * 10) });
    expect(st.attack).toBe(340);
    b.conditions = ['heroics'];
    st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.attack).toBeCloseTo(340 * 1.05);
    expect(st.defense).toBe(50);
  });
});

describe('锐利度', () => {
  // 黑龙玄刃：kireaji 满条 [160, 180, 200, 270, 310, 340, 400]，sharpness_amount 4
  const ends = [160, 180, 200, 270, 310, 340, 400];

  it('不带匠为 350（紫 10），匠 5 时 400（紫 60）', () => {
    const base = sharpnessBar(ends, 4, 0);
    expect(base.length).toBe(350);
    expect(base.segments).toEqual([160, 20, 20, 70, 40, 30, 10]);
    expect(base.top).toBe(6);
    expect(sharpnessBar(ends, 4, 5).segments[6]).toBe(60);
    expect(sharpnessBar(ends, 4, 3).length).toBe(380);
  });

  it('sharpness_amount 为 5 时已满条，匠不再延长', () => {
    expect(sharpnessBar(ends, 5, 0).length).toBe(400);
    expect(sharpnessBar(ends, 5, 5).length).toBe(400);
  });

  it('期望攻击按当前最高色计入锐利度倍率', () => {
    weapons[0]!.sharpness = [100, 150, 200, 250, 300, 350, 400];
    weapons[0]!.handicraft = 3; // 不带匠 300 → 最高蓝
    const b = emptyBuild();
    b.weapon = { id: 239, decos: [] };
    let st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.sharpness?.top).toBe(4);
    expect(st.effectiveAttack).toBeCloseTo(340 * (1 - 0.3 * 0.25) * 1.2);
    b.weapon.decos = [904, null]; // 匠 3 → 330 → 白
    st = computeStats(b, idx, computeSkills(b, idx));
    expect(st.sharpness?.top).toBe(5);
    expect(st.effectiveAttack).toBeCloseTo(340 * (1 - 0.3 * 0.25) * 1.32);
    delete weapons[0]!.sharpness;
    delete weapons[0]!.handicraft;
  });
});

describe('上位自定义强化', () => {
  it('同一项可重复，按次数取累计加值；格数按稀有度', () => {
    const hrIdx = makeIndex(data, {
      weapons: [
        { ...weapons[0]!, id: 302, name: '上位大剑R7', rarity: 7, attack: 210, affinity: 0, slots: [] },
      ],
      parts,
      awakening,
    });
    const b = emptyBuild();
    b.weapon = { id: 302, decos: [] };
    b.custom.hr = ['attack'];
    let st = computeStats(b, hrIdx, computeSkills(b, hrIdx));
    expect(st.attack).toBe(215); // 用户核对：1008 → 1032（×4.8）
    b.custom.hr = ['attack', 'attack', 'affinity']; // 稀有度 7 只有 2 格，第 3 格不计
    st = computeStats(b, hrIdx, computeSkills(b, hrIdx));
    expect([st.attack, st.affinity]).toEqual([220, 0]);
    b.custom.hr = ['slot', 'slot'];
    expect(weaponSlots(b, hrIdx)).toEqual([2]);
  });
});
