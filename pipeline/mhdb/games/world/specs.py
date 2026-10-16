"""《世界：冰原》数据表的结构定义。

字段布局参照 Synthlight/MHW-Editor 的 010 模板（无许可证，仅作格式文档阅读，未复制代码），
每张表都由 read_table 校验「记录长度 × 记录数 = 文件长度」。字段含义以 docs/DATA.md 为准，
标 unk 的字段含义未确认。
"""

from mhdb.formats.table import spec

ITEM = spec(
    "itemData.itm",
    """
    id:I sub_type:B type:I rarity:B carry_limit:b carry_limit_base:b sort_order:H flags:I
    icon_id:I icon_color:B is_huge:B sell_price:I buy_price:I
    """,
)

SKILL_POINT = spec("skill_point_data.skl_pt_dat", "is_set_bonus:B icon_color:B")

SKILL_LEVEL = spec(
    "skill_data.skl_dat",
    """
    skill_id:H level:B unlock_1:I unlock_2:I unlock_3:I unlock_4:I unlock_5:I unlock_6:I
    param_1:H param_2:H param_3:H param_4:H
    """,
)

ARMOR = spec(
    "armor.am_dat",
    """
    index:I order:H variant:B set_id:H type:B equip_slot:B defense:H model_1:H model_2:H
    icon_color:H icon_effect:B rarity:B cost:I
    res_fire:b res_water:b res_ice:b res_thunder:b res_dragon:b
    slot_count:B slot_1:B slot_2:B slot_3:B
    set_skill:H set_skill_level:B hidden_skill:H hidden_skill_level:B
    skill_1:H skill_1_level:B skill_2:H skill_2_level:B skill_3:H skill_3_level:B
    gender:I set_group:H name_index:H desc_index:H is_permanent:B
    """,
)

DECORATION = spec(
    "skillGemParam.sgpa",
    "item_id:I index:I size:I skill_1:I skill_1_level:I skill_2:I skill_2_level:I",
)

MANTLE = spec(
    "a_skill.ask",
    """
    icon_id:I color:I sort_order:I item_id:I mantle_id:I unlock:I
    slot_count:B slot_1:B slot_2:B slot_3:B
    """,
)

# 调和列表：mat_2 = 0 表示只需一种素材；category 0 药品 1 道具 / 陷阱 2 弹药 / 瓶（按内容归纳）；
# can_auto 按 MHW-Editor 的命名为「可自动调和」，未在游戏内核对；unk 含义未知
ITEM_MAKE = spec(
    "itemMake.imk",
    "id:I unk_1:H mat_1:I mat_2:I result:I quantity:I unk_2:I category:I can_auto:B",
)

CRAFT = spec(
    "*.eq_crt",
    """
    category:B equip_index:H unlock_item:H unlock_monster:i unlock_story:I unk_1:I item_rank:I
    mat_1:H mat_1_count:B mat_2:H mat_2_count:B mat_3:H mat_3_count:B mat_4:H mat_4_count:B
    unk_2:B unk_3:B unk_4:B unk_5:B
    """,
)

UPGRADE = spec(
    "*.eq_cus",
    """
    category:B equip_index:H unlock_item:H unlock_monster:i unlock_story:I item_rank:I
    mat_1:H mat_1_count:B mat_2:H mat_2_count:B mat_3:H mat_3_count:B mat_4:H mat_4_count:B
    child_1:H child_2:H child_3:H child_4:H unk_1:B unk_2:B unk_3:B unk_4:B
    """,
)

SHARPNESS = spec("kireaji.kire", "id:I red:H orange:H yellow:H green:H blue:H white:H purple:H")

MELEE = spec(
    "*.wp_dat",
    """
    index:I unk_1:h model:h part_1:h part_2:h unk_2:B color:B tree_id:B is_fixed_upgrade:B
    cost:I rarity:B sharpness_id:B sharpness_amount:B attack:H defense:H affinity:b
    element:B element_value:H hidden_element:B hidden_element_value:H elderseal:B
    slot_count:B slot_1:B slot_2:B slot_3:B special_1:H special_2:H unk_3:I unk_4:I unk_5:I
    tree_position:B id:H name_index:H desc_index:H skill:H unk_6:H
    """,
)

RANGED = spec(
    "*.wp_dat_g",
    """
    index:I unk_1:h model:h part_1:h part_2:h unk_2:B color:B tree_id:B is_fixed_upgrade:B
    muzzle:B barrel:B magazine:B scope:B cost:I rarity:B attack:H defense:H affinity:b
    element:B element_value:H hidden_element:B hidden_element_value:H elderseal:B
    shell_type:B unk_3:B deviation:B slot_count:B slot_1:B slot_2:B slot_3:B
    unk_4:I unk_5:I unk_6:I unk_7:B special_ammo:B tree_position:B id:H name_index:H desc_index:H
    skill:H unk_8:H
    """,
)

# 武器专属参数：近战 / 远程武器行的 special_1（弓为 special_ammo）是这些表的行号。
# 字段顺序参照 MHW-Editor 的 wep_glan / wep_saxe / wep_wsd / bbtbl 模板；各取值已与 Kiranico 逐种核对（见 docs/DATA.md 3.2）
GUNLANCE_SHELL = spec("wep_glan.wep_glan", "id:I type:H level:H")  # type 0 通常 1 放射 2 扩散；level 从 0 起
PHIAL = spec("wep_saxe.wep_saxe", "id:I type:B value:H")  # 斩击斧：0 强击 1 强属性 2 灭龙 3 减气 4 麻痹 5 毒
DUAL_ELEMENT = spec("wep_wsword.wep_wsd", "id:I element_1:B value_1:h element_2:B value_2:h")
BOW_COATING = spec(
    "bottle_table.bbtbl", "close:B power:B paralysis:B poison:B sleep:B blast:B"
)  # 0 无 1 有 2 强化

AWAKENING = spec(
    "em104_limit_break.em104lb",
    # category：能力种类（1 攻击 2 防御 3 会心 4 属性 5 镶嵌槽 6 锐利度 7 系列技能 9 以后为武器专属）；
    # rank：能力等级（Ⅰ–Ⅵ，镶嵌槽为 3–6）；stackable：可否重复设定；rel_*：同链上的其他行号（含义未确认）
    """
    skill_id:H group:I category:I rank:I has_next:B prev:H next:H stackable:B unk_2:B
    rel_1:H rel_2:H rel_3:H rel_4:H rel_5:H
    gs:B sns:B db:B ls:B hammer:B hh:B lance:B gl:B sa:B cb:B ig:B bow:B hbg:B lbg:B
    unk_3:B unk_4:B unk_5:B unk_6:B
    """,
)

# MHW-Editor 称为 recipe，实际是每个觉醒能力在 14 种武器上的效果值（攻击 2/4/6/8/10/15、属性按武器种不同等），
# 行号与 em104lb 一一对应（id = 行号）
AWAKENING_VALUES = spec(
    "em104_limit_break_recipe.em104lbr",
    """
    id:H gs:H sns:H db:H ls:H hammer:H hh:H lance:H gl:H sa:H cb:H ig:H bow:H hbg:H lbg:H
    unk_1:B unk_2:B unk_3:B unk_4:B
    """,
)

AUGMENT = spec(
    "new_limit_break.new_lb",
    # category：0 扩充自定义栏 1 攻击 2 会心 3 防御 4 镶嵌槽 5 回复能力 6 属性·状态异常；slot_cost 为该等级的总占用
    "category:I level:I slot_cost:I cost_r10:I cost_r11:I cost_r12:I",
)

CUSTOM_PART = spec(
    "customParts.cus_pa",
    # 整文件 Blowfish 加密；cost 为强化阶段 × 100（与文本「强化阶段 N」一致，见测试）
    "id:I weapon_type:I part_id:I unk_1:B cost:I attack:H defense:H affinity:B element:H sharpness:B",
)

# 武器种：文件名、站内键、文本文件、是否远程
WEAPON_TYPES = [
    ("l_sword", "great-sword", "l_sword", False),
    ("sword", "sword-and-shield", "sword", False),
    ("w_sword", "dual-blades", "w_sword", False),
    ("tachi", "long-sword", "tachi", False),
    ("hammer", "hammer", "hammer", False),
    ("whistle", "hunting-horn", "whistle", False),
    ("lance", "lance", "lance", False),
    ("g_lance", "gunlance", "g_lance", False),
    ("s_axe", "switch-axe", "s_axe", False),
    ("c_axe", "charge-blade", "c_axe", False),
    ("rod", "insect-glaive", "rod", False),
    ("bow", "bow", "bow", True),
    ("hbg", "heavy-bowgun", "hbg", True),
    ("lbg", "light-bowgun", "lbg", True),
]

# 环境生物调查笔记（common/note/em_animal_note.emai，86 条）：第 i 条与 common/text/ec_info 的第 i 条
# （NOTE_ECnnn_vv_DESC）对应，item 是捕获后的物品（绕行兔 659 ……）。stage_0–5 是出现的地图（101–105、108、
# 109 导虫遗迹，0 为空）。group（0–4）、rare（稀有个体为 1，按名字推断）、large（鱼的大型个体物品）、
# cond_0 / cond_1（时间、天气？）含义未确认，不使用。
ANIMAL_NOTE = spec(
    "em_animal_note.emai",
    "item:I group:B pad_0:B pad_1:B pad_2:B rare:B pad_3:B large:I "
    "stage_0:I stage_1:I stage_2:I stage_3:I stage_4:I stage_5:I cond_0:i cond_1:i",
)

# 采集点基础参数（common/item/pop_base.ppm，87 行）：物件公共参数 gimmick.gcd 的「采集类型」指向这里的行号。
# kind：0 物品由布置文件指定（mPickItem）、1 固定物品、2 / 4 抽选表（骨冢、特产 / 矿脉，采集 3 次）、6 搬运物（蛋等）；
# 其余取值含义未确认。respawn：复活秒数（药草 180、矿脉骨冢 300），未与游戏内核对。
POP_BASE = spec(
    "pop_base.ppm",
    "gather_min:B gather_max:B kind:B respawn:f item_id:I count_min:B count_max:B",
)

# 物品抽选表（*.itlot，Blowfish 加密）：每行 10 个物品、各自数量、权重（百分比）、采集 / 剥取动作。
# 布局参照 MHW-Editor 的 itlot.bt（无许可证，只读作格式文档）。
ITEM_LOT = spec(
    "itlot",
    " ".join(
        [f"item_{i}:H" for i in range(10)]
        + [f"count_{i}:B" for i in range(10)]
        + [f"weight_{i}:B" for i in range(10)]
        + [f"anim_{i}:B" for i in range(10)]
    ),
)
