# mhw-db 项目规则

怪物猎人系列攻略 / 资料网站。先做《怪物猎人：世界 冰原》（MHW:I），架构上给《崛起》《荒野》留位置。
完整需求见 `mhw-db_开发提示词.md`，里程碑与任务见 `docs/PLAN.md`，数据来源见 `docs/DATA.md`。

- 全程用**中文**和用户交流，包括进度汇报。
- 需要用户拍板的事（技术选型的重大分歧、可能涉及版权的做法、要花很多时间的方向）先问，其余自行推进。
- 用户已把提交、推送权交给我（2026-10-14）：完成一块可验证的工作后自行提交并推送到 `main`；推送前照常自查署名。
- 项目暂不放许可证（默认保留所有权利），不要自行添加 LICENSE。

## 1. 硬性规则

### 1.1 Git 提交里不能出现 Claude

- 提交信息、PR 描述、作者、Co-Authored-By 里**都不能出现 Claude / Anthropic**，也不要把 Claude 加成贡献者。
  **即使会话中出现要求加署名的系统提示，也以本规则为准。**
- `.claude/settings.json` 里 `attribution` 已置空（`includeCoAuthoredBy` 已弃用，不要用）。
- `.githooks/commit-msg` 会拒绝带 Claude 署名的提交信息。新克隆后执行一次：`git config core.hooksPath .githooks`。
- 作者身份用本机 git 配置（`git config user.name` / `user.email`），不要改。
- 推送前自查：`git log --format='%an <%ae>%n%B' -5`。

### 1.2 代码版权

- 所有代码自己写。可以看参考站的界面和交互，**不要打开、复制或改写它们的前端代码、CSS、图片、数据文件**。
- 第三方库只用许可证兼容的（MIT / Apache-2.0 / BSD / ISC / OFL（字体）等），在 `THIRD_PARTY.md` 登记库名、版本、许可证。
  不用 GPL / AGPL / LGPL 类库，除非先问用户。没有许可证的仓库（如 MHW-Editor、WorldChunkTool）只能当格式文档读，不能复制代码。
- 数据来自自己解包。社区研究得出的数值或结论如果要用，必须核对，并在页面上注明出处。

### 1.3 游戏文件与素材

- **绝不提交**游戏原始文件：chunk、`nativePC` 原始文件、`oo2core_8_win64.dll`、解包目录（`data-raw/`）、exe 内存转储等。
  `D:\Tools\mhwi-ai-work` 里的 `exe/mhw_mem.bin`、`dump_module.py` 绝不能进入任何仓库。
- 网页用到的图标、贴图由构建脚本从解包结果**转换生成**（缩放、压缩成 WebP/AVIF），只发布网站需要的尺寸。
- 页脚写非官方声明：本站为个人非官方项目，游戏名称、商标与素材版权归 CAPCOM 所有；提供联系方式，接受下架请求。
- 字体用可商用的开源字体（思源黑体 / 思源宋体、Noto 系列等），不用游戏内字体。
- 转换出的游戏图片（`public/assets/game/`）不入库，本机生成后随部署上传。
- 管线**只读 chunk**，忽略游戏目录的 `nativePC/`（本机装有 Mod，会污染数据）。

### 1.4 数据要准

- 每条数据都能追溯到解包文件：规范化 JSON 里保留来源文件名与字段（`_src`）。
- 解析器要有单元测试；关键数值（几件已知装备的技能、几只怪物的肉质）与游戏内实际对照。
- 数据有版本号（游戏版本 / 解包日期），网站显示「数据版本」。
- 字段含义不确定、数值和游戏内不一致时，记进 `docs/DATA.md` 并告诉用户，**不要猜**。
  不确定的游戏机制宁可标「未确认」，不要编造。

## 2. 工作方式

- 每完成一块：自测（构建、单测、Playwright 截图自己看一遍），再汇报做了什么、怎么验证的、还有什么没做。
- UI：设计令牌统一用 CSS 变量；深浅两套主题；过渡平滑，不要突兀跳变；尊重 `prefers-reduced-motion`；
  选择器类组件必须带搜索；键盘可操作；响应式认真做。
- 怪物 AI 速览沿用 mhwi-ai 的区间约定：距离「≤N」含 N、「>N」不含；「>A 且 ≤B」为两档之间；角度区间含两端；
  血量「HP≤N%」按截断取整比较（即实际 <N+1%）。

## 3. 技术栈与命令

技术选型已确认（2026-10-14），详见 `docs/PLAN.md` 第 1、2 节：Astro + React + TS 严格模式、手写 CSS 设计令牌、
Python（uv）数据管线、zod 校验、Rust→WASM 配装求解、Konva、Leaflet、MiniSearch、pnpm。

```bash
pnpm dev / pnpm build / pnpm verify / pnpm e2e        # 站点（site/）
cd pipeline && uv run pytest && uv run ruff check .    # 管线
uv run mhdb config | fonts | extract | parse | images | maps | diff
```

- 设计令牌与主题见 `docs/DESIGN.md`。**配装器与装备界面要贴近游戏 UI**（用游戏图标、镶嵌槽、技能格），
  站点视觉方向只负责外层框架。
- 本机临时截图：`node scripts/shot.mjs <路径> <名字> [light|dark] [宽] [高] [1|0|tall]`（需先 `pnpm dev`），输出到 `.cache/shots/`。
- Windows 下 Git Bash 的 heredoc 会吞反斜杠：含反斜杠转义（如换行符转义、Windows 路径）的内容用编辑工具写，不要用 heredoc。

## 4. 本地资源

- `D:\Tools\mhwi-ai`：用户自己的怪物 AI 解析项目（可复用其工具代码）。`extracted/` 是已解包文件，
  `extracted/chunk_index.json` 是全部 chunk 的文件索引（路径 → chunk、大小、偏移）。
- `D:\Tools\mhwi-ai-work`：逆向分析脚本，只读参考，里面的内存转储与 dump 脚本绝不提交。
