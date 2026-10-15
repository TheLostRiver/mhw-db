import json

import pytest

from mhdb.build.common import Source
from mhdb.config import DATA, DATA_RAW
from mhdb.games.world.specs import ITEM_LOT, POP_BASE

NODES = DATA / "world" / "map-nodes.json"
RAW = DATA_RAW / "world"


@pytest.mark.game
@pytest.mark.skipif(not (RAW / "common/item/pop_base.ppm").is_file(), reason="需要先运行 mhdb extract")
def test_pop_base_and_item_lots_against_game() -> None:
    s = Source(RAW)
    pops = s.table("common/item/pop_base.ppm", POP_BASE)
    assert len(pops) == 87
    # 药草：固定物品 33；矿脉：3 次、300 秒、按抽选表
    assert (pops[10]["kind"], pops[10]["item_id"], pops[10]["respawn"]) == (1, 33, 180)
    assert (pops[12]["kind"], pops[12]["gather_max"], pops[12]["respawn"]) == (4, 3, 300)
    lots = s.table("stage/st101/common/data/st101.itlot", ITEM_LOT, encrypted=True)
    # 古代树森林下位矿脉：铁矿石 76、燕雀石 21、光水晶 3
    row = lots[0]
    assert [(row[f"item_{i}"], row[f"weight_{i}"]) for i in range(3)] == [(205, 76), (206, 21), (213, 3)]


def stages() -> dict[int, dict]:
    return {st["id"]: st for st in json.loads(NODES.read_text(encoding="utf-8"))["stages"]}


@pytest.mark.game
@pytest.mark.skipif(not NODES.is_file(), reason="需要先运行 mhdb nodes")
def test_map_nodes_against_game() -> None:
    st = stages()
    assert st[101]["ranks"] == ["low", "high", "master"]
    assert st[105]["ranks"] == ["high", "master"]  # 龙结晶之地上位起
    assert st[108]["ranks"] == ["master"]  # 永霜冻土大师级
    af = st[101]
    kinds = {k["key"]: k for k in af["kinds"]}
    assert kinds["gm000_012_00"]["category"] == "mining"
    assert kinds["gm000_028_00"]["category"] == "bonepile"
    assert kinds["gm000_078_00"]["name"]["zh-Hans"] == "特产蘑菇的群生地"
    assert kinds["gm000_029_00"]["name"]["zh-Hans"] == "大朵花"
    assert kinds["gm000_010_00"]["item"] == 33
    # 瘴气之谷的化石是特产，不因骨头图标被当成骨冢
    assert {k["key"]: k["category"] for k in st[104]["kinds"]}["gm000_083_00"] == "specialty"
    names = [s["name"]["zh-Hans"] for s in af["states"]]
    assert names == [
        "无特注事项",
        "特产蘑菇增殖中",
        "大花朵增殖中",
        "矿脉增殖中",
        "骨冢增殖中",
        "消耗道具增殖中",
    ]
    # 古代树顶的飞龙蛋在最上层（区域 16）
    egg = next(n for n in af["nodes"] if n["kind"] == "gm000_092_00")
    assert (egg["layer"], egg["area"]) == (2, 16)
    # 矿脉增殖：r2 与 r3 内容相同，只保留一份
    mining = [n for n in af["nodes"] if n["state"] == 87]
    assert len(mining) == 6
