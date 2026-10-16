/**
 * 聚魔之地（guiding-lands.json，见 pipeline/mhdb/build/world_guiding.py 与 docs/DATA.md 3.14）。
 */
import { z } from 'zod';
import { Text } from './schema';

const Src = z.object({ file: z.string().startsWith('quest/enemy/'), row: z.number().int().min(0) }).strict();
const PerRegion = z.array(z.array(z.number().int().nonnegative()).length(7)).length(6);

export const GuidingLands = z
  .object({
    regions: z
      .array(
        z
          .object({
            key: z.enum(['forest', 'wildspire', 'coral', 'rotted', 'volcanic', 'tundra']),
            stage: z.number().int(),
            name: Text,
          })
          .strict(),
      )
      .length(6),
    monsters: z
      .array(
        z
          .object({
            gameId: z.number().int().nonnegative(),
            monster: z.string().regex(/^em\d{3}_\d{2}$/),
            /** 出现前要完成的任务（按任务编号对应，推断） */
            unlockQuest: z.number().int().positive().nullable(),
            /** 六个地带的栖息标记：0 不出现、1、2（2 为主要地带） */
            habitat: z.array(z.union([z.literal(0), z.literal(1), z.literal(2)])).length(6),
            /** 6 地带 × 7 级的出现权重 */
            weights: PerRegion,
            /** 第二组权重（只在与第一组不同时给出，含义未确认） */
            weightsAlt: PerRegion.optional(),
            unknown: z.record(z.string(), z.number().int()),
            _src: Src,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type GuidingLands = z.infer<typeof GuidingLands>;

/** 调查任务（investigations.json，见 world_guiding.build_investigations 与 docs/DATA.md 3.14） */
export const Investigation = z
  .object({
    gameId: z.number().int().nonnegative(),
    monster: z.string().regex(/^em\d{3}_\d{2}$/),
    groups: z
      .array(
        z
          .object({
            rank: z.enum(['low', 'high', 'master']),
            /** 推断为历战个体 */
            tempered: z.boolean(),
            /** 要先完成的任务；null = 没有前置任务 */
            unlock: z.number().int().positive().nullable(),
            /** 组内第二个任务编号（与第一个不同时给出，含义未确认） */
            unlockAlt: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .min(1),
    _src: Src,
  })
  .strict();
export type Investigation = z.infer<typeof Investigation>;
