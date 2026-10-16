"""纪录类：环境生物调查笔记、勋章、NPC、追加内容（DLC）包名。都只用游戏文本与一张笔记表。

见 docs/DATA.md 3.11。
"""

import re
import struct

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


SCHEDULE_REL = "common/network/scheduleMap.ysm"
# 星辰祭：scheduleMap 的祭典编号 1–5 ↔ panel_tutorial_cat 的 SEV_H（花 / 春）、N（夏）、A（秋）、F（冬）、1（一周年）
STAR_FESTIVALS = [(1, "spring", "SEV_H"), (2, "summer", "SEV_N"), (3, "autumn", "SEV_A"), (4, "winter", "SEV_F"), (5, "memorial", "SEV_1")]  # fmt: skip
# 月辰祭（冰原）：PANEL_01–04，与 topicMessage 的 S_Event_winter / 2ndAni / spring / summer 同序
MOON_FESTIVALS = [
    ("winter", "PANEL_01"),
    ("memorial", "PANEL_02"),
    ("spring", "PANEL_03"),
    ("summer", "PANEL_04"),
]


def build_schedule(s: Source) -> dict:
    """scheduleMap.ysm：u32 魔数、u16、u32 条数，每条 4 个 u32 = 一年的一周（53 周）。

    第 1 个是祭典编号（0 平时），第 3 个是轮换编号（平时 1–3 循环，祭典 = 编号 + 3），第 2、4 个含义未确认。
    祭典编号与季节的对应由所在周推出（1 在 3–5 月、2 在 6–8 月、3 在 9–11 月、4 在 12–2 月），并与
    panel_tutorial_cat 的 SEV_H/N/A/F/1 及蒸气机关的 Spring/Summer/Autumn/Winter/Memorial 奖励表一致。
    """
    data = s.path(SCHEDULE_REL).read_bytes()
    magic, _, n = struct.unpack_from("<IHI", data, 0)
    if magic != 0x18091001 or 10 + 16 * n != len(data):
        raise ValueError(f"{SCHEDULE_REL} 头部或长度不符")
    rows = [struct.unpack_from("<4I", data, 10 + 16 * i) for i in range(n)]
    if n != 53:
        raise ValueError(f"{SCHEDULE_REL} 应为 53 周，实际 {n}")
    weeks = []
    for i, (fes, one, rot, unk) in enumerate(rows):
        if one != 1 or not 0 <= fes <= 5:
            raise ValueError(f"{SCHEDULE_REL} 第 {i + 1} 周的取值超出已知范围：{rows[i]}")
        if (fes and rot != fes + 3) or (not fes and rot not in (1, 2, 3)):
            raise ValueError(f"{SCHEDULE_REL} 第 {i + 1} 周的轮换编号 {rot} 与祭典 {fes} 不符")
        weeks.append({"week": i + 1, "festival": fes, "rotation": rot, "unk": unk})
    texts = s.text("common/text/steam/panel_tutorial_cat")

    def name(prefix: str) -> dict:
        t = _by_key(texts, f"{prefix}_CAT_TEXT")
        if not t:
            raise ValueError(f"panel_tutorial_cat 缺少 {prefix}_CAT_TEXT")
        return t

    return {
        "weeks": weeks,
        "star": [{"id": i, "season": season, "name": name(k)} for i, season, k in STAR_FESTIVALS],
        "moon": [{"season": season, "name": name(k)} for season, k in MOON_FESTIVALS],
        "_src": {"file": SCHEDULE_REL, "names": "common/text/steam/panel_tutorial_cat"},
    }
