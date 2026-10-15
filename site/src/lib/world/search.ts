/**
 * 配装搜索：给定目标技能、套装技能与约束，搜索可行的防具 + 护石 + 饰品组合。
 *
 * 分两层：
 *  1. 防具 + 护石：逐部位 DFS，用「剩余部位最多还能提供多少点（含镶嵌槽里的饰品）」做分支限界；
 *  2. 饰品填空：把还差的点数当成多维缺口，按槽从大到小塞饰品（失败状态记忆化）。
 *
 * 提速的关键是查询期预处理：每个部位只保留「对这次查询有用」的防具——
 * 技能点按目标等级截断、镶嵌槽按有用饰品的等级折算后，等价的合并（留防御最高的）、被支配的剔除。
 *
 * 规则（见 docs/DATA.md）：
 *  - 套装技能的「等级」= 所需件数，防具的 setSkill.points 恒为 1；档位取 levels 里 ≤ 件数的最大值
 *    （黑龙的传说为 [2, 4]：3 件算 2、4 件及以上算 4）。
 *  - 极意技能（unlockedBy 非空）在条件不满足时被基础上限卡住，如挑战者 6 / 7 需要对应的套装技能。
 */

import type { BuilderData } from './builder';

export type ArmorSlot = 'head' | 'chest' | 'arms' | 'waist' | 'legs';
export const ARMOR_SLOTS: ArmorSlot[] = ['head', 'chest', 'arms', 'waist', 'legs'];

export interface ArmorPiece {
  id: number;
  name: string;
  rarity: number;
  defense: number;
  skills: Array<{ id: number; level: number }>;
  slots: number[];
  setSkill?: { id: number; points: number } | null;
}

export interface CharmPiece {
  id: number;
  name: string;
  rarity: number;
  skills: Array<{ id: number; level: number }>;
}

export interface DecorationPiece {
  id: number;
  name: string;
  size: number;
  skills: Array<{ id: number; level: number }>;
}

export interface SkillInfo {
  id: number;
  name: string;
  maxLevel: number;
  baseMaxLevel: number;
  setBonus: boolean;
  /** 套装技能各档的件数门槛，例如黑龙的传说为 [2, 4] */
  setBonusLevels?: number[];
  /** 极意技能的解锁条件，任意一条成立即可突破基础上限 */
  unlockedBy?: Array<{ skill: number; level: number }>;
}

export interface SearchIndex {
  armor: Record<ArmorSlot, ArmorPiece[]>;
  charms: CharmPiece[];
  decorations: DecorationPiece[];
  skills: SkillInfo[];
}

/** 从配装器数据派生搜索索引（页面已经加载过 builder.json，不必再取一份） */
export function toSearchIndex(data: BuilderData): SearchIndex {
  const armor: SearchIndex['armor'] = { head: [], chest: [], arms: [], waist: [], legs: [] };
  for (const a of data.armor) {
    armor[a.slot].push({
      id: a.id,
      name: a.name,
      rarity: a.rarity,
      defense: a.defense,
      skills: a.skills,
      slots: a.slots,
      setSkill: a.setSkill ?? null,
    });
  }
  return {
    armor,
    charms: data.charms.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, skills: c.skills })),
    decorations: data.decorations.map((d) => ({ id: d.id, name: d.name, size: d.size, skills: d.skills })),
    skills: data.skills.map((s) => {
      const unlock = s.levels.find((l) => l.unlockedBy?.length)?.unlockedBy;
      return {
        id: s.id,
        name: s.name,
        maxLevel: s.maxLevel,
        baseMaxLevel: s.baseMaxLevel,
        setBonus: s.setBonus,
        ...(s.setBonus ? { setBonusLevels: s.levels.map((l) => l.level).sort((a, b) => a - b) } : {}),
        ...(unlock ? { unlockedBy: unlock } : {}),
      };
    }),
  };
}

/** 搜索请求 */
export interface SearchQuery {
  /** 目标技能与等级（「至少」达到） */
  skills: Array<{ id: number; level: number }>;
  /** 目标套装技能与所需档位（按件数判定） */
  setSkills?: Array<{ id: number; level: number }>;
  /** 武器镶嵌槽的等级（例如 [4, 4]） */
  weaponSlots: number[];
  /** 最多返回几个方案（到量即停） */
  maxResults?: number;
  excludeArmor?: Iterable<number>;
  excludeCharms?: Iterable<number>;
  excludeDecorations?: Iterable<number>;
  /** 只用这个稀有度及以上的防具与护石 */
  minRarity?: number;
  /** 指定部位只能用这些防具（不填表示不限） */
  limitArmor?: Partial<Record<ArmorSlot, number[]>>;
  /** 武器等固定提供的技能点（如武器技能） */
  fixedSkills?: Array<{ id: number; level: number }>;
  /** 固定提供的套装件数（如冥赤龙武器的系列技能觉醒算 1 件） */
  fixedSets?: Array<{ id: number; points: number }>;
}

/** 一个完整方案 */
export interface SearchResult {
  armor: Record<ArmorSlot, number | null>;
  charm: number | null;
  decorations: {
    weapon: Array<number | null>;
    armor: Record<ArmorSlot, Array<number | null>>;
  };
  /** 五件防具的防御力合计（基础值） */
  defense: number;
  /** 目标技能的最终等级 */
  levels: Record<number, number>;
  /** 套装技能达成的档位（按件数） */
  setLevels: Record<number, number>;
  /** 没用上的槽（等级，从大到小） */
  freeSlots: number[];
  /** 与该方案等价、可以互换的防具（同部位，技能与可用槽相同） */
  alternatives: Record<ArmorSlot, number[]>;
}

export interface SearchStats {
  /** 走到叶子（五件防具都选定）的组合数 */
  combos: number;
  found: number;
  /** 是否因达到 maxResults 而提前停止 */
  truncated: boolean;
  /** 预处理后每个部位的候选数 */
  candidates: Record<ArmorSlot, number>;
}

/** 查询期的防具：只保留和本次目标有关的信息 */
interface Cand {
  piece: ArmorPiece;
  /** 目标技能点（截断到目标等级）：[idx, level, ...] */
  vec: number[];
  /** 相关套装 id（无关套装记为 -1） */
  set: number;
  /** 按有用饰品等级折算后的槽（从大到小） */
  eff: number[];
  /** 每个目标技能的上界：本件技能点 + 本件槽里最多能塞的该技能点 */
  bound: Int16Array;
  /** 本件所有目标技能点合计 + 槽里最多能塞的点数合计 */
  total: number;
  /** 等价、可以互换的其他防具 */
  alts: number[];
}

/** 饰品选项（同一种贡献只留一个代表） */
interface DecoOption {
  id: number;
  size: number;
  /** [idx, level, ...] */
  vec: number[];
  total: number;
}

/**
 * 搜索所有可行的配装。每找到一个就调用 onResult；onResult 返回 false 可提前终止。
 */
export function searchBuilds(
  index: SearchIndex,
  query: SearchQuery,
  onResult: (r: SearchResult) => boolean | void,
): SearchStats {
  const minRarity = query.minRarity ?? 0;
  const excludeArmor = new Set(query.excludeArmor ?? []);
  const excludeCharms = new Set(query.excludeCharms ?? []);
  const excludeDecorations = new Set(query.excludeDecorations ?? []);
  const skillsById = new Map(index.skills.map((s) => [s.id, s]));

  // ---------- 目标 ----------
  const targets = new Map<number, number>();
  for (const { id, level } of query.skills) {
    if (level <= 0) continue;
    const max = skillsById.get(id)?.maxLevel ?? level;
    targets.set(id, Math.min(max, Math.max(targets.get(id) ?? 0, level)));
  }
  const ids = [...targets.keys()];
  const at = new Map(ids.map((id, i) => [id, i]));
  const need = Int16Array.from(ids.map((id) => targets.get(id)!));
  const k = ids.length;

  const setTargets = new Map<number, number>();
  for (const { id, level } of query.setSkills ?? []) {
    if (level > 0) setTargets.set(id, Math.max(setTargets.get(id) ?? 0, level));
  }
  // 极意：目标等级超过基础上限的技能，需要其中一条解锁条件成立
  const unlockNeeds: Array<Array<{ skill: number; level: number }>> = [];
  for (const id of ids) {
    const info = skillsById.get(id);
    if (info?.unlockedBy?.length && targets.get(id)! > info.baseMaxLevel) unlockNeeds.push(info.unlockedBy);
  }
  // 需要追踪件数的套装：目标套装 + 解锁条件里出现的套装
  const relevantSets = new Set<number>(setTargets.keys());
  for (const opts of unlockNeeds) for (const o of opts) relevantSets.add(o.skill);

  // ---------- 饰品 ----------
  const decoOptions = buildDecoOptions(index.decorations, at, excludeDecorations);
  const decoPlan = makeDecoPlan(decoOptions, k);
  // 每个等级的槽，最多能给每个目标技能几点 / 合计几点
  const slotValue: Int16Array[] = [];
  const slotTotal: number[] = [];
  for (let size = 0; size <= 4; size++) {
    const v = new Int16Array(k);
    let total = 0;
    for (const o of decoOptions) {
      if (o.size > size) continue;
      for (let i = 0; i < o.vec.length; i += 2)
        if (o.vec[i + 1]! > v[o.vec[i]!]!) v[o.vec[i]!] = o.vec[i + 1]!;
      if (o.total > total) total = o.total;
    }
    slotValue.push(v);
    slotTotal.push(total);
  }
  // 槽等级折算：只要有用饰品里 ≤ 该等级的最大一档（没有有用饰品的槽视为 0）
  const decoSizes = [...new Set(decoOptions.map((o) => o.size))].sort((a, b) => a - b);
  const effSize = (s: number) => {
    let e = 0;
    for (const d of decoSizes) if (d <= s) e = d;
    return e;
  };

  // ---------- 防具候选（查询期去重 + 剔除被支配的） ----------
  const cands: Cand[][] = ARMOR_SLOTS.map((slot) => {
    const pool = index.armor[slot].filter(
      (p) =>
        p.rarity >= minRarity &&
        !excludeArmor.has(p.id) &&
        (!query.limitArmor?.[slot]?.length || query.limitArmor[slot]!.includes(p.id)),
    );
    const byKey = new Map<string, Cand>();
    for (const p of pool) {
      const capped = new Int16Array(k);
      for (const { id, level } of p.skills) {
        const i = at.get(id);
        if (i != null) capped[i] = Math.min(need[i]!, capped[i]! + level);
      }
      const vec: number[] = [];
      for (let i = 0; i < k; i++) if (capped[i]) vec.push(i, capped[i]!);
      const set = p.setSkill && relevantSets.has(p.setSkill.id) ? p.setSkill.id : -1;
      const eff = p.slots
        .map(effSize)
        .filter((s) => s > 0)
        .sort((a, b) => b - a);
      const key = `${vec.join(',')}|${set}|${eff.join(',')}`;
      const prev = byKey.get(key);
      if (prev) {
        // 等价：留防御高的做代表，其余记为可互换
        if (
          p.defense > prev.piece.defense ||
          (p.defense === prev.piece.defense && p.rarity > prev.piece.rarity)
        ) {
          prev.alts.push(prev.piece.id);
          prev.piece = p;
        } else prev.alts.push(p.id);
        continue;
      }
      const bound = new Int16Array(k);
      let total = 0;
      for (let i = 0; i < k; i++) {
        let b = capped[i]!;
        for (const s of eff) b += slotValue[s]![i]!;
        bound[i] = b;
        total += capped[i]!;
      }
      for (const s of eff) total += slotTotal[s]!;
      byKey.set(key, { piece: p, vec, set, eff, bound, total, alts: [] });
    }
    const list = [...byKey.values()];
    // 剔除被支配的：另一件技能点都不少、槽都不差、套装相同（或本件没有相关套装）
    const kept = list.filter(
      (b) =>
        !list.some((a) => a !== b && dominates(a, b, k) && (!dominates(b, a, k) || a.piece.id < b.piece.id)),
    );
    // 好的先试：目标点数 + 槽价值高的、带目标套装的靠前
    return kept.sort(
      (a, b) =>
        Number(b.set !== -1) - Number(a.set !== -1) || b.total - a.total || b.piece.defense - a.piece.defense,
    );
  });

  // 某部位一件候选都没有时，允许空着（全部被排除 / 限定为空）
  for (let si = 0; si < 5; si++) {
    if (!cands[si]!.length)
      cands[si]!.push({
        piece: { id: -1, name: '', rarity: 0, defense: 0, skills: [], slots: [] },
        vec: [],
        set: -1,
        eff: [],
        bound: new Int16Array(k),
        total: 0,
        alts: [],
      });
  }

  // ---------- 护石候选 ----------
  const charmCands = buildCharmCands(index.charms, at, need, minRarity, excludeCharms);
  const charmBound = new Int16Array(k);
  let charmTotal = 0;
  for (const c of charmCands) {
    let t = 0;
    for (let i = 0; i < c.vec.length; i += 2) {
      if (c.vec[i + 1]! > charmBound[c.vec[i]!]!) charmBound[c.vec[i]!] = c.vec[i + 1]!;
      t += c.vec[i + 1]!;
    }
    if (t > charmTotal) charmTotal = t;
  }

  // ---------- 部位顺序与后缀上界 ----------
  // 候选少的部位先选，剪枝生效得早
  const order = [0, 1, 2, 3, 4].sort((a, b) => cands[a]!.length - cands[b]!.length);
  // suffixBound[d][i]：第 d 层及之后的部位，技能 i 最多还能来多少点（含槽）；suffixTotal 同理为合计
  const suffixBound: Int16Array[] = [];
  const suffixTotal: number[] = [];
  const suffixSets: Array<Map<number, number>> = [];
  for (let d = 5; d >= 0; d--) {
    const b = new Int16Array(k);
    let t = 0;
    const sets = new Map<number, number>();
    if (d < 5) {
      const next = suffixBound[0]!;
      b.set(next);
      t = suffixTotal[0]!;
      for (const [s, n] of suffixSets[0]!) sets.set(s, n);
      const list = cands[order[d]!]!;
      const mb = new Int16Array(k);
      let mt = 0;
      const ms = new Set<number>();
      for (const c of list) {
        for (let i = 0; i < k; i++) if (c.bound[i]! > mb[i]!) mb[i] = c.bound[i]!;
        if (c.total > mt) mt = c.total;
        if (c.set !== -1) ms.add(c.set);
      }
      for (let i = 0; i < k; i++) b[i] = b[i]! + mb[i]!;
      t += mt;
      for (const s of ms) sets.set(s, (sets.get(s) ?? 0) + 1);
    }
    suffixBound.unshift(b);
    suffixTotal.unshift(t);
    suffixSets.unshift(sets);
  }

  // 武器槽固定提供的上界
  const weaponEff = query.weaponSlots.map(effSize).filter((s) => s > 0);
  const weaponBound = new Int16Array(k);
  let weaponTotal = 0;
  for (const s of weaponEff) {
    for (let i = 0; i < k; i++) weaponBound[i] = weaponBound[i]! + slotValue[s]![i]!;
    weaponTotal += slotTotal[s]!;
  }

  // ---------- DFS ----------
  const have = new Int16Array(k); // 已选防具（及武器固定提供）的技能点
  const fixed = new Int16Array(k);
  for (const { id, level } of query.fixedSkills ?? []) {
    const i = at.get(id);
    if (i != null) fixed[i] = fixed[i]! + level;
  }
  have.set(fixed);
  const slotPot = new Int16Array(k); // 已选防具槽 + 武器槽最多能给的点
  slotPot.set(weaponBound);
  let slotPotTotal = weaponTotal;
  const setCount = new Map<number, number>();
  for (const { id, points } of query.fixedSets ?? []) setCount.set(id, (setCount.get(id) ?? 0) + points);
  const chosen: Array<Cand | null> = [null, null, null, null, null];
  const limit = query.maxResults ?? Infinity;
  const stats: SearchStats = {
    combos: 0,
    found: 0,
    truncated: false,
    candidates: Object.fromEntries(ARMOR_SLOTS.map((s, i) => [s, cands[i]!.length])) as Record<
      ArmorSlot,
      number
    >,
  };
  let stopped = false;

  const canReach = (depth: number): boolean => {
    const rest = suffixBound[depth]!;
    let gapTotal = 0;
    for (let i = 0; i < k; i++) {
      const gap = need[i]! - have[i]!;
      if (gap <= 0) continue;
      if (slotPot[i]! + rest[i]! + charmBound[i]! < gap) return false;
      gapTotal += gap;
    }
    // 合计上界：每个槽只能塞一颗饰品，所以不能各技能都按满槽算
    if (gapTotal > slotPotTotal + suffixTotal[depth]! + charmTotal) return false;
    const restSets = suffixSets[depth]!;
    for (const [id, level] of setTargets) {
      if ((setCount.get(id) ?? 0) + (restSets.get(id) ?? 0) < level) return false;
    }
    for (const opts of unlockNeeds) {
      if (!opts.some((o) => (setCount.get(o.skill) ?? 0) + (restSets.get(o.skill) ?? 0) >= o.level))
        return false;
    }
    return true;
  };

  const apply = (c: Cand, sign: 1 | -1) => {
    for (let i = 0; i < c.vec.length; i += 2) {
      have[c.vec[i]!] = have[c.vec[i]!]! + sign * c.vec[i + 1]!;
    }
    for (const s of c.eff) {
      const v = slotValue[s]!;
      for (let i = 0; i < k; i++) slotPot[i] = slotPot[i]! + sign * v[i]!;
      slotPotTotal += sign * slotTotal[s]!;
    }
    if (c.set !== -1) setCount.set(c.set, (setCount.get(c.set) ?? 0) + sign);
    else if (c.piece.setSkill) {
      // 无关套装也计件数，结果里要显示
      const s = c.piece.setSkill.id;
      setCount.set(s, (setCount.get(s) ?? 0) + sign);
    }
  };

  const dfs = (depth: number) => {
    if (depth === 5) {
      stats.combos++;
      for (const c of charmCands) {
        tryLeaf(c);
        if (stopped) return;
      }
      return;
    }
    const si = order[depth]!;
    for (const c of cands[si]!) {
      chosen[si] = c;
      apply(c, 1);
      if (canReach(depth + 1)) dfs(depth + 1);
      apply(c, -1);
      chosen[si] = null;
      if (stopped) return;
    }
  };

  const tryLeaf = (charm: CharmCand) => {
    // 套装档位
    const setLevels: Record<number, number> = {};
    for (const [sid, n] of setCount) {
      if (n <= 0) continue;
      const tiers = skillsById.get(sid)?.setBonusLevels ?? [n];
      let lv = 0;
      for (const t of tiers) if (t <= n && t > lv) lv = t;
      if (lv > 0) setLevels[sid] = lv;
    }
    for (const [id, level] of setTargets) if ((setLevels[id] ?? 0) < level) return;

    // 缺口（极意没解锁时按基础上限截断，目标高于基础上限就不可能）
    const gap = new Int16Array(k);
    for (let i = 0; i < k; i++) {
      const info = skillsById.get(ids[i]!);
      const cap =
        info && info.unlockedBy?.length && !info.unlockedBy.some((c) => (setLevels[c.skill] ?? 0) >= c.level)
          ? info.baseMaxLevel
          : (info?.maxLevel ?? need[i]!);
      if (need[i]! > cap) return;
      gap[i] = Math.max(0, need[i]! - have[i]! - (charm.capped[i] ?? 0));
    }

    // 所有槽：武器在前，然后按部位顺序
    const slots: number[] = [];
    const owner: number[] = [];
    for (const s of query.weaponSlots) {
      slots.push(s);
      owner.push(-1);
    }
    for (let si = 0; si < 5; si++) {
      for (const s of chosen[si]!.piece.slots) {
        slots.push(s);
        owner.push(si);
      }
    }
    const byDesc = slots.map((_, i) => i).sort((a, b) => slots[b]! - slots[a]! || a - b);
    const assign = fillDecorations(
      gap,
      byDesc.map((i) => slots[i]!),
      decoPlan,
    );
    if (!assign) return;
    const placed: Array<number | null> = new Array(slots.length).fill(null);
    for (let j = 0; j < byDesc.length; j++) placed[byDesc[j]!] = assign[j]!;

    const result: SearchResult = {
      armor: { head: null, chest: null, arms: null, waist: null, legs: null },
      charm: charm.id,
      decorations: {
        weapon: placed.slice(0, query.weaponSlots.length),
        armor: { head: [], chest: [], arms: [], waist: [], legs: [] },
      },
      defense: 0,
      levels: {},
      setLevels,
      freeSlots: [],
      alternatives: { head: [], chest: [], arms: [], waist: [], legs: [] },
    };
    for (let si = 0; si < 5; si++) {
      const c = chosen[si]!;
      const slot = ARMOR_SLOTS[si]!;
      result.armor[slot] = c.piece.id === -1 ? null : c.piece.id;
      result.defense += c.piece.defense;
      result.alternatives[slot] = c.alts;
    }
    for (let j = 0; j < slots.length; j++) {
      if (owner[j]! >= 0) result.decorations.armor[ARMOR_SLOTS[owner[j]!]!].push(placed[j]!);
      if (placed[j] == null) result.freeSlots.push(slots[j]!);
    }
    result.freeSlots.sort((a, b) => b - a);
    // 最终等级（目标技能）：防具 + 护石 + 饰品
    const total = Int16Array.from(fixed);
    for (let si = 0; si < 5; si++)
      for (const { id, level } of chosen[si]!.piece.skills) {
        const i = at.get(id);
        if (i != null) total[i] = total[i]! + level;
      }
    for (const { id, level } of charm.skills) {
      const i = at.get(id);
      if (i != null) total[i] = total[i]! + level;
    }
    for (const d of placed) {
      if (d == null) continue;
      const o = decoById.get(d);
      if (o) for (let i = 0; i < o.vec.length; i += 2) total[o.vec[i]!] = total[o.vec[i]!]! + o.vec[i + 1]!;
    }
    for (let i = 0; i < k; i++) {
      const info = skillsById.get(ids[i]!);
      const unlockedNow =
        !info?.unlockedBy?.length || info.unlockedBy.some((c) => (setLevels[c.skill] ?? 0) >= c.level);
      const cap = unlockedNow ? (info?.maxLevel ?? 99) : (info?.baseMaxLevel ?? 99);
      result.levels[ids[i]!] = Math.min(total[i]!, cap);
    }

    stats.found++;
    if (onResult(result) === false) stopped = true;
    else if (stats.found >= limit) {
      stopped = true;
      stats.truncated = true;
    }
  };

  const decoById = new Map(decoOptions.map((o) => [o.id, o]));

  if (k === 0 && setTargets.size === 0) return stats;
  dfs(0);
  return stats;
}

/** a 是否支配 b：技能点都不少、套装相容、可用槽逐个不差 */
function dominates(a: Cand, b: Cand, k: number): boolean {
  if (b.set !== -1 && a.set !== b.set) return false;
  const av = new Int16Array(k);
  for (let i = 0; i < a.vec.length; i += 2) av[a.vec[i]!] = a.vec[i + 1]!;
  for (let i = 0; i < b.vec.length; i += 2) if (av[b.vec[i]!]! < b.vec[i + 1]!) return false;
  if (a.eff.length < b.eff.length) return false;
  for (let i = 0; i < b.eff.length; i++) if (a.eff[i]! < b.eff[i]!) return false;
  return true;
}

interface CharmCand {
  id: number | null;
  skills: Array<{ id: number; level: number }>;
  vec: number[];
  capped: Int16Array;
}

/** 护石：只留对目标有用、且不被别的护石支配的；一个有用的都没有时就是「不限」 */
function buildCharmCands(
  charms: CharmPiece[],
  at: Map<number, number>,
  need: Int16Array,
  minRarity: number,
  exclude: Set<number>,
): CharmCand[] {
  const k = need.length;
  const list: CharmCand[] = [];
  const seen = new Set<string>();
  for (const c of charms) {
    if (c.rarity < minRarity || exclude.has(c.id)) continue;
    const capped = new Int16Array(k);
    for (const { id, level } of c.skills) {
      const i = at.get(id);
      if (i != null) capped[i] = Math.min(need[i]!, capped[i]! + level);
    }
    const vec: number[] = [];
    for (let i = 0; i < k; i++) if (capped[i]) vec.push(i, capped[i]!);
    if (!vec.length) continue;
    const key = vec.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ id: c.id, skills: c.skills, vec, capped });
  }
  const kept = list.filter((b) => !list.some((a) => a !== b && a.capped.every((v, i) => v >= b.capped[i]!)));
  if (!kept.length) return [{ id: null, skills: [], vec: [], capped: new Int16Array(k) }];
  return kept.sort((a, b) => b.capped.reduce((n, v) => n + v, 0) - a.capped.reduce((n, v) => n + v, 0));
}

/** 饰品：按对目标技能的贡献去重，同一种贡献只留一个代表；只给无关技能的丢掉 */
function buildDecoOptions(
  decorations: DecorationPiece[],
  at: Map<number, number>,
  exclude: Set<number>,
): DecoOption[] {
  const bySig = new Map<string, DecoOption>();
  for (const d of decorations) {
    if (exclude.has(d.id)) continue;
    const pairs: Array<[number, number]> = [];
    for (const { id, level } of d.skills) {
      const i = at.get(id);
      if (i != null) pairs.push([i, level]);
    }
    if (!pairs.length) continue;
    pairs.sort((a, b) => a[0] - b[0]);
    const vec = pairs.flat();
    const sig = `${d.size}|${vec.join(',')}`;
    const prev = bySig.get(sig);
    const total = pairs.reduce((n, [, l]) => n + l, 0);
    if (!prev || d.id < prev.id) bySig.set(sig, { id: d.id, size: d.size, vec, total });
  }
  const list = [...bySig.values()];
  // 剔除被支配的：更小或同等级、每个技能点都不少
  const kept = list.filter(
    (b) =>
      !list.some((a) => {
        if (a === b || a.size > b.size) return false;
        const av = new Map<number, number>();
        for (let i = 0; i < a.vec.length; i += 2) av.set(a.vec[i]!, a.vec[i + 1]!);
        for (let i = 0; i < b.vec.length; i += 2) if ((av.get(b.vec[i]!) ?? 0) < b.vec[i + 1]!) return false;
        return a.size < b.size || a.total > b.total || a.id < b.id;
      }),
  );
  return kept.sort((a, b) => b.total - a.total || b.size - a.size || a.id - b.id);
}

/** 饰品填空的预处理结果：小饰品（单技能 +1）按技能各取最小的一颗，其余为「大饰品」 */
interface DecoPlan {
  /** small[i]：技能 i 最小的单技能 +1 饰品；没有则为 null（只能靠大饰品） */
  small: Array<{ id: number; size: number } | null>;
  /** 其余饰品（4 级的复合 / +2 以上等），按贡献从高到低 */
  big: DecoOption[];
  /** tier[i]：技能 i 的一点要占多大的槽（小饰品大小；只能靠大饰品的为 5） */
  tier: number[];
  /** suffixGain[b][t]：第 b 个及之后的大饰品，一颗最多抵掉多少需要 ≥ t 级槽的点数 */
  suffixGain: number[][];
  sizeOf: Map<number, number>;
  vecOf: Map<number, number[]>;
}

function makeDecoPlan(options: DecoOption[], k: number): DecoPlan {
  const small: DecoPlan['small'] = new Array(k).fill(null);
  const big: DecoOption[] = [];
  for (const o of options) {
    const single = o.vec.length === 2 && o.vec[1] === 1;
    if (single && o.size <= 3) {
      const i = o.vec[0]!;
      const cur = small[i];
      if (!cur || o.size < cur.size) small[i] = { id: o.id, size: o.size };
    } else big.push(o);
  }
  // 小饰品能替代的「单技能 +1 大饰品」没有意义，丢掉
  const keptBig = big.filter((o) => !(o.vec.length === 2 && o.vec[1] === 1 && small[o.vec[0]!]));
  // 技能 i 的点数要占多大的槽：小饰品的大小；只有大饰品能给的记为 5
  const tier = small.map((sm) => sm?.size ?? 5);
  // 只能靠大饰品的点数多的、需要大槽的排前面，更早撞到真正的瓶颈
  const weight = (o: DecoOption) => {
    let w = 0;
    for (let i = 0; i < o.vec.length; i += 2) w += o.vec[i + 1]! * tier[o.vec[i]!]!;
    return w;
  };
  keptBig.sort((a, b) => weight(b) - weight(a) || b.total - a.total || a.id - b.id);
  // suffixGain[b][t]：第 b 个及之后的大饰品里，一颗最多能抵掉多少「需要 ≥ t 级槽」的点数
  const suffixGain: number[][] = new Array(keptBig.length + 1);
  suffixGain[keptBig.length] = [0, 0, 0, 0, 0, 0];
  for (let b = keptBig.length - 1; b >= 0; b--) {
    const o = keptBig[b]!;
    const row = [...suffixGain[b + 1]!];
    for (let t = 1; t <= 5; t++) {
      let g = 0;
      for (let i = 0; i < o.vec.length; i += 2) if (tier[o.vec[i]!]! >= t) g += o.vec[i + 1]!;
      if (g > row[t]!) row[t] = g;
    }
    suffixGain[b] = row;
  }
  return {
    small,
    big: keptBig,
    tier,
    suffixGain,
    sizeOf: new Map(options.map((o) => [o.id, o.size])),
    vecOf: new Map(options.map((o) => [o.id, o.vec])),
  };
}

/**
 * 饰品填空：slots 为所有槽的等级（已从大到小排好），gap 是每个技能还差几点。
 * 返回每个槽放的饰品 id（null 为空槽）；填不满返回 null。
 *
 * 1–3 级饰品都是单技能 +1，各技能的最小一颗大小固定，所以只需搜索「用哪些大饰品、各几颗」；
 * 剩下的点数用小饰品补，能否放下由嵌套区间的霍尔条件直接判定：
 * 对每个等级 t，「≥ t 级的饰品数」不超过「≥ t 级的槽数」。
 * 找到后去掉多余的饰品，再按「大饰品放进最小能放下的槽」摆放，尽量把大槽空出来。
 */
function fillDecorations(gap: Int16Array, slots: number[], plan: DecoPlan): Array<number | null> | null {
  const k = gap.length;
  const out: Array<number | null> = new Array(slots.length).fill(null);
  let gapTotal = 0;
  for (let i = 0; i < k; i++) gapTotal += gap[i]!;
  if (gapTotal === 0) return out;

  // capAt[t]：≥ t 级的槽数（t = 1..4）
  const capAt = [0, 0, 0, 0, 0];
  for (const s of slots) for (let t = 1; t <= Math.min(s, 4); t++) capAt[t]!++;
  if (capAt[1]! === 0) return null;

  const rem = Int16Array.from(gap);
  const usedAt = [0, 0, 0, 0, 0]; // 大饰品占用的 ≥ t 级槽数
  const bigCount = new Array<number>(plan.big.length).fill(0);
  const failed = new Set<string>();

  /** 只用小饰品补齐剩下的点数，能否放下 */
  const smallFits = (): boolean => {
    const need = [0, 0, 0, 0, 0]; // need[t]：大小 ≥ t 的小饰品数
    for (let i = 0; i < k; i++) {
      const r = rem[i]!;
      if (r <= 0) continue;
      const sm = plan.small[i];
      if (!sm) return false;
      for (let t = 1; t <= sm.size; t++) need[t]! += r;
    }
    for (let t = 1; t <= 4; t++) if (usedAt[t]! + need[t]! > capAt[t]!) return false;
    return true;
  };

  /**
   * 分层上界：还能再放 free 颗大饰品，每颗占掉各级各一个槽、最多抵掉 gain[t] 点「需要 ≥ t 级槽」的点数。
   * 对每个 t 都要能放下，否则这条路不可能成功。
   */
  const hopeless = (b: number): boolean => {
    const free = capAt[4]! - usedAt[4]!;
    const gain = plan.suffixGain[b]!;
    const need = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < k; i++) {
      const r = rem[i]!;
      if (r <= 0) continue;
      for (let t = 1; t <= plan.tier[i]!; t++) need[t]! += r;
    }
    // 只能靠大饰品的点数
    if (need[5]! > free * gain[5]!) return true;
    for (let t = 1; t <= 4; t++) {
      const room = capAt[t]! - usedAt[t]!;
      // 用 y 颗大饰品：need − y·gain ≤ room − y，取 y = free 时最宽松（gain ≥ 1 时）
      const best = gain[t]! >= 1 ? need[t]! - free * (gain[t]! - 1) : need[t]!;
      if (best > room) return true;
    }
    return false;
  };

  const dfs = (b: number): boolean => {
    if (smallFits()) return true;
    if (b >= plan.big.length || usedAt[4]! >= capAt[4]!) return false;
    if (hopeless(b)) return false;
    const memo = `${b}|${usedAt.join(',')}|${rem.join(',')}`;
    if (failed.has(memo)) return false;
    const o = plan.big[b]!;
    // 最多放几颗：受空槽数限制，且至少还要补到某个技能
    let cmax = capAt[o.size]! - usedAt[o.size]!;
    let useful = 0;
    for (let i = 0; i < o.vec.length; i += 2) {
      const r = rem[o.vec[i]!]!;
      if (r > 0) useful = Math.max(useful, Math.ceil(r / o.vec[i + 1]!));
    }
    cmax = Math.min(cmax, useful);
    for (let c = cmax; c >= 1; c--) {
      for (let i = 0; i < o.vec.length; i += 2) rem[o.vec[i]!] = rem[o.vec[i]!]! - c * o.vec[i + 1]!;
      for (let t = 1; t <= o.size; t++) usedAt[t]! += c;
      bigCount[b] = c;
      if (dfs(b + 1)) return true;
      bigCount[b] = 0;
      for (let t = 1; t <= o.size; t++) usedAt[t]! -= c;
      for (let i = 0; i < o.vec.length; i += 2) rem[o.vec[i]!] = rem[o.vec[i]!]! + c * o.vec[i + 1]!;
    }
    if (dfs(b + 1)) return true;
    failed.add(memo);
    return false;
  };

  if (!dfs(0)) return null;

  // 选定的饰品：大饰品 + 小饰品补齐
  const picked: number[] = [];
  for (let b = 0; b < plan.big.length; b++)
    for (let c = 0; c < bigCount[b]!; c++) picked.push(plan.big[b]!.id);
  for (let i = 0; i < k; i++) for (let c = 0; c < rem[i]!; c++) picked.push(plan.small[i]!.id);
  // 去掉多余的（拿掉后各技能仍够数），先试大的
  const total = Int16Array.from(gap).map((g) => -g);
  for (const d of picked) {
    const v = plan.vecOf.get(d)!;
    for (let i = 0; i < v.length; i += 2) total[v[i]!] = total[v[i]!]! + v[i + 1]!;
  }
  picked.sort((a, b) => plan.sizeOf.get(b)! - plan.sizeOf.get(a)!);
  const keep: number[] = [];
  for (const d of picked) {
    const v = plan.vecOf.get(d)!;
    let spare = true;
    for (let i = 0; i < v.length; i += 2) if (total[v[i]!]! - v[i + 1]! < 0) spare = false;
    if (spare) for (let i = 0; i < v.length; i += 2) total[v[i]!] = total[v[i]!]! - v[i + 1]!;
    else keep.push(d);
  }
  // 有溢出的技能：把它的单技能大饰品（+L）换成小饰品（+1），只要换完仍够数；能省下 4 级槽
  for (let j = 0; j < keep.length; j++) {
    const v = plan.vecOf.get(keep[j]!)!;
    if (v.length !== 2) continue;
    const i = v[0]!;
    const sm = plan.small[i];
    if (!sm || v[1]! <= 1 || total[i]! < v[1]! - 1) continue;
    total[i] = total[i]! - (v[1]! - 1);
    keep[j] = sm.id;
  }
  keep.sort((a, b) => plan.sizeOf.get(b)! - plan.sizeOf.get(a)!);
  // 摆放：饰品从大到小，各自放进还空着的、最小的能放下的槽（slots 从大到小，所以从后往前找）
  for (const d of keep) {
    const size = plan.sizeOf.get(d)!;
    for (let j = slots.length - 1; j >= 0; j--) {
      if (out[j] == null && slots[j]! >= size) {
        out[j] = d;
        break;
      }
    }
  }
  return out;
}
