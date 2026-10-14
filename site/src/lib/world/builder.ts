/**
 * 配装计算（纯函数）：技能合计、套装技能、极意解锁、衣装生效、基础状态。
 *
 * 规则来源（见 docs/DATA.md）：
 * - 套装技能的「等级」= 所需件数；防具 setSkill.points 为 1 件。
 * - 等级上限：baseMaxLevel；更高等级的 unlockedBy 中任一套装技能等级已发动时，上限提高到该等级。
 * - 武器的 skill 字段计 1 点（Kulve 武器计入「绚辉龙的真髓」件数；皇金武器为会心攻击【特殊】等）。⚠ 计 1 点为推断
 * - 衣装镶嵌的饰品只在「衣装生效」时计入。
 * - 状态：只计入数值来自游戏数据、且无发动条件的技能（攻击、看破）；条件技能待加开关。
 */

export const ARMOR_SLOTS = ['head', 'chest', 'arms', 'waist', 'legs'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];

export interface SkillRef {
  id: number;
  level: number;
}

export interface SkillLevelData {
  level: number;
  desc: string;
  params: number[];
  unlockedBy?: { skill: number; level: number }[];
}

export interface SkillData {
  id: number;
  name: string;
  setBonus: boolean;
  iconColor: number;
  maxLevel: number;
  baseMaxLevel: number;
  levels: SkillLevelData[];
}

export interface DecorationData {
  id: number;
  name: string;
  size: number;
  rarity: number;
  skills: SkillRef[];
  iconColor: number;
}

export interface ArmorData {
  id: number;
  name: string;
  slot: ArmorSlot;
  rarity: number;
  defense: number;
  /** 火、水、雷、冰、龙 */
  resist: [number, number, number, number, number];
  slots: number[];
  skills: SkillRef[];
  setSkill?: { id: number; points: number };
  series: string;
}

export interface CharmData {
  id: number;
  name: string;
  rarity: number;
  skills: SkillRef[];
}

export interface MantleData {
  id: number;
  name: string;
  slots: number[];
  icon: { id: number; color: number };
}

export interface WeaponData {
  id: number;
  name: string;
  rarity: number;
  attack: number;
  affinity: number;
  defense: number;
  element: { type: string; value: number } | null;
  hiddenElement: { type: string; value: number } | null;
  elderseal: number;
  slots: number[];
  skill: number | null;
  sharpness?: number[];
}

/** 配装器在页面加载时取得的精简数据（单语言） */
export interface BuilderData {
  meta: { steamBuildId: string | null; builtAt: string };
  colors: { rarity: string[]; icon: string[] };
  skills: SkillData[];
  decorations: DecorationData[];
  armor: ArmorData[];
  charms: CharmData[];
  mantles: MantleData[];
}

export interface Piece {
  id: number | null;
  decos: (number | null)[];
}

export interface Build {
  weaponType: string;
  weapon: Piece;
  armor: Record<ArmorSlot, Piece>;
  charm: number | null;
  mantles: [Piece, Piece];
  mantleActive: boolean;
}

export const emptyPiece = (): Piece => ({ id: null, decos: [] });

export const emptyBuild = (weaponType = 'great-sword'): Build => ({
  weaponType,
  weapon: emptyPiece(),
  armor: {
    head: emptyPiece(),
    chest: emptyPiece(),
    arms: emptyPiece(),
    waist: emptyPiece(),
    legs: emptyPiece(),
  },
  charm: null,
  mantles: [emptyPiece(), emptyPiece()],
  mantleActive: false,
});

/** 索引，避免反复线性查找 */
export interface Index {
  skills: Map<number, SkillData>;
  decorations: Map<number, DecorationData>;
  armor: Map<number, ArmorData>;
  charms: Map<number, CharmData>;
  mantles: Map<number, MantleData>;
  weapons: Map<number, WeaponData>;
}

export function makeIndex(data: BuilderData, weapons: WeaponData[]): Index {
  const by = <T extends { id: number }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  return {
    skills: by(data.skills),
    decorations: by(data.decorations),
    armor: by(data.armor),
    charms: by(data.charms),
    mantles: by(data.mantles),
    weapons: by(weapons),
  };
}

export type SourceKind = 'weapon' | 'armor' | 'charm' | 'deco' | 'mantle';

export interface SkillTotal {
  skill: SkillData;
  /** 常驻点数（不含衣装） */
  points: number;
  /** 衣装生效时额外的点数 */
  mantlePoints: number;
  /** 当前计入的点数（衣装生效时含衣装） */
  counted: number;
  /** 实际发动等级（受上限约束） */
  level: number;
  /** 当前上限（含极意解锁） */
  cap: number;
  /** 超出上限浪费的点数 */
  over: number;
  /** 套装技能：已发动的等级（= 件数门槛） */
  activeSetLevels: number[];
  sources: { kind: SourceKind; name: string; points: number }[];
}

/** 合计技能点、发动等级与极意解锁 */
export function computeSkills(build: Build, idx: Index): SkillTotal[] {
  const acc = new Map<number, { points: number; mantlePoints: number; sources: SkillTotal['sources'] }>();
  const add = (id: number, n: number, kind: SourceKind, name: string, mantle = false) => {
    const e = acc.get(id) ?? { points: 0, mantlePoints: 0, sources: [] };
    if (mantle) e.mantlePoints += n;
    else e.points += n;
    e.sources.push({ kind, name, points: n });
    acc.set(id, e);
  };
  const addDecos = (decos: (number | null)[], mantle = false) => {
    for (const d of decos) {
      const deco = d == null ? undefined : idx.decorations.get(d);
      if (deco)
        for (const s of deco.skills) add(s.id, s.level, mantle ? 'mantle' : 'deco', deco.name, mantle);
    }
  };

  const weapon = build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);
  if (weapon?.skill != null) add(weapon.skill, 1, 'weapon', weapon.name);
  addDecos(build.weapon.decos);

  for (const slot of ARMOR_SLOTS) {
    const p = build.armor[slot];
    const a = p.id == null ? undefined : idx.armor.get(p.id);
    if (!a) continue;
    for (const s of a.skills) add(s.id, s.level, 'armor', a.name);
    if (a.setSkill) add(a.setSkill.id, a.setSkill.points, 'armor', a.name);
    addDecos(p.decos);
  }

  const charm = build.charm == null ? undefined : idx.charms.get(build.charm);
  if (charm) for (const s of charm.skills) add(s.id, s.level, 'charm', charm.name);

  for (const m of build.mantles) addDecos(m.decos, true);

  // 先算套装技能（决定极意上限），再算普通技能
  const counted = (e: { points: number; mantlePoints: number }) =>
    e.points + (build.mantleActive ? e.mantlePoints : 0);
  const activeSet = new Map<number, number>(); // 套装技能 id → 计入件数
  for (const [id, e] of acc) {
    const s = idx.skills.get(id);
    if (s?.setBonus) activeSet.set(id, counted(e));
  }

  const out: SkillTotal[] = [];
  for (const [id, e] of acc) {
    const skill = idx.skills.get(id);
    if (!skill) continue;
    const n = counted(e);
    if (skill.setBonus) {
      const activeSetLevels = skill.levels.filter((l) => l.level <= n).map((l) => l.level);
      out.push({
        skill,
        points: e.points,
        mantlePoints: e.mantlePoints,
        counted: n,
        level: activeSetLevels.length ? Math.max(...activeSetLevels) : 0,
        cap: skill.maxLevel,
        over: 0,
        activeSetLevels,
        sources: e.sources,
      });
      continue;
    }
    const cap = capFor(skill, activeSet);
    out.push({
      skill,
      points: e.points,
      mantlePoints: e.mantlePoints,
      counted: n,
      level: Math.min(n, cap),
      cap,
      over: Math.max(0, n - cap),
      activeSetLevels: [],
      sources: e.sources,
    });
  }
  return out.sort(
    (a, b) =>
      Number(a.skill.setBonus) - Number(b.skill.setBonus) || b.level - a.level || a.skill.id - b.skill.id,
  );
}

/** 当前等级上限：基础上限，或被已发动的套装技能逐级解锁 */
export function capFor(skill: SkillData, activeSet: Map<number, number>): number {
  let cap = skill.baseMaxLevel;
  for (const lv of [...skill.levels].sort((a, b) => a.level - b.level)) {
    if (lv.level <= cap) continue;
    const ok = (lv.unlockedBy ?? []).some((u) => (activeSet.get(u.skill) ?? 0) >= u.level);
    if (!ok) break;
    cap = lv.level;
  }
  return cap;
}

// ---------- 状态 ----------

export const SKILL_ATTACK = 19;
export const SKILL_CRITICAL_EYE = 48;

/** 已核对的武器显示倍率（显示攻击力 = 真实攻击力 × 倍率）。其他武器种未核对，不显示换算值 */
export const VERIFIED_BLOAT: Partial<Record<string, number>> = { 'great-sword': 4.8 };

export interface Stats {
  attack: number;
  /** 显示攻击力；倍率未核对的武器种为 null */
  attackDisplay: number | null;
  affinity: number;
  element: { type: string; value: number } | null;
  elderseal: number;
  defense: number;
  resist: [number, number, number, number, number];
}

const paramAt = (skill: SkillData | undefined, level: number, i: number) =>
  level > 0 ? (skill?.levels.find((l) => l.level === level)?.params[i] ?? 0) : 0;

export function computeStats(build: Build, idx: Index, skills: SkillTotal[]): Stats {
  const weapon = build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);
  const lv = (id: number) => skills.find((s) => s.skill.id === id)?.level ?? 0;
  const atkSkill = idx.skills.get(SKILL_ATTACK);
  const eyeSkill = idx.skills.get(SKILL_CRITICAL_EYE);

  const attack = (weapon?.attack ?? 0) + paramAt(atkSkill, lv(SKILL_ATTACK), 0);
  const affinity =
    (weapon?.affinity ?? 0) +
    paramAt(atkSkill, lv(SKILL_ATTACK), 1) +
    paramAt(eyeSkill, lv(SKILL_CRITICAL_EYE), 0);
  const bloat = VERIFIED_BLOAT[build.weaponType];

  let defense = weapon?.defense ?? 0;
  const resist: Stats['resist'] = [0, 0, 0, 0, 0];
  for (const slot of ARMOR_SLOTS) {
    const id = build.armor[slot].id;
    const a = id == null ? undefined : idx.armor.get(id);
    if (!a) continue;
    defense += a.defense;
    a.resist.forEach((v, i) => (resist[i] = (resist[i] ?? 0) + v));
  }
  return {
    attack,
    attackDisplay: weapon && bloat ? Math.round(attack * bloat) : null,
    affinity: Math.max(-100, Math.min(100, affinity)),
    element: weapon?.element ? { type: weapon.element.type, value: weapon.element.value * 10 } : null,
    elderseal: weapon?.elderseal ?? 0,
    defense,
    resist,
  };
}

/** 一件装备的镶嵌槽数组与已镶饰品对齐（换装备时保留能放下的饰品） */
export function fitDecos(slots: number[], decos: (number | null)[], idx: Index): (number | null)[] {
  return slots.map((size, i) => {
    const d = decos[i];
    const deco = d == null ? undefined : idx.decorations.get(d);
    return deco && deco.size <= size ? d! : null;
  });
}
