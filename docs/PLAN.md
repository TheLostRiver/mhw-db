# mhw-db 规划

> 状态：**方案待用户确认**。确认前不写功能代码。最后一节是需要用户拍板的事项。

## 1. 技术选型

| 层 | 选择 | 许可证 | 理由 |
|---|---|---|---|
| 站点框架 | **Astro**（静态输出） | MIT | 百科页全部静态生成，SEO 和首屏最好；交互工具以「岛」的形式按需加载，重代码只在工具页下载。自带 View Transitions，页面切换能做到平滑不跳变。 |
| 交互组件 | **React** + TypeScript 严格模式 | MIT | HMM 也是 React + TS，你熟悉；生态最全：画布 `react-konva`、虚拟列表 `@tanstack/react-virtual`、无障碍组件 `react-aria-components`（Apache-2.0，键盘与读屏支持完善）。Svelte 包体更小，但这些库的对应物较弱。 |
| 样式 | **手写 CSS + 设计令牌（CSS 变量）** | — | 要做自己的视觉语言，令牌、主题、动效全在自己手里；Astro 组件自带作用域样式，React 组件用 CSS Modules。不用 Tailwind：类名堆砌不利于维护统一的设计系统。 |
| 工具状态 | Zustand + Immer | MIT | 配装器 / 封面生成器需要撤销重做，Immer 的不可变快照天然适合做历史栈。 |
| 数据管线 | **Python 3.12**（uv 管理环境） | — | 你的 `mhw_chunk.py`（Oodle ctypes）、`questdata.py`（Blowfish）都是 Python，直接复用改写；`struct` 解析二进制简单可靠。解析器全部用 Python 贯穿到底。 |
| 图片处理 | 自写 `.tex` 解析 + `texture2ddecoder`（BCn 解码）+ Pillow | MIT / MIT-CMU | 一条 Python 管线出 PNG→WebP/AVIF 多尺寸与地图瓦片，不依赖 .NET 工具。`texconv`（MIT）作为备用。不用 `sharp`：其预编译包含 LGPL 的 libvips。 |
| 数据校验 | **zod** 定义 schema（TS 侧，单一来源）→ 导出 JSON Schema 给 Python 侧 pytest 复用 | MIT | 前端直接拿到类型；`pnpm data:check` 做 schema + 引用断链检查，构建前强制执行，失败即中断。 |
| 配装求解 | **Rust → WASM**（wasm-bindgen），跑在 Web Worker 池 | MIT/Apache-2.0 | 「追加技能搜索」要对上百个候选技能各跑一次完整可行性搜索，计算量远大于单次配装；Rust 性能稳定、可多 Worker 并行切分搜索空间。本机已有 cargo。 |
| 封面生成 | **Konva** + react-konva | MIT | 自带拖拽 / 缩放 / 旋转变换手柄（Transformer）、命中检测、图层与按倍率导出（1080p / 2K / 4K 只是 `pixelRatio` 不同）。自己从零写这些要多花数周；吸附对齐、批量生成在其上自己实现。配装图片导出共用同一套渲染。 |
| 地图 | **Leaflet**（`CRS.Simple`） | BSD-2 | 游戏地图是图片坐标，不是经纬度；Leaflet 的平面坐标系最直接，插件少依赖少。MapLibre 偏向矢量瓦片与地理坐标，用在这里得绕路。 |
| 搜索 | MiniSearch + 构建期生成拼音 / 首字母（pinyin-pro）+ 繁简 | MIT | 名称本身就有游戏官方的简中 / 繁中 / 日 / 英四份，全部入索引；拼音和首字母在构建期生成（多音字生成多个变体）；查询端只带一张由站内用字裁剪出的繁→简小字表，不加载完整 OpenCC。 |
| PWA | `@vite-pwa/astro`（Workbox） | MIT | 离线缓存百科与工具。 |
| 测试 | Vitest（计算逻辑）、pytest（解析器）、Playwright（截图与交互回归）、`cargo test`（求解器） | MIT / Apache-2.0 | |
| 字体 | 思源黑体 / 思源宋体（Noto Sans SC / Serif SC）、数字用 Noto Sans Mono 或 JetBrains Mono | OFL | 构建期按站内实际用字子集化，切成 `unicode-range` 分片的 woff2，自托管。 |
| 部署 | Cloudflare Workers 静态资源（与 AI 解析站相同方式）+ 少量 Worker 接口（短链接、反馈） | — | `wrangler deploy` 从本地上传。 |
| 包管理 | pnpm workspace；Python 用 uv | — | |

URL 结构给多作品留位置：`/world/…`（世界：冰原）、以后 `/rise/…`、`/wilds/…`；数据目录同样按作品分：`data/world/`。

## 2. 目录结构

```text
mhw-db/
├── .claude/settings.json        # 署名置空（入库）
├── .githooks/commit-msg         # 拒绝 Claude 署名
├── CLAUDE.md  README.md  THIRD_PARTY.md
├── docs/
│   ├── PLAN.md                  # 本文件
│   ├── DATA.md                  # 每种数据的来源文件、字段含义、解析状态、疑问
│   ├── DESIGN.md                # 设计系统说明（令牌、组件规范）
│   └── changelog/               # 数据差异报告（每次重新解包生成）
├── pipeline/                    # Python 数据管线（uv 项目）
│   ├── pyproject.toml
│   ├── manifest.toml            # 要解包的文件清单（正则），保持 data-raw 精简
│   ├── mhdb/
│   │   ├── cli.py               # mhdb extract / parse / images / diff
│   │   ├── chunk/               # chunk 解包（改写自 mhwi-ai/tools/mhw_chunk.py）
│   │   ├── formats/             # 每种文件一个解析器：gmd.py、tex.py、itm.py、am_dat.py、wp_dat.py……
│   │   ├── build/               # 把解析结果组装成规范化实体（武器树、套装、合成配方……）
│   │   ├── images/              # 图标裁切与着色、多尺寸导出、地图瓦片
│   │   └── games/world/         # 冰原专属的编号表、常量
│   └── tests/                   # pytest：合成字节单测 + 依赖本地解包结果的对照测试（缺文件时跳过）
├── data/                        # 生成的规范化 JSON（入库）
│   ├── schema/                  # 由 zod 导出的 JSON Schema
│   └── world/                   # meta.json、items.json、skills.json、armor.json、weapons/*.json……
├── data-raw/                    # 解包输出（gitignore）
├── crates/solver/               # Rust 配装求解器 → WASM
├── site/                        # Astro 站点
│   ├── astro.config.ts
│   ├── public/                  # 静态文件；public/assets/game/ 为管线生成的游戏图片（不入库）
│   └── src/
│       ├── pages/world/…        # 文件路由；百科页用 getStaticPaths 由数据生成
│       ├── layouts/  components/  islands/（React 交互组件）
│       ├── styles/tokens.css    # 设计令牌
│       ├── data/                # zod schema、数据加载与派生索引
│       ├── lib/                 # 伤害计算、配装统计、分享编码等纯函数（Vitest）
│       └── workers/             # 求解器 Worker、搜索索引 Worker
├── tests/e2e/                   # Playwright
└── package.json  pnpm-workspace.yaml
```

## 3. 数据管线

```text
游戏目录 ──extract──▶ data-raw/world/<指纹>/ ──parse──▶ data/world/*.json ──data:check──▶ 站点构建
   │                         │                          │
   │                         └──images──▶ site/public/assets/game/（WebP/AVIF、多尺寸、地图瓦片）
   └─ exe 版本号 + chunk 指纹 → data/world/meta.json（数据版本）       └──diff──▶ docs/changelog/<版本>.md
```

1. **解包** `mhdb extract --game <游戏目录>`：改写你的 `mhw_chunk.py`。首次建立 chunk 文件索引并缓存（按各 chunk 的大小 / 修改时间判断是否失效）；按 `manifest.toml` 中的正则只解需要的文件（装备、物品、文本四语、怪物 dtt、任务 mib、stage set / itlot、UI 图标与地图贴图），输出到 `data-raw/world/<指纹>/`。用 `pefile`（MIT）读取 exe 的文件版本号。
2. **解析** `mhdb parse`：每种文件一个解析器，输出规范化 JSON。每条记录带 `_src`（来源文件、记录序号、原始 id），多语言名称内联为 `{ "zh-Hans", "zh-Hant", "ja", "en" }`。游戏文本里的样式标签（如 `<STYL …>`、`<ICON …>`）转成站内自己的富文本标记。
3. **文本**：从 `common/text/**/*_{chS,chT,jpn,eng}.gmd` 取四语；默认简中。站点构建时按语言拆出精简包，工具页只加载当前语言。
4. **图片** `mhdb images`：解析 `.tex` 头 → BCn 解码 → 从 UI 图集裁出图标 → 按数据里的颜色编号着色（游戏物品图标是灰度形状 + 稀有度 / 颜色）→ 输出 WebP + AVIF 多尺寸；地图底图切成 Leaflet 瓦片。
5. **校验** `pnpm data:check`：zod 校验每个文件；检查 id 唯一、引用完整（配方素材 → 物品、装备技能 → 技能、套装技能 → 技能、武器树父子关系）、四语文本覆盖率。任何一项失败，构建失败。
6. **差异报告** `mhdb diff`：按实体 id 对比新旧 `data/`，列出新增 / 删除 / 字段变化，生成 Markdown，供写更新日志。
7. **数据版本**：`meta.json` 记录游戏版本号、exe SHA-256 前缀、chunk 指纹、解包日期、管线版本；站点页脚与「数据版本」页展示。

测试策略：每个解析器先用测试里**构造的字节**做单测（不依赖游戏文件、可在任何环境跑）；再用本地解包结果跑「对照测试」（文件不存在时自动跳过），断言若干已知值——这些已知值需要你在游戏内核对确认，列表见 `docs/DATA.md`。

## 4. 里程碑

1. **地基**：仓库初始化、工程骨架、设计令牌、字体、3 个视觉方向静态稿。
2. **数据管线 v1**：解包 → 文本 / 物品 / 技能 / 防具 / 护石 / 饰品 / 武器 → JSON + 校验；图标导出；数据版本与差异报告。
3. **百科 v1**：装备、技能、物品、怪物基础页；全站搜索（`/` 与 `Ctrl+K`）。
4. **配装器 v1**：手动配装 + 状态面板 + 分享；然后自动配装（Rust/WASM）+ 追加技能搜索。
5. **封面生成器 v1**。
6. **交互式地图 v1**。
7. **怪物页完善**（肉质热力图、掉落、AI 速览与深链）、我的工具页、快捷链接。
8. 伤害模拟、其余百科（任务、赏金、聚魔之地、祭典……）、PWA、多语言界面。

### 里程碑 1：地基（详细）

- [x] 1.1 本地仓库初始化，关联 `origin`（远程为空仓库）
- [x] 1.2 `.claude/settings.json` 署名置空；`.githooks/commit-msg` + `core.hooksPath`，已自测拒绝 / 放行
- [x] 1.3 `CLAUDE.md`、`.gitignore`（含游戏原始格式扩展名兜底）
- [ ] 1.4 `README.md`、`THIRD_PARTY.md`（暂不放 `LICENSE`）、`.editorconfig`、`.gitattributes`（统一 LF，二进制标记）
- [ ] 1.5 pnpm workspace + Astro + React + TS 严格模式；ESLint、Prettier；`pnpm verify` 一键跑类型检查、单测、构建、数据校验
- [ ] 1.6 Python 管线骨架：uv 项目、ruff、pytest、`mhdb` 命令行入口
- [ ] 1.7 设计令牌 `tokens.css`：颜色（原始色板 → 语义令牌）、字号阶梯、4px 间距体系、圆角、阴影层级、动效时长与缓动；深浅主题（跟随系统 + 手动切换，切换时颜色平滑过渡）；`prefers-reduced-motion` 降级
- [ ] 1.8 字体：自托管思源 / Noto，子集化脚本（fonttools，MIT）
- [ ] 1.9 3 个视觉方向静态稿：每个方向做「首页 + 配装器」，深浅两套，桌面 + 手机；路由 `/_design/a|b|c/`；Playwright 截图交给你挑
- [ ] 1.10 Playwright 基础设施（截图基线、多视口）
- [ ] 1.11 部署打通：`wrangler.jsonc`、部署占位页到 `mhdb.helsincy.com`

### 里程碑 2：数据管线 v1（详细）

- [ ] 2.1 解包：改写 `mhw_chunk.py` 为 `mhdb extract`；索引缓存、manifest 选择性解包、四语文本；exe 版本 + chunk 指纹；XOR / 密钥流程的合成数据单测
- [ ] 2.2 `.gmd` 文本解析器：键名、字符串表、空项与占位符；样式标签转换；四语字典；单测
- [ ] 2.3 物品 `common/item/itemData.itm`：id、类型、稀有度、图标编号与颜色、携带上限、售价、标志位；名称 / 说明来自 `steam/item_*.gmd`
- [ ] 2.4 技能 `skill_point_data.skl_pt_dat` + `skill_data.skl_dat`：技能、各级说明、上限、极意解锁、套装技能；文本来自 `vfont/skill_pt_*.gmd`、`vfont/skill_*.gmd`
- [ ] 2.5 防具 `armor.am_dat` + `amr_series.amrs` + `armor.eq_crt` + `arm_upgrade.arm_up`：阶位（下 / 上 / 大师）、稀有度、防御（初始 / 最大 / 强化）、耐性、槽位、技能、系列、性别、幻化标记、打造素材
- [ ] 2.6 护石 `charm.ch_dat` + `charm.eq_crt`：技能、等级链、打造 / 强化素材
- [ ] 2.7 饰品 `deco.deco`：槽位等级、技能（含 4 级复合珠）、稀有度、对应物品
- [ ] 2.8 武器：14 种 `*.wp_dat` / `*.wp_dat_g` + `kireaji.kire`（锐利度）+ `weapon.eq_crt` / `weapon.eq_cus`（打造与派生树）+ 专属参数表（瓶、炮击、笛音、猎虫、弹种 / 装填）；攻击、属性 / 异常、会心、槽位、防御加成、武器树
- [ ] 2.9 武器扩展：冥赤觉醒与特殊武器强化（`em104_*`、`em117_*`，对应关系待确认）、零件强化（`customParts.*`、`new_limit_break.*`）、自定义外观（`customOuter*.cus_ou`）——配装器需要，放在 2.8 之后
- [ ] 2.10 zod schema、JSON Schema 导出、`pnpm data:check`（引用完整性、四语覆盖率）
- [ ] 2.11 图片：`.tex` 解析 + BCn 解码；物品 / 装备 / 技能图标裁切与着色；怪物图标；多尺寸 WebP/AVIF
- [ ] 2.12 `meta.json` 数据版本；`mhdb diff` 差异报告
- [ ] 2.13 对照测试：一组已知值（装备技能、锐利度、饰品技能等），请你在游戏内核对
- [ ] 2.14 `docs/DATA.md` 补全：每个文件的字段表、解析状态、未确认项

## 5. 视觉方向（先描述，确认后做静态稿）

三个方向都不用游戏的金边描框，不使用游戏美术作为装饰（只在内容里使用转换出的图标）。

### A「调查手记」——编辑式、博物图鉴

- **气质**：像一本精心排版的新大陆博物图鉴，安静、可读、有书卷感。和参考站差异最大。
- **色彩**：浅色是米白纸面 `#F4F1EA` + 墨色 `#1E1C19`，朱砂 `#B5432F` 作唯一强调，苔绿作辅助；深色是夜墨 `#15171A` + 羊皮灰文字，朱砂提亮为 `#E06A50`。
- **字体**：标题用思源宋体，正文用思源黑体，数字一律等宽对齐（tabular-nums）。
- **版式**：大留白，用细墨线分隔区域；侧边栏式批注；怪物与装备做成「标本卡」（编号、学名式的多语名称、要点）。
- **组件与动效**：卡片不用阴影，靠纸色深浅和细线分层；选中态是朱砂下划线或角标印章；页面进入时内容轻微上移淡入（8px）。
- **首页**：杂志封面式大标题 + 本期祭典 / 活动「调查报告」卡；分类索引排成目录页。
- **配装器**：左边装备清单像手记表格，右边状态面板像实验记录，技能等级画成刻度尺。
- **风险**：工具页信息密度高，装饰必须很克制。

### B「导虫」——精密仪表、工具优先

- **气质**：深色优先的专业工具台，类似高端音频 / 设计软件；导虫的萤绿是唯一的发光色。
- **色彩**：深色是石墨 `#0E1113`、面板 `#161B1E`、分隔线 `#263036`，强调色导虫绿 `#5CF2B4`（发光只用于焦点和激活），警示琥珀 `#F2B45C`；浅色是冷灰白 `#F3F5F6` + 深青 `#0B7A5A`。
- **字体**：思源黑体；数值用等宽字体（Noto Sans Mono / JetBrains Mono），全部右对齐。
- **版式**：12 栏栅格、1px 网格线、紧凑表格、可折叠停靠的面板。
- **组件与动效**：小圆角（6px）；悬停时边框亮起，焦点有柔和外发光；数值变化时数字滚动；面板展开用弹性曲线；加载指示是几粒导虫光点（减少动效模式下改为静态）。
- **首页**：搜索优先——中央大搜索框（`Ctrl+K`），下方快速入口网格，顶部一条「数据版本 / 当前祭典」状态条。
- **配装器**：三栏工作台（装备槽 | 技能统计 | 状态面板），自动配装结果流式加入右侧列表，可钉住比较。
- **风险**：百科阅读页容易显得冷。

### C「地脉」——分层氛围、随地区换色

- **气质**：现代游戏启动器式的精致与氛围，色彩驱动，第一眼最「高级」。
- **色彩**：中性底色 + 每个地区一套主题色（古代树苔绿、大蚁冢砂金、陆珊瑚珊瑚粉、瘴气之谷赤褐、龙结晶晶橙、永霜冰蓝）；浏览某只怪物或某张地图时，`--accent` 平滑过渡到对应主题色。属性色（火水雷冰龙）全站统一。
- **字体**：思源黑体可变字重，大标题用粗字重并收紧字距。
- **版式**：大圆角（16–20px）卡片、半透明磨砂层、柔和多层阴影；背景是程序生成的渐变网格和等高线纹理（自己画，不用游戏美术）。
- **组件与动效**：卡片悬停轻微视差；列表 → 详情时怪物图标通过 View Transitions 共享元素飞入；地区切换时主题色渐变。
- **首页**：全宽主视觉区（当前祭典 / 推荐怪物，背景随怪物主题色变化），下方横向滑动的分类卡带。
- **配装器**：浮层式面板，选择器是大号网格卡片，带平滑缩放滚动。
- **风险**：磨砂与动效有性能成本，信息密度最低。

**我的建议**：以 B 的工作台骨架做工具页（配装器、伤害模拟、地图、封面），以 A 的排版做百科阅读页，两者共用一套令牌；C 的「随地区 / 怪物换强调色」作为点缀吸收进来。静态稿仍按三个独立方向做，方便你直观比较，再决定是否混合。

## 6. 已定事项（2026-10-14）

1. 技术选型按第 1 节执行。
2. 项目**暂不放许可证**（默认保留所有权利）。
3. 用户级 `~/.claude/settings.json` 不动，只用项目级设置。
4. 游戏目录：`D:\Software\Steam\steamapps\common\Monster Hunter World`。`oo2core_8_win64.dll` 已不在游戏目录，
   使用 `D:\Tools\mhwi-ai\oo2core_8_win64.dll`（路径写在本地配置里，不入库）。
   游戏目录的 `nativePC/` 装有 Mod（含 `common/equip`），**管线只读 chunk，忽略 `nativePC`**。
5. 子域名：`mhdb.helsincy.com`。
6. 转换出的游戏图片（图标、地图瓦片）**不入库**，本机生成后随 `wrangler deploy` 上传；JSON 数据入库。
7. `mhw-db_开发提示词.md` 不入库。
8. 分享先做纯 URL 编码；Worker + KV 短码到里程碑 4 再定。
9. 动作值来源继续调查，只能从 exe 取时先问。
