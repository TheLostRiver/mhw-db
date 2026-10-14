# 数据来源与解析状态

> 所有数据来自自己解包《怪物猎人：世界 冰原》（PC / Steam 版）。下表的文件路径都在 `D:\Tools\mhwi-ai\extracted\chunk_index.json`
> 的 chunk 文件索引里确认存在（共 171,615 个文件）。表中括号里的内容说明是根据文件名 / 参考资料推断的，
> 解析并与游戏内核对之前都算「未确认」。

状态：⬜ 未开始 · 🟨 解析中 · ✅ 已解析并通过对照 · ❓ 有疑问（见第 4 节）

## 1. 现有解包情况

**只从 chunk 解包，忽略游戏目录的 `nativePC/`**：本机 `nativePC/` 装有 Mod（含 `common/equip`），会覆盖装备数据。

`D:\Tools\mhwi-ai\extracted\` 目前只有怪物 AI 相关文件（THK、部分 dtt）、任务 `questData_*.mib`、一个 stage 区域文件，
以及大部分 `common/text/*.gmd` 的**简中**版本。装备、物品、繁中 / 日 / 英文本、UI 贴图都还没解，里程碑 2 会按清单重新解包到 `data-raw/`。

## 2. 文件清单

### 2.1 文本

| 内容 | 文件 | 状态 |
|---|---|---|
| 四语文本 | `common/text/**/*_{chS,chT,jpn,eng}.gmd`（共 11,040 个 gmd，含其他语种） | ⬜ |
| 物品名称 / 说明 | `common/text/steam/item_*.gmd` | ⬜ |
| 防具 / 系列 | `common/text/steam/armor_*.gmd`、`armor_series_*.gmd` | ⬜ |
| 武器 | `common/text/steam/<武器种>_*.gmd`（如 `w_sword_*`、`whistle_*`）、`wep_series_*.gmd` | ⬜ |
| 护石 | `common/text/steam/charm_*.gmd` | ⬜ |
| 技能 | `common/text/vfont/skill_pt_*.gmd`（技能名）、`vfont/skill_*.gmd`（等级说明） | ⬜ |
| 猫饭技能 / 狩猎笛旋律 / 装衣 | `vfont/catSkill_*.gmd`、`vfont/music_skill_*.gmd`、`vfont/a_skill_*.gmd` | ⬜ |
| 怪物名 / 部位 / 图鉴 | `common/text/em_names_*.gmd`、`em_parts_*.gmd`、`em_info_*.gmd` | ⬜ |
| 环境生物 | `common/text/ec_info_*.gmd` | ⬜ |
| 任务 | `common/text/quest/q*_*.gmd` | ⬜ |
| 随从装备 | `common/text/steam/ot_armor_*.gmd`、`ot_weapon_*.gmd` | ⬜ |

### 2.2 装备与物品（`common/equip/`、`common/item/`）

| 内容 | 文件 | 状态 |
|---|---|---|
| 物品 | `common/item/itemData.itm` | ⬜ |
| 调合 | `common/item/itemMake.imk`、`itemMakeType.imt` | ⬜ |
| 技能 | `common/equip/skill_point_data.skl_pt_dat`、`skill_data.skl_dat` | ⬜ |
| 防具 | `armor.am_dat`、`amr_series.amrs`、`armor.eq_crt`（打造）、`arm_upgrade.arm_up`（强化） | ⬜ |
| 护石 | `charm.ch_dat`、`charm.eq_crt` | ⬜ |
| 饰品 | `deco.deco`；掉落表 `deco_lot.diot`、`deco_grade_lot.dglt` | ⬜ |
| 近战武器 | `sword` `w_sword` `l_sword` `tachi` `hammer` `whistle` `lance` `g_lance` `s_axe` `c_axe` `rod` `.wp_dat` | ⬜ |
| 远程武器 | `bow` `hbg` `lbg` `.wp_dat_g` | ⬜ |
| 锐利度 | `kireaji.kire` | ⬜ |
| 武器打造 / 派生 | `weapon.eq_crt`、`weapon.eq_cus` | ⬜ |
| 武器专属参数 | `bottle_table.bbtbl`（瓶）、`shell_table.shl_tbl`（弹 / 炮击）、`wep_glan.wep_glan`、`wep_saxe.wep_saxe`、`wep_whistle.wep_wsl`、`wep_wsword.wep_wsd`、`rod_insect.rod_inse`、`insect*.eq_cus`、`gun_unique.gnuq`、`wp11_unique.bowuq`、`gunner_reload.gun_rd`、`gunner_shoot.gun_sd` | ⬜ |
| 特殊武器抽选 / 觉醒 / 强化 | `em104_*`（`wp_custom`、`wp_upgrade`、`wp_exp`、`limit_break` 等）、`em117_*`（`lot` / `grade_lot`） | ⬜ ❓ 分别对应哪只怪物的武器（冥赤龙觉醒、搜刮武器等）待确认 |
| 零件强化 / 解放 | `customParts.cus_pa` / `.cus_par`、`new_limit_break.new_lb` / `.new_lbr`、`limit_break_mat_*` | ⬜ |
| 自定义外观 | `customOuter*.cus_ou`、`customOuterRecipe.cus_otr` | ⬜ |
| 随从装备 | `otomoArmor.oam_dat`、`otomoWeapon.owp_dat`、`ot_equip.eq_crt`、`ot_series.amrs` | ⬜ |
| 猫饭技能 | `cat_skill.cat_skill` | ⬜ |
| 商店 | `shop.sed`、`shop_insect.sed` | ⬜ |

### 2.3 怪物

| 内容 | 文件 | 状态 |
|---|---|---|
| 公共参数 | `common/em/em_common_param.ecp`、`em_difficulty.dtt_dif`（任务倍率）、`em_rank.dtt_rnk`、`em_meat_soften.dtt_msf`（软化）、`em_rsiz.dtt_rsz` / `em_size_setting.em_ss`（体型） | ⬜（`dtt_dif` 已由 mhwi-ai 的 questdata.py 解析过） |
| 每只怪物 | `em/emXXX/YY/data/emXXX.dtt_*`（`dtt_epg`、`dtt_eda`、`dtt_drp` 等，共约 20 种） | ⬜ ❓ 每种 dtt 对应的内容待逐一确认 |
| 图标 | `ui/note/tex/micon/*.tex`（95 个） | ⬜ |

### 2.4 任务、地图、其他

| 内容 | 文件 | 状态 |
|---|---|---|
| 任务 | `quest/questData_*.mib`（Blowfish 加密，mhwi-ai 已有解密） | ⬜ |
| 地图底图 | `ui/map/tex/maptex/stXXX/*.tex`（st101–109、聚魔之地 st109V2/V3、st201/202、st301–305、st403–417） | ⬜ |
| 采集 / 怪物 / 环境生物点位 | `stage/stXXX/common/set/*.sobj`（`_gm` 采集、`_em` 怪物、`_ec` 环境生物等）、`*.sobjl` | ⬜ |
| 采集物品表 | `stage/stXXX/common/data/stXXX*.itlot` | ⬜ |
| 区域划分 | `stage/stXXX/common/zone/*.zon` | ⬜ |
| 设施（随从探险队、植生研究所、交易等） | `common/facility/*`（`ex_map`、`swp*`、`trdr` 等） | ⬜ |
| 随从 | `common/otomo/*` | ⬜ |
| 玩家参数 | `common/pl/pl_param.plp`、`pl_skill_param.plsp`、`pl_item_param.plip`、`askill_param.asp`、`music_skill_efc.mske` | ⬜ |
| 动作值 | **未找到** | ❓ 见第 4 节 |

### 2.5 界面图标（游戏 UI 贴图）

`.tex` 格式已核实（`pipeline/mhdb/formats/tex.py`）：magic `TEX\0`、版本 0x10，0x14 mip 数、0x18 宽、0x1C 高、
0x24 像素格式、0xB8 起为各级 mip 偏移（u64）。目前只核实了格式 **0x1F = BC7**（UI 贴图都是这一种）；
0x1A（`icon_normal_NM_NOMIP.tex`，法线贴图）及其他格式遇到时再核对。

| 图集 | 尺寸 | 内容 | 状态 |
|---|---|---|---|
| `ui/common/tex/cmn_item00_ID.tex` | 1024² | 64px 网格 16×16：物品、防具五部位（编号 144–148 等）、14 种武器（160–173）、饰品宝石、衣装、护石等；灰度，运行时着色 | 🟨 已解码，编号与物品数据的对应待 2.3 |
| `ui/common/tex/cmn_item00M_ID.tex` | 1024² | 同上的遮罩版（用途待确认） | ❓ |
| `ui/common/tex/cmn_status00_ID.tex` | 512×1024 | 64px 网格 8 列：技能 / 状态图标（彩色） | 🟨 已解码，编号与技能数据的对应待 2.4 |
| `ui/common/tex/common00_ID.tex` | 512² | 镶嵌槽框（三角数 = 槽位等级）、宝石、按钮等；非网格，需按坐标裁切 | 🟨 |
| `ui/common/tex/decoration00_ID.tex` | 512² | 64px 数字 00–63 与徽章（用途待确认） | ❓ |
| `ui/equip/tex/equip_menu_ID.tex`、`wp_upgrade_ID.tex` | — | 装备 / 武器客制界面的边框装饰 | 🟨 |
| `ui/common/tex/cmn_micon00_ID.tex` 等 | — | 怪物小图标 | ⬜ |
| `ui/**/*.gui` | — | 界面布局（含图集裁切坐标的可能性，待研究） | ⬜ |

稀有度颜色、饰品颜色的色表来源待找（候选：物品数据里的颜色编号 + 某个色表文件）。

## 3. 参考资料（只当格式文档阅读，不复制代码）

| 资料 | 用途 | 许可证 |
|---|---|---|
| [MHW-Editor](https://github.com/Synthlight/MHW-Editor) | 各数据文件的结构体定义、加密密钥 | 无许可证（保留所有权利），只读文档 |
| [MonsterHunterWorldModding Wiki](https://github.com/Ezekial711/MonsterHunterWorldModding/wiki) | gmd、tex、sobj 等格式说明 | 无许可证，只读文档 |
| [MHW-DTI-Dumps](https://github.com/Andoryuuta/MHW-DTI-Dumps) | exe 类名与字段名 | 无许可证，只读文档 |
| [QuestDataDump](https://github.com/AsteriskAmpersand/QuestDataDump) | 任务 mib 布局 | 无许可证，只读文档 |
| [DaveuRrr/MHW_Research](https://github.com/DaveuRrr/MHW_Research) | sobj / 地图 010 模板 | MIT |
| [Feuleur/blender-mhworld-tools-suite](https://github.com/Feuleur/blender-mhworld-tools-suite) | sobj 等 Python 解析参考 | MIT |
| [MHWorldData](https://github.com/gatheringhallstudios/MHWorldData) | 只用于交叉核对字段含义，不复制代码或数据 | MIT |
| [MHWNoChunk](https://github.com/JodoZT/MHWNoChunk) / [WorldChunkTool](https://github.com/mhvuze/WorldChunkTool) | chunk 解包逻辑（mhwi-ai 已移植） | MIT / 无许可证 |
| [Leviathon](https://github.com/AsteriskAmpersand/Leviathon)、[MHW-Free-HyperKinetics](https://github.com/AsteriskAmpersand/MHW-Free-HyperKinetics) | THK / lmt | GPL-3.0：只作为外部工具调用，不并入本项目代码 |
| [SharpPluginLoader](https://github.com/Fexty12573/SharpPluginLoader) | 运行时结构、字段名 | MIT |
| [DirectXTex texconv](https://github.com/microsoft/DirectXTex)、[texture2ddecoder](https://github.com/K0lb3/texture2ddecoder) | 贴图解码 | MIT |

## 4. 疑问与未确认项

1. **动作值来源**：chunk 索引的 `pl/`、`wp/` 下没有 `.col` 一类的攻击参数文件。需要进一步调查（候选：`pl` 下的其他参数文件、exe 内的数据表）。找不到时先列出来问用户，不手抄社区数据。
2. **每只怪物的 dtt 文件**：约 20 种扩展名，哪个是肉质、部位耐久、异常耐性、掉落，需要对照 MHW-Editor 的结构定义并与游戏内核对。
3. **衣装 / 武器客制 / 零件强化 / 冥赤龙觉醒的数据与规则**：候选文件见 2.2。MHW-Editor 把 `em104_wp_custom`、
   `em104_wp_upgrade`、`em104_wp_exp`、`em104_limit_break*` 命名为 `Awakened*`（觉醒），推测与觉醒武器有关；
   `em104_*` / `em117_*` 的抽选表分别对应哪只怪物仍未确认。觉醒技能的搭配规则需从数据核实，取不到时问用户。
4. **稀有度 / 饰品颜色色表**：见 2.5。
5. **游戏版本号**：计划用 `pefile` 读取 exe 的文件版本资源；需确认该版本号与游戏标题界面显示的版本一致。

## 5. 待游戏内核对的已知值

里程碑 2 里列出一组样本（几件装备的技能与槽位、几把武器的锐利度、几颗饰品的技能、几只怪物的肉质），请用户在游戏内核对后填入本节，作为对照测试的断言。
