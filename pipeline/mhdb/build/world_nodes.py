"""大地图标记：采集点、矿脉、骨冢、特产、虫与鱼饵、投射器弹、营地、交互环境生物，输出 data/world/map-nodes.json。

来源（布局见各解析器，推断过程见 docs/DATA.md 4.2）：
  stage/stXXX/common/set/stXXX_pop_map.sobj       常驻的采集点；cSetAnimalArea 里的 EC_032 是虫与鱼饵
  stage/stXXX/common/set/stXXX_pop_high_map.sobj  结晶矿脉，由 stXXX_high.sobjl 单独加载（推断为上位起）
  stage/stXXX/common/set/stXXX_pop_rN.sobj        环境状态（「矿脉增殖中」等）时追加的采集点
  stage/stXXX/common/set/stXXX_gm.sobj            营地（gm013，带 mCampId）、少数矿脉
  stage/stXXX/common/set/stXXX_gm_map.sobj        投射器弹（gimmick.gcd 种类 1）、怪物的粪、交互环境生物
  stage/stXXX/common/set/stXXX_ec.sobj            环境生物（只取交互环境生物，如铁鲎）
  common/gimmick/gimmick.gcd                       物件种类 → 采集类型、两组抽选表
  common/item/pop_base.ppm                         采集类型 → 固定物品、采集次数、再生秒数
  stage/stXXX/common/data/stXXX[_1|_2].itlot       抽选表（下位 / 上位 / 大师）
  common/text/gmk_names                            物件名，键名就是物件名（gm000_012_00_NAME → 矿脉）
  common/text/animal_names                         虫与交互环境生物的名字（EC_032_01_NAME → 苦虫）
  common/gimmick/animal.gcd                        环境生物的地图图标（有图标的是交互环境生物，见 mhdb/formats/gcd.py）
  common/text/other_names                          营地名（ST101_Camp02 → 南西营地(1)），按括号里的区域号对应

地图坐标：雷达 2×2 块瓦片（1640 雷达单位）覆盖世界坐标 ±50000，纸片像素 × 比例 = 雷达单位（maps.json 的
scale），所以 纸片像素 = 世界坐标 × 1640 / 100000 / scale，原点重合。比例 0.5 的图是 1 像素 = 30.49 世界单位，
永霜冻土（0.625）是 38.11。构建时按纸片的透明度确认每个点落在哪块纸片上，取其层与区域号；
落在路面（纸片上浅色可走区域）附近的比例写进日志，用来核对坐标换算（各图 90%–98%）。
"""

import json
import re
from collections import Counter
from pathlib import Path

import numpy as np

from mhdb.build.common import Source, Text, tr
from mhdb.formats import gcd, sobj
from mhdb.games.world.specs import ITEM_LOT, POP_BASE
from mhdb.images.world_maps import RADAR_PER_WORLD, patch_masks

# 环境状态：pop_rN 的 N → cm_quest 文本序号。r0 / r1 是各地区的两种特产（与文件里物件的抽选表物品、
# gmk_names 的物件名逐一核对过），r2、r3 都是矿脉增殖（古代树等图两份内容相同，永霜冻土只有 r3），
# r4 骨冢、r5 消耗道具，r6 为空。
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
BONE_STATE = 4  # pop_r4：骨冢增殖中，里面的物件就是骨冢
SPECIALTY_STATES = {0, 1}

# 各图开放的等级与对应的抽选表文件。龙结晶之地上位才开放，没有 _1，无后缀的表里是上位素材
# （良质硬骨、谜之头骨等）；永霜冻土只有大师级，无后缀的表是古代树森林那份的副本（st100 / 107 / 109 同样）。
RANK_FILES = {
    **{st: {"low": "", "high": "_1", "master": "_2"} for st in (101, 102, 103, 104)},
    105: {"high": "", "master": "_2"},
    108: {"master": "_2"},
}

# pop_base 的 kind（与物件、物品逐一对照得出）：1 固定物品、2 / 4 按抽选表（4 为矿脉类）、6 搬运物
POP_LOT, POP_MINE, POP_CARRY = 2, 4, 6
GCD_SLINGER, GCD_GATHER = 1, 2

# 虫与鱼饵：animal.gcd 的 EC_032_01–05（苦虫、光虫、不死虫、雷光虫、美味虫）→ 物品 49–53。
# 前 4 种与物品同名（构建时核对）；美味虫（Feastbug）对应物品 53「陆续上钩黄金饵」（Baitbug）：
# 两者说明都是「作为钓饵的虫」，物品编号也正好接在 52 后面。
BUG_EC = 32
BUG_ITEM = {1: 49, 2: 50, 3: 51, 4: 52, 5: 53}

CAMP_PREFIX = "gm013_"


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


def _keyed(texts: dict, key: str) -> Text | None:
    """按键名取四语文本（gmk_names、animal_names 的键名带物件名 / 生物编号）。"""
    index = {k: i for i, k in texts["zh-Hans"].keys.items()}
    return tr(texts, index[key]) if key in index else None


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


class _Texts:
    def __init__(self, s: Source, items: dict[int, dict]):
        self.gmk = s.text("common/text/gmk_names")
        self.animal = s.text("common/text/animal_names")
        self.quest = s.text("common/text/cm_quest")
        self.places = s.text("common/text/other_names")
        self.items = items
        self.animal_icon = gcd.animal_icons(s.path("common/gimmick/animal.gcd").read_bytes())
        # 投射器弹的物品：物品名与物件名相同的那一个（石块、光苔……）
        self.by_name: dict[str, int] = {}
        for i in sorted(items.values(), key=lambda i: i["id"]):
            self.by_name.setdefault(i["name"]["zh-Hans"], i["id"])

    def gimmick(self, name: str) -> Text | None:
        return _keyed(self.gmk, f"{name}_NAME")

    def animal_name(self, key: str, field: str = "NAME") -> Text | None:
        """animal_names 的键名有两种写法：EC_043_01_NAME 与 EC_043_1_NAME（说明为 _DESC）。"""
        short = re.sub(r"_0(\d)$", r"_\1", key)
        return _keyed(self.animal, f"{key}_{field}") or _keyed(self.animal, f"{short}_{field}")

    def camps(self, stage: int) -> dict[int, Text]:
        """营地名里括号中的区域号 → 营地名（ST101_Camp02 → 南西营地(1)）。"""
        out = {}
        for i, k in self.places["zh-Hans"].keys.items():
            t = tr(self.places, i) if k.startswith(f"ST{stage}_Camp") else None
            if t and (m := re.search(r"[(（](\d+)[)）]\s*$", t["zh-Hans"])):
                out[int(m.group(1))] = t
        return out


def _set_files(stage: int) -> list[tuple[str, int | None, str | None]]:
    """(文件名, 环境状态文件号, 最低等级)"""
    st = f"st{stage}"
    files: list[tuple[str, int | None, str | None]] = [
        (f"{st}_pop_map.sobj", None, None),
        (f"{st}_pop_high_map.sobj", None, "high"),
        (f"{st}_gm.sobj", None, None),
        (f"{st}_gm_map.sobj", None, None),
        (f"{st}_ec.sobj", None, None),
    ]
    return files + [(f"{st}_pop_r{n}.sobj", n, None) for n in range(7)]


def build_stage(
    s: Source,
    stage: int,
    stage_map: dict,
    gimmicks: dict[str, gcd.Gimmick],
    pops: list[dict],
    texts: _Texts,
    log=print,
) -> dict:
    ranks = {rank: _lot_rows(s, rel) for rank, rel in _rank_files(stage).items()}
    masks = patch_masks(s.root, stage, stage_map["patches"])
    to_map = RADAR_PER_WORLD / stage_map["scale"]

    kinds: dict[str, dict] = {}
    kind_states: dict[str, set[int]] = {}
    nodes, seen, states = [], set(), {}

    def add(key: str, pos, floor: int, rel: str, r: int | None, min_rank: str | None, **extra) -> None:
        state = None if r is None else STATE_TEXT[stage].get(r, COMMON_STATE_TEXT.get(r))
        if r is not None:
            kind_states.setdefault(key, set()).add(r)
        if state is not None:
            states.setdefault(state, tr(texts.quest, state))
        x, y = round(pos[0] * to_map, 1), round(pos[2] * to_map, 1)
        if (key, x, y, floor, state) in seen:  # r2 与 r3 内容相同
            return
        seen.add((key, x, y, floor, state))
        node = {"kind": key, "x": x, "y": y, "h": round(pos[1]), "floor": floor, "layer": None, "area": None}
        node |= {"state": state, "minRank": min_rank, **extra, "_src": {"file": rel}}
        nodes.append(node)

    for fname, r, min_rank in _set_files(stage):
        rel = f"stage/st{stage}/common/set/{fname}"
        if not s.path(rel).is_file():
            continue
        data = s.path(rel).read_bytes()
        for obj in sobj.parse(data):
            g = gimmicks.get(obj.name) or gimmicks.get(obj.gimmick)
            if obj.name.startswith(CAMP_PREFIX) and "mCampId" in obj.props:
                if obj.name not in kinds:
                    kinds[obj.name] = _plain_kind(obj.name, "camp", texts.gimmick(obj.name), None, rel)
                add(obj.name, obj.pos, obj.floor, rel, r, min_rank, campId=obj.props["mCampId"])
                continue
            if not g:
                continue
            if g.kind == GCD_SLINGER and fname.endswith("_gm_map.sobj"):
                if obj.name not in kinds:
                    name = texts.gimmick(obj.name)
                    item = texts.by_name.get(name["zh-Hans"]) if name else None
                    kinds[obj.name] = _plain_kind(
                        obj.name, "slinger", name, item, f"common/gimmick/gimmick.gcd {obj.name}"
                    )
                add(obj.name, obj.pos, obj.floor, rel, r, min_rank)
                continue
            if g.kind != GCD_GATHER:
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
            if not item and not lots:  # 宝物提示点（gm000_242「分享的祝福」）等，没有物品
                continue
            if obj.name not in kinds:
                kinds[obj.name] = _gather_kind(obj.name, g, pop, item, lots, texts.gimmick(obj.name))
            add(obj.name, obj.pos, obj.floor, rel, r, min_rank)

        for area in sobj.animal_areas(data):
            key = area.name
            icon = texts.animal_icon.get(key, 0)
            if area.ec == BUG_EC:
                if key not in kinds:
                    kinds[key] = _bug_kind(key, area.variant, texts)
            elif icon:
                # 交互环境生物：animal.gcd 给了大地图图标的（回复蜜虫、瓦斯蛙、闪光翅虫……）
                if key not in kinds:
                    name = texts.animal_name(key)
                    if name is None:
                        log(f"  注意：st{stage} 环境生物 {key} 有地图图标但没有名字，跳过")
                        texts.animal_icon[key] = 0
                        continue
                    kinds[key] = _plain_kind(key, "creature", name, None, f"common/gimmick/animal.gcd {key}")
                    kinds[key]["actionIcon"] = icon
                    if desc := texts.animal_name(key, "DESC"):
                        kinds[key]["desc"] = desc
            else:
                continue  # 其他环境生物：名字与物品的对应还没找到，暂不接入
            add(key, area.pos, area.floor, rel, r, min_rank)

    patches = stage_map["patches"]
    located = [_depth(masks, patches, n["x"], n["y"]) for n in nodes]
    rules = _assign(nodes, patches, [d for d, _ in located])
    road = sum(r for _, r in located) / max(1, len(nodes))

    # 按抽选表采集的物件：出现在「骨冢增殖中」文件里的是骨冢，出现在两种特产文件里的是特产
    for key, k in kinds.items():
        if k["category"] == "specialty":
            rs = kind_states.get(key, set())
            if BONE_STATE in rs:
                k["category"] = "bonepile"
            elif not rs & SPECIALTY_STATES:
                k["category"] = "other"

    # 营地名：按营地所在区域号对上名字里括号中的区域号。营地叠在几层纸片上时（如陆珊瑚台地北东营地，
    # floor 字段是雷达上没有的 7），取叠着的纸片里区域号出现在营地名中的那块。
    camp_names = texts.camps(stage)
    by_letter = {p["letter"]: p for p in patches}
    for n, (d, _) in zip(nodes, located, strict=True):
        if kinds[n["kind"]]["category"] == "camp":
            named = [k for k in d if by_letter[k]["area"] in camp_names]
            if named and n["area"] not in camp_names:
                best = by_letter[max(named, key=d.__getitem__)]
                n["layer"], n["area"] = best["layer"], best["area"]
            n["label"] = camp_names.get(n["area"])
    # 还没对上的营地：营地与营地名一一对应，只剩一个时按排除法（区域号以营地名为准）
    camps = [n for n in nodes if kinds[n["kind"]]["category"] == "camp"]
    left = [a for a in camp_names if a not in {n["area"] for n in camps if n["label"]}]
    loose = [n for n in camps if not n["label"]]
    if len(loose) == 1 and len(left) == 1:
        n = loose[0]
        log(
            f"  st{stage}：营地 {n['campId']}（落在 {n['area']} 区纸片上）按排除法对应 {camp_names[left[0]]['zh-Hans']}"
        )
        n["area"], n["label"] = left[0], camp_names[left[0]]
        n["layer"] = next((p["layer"] for p in patches if p["area"] == left[0]), n["layer"])
    for n in loose if len(loose) > 1 else []:
        log(f"  注意：st{stage} 营地 {n['campId']}（{n['area']} 区）没有对上营地名")

    used = sorted({i for k in kinds.values() for i in k["lots"]})
    lots = {rank: {str(i): rows[i] for i in used if i < len(rows)} for rank, rows in ranks.items()}
    counts = Counter(n["kind"] for n in nodes)
    cats = Counter(kinds[n["kind"]]["category"] for n in nodes)
    log(
        f"st{stage}：{len(nodes)} 个点 {dict(cats)}；抽选表 {list(ranks)}；"
        f"定纸片 {dict(rules)}；{road:.0%} 在路面附近"
    )
    return {
        "id": stage,
        "ranks": list(ranks),
        "states": [{"id": NO_STATE_TEXT, "name": tr(texts.quest, NO_STATE_TEXT)}]
        + [{"id": i, "name": n} for i, n in sorted(states.items())],
        "kinds": sorted(
            (k | {"total": counts[key]} for key, k in kinds.items()),
            key=lambda k: (k["category"], k["key"]),
        ),
        "lots": lots,
        "nodes": nodes,
        "_src": {"lots": _rank_files(stage)},
    }


def _gather_kind(key: str, g: gcd.Gimmick, pop: dict, item: int, lots: tuple[int, ...], name) -> dict:
    if pop["kind"] == POP_MINE:
        category = "mining" if pop["respawn"] > 0 else "other"
    elif pop["kind"] == POP_LOT:
        category = "specialty"  # 骨冢、特产按出现在哪个环境状态文件再区分
    elif pop["kind"] == POP_CARRY:
        category = "carry"
    else:
        category = "gather"
    return {
        "key": key,
        "category": category,
        "name": name,
        "item": item or None,
        "lots": list(dict.fromkeys(lots)),
        "gathers": pop["gather_max"],
        "respawn": pop["respawn"],
        "_src": {"gimmick": f"common/gimmick/gimmick.gcd {key}", "pop": f"common/item/pop_base.ppm #{g.pop}"},
    }


def _plain_kind(key: str, category: str, name, item: int | None, src: str) -> dict:
    return {
        "key": key,
        "category": category,
        "name": name,
        "item": item,
        "lots": [],
        "gathers": None,
        "respawn": None,
        "_src": {"gimmick": src},
    }


def _bug_kind(key: str, variant: int, texts: _Texts) -> dict:
    name = _keyed(texts.animal, f"{key}_NAME")
    item = BUG_ITEM[variant]
    if variant != 5 and (not name or texts.items[item]["name"]["zh-Hans"] != name["zh-Hans"]):
        raise ValueError(f"{key} 的名字与物品 {item} 不符，虫与物品的对应需要重新核对")
    out = _plain_kind(key, "bug", name, item, f"common/gimmick/animal.gcd {key}")
    out["_src"]["name"] = f"common/text/animal_names {key}_NAME"
    return out


def build(raw: Path, data: Path, log=print) -> dict:
    s = Source(raw)
    maps = {st["id"]: st for st in json.loads((data / "maps.json").read_text("utf-8"))["stages"]}
    items = {i["id"]: i for i in json.loads((data / "items.json").read_text("utf-8"))["items"]}
    gimmicks = gcd.parse(s.path("common/gimmick/gimmick.gcd").read_bytes())
    pops = s.table("common/item/pop_base.ppm", POP_BASE)
    texts = _Texts(s, items)
    stages = [build_stage(s, sid, maps[sid], gimmicks, pops, texts, log) for sid in STATE_TEXT]
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
