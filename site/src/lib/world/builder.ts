/**
 * 配装计算（纯函数）：技能合计、套装技能、极意解锁、衣装生效、基础状态。
 *
 * 规则来源（见 docs/DATA.md）：
 * - 套装技能的「等级」= 所需件数；防具 setSkill.points 为 1 件。
 * - 等级上限：baseMaxLevel；更高等级的 unlockedBy 中任一套装技能等级已发动时，上限提高到该等级。
 * - 武器的 skill 字段计 1 点（Kulve 武器计入「绚辉龙的真髓」件数；皇金武器为会心攻击【特殊】等）。⚠ 计 1 点为推断
 * - 衣装镶嵌的饰品只在「衣装生效」时计入。
 * - 状态：技能数值全部取自 skill_data 的参数（与技能说明文本逐条对得上）；有发动条件的技能由用户打开开关后计入。
 *   ⚠ 推断：倍率类（火场怪力、攻击守势）乘在武器攻击力（含客制）上，再加上「基础攻击力 +N」类加值；
 *   属性强化为 基础属性 × 倍率 + 加值，未计属性上限；状态异常强化的「+10」不在参数里，暂不计入。
 * - 武器客制（docs/DATA.md 3.3）：大师自定义强化每种只取一个等级（⚠ 推断），攻击 / 会心 / 防御加值来自 pl_param；
 *   镶嵌槽强化追加一个等级 = 强化等级的槽；属性强化与零件强化的换算未确认，不计入状态。
 *   冥赤龙觉醒：数值取自 em104lbr（攻击、会心、防御、属性 / 状态异常计入状态，镶嵌槽强化追加槽）；
 *   系列技能能力计 1 件（⚠ 推断，同武器的 skill 字段）。
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
  /** 冥赤龙武器：用觉醒能力代替自定义强化 */
  awakened?: boolean;
}

export type AugmentCategory = 'extend' | 'attack' | 'affinity' | 'defense' | 'slot' | 'health' | 'element';
export const AUGMENT_ORDER: AugmentCategory[] = [
  'attack',
  'affinity',
  'defense',
  'slot',
  'health',
  'element',
  'extend',
];

export interface AugmentLevel {
  id: number;
  category: AugmentCategory;
  level: number;
  slotCost: number;
  name: string;
  desc: string;
}

export interface AugmentEffects {
  attack: number[];
  affinity: number[];
  defense: number[];
  element: number[];
  elementMultiplier: Partial<Record<string, number>>;
}

export type PartEffectKey = 'attack' | 'affinity' | 'element' | 'defense' | 'sharpness';

export interface PartData {
  id: number;
  stage: number;
  name: string;
  desc: string;
  effect: { [K in PartEffectKey]?: number | undefined };
}

export interface AwakeningData {
  id: number;
  category: string;
  rank: number;
  name: string;
  desc: string;
  stackable: boolean;
  onePerCategory: boolean;
  setSkill: number | null;
  /** 在当前武器种上的效果（em104lbr）；单位：攻击 / 属性为真实值，会心为 %，镶嵌槽为追加槽的等级 */
  effect?: { kind: AwakeningEffectKind; amount: number };
}

export type AwakeningEffectKind =
  'attack' | 'defense' | 'affinity' | 'element' | 'slotLevel' | 'sharpness' | 'status' | 'ammo';

/** /data/world/weapons/<种类>.json */
export interface WeaponPayload {
  weapons: WeaponData[];
  parts: PartData[];
  awakening: AwakeningData[];
}

/** 冥赤龙武器的觉醒栏数（⚠ 待用户确认） */
export const AWAKENING_SLOTS = 5;
/** 零件强化的阶段数（数据里为 1–7） */
export const PART_STAGES = 7;
/** 大师自定义强化从稀有度 10 开始（教程文本） */
export const AUGMENT_MIN_RARITY = 10;

/** 配装器在页面加载时取得的精简数据（单语言） */
export interface BuilderData {
  meta: { steamBuildId: string | null; builtAt: string };
  colors: { rarity: string[]; icon: string[] };
  skills: SkillData[];
  decorations: DecorationData[];
  armor: ArmorData[];
  charms: CharmData[];
  mantles: MantleData[];
  augments: { levels: AugmentLevel[]; effects: AugmentEffects };
  /** 武器显示倍率（显示攻击力 = 真实攻击力 × 倍率），取自游戏程序，见 data/world/constants.json */
  bloat: Partial<Record<string, number>>;
  /** 会心 / 负会心伤害倍率（pl_param） */
  crit: { good: number; bad: number };
}

export interface Piece {
  id: number | null;
  decos: (number | null)[];
}

export interface WeaponCustom {
  /** 自定义强化：每种一个等级（AugmentLevel.id） */
  augments: number[];
  /** 零件强化：第 i 个元素是第 i+1 阶段选的零件 */
  parts: (number | null)[];
  /** 冥赤龙觉醒能力 */
  awakening: (number | null)[];
}

export interface Build {
  weaponType: string;
  weapon: Piece;
  custom: WeaponCustom;
  /** 打开的发动条件（CONDITIONS 的 key） */
  conditions: string[];
  armor: Record<ArmorSlot, Piece>;
  charm: number | null;
  mantles: [Piece, Piece];
  mantleActive: boolean;
}

export const emptyPiece = (): Piece => ({ id: null, decos: [] });

export const emptyCustom = (): WeaponCustom => ({ augments: [], parts: [], awakening: [] });

export const emptyBuild = (weaponType = 'great-sword'): Build => ({
  weaponType,
  weapon: emptyPiece(),
  custom: emptyCustom(),
  conditions: [],
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
  augments: Map<number, AugmentLevel>;
  parts: Map<number, PartData>;
  awakening: Map<number, AwakeningData>;
  effects: AugmentEffects;
  bloat: Partial<Record<string, number>>;
  crit: { good: number; bad: number };
}

const EMPTY_PAYLOAD: WeaponPayload = { weapons: [], parts: [], awakening: [] };

export function makeIndex(data: BuilderData, payload: WeaponPayload = EMPTY_PAYLOAD): Index {
  const by = <T extends { id: number }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  return {
    skills: by(data.skills),
    decorations: by(data.decorations),
    armor: by(data.armor),
    charms: by(data.charms),
    mantles: by(data.mantles),
    weapons: by(payload.weapons),
    augments: by(data.augments.levels),
    parts: by(payload.parts),
    awakening: by(payload.awakening),
    effects: data.augments.effects,
    bloat: data.bloat,
    crit: data.crit,
  };
}

// ---------- 武器客制 ----------

const weaponOf = (build: Build, idx: Index) =>
  build.weapon.id == null ? undefined : idx.weapons.get(build.weapon.id);

/** 这把武器能用哪种客制 */
export function customKind(w: WeaponData | undefined): 'awakening' | 'augment' | null {
  if (!w) return null;
  if (w.awakened) return 'awakening';
  return w.rarity >= AUGMENT_MIN_RARITY ? 'augment' : null;
}

/** 当前选中的自定义强化：种类 → 等级 */
export function augmentLevels(build: Build, idx: Index): Map<AugmentCategory, AugmentLevel> {
  const out = new Map<AugmentCategory, AugmentLevel>();
  if (customKind(weaponOf(build, idx)) !== 'augment') return out;
  for (const id of build.custom.augments) {
    const a = idx.augments.get(id);
    if (a) out.set(a.category, a);
  }
  return out;
}

/** 自定义强化占用的栏位合计 */
export function augmentCost(build: Build, idx: Index): number {
  let n = 0;
  for (const a of augmentLevels(build, idx).values()) n += a.slotCost;
  return n;
}

/** 选一个强化等级（同种类只保留一个；level 为 0 表示取消该种类） */
export function setAugment(
  custom: WeaponCustom,
  idx: Index,
  category: AugmentCategory,
  level: number,
): WeaponCustom {
  const keep = custom.augments.filter((id) => idx.augments.get(id)?.category !== category);
  const pick = [...idx.augments.values()].find((a) => a.category === category && a.level === level);
  return { ...custom, augments: pick ? [...keep, pick.id] : keep };
}

/** 武器的镶嵌槽（含自定义强化或觉醒能力追加的那一个） */
export function weaponSlots(build: Build, idx: Index): number[] {
  const w = weaponOf(build, idx);
  if (!w) return [];
  const extra =
    augmentLevels(build, idx).get('slot')?.level ??
    chosenAwakening(build, idx).find((a) => a?.effect?.kind === 'slotLevel')?.effect?.amount;
  return extra && w.slots.length < 3 ? [...w.slots, extra] : w.slots;
}

/** 觉醒能力某类效果的合计 */
export function awakeningTotal(build: Build, idx: Index, kind: AwakeningEffectKind): number {
  let n = 0;
  for (const a of chosenAwakening(build, idx)) if (a?.effect?.kind === kind) n += a.effect.amount;
  return n;
}

const STATUS_TYPES = new Set(['poison', 'paralysis', 'sleep', 'blast']);

/** 当前武器的零件强化选择（只保留阶段对得上的零件） */
export function chosenParts(build: Build, idx: Index): PartData[] {
  if (customKind(weaponOf(build, idx)) !== 'augment') return [];
  return build.custom.parts.flatMap((id, i) => {
    const p = id == null ? undefined : idx.parts.get(id);
    return p && p.stage === i + 1 ? [p] : [];
  });
}

export function partTotals(parts: PartData[]): Partial<Record<PartEffectKey, number>> {
  const out: Partial<Record<PartEffectKey, number>> = {};
  for (const p of parts)
    for (const [k, v] of Object.entries(p.effect) as [PartEffectKey, number | undefined][])
      if (v) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** 当前武器已设定的觉醒能力（按栏位） */
export function chosenAwakening(build: Build, idx: Index): (AwakeningData | null)[] {
  const on = customKind(weaponOf(build, idx)) === 'awakening';
  return Array.from({ length: AWAKENING_SLOTS }, (_, i) => {
    const id = build.custom.awakening[i];
    return (on && id != null && idx.awakening.get(id)) || null;
  });
}

/**
 * 在第 slot 栏放入能力 a 是否违反规则；返回原因，可以放时返回 null。
 * 规则（docs/DATA.md 3.3，⚠ 推断待确认）：不可重复的能力只能有一个；onePerCategory 的种类只能有一个。
 */
export function awakeningConflict(
  chosen: (AwakeningData | null)[],
  slot: number,
  a: AwakeningData,
): string | null {
  const others = chosen.filter((c, i): c is AwakeningData => c != null && i !== slot);
  if (!a.stackable && others.some((c) => c.id === a.id)) return '此能力不能重复设定';
  if (a.onePerCategory && others.some((c) => c.category === a.category))
    return a.category === 'setBonus' ? '无法设定复数系列技能' : '此系统的能力只能设定一个';
  return null;
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

  const weapon = weaponOf(build, idx);
  if (weapon?.skill != null) add(weapon.skill, 1, 'weapon', weapon.name);
  for (const a of chosenAwakening(build, idx)) if (a?.setSkill != null) add(a.setSkill, 1, 'weapon', a.name);
  addDecos(build.weapon.decos.slice(0, weaponSlots(build, idx).length));

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
const SKILL_CRITICAL_BOOST = 49;
/** 火、水、冰、雷、龙属性攻击强化（技能编号顺序与属性编号一致） */
const ELEMENT_SKILLS: Record<string, number> = { fire: 30, water: 31, ice: 32, thunder: 33, dragon: 34 };

/** 有发动条件的技能：开关打开后才计入状态。标签按技能说明文本写 */
export interface Condition {
  key: string;
  skill: number;
  label: string;
}

export const CONDITIONS: Condition[] = [
  { key: 'agitator', skill: 62, label: '怪物发怒' },
  { key: 'weakness', skill: 50, label: '攻击有效部位' },
  { key: 'wound', skill: 50, label: '有效部位已受伤' },
  { key: 'peak', skill: 63, label: '体力全满' },
  { key: 'resentment', skill: 66, label: '体力槽有红色部分' },
  { key: 'latent', skill: 61, label: '力量解放发动中' },
  { key: 'maxMight', skill: 101, label: '耐力保持全满' },
  { key: 'heroics', skill: 64, label: '体力 35% 以下' },
  { key: 'offensiveGuard', skill: 185, label: '抓准时机防御成功后' },
  { key: 'coalescence', skill: 186, label: '解除异常状态后' },
  { key: 'critDraw', skill: 55, label: '拔刀攻击' },
];

/** 当前配装里可用的条件（技能已发动） */
export const availableConditions = (skills: SkillTotal[]) =>
  CONDITIONS.filter((c) => skills.some((s) => s.skill.id === c.skill && s.level > 0));

export interface Stats {
  attack: number;
  /** 显示攻击力；缺少倍率时为 null */
  attackDisplay: number | null;
  affinity: number;
  element: { type: string; value: number } | null;
  elderseal: number;
  defense: number;
  /** 会心伤害倍率（超会心） */
  critMultiplier: number;
  /** 期望攻击力（真实值，未计锐利度与动作值） */
  effectiveAttack: number;
  /** 期望攻击力的显示值；缺少倍率时为 null */
  effectiveDisplay: number | null;
  resist: [number, number, number, number, number];
}

const paramAt = (skill: SkillData | undefined, level: number, i: number) =>
  level > 0 ? (skill?.levels.find((l) => l.level === level)?.params[i] ?? 0) : 0;

export function computeStats(build: Build, idx: Index, skills: SkillTotal[]): Stats {
  const weapon = weaponOf(build, idx);
  const lv = (id: number) => skills.find((s) => s.skill.id === id)?.level ?? 0;
  const atkSkill = idx.skills.get(SKILL_ATTACK);
  const eyeSkill = idx.skills.get(SKILL_CRITICAL_EYE);
  const aug = augmentLevels(build, idx);
  const fx = (key: 'attack' | 'affinity' | 'defense') => {
    const a = aug.get(key);
    return a ? (idx.effects[key][a.level - 1] ?? 0) : 0;
  };

  const awk = (kind: AwakeningEffectKind) => awakeningTotal(build, idx, kind);
  const on = new Set(
    availableConditions(skills)
      .filter((c) => build.conditions.includes(c.key))
      .map((c) => c.key),
  );
  // 第 i 个参数；只在技能发动（且需要条件时条件打开）时计入
  const p = (skill: number, i: number, cond?: string) =>
    cond && !on.has(cond) ? 0 : paramAt(idx.skills.get(skill), lv(skill), i);
  const mul = (skill: number, cond: string) => (on.has(cond) && lv(skill) > 0 ? p(skill, 0) / 100 : 1);

  const weaponRaw = (weapon?.attack ?? 0) + fx('attack') + awk('attack');
  const attack =
    weaponRaw * mul(64, 'heroics') * mul(185, 'offensiveGuard') +
    paramAt(atkSkill, lv(SKILL_ATTACK), 0) +
    p(62, 0, 'agitator') +
    p(63, 0, 'peak') +
    p(66, 0, 'resentment') +
    p(186, 0, 'coalescence');
  const wex = on.has('weakness') ? p(50, on.has('wound') ? 1 : 0) : 0;
  const affinity =
    (weapon?.affinity ?? 0) +
    fx('affinity') +
    awk('affinity') +
    paramAt(atkSkill, lv(SKILL_ATTACK), 1) +
    paramAt(eyeSkill, lv(SKILL_CRITICAL_EYE), 0) +
    p(62, 1, 'agitator') +
    p(61, 0, 'latent') +
    p(101, 0, 'maxMight') +
    p(55, 0, 'critDraw') +
    wex;
  const bloat = idx.bloat[build.weaponType];

  let defense = (weapon?.defense ?? 0) + fx('defense') + awk('defense') + p(64, 1, 'heroics');
  const el = weapon?.element;
  const elementPlus = el ? awk(STATUS_TYPES.has(el.type) ? 'status' : 'element') : 0;
  let elementTrue = el ? el.value + elementPlus : 0;
  const elSkill = el ? ELEMENT_SKILLS[el.type] : undefined;
  if (el && elSkill != null && lv(elSkill) > 0)
    elementTrue = (elementTrue * p(elSkill, 1)) / 100 + p(elSkill, 0);
  if (el && !STATUS_TYPES.has(el.type)) elementTrue += p(186, 1, 'coalescence');
  const resist: Stats['resist'] = [0, 0, 0, 0, 0];
  for (const slot of ARMOR_SLOTS) {
    const id = build.armor[slot].id;
    const a = id == null ? undefined : idx.armor.get(id);
    if (!a) continue;
    defense += a.defense;
    a.resist.forEach((v, i) => (resist[i] = (resist[i] ?? 0) + v));
  }
  const aff = Math.max(-100, Math.min(100, affinity));
  const critMultiplier = lv(SKILL_CRITICAL_BOOST) > 0 ? p(SKILL_CRITICAL_BOOST, 0) / 100 : idx.crit.good;
  const critFactor =
    aff >= 0 ? 1 + (aff / 100) * (critMultiplier - 1) : 1 + (-aff / 100) * (idx.crit.bad - 1);
  return {
    attack,
    attackDisplay: weapon && bloat ? Math.round(attack * bloat) : null,
    // 真实值保留小数（倍率类技能会产生小数），显示时再取整
    affinity: aff,
    element: el ? { type: el.type, value: Math.round(elementTrue * 10) } : null,
    critMultiplier,
    effectiveAttack: attack * critFactor,
    effectiveDisplay: weapon && bloat ? Math.round(attack * critFactor * bloat) : null,
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
