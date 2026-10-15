/**
 * 地图标记（采集点等）的显示规则：名称、图标、抽选概率、楼层分布。
 * 数据见 map-nodes.json（pipeline/mhdb/build/world_nodes.py）。
 */
import { RANKS, type MapNode, type MapNodeKind, type MapNodeStage, type Rank } from '../../data/world/schema';

/** 页面传给地图岛的物品摘要（只含用到的物品） */
export interface MapItem {
  name: string;
  icon: number;
  color: number;
}
export type MapItems = Record<number, MapItem>;

export type Category = MapNodeKind['category'];

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'camp', label: '营地' },
  { key: 'gather', label: '采集点' },
  { key: 'bug', label: '虫与鱼饵' },
  { key: 'mining', label: '矿脉' },
  { key: 'bonepile', label: '骨冢' },
  { key: 'specialty', label: '特产' },
  { key: 'creature', label: '交互环境生物' },
  { key: 'npc', label: 'NPC' },
  { key: 'slinger', label: '投射器弹' },
  { key: 'carry', label: '搬运物' },
  { key: 'other', label: '其他' },
];

export const CAMP_ICON = '/assets/game/world/ui/camp.webp';
export const NPC_ICON = '/assets/game/world/ui/npc.webp';

/** 种类在地图上的图标：营地用帐篷，交互环境生物用游戏地图上的图标，其余用代表物品的图标 */
export function kindIconUrl(
  kind: MapNodeKind,
  stage: MapNodeStage,
  rank: Rank,
  items: MapItems,
): string | null {
  if (kind.category === 'camp') return CAMP_ICON;
  if (kind.category === 'npc') return NPC_ICON;
  if (kind.actionIcon) return `/assets/game/world/action/${kind.actionIcon}.webp`;
  const id = mainItem(kind, stage, rank);
  return id !== null && items[id] ? itemIconUrl(items[id]) : null;
}
export const stageEmblemUrl = (stageId: number): string => `/assets/game/world/ui/stage-${stageId}.webp`;

export const RANK_LABEL: Record<Rank, string> = { low: '下位', high: '上位', master: '大师' };

export const itemIconUrl = (it: Pick<MapItem, 'icon' | 'color'>): string =>
  `/assets/game/world/item/${it.icon}-${it.color}.webp`;

export interface LotRow {
  item: number;
  count: number;
  /** 0–100 */
  chance: number;
}

/** 某等级下的抽选表（按权重换算成概率）；该等级没有这张表时为空 */
export function lotRows(stage: MapNodeStage, rank: Rank, index: number): LotRow[] {
  const rows = stage.lots[rank]?.[String(index)] ?? [];
  const total = rows.reduce((s, e) => s + e.weight, 0) || 1;
  return rows.map((e) => ({ item: e.item, count: e.count, chance: (e.weight * 100) / total }));
}

/** 代表物品：固定物品，或该等级第一张抽选表里权重最高的物品 */
export function mainItem(kind: MapNodeKind, stage: MapNodeStage, rank: Rank): number | null {
  if (kind.item !== null) return kind.item;
  const first = kind.lots[0];
  if (first === undefined) return null;
  const rows = lotRows(stage, rank, first);
  return rows.reduce<LotRow | null>((a, b) => (a && a.chance >= b.chance ? a : b), null)?.item ?? null;
}

/** 物件名称（gmk_names / animal_names 里有的），没有时用代表物品的名字 */
export function kindName(kind: MapNodeKind, stage: MapNodeStage, rank: Rank, items: MapItems): string {
  if (kind.name) return kind.name['zh-Hans'];
  const id = mainItem(kind, stage, rank);
  return (id !== null && items[id]?.name) || kind.key;
}

/** 抽选表里的物品名（去重，按第一张表的顺序），用作列表里的副标题与搜索 */
export function lotItemNames(kind: MapNodeKind, stage: MapNodeStage, rank: Rank, items: MapItems): string[] {
  const seen = new Set<number>();
  for (const i of kind.lots) for (const r of lotRows(stage, rank, i)) seen.add(r.item);
  return [...seen].map((id) => items[id]?.name ?? `#${id}`);
}

/** 当前环境状态下出现的点：常驻的 + 该状态追加的 */
export const nodeVisibleIn = (n: MapNode, state: number): boolean => n.state === null || n.state === state;

/** 该等级下会出现的点：按抽选表采集的物件要求该等级有这张表；上位起的点不在下位出现 */
export function nodeInRank(n: MapNode, kind: MapNodeKind, stage: MapNodeStage, rank: Rank): boolean {
  if (n.minRank && RANKS.indexOf(rank) < RANKS.indexOf(n.minRank)) return false;
  return kind.lots.length === 0 || kind.lots.some((i) => stage.lots[rank]?.[String(i)] !== undefined);
}

/** 各楼层的点数（只数落在地图上的） */
export function layerCounts(nodes: MapNode[], layers: number): number[] {
  const out = Array.from({ length: layers }, () => 0);
  for (const n of nodes) if (n.layer !== null && n.layer < layers) out[n.layer]!++;
  return out;
}

export const formatChance = (c: number): string =>
  c >= 10 || Number.isInteger(c) ? c.toFixed(0) : c.toFixed(1);
