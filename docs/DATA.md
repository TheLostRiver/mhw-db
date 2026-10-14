# 数据来源与解析状态

> 所有数据来自自己解包《怪物猎人：世界 冰原》（PC / Steam 版）。表中的字段含义分三档：
> **已核对**（与游戏画面对照过）、**已验证结构**（文件大小与结构严格吻合、名称对得上，但数值未与画面逐一对照）、**未确认**。

状态：⬜ 未开始 · 🟨 已解析（结构验证） · ✅ 已解析并与游戏核对 · ❓ 有疑问（见第 5 节）

## 1. 管线

```bash
cd pipeline
uv run mhdb extract   # 按 manifest.toml 从 chunk 解包到 data-raw/world/（约 5900 个文件，9 秒）
uv run mhdb parse     # → data/world/*.json（入库）
uv run mhdb images    # → site/public/assets/game/world/（不入库）
```

- **只从 chunk 解包，忽略游戏目录的 `nativePC/`**：本机 `nativePC/` 装有 Mod（含 `common/equip`），会覆盖装备数据。
- 本机依赖（不入库，路径写在 `pipeline/local.toml`）：`oo2core_8_win64.dll`、`chunk.key`（MHWNoChunk 的子块密钥表）。
- **数据版本**：exe 的版本资源是 0.0.0.0，读不到游戏版本号；改用 Steam `appmanifest_582010.acf` 的 `buildid`
  （当前 15539686），加上 exe SHA-256 前缀与 chunk 指纹，写在 `data/world/meta.json`。
  ❓ 标题画面显示的版本号（如 15.xx.xx）需要用户告知，或继续找数据来源。
- 所有表格文件都用 `read_table` 读取：记录长度 × 记录数必须**恰好**等于文件长度，否则直接报错。
- 每条记录带 `_src`（来源文件与行号）。

## 2. 文件格式

| 格式 | 解析器 | 要点 | 状态 |
|---|---|---|---|
| chunk | `mhdb/chunk/reader.py` | 子块 0x40000 字节，Oodle 压缩 + 16 字节循环 XOR；改写自用户的 mhw_chunk.py | ✅ |
| `.gmd` 文本 | `mhdb/formats/gmd.py` | 版本 0x10302；177 个文件字符串数多于键数，以字符串序号为主索引；样式标签 `<STYL MOJI_x_DEFAULT>`、`<ICON ALPHA>` 等 | ✅（3133 个文件全部通过） |
| 定长记录表 | `mhdb/formats/table.py` | 头 `u32 magic 0x18091001, u16 版本, u32 条数` | ✅ |
| `.tex` 贴图 | `mhdb/formats/tex.py` | magic `TEX\0`、版本 0x10；0x14 mip 数、0x18 宽、0x1C 高、0x24 格式；0xB8 起各 mip 偏移。只核实了格式 **0x1F = BC7** | ✅ |
| `.uct` 颜色表 | `mhdb/build/world.py` | 头 12 字节；若干张表：u32 条数 + 每条 28 字节（u32 标记、RGBA、5 × f32） | 🟨 |

字段布局参照 [MHW-Editor](https://github.com/Synthlight/MHW-Editor) 的 010 模板（无许可证，只读作格式文档，未复制代码），
结构写在 `mhdb/games/world/specs.py`，全部 28 张表与文件长度严格吻合。

## 3. 已解析的数据（`data/world/`）

| 输出 | 来源 | 条数 | 文本 | 状态 |
|---|---|---|---|---|
| `items.json` | `common/item/itemData.itm` | 2578 | `steam/item_*.gmd`，名称 = `id×2`，说明 = `id×2+1` | 🟨 |
| `skills.json` | `skill_point_data.skl_pt_dat` + `skill_data.skl_dat` | 203 | 名称 `vfont/skill_pt` 的 `id×3`（读音 +1、说明 +2）；等级说明 `vfont/skill` 的 `2×行号+1` | ✅ 超会心 |
| `decorations.json` | `common/item/skillGemParam.sgpa` | 404 | 名称取物品 | ✅ 超心·回避珠【4】 |
| `armor.json` | `armor.am_dat`（`type 0`、部位 0–4） | 1779 | `steam/armor_*.gmd` 用记录里的名称 / 说明序号；系列名 `armor_series` 的 `set_id` | 🟨 |
| `charms.json` | `armor.am_dat`（部位 5） | 334 | 同上 | ✅ 挑战护石5 稀有度 |
| `mantles.json` | `common/equip/a_skill.ask` | 20 | `vfont/a_skill` 每件 4 条：名称、说明、占位、改名称 | 🟨 |
| `weapons/*.json` | 14 个 `*.wp_dat` / `*.wp_dat_g` + `kireaji.kire` | 3700 | `steam/<武器>_*.gmd` | ✅ 黑龙玄刃 |
| `colors.json` | `common/ui/ui_colortable.uct` | — | — | 🟨 |
| `weapon-custom.json` | `new_limit_break.new_lb`、`pl_param.plp`、`customParts.cus_pa`、`em104_limit_break.em104lb` | 27 / 302 / 118 | `vfont/new_limit_break`、`vfont/customParts`、`vfont/ew_limit_break`，名称都是 `2×行号` | 🟨 见 3.3 |

### 3.1 已确认的换算与含义

| 项 | 结论 | 依据 |
|---|---|---|
| 稀有度 | 文件里从 0 开始，显示 = 值 + 1 | 黑龙玄刃文件值 11，画面稀有度 12 |
| 武器攻击力 | 文件存真实攻击力；大剑显示 = ×4.8 | 黑龙玄刃 340 × 4.8 = 1632（画面 1632） |
| 武器属性值 | 显示 = ×10 | 黑龙玄刃龙 18 → 画面 180 |
| 龙封力 | 3 = 大 | 黑龙玄刃画面「大」 |
| 属性编号 | 3 = 冰、5 = 龙 | 严冰之翼 / 黑龙玄刃 |
| 技能参数 | 超会心 param_1 = 130 / 135 / 140 | 画面说明 1.3 / 1.35 / 1.4 倍 |
| 极意解锁 | `skill_data` 的 unlock_1…6 是**同表的行号**，指向解锁该等级的套装技能等级 | 挑战者 6、7 级 ← 碎龙的真髓 3、黑龙的传说 2 等，文本对得上 |
| 套装技能等级 | 套装技能的「等级」= 所需件数 | 黑龙的传说 2 / 4 级，说明对应 2 件、4 件效果 |
| 防具部位 | `equip_slot` 0 头 1 身 2 腕 3 腰 4 脚 5 护石 | 名称 |
| 防具类型 | `type` 0 普通防具、2 幻化服装；1 / 3 含 HARDUMMY 占位与联动装 | 名称（1 / 3 的含义 ❓） |
| 防具变体 | `variant` 1 = α、2 = β | 名称（精英·…阿尔法 / 贝塔）；护石也有该字段，含义 ❓ |
| 物品图标颜色 | `itemData.icon_color` 是 `ui_colortable` 第 1 张表（28 色）的序号 | 回复药 = 绿；超心·回避珠 = 15 号蓝紫，与画面一致 |

### 3.2 推断（未与游戏核对）

- `colors.json` 第 2 张表（12 色）是稀有度颜色、第 3 张（7 色）是锐利度颜色——条数与色相吻合，稀有度 12 的
  #b4f5ff 与画面「稀有度 12」字色接近。第 4 张（2 色）用途不明。
- 其他武器种的显示倍率（大剑以外）尚未核对，数据只存真实值。
- 锐利度：`kireaji.kire` 每行是 7 色累计长度；武器的 `sharpness_amount`（记为 handicraftSteps）推测与匠技能有关，
  具体换算待核对。❓
- 防具 `gender` 取值 0 / 1 / 2 / 3（3 占 94%，推测为男女通用），❓
- 衣装 `a_skill.ask` 的镶嵌槽（隐身衣装 3·3 等）结构吻合，数值待游戏内核对。

### 3.3 武器客制（自定义强化、零件强化、冥赤龙觉醒）

加密：`cus_pa`、`cus_par`、`pl_param.plp` 等整文件 Blowfish/ECB（按 32 位小端字翻转），密钥按扩展名取自 MHW-Editor，
实现见 `mhdb/formats/crypto.py`。解密后的表末尾有 ≤16 字节的 0 补齐。

**已确认（与文本逐条对上）**

| 项 | 结论 |
|---|---|
| 大师自定义强化 `new_lb` | 27 行；category 0 扩充自定义栏、1 攻击、2 会心、3 防御、4 镶嵌槽、5 回复能力、6 属性·状态异常，各 3–4 级；`slot_cost` 是该等级的**总**占用（攻击 3/5/7/9、会心 2/4/6/8、防御 1/2/3/5、镶嵌槽 3/6/7/8、回复 3/5/7/9、属性 1/3/5/7） |
| 自定义强化效果 | 在 `pl_param.plp` 偏移 8583 起（按 plp.bt 字段顺序累加；用偏移 672 的会心倍率 1.25 / 0.75 校验布局）：大师攻击 5/10/15/25、会心 10/15/20/25、防御 15/25/35/50、属性 3/6/9/12（真实值）、属性倍率按武器种（大剑 1.2、狩猎笛 1.1、铳枪 1.1，其余 1.0） |
| 零件强化 `cus_pa` | 每种武器 17–27 个零件，`cost` = 强化阶段 × 100（与文本「强化阶段 N」逐条一致，弓「金火龙零件」原文误写为「强化段阶」）；每个零件只加一项：攻击、会心、属性、防御（10）或锐利度 |
| 冥赤龙觉醒 `em104lb` | 行号 = 能力编号；`category` 1 攻击 2 防御 3 会心 4 属性 5 镶嵌槽 6 锐利度 7 系列技能 9 旋律 10 炮击 11 斩击斧瓶 12 盾斧瓶 13 弓瓶 14 猎虫 15–18 装填数 20–22 弩零件 23 状态异常；`rank` 1–6 即名称里的等级；14 个武器种可用标记；系列技能行的 `skill_id` 指向 skills.json（冰牙龙的秘技 = 188 等） |
| 冥赤龙觉醒数值 `em104lbr` | MHW-Editor 称为 recipe，实际是每个能力在 14 种武器上的效果值，行号与 em104lb 对应：攻击 2/4/6/8/10/15（大剑、大锤的 Ⅴ、Ⅵ 为 9、14）、防御 10–60、会心 2/4/6/8/10/15、属性按武器种不同（大剑 Ⅵ 15、双剑 Ⅵ 9）、镶嵌槽强化 = 追加槽的等级 1–4、锐利度 1–7、状态异常按武器种不同；旋律 / 炮击 / 瓶等种类的值是种类编号 |
| 冥赤龙武器 | 14 种武器的「赤龙」系列都在派生树 87；每种两套同名同数值的行（只有模型编号不同），第二套标 `duplicateOf` |

**推断（待核对）**

- `stackable`：攻击 / 会心 / 属性 / 锐利度 / 状态异常的 1–5 级为 1，6 级、防御、镶嵌槽、系列技能和各武器专属为 0。
  教程原文「会赋予系列技能的觉醒能力，或具有特殊稀有度的觉醒能力，都无法重复设定」，推测 0 = 同一能力不能设定两个。❓
- `onePerCategory`（原字段 unk_2）：只在旋律、炮击、斩击斧瓶、猎虫、系列技能上为 1，推测对应提示
  「此系统的能力无法进行复数设定」——同一种类只能设定一个。❓
- 零件强化：推测每个强化阶段选一个零件、效果累加；零件的数值（攻击 1、会心 1、属性 1、锐利度 1）是加值还是等级未确认。❓
- 自定义强化的属性加值是否乘武器种倍率、状态异常是否同表，未确认。❓
- 觉醒数值的单位：攻击、属性按真实值（与武器数据一致，属性显示 ×10）、会心按 %，锐利度的单位未确认。❓
- 大师自定义强化每种只取一个等级：MHW-Editor 的 `Augments.cs` 按种类各定义一个等级枚举（无 / 1–4），与此一致，仍待游戏内核对。

**未找到 / 要问用户**

- 大师自定义强化的**栏位数**（稀有度 10 / 11 / 12 各几格，扩充自定义栏 1–3 各加几格）：plp / plsp / eq_cus / lbm_* / new_lbr
  里都没有，exe 内存转储中也没找到按稀有度排列的表，可能写在代码里。需要游戏截图核对。
- 冥赤龙武器的觉醒栏位数（目前按 5 格）。

## 4. 界面图标（游戏 UI 贴图）

| 图集 | 内容 | 用到的格子 |
|---|---|---|
| `ui/common/tex/cmn_item00_ID.tex`（+ `cmn_item00M_ID.tex` 遮罩） | 64px 网格 16×16，灰度，运行时着色 | 技能徽章 96；饰品宝石 66 / 67 / 68 / 72（1–4 级）；防具 144–148；护石 149；衣装 112、烟筒 113；武器 160–173（顺序：片手剑、大剑、太刀、双剑、长枪、铳枪、大锤、狩猎笛、斩击斧、盾斧、操虫棍、轻弩、重弩、弓） |
| `ui/common/tex/cmn_status00_ID.tex` | 64px 网格 8 列，彩色状态 / 技能效果图标 | 全部原样输出 |
| `ui/common/tex/common00_ID.tex` | 镶嵌槽框（三角个数 = 等级）、宝石；非网格 | 按坐标裁切，见 `mhdb/images/world_icons.py` |

- 格子编号都已按图形与游戏截图核对。饰品的宝石格由物品数据的 `icon_id` 直接给出（1–4 级分别是 66 / 67 / 68 / 72），
  衣装的图标由 `a_skill.ask` 的 `icon_id` / `color` 给出。
- **着色方式是近似**：游戏的合成公式未知。技能徽章、衣装、2–4 级宝石用乘法着色；防具、武器、护石用遮罩填色
  （遮罩内填稀有度色、遮罩外压暗），1 级宝石用遮罩填色并保留线条。都是对照用户截图选定的，不代表游戏的真实算法。
- 物品图标的 `icon_id` 与图集格子的对应关系目前只在上述类别核对过，其他物品待核对。

## 5. 待解析 / 疑问

1. **动作值来源**：chunk 里的 `pl/`、`wp/` 下没有 `.col` 一类的攻击参数文件，需要继续调查；
   找不到时先问用户，不手抄社区数据。
2. **怪物 dtt 文件**：约 20 种扩展名（`dtt_epg` 部位、`dtt_eda` 肉质等，部分 Blowfish 加密，密钥见 MHW-Editor），
   需要对照结构并与游戏核对。
3. **武器客制 / 零件强化 / 冥赤龙觉醒**：已解析，见 3.3；栏位数与觉醒数值待查。
4. **防具强化后的防御上限**：`arm_upgrade.arm_up` 结构已读出（12 行 × 11 列），与稀有度 / 强化等级的对应待确认。
5. **游戏版本号**：见第 1 节。

## 6. 参考资料（只当格式文档阅读，不复制代码）

| 资料 | 用途 | 许可证 |
|---|---|---|
| [MHW-Editor](https://github.com/Synthlight/MHW-Editor) | 数据表结构、加密密钥 | 无许可证，只读文档 |
| [MonsterHunterWorldModding Wiki](https://github.com/Ezekial711/MonsterHunterWorldModding/wiki) | 各类格式说明 | 无许可证，只读文档 |
| [MHW-DTI-Dumps](https://github.com/Andoryuuta/MHW-DTI-Dumps) | exe 类名与字段名 | 无许可证，只读文档 |
| [QuestDataDump](https://github.com/AsteriskAmpersand/QuestDataDump) | 任务 mib 布局 | 无许可证，只读文档 |
| [DaveuRrr/MHW_Research](https://github.com/DaveuRrr/MHW_Research) | sobj / 地图 010 模板 | MIT |
| [Feuleur/blender-mhworld-tools-suite](https://github.com/Feuleur/blender-mhworld-tools-suite) | sobj 等 Python 解析参考 | MIT |
| [MHWorldData](https://github.com/gatheringhallstudios/MHWorldData) | 只用于交叉核对字段含义 | MIT |
| [MHWNoChunk](https://github.com/JodoZT/MHWNoChunk) / [WorldChunkTool](https://github.com/mhvuze/WorldChunkTool) | chunk 解包逻辑（经 mhwi-ai 移植） | MIT / 无许可证 |
| [Leviathon](https://github.com/AsteriskAmpersand/Leviathon)、[MHW-Free-HyperKinetics](https://github.com/AsteriskAmpersand/MHW-Free-HyperKinetics) | THK / lmt | GPL-3.0：只作为外部工具调用 |
| [SharpPluginLoader](https://github.com/Fexty12573/SharpPluginLoader) | 运行时结构、字段名 | MIT |
| [texture2ddecoder](https://github.com/K0lb3/texture2ddecoder) | BC7 解码 | MIT |

## 7. 游戏内核对记录

| 日期 | 来源 | 核对项 |
|---|---|---|
| 2026-10-14 | 用户截图（装备详情 / 饰品界面） | 黑龙玄刃：稀有度、攻击力、龙属性、龙封力、镶嵌槽；超心·回避珠【4】技能；超会心等级说明；稀有度与饰品颜色 |

自动化断言见 `pipeline/tests/test_world_data.py`。
