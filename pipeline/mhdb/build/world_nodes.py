"""大地图标记：采集点、矿脉、骨冢、特产、搬运物，输出 data/world/map-nodes.json。

来源（布局见各解析器，推断过程见 docs/DATA.md 4.2）：
  stage/stXXX/common/set/stXXX_pop_map.sobj       常驻的采集点
  stage/stXXX/common/set/stXXX_pop_high_map.sobj  常驻的结晶矿脉（低位表里也有，不是「上位限定」）
  stage/stXXX/common/set/stXXX_pop_rN.sobj        环境状态（「矿脉增殖中」等）时追加的采集点
  common/gimmick/gimmick.gcd                       物件种类 → 采集类型、两组抽选表
  common/item/pop_base.ppm                         采集类型 → 固定物品、采集次数、再生秒数
  stage/stXXX/common/data/stXXX[_1|_2].itlot       抽选表（下位 / 上位 / 大师）

地图坐标：雷达 2×2 块瓦片（1640 雷达单位）覆盖世界坐标 ±50000，纸片像素 × 比例 = 雷达单位（maps.json 的
scale），所以 纸片像素 = 世界坐标 × 1640 / 100000 / scale，原点重合。比例 0.5 的图是 1 像素 = 30.49 世界单位，
永霜冻土（0.625）是 38.11。构建时按纸片的透明度确认每个点落在哪块纸片上，取其层与区域号；
落在路面（纸片上浅色可走区域）附近的比例写进日志，用来核对坐标换算（各图 90%–98%）。
"""

import json
from collections import Counter
from pathlib import Path

import numpy as np

from mhdb.build.common import Source, tr
from mhdb.formats import gcd, sobj
from mhdb.games.world.specs import ITEM_LOT, POP_BASE
from mhdb.images.world_maps import patch_masks

RADAR_PER_WORLD = 1640 / 100000

# 环境状态：pop_rN 的 N → cm_quest 文本序号。r0 / r1 是各地区的两种特产（与文件里物件的抽选表物品逐一核对过），
# r2、r3 都是矿脉增殖（古代树等图两份内容相同，永霜冻土只有 r3），r4 骨冢、r5 消耗道具，r6 为空。
STATE_TEXT = {
    101: {0: 77, 1: 78},
    102: {0: 79, 1: 80},
    103: {0: 81, 1: 82},
    104: {0: 83, 1: 84},
    105: {0: 85, 1: 86},
    108: {0: 438, 1: 439},
}
COMMON_STATE_TEXT = {2: 87, 3: 87, 4: 88, 5: 89}
NO_STATE_TEXT = 74  # 无特注事项
# 特产采集点的名称（gmk_names 序号），按所在的环境状态文件 r0 / r1 对应，与状态文本一致
SPECIALTY_NAME = {
    101: {0: 88, 1: 44},
    102: {0: 92, 1: 96},
    103: {0: 100, 1: 104},
    104: {0: 108, 1: 112},
    105: {0: 116, 1: 120},
    108: {0: 194, 1: 198},
}
MINING_NAME, BONEPILE_NAME = 18, 42  # gmk_names：矿脉、骨冢
BONE_STATE = 4  # pop_r4：骨冢增殖中，里面的物件就是骨冢

# 各图开放的等级与对应的抽选表文件。龙结晶之地上位才开放，没有 _1，无后缀的表里是上位素材
# （良质硬骨、谜之头骨等）；永霜冻土只有大师级，无后缀的表是古代树森林那份的副本（st100 / 107 / 109 同样）。
RANK_FILES = {
    **{st: {"low": "", "high": "_1", "master": "_2"} for st in (101, 102, 103, 104)},
    105: {"high": "", "master": "_2"},
    108: {"master": "_2"},
}

# pop_base 的 kind（与物件、物品逐一对照得出）：1 固定物品、2 / 4 按抽选表（4 为矿脉类）、6 搬运物
POP_FIXED, POP_LOT, POP_MINE, POP_CARRY = 1, 2, 4, 6


def _rank_files(stage: int) -> dict[str, str]:
    return {
        rank: f"stage/st{stage}/common/data/st{stage}{suffix}.itlot"
        for rank, suffix in RANK_FILES[stage].items()
    }


def _lot_rows(s: Source, rel: str) -> list[list[dict]]:
    return [
        [
            {"item": r[f"item_{i}"], "count": r[f"count_{i}"], "weight": r[f"weight_{i}"]}
            for i in range(10)
            if r[f"item_{i}"]
        ]
        for r in s.table(rel, ITEM_LOT, encrypted=True)
    ]


def _depth(masks: dict, patches: list[dict], x: float, y: float) -> tuple[dict[str, float], bool]:
    """点所在位置不透明的纸片 → 点离该纸片边缘的距离（纸片像素），以及 3 像素内是否有路面。
    相邻纸片的毛边会互相盖住一点，所以同一层里取离边缘最远的那块；多层区域则有好几层叠在一起。"""
    out, road = {}, False
    for p in patches:
        u, v = int(x - p["mapX"]), int(y - p["mapY"])
        depth, walk = masks[p["letter"]]
        if 0 <= v < depth.shape[0] and 0 <= u < depth.shape[1] and depth[v, u] > 0:
            out[p["letter"]] = float(depth[v, u])
            road = road or bool(walk[max(0, v - 3) : v + 4, max(0, u - 3) : u + 4].any())
    return out, road


def _assign(nodes: list[dict], patches: list[dict], depths: list[dict[str, float]]) -> Counter:
    """给每个点定纸片（层与区域号）。

    1. 只落在一层的纸片上 → 取该层里离边缘最远的那块；
    2. 落在几层上时，取雷达层包含物件 floor 字段的纸片（floor 与雷达层大体一致，但也有 5、6 这类雷达上没有的值）；
    3. 还分不出层，比较高度：取「只落在一层上的点」的高度中位数与本点最接近的那块。
    返回各规则用到的次数，写进构建日志。
    """
    by = {p["letter"]: p for p in patches}
    used = Counter()
    heights: dict[int, list[float]] = {}
    for n, d in zip(nodes, depths, strict=True):
        if len({by[k]["layer"] for k in d}) == 1:
            best = max(d, key=d.__getitem__)
            heights.setdefault(by[best]["area"], []).append(n["h"])
    ref = {k: float(np.median(v)) for k, v in heights.items()}
    for n, d in zip(nodes, depths, strict=True):
        if not d:
            used["outside"] += 1
            continue
        cands = [by[k] for k in d]
        same = [p for p in cands if n["floor"] in p["floors"]]
        if len({p["layer"] for p in cands}) == 1:
            rule = "single"
        elif len({p["layer"] for p in same}) == 1:
            cands, rule = same, "floor"
        else:
            cands = same or cands
            near = min(cands, key=lambda c: abs(ref.get(c["area"], float("inf")) - n["h"]))
            cands, rule = [p for p in cands if p["layer"] == near["layer"]], "height"
        p = max(cands, key=lambda c: d[c["letter"]])
        used[rule] += 1
        n["layer"], n["area"] = p["layer"], p["area"]
    return used


def build_stage(
    s: Source,
    stage: int,
    stage_map: dict,
    gimmicks: dict[str, gcd.Gimmick],
    pops: list[dict],
    log=print,
) -> dict:
    gmk = s.text("common/text/gmk_names")
    quest = s.text("common/text/cm_quest")
    ranks = {rank: _lot_rows(s, rel) for rank, rel in _rank_files(stage).items()}
    masks = patch_masks(s.root, stage, stage_map["patches"])
    to_map = RADAR_PER_WORLD / stage_map["scale"]

    files: list[tuple[str, int | None]] = [
        (f"st{stage}_pop_map.sobj", None),
        (f"st{stage}_pop_high_map.sobj", None),
    ]
    files += [(f"st{stage}_pop_r{n}.sobj", n) for n in range(7)]
    kinds: dict[str, dict] = {}
    kind_states: dict[str, set[int]] = {}
    nodes, seen, states = [], set(), {}
    for fname, r in files:
        rel = f"stage/st{stage}/common/set/{fname}"
        if not s.path(rel).is_file():
            continue
        state = None if r is None else STATE_TEXT[stage].get(r, COMMON_STATE_TEXT.get(r))
        for obj in sobj.parse(s.path(rel).read_bytes()):
            g = gimmicks.get(obj.name) or gimmicks.get(obj.gimmick)
            if not g or g.kind != 2:  # 只要采集类物件（1 是投射器弹）
                continue
            pop = pops[g.pop]
            pick = obj.props.get("mPickItem")
            item = pick if isinstance(pick, int) and pick > 0 else pop["item_id"]
            if item and pop["item_id"] and item != pop["item_id"]:
                log(
                    f"  注意：st{stage} {obj.name} 的 mPickItem {item} 与 pop_base 物品 {pop['item_id']} 不同"
                )
            lot_index = obj.props.get("mItemLotIndex")
            lots = (lot_index,) if isinstance(lot_index, int) and lot_index >= 0 else g.lots
            if not item and not lots:  # 宝物提示点等，没有物品
                continue
            if obj.name not in kinds:
                kinds[obj.name] = _kind(obj.name, g, pop, item, lots, gmk)
            if r is not None:
                kind_states.setdefault(obj.name, set()).add(r)
            if state is not None:
                states.setdefault(state, tr(quest, state))
            x, y = round(obj.pos[0] * to_map, 1), round(obj.pos[2] * to_map, 1)
            key = (obj.name, x, y, obj.floor, state)
            if key in seen:  # r2 与 r3 内容相同
                continue
            seen.add(key)
            nodes.append(
                {
                    "kind": obj.name,
                    "x": x,
                    "y": y,
                    "h": round(obj.pos[1]),
                    "floor": obj.floor,
                    "layer": None,
                    "area": None,
                    "state": state,
                    "_src": {"file": rel},
                }
            )

    patches = stage_map["patches"]
    located = [_depth(masks, patches, n["x"], n["y"]) for n in nodes]
    rules = _assign(nodes, patches, [d for d, _ in located])
    road = sum(r for _, r in located) / max(1, len(nodes))
    for key, k in kinds.items():
        if k["category"] != "specialty":
            continue
        # 按抽选表采集的物件：出现在「骨冢增殖中」文件里的是骨冢，出现在两种特产文件里的取特产名
        rs = kind_states.get(key, set())
        if BONE_STATE in rs:
            k["category"], k["name"] = "bonepile", tr(gmk, BONEPILE_NAME)
        elif special := [SPECIALTY_NAME[stage][r] for r in sorted(rs) if r in SPECIALTY_NAME[stage]]:
            k["name"] = tr(gmk, special[0])
        else:
            k["category"] = "other"

    used = sorted({i for k in kinds.values() for i in k["lots"]})
    lots = {rank: {str(i): rows[i] for i in used if i < len(rows)} for rank, rows in ranks.items()}
    counts = Counter(n["kind"] for n in nodes)
    log(
        f"st{stage}：{len(nodes)} 个点、{len(kinds)} 种、{len(states)} 种环境状态、抽选表 {list(ranks)}；"
        f"定纸片 {dict(rules)}；{road:.0%} 在路面附近"
    )
    return {
        "id": stage,
        "ranks": list(ranks),
        "states": [{"id": NO_STATE_TEXT, "name": tr(quest, NO_STATE_TEXT)}]
        + [{"id": i, "name": n} for i, n in sorted(states.items())],
        "kinds": sorted(
            (k | {"total": counts[key]} for key, k in kinds.items()),
            key=lambda k: (k["category"], k["key"]),
        ),
        "lots": lots,
        "nodes": nodes,
        "_src": {"lots": _rank_files(stage)},
    }


def _kind(key: str, g: gcd.Gimmick, pop: dict, item: int, lots: tuple[int, ...], gmk) -> dict:
    if pop["kind"] == POP_MINE:
        category = "mining" if pop["respawn"] > 0 else "other"
    elif pop["kind"] == POP_LOT:
        category = "specialty"  # 骨冢、特产名按出现在哪个环境状态文件再区分
    elif pop["kind"] == POP_CARRY:
        category = "carry"
    else:
        category = "gather"
    return {
        "key": key,
        "category": category,
        "name": tr(gmk, MINING_NAME) if category == "mining" else None,
        "item": item or None,
        "lots": list(dict.fromkeys(lots)),
        "gathers": pop["gather_max"],
        "respawn": pop["respawn"],
        "_src": {"gimmick": f"common/gimmick/gimmick.gcd {key}", "pop": f"common/item/pop_base.ppm #{g.pop}"},
    }


def build(raw: Path, data: Path, log=print) -> dict:
    s = Source(raw)
    maps = {st["id"]: st for st in json.loads((data / "maps.json").read_text("utf-8"))["stages"]}
    gimmicks = gcd.parse(s.path("common/gimmick/gimmick.gcd").read_bytes())
    pops = s.table("common/item/pop_base.ppm", POP_BASE)
    stages = [build_stage(s, sid, maps[sid], gimmicks, pops, log) for sid in STATE_TEXT]
    out = {"stages": stages}
    _write(data / "map-nodes.json", stages)
    return out


def _write(path: Path, stages: list[dict]) -> None:
    """种类与点一条一行（与 write_records 同样便于看 git 差异），其余字段紧凑写在关卡开头。"""
    line = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    parts = []
    for st in stages:
        head = line({k: v for k, v in st.items() if k not in ("kinds", "nodes")})[:-1]
        kinds = ",\n".join(line(k) for k in st["kinds"])
        nodes = ",\n".join(line(n) for n in st["nodes"])
        parts.append(f'{head},"kinds":[\n{kinds}\n],"nodes":[\n{nodes}\n]}}')
    body = ",\n".join(parts)
    path.write_text(f'{{"stages":[\n{body}\n]}}\n', encoding="utf-8", newline="\n")
