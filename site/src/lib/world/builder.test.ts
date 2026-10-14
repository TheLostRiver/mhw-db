import { describe, expect, it } from 'vitest';
import {
  capFor,
  computeSkills,
  computeStats,
  emptyBuild,
  fitDecos,
  makeIndex,
  type BuilderData,
  type SkillData,
  type WeaponData,
} from './builder';

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
const idx = makeIndex(data, weapons);

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
