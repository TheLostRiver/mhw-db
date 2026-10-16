"""武器周边：猎虫、狩猎笛旋律、武器挂饰、幻化武器。

字段含义、核对依据与未确认项见 docs/DATA.md 3.6。
"""

import struct

from mhdb.build.common import Source, src, tr
from mhdb.formats import crypto
from mhdb.games.world import specs as S

KINSECT_ATTACK = ["sever", "blunt"]
KINSECT_DUST = ["blast", "heal", "paralysis", "poison"]
ITEM_RANKS = ["low", "high", "master"]
NOTES = ["purple", "red", "orange", "yellow", "green", "blue", "aqua", "white", "echo"]
LAYERED_KINDS = {2: "base", 3: "parts", 4: "unique"}
# 幻化武器文件名后缀，与 S.WEAPON_TYPES 的顺序一致
LAYERED_FILES = [
    "Lswd", "Swd", "Wswd", "Tachi", "Hammer", "Wsl", "Lance", "Glance", "Saxe", "Caxe", "Rod", "Bow", "Hbg", "Lbg",
]  # fmt: skip
DUMMY_NAMES = {"DUMMY", "HARDUMMY"}


def _mats(r: dict, n: int = 4) -> list[dict]:
    return [
        {"item": r[f"mat_{k}"], "count": r[f"mat_{k}_count"]}
        for k in range(1, n + 1)
        if r[f"mat_{k}"] and r[f"mat_{k}_count"]
    ]


def _is_dummy(name: dict | None) -> bool:
    return not name or name.get("en", "").strip().upper() in DUMMY_NAMES


def build_kinsects(s: Source) -> list[dict]:
    rel = "common/equip/rod_insect.rod_inse"
    tree_rel = "common/equip/insect.eq_cus"
    names = s.text("common/text/vfont/rod_insect")
    series = s.text("common/text/steam/insect_series")
    rows = s.table(rel, S.KINSECT, encrypted=True)
    tree = s.table(tree_rel, S.UPGRADE)
    # 培养树：每行指向一只猎虫（equip_index = rod_inse 行号），child_* 是本表的行号
    node_of = {i: t for i, t in enumerate(tree) if i and t["equip_index"] < len(rows)}
    kinsect_of = {i: t["equip_index"] for i, t in node_of.items()}
    parent: dict[int, int] = {}
    for i, t in node_of.items():
        for k in range(1, 5):
            c = t[f"child_{k}"]
            if c and c in kinsect_of:
                parent[kinsect_of[c]] = kinsect_of[i]
    by_kinsect = {t["equip_index"]: (i, t) for i, t in node_of.items()}
    out = []
    for row, r in enumerate(rows):
        name = tr(names, row)
        if not name:
            continue
        node = by_kinsect.get(row)
        t = node[1] if node else None
        out.append(
            {
                "id": row,
                "name": name,
                "attack": KINSECT_ATTACK[r["attack_type"]],
                "dust": KINSECT_DUST[r["dust"]],
                "power": r["power"],
                "speed": r["speed"],
                "heal": r["heal"],
                "element": r["element"],
                "rarity": r["rarity"] + 1,
                "cost": r["cost"],
                "series": {"id": r["tree_id"], "name": tr(series, r["tree_id"]) or {}},
                "tier": r["tier"],
                "column": r["tree_column"],
                "parent": parent.get(row),
                "rank": ITEM_RANKS[t["item_rank"]] if t else None,
                "materials": _mats(t) if t else [],
                **({"unlockMonster": t["unlock_monster"]} if t and t["unlock_monster"] > 0 else {}),
                "_src": src(rel, row),
            }
        )
    return out


MSKE_REL = "common/pl/music_skill_efc.mske"
MSKE_HEADER = struct.Struct("<IHII")  # magic、版本、条数、未知（999）——比标准表头多 4 字节
MSKE_ROW = struct.Struct("<8f6I")


def _read_mske(s: Source) -> list[tuple]:
    data = crypto.decrypt_file(MSKE_REL, s.path(MSKE_REL).read_bytes())
    _magic, _ver, count, _unk = MSKE_HEADER.unpack_from(data, 0)
    end = MSKE_HEADER.size + count * MSKE_ROW.size
    if end > len(data) or any(data[end:]):
        raise ValueError(f"{MSKE_REL}：长度与条数不符")
    return [MSKE_ROW.unpack_from(data, MSKE_HEADER.size + i * MSKE_ROW.size) for i in range(count)]


def build_melodies(s: Source) -> dict:
    """旋律：音序（msk）+ 名称与效果、持续时间（mske）；笛子的三个音色（wep_wsl）。"""
    rel = "hm/wp/wp05/music_skill.msk"
    texts = s.text("common/text/vfont/music_skill")
    effects = _read_mske(s)
    sequences: dict[int, list[list[str]]] = {}
    for r in s.table(rel, S.MELODY, encrypted=True):
        notes = [NOTES[r[f"note_{k}"]] for k in range(1, 5) if r[f"note_{k}"] >= 0]
        if notes:
            sequences.setdefault(r["melody"], []).append(notes)
    melodies = []
    for mid, seqs in sorted(sequences.items()):
        # 旋律编号 N 对应 mske 的第 N+1 行（第 0 行为空）；名称与效果是 music_skill 文本的序号
        e = effects[mid + 1]
        dur, dur1, dur2, ext, ext1, ext2, value, value_encore, name_i, effect_i, encore_i = e[:11]
        name = tr(texts, name_i)
        if not name:
            raise ValueError(f"旋律 {mid} 没有名称（mske 行 {mid + 1}）")
        melodies.append(
            {
                "id": mid,
                "name": name,
                "effect": tr(texts, effect_i) or {},
                "encore": tr(texts, encore_i) or {},
                "sequences": seqs,
                "duration": [round(x, 2) for x in (dur, dur1, dur2)],
                "extension": [round(x, 2) for x in (ext, ext1, ext2)],
                "value": round(value, 4),
                "valueEncore": round(value_encore, 4),
                "_src": {"file": rel, "effects": MSKE_REL, "row": mid + 1},
            }
        )
    return {"melodies": melodies}


def horn_notes(s: Source) -> list[list[str]]:
    """wep_wsl 每行的三个音色（whistle.wp_dat 的 special_1 指向这里）。"""
    return [
        [NOTES[r[f"note_{k}"]] for k in (1, 2, 3)]
        for r in s.table("common/equip/wep_whistle.wep_wsl", S.HORN_NOTES)
    ]


def build_pendants(s: Source) -> list[dict]:
    rel = "common/equip/charm.ch_dat"
    recipe_rel = "common/equip/charm.eq_crt"
    names = s.text("common/text/steam/charm")
    recipes = {r["equip_index"]: r for r in s.table(recipe_rel, S.CRAFT)}
    out = []
    for row, r in enumerate(s.table(rel, S.PENDANT)):
        name = tr(names, row)
        if _is_dummy(name) or (r["cost"] == 1 and r["sort"] == 0):
            continue
        recipe = recipes.get(row)
        mats = _mats(recipe) if recipe else []
        # 获得方式（推断）：有配方 = 制作；没有配方但有发放编号 = 奖励；两者都没有 = 活动 / DLC
        source = "craft" if mats else "reward" if r["unlock_flag"] >= 0 else "event"
        out.append(
            {
                "id": row,
                "name": name,
                "color": r["color"],
                "cost": r["cost"] if mats else 0,
                "source": source,
                "materials": mats,
                **(
                    {"unlockMonster": recipe["unlock_monster"]}
                    if recipe and recipe["unlock_monster"] > 0
                    else {}
                ),
                "_src": src(rel, row),
            }
        )
    return out


def build_layered_weapons(s: Source) -> dict[str, list[dict]]:
    recipe_rel = "common/equip/customOuterRecipe.cus_otr"
    recipes = s.table(recipe_rel, S.LAYERED_RECIPE, encrypted=True)
    out: dict[str, list[dict]] = {}
    for (_, key, text, _), suffix in zip(S.WEAPON_TYPES, LAYERED_FILES, strict=True):
        rel = f"common/equip/customOuter{suffix}.cus_ou"
        names = s.text(f"common/text/steam/ou_{text}")
        rows = []
        for row, r in enumerate(s.table(rel, S.LAYERED_WEAPON, encrypted=True)):
            name = tr(names, row)
            if r["sort"] < 0 or _is_dummy(name) or not r["recipe"]:
                continue
            recipe = recipes[r["recipe"]]
            kind = LAYERED_KINDS.get(recipe["kind"])
            if not kind:
                raise ValueError(f"{rel} 行 {row}：配方 {r['recipe']} 的种类 {recipe['kind']} 未知")
            rows.append(
                {
                    "id": row,
                    "name": name,
                    "kind": kind,
                    "color": r["color"],
                    "sort": r["sort"],
                    "cost": recipe["cost"],
                    "materials": _mats(recipe),
                    **({"unlockMonster": recipe["unlock_monster"]} if recipe["unlock_monster"] > 0 else {}),
                    "_src": src(rel, row),
                }
            )
        out[key] = sorted(rows, key=lambda x: (x["sort"], x["id"]))
    return out
