/**
 * 武器招式表的显示规则：伤害类型、分组、由数据字段生成的备注。
 * 数据见 moves.json（pipeline/mhdb/build/world_moves.py）。
 */
import type { Move, WeaponType } from '../../data/world/schema';

export const DAMAGE_TYPE_LABEL: Record<Move['type'], string> = {
  sever: '斩',
  blunt: '打',
  shot: '弹',
  none: '—',
};

export const GROUP_LABEL: Record<Move['group'], string> = {
  melee: '近战攻击',
  shell: '弹体（箭矢、弩弹、炮击、瓶爆炸等）',
  claw: '钩爪',
  hunter: '猎人共通',
  item: '投射器与道具',
};

/** 弹体记录的属性种类：与武器数据的属性编号相同（1 火 2 水 3 冰 4 雷 5 龙），按编号推断 */
const ELEMENT_TYPE: Record<number, string> = { 1: '火', 2: '水', 3: '冰', 4: '雷', 5: '龙' };

const n = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));

/** 显示名：译名，没有时用原文；原文为空时用序号 */
export const moveName = (m: Move): string => m.zh ?? (m.ja || `（无开发名 #${m.i}）`);

/** 由字段生成的备注（只写数据里确有的事实，不写招式派生关系这类数据里没有的内容） */
export function moveNotes(m: Move): string[] {
  const out: string[] = [];
  if (m.fixed) out.push(`固定伤害 ${n(m.fixed)}`);
  if (m.noSharp) out.push('不消耗锐利度');
  if (m.soften) out.push(`软化值 ${n(m.soften)}`);
  if (m.hitstopB !== undefined) out.push(`另一组卡肉 ${n(m.hitstopB)} 秒`);
  if (m.condMv) out.push(`条件动作值 ${n(m.condMv)}`);
  if (m.condEle) out.push(`条件属性补正 ${n(m.condEle)}`);
  if (m.elementType && ELEMENT_TYPE[m.elementType]) out.push(`${ELEMENT_TYPE[m.elementType]}属性`);
  if (m.fixedElement) out.push(`固定属性伤害 ${n(m.fixedElement)}`);
  const [poison, para, sleep, blast] = m.fixedStatus ?? [0, 0, 0, 0];
  if (poison) out.push(`毒 ${n(poison)}`);
  if (para) out.push(`麻痹 ${n(para)}`);
  if (sleep) out.push(`睡眠 ${n(sleep)}`);
  if (blast) out.push(`爆破 ${n(blast)}`);
  if (m.tranq) out.push(`捕获麻醉 ${n(m.tranq)}`);
  if (m.group === 'shell' && !m.mv && !m.fixed) out.push('伤害由另外的数值表决定（如铳枪炮击等级）');
  if (m.aka?.length) out.push(`同一参数也用于：${m.aka.map((x) => x.zh ?? x.ja).join('、')}`);
  return out;
}

export const fmt = n;

/** 某武器的分组（按数据文件顺序），每组内按记录序号 */
export function groupMoves(
  moves: Move[],
  weapon: WeaponType | 'common',
): { group: Move['group']; file: string; moves: Move[] }[] {
  const out: { group: Move['group']; file: string; moves: Move[] }[] = [];
  for (const m of moves) {
    if (m.weapon !== weapon) continue;
    let g = out.find((x) => x.file === m.file);
    if (!g) {
      g = { group: m.group, file: m.file, moves: [] };
      out.push(g);
    }
    g.moves.push(m);
  }
  return out;
}
