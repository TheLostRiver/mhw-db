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
