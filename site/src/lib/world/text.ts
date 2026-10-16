/**
 * 游戏文本里的强调色标记：管线把 <STYL MOJI_YELLOW_DEFAULT>x</STYL> 转成 [yellow]x[/]（见 mhdb/formats/gmd.py）。
 */
const TAG = /\[([a-z]+)\]([\s\S]*?)\[\/\]/g;

export interface TextSegment {
  text: string;
  color?: string;
}

/** 拆成带颜色的片段，供页面着色显示 */
export function textSegments(t: string | undefined): TextSegment[] {
  const out: TextSegment[] = [];
  const s = t ?? '';
  let last = 0;
  for (const m of s.matchAll(TAG)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[2]!, color: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** 去掉标记（用于 title、搜索文本等不能着色的地方） */
export const plainText = (t: string | undefined): string => (t ?? '').replace(TAG, '$2');
