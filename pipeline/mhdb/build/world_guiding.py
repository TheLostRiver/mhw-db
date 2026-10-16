"""聚魔之地：各地带、各等级出现的怪物与权重（quest/enemy/endContentsEmData.ecem）。

见 docs/DATA.md 3.14。
"""

import struct

from mhdb.build.common import Source, key_index, src, tr

ECEM_REL = "quest/enemy/endContentsEmData.ecem"
ROW = struct.Struct("<99i")
LEVELS = 7
# 地带：ecem 第 2–7 个字段、第 13 起每 7 个一组的权重都按这个顺序；
# 名称 cm_start_menu 的 S_MENU_EGC_PHEROMONE_AREA_00–05，对应的关卡见 cm_quest 的 RESULT_EGC_LV_AREA1xx
REGIONS = [
    ("forest", 101),
    ("wildspire", 102),
    ("coral", 103),
    ("rotted", 104),
    ("volcanic", 105),
    ("tundra", 108),
]


def _weights(v: tuple, base: int) -> list[list[int]]:
    return [list(v[base + LEVELS * r : base + LEVELS * (r + 1)]) for r in range(len(REGIONS))]


def build_guiding_lands(s: Source, monsters: list[dict]) -> dict:
    """ecem：u32 魔数、u16、u32 条数（101，下标 = 怪物 gameId），每条 99 个 i32。

    第 0 个 = gameId；第 1 个 = 出现前要完成的任务编号（-1 / 0 无）；第 2–7 个 = 六个地带的栖息标记（0 不出现、
    1 / 2，2 为该怪物的主要地带：火龙森林、雌火龙荒地……）；第 13–54 个 = 6 地带 × 7 级的出现权重。
    第 57–98 个是第二组权重，只有黑狼鸟 / 战痕黑狼鸟与第一组不同。第 8–11、55、56 个含义未确认，原样保留。
    """
    data = s.path(ECEM_REL).read_bytes()
    magic, _, n = struct.unpack_from("<IHI", data, 0)
    if magic != 0x18091001 or 10 + n * ROW.size != len(data):
        raise ValueError(f"{ECEM_REL} 头部或长度不符")
    by_gid: dict[int, dict] = {}
    for m in monsters:
        by_gid.setdefault(m["gameId"], m)
    names = s.text("common/text/cm_start_menu")
    regions = []
    for i, (key, stage) in enumerate(REGIONS):
        k = key_index(names, f"S_MENU_EGC_PHEROMONE_AREA_{i:02d}")
        name = tr(names, k) if k is not None else None
        if not name:
            raise ValueError(f"cm_start_menu 缺少 S_MENU_EGC_PHEROMONE_AREA_{i:02d}")
        regions.append({"key": key, "stage": stage, "name": name})
    out = []
    for row in range(n):
        v = ROW.unpack_from(data, 10 + row * ROW.size)
        if v[0] != row:
            raise ValueError(f"{ECEM_REL} 第 {row} 条的 gameId 是 {v[0]}")
        habitat = list(v[2 : 2 + len(REGIONS)])
        weights = _weights(v, 13)
        if not any(habitat):
            continue
        m = by_gid.get(row)
        if not m:
            raise ValueError(f"{ECEM_REL}：gameId {row} 在聚魔之地出现，但 monsters.json 里没有")
        for r, (flag, w) in enumerate(zip(habitat, weights, strict=True)):
            if flag not in (0, 1, 2) or bool(flag) != any(w):
                raise ValueError(f"{ECEM_REL}：{m['key']} 在地带 {r} 的标记 {flag} 与权重 {w} 不一致")
        alt = _weights(v, 57)
        out.append(
            {
                "gameId": row,
                "monster": m["key"],
                "unlockQuest": v[1] if v[1] > 0 else None,
                "habitat": habitat,
                "weights": weights,
                **({"weightsAlt": alt} if alt != weights else {}),
                "unknown": {"f8": v[8], "f9": v[9], "f10": v[10], "f55": v[55], "f56": v[56]},
                "_src": src(ECEM_REL, row),
            }
        )
    return {"regions": regions, "monsters": out}


LQEM_REL = "quest/enemy/LQ_EmData.lqem"
LQ_ROW = struct.Struct("<145i")
# 5 组（第 50 起每 19 个字段一组）：等级与是否历战。等级由组内的任务编号核对（全部 335 条一致），历战为推断
LQ_GROUPS = [("low", False), ("high", False), ("high", True), ("master", False), ("master", True)]


def build_investigations(s: Source, monsters: list[dict], quests: dict[int, str]) -> list[dict]:
    """LQ_EmData.lqem：u32 魔数、u16、u32 条数（101，下标 = gameId），每条 145 个 i32。

    第 50 起 5 组 × 19 个字段，每组前两个是任务编号：-1 = 这一级没有该怪物的调查任务，0 = 没有前置任务，
    其余 = 要先完成的任务（第 1 组都是下位任务、第 2–3 组上位、第 4–5 组大师；下位多是该怪物首次登场的任务，
    上位与大师多是剧情进度任务）。
    第 1–49 个（8 组 × 6 张地图的权重 + 1 个）与各组其余字段（像 em_difficulty 的行号）含义未确认。
    quests：任务编号 → 等级（low / high / master），用来核对。
    """
    data = s.path(LQEM_REL).read_bytes()
    magic, _, n = struct.unpack_from("<IHI", data, 0)
    if magic != 0x18091001 or 10 + n * LQ_ROW.size != len(data):
        raise ValueError(f"{LQEM_REL} 头部或长度不符")
    by_gid: dict[int, dict] = {}
    for m in monsters:
        by_gid.setdefault(m["gameId"], m)
    out = []
    for row in range(n):
        v = LQ_ROW.unpack_from(data, 10 + row * LQ_ROW.size)
        if v[0] != row:
            raise ValueError(f"{LQEM_REL} 第 {row} 条的 gameId 是 {v[0]}")
        groups = []
        for k, (rank, tempered) in enumerate(LQ_GROUPS):
            a, b = v[50 + 19 * k], v[51 + 19 * k]
            if a == -1:
                continue
            for q in (a, b):
                if q > 0 and quests.get(q) != rank:
                    raise ValueError(f"{LQEM_REL}：gameId {row} 第 {k + 1} 组的任务 {q} 不是{rank}任务")
            groups.append(
                {
                    "rank": rank,
                    "tempered": tempered,
                    "unlock": a or None,
                    **({"unlockAlt": b} if b not in (a, -1, 0) else {}),
                }
            )
        if not groups:
            continue
        m = by_gid.get(row)
        if not m:
            raise ValueError(f"{LQEM_REL}：gameId {row} 有调查任务，但 monsters.json 里没有")
        out.append({"gameId": row, "monster": m["key"], "groups": groups, "_src": src(LQEM_REL, row)})
    return out
