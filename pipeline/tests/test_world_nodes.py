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


@pytest.mark.game
@pytest.mark.skipif(not NODES.is_file(), reason="需要先运行 mhdb nodes")
def test_camps_bugs_and_slinger() -> None:
    st = stages()
    for sid, s in st.items():
        camps = [n for n in s["nodes"] if n["kind"].startswith("gm013_")]
        labels = [n["label"]["zh-Hans"] for n in camps if n.get("label")]
        assert len(labels) == len(camps) == len(set(labels)), f"st{sid} 的营地没有一一对上营地名"
        # 营地名括号里的区域号 = 营地所在纸片的区域号
        for n in camps:
            assert n["label"]["zh-Hans"].endswith(f"({n['area']})"), f"st{sid} {n['label']} 在 {n['area']} 区"
    af = st[101]
    kinds = {k["key"]: k for k in af["kinds"]}
    assert {k: kinds[k]["item"] for k in ("EC_032_01", "EC_032_02", "EC_032_04")} == {
        "EC_032_01": 49,  # 苦虫
        "EC_032_02": 50,  # 光虫
        "EC_032_04": 52,  # 雷光虫
    }
    assert kinds["gm000_000_00"]["category"] == "slinger"
    assert kinds["gm000_000_00"]["name"]["zh-Hans"] == "石块"
    # 结晶矿脉（pop_high_map）上位起
    assert {n["minRank"] for n in af["nodes"] if n["kind"] == "gm000_067_00"} == {"high"}


@pytest.mark.game
@pytest.mark.skipif(not NODES.is_file(), reason="需要先运行 mhdb nodes")
def test_interactive_endemic_life() -> None:
    st = stages()
    creatures = {
        sid: {
            k["key"]: (k["name"]["zh-Hans"], k["actionIcon"])
            for k in s["kinds"]
            if k["category"] == "creature"
        }
        for sid, s in st.items()
    }
    assert creatures[101]["EC_020"] == ("回复蜜虫", 16)
    assert creatures[101]["EC_018"] == ("麻痹瓦斯蛙", 17)
    assert creatures[102]["EC_043_01"] == ("仙人掌", 25)  # 键名写作 EC_043_1_NAME
    assert creatures[108]["EC_010_02"] == ("雪球虫", 23)


@pytest.mark.game
@pytest.mark.skipif(not NODES.is_file(), reason="需要先运行 mhdb nodes")
def test_npcs() -> None:
    af = stages()[101]
    names = {k["key"]: k["name"]["zh-Hans"] for k in af["kinds"] if k["category"] == "npc"}
    assert names["n002"] == "接待员" and names["n037"] == "孤高的鱼类调查员"
    # 接待员在 4 个营地各有一处位置
    handler = [n for n in af["nodes"] if n["kind"] == "n002"]
    assert sorted(n["area"] for n in handler) == [1, 8, 11, 17]


@pytest.mark.game
@pytest.mark.skipif(not NODES.is_file(), reason="需要先运行 mhdb nodes")
def test_environment_gimmicks() -> None:
    st = stages()
    env = {
        sid: {
            k["name"]["zh-Hans"]: (k["key"], k.get("actionIcon"))
            for k in s["kinds"]
            if k["category"] == "env"
        }
        for sid, s in st.items()
    }
    assert env[101]["藤蔓陷阱"] == ("gm011_000", 30)  # gm025_000 同名，并进来
    assert env[101]["树冠堰堤"] == ("gm001_900", 29)
    assert env[101]["回复露草"] == ("gm007_001", 3)
    assert env[104]["腐肉"] == ("gm007_006", 31)
    assert env[108]["温泉"] == ("gm908_200", None)  # 没有地图图标
    assert "抓住" not in env[101]  # 攀爬点没有说明，不画
    vines = [n for n in st[101]["nodes"] if n["kind"] == "gm011_000"]
    assert len(vines) == 4
    kinds = {k["key"]: k for k in st[101]["kinds"]}
    assert "gm025_000" in kinds["gm011_000"]["_src"]["gimmick"] and kinds["gm011_000"]["desc"]["zh-Hans"]


@pytest.mark.game
@pytest.mark.skipif(not NODES.is_file(), reason="需要先运行 mhdb nodes")
def test_treasure_hints_match_steps() -> None:
    """寻宝：每张的线索条数与地图上的处数一致，处的编号从 0 连续。"""
    for sid, s in stages().items():
        kinds = [k for k in s["kinds"] if k["category"] == "treasure"]
        assert len(kinds) == 10, sid
        for k in kinds:
            steps = sorted(n["step"] for n in s["nodes"] if n["kind"] == k["key"])
            assert steps == list(range(len(k["hints"]))), (sid, k["key"], steps, len(k["hints"]))
            assert k["name"]["zh-Hans"]
    # 每张图一个系列：古代树森林「分享的祝福 01–10」、陆珊瑚台地「传说的骑士 手札01–10」……
    assert stages()[101]["kinds"][0]["name"] is not None
