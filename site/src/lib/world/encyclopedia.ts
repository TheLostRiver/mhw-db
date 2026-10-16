/**
 * 百科列表页共用的显示规则：部位名、属性名、龙封力、物品分类、稀有度颜色、图标路径。
 */
import type { Item } from '../../data/world/schema';

const BASE = '/assets/game/world';

export const SLOT_NAMES = { head: '头部', chest: '身体', arms: '腕部', waist: '腰部', legs: '脚部' } as const;
export const SLOT_ORDER = ['head', 'chest', 'arms', 'waist', 'legs'] as const;

export const ELEMENT_NAMES: Record<string, string> = {
  fire: '火',
  water: '水',
  ice: '冰',
  thunder: '雷',
  dragon: '龙',
  poison: '毒',
  paralysis: '麻痹',
  sleep: '睡眠',
  blast: '爆破',
};

/** 龙封力：3 = 大 已核对；1 / 2 按顺序推断（与配装器一致） */
export const ELDERSEAL = ['—', '小', '中', '大'] as const;

/**
 * 物品分类（itemData 的 type）。分类名按各类里的物品归纳，不是游戏文本。
 * 类型 4 是饰品的物品条目，百科里放在饰品页。
 */
export const ITEM_TYPES: { type: number; slug: string; label: string; note: string }[] = [
  { type: 0, slug: 'consumables', label: '道具', note: '回复药、解毒药、陷阱、弹丸等' },
  { type: 1, slug: 'materials', label: '素材', note: '矿石、骨、怪物素材等' },
  { type: 2, slug: 'other', label: '其他', note: '换金道具、龙之泪等' },
  { type: 3, slug: 'ammo', label: '弹药与瓶', note: '弩弹、弓的瓶' },
  { type: 5, slug: 'room', label: '房间装饰', note: '个人房间的装饰品' },
];

/** 武器专属参数的名字（与游戏文本 cm_status 的 STATUS_BURST_TYPE0x、AXE_BOTTLE_TYPE_0x、STATUS_BOW_BOTTLE_0x 一致） */
export const SHELL_LABEL = { normal: '通常型', long: '放射型', wide: '扩散型' } as const;
export const PHIAL_LABEL = {
  power: '强击瓶',
  element: '强属性瓶',
  dragon: '灭龙瓶',
  exhaust: '减气瓶',
  paralysis: '麻痹瓶',
  poison: '毒瓶',
  impact: '榴弹瓶',
} as const;
export const COATING_LABEL = {
  close: '接击瓶',
  power: '强击瓶',
  paralysis: '麻痹瓶',
  poison: '毒瓶',
  sleep: '睡眠瓶',
  blast: '爆破瓶',
} as const;

export const itemIconUrl = (i: Pick<Item, 'icon'>) => `${BASE}/item/${i.icon.id}-${i.icon.color}.webp`;
export const equipIconUrl = (slot: string, rarity: number) => `${BASE}/equip/${slot}-${rarity}.webp`;
export const socketIconUrl = (level: number) => `${BASE}/socket/${level}.webp`;
export const decoIconUrl = (size: number, color: number) => `${BASE}/deco/${size}-${color}.webp`;
export const skillIconUrl = (color: number) => `${BASE}/skill/${color}.webp`;
export const mantleIconUrl = (id: number, color: number) => `${BASE}/mantle/${id}-${color}.webp`;
