"""纪录类：环境生物调查笔记、勋章、NPC、追加内容（DLC）包名。都只用游戏文本与一张笔记表。

见 docs/DATA.md 3.11。
"""

import re

from mhdb.build.common import Source, src, tr
from mhdb.games.world import specs as S

STAGES = {101, 102, 103, 104, 105, 108, 109}


def build_endemic(s: Source, items: dict[int, dict]) -> list[dict]:
    """em_animal_note 第 i 条 ↔ ec_info 第 i 条（按键名排序，NOTE_ECnnn_vv_DESC），item 是捕获后的物品。"""
    rel = "common/note/em_animal_note.emai"
    notes = s.table(rel, S.ANIMAL_NOTE)
    info = s.text("common/text/ec_info")
    order = sorted(info["zh-Hans"].keys)
    if len(order) != len(notes):
        raise ValueError(f"em_animal_note {len(notes)} 条与 ec_info {len(order)} 条对不上")
    out = []
    for row, (i, r) in enumerate(zip(order, notes, strict=True)):
        key = info["zh-Hans"].keys[i]
        m = re.fullmatch(r"NOTE_EC(\d{3})_(\d{2})_DESC", key)
        item = items.get(r["item"])
        if not m or not item:
            continue
        stages = sorted({r[f"stage_{k}"] for k in range(6)} & STAGES)
        out.append(
            {
                "id": f"ec{m.group(1)}_{m.group(2)}",
                "item": r["item"],
                "name": item["name"],
                "desc": tr(info, i) or {},
                "stages": stages,
                "_src": src(rel, row),
            }
        )
    return out


def _by_key(texts: dict, key: str) -> dict | None:
    g = texts["zh-Hans"]
    for i, k in g.keys.items():
        if k == key:
            return tr(texts, i)
    return None


def build_medals(s: Source) -> list[dict]:
    """cm_medal：MEDAL_000…MEDAL_099（冰原的第一个写作 MEDAL050）；条件取 _doc_re（改写版）/ _doc / _doc1。"""
    texts = s.text("common/text/cm_medal")
    keys = sorted(
        (k for k in texts["zh-Hans"].keys.values() if re.fullmatch(r"MEDAL_?\d{3}", k)),
        key=lambda k: int(k[-3:]),
    )
    out = []
    for k in keys:
        n = int(k[-3:])
        base = f"MEDAL_{n:03d}"
        name = _by_key(texts, k)
        cond = next(
            (
                c
                for c in (
                    _by_key(texts, f"{base}_doc_re"),
                    _by_key(texts, f"{base}_doc"),
                    _by_key(texts, f"{base}_doc1"),
                )
                if c
            ),
            None,
        )
        if not name:
            continue
        out.append({"id": n, "name": name, "condition": cond or {}, "iceborne": n >= 50})
    return out


def build_npcs(s: Source) -> list[dict]:
    texts = s.text("common/text/chr_names")
    out = []
    for i, k in sorted(texts["zh-Hans"].keys.items()):
        m = re.fullmatch(r"N(\d{3})_NPC_NAME", k)
        name = tr(texts, i) if m else None
        if m and name:
            out.append({"id": int(m.group(1)), "name": name})
    return out


def build_dlc(s: Source) -> list[dict]:
    texts = s.text("common/text/steam/dlc_package_header")
    out = []
    for i, k in sorted(texts["zh-Hans"].keys.items()):
        m = re.fullmatch(r"Package(\d{4})_id", k)
        name = tr(texts, i) if m else None
        # HARDUMMY 是 PC 版抹掉名字的平台独占内容
        if m and name and "HARDUMMY" not in name["zh-Hans"]:
            out.append({"id": int(m.group(1)), "name": name})
    return out
