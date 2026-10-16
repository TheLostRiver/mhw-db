/**
 * 狩猎笛：音色与可用旋律。
 * 规则（推断，与 Fextralife 三组笛子的旋律列表一致，见 docs/DATA.md 3.6）：
 * 旋律的某种音序里除残响以外的音符都在笛子的三个音色之内，就能吹奏；残响旋律为「残响 + 某音色」。
 */
import type { Melody } from '../../data/world/schema';

export type Note = Melody['sequences'][number][number];

/** 音色名（游戏文本里没有颜色名，界面用图标；这里按图标颜色命名） */
export const NOTE_LABEL: Record<Note, string> = {
  purple: '紫',
  red: '红',
  orange: '橙',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
  aqua: '水',
  white: '白',
  echo: '残响',
};

export const canPlaySequence = (seq: readonly Note[], horn: readonly Note[]): boolean =>
  seq.every((n) => n === 'echo' || horn.includes(n));

export const canPlay = (m: Pick<Melody, 'sequences'>, horn: readonly Note[]): boolean =>
  m.sequences.some((s) => canPlaySequence(s, horn));

/** 音色组合的键（页面锚点、筛选用），如 purple-red-blue */
export const hornKey = (horn: readonly Note[]): string => horn.join('-');
