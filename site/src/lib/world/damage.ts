/**
 * 伤害计算（一次命中的期望伤害）。
 *
 * 物理 = 真实攻击力 × 动作值 / 100 × 锐利度物理补正 × 肉质 / 100 × 会心补正
 * 属性 = 真实属性值 × 属性补正 × 锐利度属性补正 × 属性肉质 / 100 ×（会心时）会心属性倍率
 * 会心补正：会心率 p ≥ 0 时期望为 1 + p ×（会心倍率 − 1），p < 0 时为 1 + p ×（1 − 负会心倍率）。
 * 弱点特效：命中部位物理肉质 ≥ 45 时会心率加技能参数（受伤部位用第二个参数）。
 *
 * 动作值、补正取自招式数据（moves.json），肉质取自怪物数据（monsters.json），锐利度补正、会心倍率、
 * 武器倍率取自 constants.json；公式结构是社区通行的算法，未计任务防御率、怒气倍率与取整。
 */

export const HZ_INDEX = {
  sever: 0,
  blunt: 1,
  shot: 2,
  fire: 3,
  water: 4,
  thunder: 5,
  ice: 6,
  dragon: 7,
  stun: 8,
  exhaust: 9,
} as const;
export type ElementKey = 'fire' | 'water' | 'thunder' | 'ice' | 'dragon';
export const ELEMENT_KEYS: ElementKey[] = ['fire', 'water', 'thunder', 'ice', 'dragon'];

export interface DamageConstants {
  critMultiplier: number;
  badCritMultiplier: number;
  sharpness: { raw: number[]; element: number[] };
}

export interface Attacker {
  /** 真实攻击力（显示值 ÷ 武器倍率） */
  raw: number;
  /** 会心率（%），不含弱点特效 */
  affinity: number;
  /** 真实属性值（显示值 ÷ 10）；毒、麻痹等异常属性不造成属性伤害，传 null */
  element: { type: ElementKey; value: number } | null;
  /** 锐利度颜色序号 0 红 … 6 紫；远程武器为 -1（不计锐利度） */
  sharpness: number;
  /** 会心伤害倍率（超会心） */
  critMultiplier: number;
  /** 会心时的属性倍率（会心攻击【属性】，未装备为 1） */
  critElement: number;
  /** 弱点特效的会心率加成：[有效部位, 受伤的有效部位] */
  weakness: [number, number];
  wounded: boolean;
}

export interface HitInput {
  type: 'sever' | 'blunt' | 'shot' | 'none';
  mv: number;
  ele: number;
  fixed: number;
  stun: number;
  exhaust: number;
}

export interface HitResult {
  /** 实际会心率（含弱点特效，限制在 −100…100） */
  affinity: number;
  physicalHz: number;
  elementHz: number;
  raw: number;
  rawCrit: number;
  rawExpected: number;
  element: number;
  elementCrit: number;
  elementExpected: number;
  fixed: number;
  total: number;
  totalCrit: number;
  expected: number;
  stun: number;
  exhaust: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** hz：10 个肉质值（斩、打、弹、火、水、雷、冰、龙、眩晕、减气） */
export function hitDamage(a: Attacker, hit: HitInput, hz: number[], k: DamageConstants): HitResult {
  const physicalHz = hit.type === 'none' ? 0 : (hz[HZ_INDEX[hit.type]] ?? 0);
  const elementHz = a.element ? (hz[HZ_INDEX[a.element.type]] ?? 0) : 0;
  const wex = physicalHz >= 45 ? a.weakness[a.wounded ? 1 : 0] : 0;
  const affinity = clamp(a.affinity + wex, -100, 100);
  const p = affinity / 100;
  const sharpRaw = a.sharpness >= 0 ? (k.sharpness.raw[a.sharpness] ?? 1) : 1;
  const sharpEle = a.sharpness >= 0 ? (k.sharpness.element[a.sharpness] ?? 1) : 1;
  const critMul = affinity >= 0 ? a.critMultiplier : k.badCritMultiplier;
  const critFactor = 1 + Math.abs(p) * (critMul - 1);

  const raw = hit.type === 'none' ? 0 : (a.raw * hit.mv * sharpRaw * physicalHz) / 10000;
  const rawCrit = raw * a.critMultiplier;
  const rawExpected = raw * critFactor;
  const element = a.element && hit.mv > 0 ? (a.element.value * hit.ele * sharpEle * elementHz) / 100 : 0;
  const elementCrit = element * a.critElement;
  const elementExpected = element * (1 + Math.max(p, 0) * (a.critElement - 1));
  const fixed = hit.fixed;
  return {
    affinity,
    physicalHz,
    elementHz,
    raw,
    rawCrit,
    rawExpected,
    element,
    elementCrit,
    elementExpected,
    fixed,
    total: raw + element + fixed,
    totalCrit: rawCrit + elementCrit + fixed,
    expected: rawExpected + elementExpected + fixed,
    stun: (hit.stun * (hz[HZ_INDEX.stun] ?? 0)) / 100,
    exhaust: (hit.exhaust * (hz[HZ_INDEX.exhaust] ?? 0)) / 100,
  };
}

/** 显示攻击力 ↔ 真实攻击力 */
export const trueRaw = (display: number, bloat: number) => (bloat > 0 ? display / bloat : display);
