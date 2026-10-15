/**
 * 大地图的公共小工具：路径、分组、图片地址。
 */
import type { MapStage } from '../../data/world/schema';

export const MAP_GROUPS = {
  field: '地图区域',
  special: '特殊区域',
  base: '据点区域',
} as const satisfies Record<MapStage['group'], string>;

/** 用英文地名做路径：Ancient Forest → ancient-forest，Elder's Recess → elders-recess */
export function stageSlug(stage: Pick<MapStage, 'id' | 'name'>): string {
  const en = stage.name.en;
  if (!en) return `st${stage.id}`;
  return en
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const ASSETS = '/assets/game/world/maps';

export const patchUrl = (stageId: number, letter: string, half: boolean): string =>
  `${ASSETS}/st${stageId}/${letter.toLowerCase()}${half ? '-half' : ''}.webp`;

export const backdropUrl = (stageId: number, half: boolean): string =>
  `${ASSETS}/st${stageId}/back${half ? '-half' : ''}.webp`;

export const thumbUrl = (thumb: string): string => `${ASSETS}/${thumb}.webp`;

export const PARCHMENT_URL = `${ASSETS}/parchment.webp`;

/** 区域号标签在地图坐标里的位置 */
export const labelPoint = (p: MapStage['patches'][number]): [number, number] => [
  p.mapX + p.label[0],
  p.mapY + p.label[1],
];

/** 楼层的显示名：1 层起 */
export const layerName = (layer: number): string => `${layer + 1}层`;
