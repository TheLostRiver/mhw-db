/**
 * 武器种类的显示名与图标。
 */
import { WEAPON_TYPES, type WeaponType } from '../../data/world/schema';

export const WEAPON_TYPE_NAMES: Record<WeaponType, string> & Readonly<Record<string, string>> = {
  'great-sword': '大剑',
  'long-sword': '太刀',
  'sword-and-shield': '片手剑',
  'dual-blades': '双剑',
  hammer: '大锤',
  'hunting-horn': '狩猎笛',
  lance: '长枪',
  gunlance: '铳枪',
  'switch-axe': '斩击斧',
  'charge-blade': '盾斧',
  'insect-glaive': '操虫棍',
  'light-bowgun': '轻弩',
  'heavy-bowgun': '重弩',
  bow: '弓',
};

/** 游戏里武器种类的排列顺序（与数据文件 wp00–wp13 相同） */
export const WEAPON_ORDER: readonly WeaponType[] = WEAPON_TYPES;

/** 武器种类图标（cmn_item00 的武器格子），rarity 决定颜色 */
export const weaponIconUrl = (type: WeaponType, rarity = 0): string =>
  `/assets/game/world/weapon/${type}-${rarity}.webp`;
