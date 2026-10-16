import { describe, expect, it } from 'vitest';
import { hitDamage, trueRaw, type Attacker, type DamageConstants } from './damage';

const K: DamageConstants = {
  critMultiplier: 1.25,
  badCritMultiplier: 0.75,
  sharpness: {
    raw: [0.5, 0.75, 1, 1.05, 1.2, 1.32, 1.39],
    element: [0.25, 0.5, 0.75, 1, 1.0625, 1.15, 1.25],
  },
};
const base: Attacker = {
  raw: 200,
  affinity: 0,
  element: null,
  sharpness: 5,
  critMultiplier: 1.25,
  critElement: 1,
  weakness: [0, 0],
  wounded: false,
};
// 雌火龙头部（上位）：斩 70、打 75、弹 65，火 0 水 15 雷 20 冰 15 龙 30，眩晕 100
const head = [70, 75, 65, 0, 15, 20, 15, 30, 100, 100];
const hit = { type: 'sever' as const, mv: 48, ele: 1, fixed: 0, stun: 0, exhaust: 0 };

describe('hitDamage', () => {
  it('物理：真实攻击 × 动作值 × 锐利度 × 肉质', () => {
    const r = hitDamage(base, hit, head, K);
    expect(r.raw).toBeCloseTo((200 * 48 * 1.32 * 70) / 10000, 6);
    expect(r.rawExpected).toBeCloseTo(r.raw, 6);
    expect(r.rawCrit).toBeCloseTo(r.raw * 1.25, 6);
  });

  it('会心率：正会心按会心倍率、负会心按 0.75 计期望', () => {
    const pos = hitDamage({ ...base, affinity: 40 }, hit, head, K);
    expect(pos.rawExpected).toBeCloseTo(pos.raw * (1 + 0.4 * 0.25), 6);
    const neg = hitDamage({ ...base, affinity: -20 }, hit, head, K);
    expect(neg.rawExpected).toBeCloseTo(neg.raw * (1 - 0.2 * 0.25), 6);
  });

  it('弱点特效只在物理肉质 ≥ 45 时加会心率，受伤部位用第二个参数', () => {
    const a = { ...base, weakness: [30, 50] as [number, number] };
    expect(hitDamage(a, hit, head, K).affinity).toBe(30);
    expect(hitDamage({ ...a, wounded: true }, hit, head, K).affinity).toBe(50);
    const neck = [40, 45, 35, 0, 0, 5, 0, 15, 0, 100];
    expect(hitDamage(a, hit, neck, K).affinity).toBe(0);
    expect(hitDamage({ ...a, affinity: 90 }, hit, head, K).affinity).toBe(100);
  });

  it('属性：真实属性 × 属性补正 × 锐利度属性补正 × 属性肉质；会心属性只在会心时乘', () => {
    const a = { ...base, element: { type: 'dragon' as const, value: 30 }, critElement: 1.2, affinity: 50 };
    const r = hitDamage(a, { ...hit, ele: 0.6 }, head, K);
    expect(r.element).toBeCloseTo((30 * 0.6 * 1.15 * 30) / 100, 6);
    expect(r.elementCrit).toBeCloseTo(r.element * 1.2, 6);
    expect(r.elementExpected).toBeCloseTo(r.element * (1 + 0.5 * 0.2), 6);
  });

  it('远程武器不计锐利度；固定伤害不看肉质；眩晕按眩晕肉质', () => {
    const r = hitDamage({ ...base, sharpness: -1 }, { ...hit, type: 'shot', stun: 20, fixed: 50 }, head, K);
    expect(r.raw).toBeCloseTo((200 * 48 * 65) / 10000, 6);
    expect(r.fixed).toBe(50);
    expect(r.total).toBeCloseTo(r.raw + 50, 6);
    expect(r.stun).toBe(20);
  });

  it('显示攻击力换算真实值', () => {
    expect(trueRaw(960, 4.8)).toBe(200);
  });
});
