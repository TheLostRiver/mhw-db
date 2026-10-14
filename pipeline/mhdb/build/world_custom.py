"""武器客制：大师自定义强化、零件强化、冥赤龙武器觉醒能力。

规则与数值的依据、推断与未确认项见 docs/DATA.md「武器客制」。
"""

import re
import struct

from mhdb.build.common import Source, src, tr
from mhdb.formats import crypto
from mhdb.games.world import specs as S

WEAPON_KEYS = [key for _, key, _, _ in S.WEAPON_TYPES]

# new_limit_break.new_lb 的 category（与 new_limit_break 文本逐条对照确认）
AUGMENT_CATEGORIES = {
    0: "extend",
    1: "attack",
    2: "affinity",
    3: "defense",
    4: "slot",
    5: "health",
    6: "element",
}

# em104_limit_break.em104lb 的 category（与 ew_limit_break 文本逐条对照确认）
AWAKENING_CATEGORIES = {
    1: "attack",
    2: "defense",
    3: "affinity",
    4: "element",
    5: "slot",
    6: "sharpness",
    7: "setBonus",
    9: "melody",
    10: "shelling",
    11: "saPhial",
    12: "cbPhial",
    13: "coating",
    14: "kinsect",
    15: "ammoNormal",
    16: "ammoPierce",
    17: "ammoSpread",
    18: "ammoElement",
    20: "recoil",
    21: "reload",
    22: "deviation",
    23: "status",
}
WEAPON_FLAGS = ["gs", "sns", "db", "ls", "hammer", "hh", "lance", "gl", "sa", "cb", "ig", "bow", "hbg", "lbg"]

# ---------- pl_param.plp：自定义强化的效果数值 ----------

PLP_REL = "common/pl/pl_param.plp"
PLP_SIZE = 20688
# 偏移按 MHW-Editor 的 plp.bt 字段顺序累加得到（只读作格式文档）；用两个已知常量校验布局没有偏移
PLP_CRIT_OFFSET = 672  # 会心伤害倍率 1.25、负会心 0.75
PLP_AUGMENT_OFFSET = 8583


class PlParamError(ValueError):
    pass


def read_augment_effects(data: bytes) -> dict:
    if len(data) != PLP_SIZE or data[:4] != b"PLP\0":
        raise PlParamError(f"pl_param.plp 大小或 magic 不符（{len(data)} 字节）")
    crit, bad = struct.unpack_from("<ff", data, PLP_CRIT_OFFSET)
    if (round(crit, 4), round(bad, 4)) != (1.25, 0.75):
        raise PlParamError(f"会心倍率校验失败（{crit}, {bad}），字段布局可能已变化")

    off = PLP_AUGMENT_OFFSET

    def take(fmt: str) -> list:
        nonlocal off
        v = list(struct.unpack_from("<" + fmt, data, off))
        off += struct.calcsize(fmt)
        return v

    def r(xs: list[float]) -> list[float]:
        return [round(x, 4) for x in xs]

    take("12B")  # 上位：攻击 / 会心 / 防御 / 防御的减伤几率（各 3 级）
    take("8f")  # 上位：减伤率 / 回复 / 未知 / 回复冷却
    mr = {
        "attack": take("4B"),
        "affinity": take("4B"),
        "defense": take("4B"),
        "defenseGuardChance": take("4B"),
        "defenseGuardRate": r(take("4f")),
        "healthRegenRate": r(take("4f")),
    }
    take("f")  # 龙骑枪爆破回复（不用）
    mr["healthRegenCooldown"] = r(take("f"))[0]
    mr["element"] = take("4B")
    mr["bowgunElementAmmo"] = take("4B")
    mr["bowgunStatusAmmo"] = take("4B")
    mult = r(take("14f"))
    mr["elementMultiplier"] = dict(zip(WEAPON_KEYS, mult, strict=True))
    mr["bowCoatingStatus"] = r(take("4f"))
    return mr


# ---------- 构建 ----------


def build_augments(s: Source) -> dict:
    rel = "common/equip/new_limit_break.new_lb"
    texts = s.text("common/text/vfont/new_limit_break")
    levels = []
    for row, r in enumerate(s.table(rel, S.AUGMENT)):
        if row == 0:
            continue
        name = tr(texts, 2 * row)
        if not name:
            continue
        levels.append(
            {
                "id": row,
                "category": AUGMENT_CATEGORIES[r["category"]],
                "level": r["level"],
                "slotCost": r["slot_cost"],
                "name": name,
                "desc": tr(texts, 2 * row + 1) or {},
                "zenny": {"10": r["cost_r10"], "11": r["cost_r11"], "12": r["cost_r12"]},
                "_src": src(rel, row),
            }
        )
    plp = crypto.decrypt_file(PLP_REL, s.path(PLP_REL).read_bytes())
    effects = read_augment_effects(plp)
    effects["_src"] = {"file": PLP_REL, "offset": PLP_AUGMENT_OFFSET}
    return {"levels": levels, "effects": effects}


# 游戏文本里有一处写成「强化段阶」（弓 金火龙零件），一并匹配
STAGE_RE = re.compile(r"强化(?:阶段|段阶)(\d)")


def build_parts(s: Source) -> dict[str, list[dict]]:
    rel = "common/equip/customParts.cus_pa"
    texts = s.text("common/text/vfont/customParts")
    out: dict[str, list[dict]] = {k: [] for k in WEAPON_KEYS}
    for row, r in enumerate(s.table(rel, S.CUSTOM_PART, encrypted=True)):
        if r["id"] != row or r["cost"] == 0:
            continue
        name = tr(texts, 2 * row)
        if not name:
            continue
        desc = tr(texts, 2 * row + 1) or {}
        stage = r["cost"] // 100
        m = STAGE_RE.search(desc.get("zh-Hans", ""))
        if not m or int(m.group(1)) != stage or r["cost"] % 100:
            raise ValueError(f"{rel} 行 {row}：强化阶段与文本不符（cost={r['cost']}）")
        effect = {k: r[k] for k in ("attack", "affinity", "element", "defense", "sharpness") if r[k]}
        out[WEAPON_KEYS[r["weapon_type"]]].append(
            {
                "id": row,
                "stage": stage,
                "name": name,
                "desc": desc,
                "effect": effect,
                "_src": src(rel, row),
            }
        )
    return out


# 效果值的含义（单位为推断，见 docs/DATA.md 3.3）；其他种类的值是旋律 / 炮击 / 瓶等的编号，不是加值
VALUE_KINDS = {
    "attack": "attack",
    "defense": "defense",
    "affinity": "affinity",
    "element": "element",
    "slot": "slotLevel",
    "sharpness": "sharpness",
    "status": "status",
    "ammoNormal": "ammo",
    "ammoPierce": "ammo",
    "ammoSpread": "ammo",
    "ammoElement": "ammo",
}


def build_awakening(s: Source) -> list[dict]:
    rel = "common/equip/em104_limit_break.em104lb"
    vrel = "common/equip/em104_limit_break_recipe.em104lbr"
    texts = s.text("common/text/vfont/ew_limit_break")
    values = s.table(vrel, S.AWAKENING_VALUES)
    out = []
    for row, r in enumerate(s.table(rel, S.AWAKENING)):
        weapons = [WEAPON_KEYS[i] for i, f in enumerate(WEAPON_FLAGS) if r[f]]
        if r["group"] != 1 or not weapons:
            continue
        name = tr(texts, 2 * row)
        if not name:
            continue
        category = AWAKENING_CATEGORIES[r["category"]]
        v = values[row]
        if v["id"] != row:
            raise ValueError(f"{vrel} 行 {row} 的 id 为 {v['id']}，与 em104lb 行号不一致")
        kind = VALUE_KINDS.get(category)
        value = (
            {
                "kind": kind,
                "byWeapon": {k: v[f] for k, f in zip(WEAPON_KEYS, WEAPON_FLAGS, strict=True) if v[f]},
            }
            if kind
            else None
        )
        out.append(
            {
                "id": row,
                "category": category,
                "rank": r["rank"],
                "name": name,
                "desc": tr(texts, 2 * row + 1, markup=True) or {},
                "weapons": weapons,
                "stackable": bool(r["stackable"]),
                # 推断：此标记为 1 的种类（旋律、炮击、瓶、猎虫、系列技能）同一把武器只能设定一个
                "onePerCategory": bool(r["unk_2"]),
                "setSkill": r["skill_id"] or None,
                "next": r["next"] or None,
                "value": value,
                "_src": src(rel, row),
            }
        )
    return out


def build_weapon_custom(s: Source) -> dict:
    return {
        "augments": build_augments(s),
        "parts": build_parts(s),
        "awakening": build_awakening(s),
    }
