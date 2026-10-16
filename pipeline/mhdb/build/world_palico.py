"""随从与食堂：随从装备、随从道具、随从等级、猫饭技能、猫饭食材。

字段含义、核对依据与未确认项见 docs/DATA.md 3.8。
"""

from mhdb.build.common import Source, key_index, src, tr
from mhdb.games.world import specs as S

ELEMENTS = [None, "fire", "water", "ice", "thunder", "dragon", "poison", "paralysis", "sleep", "blast"]
ITEM_RANKS = ["low", "high", "master"]
CRAFT_KIND = {0: "weapon", 1: "head", 2: "body"}
# 随从道具：文本 key 里的编号 → 招式 key 的部族名
GADGETS = ["kaifuku", "asidome", "bougyo", "kyouka", "bundori", "kougeki"]
FOOD_CATEGORIES = ["meat", "fish", "veg", "drink"]
HARDUMMY = "HARDUMMY"


def _mats(r: dict) -> list[dict]:
    return [
        {"item": r[f"mat_{k}"], "count": r[f"mat_{k}_count"]}
        for k in range(1, 5)
        if r[f"mat_{k}"] and r[f"mat_{k}_count"]
    ]


def build_palico_gear(s: Source) -> list[dict]:
    """武器、头、身三类，按系列（set_id）分组用；打造表 ot_equip 的 equip_index 是两张表的行号。"""
    wrel = "common/equip/otomoWeapon.owp_dat"
    arel = "common/equip/otomoArmor.oam_dat"
    crel = "common/equip/ot_equip.eq_crt"
    wnames = s.text("common/text/steam/ot_weapon")
    anames = s.text("common/text/steam/ot_armor")
    series = s.text("common/text/steam/ot_series")
    crafts = {
        (CRAFT_KIND[r["category"]], r["equip_index"]): r
        for r in s.table(crel, S.CRAFT)
        if r["category"] in CRAFT_KIND
    }
    out = []

    def common(kind: str, row: int, r: dict, name: dict, desc: dict | None, rel: str) -> dict:
        c = crafts.get((kind, row))
        return {
            "id": f"{'w' if kind == 'weapon' else 'a'}{row}",
            "kind": kind,
            "name": name,
            "desc": desc or {},
            "series": {"id": r["set_id"], "name": tr(series, r["set_id"]) or {}},
            "rarity": r["rarity"] + 1,
            "order": r["order"],
            "cost": r["cost"],
            "rank": ITEM_RANKS[c["item_rank"]] if c else None,
            "materials": _mats(c) if c else [],
            "_src": src(rel, row),
        }

    for row, r in enumerate(s.table(wrel, S.PALICO_WEAPON, encrypted=True)):
        name = tr(wnames, r["name_index"])
        if not name or name.get("en") == HARDUMMY or not r["order"] or not r["cost"]:
            continue
        element = ELEMENTS[r["element"]]
        out.append(
            {
                **common("weapon", row, r, name, tr(wnames, r["desc_index"]), wrel),
                "attackType": "sever" if r["attack_type"] == 0 else "blunt",
                "melee": r["melee"],
                "ranged": r["ranged"],
                **({"element": {"type": element, "value": r["element_value"]}} if element else {}),
                "affinity": r["affinity"],
                "defense": r["defense"],
                "elderseal": r["elderseal"],
            }
        )
    for row, r in enumerate(s.table(arel, S.PALICO_ARMOR)):
        name = tr(anames, r["name_index"])
        if not name or name.get("en") == HARDUMMY or not r["order"] or not r["cost"]:
            continue
        out.append(
            {
                **common(
                    "head" if r["slot"] == 0 else "body", row, r, name, tr(anames, r["desc_index"]), arel
                ),
                "defense": r["defense"],
                "resist": [r[f"res_{e}"] for e in ("fire", "water", "ice", "thunder", "dragon")],
                "fullSet": bool(r["full_set"]),
            }
        )
    return out


def build_palico(s: Source) -> dict:
    """随从道具（名称、说明、三个招式与口哨、熟练度经验）与随从等级成长。"""
    texts = s.text("common/text/vfont/ot_tool")

    def by_key(key: str) -> dict:
        i = key_index(texts, key)
        return (tr(texts, i) if i is not None else None) or {}

    levels = s.table("common/otomo/toolLevelTbl.ot_tlv", S.GADGET_LEVELS)
    gadgets = []
    for n, tribe in enumerate(GADGETS):
        gadgets.append(
            {
                "id": n,
                "name": by_key(f"OTOOL{n:03}_NAME"),
                "desc": by_key(f"OTOOL{n:03}_DESC"),
                "moves": [
                    {
                        "name": by_key(f"Tool_act_{tribe}_act{k:02}"),
                        "order": by_key(f"OTOOL{n:03}_ORDER_{k:02}"),
                    }
                    for k in range(3)
                ],
                "exp": [levels[n][f"lv{k}"] for k in range(2, 16)],
                "_src": src("common/otomo/toolLevelTbl.ot_tlv", n),
            }
        )
    rescue = {
        "id": 6,
        "name": by_key("OTOOL006_NAME"),
        "desc": by_key("OTOOL006_DESC"),
        "moves": [{"name": by_key("Tool_act_kyuen_act00"), "order": by_key("OTOOL006_ORDER_00")}],
        "exp": [],
        "_src": {"file": "common/text/vfont/ot_tool", "row": 6},
    }
    lrel = "common/otomo/ot000_level.ot_lv"
    level = [
        {
            "level": r["level"],
            "exp": r["exp"],
            "attack": r["atk"],
            "defense": r["def"],
            "health": r["hp"],
            "guard": r["guard"],
        }
        for r in s.table(lrel, S.PALICO_LEVEL)
    ]
    return {"gadgets": [*gadgets, rescue], "level": level, "_src": {"level": lrel}}


def build_canteen(s: Source) -> dict:
    srel = "common/equip/cat_skill.cat_skill"
    frel = "common/facility/food.rfd"
    stexts = s.text("common/text/vfont/catSkill")
    ftexts = s.text("common/text/vfont/food")
    skills = []
    for row, r in enumerate(s.table(srel, S.CANTEEN_SKILL)):
        name = tr(stexts, row * 2)
        if not name or name.get("en", "").startswith("DUMMY"):
            continue
        skills.append(
            {
                "id": row,
                "name": name,
                "desc": tr(stexts, row * 2 + 1) or {},
                "group": r["group"],
                "tier": r["tier"],
                "_src": src(srel, row),
            }
        )
    ingredients = []
    for row, r in enumerate(s.table(frel, S.INGREDIENT)):
        name = tr(ftexts, row * 2)
        if not name:
            continue
        ingredients.append(
            {
                "id": row,
                "name": name,
                "desc": tr(ftexts, row * 2 + 1) or {},
                "category": FOOD_CATEGORIES[r["category"]],
                "group": r["group"],
                "_src": src(frel, row),
            }
        )
    return {"skills": skills, "ingredients": ingredients}
