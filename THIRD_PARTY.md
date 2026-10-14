# 第三方依赖与素材

只使用许可证兼容的依赖（MIT / Apache-2.0 / BSD / ISC / OFL 等）。新增依赖时同步更新本表。

## 站点（npm）

| 名称 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| astro | 7.3.x | MIT | 站点框架（静态生成） |
| @astrojs/react | 7.0.x | MIT | React 岛 |
| react / react-dom | 19.3.x | MIT | 交互组件 |
| zustand | 5.0.x | MIT | 工具页状态 |
| immer | 11.1.x | MIT | 不可变状态（撤销 / 重做） |
| @fontsource-variable/noto-sans-sc | 5.3.x | OFL-1.1（字体）/ MIT（包） | 思源黑体（Noto Sans SC） |
| @fontsource-variable/noto-serif-sc | 5.3.x | OFL-1.1 / MIT | 思源宋体（Noto Serif SC） |
| @fontsource/lxgw-wenkai | 5.3.x | OFL-1.1 / MIT | 霞鹜文楷（方向 A 批注） |
| @fontsource-variable/fraunces | 5.3.x | OFL-1.1 / MIT | 西文衬线（方向 A） |
| @fontsource-variable/martian-mono | 5.3.x | OFL-1.1 / MIT | 等宽数字（方向 B） |
| @fontsource-variable/bricolage-grotesque | 5.3.x | OFL-1.1 / MIT | 西文无衬线（方向 C） |

开发依赖：typescript（Apache-2.0）、@astrojs/check（MIT）、vitest（MIT）、@playwright/test（Apache-2.0）、
eslint（MIT）、typescript-eslint（MIT）、eslint-plugin-astro（MIT）、eslint-plugin-react-hooks（MIT）、
prettier（MIT）、prettier-plugin-astro（MIT）、@types/react、@types/react-dom（MIT）。

**排除**：Astro 的可选依赖 `sharp` 的 Windows 预编译包含 LGPL-3.0 的 libvips，已通过
`pnpm-workspace.yaml` 的 `ignoredOptionalDependencies` 排除，Astro 使用 passthrough 图片服务。

## 数据管线（Python）

| 名称 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| Pillow | 12.3.x | MIT-CMU | 图片处理、WebP/AVIF 输出 |
| texture2ddecoder | 1.0.x | MIT | BC7 等压缩贴图解码 |
| fonttools | 4.66.x | MIT | 标题字体子集化 |
| brotli | 1.2.x | MIT | woff2 压缩（fonttools 依赖） |
| zopfli | 0.4.x | Apache-2.0 | 压缩（fonttools 依赖） |

开发依赖：pytest（MIT）、ruff（MIT）。

## 字体文件

| 文件 | 来源 | 许可证 | 说明 |
|---|---|---|---|
| `site/public/fonts/mhdb-display/MHDBDisplay-Oblique.woff2` | [得意黑 Smiley Sans](https://github.com/atelier-anchor/smiley-sans) v2.0.1 | OFL-1.1 | 按站内用字子集化。原字体有保留字体名称（Smiley / 得意黑），修改版已改名为 MHDB Display，保留版权与许可证字段；许可证全文见同目录 `OFL.txt` |

## 游戏素材

游戏图标、贴图、文本与数据版权归 CAPCOM CO., LTD. 所有，由本项目管线从本机游戏文件转换生成，
不提交原始文件；转换出的图片（`site/public/assets/game/`）不入库。
