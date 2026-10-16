"""对照测试：用本地解包结果生成的 data/world/*.json，断言与游戏画面一致的数值。

已核对的来源：用户提供的游戏截图（2026-10-14，装备详情与饰品界面）。缺少数据时跳过。
"""

import json

import pytest

from mhdb.config import DATA

WORLD = DATA / "world"
pytestmark = [
    pytest.mark.game,
    pytest.mark.skipif(not (WORLD / "skills.json").is_file(), reason="需要先运行 mhdb parse"),
]


def load(name: str, key: str) -> list[dict]:
    return json.loads((WORLD / name).read_text(encoding="utf-8"))[key]


def by_name(rows: list[dict], zh: str) -> dict:
    hits = [r for r in rows if r["name"].get("zh-Hans") == zh]
    assert hits, f"找不到 {zh}"
    return hits[0]


def test_black_fatalis_blade_matches_screenshot() -> None:
    # 截图：黑龙玄刃 稀有度 12，攻击力 1632，龙属性 180，龙封力 大，镶嵌槽 4·4
    w = by_name(load("weapons/great-sword.json", "weapons"), "黑龙玄刃")
    assert w["rarity"] == 12
    assert round(w["attack"] * 4.8) == 1632  # 数据存真实攻击力，大剑显示值 = ×4.8
    assert w["element"] == {"type": "dragon", "value": 18}  # 显示值 = ×10
    assert w["elderseal"] == 3
    assert w["slots"] == [4, 4]
    assert w["name"]["en"] == "Black Fatalis Blade"


def test_critical_evasion_jewel_matches_screenshot() -> None:
    # 截图：超心·回避珠【4】 = 超会心 1 + 回避性能 1
    skills = {s["id"]: s for s in load("skills.json", "skills")}
    d = by_name(load("decorations.json", "decorations"), "超心·回避珠【4】")
    assert d["size"] == 4
    assert {skills[s["id"]]["name"]["zh-Hans"]: s["level"] for s in d["skills"]} == {
        "超会心": 1,
        "回避性能": 1,
    }


def test_critical_boost_levels_match_screenshot() -> None:
    # 截图：超会心 等级 1/2/3 = 会心攻击时的伤害倍率增强为 1.3 / 1.35 / 1.4 倍
    s = by_name(load("skills.json", "skills"), "超会心")
    assert s["maxLevel"] == 3
    descs = [lv["desc"]["zh-Hans"].replace("\n", "") for lv in s["levels"]]
    assert [x in d for x, d in zip(("1.3倍", "1.35倍", "1.4倍"), descs, strict=True)] == [True] * 3
    assert [lv["params"][0] for lv in s["levels"]] == [130, 135, 140]


def test_secret_skill_unlocks() -> None:
    # 挑战者 6、7 级由「极意」类套装技能解锁；黑龙的传说 2 件解锁全部极意
    skills = load("skills.json", "skills")
    names = {s["id"]: s["name"]["zh-Hans"] for s in skills}
    agitator = by_name(skills, "挑战者")
    assert (agitator["baseMaxLevel"], agitator["maxLevel"]) == (5, 7)
    unlocks = {(names[u["skill"]], u["level"]) for u in agitator["levels"][5]["unlockedBy"]}
    assert ("黑龙的传说", 2) in unlocks


def test_set_bonus_level_names() -> None:
    # 套装技能每一档的名字（游戏内套装技能一览）：黑龙的传说 2 件「继承」、4 件「超越」；普通技能的等级没有名字
    skills = load("skills.json", "skills")
    fatalis = by_name(skills, "黑龙的传说")
    assert [(lv["level"], lv["name"]["zh-Hans"]) for lv in fatalis["levels"]] == [(2, "继承"), (4, "超越")]
    assert all("name" not in lv for lv in by_name(skills, "攻击")["levels"])


def test_charm_and_armor() -> None:
    charm = by_name(load("charms.json", "charms"), "挑战护石5")
    assert charm["rarity"] == 12
    hide = by_name(load("armor.json", "armor"), "精英·龙皮阿尔法")
    assert hide["slot"] == "chest" and hide["slots"] == [4, 4, 3] and hide["rarity"] == 12
    assert hide["series"]["name"]["en"] == "Fatalisα+"


def test_every_record_has_source() -> None:
    for name, key in (("items.json", "items"), ("armor.json", "armor"), ("decorations.json", "decorations")):
        for r in load(name, key):
            assert r["_src"]["file"].startswith("common/")


# ---------- 武器客制（数值来自数据；与游戏画面的核对见 docs/DATA.md） ----------


def custom() -> dict:
    return json.loads((WORLD / "weapon-custom.json").read_text(encoding="utf-8"))


def test_augment_levels_and_slot_costs() -> None:
    levels = custom()["augments"]["levels"]
    cost = {
        c: [lv["slotCost"] for lv in levels if lv["category"] == c]
        for c in ("attack", "affinity", "defense", "slot", "health", "element")
    }
    assert cost["attack"] == [3, 5, 7, 9]
    assert cost["affinity"] == [2, 4, 6, 8]
    assert cost["defense"] == [1, 2, 3, 5]
    assert cost["health"] == [3, 5, 7, 9]
    assert by_name(levels, "攻击力强化4")["level"] == 4
    assert by_name(levels, "扩充自定义栏3")["category"] == "extend"


def test_augment_effects_from_player_params() -> None:
    fx = custom()["augments"]["effects"]
    assert fx["attack"] == [5, 10, 15, 25]
    assert fx["affinity"] == [10, 15, 20, 25]
    assert fx["elementMultiplier"]["great-sword"] == 1.2


def test_custom_parts_stages() -> None:
    gs = custom()["parts"]["great-sword"]
    assert [p["stage"] for p in gs] == sorted(p["stage"] for p in gs)
    assert {p["stage"] for p in gs} == set(range(1, 8))
    part = by_name(gs, "冥灯龙零件")
    assert part["stage"] == 7
    assert part["effect"] == {"sharpness": 1}


def test_awakening_abilities() -> None:
    aw = custom()["awakening"]
    atk6 = by_name(aw, "攻击力强化6")
    assert (atk6["category"], atk6["rank"], atk6["stackable"]) == ("attack", 6, False)
    assert by_name(aw, "攻击力强化5")["stackable"] is True
    assert by_name(aw, "冰牙龙的秘技")["setSkill"] == 188
    sharp = by_name(aw, "锐利度强化1")
    assert "bow" not in sharp["weapons"] and "great-sword" in sharp["weapons"]
    assert all(a["weapons"] == ["hunting-horn"] for a in aw if a["category"] == "melody")


def test_awakened_weapons_marked_and_deduplicated() -> None:
    gs = load("weapons/great-sword.json", "weapons")
    safi = [w for w in gs if w.get("awakened")]
    assert len(safi) == 18
    assert sum(1 for w in safi if "duplicateOf" not in w) == 9


def test_awakening_values_by_weapon() -> None:
    aw = custom()["awakening"]
    atk6 = by_name(aw, "攻击力强化6")["value"]
    assert atk6["kind"] == "attack"
    assert (atk6["byWeapon"]["great-sword"], atk6["byWeapon"]["long-sword"]) == (14, 15)
    el6 = by_name(aw, "属性强化6")["value"]["byWeapon"]
    assert (el6["great-sword"], el6["dual-blades"]) == (15, 9)
    assert "heavy-bowgun" not in el6
    assert by_name(aw, "镶嵌槽强化4")["value"] == {
        "kind": "slotLevel",
        "byWeapon": dict.fromkeys([k for k in by_name(aw, "镶嵌槽强化4")["weapons"]], 4),
    }
    assert by_name(aw, "旋律【攻击】1")["value"] is None


def test_weapon_bloat_against_exe_dump() -> None:
    import os
    from pathlib import Path

    from mhdb.games.world import exe

    dump = os.environ.get("MHDB_EXE_DUMP")
    if not dump or not Path(dump).is_file():
        pytest.skip("设置 MHDB_EXE_DUMP 指向本机 exe 内存转储后核对")
    exe.verify_dump(Path(dump))
    bloat = json.loads((WORLD / "constants.json").read_text(encoding="utf-8"))["weaponBloat"]
    assert round(340 * bloat["great-sword"]) == 1632  # 黑龙玄刃，游戏截图


def test_sharpness_multipliers() -> None:
    c = json.loads((WORLD / "constants.json").read_text(encoding="utf-8"))
    assert c["sharpness"]["raw"] == [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.39]
    assert c["sharpness"]["element"][6] == 1.25
    assert (c["critMultiplier"], c["badCritMultiplier"]) == (1.25, 0.75)


def test_mantle_names_follow_row_order() -> None:
    # 用户指出缺少滑空衣装：文本按文件行号排列，不按 mantle_id
    m = load("mantles.json", "mantles")
    names = [x["name"]["zh-Hans"] for x in m]
    assert "滑空衣装" in names and "回避衣装" in names
    glider = by_name(m, "滑空衣装")
    assert glider["slots"] == [4, 4]
    assert all(x["slots"] == [] for x in m if x["name"]["zh-Hans"].endswith("烟筒"))


def test_combinations_match_game() -> None:
    # 游戏内调和列表：回复药 = 药草（单一素材）、回复药·大 = 回复药 + 蜂蜜、汉方药 = 解毒药 + 蓝蘑菇
    items = {i["id"]: i["name"]["zh-Hans"] for i in load("items.json", "items")}
    recipes = {
        items[c["result"]]: ([items[m] for m in c["materials"]], c["quantity"])
        for c in load("combinations.json", "combinations")
    }
    assert recipes["回复药"] == (["药草"], 1)
    assert recipes["回复药·大"] == (["回复药", "蜂蜜"], 1)
    assert recipes["汉方药"] == (["解毒药", "蓝蘑菇"], 1)


def test_kinsects_match_public_data() -> None:
    # 与 Kiranico 逐只核对过的四项等级；粉尘按 0 爆破 1 回复 2 麻痹 3 毒（Fextralife 的 7 只猎虫一致）
    k = by_name(load("kinsects.json", "kinsects"), "龙魂虫·极")
    assert (k["power"], k["speed"], k["heal"], k["element"]) == (17, 16, 1, 16)
    assert (k["attack"], k["dust"], k["rarity"]) == ("blunt", "blast", 12)
    assert by_name(load("kinsects.json", "kinsects"), "恐惧银色金龟子3")["dust"] == "heal"


def test_melodies_match_public_data() -> None:
    # 白红红 = 攻击力提升【小】，120 秒，重复演奏变为【大】；数值与 Kiranico 旋律页前几行一致
    m = by_name(load("melodies.json", "melodies"), "攻击力提升【小】")
    assert ["white", "red", "red"] in m["sequences"]
    assert m["duration"][0] == 120 and m["extension"][0] == 60
    assert m["encore"]["zh-Hans"] == "攻击力提升【大】"


def test_pendant_and_layered_weapon_recipes() -> None:
    items = {i["id"]: i["name"]["zh-Hans"] for i in load("items.json", "items")}
    p = by_name(load("pendants.json", "pendants"), "铜章领巾·黄")
    assert p["cost"] == 300
    assert {items[m["item"]]: m["count"] for m in p["materials"]} == {"霸王之证": 1, "雷电袋": 2}
    layered = json.loads((WORLD / "weapon-layered.json").read_text(encoding="utf-8"))
    iron = by_name(layered["long-sword"], "基本外观【铁】")
    assert (iron["kind"], iron["cost"]) == ("base", 250)


def facility(name: str, key: str | None = None):
    data = json.loads((WORLD / "facilities" / f"{name}.json").read_text(encoding="utf-8"))
    return data[key] if key else data


def test_facilities_match_public_data() -> None:
    items = {i["name"]["zh-Hans"]: i["id"] for i in load("items.json", "items")}
    # Kiranico 神秘炼金：回复药·大 20 点 / 炼金值 10，铁矿石提供 2
    mega = next(t for t in facility("melder", "melder") if t["item"] == items["回复药·大"])
    assert (mega["points"], mega["melding"]) == (20, 10)
    assert [items["铁矿石"], 2] in mega["sources"]
    # 交货委托：古代树森林营地计划之1 = 铁矿石 ×2 + 太古大骨 ×1、50 点
    camp = by_name_key(facility("deliveries", "deliveries"), "title", "古代树森林营地计划之1")
    assert camp["cost"] == 50
    assert {m["item"]: m["count"] for m in camp["materials"]} == {items["铁矿石"]: 2, items["太古大骨"]: 1}
    # 奖金：在矿脉采掘 6 次 = 铠玉 ×1、40 点
    ore = next(b for b in facility("bounties", "bounties") if "在矿脉采掘6次" in b["desc"].get("zh-Hans", ""))
    assert ore["points"] == 40 and ore["rewards"] == [{"item": items["铠玉"], "count": 1}]
    # 植生研究所：屠龙果实 3 次任务 6 / 7 / 8
    botany = facility("botany")
    dragon = next(p for p in botany["plants"] if p["item"] == items["屠龙果实"])
    assert (dragon["quests"], dragon["harvest"]) == (3, [6, 7, 8])
    # 蒸气机关：特大龙脉炭 = 燃料 1000
    fuel = {f["item"]: f["fuel"] for f in facility("steamworks")["fuel"]}
    assert fuel[items["特大龙脉炭"]] == 1000


def by_name_key(rows: list[dict], key: str, zh: str) -> dict:
    hits = [r for r in rows if r[key].get("zh-Hans") == zh]
    assert hits, f"找不到 {zh}"
    return hits[0]
