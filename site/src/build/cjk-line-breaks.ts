/**
 * 去掉 .astro 模板里中文之间的折行。
 *
 * Prettier 按宽度给长段落折行，浏览器会把中文之间的换行渲染成一个空格（「一致， 「主」」）。
 * Prettier 重排时也会把折行合并成一个真空格。这里在 Astro 编译之前读入源文件，把两个中日韩字符之间的
 * 换行与缩进、或单个空格去掉；只处理 frontmatter 之后的模板文字（{} 里渲染的数据不经过这里），
 * 中文与西文、数字之间的空格照常保留。
 */
import { readFile } from 'node:fs/promises';
import type { ViteUserConfig } from 'astro';

type Plugin = NonNullable<ViteUserConfig['plugins']>[number];

// 中日韩统一表意文字、假名、全角标点与全角字符
const CJK = '\\u2e80-\\u303f\\u3040-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\ufe30-\\ufe4f\\uff00-\\uffef';
const BREAK = new RegExp(`([${CJK}])(?:[ \\t]*\\r?\\n[ \\t]*| )(?=[${CJK}])`, 'g');
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export const joinCjkLines = (source: string): string => {
  const head = FRONTMATTER.exec(source)?.[0] ?? '';
  return head + source.slice(head.length).replace(BREAK, '$1');
};

export function cjkLineBreaks(): Plugin {
  return {
    name: 'mhdb:cjk-line-breaks',
    enforce: 'pre',
    async load(id: string) {
      if (!id.endsWith('.astro') || id.includes('/node_modules/')) return null;
      return joinCjkLines(await readFile(id, 'utf-8'));
    },
  };
}
