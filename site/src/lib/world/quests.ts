/**
 * 任务页的共用文字：目标、怪物名、星级。
 */
import type { Quest, Quests } from '../../data/world/schema-quests';

export const RANK_LABEL = { low: '下位', high: '上位', master: '大师' } as const;
export const OBJECTIVE_LABEL = {
  hunt: '狩猎',
  slay: '讨伐',
  capture: '捕获',
  deliver: '交纳',
  all: '狩猎所有目标',
} as const;

export const starLabel = (q: Pick<Quest, 'rank' | 'stars'>) => `${q.rank === 'master' ? 'M' : ''}★${q.stars}`;

export const questUrl = (id: number) => `/world/quests/${id}/`;

/** 怪物编号 → 名称与（大型怪的）详情页链接 */
export function monsterRef(data: Quests, id: number): { name: string; href?: string } {
  const m = data.monsters[String(id)];
  if (!m) return { name: `怪物 #${id}` };
  // 只有大型怪物（em001_00 这类键）有详情页
  const href = /^em\d{3}_\d{2}$/.test(m.key) ? `/world/monsters/${m.key}/` : undefined;
  return href ? { name: m.name['zh-Hans'], href } : { name: m.name['zh-Hans'] };
}
