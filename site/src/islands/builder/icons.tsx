/** 游戏图标（由 mhdb images 生成到 /assets/game/world/，不入库；缺失时隐藏） */
import type { ArmorSlot } from '../../lib/world/builder';

const BASE = '/assets/game/world';

export const iconUrl = {
  equip: (slot: ArmorSlot | 'charm', rarity: number) => `${BASE}/equip/${slot}-${rarity}.webp`,
  weapon: (type: string, rarity: number) => `${BASE}/weapon/${type}-${rarity}.webp`,
  deco: (size: number, color: number) => `${BASE}/deco/${size}-${color}.webp`,
  skill: (color: number) => `${BASE}/skill/${color}.webp`,
  socket: (level: number) => `${BASE}/socket/${level}.webp`,
  mantle: (id: number, color: number) => `${BASE}/mantle/${id}-${color}.webp`,
  status: (i: number) => `${BASE}/status/${i}.webp`,
  /** 自定义强化项目的图标（gen_pre_icon 里的头像） */
  augment: (name: string) => `${BASE}/augment/${name}.webp`,
  /** 自定义强化的格子：已用 / 空（2026-10-19 起改名 cell-*：旧名 hex-* 的图被浏览器缓存了 7 天，换内容后看不到） */
  augmentHex: (used: boolean) => `${BASE}/augment/cell-${used ? 'used' : 'empty'}.webp`,
  /** 未装备时的灰色占位图标 */
  empty: {
    weapon: (type: string) => `${BASE}/weapon/${type}-0.webp`,
    equip: (slot: ArmorSlot | 'charm') => `${BASE}/equip/${slot}-0.webp`,
    mantle: () => `${BASE}/mantle/empty.webp`,
  },
};

interface Props {
  src: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function GameIcon({ src, size = 32, className, alt = '' }: Props) {
  return (
    <img
      className={className ? `gb-icon ${className}` : 'gb-icon'}
      src={src}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}

/** 技能等级格：已发动为金色，上限内未发动为空格，超出上限的点数单独标出 */
export function LevelBoxes({
  level,
  cap,
  max,
  over = 0,
}: {
  level: number;
  cap: number;
  max: number;
  over?: number;
}) {
  return (
    <span className="gb-boxes" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} data-on={i < level ? '' : undefined} data-locked={i >= cap ? '' : undefined} />
      ))}
      {over > 0 && <b className="gb-over">+{over}</b>}
    </span>
  );
}
