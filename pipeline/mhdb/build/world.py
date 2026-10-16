"""《世界：冰原》：把解包结果组装成 data/world/*.json。

字段的换算与推断依据见 docs/DATA.md；标「推断」的在数据里保留原值，站点显示时再换算。
"""

import json
import struct
import time
from pathlib import Path

from mhdb.build.common import Source, src, tr, write_json, write_records
from mhdb.build.world_custom import (
    ECP_REL,
    PLP_REL,
    build_weapon_custom,
    read_crit,
    read_sharpness_multipliers,
)
from mhdb.build.world_facilities import (
    build_argosy,
    build_botany,
    build_bounties,
    build_deliveries,
    build_expeditions,
    build_melder,
    build_shop,
    build_steamworks,
)
from mhdb.build.world_gear import (
    build_kinsects,
    build_layered_weapons,
    build_melodies,
    build_pendants,
    horn_notes,
)
from mhdb.build.world_mechanics import build_mechanics
from mhdb.build.world_monsters import build_monsters
from mhdb.build.world_moves import build_moves
from mhdb.build.world_palico import build_canteen, build_palico, build_palico_gear
from mhdb.build.world_quests import build_monster_rewards, build_quests
from mhdb.formats import crypto
from mhdb.games.world import exe as EXE
from mhdb.games.world import specs as S

PIPELINE_VERSION = 1

EQUIP_SLOTS = ["head", "chest", "arms", "waist", "legs", "charm"]
# 数据里 0 = 无，1 火 … 5 龙已与游戏截图核对（3 冰、5 龙）；其余按同一顺序推断
ELEMENTS = [None, "fire", "water", "ice", "thunder", "dragon", "poison", "paralysis", "sleep", "blast"]
SHARPNESS = ["red", "orange", "yellow", "green", "blue", "white", "purple"]


def _decode_uct(data: bytes) -> list[list[str]]:
    """ui_colortable.uct：若干张颜色表，每张 u32 条数 + 每条 28 字节（u32 标记、RGBA、5 × f32）。"""
    tables: list[list[str]] = []
    pos = 12
    while pos < len(data):
        (count,) = struct.unpack_from("<I", data, pos)
        pos += 4
        colors = []
        for i in range(count):
            r, g, b, _a = data[pos + i * 28 + 4 : pos + i * 28 + 8]
            colors.append(f"#{r:02x}{g:02x}{b:02x}")
        tables.append(colors)
        pos += count * 28
    if pos != len(data):
        raise ValueError("ui_colortable.uct 长度不符")
    return tables


def build_colors(s: Source) -> dict:
    tables = _decode_uct(s.path("common/ui/ui_colortable.uct").read_bytes())
    if [len(t) for t in tables] != [28, 12, 7, 2]:
        raise ValueError(f"颜色表结构变化：{[len(t) for t in tables]}")
    return {
        "icon": tables[0],
        "rarity": tables[1],
        "sharpness": dict(zip(SHARPNESS, tables[2], strict=True)),
        "unknown": tables[3],
        "_src": {
            "file": "common/ui/ui_colortable.uct",
            "note": "第 2 张为稀有度 1–12（推断），第 3 张为锐利度",
        },
    }


def build_items(s: Source) -> list[dict]:
    rel = "common/item/itemData.itm"
    names = s.text("common/text/steam/item")
    out = []
    for row, r in enumerate(s.table(rel, S.ITEM)):
        name = tr(names, r["id"] * 2)
        if not name:
            continue
        out.append(
            {
                "id": r["id"],
                "name": name,
                "desc": tr(names, r["id"] * 2 + 1) or {},
                "type": r["type"],
                "subType": r["sub_type"],
                "rarity": r["rarity"] + 1,
                "carry": r["carry_limit"],
                "sort": r["sort_order"],
                "flags": r["flags"],
                "icon": {"id": r["icon_id"], "color": r["icon_color"]},
                "price": {"sell": r["sell_price"], "buy": r["buy_price"]},
                "_src": src(rel, row),
            }
        )
    return out


def build_combinations(s: Source, item_map: dict[int, dict]) -> list[dict]:
    """调和列表（itemMake.imk）：素材 1–2 种 → 成品 × 个数。unk_1 恒等于 id，不输出。"""
    rel = "common/item/itemMake.imk"
    out = []
    for row, r in enumerate(s.table(rel, S.ITEM_MAKE)):
        mats = [m for m in (r["mat_1"], r["mat_2"]) if m]
        for i in (*mats, r["result"]):
            if i not in item_map:
                raise ValueError(f"{rel} 第 {row} 行引用了不存在的物品 {i}")
        if r["unk_1"] != r["id"] or r["category"] not in (0, 1, 2):
            raise ValueError(f"{rel} 第 {row} 行结构变化：{r}")
        out.append(
            {
                "id": r["id"],
                "materials": mats,
                "result": r["result"],
                "quantity": r["quantity"],
                "category": r["category"],
                "canAuto": bool(r["can_auto"]),
                "unk": r["unk_2"],
                "_src": src(rel, row),
            }
        )
    return out


def build_skills(s: Source) -> list[dict]:
    pt_rel = "common/equip/skill_point_data.skl_pt_dat"
    lv_rel = "common/equip/skill_data.skl_dat"
    names = s.text("common/text/vfont/skill_pt")
    level_text = s.text("common/text/vfont/skill")
    points = s.table(pt_rel, S.SKILL_POINT)
    levels = s.table(lv_rel, S.SKILL_LEVEL)

    def ref(row_index: int) -> dict:
        r = levels[row_index]
        return {"skill": r["skill_id"], "level": r["level"]}

    by_skill: dict[int, list[dict]] = {}
    for i, r in enumerate(levels):
        unlocks = [ref(r[f"unlock_{k}"]) for k in range(1, 7) if r[f"unlock_{k}"]]
        # 套装技能的每一档有自己的名字（如黑龙的传说 2 件「继承」、4 件「超越」），普通技能为空
        level_name = tr(level_text, 2 * i)
        by_skill.setdefault(r["skill_id"], []).append(
            {
                "level": r["level"],
                **({"name": level_name} if level_name else {}),
                "desc": tr(level_text, 2 * i + 1, markup=True) or {},
                "params": [r[f"param_{k}"] for k in range(1, 5)],
                **({"unlockedBy": unlocks} if unlocks else {}),
                "_src": src(lv_rel, i),
            }
        )

    out = []
    for sid, p in enumerate(points):
        name = tr(names, sid * 3)
        lvls = by_skill.get(sid, [])
        if not name or not lvls:
            continue
        base = [lv["level"] for lv in lvls if "unlockedBy" not in lv]
        out.append(
            {
                "id": sid,
                "name": name,
                "reading": tr(names, sid * 3 + 1) or {},
                "desc": tr(names, sid * 3 + 2) or {},
                "setBonus": bool(p["is_set_bonus"]),
                "iconColor": p["icon_color"],
                "maxLevel": max(lv["level"] for lv in lvls),
                "baseMaxLevel": max(base) if base else max(lv["level"] for lv in lvls),
                "levels": lvls,
                "_src": src(pt_rel, sid),
            }
        )
    return out


def build_decorations(s: Source, items: dict[int, dict]) -> list[dict]:
    rel = "common/item/skillGemParam.sgpa"
    out = []
    for row, r in enumerate(s.table(rel, S.DECORATION)):
        item = items.get(r["item_id"])
        if not item:
            continue
        skills = [
            {"id": r[f"skill_{k}"], "level": r[f"skill_{k}_level"]} for k in (1, 2) if r[f"skill_{k}_level"]
        ]
        out.append(
            {
                "id": r["item_id"],
                "name": item["name"],
                "size": r["size"],
                "rarity": item["rarity"],
                "skills": skills,
                "icon": item["icon"],
                "_src": src(rel, row),
            }
        )
    return out


def _slots(r: dict) -> list[int]:
    return [r[f"slot_{k}"] for k in (1, 2, 3) if r[f"slot_{k}"]]


def _skills(r: dict) -> list[dict]:
    return [{"id": r[f"skill_{k}"], "level": r[f"skill_{k}_level"]} for k in (1, 2, 3) if r[f"skill_{k}"]]


def build_armor(s: Source) -> tuple[list[dict], list[dict]]:
    """返回 (防具, 护石)。防具只取 type 0（type 2 为幻化服装，1 / 3 含占位条目，待确认）。"""
    rel = "common/equip/armor.am_dat"
    names = s.text("common/text/steam/armor")
    series = s.text("common/text/steam/armor_series")
    armor, charms = [], []
    for row, r in enumerate(s.table(rel, S.ARMOR)):
        if r["type"] != 0:
            continue
        name = tr(names, r["name_index"])
        if not name or name.get("en") == "HARDUMMY":
            continue
        common = {
            "id": r["index"],
            "name": name,
            "desc": tr(names, r["desc_index"]) or {},
            "rarity": r["rarity"] + 1,
            "skills": _skills(r),
            "order": r["order"],
            "_src": src(rel, row),
        }
        if r["equip_slot"] == 5:
            charms.append({**common, "group": r["set_group"], "iconColor": r["icon_color"]})
            continue
        set_skill = (
            {"id": r["set_skill"], "points": r["set_skill_level"]}
            if r["set_skill"] and r["set_skill_level"]
            else None
        )
        hidden = (
            {"id": r["hidden_skill"], "points": r["hidden_skill_level"]}
            if r["hidden_skill"] and r["hidden_skill_level"]
            else None
        )
        armor.append(
            {
                **common,
                "slot": EQUIP_SLOTS[r["equip_slot"]],
                "variant": r["variant"],
                "series": {"id": r["set_id"], "name": tr(series, r["set_id"]) or {}},
                "defense": r["defense"],
                "resist": {
                    "fire": r["res_fire"],
                    "water": r["res_water"],
                    "ice": r["res_ice"],
                    "thunder": r["res_thunder"],
                    "dragon": r["res_dragon"],
                },
                "slots": _slots(r),
                **({"setSkill": set_skill} if set_skill else {}),
                **({"hiddenSkill": hidden} if hidden else {}),
                "gender": r["gender"],
                "group": r["set_group"],
                "cost": r["cost"],
            }
        )
    return armor, charms


def build_mantles(s: Source, items: dict[int, dict]) -> list[dict]:
    rel = "common/equip/a_skill.ask"
    texts = s.text("common/text/vfont/a_skill")
    out = []
    for row, r in enumerate(s.table(rel, S.MANTLE)):
        # 文本按文件行号排列（每件 4 条）；mantle_id 有跳号（13、14 不存在），不能拿来算文本序号
        k = row
        item = items.get(r["item_id"])
        name = tr(texts, 4 * k) or (item["name"] if item else None)
        if not name:
            continue
        if item and item["name"].get("zh-Hans") != name.get("zh-Hans"):
            raise ValueError(
                f"{rel} 行 {row}：衣装名 {name.get('zh-Hans')} 与物品名 {item['name'].get('zh-Hans')} 不一致"
            )
        out.append(
            {
                "id": r["mantle_id"],
                "itemId": r["item_id"],
                "name": name,
                "upgradedName": tr(texts, 4 * k + 3) or {},
                "desc": tr(texts, 4 * k + 1) or {},
                "slots": _slots(r),
                "sort": r["sort_order"],
                "icon": {"id": r["icon_id"], "color": r["color"]},
                "_src": src(rel, row),
            }
        )
    return out


# 冥赤龙武器（14 种武器的「赤龙」系列都在这棵派生树上，已逐种核对）
AWAKENED_TREE = 87


SHELL_TYPES = ["normal", "long", "wide"]
SA_PHIALS = ["power", "element", "dragon", "exhaust", "paralysis", "poison"]
CB_PHIALS = ["impact", "element"]


def _special(key: str, r: dict, tables: dict[str, list]) -> dict | None:
    """武器专属参数：铳枪炮击、斩击斧 / 盾斧的瓶、双属性双剑、狩猎笛音色、操虫棍猎虫加成、弓的可用瓶。"""
    if key == "gunlance":
        t = tables["shell"][r["special_1"]]
        return {"shelling": {"type": SHELL_TYPES[t["type"]], "level": t["level"] + 1}}
    if key == "switch-axe":
        t = tables["phial"][r["special_1"]]
        return {"phial": {"type": SA_PHIALS[t["type"]], "value": t["value"]}}
    if key == "charge-blade":
        return {"phial": {"type": CB_PHIALS[r["special_1"]], "value": 0}}
    if key == "dual-blades" and r["special_1"]:
        t = tables["dual"][r["special_1"]]
        return {
            "elements": [
                {"type": ELEMENTS[t["element_1"]], "value": t["value_1"]},
                {"type": ELEMENTS[t["element_2"]], "value": t["value_2"]},
            ]
        }
    if key == "hunting-horn":
        return {"notes": tables["notes"][r["special_1"]]}
    if key == "insect-glaive":
        # 猎虫加成 0–7 = cm_status 的 STATUS_ROD_SKILL_01…08（已与 Kiranico 的 Weapon Ability 核对）
        return {"kinsectBonus": r["special_1"]}
    if key == "bow":
        t = tables["coating"][r["special_ammo"]]
        return {"coatings": {k: t[k] for k in ("close", "power", "paralysis", "poison", "sleep", "blast")}}
    return None


def build_weapons(s: Source) -> dict[str, list[dict]]:
    kire = s.table("common/equip/kireaji.kire", S.SHARPNESS)
    tables = {
        "shell": s.table("common/equip/wep_glan.wep_glan", S.GUNLANCE_SHELL),
        "phial": s.table("common/equip/wep_saxe.wep_saxe", S.PHIAL),
        "dual": s.table("common/equip/wep_wsword.wep_wsd", S.DUAL_ELEMENT),
        "coating": s.table("common/equip/bottle_table.bbtbl", S.BOW_COATING),
        "notes": horn_notes(s),
    }
    out: dict[str, list[dict]] = {}
    for file, key, text, ranged in S.WEAPON_TYPES:
        rel = f"common/equip/{file}.wp_dat_g" if ranged else f"common/equip/{file}.wp_dat"
        names = s.text(f"common/text/steam/{text}")
        rows = []
        seen: dict[str, int] = {}
        for row, r in enumerate(s.table(rel, S.RANGED if ranged else S.MELEE)):
            name = tr(names, r["name_index"])
            if not name:
                continue
            w = {
                "id": r["index"],
                "name": name,
                "desc": tr(names, r["desc_index"]) or {},
                "rarity": r["rarity"] + 1,
                "attack": r["attack"],
                "affinity": r["affinity"],
                "defense": r["defense"],
                "element": (
                    {"type": ELEMENTS[r["element"]], "value": r["element_value"]} if r["element"] else None
                ),
                "hiddenElement": (
                    {"type": ELEMENTS[r["hidden_element"]], "value": r["hidden_element_value"]}
                    if r["hidden_element"]
                    else None
                ),
                "elderseal": r["elderseal"],
                "slots": _slots(r),
                "skill": r["skill"] or None,
                "tree": {"id": r["tree_id"], "position": r["tree_position"]},
                "fixedUpgrade": bool(r["is_fixed_upgrade"]),
                "cost": r["cost"],
                "_src": src(rel, row),
            }
            if not ranged:
                k = kire[r["sharpness_id"]]
                w["sharpness"] = {
                    "id": r["sharpness_id"],
                    "handicraftSteps": r["sharpness_amount"],
                    "bars": [k[c] for c in SHARPNESS],
                }
            else:
                w["ranged"] = {
                    "shellType": r["shell_type"],
                    "deviation": r["deviation"],
                    "specialAmmo": r["special_ammo"],
                    "parts": [r["muzzle"], r["barrel"], r["magazine"], r["scope"]],
                }
            if special := _special(key, r, tables):
                w["special"] = special
            if r["tree_id"] == AWAKENED_TREE:
                w["awakened"] = True
            # 同名同数值的重复行（如冥赤龙武器的第二套模型）只保留第一条供选择
            sig = json.dumps(
                {k: v for k, v in w.items() if k not in ("id", "_src", "desc", "cost")}, sort_keys=True
            )
            if sig in seen:
                w["duplicateOf"] = seen[sig]
            else:
                seen[sig] = w["id"]
            rows.append(w)
        out[key] = rows
    return out


def build(raw: Path, out: Path, log=print) -> dict:
    s = Source(raw)
    extract_meta = json.loads((raw / "extract.json").read_text(encoding="utf-8"))
    meta = {
        "game": "world",
        "steamBuildId": extract_meta.get("steamBuildId"),
        "exeSha256": extract_meta.get("exeSha256"),
        "chunkDigest": extract_meta.get("chunkDigest"),
        "extractedAt": extract_meta.get("extractedAt"),
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "pipelineVersion": PIPELINE_VERSION,
        "languages": ["zh-Hans", "zh-Hant", "ja", "en"],
    }

    colors = build_colors(s)
    items = build_items(s)
    item_map = {i["id"]: i for i in items}
    combinations = build_combinations(s, item_map)
    skills = build_skills(s)
    decorations = build_decorations(s, item_map)
    armor, charms = build_armor(s)
    mantles = build_mantles(s, item_map)
    weapons = build_weapons(s)
    custom = build_weapon_custom(s)
    moves = build_moves(s, log)
    monsters = build_monsters(s, log)
    kinsects = build_kinsects(s)
    melodies = build_melodies(s)
    pendants = build_pendants(s)
    layered_weapons = build_layered_weapons(s)
    quests = build_quests(s, monsters, log)
    monster_rewards = build_monster_rewards(s)
    palico_gear = build_palico_gear(s)
    palico = build_palico(s)
    canteen = build_canteen(s)
    facilities = {
        "melder": build_melder(s),
        "shop": build_shop(s),
        "deliveries": build_deliveries(s),
        "bounties": build_bounties(s),
        "steamworks": build_steamworks(s),
        "expeditions": build_expeditions(s),
        "argosy": build_argosy(s),
        "botany": build_botany(s),
    }
    crit = read_crit(crypto.decrypt_file(PLP_REL, s.path(PLP_REL).read_bytes()))

    write_json(out / "meta.json", meta)
    write_json(out / "colors.json", colors)
    write_records(out / "items.json", "items", items)
    write_records(out / "combinations.json", "combinations", combinations)
    write_records(out / "skills.json", "skills", skills)
    write_records(out / "decorations.json", "decorations", decorations)
    write_records(out / "armor.json", "armor", armor)
    write_records(out / "charms.json", "charms", charms)
    write_records(out / "mantles.json", "mantles", mantles)
    for key, rows in weapons.items():
        write_records(out / "weapons" / f"{key}.json", "weapons", rows)
    write_json(out / "weapon-custom.json", custom)
    write_records(out / "moves.json", "moves", moves)
    write_records(out / "monsters.json", "monsters", monsters)
    write_records(out / "kinsects.json", "kinsects", kinsects)
    write_records(out / "melodies.json", "melodies", melodies["melodies"])
    write_records(out / "pendants.json", "pendants", pendants)
    write_json(out / "weapon-layered.json", layered_weapons)
    for key in ("melder", "shop", "deliveries", "bounties", "argosy"):
        write_records(out / "facilities" / f"{key}.json", key, facilities[key])
    write_json(out / "quests.json", quests)
    write_json(out / "mechanics.json", build_mechanics(s))
    write_records(out / "monster-rewards.json", "rewards", monster_rewards)
    write_records(out / "palico-gear.json", "gear", palico_gear)
    write_json(out / "palico.json", palico)
    write_json(out / "canteen.json", canteen)
    for key in ("steamworks", "expeditions", "botany"):
        write_json(out / "facilities" / f"{key}.json", facilities[key])
    write_json(
        out / "constants.json",
        {
            "weaponBloat": dict(zip([k for _, k, _, _ in S.WEAPON_TYPES], EXE.WEAPON_BLOAT, strict=True)),
            # 会心 / 负会心倍率取自 pl_param.plp（偏移 672）
            "critMultiplier": crit[0],
            "badCritMultiplier": crit[1],
            # 锐利度倍率（红 → 紫）取自 em_common_param.ecp
            "sharpness": read_sharpness_multipliers(s.path(ECP_REL).read_bytes()),
            "_src": {
                "file": "exe",
                "note": f"exe 内存 {EXE.WEAPON_BLOAT_OFFSET:#x}（构建 {EXE.DUMP_BUILD_ID}），见 mhdb/games/world/exe.py",
            },
        },
    )

    counts = {
        "items": len(items),
        "combinations": len(combinations),
        "skills": len(skills),
        "decorations": len(decorations),
        "armor": len(armor),
        "charms": len(charms),
        "mantles": len(mantles),
        "weapons": sum(len(v) for v in weapons.values()),
        "augmentLevels": len(custom["augments"]["levels"]),
        "customParts": sum(len(v) for v in custom["parts"].values()),
        "awakening": len(custom["awakening"]),
        "moves": len(moves),
        "monsters": len(monsters),
        "kinsects": len(kinsects),
        "melodies": len(melodies["melodies"]),
        "pendants": len(pendants),
        "layeredWeapons": sum(len(v) for v in layered_weapons.values()),
        "quests": len(quests["quests"]),
        "palicoGear": len(palico_gear),
        "melder": len(facilities["melder"]),
        "deliveries": len(facilities["deliveries"]),
        "bounties": len(facilities["bounties"]),
    }
    write_json(out / "counts.json", counts)
    log(f"写入 {out}：{counts}")
    return counts
