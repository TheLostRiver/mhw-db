/**
 * 百科列表页共用的显示规则：部位名、属性名、龙封力、物品分类、稀有度颜色、图标路径。
 */
import type { Item, Weapon } from '../../data/world/schema';

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

type Coating = keyof typeof COATING_LABEL;

/** 武器专属参数的一行说明：炮击、瓶、猎虫加成、弓的可用瓶（「＋」为强化）；没有时为空串。狩猎笛音色另行绘制 */
export function weaponSpecialText(sp: Weapon['special']): string {
  if (!sp) return '';
  if (sp.shelling) return `${SHELL_LABEL[sp.shelling.type]} Lv${sp.shelling.level}`;
  if (sp.phial) return `${PHIAL_LABEL[sp.phial.type]}${sp.phial.value ? ` ${sp.phial.value * 10}` : ''}`;
  if (sp.kinsectBonus != null) return KINSECT_BONUS_LABEL[sp.kinsectBonus] ?? '';
  const coatings = sp.coatings;
  if (coatings)
    return (Object.keys(COATING_LABEL) as Coating[])
      .filter((k) => coatings[k] > 0)
      .map((k) => `${COATING_LABEL[k].replace('瓶', '')}${coatings[k] > 1 ? '+' : ''}`)
      .join('、');
  return '';
}

/** 操虫棍的猎虫加成（与游戏文本 cm_status 的 STATUS_ROD_SKILL_01…08 一致） */
export const KINSECT_BONUS_LABEL = [
  '攻击强化【切断】',
  '攻击强化【打击】',
  '攻击强化【属性】',
  '速度强化',
  '回复强化【耐力】',
  '回复强化【体力】',
  '猎虫强化【气·力】发动',
  '体力回复·耐力强化',
] as const;

export const itemIconUrl = (i: Pick<Item, 'icon'>) => `${BASE}/item/${i.icon.id}-${i.icon.color}.webp`;
/** 环境生物的专属图标（狩猎笔记 cmn_creature00 的格子号，见 records.json 的 endemic[].icon） */
export const endemicIconUrl = (icon: number) => `${BASE}/endemic/${icon}.webp`;
export const equipIconUrl = (slot: string, rarity: number) => `${BASE}/equip/${slot}-${rarity}.webp`;
export const socketIconUrl = (level: number) => `${BASE}/socket/${level}.webp`;
export const decoIconUrl = (size: number, color: number) => `${BASE}/deco/${size}-${color}.webp`;
export const skillIconUrl = (color: number) => `${BASE}/skill/${color}.webp`;
export const mantleIconUrl = (id: number, color: number) => `${BASE}/mantle/${id}-${color}.webp`;
