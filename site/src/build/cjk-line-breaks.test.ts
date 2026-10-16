import { describe, expect, it } from 'vitest';
import { joinCjkLines } from './cjk-line-breaks';

describe('joinCjkLines', () => {
  it('去掉中文之间的折行与缩进', () => {
    expect(joinCjkLines('<p>\n  标记与权重逐条一致，\n  「主」是标记为 2\n  的地带。\n</p>')).toBe(
      '<p>\n  标记与权重逐条一致，「主」是标记为 2\n  的地带。\n</p>',
    );
  });

  it('中文与西文、标签之间的换行保留', () => {
    const src = '<p>\n  数据来源：\n  <code>a.ecem</code>\n  Spring /\n  Summer\n</p>';
    expect(joinCjkLines(src)).toBe(src);
  });

  it('不改 frontmatter', () => {
    const src = '---\n// 注释一\n// 注释二\nconst a = 1;\n---\n<p>甲\n乙</p>';
    expect(joinCjkLines(src)).toBe('---\n// 注释一\n// 注释二\nconst a = 1;\n---\n<p>甲乙</p>');
  });

  it('去掉中文之间的单个空格（Prettier 合并折行留下的）', () => {
    expect(joinCjkLines('<p>一致， 「主」是标记</p>')).toBe('<p>一致，「主」是标记</p>');
  });

  it('处理 CRLF', () => {
    expect(joinCjkLines('<p>甲\r\n    乙</p>')).toBe('<p>甲乙</p>');
  });
});
