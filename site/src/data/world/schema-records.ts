/**
 * 纪录类（records.json，见 pipeline/mhdb/build/world_records.py 与 docs/DATA.md 3.11）。
 */
import { z } from 'zod';
import { OptText, Src, Text } from './schema';

export const Records = z
  .object({
    endemic: z
      .array(
        z
          .object({
            id: z.string().regex(/^ec\d{3}_\d{2}$/),
            /** 捕获后得到的物品 */
            item: z.number().int().positive(),
            name: Text,
            desc: OptText,
            stages: z.array(z.number().int()),
            _src: Src,
          })
          .strict(),
      )
      .min(1),
    medals: z
      .array(
        z
          .object({ id: z.number().int().min(0), name: Text, condition: OptText, iceborne: z.boolean() })
          .strict(),
      )
      .length(100),
    npcs: z.array(z.object({ id: z.number().int(), name: Text }).strict()).min(1),
    dlc: z.array(z.object({ id: z.number().int(), name: Text }).strict()).min(1),
  })
  .strict();
export type Records = z.infer<typeof Records>;
