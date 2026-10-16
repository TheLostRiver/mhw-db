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

/** 祭典日程（schedule.json，见 world_records.build_schedule 与 docs/DATA.md 3.11） */
const Season = z.enum(['spring', 'summer', 'autumn', 'winter', 'memorial']);
export const Schedule = z
  .object({
    weeks: z
      .array(
        z
          .object({
            week: z.number().int().min(1).max(53),
            /** 0 平时，1–5 = star[].id */
            festival: z.number().int().min(0).max(5),
            /** 轮换编号：平时 1–3 循环，祭典 = 祭典编号 + 3（含义未确认） */
            rotation: z.number().int().min(1).max(8),
            unk: z.number().int(),
          })
          .strict(),
      )
      .length(53),
    star: z.array(z.object({ id: z.number().int().min(1).max(5), season: Season, name: Text }).strict()).length(5),
    moon: z.array(z.object({ season: Season, name: Text }).strict()).length(4),
    _src: z.object({ file: z.string(), names: z.string() }).strict(),
  })
  .strict();
export type Schedule = z.infer<typeof Schedule>;
